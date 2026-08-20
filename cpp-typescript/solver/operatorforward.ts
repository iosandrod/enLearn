// <header-api-generated>
import { CommandMoveOperationPlan } from "../model/actions.js";
import { Buffer, BufferInfinite } from "../model/buffer.js";
import { Demand, DemandGroup } from "../model/demand.js";
import { FlowStart, FlowTransferBatch } from "../model/flow.js";
import { FlowPlan } from "../model/flowplan.js";
import { HasLevel } from "../model/leveled.js";
import { LoadPlan } from "../model/loadplan.js";
import {
  Operation,
  OperationInventory,
  OperationRouting,
  compareOperationPlans,
} from "../model/operation.js";
import { OperationPlan } from "../model/operationplan.js";
import { Plan } from "../model/plan.js";
import { Resource, ResourceBuckets } from "../model/resource.js";
import { CommandManager } from "../utils/actions.js";
import { Date as PlanningDate, Duration } from "../utils/date.js";
import { HeaderModelAdapter } from "../utils/library.js";

type ForwardDateInput = PlanningDate | string | number;
const ROUNDING_ERROR = 0.000001;
const MAX_LOOP = 10000;
const CAPACITY = 4;
const MFG_LEADTIME = 16;
const PO_LEADTIME = 32;

interface ForwardSolverContext {
  readonly cluster: number;
  getSolver(): {
    getConstraints(): number;
    isCapacityConstrained(): boolean;
    isLeadTimeConstrained(operation: Operation | null): boolean;
  } | null;
}

function forwardCall(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}

function forwardDate(value: ForwardDateInput): PlanningDate {
  return value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
}

function eventType(value: unknown): number { return Number(forwardCall(value, "getEventType") ?? 0); }
function eventQuantity(value: unknown): number { return Number(forwardCall(value, "getQuantity") ?? 0); }
function eventOnhand(value: unknown): number { return Number(forwardCall(value, "getOnhand") ?? 0); }
function eventMax(value: unknown): number { return Number(forwardCall(value, "getMax") ?? 0); }
function traceForward(event: string, details: Readonly<Record<string, unknown>>): void {
  if (process.env.FREPPLE_TS_TRACE === "1") console.error(`[forward] ${event} ${JSON.stringify(details)}`);
}
function eventDate(value: unknown): PlanningDate {
  const result = forwardCall(value, "getDate");
  return result instanceof PlanningDate ? result : new PlanningDate(PlanningDate.infinitePast);
}

/** Transactional forward propagation of proposed operationplans. */
export class OperatorForward extends HeaderModelAdapter {
  static readonly cppBases = ["NonCopyable", "Solver"] as const;
  static readonly cppQualifiedNames = ["OperatorForward"] as const;
  private manager: CommandManager;
  private propagate = true;
  private acceptTabuCandidate = false;
  private readonly tabu = new Map<OperationPlan, number>();
  private readonly originalDates = new Map<OperationPlan, PlanningDate>();
  private readonly unresolvables = new Set<OperationPlan>();
  private curOperationPlan: OperationPlan | null = null;
  private curLoadPlan: LoadPlan | null = null;
  private curFlowPlan: FlowPlan | null = null;
  private readonly movedDeliveries = new Set<OperationPlan>();
  private readonly activeOperationPlans = new Set<OperationPlan>();
  private readonly activeResources = new Set<Resource>();
  private readonly activeBuffers = new Set<Buffer>();

  constructor(
    commandManager: CommandManager = new CommandManager(),
    private readonly context: ForwardSolverContext | null = null,
  ) {
    super();
    this.manager = commandManager;
  }

  addMoveEndDate(operationPlan: OperationPlan, end: ForwardDateInput): CommandMoveOperationPlan | null {
    const requestedEnd = forwardDate(end);
    this.rememberOriginalDate(operationPlan);
    const command = new CommandMoveOperationPlan(operationPlan);
    this.manager.add(command);
    operationPlan.setOperationPlanParameters(
      operationPlan.getQuantity(),
      PlanningDate.infinitePast,
      requestedEnd,
      true,
      true,
      false,
      true,
    );
    this.trackDelivery(operationPlan);
    return command;
  }

  addMoveStartDate(operationPlan: OperationPlan, start: ForwardDateInput): CommandMoveOperationPlan | null {
    const requestedStart = forwardDate(start);
    this.rememberOriginalDate(operationPlan);
    const command = new CommandMoveOperationPlan(operationPlan);
    this.manager.add(command);
    operationPlan.setStart(requestedStart);
    this.trackDelivery(operationPlan);
    return command;
  }

  addResize(operationPlan: OperationPlan, quantity: number): CommandMoveOperationPlan | null {
    const command = new CommandMoveOperationPlan(operationPlan);
    this.manager.add(command);
    operationPlan.setQuantity(Math.max(0, Number(quantity)), true, true, true);
    return command;
  }

  addTabu(operationPlan: OperationPlan | null, weight = Number.MAX_VALUE): void {
    if (operationPlan) this.tabu.set(operationPlan, Number(weight));
  }
  resetTabu(): void { this.tabu.clear(); }
  getUnresolvables(): readonly OperationPlan[] { return [...this.unresolvables]; }
  clearUnresolvables(): void { this.unresolvables.clear(); }
  clearMovedDeliveries(): void { this.movedDeliveries.clear(); }
  getMovedDeliveries(): readonly OperationPlan[] { return [...this.movedDeliveries]; }
  getAcceptTabuCandidate(): boolean { return this.acceptTabuCandidate; }
  setAcceptTabuCandidate(value: boolean): void { this.acceptTabuCandidate = Boolean(value); }
  getPropagate(): boolean { return this.propagate; }
  setPropagate(value: boolean): void { this.propagate = Boolean(value); }
  getCommandManager(): CommandManager { return this.manager; }
  setCommandManager(value: CommandManager): void { this.manager = value; }
  commit(): void { this.manager.commit(); }
  rollback(): void {
    this.manager.rollback();
    this.clearMovedDeliveries();
    this.originalDates.clear();
  }

  isValidCandidate(operationPlan: OperationPlan | null): operationPlan is OperationPlan {
    return operationPlan instanceof OperationPlan
      && (operationPlan.getProposed() || operationPlan.getApproved())
      && !operationPlan.getEnd().equals(PlanningDate.infiniteFuture)
      && (this.acceptTabuCandidate || !this.tabu.has(operationPlan));
  }

  compareCandidates(first: OperationPlan, second: OperationPlan, date: ForwardDateInput = PlanningDate.infinitePast): boolean {
    if (first === this.curOperationPlan || first === second) return true;
    if (second === this.curOperationPlan) return false;

    if (this.dependencyPathExists(first, second)) return false;
    if (this.dependencyPathExists(second, first, true)) return true;

    const firstTabu = this.tabu.get(first);
    const secondTabu = this.tabu.get(second);
    if (firstTabu !== undefined && secondTabu === undefined) return true;
    if (firstTabu === undefined && secondTabu !== undefined) return false;
    const startComparison = first.getStart().compare(second.getStart());
    if (startComparison) return startComparison < 0;

    let firstScore = firstTabu ?? first.getDelay().seconds / 86_400;
    let secondScore = secondTabu ?? second.getDelay().seconds / 86_400;
    if (first === this.curOperationPlan) firstScore += 1000;
    if (second === this.curOperationPlan) secondScore += 1000;
    const reference = forwardDate(date);
    if (reference.isInitialized()) {
      firstScore = this.adjustCandidateSetupScore(first, reference, firstScore);
      secondScore = this.adjustCandidateSetupScore(second, reference, secondScore);
    }
    if (Math.abs(firstScore - secondScore) > ROUNDING_ERROR) return firstScore < secondScore;
    return compareOperationPlans(first, second) < 0;
  }

  compare_loadplans(first: unknown, second: unknown): number {
    const firstDate = eventDate(first);
    const secondDate = eventDate(second);
    const dateComparison = firstDate.compare(secondDate);
    if (dateComparison) return dateComparison;
    const firstPlan = forwardCall(first, "getOperationPlan");
    const secondPlan = forwardCall(second, "getOperationPlan");
    if (!(firstPlan instanceof OperationPlan) || !(secondPlan instanceof OperationPlan)) return 0;
    const firstSetup = firstPlan.getSetupEnd().subtract(firstPlan.getStart()).seconds;
    const secondSetup = secondPlan.getSetupEnd().subtract(secondPlan.getStart()).seconds;
    if (firstSetup !== secondSetup) return firstSetup - secondSetup;
    const firstOriginal = this.originalDates.get(firstPlan);
    const secondOriginal = this.originalDates.get(secondPlan);
    if (firstOriginal && !secondOriginal) return -1;
    if (!firstOriginal && secondOriginal) return 1;
    if (firstOriginal && secondOriginal) {
      const originalComparison = firstOriginal.compare(secondOriginal);
      if (originalComparison) return originalComparison;
    }
    return compareOperationPlans(firstPlan, secondPlan);
  }

  solve(target: unknown = null, date?: ForwardDateInput): unknown {
    if (target instanceof Buffer) return this.solveBuffer(target);
    if (target instanceof ResourceBuckets) return this.solveBucketizedResource(target);
    if (target instanceof Resource) return this.solveResource(target);
    if (target instanceof OperationPlan) return this.solveOperationPlan(target, date);
    if (target instanceof Operation) {
      const result: OperationPlan[] = [];
      for (const candidate of target.getOperationPlans()) {
        if (candidate instanceof OperationPlan && this.solveOperationPlan(candidate, date)) result.push(candidate);
      }
      return result;
    }
    if (target && typeof target === "object") {
      const operationPlan = forwardCall(target, "getOperationPlan");
      if (operationPlan instanceof OperationPlan) return this.solveOperationPlan(operationPlan, date);
      const operationPlans = forwardCall(target, "getOperationPlans");
      if (operationPlans && typeof (operationPlans as Iterable<unknown>)[Symbol.iterator] === "function") {
        const result: OperationPlan[] = [];
        for (const candidate of operationPlans as Iterable<unknown>) {
          if (candidate instanceof OperationPlan && this.solveOperationPlan(candidate, date)) result.push(candidate);
        }
        return result;
      }
    }
    return this.solveGlobal(date);
  }

  private solveOperationPlan(operationPlan: OperationPlan, date?: ForwardDateInput): boolean {
    if (!this.isValidCandidate(operationPlan) || this.activeOperationPlans.has(operationPlan)) return false;
    this.activeOperationPlans.add(operationPlan);
    const previousOperationPlan = this.curOperationPlan;
    const previousLoadPlan = this.curLoadPlan;
    const previousFlowPlan = this.curFlowPlan;
    let changed = false;
    try {
      let earliest = date === undefined ? operationPlan.getStart() : forwardDate(date);
      const operation = operationPlan.getOperation();
      if (operation && this.isLeadTimeConstrained(operation)) {
        const fence = operationPlan.getApproved()
          ? Plan.instance().getCurrent()
          : Plan.instance().getCurrent().add(operation.getFence());
        if (earliest.compare(fence) < 0) earliest = fence;
      }
      const previous = operationPlan.getPrevSubOpplan();
      if (previous) {
        const ownerOperation = operationPlan.getOwner()?.getOperation();
        const routingPostTime = ownerOperation instanceof OperationRouting && ownerOperation.getHardPostTime()
          ? previous.getOperation()?.getPostTime() ?? new Duration()
          : new Duration();
        const routingDate = previous.getEnd().add(routingPostTime);
        if (earliest.compare(routingDate) < 0) earliest = routingDate;
      }
      for (const dependency of operationPlan.getBlockedbyIterator()) {
        const predecessor = forwardCall(dependency, "getFirst");
        if (!(predecessor instanceof OperationPlan)) continue;
        const dependencyDate = predecessor.getEnd().add(this.getDependencyLeadtime(dependency));
        if (earliest.compare(dependencyDate) < 0) earliest = dependencyDate;
      }
      if (operationPlan.getStart().compare(earliest) < 0) {
        changed = Boolean(this.addMoveStartDate(operationPlan, earliest));
      }

      if (this.propagate && this.isCapacityConstrained()) {
        for (const loadPlan of operationPlan.getLoadPlans()) {
          if (!(loadPlan instanceof LoadPlan) || loadPlan.getQuantity() >= 0 || !loadPlan.getLoad()) continue;
          const resource = loadPlan.getResource();
          if (!resource) continue;
          this.curOperationPlan = operationPlan;
          this.curFlowPlan = null;
          this.curLoadPlan = loadPlan;
          changed = this.solveResourceDispatch(resource) || changed;
        }
      }
      if (this.propagate && this.isMaterialConstrained()) {
        for (const flowPlan of operationPlan.getFlowPlans()) {
          if (!(flowPlan instanceof FlowPlan) || !flowPlan.getBuffer()) continue;
          this.curOperationPlan = operationPlan;
          this.curLoadPlan = null;
          this.curFlowPlan = flowPlan;
          changed = this.solveBuffer(flowPlan.getBuffer() as Buffer) || changed;
        }
      }

      changed = this.maintainDependencies(operationPlan, true) || changed;
      changed = this.maintainRouting(operationPlan, true) || changed;
      changed = this.synchronizeDemandGroup(operationPlan, true) || changed;
      for (const child of operationPlan.getSubOperationPlans()) {
        changed = this.solveOperationPlan(child) || changed;
      }
      return changed;
    } finally {
      this.curOperationPlan = previousOperationPlan;
      this.curLoadPlan = previousLoadPlan;
      this.curFlowPlan = previousFlowPlan;
      this.activeOperationPlans.delete(operationPlan);
    }
  }

  private rememberOriginalDate(operationPlan: OperationPlan): void {
    if (!this.originalDates.has(operationPlan)) {
      this.originalDates.set(operationPlan, operationPlan.getStart());
    }
  }

  private dependencyPathExists(source: OperationPlan, target: OperationPlan, upstream = false): boolean {
    const pending = [source];
    const visited = new Set<OperationPlan>();
    while (pending.length) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      if (current === target) return true;
      for (const dependency of current.getDependencies()) {
        const endpoint = forwardCall(dependency, upstream ? "getFirst" : "getSecond");
        const expected = forwardCall(dependency, upstream ? "getSecond" : "getFirst");
        if (expected === current && endpoint instanceof OperationPlan && !visited.has(endpoint)) pending.push(endpoint);
      }
    }
    return false;
  }

  private adjustCandidateSetupScore(operationPlan: OperationPlan, reference: PlanningDate, score: number): number {
    let result = score;
    for (const loadPlan of operationPlan.getLoadPlans()) {
      if (!(loadPlan instanceof LoadPlan) || loadPlan.getQuantity() >= 0) continue;
      const load = loadPlan.getLoad();
      const resource = loadPlan.getResource();
      const setup = load?.getSetup() ?? "";
      const matrix = resource?.getSetupMatrix();
      if (!load || !resource || !setup || !matrix) continue;
      const setupBefore = resource.getSetupAt(reference, operationPlan);
      const rule = matrix.calculateSetup(setupBefore?.getSetup() ?? "", setup, resource);
      if (rule) {
        if (rule.getCost()) result -= 1000;
        if (rule.getDuration().seconds > 0) result -= 500;
      } else result += 10000;
    }
    return result;
  }

  private trackDelivery(operationPlan: OperationPlan): void {
    let delivery: OperationPlan | null = operationPlan;
    while (delivery && !delivery.getDemand()) delivery = delivery.getOwner();
    if (delivery?.getDemand()) this.movedDeliveries.add(delivery);
  }

  private solveGlobal(date?: ForwardDateInput): OperationPlan[] {
    const changed = new Set<OperationPlan>();
    const current = Plan.instance().getCurrent();
    for (const operation of Operation.all()) {
      if (!this.matchesCluster(operation.getCluster()) || operation instanceof OperationInventory) continue;
      for (const candidate of operation.getOperationPlans()) {
        if (!(candidate instanceof OperationPlan)) continue;
        const leadTimeConstrained = this.isLeadTimeConstrained(candidate.getOperation());
        const maintainsDependencies = operation.getDependencies().length > 0;
        const maintainsRouting = candidate.getOwner()?.getOperation() instanceof OperationRouting;
        const proposedBeforeFence = candidate.getProposed()
          && candidate.getStart().compare(this.getOperationFence(operation, candidate)) < 0
          && leadTimeConstrained;
        const approvedBeforeCurrent = candidate.getApproved()
          && candidate.getStart().compare(current) < 0
          && leadTimeConstrained;
        if ((maintainsDependencies || maintainsRouting || proposedBeforeFence || approvedBeforeCurrent)
          && this.solveOperationPlan(candidate, date)) changed.add(candidate);
      }
    }

    const levelCount = Math.max(1, HasLevel.getNumberOfLevels());
    for (let level = levelCount; level > 0; level -= 1) {
      for (const buffer of Buffer.all()) {
        if (!this.matchesCluster(buffer.getCluster()) || buffer.getLevel() !== level || !buffer.getFlowPlans().length) continue;
        try {
          this.solveBuffer(buffer);
          this.manager.commit();
        } catch (error) {
          this.manager.rollback();
          throw error;
        }
      }

      for (let pass = 0; pass < MAX_LOOP; pass += 1) {
        let action = false;
        for (const resource of Resource.all()) {
          if (!this.matchesCluster(resource.getCluster()) || resource.isGroup() || !resource.getLoadPlans().length) continue;
          try {
            action = this.solveResourceDispatch(resource) || action;
            this.manager.commit();
          } catch (error) {
            this.manager.rollback();
            throw error;
          }
        }
        if (!action) break;
      }
    }
    return [...changed];
  }

  private solveResourceDispatch(resource: Resource): boolean {
    return resource instanceof ResourceBuckets
      ? this.solveBucketizedResource(resource)
      : this.solveResource(resource);
  }

  private solveResource(resource: Resource): boolean {
    if (!resource.getConstrained() || !this.isCapacityConstrained() || this.activeResources.has(resource)) return false;
    this.activeResources.add(resource);
    const propagation = new Set<OperationPlan>();
    let changed = false;
    this.originalDates.clear();
    try {
      for (let iteration = 0; iteration < MAX_LOOP; iteration += 1) {
        resource.recomputeTimelineBalances();
        const timeline = [...resource.getLoadPlans()].map((event) => ({
          event,
          date: eventDate(event),
          type: eventType(event),
          quantity: eventQuantity(event),
          maximum: eventMax(event),
        }));
        let currentMaximum = resource.getMaximum();
        let acceptedLoad = 0;
        let totalLoad = 0;
        let overloadEnd = -1;
        const currentLoadPlans: LoadPlan[] = [];
        const acceptedLoadPlans: LoadPlan[] = [];

        // Step 1: find the first overload and the loadplans active there.
        for (let index = 0; index < timeline.length;) {
          const date = timeline[index]?.date;
          if (!date) break;
          let end = index;
          while (end < timeline.length && timeline[end]?.date.equals(date)) {
            const entry = timeline[end];
            if (!entry) break;
            if (entry.type === 4) currentMaximum = entry.maximum;
            else if (entry.event instanceof LoadPlan) {
              const loadPlan = entry.event;
              const operationPlan = loadPlan.getOperationPlan();
              totalLoad += entry.quantity;
              if (operationPlan?.getConfirmed()) {
                acceptedLoad += entry.quantity;
                if (entry.quantity > 0) acceptedLoadPlans.push(loadPlan);
                else if (entry.quantity < 0) this.removeLoadPlanForOperation(acceptedLoadPlans, operationPlan);
              } else if (operationPlan) {
                if (entry.quantity > 0) currentLoadPlans.push(loadPlan);
                else if (entry.quantity < 0) this.removeLoadPlanForOperation(currentLoadPlans, operationPlan);
              }
            }
            end += 1;
          }
          if (totalLoad - currentMaximum > ROUNDING_ERROR && currentLoadPlans.length) {
            overloadEnd = end - 1;
            break;
          }
          index = end;
        }
        if (overloadEnd < 0) break;
        traceForward("overload", {
          resource: resource.getName(),
          date: timeline[overloadEnd]?.date.toString(),
          totalLoad,
          acceptedLoad,
          maximum: currentMaximum,
          candidates: currentLoadPlans.map((loadPlan) => ({
            reference: loadPlan.getOperationPlan()?.getReference(),
            quantity: loadPlan.getQuantity(),
            operationQuantity: loadPlan.getOperationPlan()?.getQuantity(),
            start: loadPlan.getOperationPlan()?.getStart().toString(),
            end: loadPlan.getOperationPlan()?.getEnd().toString(),
          })),
        });

        // Step 2: confirmed plans are fixed. Fill remaining capacity with
        // tabu plans first, then with the other proposed and approved plans.
        currentLoadPlans.sort((left, right) => this.compare_loadplans(left, right));
        for (let pass = 0; pass <= 1 && currentLoadPlans.length; pass += 1) {
          for (let index = 0; index < currentLoadPlans.length;) {
            const loadPlan = currentLoadPlans[index];
            const operationPlan = loadPlan?.getOperationPlan();
            if (!loadPlan || !operationPlan) {
              currentLoadPlans.splice(index, 1);
              continue;
            }
            const isTabu = this.tabu.has(operationPlan);
            if ((pass === 0 && !isTabu) || (pass === 1 && isTabu)) {
              index += 1;
              continue;
            }
            if (acceptedLoad + loadPlan.getQuantity() < currentMaximum + ROUNDING_ERROR) {
              acceptedLoadPlans.push(loadPlan);
              acceptedLoad += loadPlan.getQuantity();
              currentLoadPlans.splice(index, 1);
            } else index += 1;
          }
        }

        // Step 3: walk to later capacity releases. At every date move all
        // waiting candidates that fit, with a fallback for oversized loads.
        let iterationChanged = false;
        resource.setFrozenSetups(true);
        try {
          let index = overloadEnd + 1;
          while (index < timeline.length && currentLoadPlans.length) {
            const date = timeline[index]?.date;
            if (!date) break;
            let end = index;
            while (end < timeline.length && timeline[end]?.date.equals(date)) {
              const entry = timeline[end];
              if (!entry) break;
              if (entry.type === 4) currentMaximum = entry.maximum;
              else if (entry.event instanceof LoadPlan) {
                const loadPlan = entry.event;
                const operationPlan = loadPlan.getOperationPlan();
                if (operationPlan?.getConfirmed()) {
                  acceptedLoad += entry.quantity;
                  if (entry.quantity > 0) acceptedLoadPlans.push(loadPlan);
                  else if (entry.quantity < 0) {
                    const found = this.removeLoadPlanForOperation(acceptedLoadPlans, operationPlan);
                    if (found) acceptedLoad += entry.quantity;
                  }
                } else if (operationPlan && entry.quantity > 0) currentLoadPlans.push(loadPlan);
                else if (operationPlan && entry.quantity < 0 &&
                  this.removeLoadPlanForOperation(acceptedLoadPlans, operationPlan)) {
                  acceptedLoad += entry.quantity;
                }
              }
              end += 1;
            }

            let done = false;
            for (let checkLimit = 1; checkLimit >= 0 && !done; checkLimit -= 1) {
              for (let pass = 0; pass <= 1 && !done; pass += 1) {
                for (let candidateIndex = 0; candidateIndex < currentLoadPlans.length && !done;) {
                  const loadPlan = currentLoadPlans[candidateIndex];
                  const operationPlan = loadPlan?.getOperationPlan();
                  if (!loadPlan || !operationPlan) {
                    currentLoadPlans.splice(candidateIndex, 1);
                    continue;
                  }
                  const isTabu = this.tabu.has(operationPlan);
                  if ((pass === 0 && isTabu) || (pass === 1 && !isTabu)) {
                    candidateIndex += 1;
                    continue;
                  }
                  const quantity = loadPlan.getQuantity();
                  const canMove = acceptedLoad + quantity < currentMaximum + ROUNDING_ERROR ||
                    quantity > currentMaximum + ROUNDING_ERROR || checkLimit === 0;
                  if (!canMove || operationPlan.getStart().compare(date) >= 0) {
                    candidateIndex += 1;
                    continue;
                  }

                  this.addMoveStartDate(operationPlan, date);
                  traceForward("move", {
                    resource: resource.getName(),
                    reference: operationPlan.getReference(),
                    quantity,
                    operationQuantity: operationPlan.getQuantity(),
                    from: this.originalDates.get(operationPlan)?.toString(),
                    to: date.toString(),
                    resultingStart: operationPlan.getStart().toString(),
                    resultingEnd: operationPlan.getEnd().toString(),
                  });
                  operationPlan.appendInfo(`Moved the start late due to a capacity shortage on ${resource.getName()}`);
                  this.collectRelationPropagation(operationPlan, propagation);
                  acceptedLoadPlans.push(loadPlan);
                  acceptedLoad += quantity;
                  currentLoadPlans.splice(candidateIndex, 1);
                  changed = true;
                  iterationChanged = true;
                  if (acceptedLoad > currentMaximum - ROUNDING_ERROR || !currentLoadPlans.length) done = true;
                }
              }
            }
            if (done) break;
            index = end;
          }
        } finally {
          resource.setFrozenSetups(false);
        }
        if (!iterationChanged) break;
      }
      this.propagateCollected(propagation);
      return changed;
    } finally {
      this.originalDates.clear();
      resource.setFrozenSetups(false);
      this.activeResources.delete(resource);
    }
  }

  private removeLoadPlanForOperation(loadPlans: LoadPlan[], operationPlan: OperationPlan): boolean {
    const index = loadPlans.findIndex((candidate) => candidate.getOperationPlan() === operationPlan);
    if (index < 0) return false;
    loadPlans.splice(index, 1);
    return true;
  }

  private solveBucketizedResource(resource: ResourceBuckets): boolean {
    if (!resource.getConstrained() || !this.isCapacityConstrained() || this.activeResources.has(resource)) return false;
    this.activeResources.add(resource);
    const propagation = new Set<OperationPlan>();
    let changed = false;
    let lastLoop = new PlanningDate(PlanningDate.infinitePast);
    try {
      for (let iteration = 0; iteration < MAX_LOOP; iteration += 1) {
        resource.recomputeTimelineBalances();
        const timeline = [...resource.getLoadPlans()];
        let boundaryIndex = -1;
        let bucketStartIndex = -1;
        let bucketBalance = 0;
        for (let index = 0; index < timeline.length; index += 1) {
          const event = timeline[index];
          if (!event) continue;
          if (eventType(event) === 2) {
            if (bucketStartIndex >= 0 && bucketBalance < -ROUNDING_ERROR && eventDate(event).compare(lastLoop) > 0) {
              boundaryIndex = index;
              break;
            }
            bucketStartIndex = index;
            bucketBalance = eventOnhand(event);
          } else if (bucketStartIndex >= 0 && eventType(event) === 1) bucketBalance += eventQuantity(event);
        }
        if (boundaryIndex < 0) break;

        const boundaryEvent = timeline[boundaryIndex];
        if (!boundaryEvent) break;
        let remaining = -bucketBalance;
        const boundary = eventDate(boundaryEvent);
        lastLoop = boundary;
        const candidates = new Map<OperationPlan, number>();
        let previousBoundary = -1;
        for (let index = boundaryIndex - 1; index >= 0; index -= 1) {
          const event = timeline[index];
          if (!event) continue;
          if (eventType(event) === 2) {
            previousBoundary = index;
            break;
          }
          if (!(event instanceof LoadPlan)) continue;
          const plan = event.getOperationPlan();
          if (this.isValidCandidate(plan)) candidates.set(plan, event.getQuantity());
        }
        const available = previousBoundary >= 0 ? eventOnhand(timeline[previousBoundary]) : 0;

        while (remaining > ROUNDING_ERROR) {
          let selected: OperationPlan | null = null;
          let selectedLoad = 0;
          for (const [candidate, quantity] of candidates) {
            if (!selected || -quantity > available + ROUNDING_ERROR ||
              this.compareCandidates(selected, candidate, boundary)) {
              selected = candidate;
              selectedLoad = quantity;
            }
            if (-quantity > available + ROUNDING_ERROR) break;
          }
          if (!selected) break;
          this.addMoveStartDate(selected, boundary);
          const plan = selected;
          plan.appendInfo(`Moved the start late due to a capacity shortage on ${resource.getName()}`);
          remaining += selectedLoad;
          candidates.delete(selected);
          changed = true;
          this.collectRelationPropagation(plan, propagation);
        }
      }
      this.propagateCollected(propagation);
      return changed;
    } finally {
      this.activeResources.delete(resource);
    }
  }

  private solveBuffer(buffer: Buffer): boolean {
    if (buffer instanceof BufferInfinite || !this.isMaterialConstrained() || this.activeBuffers.has(buffer)) return false;
    this.activeBuffers.add(buffer);
    const propagation = new Set<OperationPlan>();
    let changed = false;
    try {
      for (let iteration = 0; iteration < MAX_LOOP; iteration += 1) {
        const timeline = buffer.getFlowPlans().filter((event): event is FlowPlan => event instanceof FlowPlan);
        let candidate: FlowPlan | null = null;
        let shortageIndex = -1;
        for (let index = 0; index < timeline.length; index += 1) {
          const event = timeline[index] as FlowPlan;
          const plan = event.getOperationPlan();
          if (event.getQuantity() < 0 && this.isValidCandidate(plan) &&
              (!candidate || this.compareCandidates(candidate.getOperationPlan() as OperationPlan, plan))) candidate = event;
          if (event.isLastOnDate() && event.getOnhand() < -ROUNDING_ERROR) {
            shortageIndex = index;
            break;
          }
        }
        if (shortageIndex < 0) break;
        const shortage = timeline[shortageIndex] as FlowPlan;
        if (!candidate) {
          for (const producer of timeline.slice(shortageIndex)) {
            const producerPlan = producer.getOperationPlan();
            if (producer.getQuantity() > 0 && producerPlan && !producerPlan.getConfirmed()) {
              this.unresolvables.add(producerPlan);
            }
          }
          break;
        }
        const supply = timeline.slice(shortageIndex).find((event) => event.getQuantity() > 0) ?? null;
        const plan = candidate.getOperationPlan();
        if (!plan) break;
        if (!supply) {
          let newSize = candidate.getQuantity() - shortage.getOnhand();
          if (newSize > -ROUNDING_ERROR) newSize = 0;
          const command = new CommandMoveOperationPlan(plan);
          this.manager.add(command);
          candidate.setQuantity(newSize, true, true, true);
          this.trackDelivery(plan);
          changed = true;
          continue;
        }

        const flow = candidate.getFlow();
        let operationDate = candidate.computeFlowToOperationDate(supply.getDate());
        if (flow instanceof FlowTransferBatch) {
          const operation = candidate.getOperation();
          if (operation) {
            const delta: Duration[] = [];
            operation.calculateOperationTime(plan, candidate.getDate(), supply.getDate(), delta);
            operationDate = operation.calculateOperationTime(
              plan,
              plan.getStart(),
              delta[0] ?? new Duration(),
              true,
            ).getEnd();
          }
        }
        const moved = flow instanceof FlowStart || flow instanceof FlowTransferBatch
          ? this.addMoveStartDate(plan, operationDate)
          : this.addMoveEndDate(plan, operationDate);
        plan.appendInfo(`Moved late to match material supply of ${candidate.getItem()?.getName() ?? buffer.getName()}`);
        changed = true;
        this.collectRelationPropagation(plan, propagation);
      }
      this.propagateCollected(propagation);
      return changed;
    } finally {
      this.activeBuffers.delete(buffer);
    }
  }

  private collectRelationPropagation(operationPlan: OperationPlan, propagation: Set<OperationPlan>): void {
    for (const dependency of operationPlan.getBlockingIterator()) {
      const successor = forwardCall(dependency, "getSecond");
      if (!(successor instanceof OperationPlan)) continue;
      const required = operationPlan.getEnd().add(this.getDependencyLeadtime(dependency));
      if (successor.getStart().compare(required) < 0 && this.addMoveStartDate(successor, required)) propagation.add(successor);
    }
    let previous = operationPlan;
    let next = operationPlan.getNextSubOpplan();
    const routing = operationPlan.getOwner()?.getOperation();
    while (next && this.isValidCandidate(next)) {
      const postTime = routing instanceof OperationRouting && routing.getHardPostTime()
        ? previous.getOperation()?.getPostTime() ?? new Duration()
        : new Duration();
      const required = previous.getEnd().add(postTime);
      if (next.getStart().compare(required) >= 0) break;
      if (this.addMoveStartDate(next, required) && this.propagate) propagation.add(next);
      previous = next;
      next = next.getNextSubOpplan();
    }
    if (this.synchronizeDemandGroup(operationPlan, false) && this.propagate) propagation.add(operationPlan);
    if (this.propagate) propagation.add(operationPlan);
  }

  private propagateCollected(propagation: Set<OperationPlan>): void {
    if (!this.propagate) return;
    const ordered = [...propagation].sort(compareOperationPlans);
    for (const operationPlan of ordered) this.solveOperationPlan(operationPlan);
  }

  private maintainDependencies(operationPlan: OperationPlan, recurse: boolean): boolean {
    let changed = false;
    for (const dependency of operationPlan.getBlockingIterator()) {
      const successor = forwardCall(dependency, "getSecond");
      if (!(successor instanceof OperationPlan) || !this.isValidCandidate(successor)) continue;
      const required = operationPlan.getEnd().add(this.getDependencyLeadtime(dependency));
      if (successor.getStart().compare(required) >= 0) continue;
      if (this.addMoveStartDate(successor, required)) changed = true;
      if (recurse) changed = this.solveOperationPlan(successor) || changed;
    }
    return changed;
  }

  private maintainRouting(operationPlan: OperationPlan, recurse: boolean): boolean {
    const next = operationPlan.getNextSubOpplan();
    if (!next || !this.isValidCandidate(next)) return false;
    const routing = operationPlan.getOwner()?.getOperation();
    const postTime = routing instanceof OperationRouting && routing.getHardPostTime()
      ? operationPlan.getOperation()?.getPostTime() ?? new Duration()
      : new Duration();
    const required = operationPlan.getEnd().add(postTime);
    if (next.getStart().compare(required) >= 0) return false;
    const changed = Boolean(this.addMoveStartDate(next, required));
    return recurse ? this.solveOperationPlan(next) || changed : changed;
  }

  private synchronizeDemandGroup(operationPlan: OperationPlan, recurse: boolean): boolean {
    const demand = operationPlan.getDemand();
    const owner = demand?.getOwner();
    if (!(owner instanceof DemandGroup) || owner.getPolicy() === Demand.POLICY_INDEPENDENT) return false;
    let changed = false;
    for (const member of owner.getMembers()) {
      for (const delivery of member.getDelivery()) {
        if (!(delivery instanceof OperationPlan) || delivery === operationPlan || delivery.getEnd().equals(operationPlan.getEnd())) continue;
        if (!this.addMoveEndDate(delivery, operationPlan.getEnd())) continue;
        changed = true;
        if (recurse) changed = this.solveOperationPlan(delivery) || changed;
      }
    }
    return changed;
  }

  private getDependencyLeadtime(dependency: unknown): Duration {
    const relation = forwardCall(dependency, "getOperationDependency");
    const hardLead = forwardCall(relation, "getHardSafetyLeadtime");
    return hardLead instanceof Duration ? hardLead : new Duration();
  }

  private matchesCluster(cluster: number): boolean {
    return !this.context || this.context.cluster === -1 || cluster === this.context.cluster;
  }

  private isCapacityConstrained(): boolean {
    return this.context?.getSolver()?.isCapacityConstrained() ?? true;
  }

  private isLeadTimeConstrained(operation: Operation | null): boolean {
    return this.context?.getSolver()?.isLeadTimeConstrained(operation) ?? true;
  }

  private getOperationFence(operation: Operation, operationPlan: OperationPlan): PlanningDate {
    const fence = operation.getFence();
    if (fence.isZero()) return Plan.instance().getCurrent();
    const range = operation.calculateOperationTime(
      operationPlan,
      Plan.instance().getCurrent(),
      new Duration(Math.abs(fence.seconds)),
      fence.seconds > 0,
      null,
      true,
    );
    return fence.seconds > 0 ? range.getEnd() : range.getStart();
  }

  private isMaterialConstrained(): boolean {
    const constraints = this.context?.getSolver()?.getConstraints() ?? (CAPACITY + MFG_LEADTIME + PO_LEADTIME);
    return Boolean(constraints & (MFG_LEADTIME + PO_LEADTIME));
  }
}

export class OperatorForwardCompareLoadPlans extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["OperatorForward::compareLoadPlans"] as const;
  constructor(private readonly owner: OperatorForward | null = null) { super(); }
  compare(first: unknown, second: unknown): number { return this.owner?.compare_loadplans(first, second) ?? 0; }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/solver/operatorforward.cpp.
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
  { name: "OperatorForward::solve", sourceLine: 31, status: "adapted" },
  { name: "OperatorForward::solve", sourceLine: 141, status: "adapted" },
  { name: "Plan::instance", sourceLine: 170, status: "adapted" },
  { name: "Plan::instance", sourceLine: 171, status: "adapted" },
  { name: "OperatorForward::solve", sourceLine: 294, status: "adapted" },
  { name: "OperatorForward::solve", sourceLine: 311, status: "adapted" },
  { name: "OperatorForward::compareLoadPlans::operator", sourceLine: 516, status: "adapted" },
  { name: "OperatorForward::solve", sourceLine: 546, status: "adapted" },
  { name: "OperatorForward::solve", sourceLine: 870, status: "adapted" },
  { name: "OperatorForward::isValidCandidate", sourceLine: 1223, status: "adapted" },
  { name: "OperatorForward::compareCandidates", sourceLine: 1232, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface OperatorForwardPort {
  compareCandidates(...args: readonly PortValue[]): PortValue | void;
  isValidCandidate(...args: readonly PortValue[]): PortValue | void;
  solve(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface compareLoadPlansPort {
  operator(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/operatorforward.cpp";
export const targetFile = "solver/operatorforward.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2026 by frePPLe bv                                        *",
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
  "#define FREPPLE_CORE",
  "#include \"frepple/solver.h\"",
  "",
  "namespace frepple {",
  "",
  "void OperatorForward::solve(void*) {",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "",
  "  // Detect whether this cluster has operation dependencies.",
  "  auto has_dependencies = false;",
  "  for (auto& o : Operation::all()) {",
  "    if ((cluster == -1 || o.getCluster() == cluster) &&",
  "        !o.getDependencies().empty()) {",
  "      has_dependencies = true;",
  "      break;",
  "    }",
  "  }",
  "",
  "  if (getLogLevel() > 0)",
  "    logger << indentlevel << \"Starting forward propagation in cluster \"",
  "           << cluster << \"\\n\";",
  "",
  "  Date current = Plan::instance().getCurrent();",
  "  for (auto& o : Operation::all()) {",
  "    if ((cluster != -1 && o.getCluster() != cluster) ||",
  "        o.hasType<OperationInventory>())",
  "      continue;",
  "    OperationPlan::iterator opplan_iter(&o);",
  "    while (OperationPlan* opplan = opplan_iter.next()) {",
  "      auto tmp =",
  "          data->getSolver()->isLeadTimeConstrained(opplan->getOperation());",
  "      if (",
  "          // Maintain dependencies",
  "          !o.getDependencies().empty()",
  "          // Maintain the sequence in a routing",
  "          || (opplan->getOwner() &&",
  "              opplan->getOwner()->getOperation()->hasType<OperationRouting>())",
  "          // Move operationplans planned in the past",
  "          || (opplan->getProposed() &&",
  "              opplan->getStart() < o.getFence(opplan) && tmp) ||",
  "          (opplan->getApproved() && opplan->getStart() < current && tmp))",
  "        solve(opplan, data);",
  "    }",
  "  }",
  "",
  "  // Propagate the shortage across all buffers, starting from the deepest",
  "  // level",
  "  for (short lvl = HasLevel::getNumberOfLevels(); lvl; --lvl) {",
  "    bool action_at_level = false;",
  "    for (auto& b : Buffer::all()) {",
  "      if ((cluster != -1 && b.getCluster() != cluster) || b.getLevel() != lvl ||",
  "          b.getFlowPlans().empty())",
  "        continue;",
  "      try {",
  "        b.solve(*this, data);",
  "        if (!data->getCommandManager()->empty()) action_at_level = true;",
  "        data->getCommandManager()->commit();",
  "      } catch (...) {",
  "        data->getCommandManager()->rollback();",
  "        logger << \"Error: Caught an exception while solving buffer '\" << b",
  "               << \"':\\n\";",
  "        try {",
  "          throw;",
  "        } catch (const bad_exception&) {",
  "          logger << \"  bad exception\\n\";",
  "        } catch (const exception& e) {",
  "          logger << \"  \" << e.what() << \"\\n\";",
  "        } catch (...) {",
  "          logger << \"  Unknown type\\n\";",
  "        }",
  "      }",
  "    }",
  "",
  "    // TODO We can drastically limit the list of resources to visit in every",
  "    // level sweep. That would require keeping track of a list of resources to",
  "    // propagate. Initially all resources would be in that list for an first,",
  "    // initial sweep. After the initial move only resource whose plan is",
  "    // changing should be put back on the propagation list.",
  "    action_at_level = true;",
  "    while (action_at_level || has_dependencies) {",
  "      // One or more shortages got resolved. We propagate to the resources",
  "      // before solving the next level.",
  "      action_at_level = false;",
  "      for (auto& res : Resource::all()) {",
  "        if ((cluster != -1 && res.getCluster() != cluster) ||",
  "            res.getLoadPlans().empty() || res.isGroup())",
  "          continue;",
  "        try {",
  "          res.solve(*this, nullptr);",
  "          if (!data->getCommandManager()->empty()) action_at_level = true;",
  "          data->getCommandManager()->commit();",
  "        } catch (...) {",
  "          data->getCommandManager()->rollback();",
  "          logger << \"Error: Caught an exception while solving resource '\" << res",
  "                 << \"':\\n\";",
  "          try {",
  "            throw;",
  "          } catch (const bad_exception&) {",
  "            logger << \"  bad exception\\n\";",
  "          } catch (const exception& e) {",
  "            logger << \"  \" << e.what() << \"\\n\";",
  "          } catch (...) {",
  "            logger << \"  Unknown type\\n\";",
  "          }",
  "        }",
  "      }",
  "      if (!action_at_level) break;",
  "    }",
  "  }",
  "",
  "  if (getLogLevel() > 0)",
  "    logger << indentlevel << \"Finished forward propagation in cluster \"",
  "           << cluster << \"\\n\";",
  "}",
  "",
  "void OperatorForward::solve(OperationPlan* opplan, void*) {",
  "  if (opplan->getEnd() == Date::infiniteFuture)",
  "    // Can't more forward than 2031",
  "    return;",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "",
  "  // Debugging log",
  "  ++indentlevel;",
  "  if (indentlevel > 30000) throw RuntimeException(\"Excessive recursion depth\");",
  "  if (getLogLevel() > 0 && getPropagate())",
  "    logger << indentlevel << \"Forward propagation of operationplan \" << opplan",
  "           << \"\\n\";",
  "",
  "  OperationPlan* tmp_operationplan = curOperationPlan;",
  "  FlowPlan* tmp_flowplan = curFlowPlan;",
  "  LoadPlan* tmp_loadplan = curLoadPlan;",
  "",
  "  // Move the operationplan to be feasible",
  "  if (data->getSolver()->isLeadTimeConstrained(opplan->getOperation())) {",
  "    if (opplan->getProposed()) {",
  "      Date earliest = opplan->getOperation()->getFence(opplan);",
  "      if (opplan->getStart() < earliest) {",
  "        addMoveStartDate(opplan, earliest);",
  "        if (getLogLevel() > 1)",
  "          logger << indentlevel << \"Delaying operationplan \" << opplan",
  "                 << \" till \" << opplan->getDates() << \"\\n\";",
  "        opplan->appendInfo(\"Moved the start late after the release fence\");",
  "      }",
  "    } else if (opplan->getApproved() &&",
  "               opplan->getStart() < Plan::instance().getCurrent()) {",
  "      addMoveStartDate(opplan, Plan::instance().getCurrent());",
  "      opplan->appendInfo(\"Moved the start late to the current date\");",
  "      if (getLogLevel() > 1)",
  "        logger << indentlevel << \"Delaying operationplan \" << opplan << \" till \"",
  "               << opplan->getDates() << \"\\n\";",
  "    }",
  "  }",
  "",
  "  if (getPropagate()) {",
  "    if (data->getSolver()->isCapacityConstrained()) {",
  "      // Propagate resource overloads by delaying other operationplans",
  "      auto ldpln_iter2 = opplan->getLoadPlans();",
  "      curLoadPlan = nullptr;",
  "      while ((curLoadPlan = ldpln_iter2.next())) {",
  "        if (curLoadPlan->getQuantity() < 0 && curLoadPlan->getResource() &&",
  "            curLoadPlan->getLoad())",
  "          break;",
  "      };",
  "      while (curLoadPlan) {",
  "        LoadPlan* nextLoadPlan = nullptr;",
  "        while ((nextLoadPlan = ldpln_iter2.next())) {",
  "          if (nextLoadPlan->getQuantity() < 0 && nextLoadPlan->getResource() &&",
  "              nextLoadPlan->getLoad())",
  "            break;",
  "        };",
  "        curFlowPlan = nullptr;",
  "        curOperationPlan = opplan;",
  "        curLoadPlan->getResource()->solve(*this, nullptr);",
  "        curLoadPlan = nextLoadPlan;",
  "      };",
  "    };",
  "",
  "    // Propagate the changes downstream",
  "    auto flwpln_iter = opplan->getFlowPlans();",
  "    while ((curFlowPlan = flwpln_iter.next())) {",
  "      curLoadPlan = nullptr;",
  "      curOperationPlan = opplan;",
  "      solve(curFlowPlan->getBuffer(), nullptr);",
  "    }",
  "  }",
  "",
  "  // Propagate dependencies",
  "  for (auto d : opplan->getDependencies()) {",
  "    if (opplan != d->getFirst()) continue;",
  "    Date nd = d->getFirst()->getEnd();",
  "    if (d->getOperationDependency())",
  "      nd += d->getOperationDependency()->getHardSafetyLeadtime();",
  "    if (nd > d->getSecond()->getStart() &&",
  "        (d->getSecond()->getProposed() || d->getSecond()->getApproved())) {",
  "      if (getLogLevel() > 1)",
  "        logger << indentlevel << \"Moving operationplan \" << d->getSecond()",
  "               << \" late to start on \" << nd << \" to maintain dependencies\\n\";",
  "      addMoveStartDate(d->getSecond(), nd);",
  "      d->getSecond()->appendInfo(",
  "          \"Moved the start late to follow a predecessor\");",
  "      solve(d->getSecond(), nullptr);",
  "    }",
  "  }",
  "",
  "  // Keep routing sequence correct and with minimal slack",
  "  if (opplan->getOwner() &&",
  "      opplan->getOwner()->getOperation()->hasType<OperationRouting>()) {",
  "    OperationPlan* other = opplan->getNextSubOpplan();",
  "    auto hard_posttime =",
  "        static_cast<OperationRouting*>(opplan->getOwner()->getOperation())",
  "            ->getHardPostTime();",
  "    auto posttime =",
  "        hard_posttime ? opplan->getOperation()->getPostTime() : Duration(0L);",
  "    if (other && (other->getApproved() || other->getProposed())) {",
  "      if (opplan->getEnd() + posttime > other->getStart()) {",
  "        if (getLogLevel() > 1)",
  "          logger << indentlevel << \"Moving operationplan \" << other",
  "                 << \" late to start on \" << (opplan->getEnd() + posttime)",
  "                 << \" to keep the sequence in the routing\\n\";",
  "        addMoveStartDate(other, opplan->getEnd() + posttime);",
  "        other->appendInfo(\"Moved the start late to follow a predecessor\");",
  "        solve(other, nullptr);",
  "      } else if (other->getStart() - opplan->getEnd() >",
  "                     opplan->getOperation()->getMaxEarly() &&",
  "                 (excess_scanner == direction::both ||",
  "                  excess_scanner == direction::downstream)) {",
  "        if (getLogLevel() > 1)",
  "          logger << indentlevel << \"Moving operationplan \" << other",
  "                 << \" late to start on \" << opplan->getEnd()",
  "                 << \" to reduce slack in the routing\\n\";",
  "        addMoveStartDate(other, opplan->getEnd());",
  "        other->appendInfo(\"Moved the start late to reduce slack\");",
  "        auto tmp = excess_scanner;",
  "        excess_scanner = direction::downstream;",
  "        solve(other, nullptr);",
  "        excess_scanner = tmp;",
  "      }",
  "    };",
  "  }",
  "",
  "  // Keep synchronised deliveries together",
  "  if (opplan->getDemand() && opplan->getDemand()->getOwner() &&",
  "      opplan->getDemand()->getOwner()->hasType<DemandGroup>() &&",
  "      static_cast<DemandGroup*>(opplan->getDemand()->getOwner())->getPolicy() !=",
  "          Demand::POLICY_INDEPENDENT) {",
  "    for (auto dmd = opplan->getDemand()->getOwner()->getMembers();",
  "         dmd != Demand::end(); ++dmd) {",
  "      for (auto dlvr : dmd->getDelivery()) {",
  "        if (dlvr != opplan && dlvr->getEnd() != opplan->getEnd()) {",
  "          addMoveEndDate(dlvr, opplan->getEnd());",
  "          dlvr->appendInfo(\"Moved to synchronize deliveries\");",
  "          solve(dlvr, nullptr);",
  "        }",
  "      }",
  "    }",
  "  }",
  "",
  "  // Apply to the sub-operations",
  "  auto subopplaniter = opplan->getSubOperationPlans();",
  "  while (auto subopplan = subopplaniter.next()) solve(subopplan, nullptr);",
  "",
  "  // Restore solver state to original situation",
  "  curFlowPlan = tmp_flowplan;",
  "  curLoadPlan = tmp_loadplan;",
  "  curOperationPlan = tmp_operationplan;",
  "  --indentlevel;",
  "}",
  "",
  "void OperatorForward::solve(const Operation* oper, void*) {",
  "  // Debugging log",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "",
  "  ++indentlevel;",
  "  if (getLogLevel() > 0)",
  "    logger << indentlevel << \"Forward propagation of operation \" << oper",
  "           << \"\\n\";",
  "",
  "  // Loop over operationplans",
  "  OperationPlan::iterator opplan_iter(oper);",
  "  while (OperationPlan* opplan = opplan_iter.next()) {",
  "    solve(opplan, nullptr);",
  "  }",
  "  --indentlevel;",
  "}",
  "",
  "void OperatorForward::solve(const ResourceBuckets* res, void*) {",
  "  // No propagation on unconstrained resources",
  "  if (!res->getConstrained() || !data->getSolver()->isCapacityConstrained())",
  "    return;",
  "",
  "  set<OperationPlan*> propagationList;",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "",
  "  // Debugging log",
  "  ++indentlevel;",
  "  bool first_action = true;",
  "",
  "  // Loop until all overloads are resolved",
  "  Date lastloop;",
  "  while (true) {",
  "    // Step 1: Find the end date of the earliest overloaded bucket.",
  "    auto ldpln_iter = res->getLoadPlans().begin();",
  "    for (; ldpln_iter != res->getLoadPlans().end(); ++ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 2 &&",
  "          ldpln_iter->getOnhandBeforeDate() < -ROUNDING_ERROR &&",
  "          ldpln_iter->getDate() > lastloop)",
  "        break;",
  "    }",
  "    if (ldpln_iter == res->getLoadPlans().end())",
  "      // Resource doesn't have a single overload",
  "      break;",
  "    double overload = -ldpln_iter->getOnhandBeforeDate();",
  "    Date nextBucket = ldpln_iter->getDate();",
  "    lastloop = nextBucket;",
  "",
  "    // Step 2: Scan for candidates using capacity in this bucket",
  "    map<OperationPlan*, double> candidates;",
  "    for (--ldpln_iter; ldpln_iter != res->getLoadPlans().end(); --ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 2) break;",
  "      if (ldpln_iter->getEventType() != 1) continue;",
  "      const LoadPlan* ldpln = static_cast<const LoadPlan*>(&*ldpln_iter);",
  "      if (isValidCandidate(ldpln->getOperationPlan()))",
  "        candidates.insert(",
  "            make_pair(ldpln->getOperationPlan(), ldpln->getQuantity()));",
  "    }",
  "    auto available = (ldpln_iter != res->getLoadPlans().end() &&",
  "                      ldpln_iter->getEventType() == 2)",
  "                         ? ldpln_iter->getOnhand()",
  "                         : 0.0;",
  "",
  "    // Step 3: Evaluate candidates",
  "    while (overload > ROUNDING_ERROR) {",
  "      double curload;",
  "      OperationPlan* candidate = nullptr;",
  "      for (auto x = candidates.begin(); x != candidates.end(); ++x) {",
  "        if (!candidate || -x->second > available + ROUNDING_ERROR ||",
  "            compareCandidates(candidate, x->first, nextBucket)) {",
  "          candidate = x->first;",
  "          curload = x->second;",
  "        }",
  "        if (getLogLevel() > 5) {",
  "          if (first_action) {",
  "            logger << indentlevel",
  "                   << \"Forward propagation of bucketized resource \" << res;",
  "            if (curOperationPlan)",
  "              logger << \" for operationplan \" << curOperationPlan;",
  "            if (curLoadPlan) logger << \" on \" << curLoadPlan->getDate();",
  "            logger << \"\\n\";",
  "            first_action = false;",
  "          }",
  "          logger << indentlevel << \"   candidate \" << x->first << \": \"",
  "                 << ((candidate == x->first) ? \"*\" : \"\") << \"\\n\";",
  "        }",
  "        if (-x->second > available + ROUNDING_ERROR) {",
  "          // This candidate is already bigger than the availability in the",
  "          // bucket. No need to look further.",
  "          break;",
  "        }",
  "      }",
  "",
  "      /*",
  "      if (candidate && - curload > available && available > ROUNDING_ERROR){",
  "        // TODO  Step 4: Split the candidate",
  "      }",
  "      else",
  "      */",
  "      if (candidate) {",
  "        // Step 4: Move the candidate late",
  "        if (getLogLevel() > 1) {",
  "          if (first_action) {",
  "            logger << indentlevel",
  "                   << \"Forward propagation of bucketized resource \" << res;",
  "            if (curOperationPlan)",
  "              logger << \" for operationplan \" << curOperationPlan;",
  "            if (curLoadPlan) logger << \" on \" << curLoadPlan->getDate();",
  "            logger << \"\\n\";",
  "            first_action = false;",
  "          }",
  "          logger << indentlevel << \"Moving operationplan \" << candidate",
  "                 << \" to start on \" << nextBucket << \"\\n\";",
  "        }",
  "        addMoveStartDate(candidate, nextBucket);",
  "        candidate->appendInfo(",
  "            \"Moved the start late due to a capacity shortage on \" +",
  "            res->getName());",
  "",
  "        // Propagate dependencies",
  "        for (auto d : candidate->getDependencies()) {",
  "          if (candidate != d->getFirst()) continue;",
  "          Date nd = d->getFirst()->getEnd();",
  "          if (d->getOperationDependency())",
  "            nd += d->getOperationDependency()->getHardSafetyLeadtime();",
  "          if (nd > d->getSecond()->getStart() &&",
  "              (d->getSecond()->getApproved() ||",
  "               d->getSecond()->getProposed())) {",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"Moving operationplan \" << d->getSecond()",
  "                     << \" late to start on \" << nd",
  "                     << \" to maintain dependencies\\n\";",
  "            addMoveStartDate(d->getSecond(), nd);",
  "            propagationList.insert(d->getSecond());",
  "            d->getSecond()->appendInfo(",
  "                \"Moved the start late to follow a predecessor\");",
  "          }",
  "        }",
  "",
  "        // Keep routing sequence correct",
  "        if (candidate->getOwner() && candidate->getOwner()",
  "                                         ->getOperation()",
  "                                         ->hasType<OperationRouting>()) {",
  "          OperationPlan* tmp = candidate;",
  "          OperationPlan* other = tmp->getNextSubOpplan();",
  "          auto hard_posttime =",
  "              static_cast<OperationRouting*>(tmp->getOwner()->getOperation())",
  "                  ->getHardPostTime();",
  "          auto posttime =",
  "              hard_posttime ? tmp->getOperation()->getPostTime() : Duration(0L);",
  "          while (other && (other->getApproved() || other->getProposed()) &&",
  "                 tmp->getEnd() + posttime > other->getStart()) {",
  "            addMoveStartDate(other, tmp->getEnd() + posttime);",
  "            other->appendInfo(\"Moved the start late to follow a predecessor\");",
  "            if (getPropagate()) propagationList.insert(other);",
  "            tmp = other;",
  "            other = tmp->getNextSubOpplan();",
  "            if (hard_posttime) posttime = tmp->getOperation()->getPostTime();",
  "          };",
  "        }",
  "",
  "        // Keep synchronised deliveries together",
  "        if (candidate->getDemand() && candidate->getDemand()->getOwner() &&",
  "            candidate->getDemand()->getOwner()->hasType<DemandGroup>() &&",
  "            static_cast<DemandGroup*>(candidate->getDemand()->getOwner())",
  "                    ->getPolicy() != Demand::POLICY_INDEPENDENT) {",
  "          for (auto dmd = candidate->getDemand()->getOwner()->getMembers();",
  "               dmd != Demand::end(); ++dmd) {",
  "            for (auto dlvr : dmd->getDelivery()) {",
  "              if (dlvr != candidate && dlvr->getEnd() != candidate->getEnd()) {",
  "                addMoveEndDate(dlvr, candidate->getEnd());",
  "                dlvr->appendInfo(\"Moved to synchronize deliveries\");",
  "                if (getPropagate()) propagationList.insert(dlvr);",
  "              }",
  "            }",
  "          }",
  "        }",
  "",
  "        // Remove from the candidate list",
  "        auto search = candidates.find(candidate);",
  "        if (search != candidates.end()) candidates.erase(search);",
  "",
  "        // Propagate the change",
  "        if (getPropagate()) propagationList.insert(candidate);",
  "",
  "        // Reduce overload size",
  "        overload += curload;",
  "      } else {",
  "        if (getLogLevel() > 0) {",
  "          if (first_action) {",
  "            logger << indentlevel",
  "                   << \"Forward propagation of bucketized resource \" << res;",
  "            if (curOperationPlan)",
  "              logger << \" for operationplan \" << curOperationPlan;",
  "            if (curLoadPlan) logger << \" on \" << curLoadPlan->getDate();",
  "            logger << \"\\n\";",
  "            first_action = false;",
  "          }",
  "          logger << \"Can't find candidate operationplans\\n\";",
  "        }",
  "        overload = 0.0;",
  "        break;",
  "      }",
  "    }",
  "  };",
  "",
  "  // Propagate all collected changes",
  "  while (!propagationList.empty()) {",
  "    // Find the earliest operationplan in the list.",
  "    auto sel = propagationList.end();",
  "    for (auto cd = propagationList.begin(); cd != propagationList.end(); ++cd)",
  "      if (sel == propagationList.end() || **cd < **sel) sel = cd;",
  "",
  "    // Propagate the operationplan",
  "    solve(*sel, nullptr);",
  "",
  "    // Remove from the list",
  "    propagationList.erase(sel);",
  "  }",
  "",
  "  --indentlevel;",
  "}",
  "",
  "bool OperatorForward::compareLoadPlans::operator()(const LoadPlan*& a,",
  "                                                   const LoadPlan*& b) {",
  "  if (a->getDate() != b->getDate())",
  "    // a. Order by date",
  "    return a->getDate() < b->getDate();",
  "  else {",
  "    // b. Prefer moving based on setup time",
  "    auto setup_a = a->getOperationPlan()->getSetupEnd() -",
  "                   a->getOperationPlan()->getStart();",
  "    auto setup_b = b->getOperationPlan()->getSetupEnd() -",
  "                   b->getOperationPlan()->getStart();",
  "    if (setup_a != setup_b) return setup_a < setup_b;",
  "",
  "    // c. User the original date as a tie breaker",
  "    auto t1 = data->original_dates.find(a->getOperationPlan());",
  "    auto t2 = data->original_dates.find(b->getOperationPlan());",
  "    if (t1 != data->original_dates.end() && t2 == data->original_dates.end())",
  "      return true;",
  "    else if (t1 == data->original_dates.end() &&",
  "             t2 != data->original_dates.end())",
  "      return false;",
  "    else if (t1 != data->original_dates.end() &&",
  "             t2 != data->original_dates.end() && t1->second != t2->second)",
  "      return t1->second < t2->second;",
  "    else",
  "      // d. Default ordering of operationplans",
  "      return a->getOperationPlan() < b->getOperationPlan();",
  "  }",
  "}",
  "",
  "void OperatorForward::solve(const Resource* res, void*) {",
  "  // No propagation on unconstrained resources",
  "  if (!res->getConstrained() || !data->getSolver()->isCapacityConstrained())",
  "    return;",
  "",
  "  indent& indentlevel = data->getSolver()->indentlevel;",
  "  set<OperationPlan*> propagationList;",
  "  map<OperationPlan*, Date> candidates_orginal;",
  "",
  "  // Debugging log",
  "  ++indentlevel;",
  "  bool first_action = true;",
  "",
  "  // Loop until all overloads are resolved",
  "  original_dates.clear();",
  "  unsigned short iterationcount = 0;",
  "  while (true) {",
  "    list<const LoadPlan*> current_loadplans;",
  "    list<const LoadPlan*> accepted_loadplans;",
  "    double overload = 0.0;",
  "    const LoadPlan* cur = nullptr;",
  "    double accepted_load = 0.0;",
  "",
  "    // Step 1: Find the start of the first overload.",
  "    Resource::loadplanlist::const_iterator ldpln_iter =",
  "        res->getLoadPlans().begin();",
  "    double curMax =",
  "        (ldpln_iter == res->getLoadPlans().end()) ? 0 : ldpln_iter->getMax();",
  "    for (; ldpln_iter != res->getLoadPlans().end(); ++ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 4) {",
  "        // Change of the maximum",
  "        curMax = ldpln_iter->getMax();",
  "        cur = nullptr;",
  "      } else if (ldpln_iter->getEventType() == 1)",
  "        cur = static_cast<const LoadPlan*>(&*ldpln_iter);",
  "      else",
  "        cur = nullptr;",
  "",
  "      // Track all operationplans currently loading the resource",
  "      if (cur) {",
  "        if (cur->getOperationPlan()->getConfirmed()) {",
  "          accepted_load += cur->getQuantity();",
  "          if (cur->getQuantity() > 0)",
  "            accepted_loadplans.push_back(cur);",
  "          else if (cur->getQuantity() < 0) {",
  "            for (auto f = accepted_loadplans.begin();",
  "                 f != accepted_loadplans.end(); ++f) {",
  "              if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "                accepted_loadplans.erase(f);",
  "                break;",
  "              }",
  "            }",
  "          }",
  "        } else {",
  "          if (cur->getQuantity() > 0)",
  "            current_loadplans.push_back(cur);",
  "          else if (cur->getQuantity() < 0) {",
  "            for (auto f = current_loadplans.begin();",
  "                 f != current_loadplans.end(); ++f) {",
  "              if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "                current_loadplans.erase(f);",
  "                break;",
  "              }",
  "            }",
  "          }",
  "        }",
  "      }",
  "",
  "      // Detect overload status",
  "      if (!ldpln_iter->isLastOnDate()) continue;",
  "      overload = ldpln_iter->getOnhandAfterDate() - curMax;",
  "      if (overload > ROUNDING_ERROR && !current_loadplans.empty()) break;",
  "    }",
  "    if (overload < ROUNDING_ERROR)",
  "      // Resource has not a single overload",
  "      break;",
  "",
  "    if (getLogLevel() > 0) {",
  "      if (first_action) {",
  "        logger << indentlevel << \"Forward propagation of resource \" << res;",
  "        if (curOperationPlan)",
  "          logger << \" for operationplan \" << curOperationPlan;",
  "        if (curLoadPlan) logger << \" on \" << curLoadPlan->getDate();",
  "        logger << \"\\n\";",
  "        first_action = false;",
  "      }",
  "      logger << indentlevel << \"  Overload of \" << overload",
  "             << \" detected starting at \" << ldpln_iter->getDate() << \"\\n\";",
  "    }",
  "",
  "    // Step 2: Establish accepted load at the problem start.",
  "    // All confirmed loadplans are already accepted. We now add approved &",
  "    // proposed to fit the size.",
  "    // We first try to accept the tabu operationplans.",
  "    current_loadplans.sort(compareLoadPlans(this));",
  "    for (short pass = 0; pass <= 1 && !current_loadplans.empty(); ++pass) {",
  "      for (auto f = current_loadplans.begin(); f != current_loadplans.end();) {",
  "        auto is_tabu = tabu.find((*f)->getOperationPlan()) != tabu.end();",
  "        if ((pass == 0 && !is_tabu) || (pass == 1 && is_tabu)) {",
  "          ++f;",
  "          continue;",
  "        }",
  "        if (accepted_load + (*f)->getQuantity() < curMax + ROUNDING_ERROR) {",
  "          auto tmp = f;",
  "          accepted_loadplans.push_back(*f);",
  "          accepted_load += (*f)->getQuantity();",
  "          ++f;",
  "          current_loadplans.erase(tmp);",
  "        } else",
  "          ++f;",
  "      }",
  "    }",
  "",
  "    // Ldpln_iter is now pointing to first event within the overload period.",
  "    if (ldpln_iter != res->getLoadPlans().end()) ++ldpln_iter;",
  "",
  "    // Step 3: Scan forward till this overload is over.",
  "    res->setFrozenSetups(true);",
  "    for (;",
  "         ldpln_iter != res->getLoadPlans().end() && !current_loadplans.empty();",
  "         ++ldpln_iter) {",
  "      if (ldpln_iter->getEventType() == 4) {",
  "        // Change of the maximum",
  "        curMax = ldpln_iter->getMax();",
  "        cur = nullptr;",
  "      } else if (ldpln_iter->getEventType() == 1)",
  "        cur = static_cast<const LoadPlan*>(&*ldpln_iter);",
  "      else",
  "        cur = nullptr;",
  "",
  "      // Track all operationplans currently loading the resource",
  "      if (cur) {",
  "        if (cur->getOperationPlan()->getConfirmed()) {",
  "          // Confirmed loadplans are always accepted immediately",
  "          accepted_load += cur->getQuantity();",
  "          if (cur->getQuantity() > 0)",
  "            accepted_loadplans.push_back(cur);",
  "          else if (cur->getQuantity() < 0) {",
  "            bool found = false;",
  "            for (auto f = accepted_loadplans.begin();",
  "                 f != accepted_loadplans.end(); ++f) {",
  "              if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "                accepted_load += cur->getQuantity();",
  "                accepted_loadplans.erase(f);",
  "                found = true;",
  "                break;",
  "              }",
  "            }",
  "            if (!found)",
  "              logger << \"Couldn't find confirmed operationplan in the list\\n\";",
  "          }",
  "        } else if (cur->getQuantity() > 0)",
  "          // New candidates are collected here",
  "          current_loadplans.push_back(cur);",
  "        else if (cur->getQuantity() < 0) {",
  "          for (auto f = accepted_loadplans.begin();",
  "               f != accepted_loadplans.end(); ++f) {",
  "            if (cur->getOperationPlan() == (*f)->getOperationPlan()) {",
  "              // One of the accepted operationplans ends here",
  "              accepted_load += cur->getQuantity();",
  "              accepted_loadplans.erase(f);",
  "              break;",
  "            }",
  "          }",
  "        }",
  "      }",
  "",
  "      // Evaluate at the end of this date",
  "      if (!ldpln_iter->isLastOnDate()) continue;",
  "",
  "      // Done resolving this overload",
  "      if (current_loadplans.empty()) break;",
  "",
  "      // Fill up free capacity with available candidates.",
  "      // First non-tabu, then tabu.",
  "      bool done = false;",
  "      for (short check_limit = 1; check_limit >= 0; --check_limit) {",
  "        for (short pass = 0; pass <= 1 && !done; ++pass) {",
  "          for (auto f = current_loadplans.begin();",
  "               f != current_loadplans.end();) {",
  "            auto is_tabu = tabu.find((*f)->getOperationPlan()) != tabu.end();",
  "            if ((pass == 0 && is_tabu) || (pass == 1 && !is_tabu)) {",
  "              ++f;",
  "              continue;",
  "            }",
  "            if (accepted_load + (*f)->getQuantity() < curMax + ROUNDING_ERROR ||",
  "                (*f)->getQuantity() > curMax + ROUNDING_ERROR || !check_limit) {",
  "              // Move this candidate if a) it fits within the available size or",
  "              // b) the candidate will never fit anyway.",
  "              auto opplan = (*f)->getOperationPlan();",
  "",
  "              if (opplan->getStart() >= ldpln_iter->getDate()) {",
  "                ++f;",
  "                continue;",
  "              }",
  "",
  "              if (getLogLevel() > 1)",
  "                logger << indentlevel << \"    Moving operationplan \" << opplan",
  "                       << \" to start on \" << ldpln_iter->getDate() << \"\\n\";",
  "",
  "              // Move the candidate late",
  "              addMoveStartDate(opplan, ldpln_iter->getDate());",
  "              opplan->appendInfo(",
  "                  \"Moved the start late due to a capacity shortage on \" +",
  "                  res->getName());",
  "",
  "              // Propagate dependencies",
  "              for (auto d : opplan->getDependencies()) {",
  "                if (opplan != d->getFirst()) continue;",
  "                Date nd = d->getFirst()->getEnd();",
  "                if (d->getOperationDependency())",
  "                  nd += d->getOperationDependency()->getHardSafetyLeadtime();",
  "                if (nd > d->getSecond()->getStart() &&",
  "                    (d->getSecond()->getProposed() ||",
  "                     d->getSecond()->getApproved())) {",
  "                  if (getLogLevel() > 1)",
  "                    logger << indentlevel << \"Moving operationplan \"",
  "                           << d->getSecond() << \" late to start on \" << nd",
  "                           << \" to maintain dependencies\\n\";",
  "                  addMoveStartDate(d->getSecond(), nd);",
  "                  d->getSecond()->appendInfo(",
  "                      \"Moved the start late to follow a predecessor\");",
  "                  propagationList.insert(d->getSecond());",
  "                }",
  "              }",
  "",
  "              // Keep routing sequence correct",
  "              if (opplan->getOwner() && opplan->getOwner()",
  "                                            ->getOperation()",
  "                                            ->hasType<OperationRouting>()) {",
  "                OperationPlan* tmp = opplan;",
  "                OperationPlan* other = tmp->getNextSubOpplan();",
  "                auto hard_posttime = static_cast<OperationRouting*>(",
  "                                         tmp->getOwner()->getOperation())",
  "                                         ->getHardPostTime();",
  "                auto posttime = hard_posttime",
  "                                    ? tmp->getOperation()->getPostTime()",
  "                                    : Duration(0L);",
  "                while (other &&",
  "                       (other->getApproved() || other->getProposed()) &&",
  "                       tmp->getEnd() + posttime > other->getStart()) {",
  "                  if (getLogLevel() > 1)",
  "                    logger << indentlevel << \"    Moving operationplan \"",
  "                           << other << \" late to start on \"",
  "                           << (tmp->getEnd() + posttime)",
  "                           << \" to keep the sequence in the routing\\n\";",
  "                  addMoveStartDate(other, tmp->getEnd() + posttime);",
  "                  other->appendInfo(",
  "                      \"Moved the start late to follow a predecessor\");",
  "                  if (getPropagate()) propagationList.insert(other);",
  "                  tmp = other;",
  "                  other = tmp->getNextSubOpplan();",
  "                  if (hard_posttime)",
  "                    posttime = tmp->getOperation()->getPostTime();",
  "                };",
  "              }",
  "",
  "              // Keep synchronised deliveries together",
  "              if (opplan->getDemand() && opplan->getDemand()->getOwner() &&",
  "                  opplan->getDemand()->getOwner()->hasType<DemandGroup>() &&",
  "                  static_cast<DemandGroup*>(opplan->getDemand()->getOwner())",
  "                          ->getPolicy() != Demand::POLICY_INDEPENDENT) {",
  "                for (auto dmd = opplan->getDemand()->getOwner()->getMembers();",
  "                     dmd != Demand::end(); ++dmd) {",
  "                  for (auto dlvr : dmd->getDelivery()) {",
  "                    if (dlvr != opplan && dlvr->getEnd() != opplan->getEnd()) {",
  "                      addMoveEndDate(dlvr, opplan->getEnd());",
  "                      dlvr->appendInfo(\"Moved to synchronize deliveries\");",
  "                      if (getPropagate()) propagationList.insert(dlvr);",
  "                    }",
  "                  }",
  "                }",
  "              }",
  "",
  "              // Propagate changes",
  "              if (getPropagate()) propagationList.insert(opplan);",
  "",
  "              // Maintain list of accepted and waiting loads",
  "              accepted_loadplans.push_back(*f);",
  "              accepted_load += (*f)->getQuantity();",
  "              auto tmp = f;",
  "              ++f;",
  "              current_loadplans.erase(tmp);",
  "",
  "              if (accepted_load > curMax - ROUNDING_ERROR ||",
  "                  current_loadplans.empty()) {",
  "                done = true;",
  "                break;",
  "              }",
  "            } else",
  "              ++f;",
  "          }",
  "        }",
  "      }",
  "      if (done) break;",
  "    }",
  "    res->setFrozenSetups(false);",
  "",
  "    if (++iterationcount >= MAX_LOOP) {",
  "      logger << indentlevel",
  "             << \"Error: Leaving resource forward propagation loop on \" << res",
  "             << \" after \" << MAX_LOOP << \" iterations\\n\";",
  "      break;",
  "    }",
  "  }",
  "  original_dates.clear();",
  "",
  "  // Propagate all collected changes",
  "  while (!propagationList.empty()) {",
  "    // Find the earliest operationplan in the list.",
  "    auto sel = propagationList.end();",
  "    for (auto cd = propagationList.begin(); cd != propagationList.end(); ++cd)",
  "      if (sel == propagationList.end() || **cd < **sel) sel = cd;",
  "",
  "    // Propagate the operationplan",
  "    solve(*sel, nullptr);",
  "",
  "    // Remove from the list",
  "    propagationList.erase(sel);",
  "  }",
  "",
  "  --indentlevel;",
  "}",
  "",
  "void OperatorForward::solve(const Buffer* buf, void*) {",
  "  if (buf->hasType<BufferInfinite>()) return;",
  "",
  "  if ((data->getSolver()->getConstraints() &",
  "       (SolverCreate::MFG_LEADTIME + SolverCreate::PO_LEADTIME)) == 0)",
  "    // Material shortages are ok in this type of plan.",
  "    return;",
  "",
  "  auto& indentlevel = data->getSolver()->indentlevel;",
  "  set<OperationPlan*> propagationList;",
  "",
  "  // Debugging log",
  "  ++indentlevel;",
  "  bool first_action = true;",
  "",
  "  // Loop until all downstream shortages are resolved",
  "  bool ok = false;",
  "  unsigned short iterationcount = 0;",
  "  do {",
  "    // Scan for shortages since the start of the horizon.",
  "    auto flpln_iter = buf->getFlowPlanIterator();",
  "    const FlowPlan* candidate = nullptr;",
  "    while (flpln_iter != buf->getFlowPlans().end()) {",
  "      if (flpln_iter->getEventType() == 1 && flpln_iter->getQuantity() < 0.0) {",
  "        auto tmp =",
  "            static_cast<const FlowPlan*>(&*flpln_iter)->getOperationPlan();",
  "        if (isValidCandidate(tmp)) {",
  "          if (!candidate ||",
  "              compareCandidates(candidate->getOperationPlan(), tmp))",
  "            candidate = static_cast<const FlowPlan*>(&*flpln_iter);",
  "        }",
  "      }",
  "      if (flpln_iter->isLastOnDate() &&",
  "          flpln_iter->getOnhand() < -ROUNDING_ERROR)",
  "        // Shortage to solve",
  "        break;",
  "      ++flpln_iter;",
  "    }",
  "",
  "    if (flpln_iter == buf->getFlowPlans().end()) {",
  "      // Hurray, no shortages found",
  "      ok = true;",
  "      break;",
  "    }",
  "",
  "    // Candidate to move: last acceptable consuming flowplan at or before the",
  "    // date when shortage starts.",
  "    // The candidate will be moved to the  date when the next supply arrives",
  "    // in the buffer. It is possible that at that date the shortage isn't solved",
  "    // yet.",
  "    if (!candidate) {",
  "      // We can't resolve the shortage by moving operationplans late.",
  "      // Put the producers on the list to propagate by moving early again.",
  "      ok = true;",
  "      auto flpln_iter_candidate = flpln_iter;",
  "      while (flpln_iter_candidate != buf->getFlowPlans().end()) {",
  "        if (flpln_iter_candidate->getEventType() == 1 &&",
  "            flpln_iter_candidate->getQuantity() > 0) {",
  "          candidate = static_cast<const FlowPlan*>(&*flpln_iter_candidate);",
  "          if (!candidate->getOperationPlan()->getConfirmed()) {",
  "            if (getLogLevel() > 1) {",
  "              if (first_action) {",
  "                logger << indentlevel << \"Forward propagation of buffer \"",
  "                       << buf;",
  "                if (curOperationPlan)",
  "                  logger << \" for operationplan \" << curOperationPlan;",
  "                if (curFlowPlan) logger << \" on \" << curFlowPlan->getDate();",
  "                logger << \"\\n\";",
  "                first_action = false;",
  "              }",
  "              logger << indentlevel << \"Adding operationplan \"",
  "                     << candidate->getOperationPlan()",
  "                     << \" as candidate to resolve in opposite direction\\n\";",
  "            }",
  "            unresolvables.insert(candidate->getOperationPlan());",
  "          }",
  "        }",
  "        ++flpln_iter_candidate;",
  "      }",
  "      break;",
  "    } else {",
  "      auto flpln_iter2 = flpln_iter;",
  "      while (flpln_iter2 != buf->getFlowPlans().end()) {",
  "        if (flpln_iter2->getQuantity() > 0) break;",
  "        ++flpln_iter2;",
  "      }",
  "      if (flpln_iter2 == buf->getFlowPlans().end()) {",
  "        auto newsize = candidate->getQuantity() - flpln_iter->getOnhand();",
  "        if (newsize > -ROUNDING_ERROR) newsize = 0.0;",
  "        if (getLogLevel() > 0) {",
  "          if (first_action) {",
  "            first_action = false;",
  "            logger << indentlevel << \"Forward propagation of buffer \" << buf;",
  "            if (curOperationPlan)",
  "              logger << \" for operationplan \" << curOperationPlan;",
  "            if (curFlowPlan) logger << \" on \" << curFlowPlan->getDate();",
  "            logger << \"\\n\";",
  "          }",
  "          logger << indentlevel << \"Resizing operationplan \"",
  "                 << candidate->getOperationPlan() << \" to consume only \"",
  "                 << newsize << \"\\n\";",
  "        }",
  "        addResize(const_cast<FlowPlan*>(candidate), newsize, true);",
  "        candidate->getOperationPlan()->appendInfo(",
  "            \"Reduced the quantity to match material supply of \" +",
  "            candidate->getItem()->getName());",
  "        continue;",
  "      }",
  "",
  "      // Resolving (part of) the shortage by moving this operationplan",
  "      // TODO consider splitting the consumer if (shortage <",
  "      // candidate->getQuantity() ) or to find a smarter match on the quantity",
  "      if (candidate->getFlow()->hasType<FlowStart, FlowTransferBatch>()) {",
  "        if (candidate->getFlow()->hasType<FlowTransferBatch>()) {",
  "          // Some calculation is required to translate the date of the candidate",
  "          // transfer batch into a new start date of the operation.",
  "          Duration delta;",
  "          candidate->getOperation()->calculateOperationTime(",
  "              candidate->getOperationPlan(), candidate->getDate(),",
  "              flpln_iter2->getDate(), &delta);",
  "          DateRange newdate = candidate->getOperation()->calculateOperationTime(",
  "              candidate->getOperationPlan(),",
  "              candidate->getOperationPlan()->getStart(), delta, true);",
  "          if (getLogLevel() > 1) {",
  "            if (first_action) {",
  "              first_action = false;",
  "              logger << indentlevel << \"Forward propagation of buffer \" << buf;",
  "              if (curOperationPlan)",
  "                logger << \" for operationplan \" << curOperationPlan;",
  "              if (curFlowPlan) logger << \" on \" << curFlowPlan->getDate();",
  "              logger << \"\\n\";",
  "            }",
  "            logger << indentlevel << \"Moving operationplan \"",
  "                   << candidate->getOperationPlan() << \" to start on \"",
  "                   << newdate.getEnd() << \" to move a transfer batch to \"",
  "                   << flpln_iter2->getDate() << \"\\n\";",
  "          }",
  "          addMoveStartDate(candidate->getOperationPlan(), newdate.getEnd());",
  "          candidate->getOperationPlan()->appendInfo(",
  "              \"Moved the start late to match material supply of \" +",
  "              candidate->getItem()->getName());",
  "        } else {",
  "          // We know the date where we need to move the operationplan to",
  "          Date newopplandate =",
  "              candidate->computeFlowToOperationDate(flpln_iter2->getDate());",
  "          if (getLogLevel() > 1) {",
  "            if (first_action) {",
  "              first_action = false;",
  "              logger << indentlevel << \"Forward propagation of buffer \" << buf;",
  "              if (curOperationPlan)",
  "                logger << \" for operationplan \" << curOperationPlan;",
  "              if (curFlowPlan) logger << \" on \" << curFlowPlan->getDate();",
  "              logger << \"\\n\";",
  "            }",
  "            logger << indentlevel << \"Moving operationplan \"",
  "                   << candidate->getOperationPlan() << \" to start on \"",
  "                   << newopplandate << \"\\n\";",
  "          }",
  "          addMoveStartDate(candidate->getOperationPlan(), newopplandate);",
  "          candidate->getOperationPlan()->appendInfo(",
  "              \"Moved the start late to match material supply of \" +",
  "              candidate->getItem()->getName());",
  "        }",
  "",
  "        // Propagate dependencies",
  "        for (auto d : candidate->getOperationPlan()->getDependencies()) {",
  "          if (candidate->getOperationPlan() != d->getFirst()) continue;",
  "          Date nd = d->getFirst()->getEnd();",
  "          if (d->getOperationDependency())",
  "            nd += d->getOperationDependency()->getHardSafetyLeadtime();",
  "          if (nd > d->getSecond()->getStart() &&",
  "              (d->getSecond()->getApproved() ||",
  "               d->getSecond()->getProposed())) {",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"Moving operationplan \" << d->getSecond()",
  "                     << \" late to start on \" << nd",
  "                     << \" to maintain dependencies\\n\";",
  "            addMoveStartDate(d->getSecond(), nd);",
  "            d->getSecond()->appendInfo(",
  "                \"Moved the start late to follow a predecessor\");",
  "            propagationList.insert(d->getSecond());",
  "          }",
  "        }",
  "",
  "        // Keep routing sequence correct",
  "        if (candidate->getOperationPlan()->getOwner() &&",
  "            candidate->getOperationPlan()",
  "                ->getOwner()",
  "                ->getOperation()",
  "                ->hasType<OperationRouting>()) {",
  "          OperationPlan* tmp = candidate->getOperationPlan();",
  "          OperationPlan* other = tmp->getNextSubOpplan();",
  "          auto hard_posttime =",
  "              static_cast<OperationRouting*>(tmp->getOwner()->getOperation())",
  "                  ->getHardPostTime();",
  "          auto posttime =",
  "              hard_posttime ? tmp->getOperation()->getPostTime() : Duration(0L);",
  "          while (other && (other->getApproved() || other->getProposed()) &&",
  "                 tmp->getEnd() + posttime > other->getStart()) {",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"Moving operationplan \" << other",
  "                     << \" late to start on \" << (tmp->getEnd() + posttime)",
  "                     << \" to keep the sequence in the routing\\n\";",
  "            addMoveStartDate(other, tmp->getEnd() + posttime);",
  "            other->appendInfo(\"Moved the start late to follow a predecessor\");",
  "            if (getPropagate()) propagationList.insert(other);",
  "            tmp = other;",
  "            other = tmp->getNextSubOpplan();",
  "            if (hard_posttime) posttime = tmp->getOperation()->getPostTime();",
  "          };",
  "        }",
  "",
  "        // Keep synchronised deliveries together",
  "        if (candidate->getOperationPlan()->getDemand() &&",
  "            candidate->getOperationPlan()->getDemand()->getOwner() &&",
  "            candidate->getOperationPlan()",
  "                ->getDemand()",
  "                ->getOwner()",
  "                ->hasType<DemandGroup>() &&",
  "            static_cast<DemandGroup*>(",
  "                candidate->getOperationPlan()->getDemand()->getOwner())",
  "                    ->getPolicy() != Demand::POLICY_INDEPENDENT) {",
  "          for (auto dmd = candidate->getOperationPlan()",
  "                              ->getDemand()",
  "                              ->getOwner()",
  "                              ->getMembers();",
  "               dmd != Demand::end(); ++dmd) {",
  "            for (auto dlvr : dmd->getDelivery()) {",
  "              if (dlvr != candidate->getOperationPlan() &&",
  "                  dlvr->getEnd() != candidate->getOperationPlan()->getEnd()) {",
  "                addMoveEndDate(dlvr, candidate->getOperationPlan()->getEnd());",
  "                dlvr->appendInfo(\"Moved to synchronize deliveries\");",
  "                if (getPropagate()) propagationList.insert(dlvr);",
  "              }",
  "            }",
  "          }",
  "        }",
  "      } else {",
  "        Date newopplandate =",
  "            candidate->computeFlowToOperationDate(flpln_iter2->getDate());",
  "        if (getLogLevel() > 1) {",
  "          if (first_action) {",
  "            first_action = false;",
  "            logger << indentlevel << \"Forward propagation of buffer \" << buf;",
  "            if (curOperationPlan)",
  "              logger << \" for operationplan \" << curOperationPlan;",
  "            if (curFlowPlan) logger << \" on \" << curFlowPlan->getDate();",
  "            logger << \"\\n\";",
  "          }",
  "          logger << indentlevel << \"Moving operationplan \"",
  "                 << candidate->getOperationPlan() << \" to end on \"",
  "                 << newopplandate << \"\\n\";",
  "        }",
  "        addMoveEndDate(candidate->getOperationPlan(), newopplandate);",
  "        candidate->getOperationPlan()->appendInfo(",
  "            \"Moved the end late to match material supply of \" +",
  "            candidate->getItem()->getName());",
  "",
  "        // Propagate dependencies",
  "        for (auto d : candidate->getOperationPlan()->getDependencies()) {",
  "          if (candidate->getOperationPlan() != d->getFirst()) continue;",
  "          Date nd = d->getFirst()->getEnd();",
  "          if (d->getOperationDependency())",
  "            nd += d->getOperationDependency()->getHardSafetyLeadtime();",
  "          if (nd > d->getSecond()->getStart() &&",
  "              (d->getSecond()->getApproved() ||",
  "               d->getSecond()->getProposed())) {",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"Moving operationplan \" << d->getSecond()",
  "                     << \" late to start on \" << nd",
  "                     << \" to maintain dependencies\\n\";",
  "            addMoveStartDate(d->getSecond(), nd);",
  "            d->getSecond()->appendInfo(",
  "                \"Moved the start late to follow a predecessor\");",
  "            propagationList.insert(d->getSecond());",
  "          }",
  "        }",
  "",
  "        // Keep routing sequence correct",
  "        if (candidate->getOperationPlan()->getOwner() &&",
  "            candidate->getOperationPlan()",
  "                ->getOwner()",
  "                ->getOperation()",
  "                ->hasType<OperationRouting>()) {",
  "          OperationPlan* tmp = candidate->getOperationPlan();",
  "          OperationPlan* other = tmp->getNextSubOpplan();",
  "          auto hard_posttime =",
  "              static_cast<OperationRouting*>(tmp->getOwner()->getOperation())",
  "                  ->getHardPostTime();",
  "          auto posttime =",
  "              hard_posttime ? tmp->getOperation()->getPostTime() : Duration(0L);",
  "          while (other && (other->getApproved() || other->getProposed()) &&",
  "                 tmp->getEnd() + posttime > other->getStart()) {",
  "            if (getLogLevel() > 1)",
  "              logger << indentlevel << \"Moving operationplan \" << other",
  "                     << \" late to start on \" << (tmp->getEnd() + posttime)",
  "                     << \" to keep the sequence in the routing\\n\";",
  "            addMoveStartDate(other, tmp->getEnd() + posttime);",
  "            other->appendInfo(\"Moved the start late to follow a predecessor\");",
  "            if (getPropagate()) propagationList.insert(other);",
  "            tmp = other;",
  "            other = tmp->getNextSubOpplan();",
  "            if (hard_posttime) posttime = tmp->getOperation()->getPostTime();",
  "          };",
  "        }",
  "",
  "        // Keep synchronised deliveries together",
  "        if (candidate->getOperationPlan()->getDemand() &&",
  "            candidate->getOperationPlan()->getDemand()->getOwner() &&",
  "            candidate->getOperationPlan()",
  "                ->getDemand()",
  "                ->getOwner()",
  "                ->hasType<DemandGroup>() &&",
  "            static_cast<DemandGroup*>(",
  "                candidate->getOperationPlan()->getDemand()->getOwner())",
  "                    ->getPolicy() != Demand::POLICY_INDEPENDENT) {",
  "          for (auto dmd = candidate->getOperationPlan()",
  "                              ->getDemand()",
  "                              ->getOwner()",
  "                              ->getMembers();",
  "               dmd != Demand::end(); ++dmd) {",
  "            for (auto dlvr : dmd->getDelivery()) {",
  "              if (dlvr != candidate->getOperationPlan() &&",
  "                  dlvr->getEnd() != candidate->getOperationPlan()->getEnd()) {",
  "                addMoveEndDate(dlvr, candidate->getOperationPlan()->getEnd());",
  "                dlvr->appendInfo(\"Moved to synchronize deliveries\");",
  "                if (getPropagate()) propagationList.insert(dlvr);",
  "              }",
  "            }",
  "          }",
  "        }",
  "      }",
  "      // Propagate the candidates postponement",
  "      if (getPropagate()) propagationList.insert(candidate->getOperationPlan());",
  "    }",
  "",
  "    if (++iterationcount >= MAX_LOOP) {",
  "      logger << indentlevel",
  "             << \"Error: Leaving buffer forward propagation loop on \" << buf",
  "             << \" after \" << MAX_LOOP << \" iterations\\n\";",
  "      break;",
  "    }",
  "  } while (!ok);",
  "",
  "  // Propagate all changes",
  "  while (!propagationList.empty()) {",
  "    auto cd = *propagationList.begin();",
  "    solve(cd, nullptr);",
  "    propagationList.erase(propagationList.begin());",
  "  }",
  "  --indentlevel;",
  "}",
  "",
  "bool OperatorForward::isValidCandidate(OperationPlan* opplan) const {",
  "  if (!getAcceptTabuCandidate()) {",
  "    auto t = tabu.find(opplan);",
  "    if (t != tabu.end()) return false;",
  "  }",
  "  return (opplan->getProposed() || opplan->getApproved()) &&",
  "         opplan->getEnd() != Date::infiniteFuture;",
  "};",
  "",
  "bool OperatorForward::compareCandidates(OperationPlan* opplan1,",
  "                                        OperationPlan* opplan2,",
  "                                        Date refDate) const {",
  "  // Selecting the current operation only as a last resort.",
  "  if (opplan1 == curOperationPlan || opplan1 == opplan2)",
  "    return true;",
  "  else if (opplan2 == curOperationPlan)",
  "    return false;",
  "  auto t1 = tabu.find(opplan1);",
  "  auto t2 = tabu.find(opplan2);",
  "",
  "  // If there are dependency links between both operationplans, we should move",
  "  // the successor first. Failing to do so can create vicious endless loops of",
  "  // moves.",
  "  // Check 1: walk downstream from opplan1",
  "  stack<OperationPlan*> deps;",
  "  deps.push(opplan1);",
  "  while (!deps.empty()) {",
  "    auto o = deps.top();",
  "    deps.pop();",
  "    if (o == opplan2) {",
  "      // Force moving the second one",
  "      return false;",
  "    }",
  "    for (auto e : o->getDependencies()) {",
  "      if (e->getFirst() == o) deps.push(e->getSecond());",
  "    }",
  "  }",
  "  // Check 2: walk upstream from opplan2",
  "  deps.push(opplan2);",
  "  while (!deps.empty()) {",
  "    auto o = deps.top();",
  "    deps.pop();",
  "    if (o == opplan1) {",
  "      // Force moving the first one",
  "      return true;",
  "    }",
  "    for (auto e : o->getDependencies()) {",
  "      if (e->getSecond() == o) deps.push(e->getFirst());",
  "    }",
  "  }",
  "",
  "  // First, easy criteria: tabu and start date",
  "  if (t1 != tabu.end() && t2 == tabu.end())",
  "    return true;",
  "  else if (t1 == tabu.end() && t2 != tabu.end())",
  "    return false;",
  "  else if (opplan1->getStart() != opplan2->getStart())",
  "    return opplan1->getStart() < opplan2->getStart();",
  "",
  "  // Second, complex criteria: delay and setup score.",
  "  // A low score indicates a good candidate.",
  "  double score1;",
  "  if (t1 != tabu.end())",
  "    score1 = (opplan1 == curOperationPlan) ? t1->second + 1000 : t1->second;",
  "  else if (opplan1 == curOperationPlan)",
  "    score1 = static_cast<double>(opplan1->getDelay()) / 86400 + 1000;",
  "  else",
  "    score1 = static_cast<double>(opplan1->getDelay()) / 86400;",
  "",
  "  double score2;",
  "  if (t2 != tabu.end())",
  "    score2 = (opplan2 == curOperationPlan) ? t2->second + 1000 : t2->second;",
  "  else if (opplan2 == curOperationPlan)",
  "    score2 = static_cast<double>(opplan2->getDelay()) / 86400 + 1000;",
  "  else",
  "    score2 = static_cast<double>(opplan2->getDelay()) / 86400;",
  "",
  "  // Adjust the scores for the impact on the setup time",
  "  // We only want to favor keeping in place operationplans that have require no",
  "  // setup cost or setup duration. We don't want to interfere with about the",
  "  // sequence, eg by favoring short setups.",
  "  if (!SetupMatrix::empty() && refDate) {",
  "    // opplan1->updateSetupTime();",
  "    // opplan2->updateSetupTime();",
  "    static PooledString emptystring;",
  "    for (auto ldpln1 = opplan1->beginLoadPlans();",
  "         ldpln1 != opplan1->endLoadPlans(); ++ldpln1) {",
  "      if (ldpln1->getQuantity() >= 0.0 || !ldpln1->getLoad() ||",
  "          ldpln1->getLoad()->getSetup().empty() ||",
  "          !ldpln1->getResource()->getSetupMatrix())",
  "        continue;",
  "      auto setupbefore1 = ldpln1->getResource()->getSetupAt(refDate, opplan1);",
  "      auto setuprule1 = ldpln1->getResource()->getSetupMatrix()->calculateSetup(",
  "          setupbefore1 ? setupbefore1->getSetup() : emptystring,",
  "          ldpln1->getLoad() ? ldpln1->getLoad()->getSetup()",
  "                            : PooledString::emptystring,",
  "          ldpln1->getResource());",
  "      if (setuprule1) {",
  "        // Bad choice if the changeover takes time or costs money",
  "        if (setuprule1->getCost()) score1 -= 1000;",
  "        if (setuprule1->getDuration() > Duration(0L)) score1 -= 500;",
  "      } else",
  "        // Oh dear, no changeover possible. Please move this candidate!",
  "        score1 += 10000;",
  "    }",
  "    for (auto ldpln2 = opplan2->beginLoadPlans();",
  "         ldpln2 != opplan1->endLoadPlans(); ++ldpln2) {",
  "      if (ldpln2->getQuantity() >= 0.0 || !ldpln2->getLoad() ||",
  "          ldpln2->getLoad()->getSetup().empty() ||",
  "          !ldpln2->getResource()->getSetupMatrix())",
  "        continue;",
  "      auto setupbefore2 = ldpln2->getResource()->getSetupAt(refDate, opplan2);",
  "      auto setuprule2 = ldpln2->getResource()->getSetupMatrix()->calculateSetup(",
  "          setupbefore2 ? setupbefore2->getSetup() : emptystring,",
  "          ldpln2->getLoad() ? ldpln2->getLoad()->getSetup()",
  "                            : PooledString::emptystring,",
  "          ldpln2->getResource());",
  "      if (setuprule2) {",
  "        // Bad choice if the changeover takes time or costs money",
  "        if (setuprule2->getCost()) score2 -= 1000;",
  "        if (setuprule2->getDuration() > Duration(0L)) score2 -= 500;",
  "      } else",
  "        // Oh dear, no changeover possible. Please move this candidate!",
  "        score2 += 10000;",
  "    }",
  "  }",
  "",
  "  // Final result:",
  "  if (fabs(score1 - score2) > ROUNDING_ERROR)",
  "    return score1 < score2;",
  "  else",
  "    return *opplan1 < *opplan2;",
  "}",
  "",
  "}  // namespace frepple",
];
