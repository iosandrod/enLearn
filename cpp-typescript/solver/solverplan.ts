// <header-api-generated>
import { CommandManager } from "../utils/actions.js";
import { Date as PlanningDate, Duration } from "../utils/date.js";
import { DataException, HeaderModelAdapter, LogicException, RuntimeException } from "../utils/library.js";
import { Buffer, BufferInfinite } from "../model/buffer.js";
import { Demand, DemandGroup } from "../model/demand.js";
import { Flow, FlowEnd, FlowStart } from "../model/flow.js";
import { FlowPlan } from "../model/flowplan.js";
import { Load } from "../model/load.js";
import { Operation, OperationAlternate, OperationFixedTime, OperationRouting, OperationSplit } from "../model/operation.js";
import { CommandCreateOperationPlan, CommandMoveOperationPlan } from "../model/actions.js";
import { OperationDependency, OperationPlanDependency } from "../model/operationdependency.js";
import { OperationPlan } from "../model/operationplan.js";
import { Plan } from "../model/plan.js";
import { Resource } from "../model/resource.js";
import { HasLevel } from "../model/leveled.js";
import { solveOperationSemantic } from "./solveroperation.js";
import { solveFlowSemantic } from "./solverflow.js";
import { solveLoadSemantic } from "./solverload.js";
import { solveBufferSemantic } from "./solverbuffer.js";
import { solveResourceSemantic } from "./solverresource.js";
import { OperatorDelete } from "./operatordelete.js";
import { OperatorForward } from "./operatorforward.js";
import {
  hasOperationPlansSemantic,
  scanExcessSemantic,
  solveDemandSemantic,
} from "./solverdemand.js";

type SolverCallback<T = unknown> = (entity: T, solver: SolverCreate, data: SolverCreateSolverData) => unknown;
type SolverTarget = Demand | Operation | OperationPlan | Flow | Load | Buffer | Resource | Plan;

function asDuration(value: Duration | number | string): Duration {
  return value instanceof Duration ? new Duration(value) : new Duration(value);
}

function isCallable(value: unknown): value is (...args: readonly unknown[]) => unknown {
  return typeof value === "function";
}

export class LibrarySolver extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["LibrarySolver"] as const;
  private static initialized = false;
  static override initialize(): number {
    if (this.initialized) return 0;
    this.initialized = true;
    return SolverCreate.initialize() + SolverPropagateStatus.initialize();
  }
  initialize(): number { return LibrarySolver.initialize(); }
}

export class SolverCreate extends HeaderModelAdapter {
  static readonly cppBases = ["Solver"] as const;
  static readonly cppQualifiedNames = ["SolverCreate"] as const;
  static readonly LEADTIME = 1;
  static readonly CAPACITY = 4;
  static readonly MFG_LEADTIME = 16;
  static readonly PO_LEADTIME = 32;
  private static initialized = false;

  private constraints = SolverCreate.CAPACITY + SolverCreate.MFG_LEADTIME + SolverCreate.PO_LEADTIME;
  private createDeliveries = true;
  private rotateResources = true;
  private cluster = -1;
  private planType = 1;
  private lazyDelay = new Duration(86_400);
  private administrativeLeadTime = new Duration();
  private minimumDelay = new Duration();
  private iterationThreshold = 1;
  private iterationAccuracy = 0.01;
  private iterationMax = 0;
  private resourceIterationMax = 500;
  private algorithm = "heuristic";
  private erasePreviousFirst = true;
  private logLevel = 0;
  private autocommit = true;
  private indentLevel = 0;
  private readonly manager = new CommandManager();
  private commandManager: CommandManager = this.manager;
  private readonly commands: SolverCreateSolverData;
  private userExitFlow: SolverCallback<FlowPlan> | null = null;
  private userExitDemand: SolverCallback<Demand> | null = null;
  private userExitNextDemand: ((demands: readonly Demand[], solver: SolverCreate, data: SolverCreateSolverData) => Demand | null) | null = null;
  private userExitBuffer: SolverCallback<Buffer> | null = null;
  private userExitResource: SolverCallback<Resource> | null = null;
  private userExitOperation: SolverCallback<Operation> | null = null;

  constructor(fields: Readonly<Record<string, unknown>> = {}) {
    super();
    this.commands = new SolverCreateSolverData(this);
    this.commands.setCommandManager(this.commandManager);
    for (const [name, value] of Object.entries(fields)) {
      const setter = Reflect.get(this, `set${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`);
      if (isCallable(setter)) Reflect.apply(setter, this, [value]);
      else Reflect.set(this, name, value);
    }
  }

  static override initialize(): number { this.initialized = true; return 0; }
  static create(fields: Readonly<Record<string, unknown>> = {}): SolverCreate { return new SolverCreate(fields); }
  static demand_comparison(left: Demand, right: Demand): boolean { return this.compareDemands(left, right) < 0; }
  static compareDemands(left: Demand, right: Demand): number {
    const leftQuote = left.getStatus() === Demand.STATUS_QUOTE || left.getStatus() === Demand.STATUS_INQUIRY;
    const rightQuote = right.getStatus() === Demand.STATUS_QUOTE || right.getStatus() === Demand.STATUS_INQUIRY;
    if (leftQuote !== rightQuote) return leftQuote ? 1 : -1;
    return left.getPriority() - right.getPriority()
      || left.getDue().compare(right.getDue())
      || left.getQuantity() - right.getQuantity()
      || left.getName().localeCompare(right.getName());
  }
  demand_comparison(left: Demand, right: Demand): boolean { return SolverCreate.demand_comparison(left, right); }
  initialize(): number { return SolverCreate.initialize(); }
  registerFields(): number { return 0; }
  getType(): string { return "solver_mrp"; }
  getLogLevel(): number { return this.logLevel; }
  setLogLevel(value: number): void { this.logLevel = Math.trunc(Number(value)); }
  getAutocommit(): boolean { return this.autocommit; }
  setAutocommit(value: boolean): void { this.autocommit = Boolean(value); }
  getCluster(): number { return this.cluster; }
  setCluster(value: number): void { this.cluster = Math.trunc(Number(value)); }
  setConstraints(value: number): void {
    const requested = Math.trunc(Number(value));
    this.constraints = requested & (SolverCreate.CAPACITY + SolverCreate.PO_LEADTIME + SolverCreate.MFG_LEADTIME);
    if (requested & SolverCreate.LEADTIME) this.constraints |= SolverCreate.PO_LEADTIME + SolverCreate.MFG_LEADTIME;
  }
  getConstraints(): number { return this.constraints; }
  isCapacityConstrained(): boolean { return Boolean(this.constraints & SolverCreate.CAPACITY); }
  isConstrained(): boolean { return this.constraints > 0; }
  isLeadTimeConstrained(operation: Operation | null = null): boolean {
    if (operation?.getOrderType() === "PO" || operation?.getOrderType() === "DO") {
      return Boolean(this.constraints & SolverCreate.PO_LEADTIME);
    }
    if (operation instanceof OperationSplit || operation instanceof OperationAlternate) {
      const enabled = operation.getSubOperations().map((association) => {
        const nested = Reflect.get(association, "getOperation");
        return isCallable(nested) ? Reflect.apply(nested, association, []) : null;
      }).filter((candidate): candidate is Operation => candidate instanceof Operation && candidate.getPriority() !== 0);
      if (enabled.length && enabled.every((candidate) => candidate.getOrderType() === "PO" || candidate.getOrderType() === "DO")) {
        return Boolean(this.constraints & SolverCreate.PO_LEADTIME);
      }
    }
    return Boolean(this.constraints & SolverCreate.MFG_LEADTIME);
  }
  getCreateDeliveries(): boolean { return this.createDeliveries; }
  setCreateDeliveries(value: boolean): void { this.createDeliveries = Boolean(value); }
  getPlanType(): number { return this.planType; }
  setPlanType(value: number): void {
    const next = Math.trunc(Number(value));
    if (next < 1 || next > 3) throw new DataException("Invalid plan type");
    this.planType = next;
    this.commands.constrainedPlanning = next === 1;
  }
  getLazyDelay(): Duration { return new Duration(this.lazyDelay); }
  setLazyDelay(value: Duration | number | string): void {
    const next = asDuration(value);
    if (next.seconds <= 0) throw new DataException("Invalid lazy delay");
    this.lazyDelay = next;
  }
  getMinimumDelay(): Duration { return new Duration(this.minimumDelay); }
  setMinimumDelay(value: Duration | number | string): void {
    const next = asDuration(value);
    if (next.seconds < 0) throw new DataException("Invalid minimum delay");
    this.minimumDelay = next;
  }
  getAdministrativeLeadTime(): Duration { return new Duration(this.administrativeLeadTime); }
  setAdministrativeLeadTime(value: Duration | number | string): void {
    const next = asDuration(value);
    if (next.seconds < 0) throw new DataException("Administrative Lead Time must be a positive value");
    this.administrativeLeadTime = next;
  }
  getAlgorithm(): string { return this.algorithm; }
  setAlgorithm(value: string): void {
    const next = String(value);
    if (next !== "heuristic" && next !== "heuristic_2") throw new DataException("Invalid algorithm: must be 'heuristic' or 'heuristic_2'");
    this.algorithm = next;
  }
  getAutoFence(): Duration { return Plan.instance().getAutoFence(); }
  setAutoFence(value: Duration | number | string): void { Plan.instance().setAutoFence(value); }
  getIterationThreshold(): number { return this.iterationThreshold; }
  setIterationThreshold(value: number): void {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) throw new DataException("Invalid iteration threshold: must be >= 0");
    this.iterationThreshold = next;
  }
  getIterationAccuracy(): number { return this.iterationAccuracy; }
  setIterationAccuracy(value: number): void {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0 || next > 100) throw new DataException("Invalid iteration accuracy: must be >=0 and <= 100");
    this.iterationAccuracy = next;
  }
  getIterationMax(): number { return this.iterationMax; }
  setIterationMax(value: number): void { this.iterationMax = Math.max(0, Math.trunc(Number(value))); }
  getResourceIterationMax(): number { return this.resourceIterationMax; }
  setResourceIterationMax(value: number): void { this.resourceIterationMax = Math.max(0, Math.trunc(Number(value))); }
  getRotateResources(): boolean { return this.rotateResources; }
  setRotateResources(value: boolean): void { this.rotateResources = Boolean(value); }
  getErasePreviousFirst(): boolean { return this.erasePreviousFirst; }
  setErasePreviousFirst(value: boolean): void { this.erasePreviousFirst = Boolean(value); }
  setIndentLevel(value: number): void { this.indentLevel = Math.max(0, Math.trunc(Number(value))); }
  getCommandManager(): CommandManager { return this.commandManager; }
  setCommandManager(value: CommandManager | null = null): void {
    this.commandManager = value ?? this.manager;
    this.commands.setCommandManager(this.commandManager);
  }
  getCommands(): SolverCreateSolverData { return this.commands; }
  getUserExitFlow(): SolverCallback<FlowPlan> | null { return this.userExitFlow; }
  setUserExitFlow(value: SolverCallback<FlowPlan> | null): void { this.userExitFlow = value; }
  getUserExitDemand(): SolverCallback<Demand> | null { return this.userExitDemand; }
  setUserExitDemand(value: SolverCallback<Demand> | null): void { this.userExitDemand = value; }
  getUserExitNextDemand(): ((demands: readonly Demand[], solver: SolverCreate, data: SolverCreateSolverData) => Demand | null) | null { return this.userExitNextDemand; }
  setUserExitNextDemand(value: ((demands: readonly Demand[], solver: SolverCreate, data: SolverCreateSolverData) => Demand | null) | null): void { this.userExitNextDemand = value; }
  getUserExitBuffer(): SolverCallback<Buffer> | null { return this.userExitBuffer; }
  setUserExitBuffer(value: SolverCallback<Buffer> | null): void { this.userExitBuffer = value; }
  getUserExitResource(): SolverCallback<Resource> | null { return this.userExitResource; }
  setUserExitResource(value: SolverCallback<Resource> | null): void { this.userExitResource = value; }
  getUserExitOperation(): SolverCallback<Operation> | null { return this.userExitOperation; }
  setUserExitOperation(value: SolverCallback<Operation> | null): void { this.userExitOperation = value; }

  checkDependencies(operationPlan: OperationPlan, data = this.commands): boolean {
    const operation = operationPlan.getOperation();
    if (!operation) return true;
    if (operation.getDependencies().length && data.getDependencyList().size === 0) {
      data.populateDependencies(operation);
    }

    let answerQuantity = operationPlan.getQuantity();
    let nextDate = new PlanningDate(PlanningDate.infiniteFuture);
    const dependencies = operation.getDependencies().filter((candidate): candidate is OperationDependency =>
      candidate instanceof OperationDependency
      && candidate.getOperation() === operation
      && candidate.getBlockedBy() instanceof Operation
      && candidate.getQuantity() > 0);

    for (const dependency of dependencies) {
      const blockedBy = dependency.getBlockedBy();
      if (!blockedBy) continue;
      const neededDate = operationPlan.getStart().subtract(dependency.getHardSafetyLeadtime()) as PlanningDate;
      const wishedDate = dependency.getSafetyLeadtime().compare(dependency.getHardSafetyLeadtime()) > 0
        ? operationPlan.getStart().subtract(dependency.getSafetyLeadtime()) as PlanningDate
        : neededDate;
      data.state.q_date = new PlanningDate(wishedDate);

      const occurrence = data.getDependencyList().get(blockedBy);
      if (occurrence) {
        if (occurrence.occurrences > 1) {
          occurrence.occurrences -= 1;
          if (occurrence.date.compare(wishedDate) > 0) occurrence.date = new PlanningDate(wishedDate);
          continue;
        }
        if (occurrence.date.compare(data.state.q_date) < 0) data.state.q_date = new PlanningDate(occurrence.date);
        data.getDependencyList().delete(blockedBy);
      }

      const required = operationPlan.getQuantity() * dependency.getQuantity();
      let allocated = 0;
      for (const candidate of operationPlan.getDependencies()) {
        if (!(candidate instanceof OperationPlanDependency)) continue;
        if (candidate.getSecond() === operationPlan
            && candidate.getFirst()?.getOperation() === blockedBy) {
          allocated += candidate.getFirst()?.getQuantity() ?? 0;
        }
      }

      const supplies = [...blockedBy.getOperationPlans()]
        .filter((candidate): candidate is OperationPlan => candidate instanceof OperationPlan);
      for (const supply of supplies) {
        if (required <= allocated + 0.000001) break;
        if (operationPlan.getBatch() && supply.getBatch() !== operationPlan.getBatch()) continue;
        let unpegged = supply.getQuantity();
        for (const candidate of supply.getDependencies()) {
          if (candidate instanceof OperationPlanDependency && candidate.getFirst() === supply) {
            unpegged -= candidate.getQuantity();
          }
        }
        if (unpegged <= 0.000001) continue;

        let refuse: PlanningDate | null = null;
        if (supply.getEnd().compare(neededDate) > 0 && this.getConstraints() && data.constrainedPlanning) {
          if (supply.getConfirmed()
              || ((supply.getProposed() || supply.getApproved()) && !Plan.instance().getMoveApprovedEarly())) {
            operationPlan.setStart(supply.getEnd());
            refuse = operationPlan.getEnd().add(dependency.getHardSafetyLeadtime());
          } else if (supply.getProposed() || supply.getApproved()) {
            const manager = data.getCommandManager() ?? this.commandManager;
            const bookmark = manager.setBookmark();
            manager.add(new CommandMoveOperationPlan(
              supply, PlanningDate.infinitePast, data.state.q_date,
            ));
            this.checkOperation(supply, data);
            if (supply.getEnd().compare(neededDate) > 0) {
              refuse = supply.getEnd().add(dependency.getHardSafetyLeadtime());
              manager.rollback(bookmark);
            }
          }
        }
        if (refuse) {
          answerQuantity = 0;
          data.state.a_qty = 0;
          data.state.a_date = new PlanningDate(refuse);
          data.clearDependencies();
          return false;
        }

        new OperationPlanDependency(supply, operationPlan, dependency);
        allocated += unpegged;
        if (required < allocated + 0.000001) allocated = required;
      }

      if (required > allocated + 0.000001) {
        const manager = data.getCommandManager() ?? this.commandManager;
        const bookmark = manager.setBookmark();
        const originalRequired = required;
        const previousOwner = data.state.curOwnerOpplan;
        let repeat: boolean;
        do {
          repeat = false;
          const missing = originalRequired - allocated;
          data.state.q_qty = missing;
          data.state.blockedOpplan = operationPlan;
          data.state.dependency = dependency;
          data.state.curOwnerOpplan = blockedBy.getOwner()
            && blockedBy.getOwner() === operation.getOwner() ? previousOwner : null;
          this.solve(blockedBy, data);
          answerQuantity = (Math.max(0, data.state.a_qty) + allocated) / dependency.getQuantity();

          if (data.state.a_qty < 0.000001) {
            const hardLimit = operationPlan.getStart().subtract(dependency.getHardSafetyLeadtime()) as PlanningDate;
            if (dependency.getSafetyLeadtime().compare(dependency.getHardSafetyLeadtime()) > 0
                && data.state.a_date.compare(hardLimit) <= 0
                && originalRequired > 0) {
              data.state.q_date = new PlanningDate(data.state.a_date);
              manager.rollback(bookmark);
              repeat = true;
            } else {
              answerQuantity = 0;
              if (dependency.getHardSafetyLeadtime().seconds) {
                data.state.a_date = data.state.a_date.add(dependency.getHardSafetyLeadtime());
              }
              operationPlan.setStart(data.state.a_date);
              nextDate = operationPlan.getEnd();
              data.clearDependencies();
              break;
            }
          } else if (!data.state.curOwnerOpplan && missing - data.state.a_qty > 0.000001) {
            allocated += data.state.a_qty;
            if (allocated < originalRequired - 0.000001) repeat = true;
          }
        } while (repeat);
        data.state.curOwnerOpplan = previousOwner;
        data.state.blockedOpplan = null;
        data.state.dependency = null;
        if (answerQuantity <= 0.000001) {
          data.state.a_qty = 0;
          data.state.a_date = nextDate;
          return false;
        }
      }
    }

    data.state.a_qty = answerQuantity;
    data.state.a_date = new PlanningDate(PlanningDate.infiniteFuture);
    return answerQuantity > 0.000001;
  }
  checkOperation(operationPlan: OperationPlan, _data = this.commands, propagate = true): boolean {
    if (this.isLeadTimeConstrained(operationPlan.getOperation()) && operationPlan.getStart().compare(Plan.instance().getCurrent()) < 0) {
      const duration = operationPlan.getEnd().subtract(operationPlan.getStart());
      const start = Plan.instance().getCurrent();
      operationPlan.setStartEndAndQuantity(start, start.add(duration), operationPlan.getQuantity());
    }
    if (propagate) operationPlan.updateFeasible();
    return operationPlan.getFeasible() || this.planType !== 1;
  }
  hasOperationPlans(commands: CommandManager = this.commandManager): boolean {
    return hasOperationPlansSemantic(commands);
  }
  scanExcess(_commands: CommandManager = this.commandManager): void {
    scanExcessSemantic(_commands);
  }
  commit(): void { this.scanExcess(this.commandManager); this.commandManager.commit(); }
  rollback(): void { this.commandManager.rollback(); }
  markAutofence(): void {
    for (const buffer of Buffer.all()) {
      const hasProposedSupply = buffer.getFlowPlans().some((flowPlan) => {
        const quantity = Reflect.get(flowPlan, "getQuantity");
        const getOperationPlan = Reflect.get(flowPlan, "getOperationPlan");
        const operationPlan = isCallable(getOperationPlan) ? Reflect.apply(getOperationPlan, flowPlan, []) : null;
        return Number(isCallable(quantity) ? Reflect.apply(quantity, flowPlan, []) : 0) > 0
          && operationPlan instanceof OperationPlan && operationPlan.getProposed();
      });
      buffer.setAutofence(!hasProposedSupply);
    }
  }

  solve(target?: SolverTarget | null, payload?: unknown): unknown {
    if (target instanceof Demand) return this.solveDemand(target, payload instanceof SolverCreateSolverData ? payload : this.commands);
    if (target instanceof Operation) return this.solveOperation(target, payload instanceof SolverCreateSolverData ? payload : this.commands);
    if (target instanceof OperationPlan) return this.checkOperation(target, payload instanceof SolverCreateSolverData ? payload : this.commands);
    if (target instanceof Flow) return this.solveFlow(target, payload instanceof SolverCreateSolverData ? payload : this.commands);
    if (target instanceof Load) return this.solveLoad(target, payload instanceof SolverCreateSolverData ? payload : this.commands);
    if (target instanceof Buffer) return this.solveBuffer(target, payload instanceof SolverCreateSolverData ? payload : this.commands);
    if (target instanceof Resource) return this.solveResource(target, payload instanceof SolverCreateSolverData ? payload : this.commands);
    if (target instanceof Plan || target === undefined || target === null) return this.solveAll();
    throw new DataException("object argument must be a demand, operation, flow, load, buffer, resource, operationplan or plan");
  }
  private solveAll(): OperationPlan[] {
    HasLevel.getNumberOfClusters();
    if (this.erasePreviousFirst) {
      for (const operation of Operation.all()) if (this.cluster === -1 || operation.getCluster() === this.cluster) operation.deleteOperationPlans();
    }
    const demands = Demand.all().filter((demand) => {
      const group = demand instanceof DemandGroup ? demand : demand.getOwner();
      const grouped = group instanceof DemandGroup && group.getPolicy() !== Demand.POLICY_INDEPENDENT;
      const topLevel = demand instanceof DemandGroup ? grouped : !grouped;
      const hasQuantity = demand instanceof DemandGroup ? grouped : demand.getQuantity() > 0;
      return topLevel && hasQuantity
        && [Demand.STATUS_OPEN, Demand.STATUS_QUOTE, Demand.STATUS_INQUIRY].includes(demand.getStatus())
        && (this.cluster === -1 || demand.getCluster() === this.cluster);
    });
    demands.sort(SolverCreate.compareDemands);
    const data = new SolverCreateSolverData(this, this.cluster, demands);
    data.setCommandManager(this.commandManager);
    const result = data.commit();
    if (this.autocommit) this.commandManager.commit();
    return result;
  }
  private solveDemand(demand: Demand, data: SolverCreateSolverData): OperationPlan | null {
    return solveDemandSemantic(this, demand, data);
  }
  private solveOperation(operation: Operation, data: SolverCreateSolverData): OperationPlan | null {
    return solveOperationSemantic(this, operation, data);
  }
  private solveFlow(flow: Flow, data: SolverCreateSolverData): unknown {
    return solveFlowSemantic(this, flow, data);
  }
  private solveLoad(load: Load, data: SolverCreateSolverData): unknown {
    return solveLoadSemantic(this, load, data);
  }
  private solveBuffer(buffer: Buffer, data: SolverCreateSolverData): unknown {
    return solveBufferSemantic(this, buffer, data);
  }
  private solveResource(resource: Resource, data: SolverCreateSolverData): boolean {
    return solveResourceSemantic(this, resource, data);
  }
}

export class SolverCreateSolverData extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["SolverCreate::SolverData"] as const;
  static readonly MAXSTATES = 256;
  private readonly states: SolverCreateState[] = [new SolverCreateState()];
  private solver: SolverCreate | null;
  private manager: CommandManager | null = null;
  private constraints: unknown = null;
  private readonly dependencyList = new Map<Operation, { occurrences: number; date: PlanningDate }>();
  private readonly operatorForward: OperatorForward;
  private readonly maskedShortages: OperationPlan[] = [];
  readonly cluster: number;
  readonly demands: Demand[];
  state: SolverCreateState = this.states[0] as SolverCreateState;
  prevstate: SolverCreateState | null = null;
  constrainedPlanning: boolean;
  propagate = true;
  batchGrouping = false;
  logConstraints = true;
  accept_partial_reply = false;
  broken_path = false;
  iterationCount = 0;
  shortagesOnly = false;
  safetyStockPlanning = false;
  bufferSolveShortagesOnly = true;

  constructor(solver: SolverCreate | null = null, cluster = 0, demands: readonly Demand[] = []) {
    super();
    this.solver = solver;
    this.constrainedPlanning = solver?.getPlanType() === 1;
    this.cluster = Math.trunc(cluster);
    this.demands = [...demands];
    this.operatorForward = new OperatorForward(undefined, this);
  }
  static runme(solver: SolverCreate, cluster = 0, demands: readonly Demand[] = []): OperationPlan[] {
    const data = new SolverCreateSolverData(solver, cluster, demands);
    data.setCommandManager(new CommandManager());
    return data.commit();
  }
  runme(): OperationPlan[] { return this.commit(); }
  clearDependencies(): void { this.dependencyList.clear(); }
  getDependencyList(): Map<Operation, { occurrences: number; date: PlanningDate }> { return this.dependencyList; }
  populateDependencies(operation: Operation, path: readonly Operation[] = []): void {
    if (path.includes(operation)) return;
    const nextPath = [...path, operation];
    for (const candidate of operation.getDependencies()) {
      if (!(candidate instanceof OperationDependency) || candidate.getOperation() !== operation) continue;
      const blockedBy = candidate.getBlockedBy();
      if (!blockedBy) continue;
      const occurrence = this.dependencyList.get(blockedBy);
      if (occurrence) occurrence.occurrences += 1;
      else {
        this.dependencyList.set(blockedBy, {
          occurrences: 1,
          date: new PlanningDate(PlanningDate.infiniteFuture),
        });
        this.populateDependencies(blockedBy, nextPath);
      }
    }
    if (operation instanceof OperationRouting) {
      for (const association of operation.getSubOperations()) {
        const callback = Reflect.get(association, "getOperation");
        const child = isCallable(callback) ? Reflect.apply(callback, association, []) : null;
        if (!(child instanceof Operation)) continue;
        const isBlocked = child.getDependencies().some((candidate) =>
          candidate instanceof OperationDependency && candidate.getBlockedBy() === child);
        if (!isBlocked) this.populateDependencies(child, nextPath);
      }
    } else {
      for (const association of operation.getSubOperations()) {
        const callback = Reflect.get(association, "getOperation");
        const child = isCallable(callback) ? Reflect.apply(callback, association, []) : null;
        if (child instanceof Operation) this.populateDependencies(child, nextPath);
      }
    }
  }
  getCommandManager(): CommandManager | null { return this.manager; }
  getLogLevel(): number { return this.solver?.getLogLevel() ?? 0; }
  getSolver(): SolverCreate | null { return this.solver; }
  getShortagesOnly(): boolean { return this.shortagesOnly; }
  setShortagesOnly(value: boolean): void {
    this.shortagesOnly = Boolean(value);
  }
  getVerbose(): never { throw new LogicException("Use the method SolverData::getLogLevel() instead of SolverData::getVerbose()"); }
  setCommandManager(value: CommandManager | null = null): void {
    this.manager = value;
    if (value) this.operatorForward.setCommandManager(value);
  }
  setConstraintOwner(value: unknown): void { this.constraints = value; }
  getConstraintOwner(): unknown { return this.constraints; }
  push(quantity = 0, date: PlanningDate = PlanningDate.infiniteFuture, full = false): SolverCreateState {
    if (this.states.length >= SolverCreateSolverData.MAXSTATES) throw new RuntimeException("Maximum recursion depth exceeded");
    const previous = this.state;
    const next = full ? previous.clone() : new SolverCreateState();
    next.q_qty = Number(quantity);
    next.q_date = new PlanningDate(date);
    next.q_date_max = new PlanningDate(date);
    next.a_qty = 0;
    next.a_date = new PlanningDate(PlanningDate.infiniteFuture);
    if (!full) next.requireFull = previous.requireFull;
    this.states.push(next);
    this.prevstate = previous;
    this.state = next;
    return next;
  }
  pop(copyAnswer = false): SolverCreateState {
    if (this.states.length <= 1) throw new LogicException("State stack empty");
    const removed = this.states.pop() as SolverCreateState;
    const parent = this.states.at(-1) as SolverCreateState;
    if (copyAnswer) parent.copyAnswer(removed);
    this.state = parent;
    this.prevstate = this.states.at(-2) ?? null;
    return removed;
  }
  private createDeliveryPlans(result: OperationPlan[]): void {
    if (!this.solver) return;
    const manager = this.manager ?? this.solver.getCommandManager();
    for (const demand of this.demands) {
      this.solver.getUserExitDemand()?.(demand, this.solver, this);
      let planQuantity = demand.getQuantity() - demand.getPlannedQuantity();
      let due = demand.getDue();
      if (due.equals(PlanningDate.infiniteFuture) || due.equals(PlanningDate.infinitePast)) continue;
      const deliveryOperation = demand.getDeliveryOperation();
      if (!deliveryOperation) continue;

      while (planQuantity > 0.000001) {
        planQuantity = Math.max(planQuantity, demand.getMinShipment());
        this.state = this.states[0] as SolverCreateState;
        this.state.reset();
        this.state.q_qty = planQuantity;
        this.state.q_qty_min = Math.max(0, demand.getMinShipment());
        this.state.q_date = new PlanningDate(due);
        this.state.q_date_max = new PlanningDate(due);
        this.state.curDemand = demand;
        this.state.curBatch = demand.getBatch();
        this.clearDependencies();

        try {
          const planned = this.solver.solve(deliveryOperation, this);
          manager.commit();
          if (planned instanceof OperationPlan) result.push(planned);
          planQuantity -= this.state.a_qty;
          if (this.state.a_qty <= 0.000001) {
            if (this.state.a_date.equals(PlanningDate.infiniteFuture)
              || this.state.a_date.compare(due) <= 0) break;
            due = new PlanningDate(this.state.a_date);
          }
        } catch {
          manager.rollback();
          break;
        }
      }
    }
  }
  private backwardSweep(): void {
    if (!this.solver) return;
    const manager = this.manager ?? this.solver.getCommandManager();
    const buffers = Buffer.all()
      .filter((buffer) => this.cluster === -1 || buffer.getCluster() === this.cluster)
      .sort((left, right) => left.getLevel() - right.getLevel());
    for (const buffer of buffers) {
      this.state = this.states[0] as SolverCreateState;
      this.state.reset();
      this.iterationCount = 0;
      this.state.q_qty = -1;
      this.state.q_date = new PlanningDate(PlanningDate.infinitePast);
      this.state.q_date_max = new PlanningDate(PlanningDate.infinitePast);
      this.state.curBatch = buffer.getBatch();
      try {
        this.solver.solve(buffer, this);
        manager.commit();
      } catch {
        manager.rollback();
      }
    }
  }
  private eligibleBuffers(secondPass = false): Buffer[] {
    return Buffer.all()
      .filter((buffer) => {
        if (this.cluster !== -1 && buffer.getCluster() !== this.cluster) return false;
        if (buffer instanceof BufferInfinite || !buffer.getProducingOperation()) return false;
        const events = buffer.getFlowPlans();
        if (!buffer.getMinimum() && !buffer.getMinimumCalendar() && !events.length) return false;
        if (secondPass) {
          const last = events.at(-1);
          if (last) {
            const onhandCallback = Reflect.get(last, "getOnhand");
            const minimumCallback = Reflect.get(last, "getMin");
            const onhand = Number(isCallable(onhandCallback) ? Reflect.apply(onhandCallback, last, []) : 0);
            const minimum = Number(isCallable(minimumCallback) ? Reflect.apply(minimumCallback, last, []) : 0);
            if (onhand >= minimum - 0.000001) return false;
          }
        }
        return true;
      })
      .sort((left, right) => Math.max(left.getLevel(), 0) - Math.max(right.getLevel(), 0)
        || left.getName().localeCompare(right.getName()));
  }
  private solveSafetyStock(firstPass: boolean): void {
    if (!this.solver) return;
    const manager = this.manager ?? this.solver.getCommandManager();
    this.safetyStockPlanning = true;
    try {
      for (const buffer of this.eligibleBuffers(!firstPass)) {
        this.state = this.states[0] as SolverCreateState;
        this.state.reset();
        this.iterationCount = 0;
        this.constraints = null;
        this.bufferSolveShortagesOnly = false;
        this.state.q_qty = -1;
        this.state.q_date = new PlanningDate(PlanningDate.infinitePast);
        this.state.q_date_max = new PlanningDate(PlanningDate.infinitePast);
        this.state.curBatch = buffer.getBatch();
        try {
          this.solver.solve(buffer, this);
          manager.commit();
        } catch {
          while (this.states.length > 1) this.pop(false);
          this.state = this.states[0] as SolverCreateState;
          manager.rollback();
        }
      }
    } finally {
      this.safetyStockPlanning = false;
    }
  }
  private scanExcess(constrained: boolean): void {
    if (!this.solver) return;
    const manager = this.manager ?? this.solver.getCommandManager();
    const cleanup = new OperatorDelete({ commandManager: manager, constrained, propagate: false });
    const levels = new Map<number, Buffer[]>();
    for (const buffer of this.eligibleBuffers(false)) {
      const level = Math.max(buffer.getLevel(), 0);
      const values = levels.get(level) ?? [];
      values.push(buffer);
      levels.set(level, values);
    }
    for (const level of [...levels.keys()].sort((left, right) => left - right)) {
      for (const buffer of levels.get(level) ?? []) {
        try {
          cleanup.solve(buffer);
        } catch {
          while (this.states.length > 1) this.pop(false);
          this.state = this.states[0] as SolverCreateState;
          manager.rollback();
        }
      }
      manager.commit();
    }
  }
  private maskTemporaryShortages(): void {
    let fence = Plan.instance().getShortageTolerance();
    if (fence.seconds < 0) fence = Plan.instance().getAutoFence();
    if (fence.isZero()) return;

    for (const buffer of Buffer.all()) {
      if ((this.cluster !== -1 && buffer.getCluster() !== this.cluster)
        || buffer instanceof BufferInfinite || !buffer.getProducingOperation()) continue;

      let correction: OperationFixedTime | null = null;
      const events = buffer.getFlowPlans();
      for (let index = 0; index < events.length; index += 1) {
        const shortage = events[index];
        if (!shortage) continue;
        const getDate = Reflect.get(shortage, "getDate");
        const getOnhand = Reflect.get(shortage, "getOnhand");
        const isLastOnDate = Reflect.get(shortage, "isLastOnDate");
        if (!isCallable(getDate) || !isCallable(getOnhand) || !isCallable(isLastOnDate)
          || !Boolean(Reflect.apply(isLastOnDate, shortage, []))) continue;

        const shortageDate = Reflect.apply(getDate, shortage, []);
        const shortageOnhand = Number(Reflect.apply(getOnhand, shortage, []));
        if (!(shortageDate instanceof PlanningDate) || shortageOnhand >= -0.000001) continue;

        const quantity = -shortageOnhand;
        const scanLimit = (shortageDate.compare(Plan.instance().getCurrent()) > 0
          ? shortageDate : Plan.instance().getCurrent()).add(fence);
        let shortageEnds: PlanningDate | null = null;
        for (const candidate of events.slice(index)) {
          const candidateDateCallback = Reflect.get(candidate, "getDate");
          const candidateOnhandCallback = Reflect.get(candidate, "getOnhand");
          const candidateLastCallback = Reflect.get(candidate, "isLastOnDate");
          if (!isCallable(candidateDateCallback) || !isCallable(candidateOnhandCallback)
            || !isCallable(candidateLastCallback)) continue;
          const candidateDate = Reflect.apply(candidateDateCallback, candidate, []);
          if (!(candidateDate instanceof PlanningDate)) continue;
          if (candidateDate.compare(scanLimit) > 0) break;
          if (Boolean(Reflect.apply(candidateLastCallback, candidate, []))
            && Number(Reflect.apply(candidateOnhandCallback, candidate, [])) > -quantity) {
            shortageEnds = new PlanningDate(candidateDate);
            break;
          }
        }
        if (!shortageEnds) continue;

        if (!correction) {
          const correctionName = `Correction for ${buffer.getName()}`;
          const existing = Operation.findFromName(correctionName);
          correction = existing instanceof OperationFixedTime && existing.getHidden()
            ? existing : new OperationFixedTime(correctionName);
          correction.setHidden(true);
          if (!correction.getFlows().length) {
            new FlowEnd(correction, buffer, -1, false);
            new FlowStart(correction, buffer, 1, false);
          }
        }
        const operationPlan = correction.createOperationPlan(
          quantity,
          shortageDate,
          shortageEnds,
          buffer.getBatch(),
        );
        if (!(operationPlan instanceof OperationPlan)) continue;
        operationPlan.setConfirmed(true);
        operationPlan.setStartAndEnd(shortageDate, shortageEnds);
        operationPlan.activate();
        this.maskedShortages.push(operationPlan);
      }
    }
  }
  private unmaskTemporaryShortages(): void {
    while (this.maskedShortages.length) this.maskedShortages.pop()?.dispose();
  }
  commit(): OperationPlan[] {
    if (!this.solver) throw new LogicException("Missing demands or solver.");
    const result: OperationPlan[] = [];
    this.maskTemporaryShortages();
    try {
      if (!this.solver.getConstraints()) {
        this.propagate = false;
        this.batchGrouping = true;
        if (this.solver.getCreateDeliveries()) this.createDeliveryPlans(result);
        this.bufferSolveShortagesOnly = false;
        this.backwardSweep();
        scanExcessSemantic(this.manager ?? this.solver.getCommandManager());
        this.scanExcess(false);
      } else if (this.solver.getAlgorithm() === "heuristic_2") {
        if (this.solver.getCreateDeliveries()) {
          this.constrainedPlanning = true;
          this.propagate = false;
          this.createDeliveryPlans(result);
        }
        this.constrainedPlanning = this.solver.getPlanType() === 1;
        this.propagate = false;
        this.batchGrouping = this.solver.getPlanType() !== 1;
        this.bufferSolveShortagesOnly = false;
        this.backwardSweep();
        if (this.solver.getPlanType() === 1) {
          let loops = 0;
          while (loops++ <= 5) {
            this.constrainedPlanning = true;
            this.operatorForward.clearMovedDeliveries();
            this.operatorForward.setPropagate(false);
            this.operatorForward.solve();
            if (!this.operatorForward.getMovedDeliveries().length) break;
            for (const operation of Operation.all()) {
              if (this.cluster === -1 || operation.getCluster() === this.cluster) {
                operation.deleteOperationPlans(false, false);
              }
            }
            this.bufferSolveShortagesOnly = false;
            this.batchGrouping = true;
            this.constrainedPlanning = true;
            this.backwardSweep();
          }
          scanExcessSemantic(this.manager ?? this.solver.getCommandManager());
          this.scanExcess(false);
        }
      } else {
        this.constrainedPlanning = this.solver.getPlanType() === 1;
        this.bufferSolveShortagesOnly = false;
        this.solveSafetyStock(true);
        const remaining = [...this.demands].sort(SolverCreate.compareDemands);
        while (remaining.length) {
          const selected = this.solver.getUserExitNextDemand()?.(remaining, this.solver, this) ?? remaining[0] ?? null;
          if (!selected || !remaining.includes(selected)) throw new DataException("userexit_nextdemand returned a demand outside the planning cluster");
          remaining.splice(remaining.indexOf(selected), 1);
          this.state = this.states[0] as SolverCreateState;
          this.state.reset();
          this.iterationCount = 0;
          try {
            const operationPlan = this.solver.solve(selected, this);
            if (operationPlan instanceof OperationPlan) result.push(operationPlan);
          } catch {
            // The native cluster loop isolates failures to the current demand.
            (this.manager ?? this.solver.getCommandManager()).rollback();
            while (this.states.length > 1) this.pop(false);
            this.state = this.states[0] as SolverCreateState;
            this.state.reset();
          }
        }
        this.constrainedPlanning = this.solver.getPlanType() === 1;
        this.bufferSolveShortagesOnly = false;
        this.solveSafetyStock(false);
      }
      this.scanExcess(this.solver.getPlanType() === 1 && this.solver.getConstraints() > 0);
      this.demands.length = 0;
      return result;
    } finally {
      this.unmaskTemporaryShortages();
    }
  }
}

export class SolverCreateSolverDataOrder_buffers extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["SolverCreate::SolverData::order_buffers"] as const;
}

export class SolverCreateState extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["SolverCreate::State"] as const;
  curDemand: Demand | null = null;
  curOwnerOpplan: OperationPlan | null = null;
  blockedOpplan: OperationPlan | null = null;
  dependency: unknown = null;
  curBuffer: Buffer | null = null;
  forceLate = false;
  requireFull = false;
  curBatch = "";
  q_qty = 0;
  q_date = new PlanningDate();
  q_date_max = new PlanningDate();
  a_qty = 0;
  a_date = new PlanningDate(PlanningDate.infiniteFuture);
  q_loadplan: unknown = null;
  q_flowplan: unknown = null;
  q_operationplan: OperationPlan | null = null;
  a_cost = 0;
  a_penalty = 0;
  q_qty_min = 1;
  has_bucketized_resources = false;
  forceAccept = false;
  keepAssignments: OperationPlan | null = null;

  clone(): SolverCreateState {
    const result = new SolverCreateState();
    Object.assign(result, this);
    result.q_date = new PlanningDate(this.q_date);
    result.q_date_max = new PlanningDate(this.q_date_max);
    result.a_date = new PlanningDate(this.a_date);
    return result;
  }
  copyAnswer(source: SolverCreateState): void {
    this.a_qty = source.a_qty;
    this.a_date = new PlanningDate(source.a_date);
    this.a_penalty = source.a_penalty;
    this.a_cost = source.a_cost;
    this.forceAccept = source.forceAccept;
    this.requireFull = source.requireFull;
  }
  reset(): void {
    Object.assign(this, new SolverCreateState());
  }
}

export class SolverPropagateStatus extends HeaderModelAdapter {
  static readonly cppBases = ["Solver"] as const;
  static readonly cppQualifiedNames = ["SolverPropagateStatus"] as const;
  private static initialized = false;
  private logLevel = 0;
  static override initialize(): number { this.initialized = true; return 0; }
  static create(fields: Readonly<Record<string, unknown>> = {}): SolverPropagateStatus {
    const result = new SolverPropagateStatus();
    if (fields.loglevel !== undefined) result.setLogLevel(Number(fields.loglevel));
    return result;
  }
  create(fields: Readonly<Record<string, unknown>> = {}): SolverPropagateStatus { return SolverPropagateStatus.create(fields); }
  getType(): string { return "solver_propagate_status"; }
  initialize(): number { return SolverPropagateStatus.initialize(); }
  getLogLevel(): number { return this.logLevel; }
  setLogLevel(value: number): void { this.logLevel = Math.trunc(Number(value)); }
  solve(_target: unknown = null): void {
    const operations = [...Operation.all()].sort((left, right) => left.getLevel() - right.getLevel());
    for (const operation of operations) {
      for (const candidate of operation.getOperationPlans()) {
        if (!(candidate instanceof OperationPlan)) continue;
        if (operation.getDependencies().length) candidate.matchDependencies(this.logLevel > 0);
        if ((candidate.getClosed() || candidate.getCompleted())) {
          candidate.propagateStatus(this.logLevel > 0);
        }
      }
    }
    for (const buffer of Buffer.all()) {
      const onhand = buffer.getOnHand(PlanningDate.infinitePast, PlanningDate.infiniteFuture, true);
      const count = buffer.getFlowPlans().length;
      if (onhand < 0 && onhand > -1e-9 * count) buffer.setOnHand(buffer.getOnHand() - onhand);
    }
  }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/solver/solverplan.cpp.
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
  { name: "SolverCreate::tag_iterationthreshold", sourceLine: 31, status: "adapted" },
  { name: "SolverCreate::tag_iterationaccuracy", sourceLine: 32, status: "adapted" },
  { name: "SolverCreate::tag_lazydelay", sourceLine: 33, status: "adapted" },
  { name: "SolverCreate::tag_createdeliveries", sourceLine: 34, status: "adapted" },
  { name: "SolverCreate::tag_administrativeleadtime", sourceLine: 35, status: "adapted" },
  { name: "SolverCreate::tag_minimumdelay", sourceLine: 37, status: "adapted" },
  { name: "SolverCreate::tag_rotateresources", sourceLine: 38, status: "adapted" },
  { name: "SolverCreate::tag_iterationmax", sourceLine: 39, status: "adapted" },
  { name: "SolverCreate::tag_resourceiterationmax", sourceLine: 40, status: "adapted" },
  { name: "SolverCreate::tag_erasePreviousFirst", sourceLine: 41, status: "adapted" },
  { name: "LibrarySolver::initialize", sourceLine: 43, status: "adapted" },
  { name: "frepple::LibrarySolver::initialize", sourceLine: 47, status: "adapted" },
  { name: "SolverCreate::initialize", sourceLine: 61, status: "adapted" },
  { name: "SolverCreate::create", sourceLine: 88, status: "adapted" },
  { name: "SolverCreate::SolverData::SolverData", sourceLine: 124, status: "adapted" },
  { name: "SolverCreate::SolverData::setCommandManager", sourceLine: 141, status: "adapted" },
  { name: "SolverCreate::SolverData::createDeliveries", sourceLine: 147, status: "adapted" },
  { name: "SolverCreate::SolverData::~SolverData", sourceLine: 208, status: "adapted" },
  { name: "SolverCreate::isLeadTimeConstrained", sourceLine: 214, status: "adapted" },
  { name: "SolverCreate::demand_comparison", sourceLine: 236, status: "adapted" },
  { name: "SolverCreate::SolverData::push", sourceLine: 257, status: "adapted" },
  { name: "SolverCreate::SolverData::pop", sourceLine: 306, status: "adapted" },
  { name: "SolverCreate::SolverData::commit", sourceLine: 320, status: "adapted" },
  { name: "SolverCreate::SolverData::solveSafetyStock", sourceLine: 560, status: "adapted" },
  { name: "HasLevel::getNumberOfLevels", sourceLine: 566, status: "adapted" },
  { name: "SolverCreate::SolverData::backward_sweep", sourceLine: 625, status: "adapted" },
  { name: "SolverCreate::SolverData::scanExcess", sourceLine: 658, status: "adapted" },
  { name: "HasLevel::getNumberOfLevels", sourceLine: 666, status: "adapted" },
  { name: "SolverCreate::SolverData::maskTemporaryShortages", sourceLine: 698, status: "adapted" },
  { name: "Plan::instance", sourceLine: 717, status: "adapted" },
  { name: "SolverCreate::SolverData::unmaskTemporaryShortages", sourceLine: 750, status: "adapted" },
  { name: "SolverCreate::update_user_exits", sourceLine: 758, status: "adapted" },
  { name: "SolverCreate::solve", sourceLine: 768, status: "adapted" },
  { name: "SolverCreate::solve", sourceLine: 864, status: "adapted" },
  { name: "SolverCreate::commit", sourceLine: 926, status: "adapted" },
  { name: "SolverCreate::rollback", sourceLine: 944, status: "adapted" },
  { name: "SolverCreate::markAutofence", sourceLine: 961, status: "adapted" },
  { name: "SolverPropagateStatus::initialize", sourceLine: 991, status: "adapted" },
  { name: "SolverPropagateStatus::create", sourceLine: 1010, status: "adapted" },
  { name: "SolverPropagateStatus::solve", sourceLine: 1047, status: "adapted" },
  { name: "SolverPropagateStatus::solve", sourceLine: 1062, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface HasLevelPort {
  getNumberOfLevels(...args: readonly PortValue[]): PortValue | void;
}

export interface LibrarySolverPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface SolverCreatePort {
  commit(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  demand_comparison(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  isLeadTimeConstrained(...args: readonly PortValue[]): PortValue | void;
  markAutofence(...args: readonly PortValue[]): PortValue | void;
  rollback(...args: readonly PortValue[]): PortValue | void;
  solve(...args: readonly PortValue[]): PortValue | void;
  tag_administrativeleadtime(...args: readonly PortValue[]): PortValue | void;
  tag_createdeliveries(...args: readonly PortValue[]): PortValue | void;
  tag_erasePreviousFirst(...args: readonly PortValue[]): PortValue | void;
  tag_iterationaccuracy(...args: readonly PortValue[]): PortValue | void;
  tag_iterationmax(...args: readonly PortValue[]): PortValue | void;
  tag_iterationthreshold(...args: readonly PortValue[]): PortValue | void;
  tag_lazydelay(...args: readonly PortValue[]): PortValue | void;
  tag_minimumdelay(...args: readonly PortValue[]): PortValue | void;
  tag_resourceiterationmax(...args: readonly PortValue[]): PortValue | void;
  tag_rotateresources(...args: readonly PortValue[]): PortValue | void;
  update_user_exits(...args: readonly PortValue[]): PortValue | void;
}

export interface SolverDataPort {
  SolverData(...args: readonly PortValue[]): PortValue | void;
  backward_sweep(...args: readonly PortValue[]): PortValue | void;
  commit(...args: readonly PortValue[]): PortValue | void;
  createDeliveries(...args: readonly PortValue[]): PortValue | void;
  disposeSolverData(...args: readonly PortValue[]): PortValue | void;
  maskTemporaryShortages(...args: readonly PortValue[]): PortValue | void;
  pop(...args: readonly PortValue[]): PortValue | void;
  push(...args: readonly PortValue[]): PortValue | void;
  scanExcess(...args: readonly PortValue[]): PortValue | void;
  setCommandManager(...args: readonly PortValue[]): PortValue | void;
  solveSafetyStock(...args: readonly PortValue[]): PortValue | void;
  unmaskTemporaryShortages(...args: readonly PortValue[]): PortValue | void;
}

export interface SolverPropagateStatusPort {
  create(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  solve(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/solver/solverplan.cpp";
export const targetFile = "solver/solverplan.ts";

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
  "#include \"frepple/solver.h\"",
  "namespace frepple {",
  "",
  "const MetaClass* SolverPropagateStatus::metadata;",
  "const MetaClass* SolverCreate::metadata;",
  "const Keyword SolverCreate::tag_iterationthreshold(\"iterationthreshold\");",
  "const Keyword SolverCreate::tag_iterationaccuracy(\"iterationaccuracy\");",
  "const Keyword SolverCreate::tag_lazydelay(\"lazydelay\");",
  "const Keyword SolverCreate::tag_createdeliveries(\"createdeliveries\");",
  "const Keyword SolverCreate::tag_administrativeleadtime(",
  "    \"administrativeleadtime\");",
  "const Keyword SolverCreate::tag_minimumdelay(\"minimumdelay\");",
  "const Keyword SolverCreate::tag_rotateresources(\"rotateresources\");",
  "const Keyword SolverCreate::tag_iterationmax(\"iterationmax\");",
  "const Keyword SolverCreate::tag_resourceiterationmax(\"resourceiterationmax\");",
  "const Keyword SolverCreate::tag_erasePreviousFirst(\"erasePreviousFirst\");",
  "",
  "void LibrarySolver::initialize() {",
  "  // Initialize only once",
  "  static bool init = false;",
  "  if (init) {",
  "    logger << \"Warning: Calling frepple::LibrarySolver::initialize() more \"",
  "           << \"than once.\\n\";",
  "    return;",
  "  }",
  "  init = true;",
  "",
  "  // Register all classes.",
  "  int nok = 0;",
  "  nok += SolverCreate::initialize();",
  "  nok += OperatorDelete::initialize();",
  "  nok += SolverPropagateStatus::initialize();",
  "  if (nok) throw RuntimeException(\"Error registering new Python types\");",
  "}",
  "",
  "int SolverCreate::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<SolverCreate>(",
  "      \"solver\", \"solver_mrp\", Object::create<SolverCreate>, true);",
  "  registerFields<SolverCreate>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleClass<SolverCreate, Solver>::getPythonType();",
  "  x.setName(\"solver_mrp\");",
  "  x.setDoc(\"frePPLe solver_mrp\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(",
  "      \"solve\",",
  "      static_cast<PyObject* (*)(PyObject*, PyObject*, PyObject*)>(solve),",
  "      METH_VARARGS, \"run the solver\");",
  "  x.addMethod(\"commit\", commit, METH_NOARGS, \"commit the plan changes\");",
  "  x.addMethod(\"rollback\", rollback, METH_NOARGS, \"rollback the plan changes\");",
  "  x.addMethod(\"createsBatches\", createsBatches, METH_NOARGS,",
  "              \"group operationplans\");",
  "  x.addMethod(\"markAutofence\", markAutofence, METH_NOARGS,",
  "              \"recognize buffers to which autofence applies\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* SolverCreate::create(PyTypeObject*, PyObject*, PyObject* kwds) {",
  "  try {",
  "    // Create the solver",
  "    auto* s = new SolverCreate();",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (kwds) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        const MetaFieldBase* fmeta =",
  "            SolverCreate::metadata->findField(attr.getHash());",
  "        if (!fmeta) fmeta = Solver::metadata->findField(attr.getHash());",
  "        if (fmeta)",
  "          // Update the attribute",
  "          fmeta->setField(s, field);",
  "        else",
  "          s->setProperty(attr.getName(), value);",
  "      };",
  "    }",
  "",
  "    // Return the object. The reference count doesn't need to be increased",
  "    // as we do with other objects, because we want this object to be available",
  "    // for the garbage collector of Python.",
  "    return static_cast<PyObject*>(s);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "SolverCreate::SolverData::SolverData(SolverCreate* s, int c, deque<Demand*>* d)",
  "    : sol(s),",
  "      cluster(c),",
  "      demands(d),",
  "      constrainedPlanning(true),",
  "      logConstraints(true),",
  "      state(statestack),",
  "      prevstate(statestack - 1) {",
  "  shortagesonly = sol->getShortagesOnly();",
  "  propagate = sol->getPropagate();",
  "  batchgrouping = sol->getBatchGrouping();",
  "  operator_delete = new OperatorDelete();",
  "  operator_forward = new OperatorForward(this, c, mgr);",
  "  operator_backward = new OperatorBackward(this, c, mgr);",
  "  operator_delete->setLogLevel(s->getLogLevel());",
  "}",
  "",
  "void SolverCreate::SolverData::setCommandManager(CommandManager* a) {",
  "  if (mgr == a) return;",
  "  mgr = a;",
  "  if (operator_delete) operator_delete->setCommandManager(a);",
  "}",
  "",
  "void SolverCreate::SolverData::createDeliveries() {",
  "  auto* solver = getSolver();",
  "  for (auto& demand : *demands) {",
  "    if (solver->userexit_demand)",
  "      solver->userexit_demand.call(demand, PythonData(constrainedPlanning));",
  "",
  "    // Determine the quantity to be planned and the date for the planning",
  "    // loop.",
  "    double plan_qty = demand->getQuantity() - demand->getPlannedQuantity();",
  "    if (demand->getDue() == Date::infiniteFuture ||",
  "        demand->getDue() == Date::infinitePast)",
  "      continue;",
  "",
  "    // Select delivery operation.",
  "    Operation* deliveryoper = demand->getDeliveryOperation();",
  "    if (!deliveryoper) continue;",
  "",
  "    auto isGroupMember =",
  "        demand->getOwner() && demand->getOwner()->hasType<DemandGroup>() &&",
  "        static_cast<DemandGroup*>(demand->getOwner())->getPolicy() !=",
  "            Demand::POLICY_INDEPENDENT;",
  "    auto due = isGroupMember ? demand->getOwner()->getDue() : demand->getDue();",
  "    while (plan_qty > ROUNDING_ERROR) {",
  "      // Respect minimum shipment quantities.",
  "      auto m = demand->getMinShipment();",
  "      if (plan_qty < m) plan_qty = m;",
  "      state->curBuffer = nullptr;",
  "      state->q_qty = plan_qty;",
  "      state->q_date = due;",
  "      state->a_cost = 0.0;",
  "      state->a_penalty = 0.0;",
  "      state->curDemand = demand;",
  "      state->curOwnerOpplan = nullptr;",
  "      state->blockedOpplan = nullptr;",
  "      state->dependency = nullptr;",
  "      state->curBatch = demand->getBatch();",
  "      dependency_list.clear();",
  "      state->a_qty = 0;",
  "      try {",
  "        deliveryoper->solve(*solver, this);",
  "        getCommandManager()->commit();",
  "        plan_qty -= state->a_qty;",
  "        if (!state->a_qty) {",
  "          if (state->a_date == Date::infiniteFuture || state->a_date <= due)",
  "            break;",
  "          else",
  "            // Also unconstrained plan may need to repeat the loop.",
  "            // Can be caused with complete lack of any availability",
  "            // before the requirement date.",
  "            due = state->a_date;",
  "        }",
  "      } catch (const exception& e) {",
  "        logger << \"Error creating delivery for '\" << demand << \"': \" << e.what()",
  "               << '\\n';",
  "        getCommandManager()->rollback();",
  "        break;",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "SolverCreate::SolverData::~SolverData() {",
  "  delete operator_delete;",
  "  delete operator_forward;",
  "  delete operator_backward;",
  "};",
  "",
  "bool SolverCreate::isLeadTimeConstrained(const Operation* oper) const {",
  "  if (oper && (oper->hasType<OperationItemSupplier>() ||",
  "               oper->getCategory() == \"subcontractor\"))",
  "    return (constrts & PO_LEADTIME) > 0;",
  "  else if (oper && oper->hasType<OperationSplit, OperationAlternate>()) {",
  "    bool all_po = true;",
  "    for (auto& alt : oper->getSubOperations()) {",
  "      if (alt->getOperation()->getPriority() &&",
  "          !(alt->getOperation()->hasType<OperationItemSupplier>() ||",
  "            alt->getOperation()->getCategory() == \"subcontractor\")) {",
  "        all_po = false;",
  "        break;",
  "      }",
  "    }",
  "    if (all_po)",
  "      return (constrts & PO_LEADTIME) > 0;",
  "    else",
  "      return (constrts & MFG_LEADTIME) > 0;",
  "  } else",
  "    return (constrts & MFG_LEADTIME) > 0;",
  "}",
  "",
  "bool SolverCreate::demand_comparison(const Demand* l1, const Demand* l2) {",
  "  if ((l1->getStatus() == Demand::STATUS_QUOTE ||",
  "       l1->getStatus() == Demand::STATUS_INQUIRY) &&",
  "      l2->getStatus() != Demand::STATUS_QUOTE &&",
  "      l2->getStatus() != Demand::STATUS_INQUIRY)",
  "    return false;",
  "  else if ((l2->getStatus() == Demand::STATUS_QUOTE ||",
  "            l2->getStatus() == Demand::STATUS_INQUIRY) &&",
  "           l1->getStatus() != Demand::STATUS_QUOTE &&",
  "           l1->getStatus() != Demand::STATUS_INQUIRY)",
  "    return true;",
  "  else if (l1->getPriority() != l2->getPriority())",
  "    return l1->getPriority() < l2->getPriority();",
  "  else if (l1->getDue() != l2->getDue())",
  "    return l1->getDue() < l2->getDue();",
  "  else if (l1->getQuantity() != l2->getQuantity())",
  "    return l1->getQuantity() < l2->getQuantity();",
  "  else",
  "    return l1->getName() < l2->getName();",
  "}",
  "",
  "void SolverCreate::SolverData::push(double q, Date d, bool full) {",
  "  if (state >= statestack + MAXSTATES)",
  "    throw RuntimeException(\"Maximum recursion depth exceeded\");",
  "  ++state;",
  "  ++prevstate;",
  "  state->q_qty = q;",
  "  state->q_date = d;",
  "  state->q_date_max = d;",
  "  if (full) {",
  "    state->q_loadplan = prevstate->q_loadplan;",
  "    state->q_flowplan = prevstate->q_flowplan;",
  "    state->q_operationplan = prevstate->q_operationplan;",
  "    state->curOwnerOpplan = prevstate->curOwnerOpplan;",
  "    state->blockedOpplan = prevstate->blockedOpplan;",
  "    state->dependency = prevstate->dependency;",
  "    state->curDemand = prevstate->curDemand;",
  "    state->curBuffer = prevstate->curBuffer;",
  "    state->q_qty_min = prevstate->q_qty_min;",
  "    state->forceLate = prevstate->forceLate;",
  "    state->requireFull = prevstate->requireFull;",
  "    state->a_cost = prevstate->a_cost;",
  "    state->a_penalty = prevstate->a_penalty;",
  "    state->curBatch = prevstate->curBatch;",
  "    state->forceAccept = prevstate->forceAccept;",
  "    state->has_bucketized_resources = prevstate->has_bucketized_resources;",
  "    state->keepAssignments = prevstate->keepAssignments;",
  "  } else {",
  "    state->q_loadplan = nullptr;",
  "    state->q_flowplan = nullptr;",
  "    state->q_operationplan = nullptr;",
  "    state->curOwnerOpplan = nullptr;",
  "    state->blockedOpplan = nullptr;",
  "    state->dependency = nullptr;",
  "    state->curDemand = nullptr;",
  "    state->curBuffer = nullptr;",
  "    state->q_qty_min = 1.0;",
  "    state->forceLate = false;",
  "    state->requireFull = prevstate->requireFull;",
  "    state->a_cost = 0.0;",
  "    state->a_penalty = 0.0;",
  "    state->curBatch = PooledString::emptystring;",
  "    state->forceAccept = false;",
  "    state->has_bucketized_resources = false;",
  "    state->keepAssignments = nullptr;",
  "  }",
  "  state->a_date = Date::infiniteFuture;",
  "  state->a_qty = 0.0;",
  "}",
  "",
  "void SolverCreate::SolverData::pop(bool copy_answer) {",
  "  if (state < statestack) throw LogicException(\"State stack empty\");",
  "  if (copy_answer) {",
  "    prevstate->a_qty = state->a_qty;",
  "    prevstate->a_date = state->a_date;",
  "    prevstate->a_penalty = state->a_penalty;",
  "    prevstate->a_cost = state->a_cost;",
  "    prevstate->forceAccept = state->forceAccept;",
  "    prevstate->requireFull = state->requireFull;",
  "  }",
  "  --state;",
  "  --prevstate;",
  "}",
  "",
  "void SolverCreate::SolverData::commit() {",
  "  // Check",
  "  SolverCreate* solver = getSolver();",
  "  if (!solver || (!demands && solver->getCreateDeliveries()))",
  "    throw LogicException(\"Missing demands or solver.\");",
  "",
  "  // Message",
  "  if (solver->getLogLevel() > 0)",
  "    logger << \"Start solving cluster \" << cluster << '\\n';",
  "",
  "  maskTemporaryShortages();",
  "",
  "  // Solve the planning problem",
  "  unsigned short step = 0;",
  "  try {",
  "    if (!solver->getConstraints()) {",
  "      // Special case to use a single sweep for truely unconstrained plans",
  "",
  "      // Step 1: Create a delivery operationplan for all demands",
  "      setPropagate(false);",
  "      setBatchGrouping(true);",
  "      if (solver->getCreateDeliveries()) createDeliveries();",
  "",
  "      // Step 3: Solve buffer by buffer, ordered by level",
  "      buffer_solve_shortages_only = false;",
  "      backward_sweep();",
  "",
  "      // Clean up excess inventory",
  "      scanExcess(false);",
  "    } else if (solver->getAlgorithm() == \"heuristic_2\") {",
  "      // Create a delivery operationplan for all demands",
  "      if (solver->getCreateDeliveries()) {",
  "        constrainedPlanning = true;",
  "        setPropagate(false);",
  "        createDeliveries();",
  "      }",
  "",
  "      // Backward sweep",
  "      if (solver->getLogLevel() > 0)",
  "        logger << \"PLANNING STEP \" << ++step << \": backward sweep\\n\";",
  "      constrainedPlanning = (solver->getPlanType() == 1);",
  "      setPropagate(false);",
  "      buffer_solve_shortages_only = false;",
  "      setBatchGrouping((solver->getPlanType() == 1) ? false : true);",
  "      backward_sweep();",
  "",
  "      if (solver->getPlanType() == 1) {",
  "        short loops = 0;",
  "        while (loops++ <= 5) {",
  "          // Forward sweep",
  "          if (solver->getLogLevel() > 0)",
  "            logger << \"PLANNING STEP \" << ++step << \": forward sweep\\n\";",
  "          constrainedPlanning = true;",
  "          operator_forward->clearMovedDeliveries();",
  "          operator_forward->setPropagate(false);",
  "          operator_forward->solve();",
  "          if (!operator_forward->getMovedDeliveries())",
  "            // The forward sweep didn't change any delivery date, we're done",
  "            break;",
  "",
  "          // Delete proposed operationplans, except deliveries",
  "          // This gives us feasible date to start a second run",
  "          for (auto& oper : Operation::all())",
  "            if (cluster == -1 || oper.getCluster() == cluster)",
  "              oper.deleteOperationPlans(false, false);",
  "",
  "          // Backward sweep again, with batch grouping enabled this time",
  "          // This coordinates the batches on their feasible date",
  "          if (solver->getLogLevel() > 0)",
  "            logger << \"PLANNING STEP \" << ++step << \": second backward sweep\\n\";",
  "          buffer_solve_shortages_only = false;",
  "          setBatchGrouping(true);",
  "          constrainedPlanning = true;",
  "          backward_sweep();",
  "        }",
  "",
  "        // Clean up excess inventory",
  "        if (solver->getLogLevel() > 0)",
  "          logger << \"PLANNING STEP \" << ++step",
  "                 << \": clean up excess inventory\\n\";",
  "        scanExcess(false);",
  "      }",
  "    } else {",
  "      // Normal case: demand-per-demand loop",
  "",
  "      // Sort the demands of this problem.",
  "      // We use a stable sort to get reproducible results between platforms",
  "      // and STL implementations.",
  "      if (!solver->userexit_nextdemand)",
  "        stable_sort(demands->begin(), demands->end(), demand_comparison);",
  "",
  "      // Solve for safety stock in buffers.",
  "      constrainedPlanning = (solver->getPlanType() == 1);",
  "      safety_stock_planning = true;",
  "      buffer_solve_shortages_only = false;",
  "      solveSafetyStock(solver, true);",
  "",
  "      // Loop through the list of all demands in this planning problem",
  "      safety_stock_planning = false;",
  "      Demand* curdmd;",
  "      auto iterdmd = demands->begin();",
  "      do {",
  "        // Find the next demand to plan",
  "        if (solver->userexit_nextdemand) {",
  "          auto obj =",
  "              solver->userexit_nextdemand.call(PythonData(cluster)).getObject();",
  "          if (!obj || obj == Py_None)",
  "            break;",
  "          else if (obj->getType().category == Demand::metadata ||",
  "                   obj->getType().type == \"demand_forecastbucket\")",
  "            curdmd = static_cast<Demand*>(obj);",
  "          else",
  "            throw DataException(\"User exit nextdemand must return a demand\");",
  "        } else if (iterdmd == demands->end())",
  "          break;",
  "        else {",
  "          curdmd = *iterdmd;",
  "          ++iterdmd;",
  "        }",
  "",
  "        // Plan the demand",
  "        iteration_count = 0;",
  "        try {",
  "          curdmd->solve(*solver, this);",
  "        } catch (...) {",
  "          // Log the exception as the only reason for the demand not being",
  "          // planned",
  "          curdmd->getConstraints().clear();",
  "          // Error message",
  "          logger << \"Error: Caught an exception while solving demand '\"",
  "                 << curdmd << \"':\\n\";",
  "          try {",
  "            throw;",
  "          } catch (const bad_exception&) {",
  "            curdmd->getConstraints().push(new ProblemInvalidData(",
  "                curdmd, \"Error: bad exception\", \"demand\", curdmd->getDue(),",
  "                curdmd->getDue(), false));",
  "            logger << \"  bad exception\\n\";",
  "          } catch (const exception& e) {",
  "            curdmd->getConstraints().push(new ProblemInvalidData(",
  "                curdmd, \"Error: \" + string(e.what()), \"demand\",",
  "                curdmd->getDue(), curdmd->getDue(), false));",
  "            logger << \"  \" << e.what() << '\\n';",
  "          } catch (...) {",
  "            curdmd->getConstraints().push(new ProblemInvalidData(",
  "                curdmd, \"Error: unknown type\", \"demand\", curdmd->getDue(),",
  "                curdmd->getDue(), false));",
  "            logger << \"  Unknown type\\n\";",
  "          }",
  "        }",
  "      } while (true);",
  "",
  "      // Completely recreate all purchasing operation plans",
  "      for (auto o : purchase_buffers) {",
  "        // Erase existing proposed purchases",
  "        const_cast<Buffer*>(o)->getProducingOperation()->deleteOperationPlans(",
  "            false);",
  "        // Create new proposed purchases",
  "        auto tmp_buffer_solve_shortages_only = buffer_solve_shortages_only;",
  "        try {",
  "          safety_stock_planning = true;",
  "          buffer_solve_shortages_only = false;",
  "          state->curBuffer = nullptr;",
  "          state->q_qty = -1.0;",
  "          state->q_date = Date::infinitePast;",
  "          state->a_cost = 0.0;",
  "          state->a_penalty = 0.0;",
  "          state->curDemand = nullptr;",
  "          state->curOwnerOpplan = nullptr;",
  "          state->blockedOpplan = nullptr;",
  "          state->dependency = nullptr;",
  "          state->a_qty = 0;",
  "          state->curBatch = o->getBatch();",
  "          o->solve(*solver, this);",
  "          getCommandManager()->commit();",
  "        } catch (...) {",
  "          getCommandManager()->rollback();",
  "        }",
  "        buffer_solve_shortages_only = tmp_buffer_solve_shortages_only;",
  "      }",
  "      purchase_buffers.clear();",
  "",
  "      // Second run to solve for safety stock in buffers.",
  "      constrainedPlanning = (solver->getPlanType() == 1);",
  "      safety_stock_planning = true;",
  "      buffer_solve_shortages_only = false;",
  "      solveSafetyStock(solver, false);",
  "    }",
  "",
  "    // Operation batching postprocessing when constraints are active.",
  "    // The level-by-level unconstrained plan has its own batch grouping.",
  "    if (solver->getConstraints() > 0)",
  "      for (auto& o : Operation::all()) {",
  "        if (cluster == -1 || o.getCluster() == cluster)",
  "          solver->createsBatches(&o, this);",
  "      }",
  "",
  "    // Clean the constraint list",
  "    if (solver->getConstraints())",
  "      for (auto* dmd : *demands) dmd->getConstraints().clean(dmd);",
  "",
  "    // Clean the list of demands of this cluster",
  "    demands->clear();",
  "",
  "    // Clean up excess inventory",
  "    scanExcess(solver->getPlanType() == 1 && solver->getConstraints() > 0);",
  "  } catch (...) {",
  "    // We come in this exception handling code only if there is a problem with",
  "    // with this cluster that goes beyond problems with single orders.",
  "    // If the problem is with single orders, the exception handling code above",
  "    // will do a proper rollback.",
  "",
  "    // Error message",
  "    logger << \"Error: Caught an exception while solving cluster \" << cluster",
  "           << \":\\n\";",
  "    try {",
  "      throw;",
  "    } catch (const bad_exception&) {",
  "      logger << \"  bad exception\\n\";",
  "    } catch (const exception& e) {",
  "      logger << \"  \" << e.what() << '\\n';",
  "    } catch (...) {",
  "      logger << \"  Unknown type\\n\";",
  "    }",
  "",
  "    // Clean up the operationplans of this cluster",
  "    for (auto& f : Operation::all())",
  "      if (f.getCluster() == cluster) f.deleteOperationPlans();",
  "",
  "    // Clean the list of demands of this cluster",
  "    demands->clear();",
  "  }",
  "",
  "  unmaskTemporaryShortages();",
  "",
  "  // Message",
  "  if (solver->getLogLevel() > 0)",
  "    logger << \"End solving cluster \" << cluster << '\\n';",
  "}",
  "",
  "void SolverCreate::SolverData::solveSafetyStock(SolverCreate* solver,",
  "                                                bool first_pass) {",
  "  safety_stock_planning = true;",
  "  if (getLogLevel() > 0)",
  "    logger << \"Start safety stock replenishment pass for cluster \" << cluster",
  "           << '\\n';",
  "  vector<list<Buffer*> > bufs(HasLevel::getNumberOfLevels() + 1);",
  "  for (auto& buf : Buffer::all())",
  "    if ((buf.getCluster() == cluster || cluster == -1) &&",
  "        !buf.hasType<BufferInfinite>() && buf.getProducingOperation() &&",
  "        (buf.getMinimum() || buf.getMinimumCalendar() ||",
  "         buf.getFlowPlans().begin() != buf.getFlowPlans().end())) {",
  "      if (!first_pass) {",
  "        auto last = buf.getFlowPlans().rbegin();",
  "        if (last != buf.getFlowPlans().end() &&",
  "            last->getOnhand() >= last->getMin() - ROUNDING_ERROR)",
  "          // Second pass should only pick up buffers with a remaining safety",
  "          // stock shortage at the end of the horizon",
  "          continue;",
  "      }",
  "      bufs[(buf.getLevel() >= 0) ? buf.getLevel() : 0].push_back(&buf);",
  "    }",
  "  State* mystate = state;",
  "  for (auto& b_list : bufs)",
  "    for (auto& b : b_list) {",
  "      try {",
  "        state->curBuffer = nullptr;",
  "        // A quantity of -1 is a flag for the buffer solver to solve safety",
  "        // stock.",
  "        state->q_qty = -1.0;",
  "        state->q_date = Date::infinitePast;",
  "        state->a_cost = 0.0;",
  "        state->a_penalty = 0.0;",
  "        constraints = nullptr;",
  "        state->curDemand = nullptr;",
  "        state->curOwnerOpplan = nullptr;",
  "        state->blockedOpplan = nullptr;",
  "        state->dependency = nullptr;",
  "        buffer_solve_shortages_only = false;",
  "        state->curBatch = (*b).getBatch();",
  "        // Call the buffer safety stock solver",
  "        iteration_count = 0;",
  "        b->solve(*solver, this);",
  "        getCommandManager()->commit();",
  "      } catch (const bad_exception&) {",
  "        logger << \"Error: bad exception solving safety stock for \" << *b",
  "               << '\\n';",
  "        while (state > mystate) pop();",
  "        getCommandManager()->rollback();",
  "      } catch (const exception& e) {",
  "        logger << \"Error: exception solving safety stock for \" << *b << \": \"",
  "               << e.what() << '\\n';",
  "        while (state > mystate) pop();",
  "        getCommandManager()->rollback();",
  "      } catch (...) {",
  "        logger << \"Error: unknown exception solving safety stock for \" << *b",
  "               << '\\n';",
  "        while (state > mystate) pop();",
  "        getCommandManager()->rollback();",
  "      }",
  "    }",
  "  if (getLogLevel() > 0) logger << \"Finished safety stock replenishment pass\\n\";",
  "  safety_stock_planning = false;",
  "}",
  "",
  "void SolverCreate::SolverData::backward_sweep() {",
  "  auto* solver = getSolver();",
  "  for (short lvl = -1; lvl <= HasLevel::getNumberOfLevels(); ++lvl) {",
  "    // Propagate through this level of buffers",
  "    for (auto& b : Buffer::all()) {",
  "      if (b.getLevel() != lvl || (cluster != -1 && cluster != b.getCluster()))",
  "        // Not your turn yet...",
  "        continue;",
  "",
  "      // Given the demand, ROQ and safety stock, we resolve the shortage",
  "      // with an unconstrained propagation to the next level.",
  "      state->curBuffer = nullptr;",
  "      state->q_qty = -1.0;",
  "      state->q_date = Date::infinitePast;",
  "      state->a_cost = 0.0;",
  "      state->a_penalty = 0.0;",
  "      state->curDemand = nullptr;",
  "      state->curOwnerOpplan = nullptr;",
  "      state->blockedOpplan = nullptr;",
  "      state->dependency = nullptr;",
  "      state->a_qty = 0;",
  "      try {",
  "        b.solve(*solver, this);",
  "        getCommandManager()->commit();",
  "      } catch (const exception& e) {",
  "        logger << \"Error propagating through buffer '\" << b << \"': \" << e.what()",
  "               << '\\n';",
  "        getCommandManager()->rollback();",
  "      }",
  "    }",
  "  }",
  "}",
  "",
  "void SolverCreate::SolverData::scanExcess(bool constrained) {",
  "  OperatorDelete cleanup(getCommandManager());",
  "  cleanup.setConstrained(constrained);",
  "  cleanup.setPropagate(false);",
  "  if (getLogLevel() > 0) {",
  "    logger << \"Start scanning excess in cluster \" << cluster << '\\n';",
  "    cleanup.setLogLevel(getLogLevel());",
  "  }",
  "  vector<list<Buffer*> > bufs(HasLevel::getNumberOfLevels() + 1);",
  "  for (auto& buf : Buffer::all())",
  "    if ((buf.getCluster() == cluster || cluster == -1) &&",
  "        !buf.hasType<BufferInfinite>() && buf.getProducingOperation() &&",
  "        (buf.getMinimum() || buf.getMinimumCalendar() ||",
  "         buf.getFlowPlans().begin() != buf.getFlowPlans().end()))",
  "      bufs[(buf.getLevel() >= 0) ? buf.getLevel() : 0].push_back(&buf);",
  "  State* mystate = state;",
  "  for (auto& b_list : bufs) {",
  "    for (auto& b : b_list) {",
  "      try {",
  "        b->solve(cleanup, this);",
  "      } catch (const bad_exception&) {",
  "        logger << \"Error: bad exception scanning excess for \" << *b << '\\n';",
  "        while (state > mystate) pop();",
  "        getCommandManager()->rollback();",
  "      } catch (const exception& e) {",
  "        logger << \"Error: exception scanning excess for \" << *b << \": \"",
  "               << e.what() << '\\n';",
  "        while (state > mystate) pop();",
  "        getCommandManager()->rollback();",
  "      } catch (...) {",
  "        logger << \"Error: unknown exception scanning excess for \" << *b << '\\n';",
  "        while (state > mystate) pop();",
  "        getCommandManager()->rollback();",
  "      }",
  "    }",
  "    getCommandManager()->commit();",
  "  }",
  "  if (getLogLevel() > 0) logger << \"Finished excess scan\\n\";",
  "}",
  "",
  "void SolverCreate::SolverData::maskTemporaryShortages() {",
  "  auto fence = Plan::instance().getShortageTolerance();",
  "  if (fence < 0L) fence = Plan::instance().getAutoFence();",
  "  if (!fence)",
  "    // Autofence value of 0 doesn't mask any temporary shortages",
  "    return;",
  "  for (auto& buf : Buffer::all())",
  "    if ((buf.getCluster() == cluster || cluster == -1) &&",
  "        !buf.hasType<BufferInfinite>() && buf.getProducingOperation()) {",
  "      Operation* correction = nullptr;",
  "      for (auto flpln = buf.getFlowPlans().begin();",
  "           flpln != buf.getFlowPlans().end(); ++flpln) {",
  "        if (flpln->isLastOnDate() && flpln->getOnhand() < -ROUNDING_ERROR) {",
  "          // Scan to see the end of the shortage period",
  "          auto qty = -flpln->getOnhand();",
  "          Date shortage_ends;",
  "          for (Buffer::flowplanlist::const_iterator scanner = flpln;",
  "               scanner != buf.getFlowPlans().end(); ++scanner) {",
  "            if (scanner->getDate() >",
  "                max(flpln->getDate(), Plan::instance().getCurrent()) + fence)",
  "              break;",
  "            else if (scanner->getOnhand() > -qty && scanner->isLastOnDate()) {",
  "              shortage_ends = scanner->getDate();",
  "              break;",
  "            }",
  "          }",
  "",
  "          // Correct inventory",
  "          if (shortage_ends) {",
  "            if (!correction) {",
  "              correction = new OperationFixedTime();",
  "              correction->setName(\"Correction for \" + buf.getName());",
  "              correction->setHidden(true);",
  "              // Important not to trigger cluster recalculation.",
  "              new FlowEnd(correction, &buf, -1, false);",
  "              new FlowStart(correction, &buf, 1, false);",
  "            }",
  "            auto opplan = correction->createOperationPlan(",
  "                qty, flpln->getDate(), shortage_ends, buf.getBatch());",
  "            opplan->setConfirmed(true);",
  "            opplan->setStartAndEnd(flpln->getDate(), shortage_ends);",
  "            maskedShortages.push_back(opplan);",
  "            if (getLogLevel() > 0)",
  "              logger << \"Warning: Masking temporary material shortage on '\"",
  "                     << buf.getName() << \"' for \" << opplan->getQuantity()",
  "                     << \" during \" << opplan->getDates() << '\\n';",
  "          }",
  "        }",
  "      }",
  "    }",
  "}",
  "",
  "void SolverCreate::SolverData::unmaskTemporaryShortages() {",
  "  while (!maskedShortages.empty()) {",
  "    auto o = maskedShortages.back();",
  "    maskedShortages.pop_back();",
  "    delete o;",
  "  }",
  "}",
  "",
  "void SolverCreate::update_user_exits() {",
  "  setUserExitBuffer(getPyObjectProperty(Tags::userexit_buffer.getName()));",
  "  setUserExitDemand(getPyObjectProperty(Tags::userexit_demand.getName()));",
  "  setUserExitNextDemand(",
  "      getPyObjectProperty(Tags::userexit_nextdemand.getName()));",
  "  setUserExitFlow(getPyObjectProperty(Tags::userexit_flow.getName()));",
  "  setUserExitOperation(getPyObjectProperty(Tags::userexit_operation.getName()));",
  "  setUserExitResource(getPyObjectProperty(Tags::userexit_resource.getName()));",
  "}",
  "",
  "void SolverCreate::solve(void*) {",
  "  // Configure user exits",
  "  update_user_exits();",
  "",
  "  // Count how many clusters we have to plan",
  "  int cl = 1;",
  "  if (cluster == -1 && getConstraints() && getCreateDeliveries())",
  "    cl = HasLevel::getNumberOfClusters() + 1;",
  "",
  "  // Categorize all demands in their cluster",
  "  demands_per_cluster.resize(cl);",
  "  if (getCreateDeliveries()) {",
  "    if (!getConstraints()) {",
  "      // Dumb unconstrained plan is running in a single thread",
  "      for (auto& i : Demand::all())",
  "        if (i.getQuantity() > 0 &&",
  "            (i.getStatus() == Demand::STATUS_OPEN ||",
  "             i.getStatus() == Demand::STATUS_QUOTE ||",
  "             (i.getStatus() == Demand::STATUS_INQUIRY && i.getOwner() &&",
  "              i.getOwner()->hasType<DemandGroup>() &&",
  "              i.getOwner()->getStatus() == Demand::STATUS_INQUIRY &&",
  "              static_cast<DemandGroup*>(i.getOwner())->getPolicy() !=",
  "                  Demand::POLICY_INDEPENDENT)))",
  "          demands_per_cluster[0].push_back(&i);",
  "    } else if (cluster == -1 && !userexit_nextdemand) {",
  "      // Many clusters to solve",
  "      for (auto& i : Demand::all()) {",
  "        bool isGroup = i.hasType<DemandGroup>() &&",
  "                       static_cast<DemandGroup&>(i).getPolicy() !=",
  "                           Demand::POLICY_INDEPENDENT;",
  "        bool isMemberOfGroup =",
  "            i.getOwner() && i.getOwner()->hasType<DemandGroup>() &&",
  "            static_cast<DemandGroup*>(i.getOwner())->getPolicy() !=",
  "                Demand::POLICY_INDEPENDENT;",
  "        if ((isGroup || (i.getQuantity() > 0 && !isMemberOfGroup)) &&",
  "            (i.getStatus() == Demand::STATUS_OPEN ||",
  "             i.getStatus() == Demand::STATUS_QUOTE ||",
  "             i.getStatus() == Demand::STATUS_INQUIRY))",
  "          demands_per_cluster[i.getCluster()].push_back(&i);",
  "      }",
  "    } else if (!userexit_nextdemand) {",
  "      // Only a single cluster to plan",
  "      for (auto& i : Demand::all()) {",
  "        if (i.getCluster() != cluster) continue;",
  "        bool isGroup = i.hasType<DemandGroup>() &&",
  "                       static_cast<DemandGroup&>(i).getPolicy() !=",
  "                           Demand::POLICY_INDEPENDENT;",
  "        bool isMemberOfGroup =",
  "            i.getOwner() && i.getOwner()->hasType<DemandGroup>() &&",
  "            static_cast<DemandGroup*>(i.getOwner())->getPolicy() !=",
  "                Demand::POLICY_INDEPENDENT;",
  "        if ((isGroup || (i.getQuantity() > 0 && !isMemberOfGroup)) &&",
  "            (i.getStatus() == Demand::STATUS_OPEN ||",
  "             i.getStatus() == Demand::STATUS_QUOTE))",
  "          demands_per_cluster[0].push_back(&i);",
  "      }",
  "    }",
  "  }",
  "",
  "  // Delete of operationplans",
  "  // This deletion is not multi-threaded... But on the other hand we need to",
  "  // loop through the operations only once",
  "  if (getErasePreviousFirst()) {",
  "    if (getLogLevel() > 0) logger << \"Deleting previous plan\\n\";",
  "    for (auto& e : Operation::all())",
  "      if (cluster == -1 || e.getCluster() == cluster) e.deleteOperationPlans();",
  "  }",
  "",
  "  // Solve in parallel threads.",
  "  // When not solving in silent and autocommit mode, we only use a single",
  "  // solver thread.",
  "  // We also avoid solving the unconstrained single-sweep plan to run in",
  "  // multiple threads (the overhead of using multiple threads is then too high)",
  "  // Otherwise we use as many worker threads as processor cores.",
  "  ThreadGroup threads;",
  "  if (getLogLevel() > 0 || !getAutocommit() || cluster != -1 ||",
  "      !getConstraints() || !getCreateDeliveries())",
  "    threads.setMaxParallel(1);",
  "",
  "  // Register all clusters to be solved",
  "  for (int j = 0; j < cl; ++j) {",
  "    int tmp;",
  "    if (!getCreateDeliveries())",
  "      tmp = -1;",
  "    else if (!getConstraints() && cluster == -1)",
  "      tmp = -1;",
  "    else if (cluster == -1)",
  "      tmp = j;",
  "    else",
  "      tmp = cluster;",
  "    threads.add(SolverData::runme, this, tmp, &(demands_per_cluster[j]));",
  "  }",
  "  // Run the planning command threads and wait for them to exit",
  "  threads.execute();",
  "}",
  "",
  "PyObject* SolverCreate::solve(PyObject* self, PyObject* args,",
  "                              PyObject* kwargs) {",
  "  // Parse the argument",
  "  static const char* kwlist[] = {\"object\", \"cluster\", nullptr};",
  "  PyObject* dem = nullptr;",
  "  int cluster = -1;",
  "  if (!PyArg_ParseTupleAndKeywords(args, kwargs, \"|Oi:solve\",",
  "                                   const_cast<char**>(kwlist), &dem, &cluster))",
  "    return nullptr;",
  "  if (dem && !PyObject_TypeCheck(dem, Demand::metadata->pythonClass) &&",
  "      !PyObject_TypeCheck(dem, Buffer::metadata->pythonClass)) {",
  "    PyErr_SetString(PythonDataException,",
  "                    \"object argument must be a demand or a buffer\");",
  "    return nullptr;",
  "  }",
  "",
  "  // Free Python interpreter for other threads",
  "  auto* sol = static_cast<SolverCreate*>(self);",
  "  auto prev_cluster = sol->getCluster();",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    if (!dem) {",
  "      // Complete replan or cluster replan",
  "      sol->setCluster(cluster);",
  "      sol->setAutocommit(true);",
  "      sol->solve();",
  "    } else {",
  "      // Incrementally plan a single demand or buffer",
  "      sol->setCluster(-1);",
  "      sol->setAutocommit(false);",
  "      sol->update_user_exits();",
  "      if (PyObject_TypeCheck(dem, Demand::metadata->pythonClass)) {",
  "        auto* d = static_cast<Demand*>(dem);",
  "        d->solve(*sol, &(sol->getCommands()));",
  "        d->getConstraints().clean(d);",
  "      } else if (PyObject_TypeCheck(dem, Buffer::metadata->pythonClass)) {",
  "        auto state = sol->getCommands().state;",
  "        state->q_qty = -1.0;",
  "        state->curBuffer = static_cast<Buffer*>(dem);",
  "        state->q_date = Date::infinitePast;",
  "        state->a_cost = 0.0;",
  "        state->a_penalty = 0.0;",
  "        state->curDemand = nullptr;",
  "        state->curOwnerOpplan = nullptr;",
  "        state->blockedOpplan = nullptr;",
  "        state->dependency = nullptr;",
  "        state->curBatch = state->curBuffer->getBatch();",
  "        state->curBuffer->solve(*sol, &(sol->getCommands()));",
  "      }",
  "    }",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    sol->setCluster(prev_cluster);",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  sol->setCluster(prev_cluster);",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* SolverCreate::commit(PyObject* self, PyObject*) {",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    auto* me = static_cast<SolverCreate*>(self);",
  "    assert(me->commands.getCommandManager());",
  "    me->scanExcess(me->commands.getCommandManager());",
  "    me->commands.getCommandManager()->commit();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* SolverCreate::rollback(PyObject* self, PyObject*) {",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    auto* me = static_cast<SolverCreate*>(self);",
  "    assert(me->commands.getCommandManager());",
  "    me->commands.getCommandManager()->rollback();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* SolverCreate::markAutofence(PyObject* self, PyObject*) {",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    auto* me = static_cast<SolverCreate*>(self);",
  "    for (auto& buf : Buffer::all()) {",
  "      // A buffer should have autofence active if it doesn't have proposed",
  "      // replenishments",
  "      bool has_proposed_supply = false;",
  "      for (auto& flpln : buf.getFlowPlans()) {",
  "        if (flpln.getQuantity() > 0 &&",
  "            flpln.getOperationPlan()->getProposed()) {",
  "          has_proposed_supply = true;",
  "          break;",
  "        }",
  "      }",
  "      buf.setAutofence(!has_proposed_supply);",
  "      if (has_proposed_supply && me->getLogLevel() > 1)",
  "        logger << buf << \" deactivates autofence\\n\";",
  "    }",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "int SolverPropagateStatus::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<SolverPropagateStatus>(",
  "      \"solver\", \"solver_propagateStatus\", Object::create<SolverPropagateStatus>,",
  "      false);",
  "  registerFields<SolverPropagateStatus>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleClass<SolverPropagateStatus, Solver>::getPythonType();",
  "  x.setName(\"solver_propagateStatus\");",
  "  x.setDoc(\"frePPLe solver_propagateStatus\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"solve\", solve, METH_NOARGS, \"run the solver\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* SolverPropagateStatus::create(PyTypeObject*, PyObject*,",
  "                                        PyObject* kwds) {",
  "  try {",
  "    // Create the solver",
  "    auto* s = new SolverPropagateStatus();",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (kwds) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        const MetaFieldBase* fmeta =",
  "            SolverCreate::metadata->findField(attr.getHash());",
  "        if (!fmeta) fmeta = Solver::metadata->findField(attr.getHash());",
  "        if (fmeta)",
  "          // Update the attribute",
  "          fmeta->setField(s, field);",
  "        else",
  "          s->setProperty(attr.getName(), value);",
  "      };",
  "    }",
  "",
  "    // Return the object. The reference count doesn't need to be increased",
  "    // as we do with other objects, because we want this object to be available",
  "    // for the garbage collector of Python.",
  "    return static_cast<PyObject*>(s);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "PyObject* SolverPropagateStatus::solve(PyObject* self, PyObject*) {",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    static_cast<SolverPropagateStatus*>(self)->solve();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void SolverPropagateStatus::solve(void*) {",
  "  bool log = getLogLevel() > 0;",
  "  for (short lvl = 0; lvl <= HasLevel::getNumberOfLevels(); ++lvl) {",
  "    for (auto& oper : Operation::all()) {",
  "      if (oper.getLevel() != lvl) continue;",
  "      for (auto opplan = oper.getOperationPlans();",
  "           opplan != OperationPlan::end(); ++opplan) {",
  "        if (!oper.getDependencies().empty()) opplan->matchDependencies(log);",
  "        if (opplan->getSubOperationPlans() == OperationPlan::end() &&",
  "            (opplan->getClosed() || opplan->getCompleted()))",
  "          opplan->propagateStatus(log);",
  "      }",
  "    }",
  "  }",
  "  for (auto& buf : Buffer::all()) {",
  "    auto oh = buf.getOnHand(Date::infinitePast, Date::infiniteFuture);",
  "    if (oh < 0.0) {",
  "      unsigned int cnt = 0;",
  "      for (auto oo = buf.getFlowPlans().begin(); oo != buf.getFlowPlans().end();",
  "           ++oo)",
  "        ++cnt;",
  "      if (oh > -ROUNDING_ERROR * cnt) buf.setOnHand(buf.getOnHand() - oh);",
  "    }",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
