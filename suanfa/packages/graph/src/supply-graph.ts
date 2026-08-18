export interface OperationNode {
  readonly name: string;
  readonly type: string;
  owner: string | undefined;
  readonly suboperations: Set<string>;
  readonly dependencies: Set<string>;
  readonly flows: Set<string>;
  readonly loads: Set<string>;
  level: number;
  cluster: number;
}

export interface BufferNode {
  readonly name: string;
  item: string | undefined;
  readonly flows: Set<string>;
  level: number;
  cluster: number;
}

export interface ResourceNode {
  readonly name: string;
  readonly type: string;
  owner: string | undefined;
  readonly operations: Set<string>;
  level: number;
  cluster: number;
}

export interface FlowEdge {
  readonly id: string;
  readonly operation: string;
  readonly buffer: string;
  readonly quantity: number;
}

interface StackEntry {
  readonly operation: OperationNode;
  readonly level: number;
}

export class SupplyGraph {
  public readonly operations = new Map<string, OperationNode>();
  public readonly buffers = new Map<string, BufferNode>();
  public readonly resources = new Map<string, ResourceNode>();
  public readonly flows = new Map<string, FlowEdge>();
  private nextFlowId = 1;

  public ensureOperation(name: string, type = "operation_fixed_time"): OperationNode {
    const existing = this.operations.get(name);
    if (existing) {
      return existing;
    }
    const operation: OperationNode = {
      name,
      type,
      owner: undefined,
      suboperations: new Set(),
      dependencies: new Set(),
      flows: new Set(),
      loads: new Set(),
      level: -1,
      cluster: 0
    };
    this.operations.set(name, operation);
    return operation;
  }

  public ensureBuffer(name: string): BufferNode {
    const existing = this.buffers.get(name);
    if (existing) {
      return existing;
    }
    const buffer: BufferNode = {
      name,
      item: undefined,
      flows: new Set(),
      level: -1,
      cluster: 0
    };
    this.buffers.set(name, buffer);
    return buffer;
  }

  public ensureResource(name: string, type = "resource_default"): ResourceNode {
    const existing = this.resources.get(name);
    if (existing) {
      return existing;
    }
    const resource: ResourceNode = {
      name,
      type,
      owner: undefined,
      operations: new Set(),
      level: -1,
      cluster: 0
    };
    this.resources.set(name, resource);
    return resource;
  }

  public addSuboperation(ownerName: string, childName: string): void {
    const owner = this.ensureOperation(ownerName);
    const child = this.ensureOperation(childName);
    owner.suboperations.add(child.name);
    child.owner = owner.name;
  }

  public addDependency(operationName: string, blockedByName: string): void {
    this.ensureOperation(operationName).dependencies.add(
      this.ensureOperation(blockedByName).name
    );
  }

  public addFlow(operationName: string, bufferName: string, quantity: number): FlowEdge {
    const operation = this.ensureOperation(operationName);
    const buffer = this.ensureBuffer(bufferName);
    const edge: FlowEdge = {
      id: `flow-${this.nextFlowId}`,
      operation: operation.name,
      buffer: buffer.name,
      quantity
    };
    this.nextFlowId += 1;
    this.flows.set(edge.id, edge);
    operation.flows.add(edge.id);
    buffer.flows.add(edge.id);
    return edge;
  }

  public addLoad(operationName: string, resourceName: string): void {
    const operation = this.ensureOperation(operationName);
    const resource = this.ensureResource(resourceName);
    operation.loads.add(resource.name);
    resource.operations.add(operation.name);
  }

  public computeLevels(): void {
    for (const operation of this.operations.values()) {
      operation.level = -1;
      operation.cluster = 0;
    }
    for (const buffer of this.buffers.values()) {
      buffer.level = -1;
      buffer.cluster = 0;
    }
    for (const resource of this.resources.values()) {
      resource.level = -1;
      resource.cluster = 0;
    }

    let numberOfClusters = 0;
    for (const operation of this.sortedOperations()) {
      let cluster: number;
      if (operation.cluster !== 0) {
        cluster = operation.cluster;
      } else if (this.isDangling(operation)) {
        operation.level = 0;
        continue;
      } else {
        numberOfClusters += 1;
        cluster = numberOfClusters;
      }

      const searchLevel = this.shouldSearchLevel(operation);
      if (!searchLevel && operation.cluster !== 0) {
        continue;
      }

      const stack: StackEntry[] = [{ operation, level: searchLevel ? 0 : -1 }];
      const visits = new Map<string, number>();
      operation.cluster = cluster;
      if (searchLevel) {
        operation.level = 0;
      }

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
          continue;
        }
        const { operation: currentOperation, level } = current;
        const visitsForOperation = visits.get(currentOperation.name) ?? 0;
        if (visitsForOperation > 1) {
          continue;
        }
        visits.set(currentOperation.name, visitsForOperation + 1);

        for (const childName of [...currentOperation.suboperations].toReversed()) {
          const child = this.operations.get(childName);
          if (child) {
            this.scheduleOperation(stack, child, level, cluster);
          }
        }

        if (currentOperation.owner) {
          const owner = this.operations.get(currentOperation.owner);
          if (owner) {
            this.scheduleOperation(stack, owner, level, cluster);
          }
        }

        for (const dependencyName of currentOperation.dependencies) {
          const dependency = this.operations.get(dependencyName);
          if (dependency) {
            this.scheduleOperation(stack, dependency, level + 1, cluster);
          }
        }

        for (const resourceName of currentOperation.loads) {
          this.propagateResource(stack, resourceName, level, cluster);
        }

        for (const flowId of currentOperation.flows) {
          const flow = this.flows.get(flowId);
          if (flow) {
            this.propagateFlow(stack, flow, level, cluster);
          }
        }
      }
    }
  }

  private isDangling(operation: OperationNode): boolean {
    return (
      operation.flows.size === 0 &&
      operation.loads.size === 0 &&
      operation.owner === undefined &&
      operation.suboperations.size === 0 &&
      operation.dependencies.size === 0
    );
  }

  private shouldSearchLevel(operation: OperationNode): boolean {
    if (operation.owner !== undefined) {
      return false;
    }

    for (const flowId of operation.flows) {
      const flow = this.flows.get(flowId);
      if (flow && flow.quantity > 0 && this.bufferHasConsumers(flow.buffer)) {
        return false;
      }
    }
    for (const childName of operation.suboperations) {
      const child = this.operations.get(childName);
      if (!child) {
        continue;
      }
      for (const flowId of child.flows) {
        const flow = this.flows.get(flowId);
        if (flow && flow.quantity > 0 && this.bufferHasConsumers(flow.buffer)) {
          return false;
        }
      }
    }
    return true;
  }

  private scheduleOperation(
    stack: StackEntry[],
    operation: OperationNode,
    level: number,
    cluster: number
  ): void {
    if (operation.level < level) {
      operation.level = level;
      operation.cluster = cluster;
      stack.push({ operation, level });
    } else if (operation.cluster === 0) {
      operation.cluster = cluster;
      stack.push({ operation, level: -1 });
    }
  }

  private propagateResource(
    stack: StackEntry[],
    resourceName: string,
    level: number,
    cluster: number
  ): void {
    let resource = this.resources.get(resourceName);
    while (resource?.owner) {
      resource = this.resources.get(resource.owner);
    }
    if (!resource) {
      return;
    }

    resource.level = Math.max(resource.level, level);
    if (resource.cluster !== 0) {
      return;
    }
    resource.cluster = cluster;
    for (const operationName of resource.operations) {
      const operation = this.operations.get(operationName);
      if (operation?.cluster === 0) {
        operation.cluster = cluster;
        stack.push({ operation, level: -1 });
      }
    }
  }

  private propagateFlow(
    stack: StackEntry[],
    currentFlow: FlowEdge,
    level: number,
    cluster: number
  ): void {
    const buffer = this.buffers.get(currentFlow.buffer);
    if (!buffer) {
      return;
    }
    const searchLevel = level !== -1 && buffer.level < level + 1;

    if (searchLevel || buffer.cluster === 0) {
      buffer.cluster = cluster;
      if (currentFlow.quantity < 0 && searchLevel) {
        buffer.level = level + 1;
      }
      for (const flowId of buffer.flows) {
        const otherFlow = this.flows.get(flowId);
        if (!otherFlow) {
          continue;
        }
        const otherOperation = this.operations.get(otherFlow.operation);
        if (!otherOperation) {
          continue;
        }
        if (
          currentFlow.quantity < 0 &&
          searchLevel &&
          otherFlow.id !== currentFlow.id &&
          otherFlow.quantity > 0
        ) {
          this.scheduleOperation(stack, otherOperation, level + 1, cluster);
        } else if (otherOperation.cluster === 0) {
          otherOperation.cluster = cluster;
          stack.push({ operation: otherOperation, level: -1 });
        }
      }
    } else if (buffer.level < 0 && currentFlow.quantity >= 0) {
      buffer.level = 0;
    }

    if (!buffer.item) {
      return;
    }
    for (const itemBuffer of this.buffers.values()) {
      if (itemBuffer.item !== buffer.item || itemBuffer.cluster !== 0) {
        continue;
      }
      itemBuffer.cluster = cluster;
      for (const flowId of itemBuffer.flows) {
        const otherFlow = this.flows.get(flowId);
        const otherOperation = otherFlow
          ? this.operations.get(otherFlow.operation)
          : undefined;
        if (otherOperation?.cluster === 0) {
          otherOperation.cluster = cluster;
          stack.push({ operation: otherOperation, level: -1 });
        }
      }
    }
  }

  private bufferHasConsumers(bufferName: string): boolean {
    const buffer = this.buffers.get(bufferName);
    if (!buffer) {
      return false;
    }
    for (const flowId of buffer.flows) {
      if ((this.flows.get(flowId)?.quantity ?? 0) < 0) {
        return true;
      }
    }
    return false;
  }

  private sortedOperations(): readonly OperationNode[] {
    return [...this.operations.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }
}
