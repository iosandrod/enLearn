import { readFile } from "node:fs/promises";

import { XMLParser } from "fast-xml-parser";

import {
  SupplyGraph,
  type BufferNode,
  type OperationNode,
  type ResourceNode
} from "@suanfa/graph";

import { stripEmbeddedPython } from "./calendar-fixture.js";

type XmlRecord = Record<string, unknown>;

interface ClusterEntity {
  readonly name: string;
  readonly type: string;
  readonly level: number;
  readonly cluster: number;
}

export async function loadClusterFixture(path: string): Promise<SupplyGraph> {
  return parseClusterFixture(await readFile(path, "utf8"));
}

export function parseClusterFixture(xml: string): SupplyGraph {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: true,
    trimValues: true
  });
  const document = asRecord(parser.parse(stripEmbeddedPython(xml)));
  const plan = asRecord(document?.plan);
  if (!plan) {
    throw new Error("Fixture has no plan root");
  }

  const graph = new SupplyGraph();
  parseOperations(graph, asRecord(plan.operations));
  parseDemands(graph, asRecord(plan.demands));
  parseBuffers(graph, asRecord(plan.buffers));
  parseFlows(graph, asRecord(plan.flows));
  parseResources(graph, asRecord(plan.resources));
  parseDependencies(graph, plan);
  return graph;
}

export function verifyClusterFixture(graph: SupplyGraph): string {
  graph.computeLevels();
  const actualToExpected = new Map<number, number>();
  const expectedToActual = new Map<number, number>();
  const lines: string[] = [];

  const entities: ClusterEntity[] = [
    ...[...graph.operations.values()].map(toClusterEntity),
    ...[...graph.resources.values()].map(toClusterEntity),
    ...[...graph.buffers.values()].map(toClusterEntity)
  ];
  entities.sort(
    (left, right) =>
      entitySortOrder(left.type) - entitySortOrder(right.type) ||
      compareStrings(left.name, right.name)
  );

  for (const entity of entities) {
    const expected = parseExpectedSuffix(entity.name);
    if (!expected) {
      continue;
    }

    let ok = expected.level === entity.level;
    const priorExpected = actualToExpected.get(entity.cluster);
    const priorActual = expectedToActual.get(expected.cluster);
    if (priorExpected !== undefined) {
      ok = ok && priorExpected === expected.cluster;
    } else if (priorActual !== undefined && priorActual !== entity.cluster) {
      ok = false;
    } else {
      actualToExpected.set(entity.cluster, expected.cluster);
      expectedToActual.set(expected.cluster, entity.cluster);
    }

    lines.push(
      `${entity.type} ${expected.name}: ${ok ? "OK" : "NOK"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function parseOperations(graph: SupplyGraph, operations: XmlRecord | undefined): void {
  for (const operation of recordArray(operations?.operation)) {
    parseOperation(graph, operation);
  }
}

function parseDemands(graph: SupplyGraph, demands: XmlRecord | undefined): void {
  for (const demand of recordArray(demands?.demand)) {
    for (const operation of recordArray(demand.operation)) {
      parseOperation(graph, operation);
    }
  }
}

function parseBuffers(graph: SupplyGraph, buffers: XmlRecord | undefined): void {
  for (const buffer of recordArray(buffers?.buffer)) {
    const name = requiredName(buffer, "buffer");
    const graphBuffer = graph.ensureBuffer(name);
    const item = asRecord(buffer.item);
    graphBuffer.item = optionalName(item);

    for (const producing of recordArray(buffer.producing)) {
      parseOperation(graph, producing);
    }
  }
}

function parseFlows(graph: SupplyGraph, flows: XmlRecord | undefined): void {
  for (const flow of recordArray(flows?.flow)) {
    const operationName = optionalName(asRecord(flow.operation));
    const bufferName = optionalName(asRecord(flow.buffer));
    if (!operationName || !bufferName) {
      continue;
    }
    graph.addFlow(operationName, bufferName, Number(flow.quantity ?? 0));
  }
}

function parseResources(graph: SupplyGraph, resources: XmlRecord | undefined): void {
  for (const resource of recordArray(resources?.resource)) {
    const name = requiredName(resource, "resource");
    const graphResource = graph.ensureResource(name, entityType(resource, "resource_default"));
    graphResource.owner = optionalName(asRecord(resource.owner));
    const loads = asRecord(resource.loads);
    for (const load of recordArray(loads?.load)) {
      const operationName = optionalName(asRecord(load.operation));
      if (operationName) {
        graph.addLoad(operationName, name);
      }
    }
  }
}

function parseDependencies(graph: SupplyGraph, plan: XmlRecord): void {
  for (const dependency of recordArray(plan.operationdependencies)) {
    const operationName = optionalName(asRecord(dependency.operation));
    const blockedByName = optionalName(asRecord(dependency.blockedby));
    if (operationName && blockedByName) {
      graph.addDependency(operationName, blockedByName);
    }
  }
}

function parseOperation(
  graph: SupplyGraph,
  operation: XmlRecord,
  ownerName?: string
): OperationNode {
  const name = requiredName(operation, "operation");
  const graphOperation = graph.ensureOperation(
    name,
    entityType(operation, "operation_fixed_time")
  );
  if (ownerName) {
    graph.addSuboperation(ownerName, name);
  }

  const suboperations = asRecord(operation.suboperations);
  for (const suboperation of recordArray(suboperations?.suboperation)) {
    const nestedOperation = asRecord(suboperation.operation);
    if (nestedOperation) {
      parseOperation(graph, nestedOperation, name);
    }
  }
  return graphOperation;
}

function toClusterEntity(entity: OperationNode | ResourceNode | BufferNode): ClusterEntity {
  if ("suboperations" in entity) {
    return {
      name: entity.name,
      type: entity.type,
      level: entity.level,
      cluster: entity.cluster
    };
  }
  if ("operations" in entity) {
    return {
      name: entity.name,
      type: entity.type,
      level: entity.level,
      cluster: entity.cluster
    };
  }
  return {
    name: entity.name,
    type: "buffer_default",
    level: entity.level,
    cluster: entity.cluster
  };
}

function parseExpectedSuffix(
  name: string
): { readonly name: string; readonly level: number; readonly cluster: number } | undefined {
  const match = /^(.*)\s*:\s*(-?\d+)\s*:\s*(-?\d+)$/.exec(name);
  if (!match) {
    return undefined;
  }
  return {
    name: (match[1] ?? "").trimEnd(),
    level: Number(match[2]),
    cluster: Number(match[3])
  };
}

function entitySortOrder(type: string): number {
  if (type.startsWith("operation_")) {
    return 0;
  }
  if (type.startsWith("resource_")) {
    return 1;
  }
  return 2;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function asRecord(value: unknown): XmlRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlRecord)
    : undefined;
}

function recordArray(value: unknown): readonly XmlRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function requiredName(record: XmlRecord, entity: string): string {
  const name = optionalName(record);
  if (!name) {
    throw new Error(`${entity} has no name`);
  }
  return name;
}

function optionalName(record: XmlRecord | undefined): string | undefined {
  const value = record?.["@_name"];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function entityType(record: XmlRecord, defaultType: string): string {
  const value = record["@_xsi:type"];
  return typeof value === "string" && value.length > 0 ? value : defaultType;
}
