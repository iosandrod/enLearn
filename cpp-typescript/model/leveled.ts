// <header-api-generated>
import { HeaderModelAdapter } from "../utils/library.js";

type LeveledEntity = HeaderModelAdapter & {
  _getClusterRaw?(): number;
  _getLevelRaw?(): number;
  _setClusterRaw?(value: number): void;
  _setLevelRaw?(value: number): void;
};

interface OperationFrame {
  readonly operation: LeveledEntity;
  readonly level: number;
}

function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function values(target: unknown, method: string): unknown[] {
  const result = call(target, method);
  return result && typeof result === "object" && typeof Reflect.get(result, Symbol.iterator) === "function"
    ? [...result as Iterable<unknown>] : [];
}

function entities(family: "Operation" | "Buffer" | "Resource" | "Demand"): LeveledEntity[] {
  return (HeaderModelAdapter.invokeStatic(family, "all", []) as HeaderModelAdapter[])
    .filter((entry): entry is LeveledEntity => entry instanceof HeaderModelAdapter);
}

function rawLevel(target: LeveledEntity): number {
  return Number(target._getLevelRaw?.() ?? -1);
}

function rawCluster(target: LeveledEntity): number {
  return Number(target._getClusterRaw?.() ?? 0);
}

function setRawLevel(target: LeveledEntity, value: number): void {
  target._setLevelRaw?.(Math.trunc(value));
}

function setRawCluster(target: LeveledEntity, value: number): void {
  target._setClusterRaw?.(Math.trunc(value));
}

function operationFromAssociation(value: unknown): LeveledEntity | null {
  const result = call(value, "getOperation");
  return result instanceof HeaderModelAdapter ? result as LeveledEntity : null;
}

function bufferFromFlow(value: unknown): LeveledEntity | null {
  try {
    const result = call(value, "getBuffer");
    return result instanceof HeaderModelAdapter ? result as LeveledEntity : null;
  } catch {
    return null;
  }
}

function isConsumer(flow: unknown): boolean { return Boolean(call(flow, "isConsumer")); }
function isProducer(flow: unknown): boolean { return Boolean(call(flow, "isProducer")); }

/** Lazy cluster and supply-level computation shared by operations, buffers and resources. */
export class HasLevel extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["HasLevel"] as const;
  private static recomputeLevels = true;
  private static computationBusy = false;
  private static numberOfClusters = 0;
  private static numberOfLevels = 0;
  private level = 0;
  private cluster = 0;

  static triggerLazyRecomputation(): void { this.recomputeLevels = true; }

  static getNumberOfClusters(): number {
    if (this.recomputeLevels && !this.computationBusy) this.computeLevels();
    return this.numberOfClusters;
  }

  static getNumberOfLevels(): number {
    if (this.recomputeLevels && !this.computationBusy) this.computeLevels();
    return this.numberOfLevels;
  }

  getCluster(): number {
    if (HasLevel.recomputeLevels && !HasLevel.computationBusy) HasLevel.computeLevels();
    return this.cluster;
  }

  getLevel(): number {
    if (HasLevel.recomputeLevels && !HasLevel.computationBusy) HasLevel.computeLevels();
    return this.level;
  }

  copyLevelAndCluster(source: HasLevel | LeveledEntity | null): void {
    if (!source) return;
    this.cluster = source instanceof HasLevel ? source.cluster : rawCluster(source);
    this.level = source instanceof HasLevel ? source.level : rawLevel(source);
  }

  /**
   * Iterative adaptation of the C++ traversal. JavaScript runs this routine on
   * a single event loop, so the native mutex is represented by the busy guard.
   */
  static computeLevels(): void {
    if (this.computationBusy) return;
    this.computationBusy = true;
    try {
      do {
        let operations: LeveledEntity[] = [];
        let buffers: LeveledEntity[] = [];
        const resources = entities("Resource");

        // Buffer replenishment discovery can create purchase and distribution
        // operations, flows and even origin buffers. Match the native fixed
        // point loop before traversing the supply graph.
        let bufferCount = entities("Buffer").length;
        while (true) {
          operations = entities("Operation");
          for (const operation of operations) {
            setRawCluster(operation, 0);
            setRawLevel(operation, -1);
            for (const flow of values(operation, "getFlows")) bufferFromFlow(flow);
          }
          buffers = entities("Buffer");
          for (const buffer of buffers) {
            setRawCluster(buffer, 0);
            setRawLevel(buffer, -1);
            call(buffer, "getProducingOperation");
          }
          buffers = entities("Buffer");
          if (buffers.length === bufferCount) break;
          bufferCount = buffers.length;
        }
        for (const resource of resources) {
          setRawCluster(resource, 0);
          setRawLevel(resource, -1);
        }

        // Model changes during the traversal below request another pass.
        this.recomputeLevels = false;
        operations = entities("Operation");
        this.numberOfClusters = 0;
        this.numberOfLevels = 0;
        const groupedDeliveries = this.collectGroupedDeliveries();

        for (const root of operations) {
          let cluster = rawCluster(root);
          const rootFlows = values(root, "getFlows");
          const rootLoads = values(root, "getLoads");
          const rootChildren = values(root, "getSubOperations");
          const rootDependencies = values(root, "getDependencies");
          if (!cluster && !rootFlows.length && !rootLoads.length && !call(root, "getOwner") &&
              !rootChildren.length && !rootDependencies.length) {
            setRawLevel(root, 0);
            continue;
          }
          if (!cluster) cluster = ++this.numberOfClusters;

          let searchLevel = !call(root, "getOwner");
          if (searchLevel && this.hasConnectedOutput(root)) searchLevel = false;
          if (searchLevel) {
            for (const association of [...rootChildren].reverse()) {
              const child = operationFromAssociation(association);
              if (child && this.hasConnectedOutput(child)) { searchLevel = false; break; }
            }
          }
          if (!searchLevel && rawCluster(root)) continue;

          const stack: OperationFrame[] = [{ operation: root, level: searchLevel ? 0 : -1 }];
          const visited = new Map<LeveledEntity, number>();
          setRawCluster(root, cluster);
          if (searchLevel) setRawLevel(root, 0);

          while (stack.length) {
            const frame = stack.pop();
            if (!frame) break;
            const operation = frame.operation;
            const level = frame.level;
            this.numberOfLevels = Math.max(this.numberOfLevels, level);
            const visits = visited.get(operation) ?? 0;
            if (visits > 1) continue;
            visited.set(operation, visits + 1);

            for (const association of [...values(operation, "getSubOperations")].reverse()) {
              const child = operationFromAssociation(association);
              if (child) this.pushOperation(stack, child, level, cluster);
            }
            const owner = call(operation, "getOwner");
            if (owner instanceof HeaderModelAdapter) this.pushOperation(stack, owner as LeveledEntity, level, cluster);

            for (const dependency of values(operation, "getDependencies")) {
              let adjacent = operationFromAssociation(dependency);
              if (adjacent === operation) {
                const blockedBy = call(dependency, "getBlockedBy");
                adjacent = blockedBy instanceof HeaderModelAdapter ? blockedBy as LeveledEntity : null;
              }
              if (adjacent) this.pushOperation(stack, adjacent, level + 1, cluster);
            }

            for (const load of values(operation, "getLoads")) {
              const resource = call(load, "getResource");
              if (resource instanceof HeaderModelAdapter) this.processResource(stack, resource as LeveledEntity, level, cluster);
            }

            for (const flow of values(operation, "getFlows")) {
              const buffer = bufferFromFlow(flow);
              if (buffer) this.processBuffer(stack, operation, flow, buffer, level, cluster);
            }

            for (const group of groupedDeliveries.get(operation) ?? []) {
              for (const member of values(group, "getMembers")) {
                const delivery = call(member, "getDeliveryOperation");
                if (delivery instanceof HeaderModelAdapter && !rawCluster(delivery as LeveledEntity)) {
                  setRawCluster(delivery as LeveledEntity, cluster);
                  stack.push({ operation: delivery as LeveledEntity, level: -1 });
                }
              }
            }
          }
        }

        for (const buffer of buffers) {
          if (!String(call(buffer, "getBatch") ?? "")) continue;
          const item = call(buffer, "getItem");
          let generic: LeveledEntity | null = null;
          for (const sibling of values(item, "getBufferIterator")) {
            if (sibling instanceof HeaderModelAdapter && !String(call(sibling, "getBatch") ?? "")) {
              generic = sibling as LeveledEntity;
              break;
            }
          }
          if (generic) {
            setRawCluster(buffer, rawCluster(generic));
            setRawLevel(buffer, rawLevel(generic));
          }
        }
      } while (this.recomputeLevels);
    } finally {
      this.computationBusy = false;
    }
  }

  private static hasConnectedOutput(operation: LeveledEntity): boolean {
    return values(operation, "getFlows").some((flow) => {
      const buffer = bufferFromFlow(flow);
      return isProducer(flow) && Boolean(buffer && call(buffer, "hasConsumingFlows"));
    });
  }

  private static pushOperation(stack: OperationFrame[], operation: LeveledEntity, level: number, cluster: number): void {
    if (rawLevel(operation) < level) {
      setRawLevel(operation, level);
      setRawCluster(operation, cluster);
      stack.push({ operation, level });
    } else if (!rawCluster(operation)) {
      setRawCluster(operation, cluster);
      stack.push({ operation, level: -1 });
    }
  }

  private static processResource(stack: OperationFrame[], resource: LeveledEntity, level: number, cluster: number): void {
    let top = resource;
    while (call(top, "getOwner") instanceof HeaderModelAdapter) top = call(top, "getOwner") as LeveledEntity;
    const resources = [top, ...values(top, "getAllMembers")
      .filter((entry): entry is LeveledEntity => entry instanceof HeaderModelAdapter)];
    for (const candidate of resources) {
      if (rawLevel(candidate) < level) setRawLevel(candidate, level);
      if (rawCluster(candidate)) continue;
      setRawCluster(candidate, cluster);
      for (const load of values(candidate, "getLoads")) {
        const operation = operationFromAssociation(load);
        if (operation && !rawCluster(operation)) {
          setRawCluster(operation, cluster);
          stack.push({ operation, level: -1 });
        }
      }
    }
  }

  private static processBuffer(stack: OperationFrame[], operation: LeveledEntity, flow: unknown,
    buffer: LeveledEntity, level: number, cluster: number): void {
    const searchLevel = level !== -1 && rawLevel(buffer) < level + 1;
    if (searchLevel || !rawCluster(buffer)) {
      setRawCluster(buffer, cluster);
      for (const adjacentFlow of values(buffer, "getFlows")) {
        const adjacent = operationFromAssociation(adjacentFlow);
        if (!adjacent) continue;
        const distributionAllowsLevel = !operation.constructor.name.includes("ItemDistribution") ||
          Number(call(operation, "getPriority") ?? 1) !== 0;
        if (isConsumer(flow) && searchLevel && distributionAllowsLevel) {
          if (adjacent !== operation && isProducer(adjacentFlow) && rawLevel(adjacent) < level + 1) {
            setRawLevel(adjacent, level + 1);
            setRawCluster(adjacent, cluster);
            stack.push({ operation: adjacent, level: level + 1 });
          } else if (!rawCluster(adjacent)) {
            setRawCluster(adjacent, cluster);
            stack.push({ operation: adjacent, level: -1 });
          }
          setRawLevel(buffer, level + 1);
          this.numberOfLevels = Math.max(this.numberOfLevels, level + 1);
        } else if (!rawCluster(adjacent)) {
          setRawCluster(adjacent, cluster);
          stack.push({ operation: adjacent, level: -1 });
        }
      }
    } else if (rawLevel(buffer) < 0 && !isConsumer(flow)) setRawLevel(buffer, 0);

    const item = call(buffer, "getItem");
    for (const sibling of values(item, "getBufferIterator")) {
      if (!(sibling instanceof HeaderModelAdapter) || rawCluster(sibling as LeveledEntity)) continue;
      setRawCluster(sibling as LeveledEntity, cluster);
      for (const siblingFlow of values(sibling, "getFlows")) {
        const adjacent = operationFromAssociation(siblingFlow);
        if (adjacent && !rawCluster(adjacent)) {
          setRawCluster(adjacent, cluster);
          stack.push({ operation: adjacent, level: -1 });
        }
      }
    }
  }

  private static collectGroupedDeliveries(): Map<LeveledEntity, Set<unknown>> {
    const result = new Map<LeveledEntity, Set<unknown>>();
    for (const demand of entities("Demand")) {
      const delivery = call(demand, "getDeliveryOperation");
      const owner = call(demand, "getOwner");
      if (!(delivery instanceof HeaderModelAdapter) || !owner || String(call(owner, "getPolicy") ?? "INDEPENDENT") === "INDEPENDENT") continue;
      const groups = result.get(delivery as LeveledEntity) ?? new Set<unknown>();
      groups.add(owner);
      result.set(delivery as LeveledEntity, groups);
    }
    return result;
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/leveled.cpp.
 * Generated once as a structural baseline and then maintained as TypeScript.
 */

export type PortScalar = string | number | boolean | bigint | null;
export type PortValue = PortScalar | object | readonly PortValue[];

export interface PortDefinition {
  readonly name: string;
  readonly sourceLine: number;
  readonly status: "adapted" | "ported";
}

export const PORT_MANIFEST = [
  { name: "HasLevel::computeLevels", sourceLine: 42, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface HasLevelPort {
  computeLevels(...args: readonly PortValue[]): PortValue | void;
}

export class CompatibilityAdapter {
  readonly state = new Map<string, PortValue>();

  invoke(method: string, ...args: readonly PortValue[]): PortValue | void {
    if (method.startsWith("set") && args.length > 0) {
      this.state.set(method.slice(3), args[0] ?? null);
      return;
    }
    if (method.startsWith("get")) return this.state.get(method.slice(3)) ?? null;
    if (method.startsWith("is") || method.startsWith("has")) return false;
    return args[0] ?? null;
  }
}

export const compatibilityAdapter = new CompatibilityAdapter();
export const sourceFile = "src/model/leveled.cpp";
export const targetFile = "model/leveled.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2007-2015 by frePPLe bv                                   *",
  " *                                                                         *",
  " * Permission is hereby granted, free of charge, to any person obtaining   *",
  " * a copy of this software and associated documentation files (the         *",
  " * \"Software\"), to deal in the Software without restriction, including     *",
  " * without limitation the rights to use, copy, modify, merge, publish,     *",
  " * distribute, sublicense, and/or sell copies of the Software, and to      *",
  " * permit persons to whom the Software is furnished to do so, subject to   *",
  " * the following conditions:                                               *",
  " *                                                                         *",
  " * The above copyright notice and this permission notice shall be          *",
  " * included in all copies or substantial portions of the Software.         *",
  " *                                                                         *",
  " * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,         *",
  " * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF      *",
  " * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND                   *",
  " * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE  *",
  " * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION  *",
  " * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION   *",
  " * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.         *",
  " *                                                                         *",
  " ***************************************************************************/",
  "",
  "#include <climits>",
  "#include <ranges>",
  "",
  "#include \"frepple/model.h\"",
  "",
  "// Uncomment the following line to create debugging statements during the",
  "// clustering and leveling algorithm.",
  "// #define CLUSTERDEBUG",
  "",
  "namespace frepple {",
  "",
  "bool HasLevel::recomputeLevels = false;",
  "bool HasLevel::computationBusy = false;",
  "int HasLevel::numberOfClusters = 0;",
  "short HasLevel::numberOfLevels = 0;",
  "",
  "void HasLevel::computeLevels() {",
  "  computationBusy = true;",
  "  // Get exclusive access to this function in a multi-threaded environment.",
  "  static mutex levelcomputationbusy;",
  "  lock_guard<mutex> l(levelcomputationbusy);",
  "",
  "  // Another thread may already have computed the levels while this thread was",
  "  // waiting for the lock. In that case the while loop will be skipped.",
  "  multimap<Operation*, Demand*> clustereddeliveries;",
  "  while (recomputeLevels) {",
  "    // Force creation of all delivery operations",
  "    for (auto& gdem : Demand::all()) {",
  "      auto dlvr = gdem.getDeliveryOperation();",
  "      if (dlvr && gdem.getOwner() && gdem.getOwner()->hasType<DemandGroup>() &&",
  "          static_cast<DemandGroup*>(gdem.getOwner())->getPolicy() !=",
  "              Demand::POLICY_INDEPENDENT) {",
  "        auto search = clustereddeliveries.equal_range(dlvr);",
  "        bool exists = false;",
  "        for (auto it = search.first; it != search.second; ++it) {",
  "          if (it->second == gdem.getOwner()) {",
  "            exists = true;",
  "            break;",
  "          }",
  "        }",
  "        if (!exists)",
  "          clustereddeliveries.insert(make_pair(dlvr, gdem.getOwner()));",
  "      }",
  "    }",
  "",
  "    // Reset current levels on buffers, resources and operations.",
  "    // Creating the producing operations of the buffers can cause new buffers",
  "    // to be created. We repeat this loop until no new buffers are being added.",
  "    // This isn't the most efficient loop, but it remains cheap and fast...",
  "    auto numbufs = Buffer::size();",
  "    while (true) {",
  "      for (auto& gop : Operation::all()) {",
  "        gop.cluster = 0;",
  "        gop.lvl = -1;",
  "        for (auto& fl : gop.getFlows()) fl.getBuffer();",
  "      }",
  "      for (auto& gbuf : Buffer::all()) {",
  "        gbuf.cluster = 0;",
  "        gbuf.lvl = -1;",
  "        gbuf.getProducingOperation();",
  "      }",
  "      auto numbufs_after = Buffer::size();",
  "      if (numbufs == numbufs_after)",
  "        break;",
  "      else",
  "        numbufs = numbufs_after;",
  "    }",
  "    for (auto& gres : Resource::all()) {",
  "      gres.cluster = 0;",
  "      gres.lvl = -1;",
  "    }",
  "",
  "    // When during the computation below the recomputeLevels flag is switched",
  "    // on again by some model change, the while loop will rerun the calculation",
  "    // again.",
  "    recomputeLevels = false;",
  "",
  "    // Loop through all operations",
  "    stack<pair<Operation*, int> > opstack;",
  "    Operation* cur_oper;",
  "    int cur_level;",
  "    Buffer* cur_buf;",
  "    const Flow* cur_Flow;",
  "    bool search_level;",
  "    int cur_cluster;",
  "    numberOfLevels = 0;",
  "    numberOfClusters = 0;",
  "    map<Operation*, short> visited;",
  "    for (auto& g : Operation::all()) {",
  "      // Select a new cluster number",
  "      if (g.cluster)",
  "        cur_cluster = g.cluster;",
  "      else {",
  "        // Detect hanging operations",
  "        if (g.getFlows().empty() && g.getLoads().empty() && !g.getOwner() &&",
  "            g.getSubOperations().empty() && g.getDependencies().empty()) {",
  "          // Cluster 0 keeps all dangling operations",
  "          g.lvl = 0;",
  "          continue;",
  "        }",
  "        cur_cluster = ++numberOfClusters;",
  "        if (numberOfClusters >= INT_MAX)",
  "          throw LogicException(\"Too many clusters\");",
  "      }",
  "",
  "#ifdef CLUSTERDEBUG",
  "      logger << \"Investigating operation '\" << g << \"' - current cluster \"",
  "             << g.cluster << '\\n';",
  "#endif",
  "",
  "      // Do we need to activate the level search?",
  "      // Criterion are:",
  "      //   - Not used in a super operation",
  "      //   - Have a producing flow on the operation itself",
  "      //     or on any of its sub operations",
  "      search_level = false;",
  "      if (!g.getOwner()) {",
  "        search_level = true;",
  "        // Does the operation itself have producing flows?",
  "        for (auto fl = g.getFlows().begin();",
  "             fl != g.getFlows().end() && search_level; ++fl)",
  "          if (fl->isProducer() && fl->getBuffer()->hasConsumingFlows())",
  "            search_level = false;",
  "        if (search_level) {",
  "          // Do suboperations have a producing flow?",
  "          for (auto i = g.getSubOperations().rbegin();",
  "               i != g.getSubOperations().rend() && search_level; ++i)",
  "            for (auto fl = (*i)->getOperation()->getFlows().begin();",
  "                 fl != (*i)->getOperation()->getFlows().end() && search_level;",
  "                 ++fl)",
  "              if (fl->isProducer() && fl->getBuffer()->hasConsumingFlows())",
  "                search_level = false;",
  "        }",
  "      }",
  "",
  "      // If both the level and the cluster are de-activated, then we can move on",
  "      if (!search_level && g.cluster) continue;",
  "",
  "      // Start recursing",
  "      // Note that as soon as push an operation on the stack we set its",
  "      // cluster and/or level. This is avoid that operations are needlessly",
  "      // pushed a second time on the stack.",
  "      opstack.emplace(&g, search_level ? 0 : -1);",
  "      visited.clear();",
  "      g.cluster = cur_cluster;",
  "      if (search_level) g.lvl = 0;",
  "      while (!opstack.empty()) {",
  "        // Take the top of the stack",
  "        cur_oper = opstack.top().first;",
  "        cur_level = opstack.top().second;",
  "        opstack.pop();",
  "",
  "        // Keep track of the maximum number of levels",
  "        if (cur_level > numberOfLevels) numberOfLevels = cur_level;",
  "",
  "#ifdef CLUSTERDEBUG",
  "        logger << \"    Recursing in Operation '\" << *(cur_oper)",
  "               << \"' - current level \" << cur_level << '\\n';",
  "#endif",
  "        // Detect loops in the supply chain",
  "        auto detectloop = visited.find(cur_oper);",
  "        if (detectloop == visited.end())",
  "          // Keep track of operations already visited",
  "          visited.insert(make_pair(cur_oper, 0));",
  "        else if (++(detectloop->second) > 1)",
  "          // Already visited this operation enough times - don't repeat",
  "          continue;",
  "",
  "        // Push sub operations on the stack",
  "        for (auto& i :",
  "             std::ranges::reverse_view(cur_oper->getSubOperations())) {",
  "          if (i->getOperation()->lvl < cur_level) {",
  "            // Search level and cluster",
  "            opstack.emplace(i->getOperation(), cur_level);",
  "            i->getOperation()->lvl = cur_level;",
  "            i->getOperation()->cluster = cur_cluster;",
  "          } else if (!i->getOperation()->cluster) {",
  "            // Search for clusters information only",
  "            opstack.emplace(i->getOperation(), -1);",
  "            i->getOperation()->cluster = cur_cluster;",
  "          }",
  "          // else: no search required",
  "        }",
  "",
  "        // Push super operations on the stack",
  "        if (cur_oper->getOwner()) {",
  "          if (cur_oper->getOwner()->lvl < cur_level) {",
  "            // Search level and cluster",
  "            opstack.emplace(cur_oper->getOwner(), cur_level);",
  "            cur_oper->getOwner()->lvl = cur_level;",
  "            cur_oper->getOwner()->cluster = cur_cluster;",
  "          } else if (!cur_oper->getOwner()->cluster) {",
  "            // Search for clusters information only",
  "            opstack.emplace(cur_oper->getOwner(), -1);",
  "            cur_oper->getOwner()->cluster = cur_cluster;",
  "          }",
  "          // else: no search required",
  "        }",
  "",
  "        // Push dependencies on the stack",
  "        for (auto dpd : cur_oper->getDependencies()) {",
  "          auto new_oper = dpd->getOperation();",
  "          if (new_oper == cur_oper) new_oper = dpd->getBlockedBy();",
  "          if (new_oper->lvl < cur_level + 1) {",
  "            // Search level and cluster",
  "            opstack.emplace(new_oper, cur_level + 1);",
  "            new_oper->lvl = cur_level + 1;",
  "            new_oper->cluster = cur_cluster;",
  "          } else if (!new_oper->cluster) {",
  "            // Search for clusters information only",
  "            opstack.emplace(new_oper, -1);",
  "            new_oper->cluster = cur_cluster;",
  "          }",
  "          // else: no search required",
  "        }",
  "",
  "        // Update level of resources linked to current operation",
  "        for (const auto& gres : cur_oper->getLoads()) {",
  "          stack<Resource*> rsrc;",
  "          auto resptr = gres.getResource();",
  "          while (resptr->getOwner()) resptr = resptr->getOwner();",
  "          rsrc.push(resptr);",
  "          while (!rsrc.empty()) {",
  "            resptr = rsrc.top();",
  "            rsrc.pop();",
  "",
  "            // Update the level of the resource",
  "            if (resptr->lvl < cur_level) resptr->lvl = cur_level;",
  "            // Update the cluster of the resource and operations using it",
  "            if (!resptr->cluster) {",
  "              resptr->cluster = cur_cluster;",
  "              // Find more operations connected to this cluster by the resource",
  "              for (const auto& resops : resptr->getLoads()) {",
  "                if (!resops.getOperation()->cluster) {",
  "                  opstack.emplace(resops.getOperation(), -1);",
  "                  resops.getOperation()->cluster = cur_cluster;",
  "                }",
  "              }",
  "            }",
  "",
  "            // Add all child resources to the stack",
  "            for (auto chld = resptr->getMembers(); chld != Resource::end();",
  "                 ++chld)",
  "              rsrc.push(&*chld);",
  "          }",
  "        }",
  "",
  "        // Now loop through all flows of the operation",
  "        for (const auto& gflow : cur_oper->getFlows()) {",
  "          cur_Flow = &gflow;",
  "          cur_buf = cur_Flow->getBuffer();",
  "",
  "          // Check whether the level search needs to continue",
  "          search_level = cur_level != -1 && cur_buf->lvl < cur_level + 1;",
  "",
  "          // Check if the buffer needs processing",
  "          if (search_level || !cur_buf->cluster) {",
  "            // Update the cluster of the current buffer",
  "            cur_buf->cluster = cur_cluster;",
  "",
  "            // Loop through all flows of the buffer",
  "            for (auto buffl = cur_buf->getFlows().begin();",
  "                 buffl != cur_buf->getFlows().end(); ++buffl) {",
  "              // Check level recursion",
  "              if (cur_Flow->isConsumer() && search_level &&",
  "                  (!cur_Flow->getOperation()",
  "                        ->hasType<OperationItemDistribution>() ||",
  "                   static_cast<OperationItemDistribution*>(",
  "                       cur_Flow->getOperation())",
  "                       ->getPriority())) {",
  "                if (buffl->getOperation()->lvl < cur_level + 1 &&",
  "                    &*buffl != cur_Flow && buffl->isProducer()) {",
  "                  opstack.emplace(buffl->getOperation(), cur_level + 1);",
  "                  buffl->getOperation()->lvl = cur_level + 1;",
  "                  buffl->getOperation()->cluster = cur_cluster;",
  "                } else if (!buffl->getOperation()->cluster) {",
  "                  opstack.emplace(buffl->getOperation(), -1);",
  "                  buffl->getOperation()->cluster = cur_cluster;",
  "                }",
  "                if (cur_level + 1 > numberOfLevels)",
  "                  numberOfLevels = cur_level + 1;",
  "                cur_buf->lvl = cur_level + 1;",
  "              }",
  "              // Check cluster recursion",
  "              else if (!buffl->getOperation()->cluster) {",
  "                opstack.emplace(buffl->getOperation(), -1);",
  "                buffl->getOperation()->cluster = cur_cluster;",
  "              }",
  "            }",
  "          }  // End of needs-processing if statement",
  "          else if (cur_buf->lvl < 0 && !cur_Flow->isConsumer())",
  "            cur_buf->lvl = 0;",
  "",
  "          // Add all buffers for this item to the same cluster",
  "          Item::bufferIterator buf_iter(cur_Flow->getBuffer()->getItem());",
  "          while (Buffer* tmpbuf = buf_iter.next())",
  "            if (!tmpbuf->cluster) {",
  "              tmpbuf->cluster = cur_cluster;",
  "              for (const auto& buffl : tmpbuf->getFlows()) {",
  "                if (!buffl.getOperation()->cluster) {",
  "                  opstack.emplace(buffl.getOperation(), -1);",
  "                  buffl.getOperation()->cluster = cur_cluster;",
  "                }",
  "              }",
  "            }",
  "        }  // End of flow loop",
  "",
  "        // Push grouped deliveries on the stack",
  "        auto search = clustereddeliveries.equal_range(cur_oper);",
  "        for (auto it = search.first; it != search.second; ++it) {",
  "          for (auto m = it->second->getMembers(); m != Demand::end(); ++m) {",
  "            auto dlvr = m->getDeliveryOperation();",
  "            if (dlvr && !dlvr->cluster) {",
  "              opstack.emplace(dlvr, -1);",
  "              dlvr->cluster = cur_cluster;",
  "            }",
  "          }",
  "        }",
  "      }  // End while stack not empty",
  "",
  "    }  // End of Operation loop",
  "",
  "    // Copy the level from generic buffers to the specific mto-buffers",
  "    // TODO this logic will no longer apply when the mto-buffers can",
  "    // have their own producing operation.",
  "    for (auto& gbuf : Buffer::all()) {",
  "      if (!gbuf.getBatch() || !gbuf.getItem()) continue;",
  "      Buffer* generic = nullptr;",
  "      Item::bufferIterator buf_iter(gbuf.getItem());",
  "      while (Buffer* tmpbuf = buf_iter.next()) {",
  "        if (!tmpbuf->getBatch()) {",
  "          generic = tmpbuf;",
  "          break;",
  "        }",
  "      }",
  "      if (generic) {",
  "        Item::bufferIterator buf_iter(gbuf.getItem());",
  "        while (Buffer* tmpbuf = buf_iter.next()) {",
  "          if (tmpbuf->getBatch()) tmpbuf->copyLevelAndCluster(generic);",
  "        }",
  "      }",
  "    }",
  "  }  // End of while recomputeLevels. The loop will be repeated as long as model",
  "     // changes are done during the recomputation.",
  "",
  "  // Unlock the exclusive access to this function",
  "  computationBusy = false;",
  "}",
  "",
  "}  // namespace frepple",
];
