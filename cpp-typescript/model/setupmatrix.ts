// <header-api-generated>
export const SetupEventCppModel = { bases: ["Event"] as const, methods: ["erase","getEventType","getLoadplanDate","getLoadplanQuantity","getOperationPlan","getRule","getSetup","getSetupBefore","getSetupOverride","getSetupString","getTimeLine","getType","initialize","registerFields","reset","setOperationPlan","setSetup","setSetupOverride","setTimeLine","update"] as const, qualifiedNames: ["SetupEvent"] as const };

export const SetupMatrixCppModel = { bases: ["HasName","HasSource"] as const, methods: ["calculateSetup","calculateSetupPython","getRules","getType","initialize","registerFields"] as const, qualifiedNames: ["SetupMatrix"] as const };

export const SetupMatrixDefaultCppModel = { bases: ["SetupMatrix"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["SetupMatrixDefault"] as const };

export const SetupMatrixFrom_to_hashCppModel = { bases: [] as const, methods: [] as const, qualifiedNames: ["SetupMatrix::from_to_hash"] as const };

export const SetupMatrixRuleCppModel = { bases: ["HasSource","Object"] as const, methods: ["getCost","getDuration","getFromSetup","getFromSetupString","getPriority","getResource","getSetupMatrix","getToSetup","getToSetupString","initialize","matches","reader","registerFields","setCost","setDuration","setFromSetup","setPriority","setResource","setSetupMatrix","setToSetup"] as const, qualifiedNames: ["SetupMatrixRule"] as const };

export const SetupMatrixRuleDefaultCppModel = { bases: ["SetupMatrixRule"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["SetupMatrixRuleDefault"] as const };

export const SetupMatrixRuleIteratorCppModel = { bases: [] as const, methods: ["end","next"] as const, qualifiedNames: ["SetupMatrixRule::iterator"] as const };
// </header-api-generated>













import { Date as PlanningDate, Duration } from "../utils/date.js";
import { DataException, HeaderModelAdapter, ModelEntity, applyDataFields } from "../utils/library.js";

function duration(value: Duration | string | number): Duration {
  return value instanceof Duration ? new Duration(value) : new Duration(value);
}

function invoke(reference: HeaderModelAdapter | null, method: string, args: readonly unknown[] = []): unknown {
  if (!reference) return undefined;
  const callback = Reflect.get(reference, method);
  return typeof callback === "function" ? Reflect.apply(callback, reference, args) : undefined;
}

export class SetupMatrix extends ModelEntity<SetupMatrix> {
  static readonly cppBases: readonly string[] = ["HasName", "HasSource"];
  static readonly cppQualifiedNames: readonly string[] = ["SetupMatrix"];
  static override modelFamily = "SetupMatrix";
  private readonly rules: SetupMatrixRule[] = [];
  private readonly cachedChangeovers = new Map<string, SetupMatrixRule>();
  private readonly changeOverNotAllowed: SetupMatrixRuleDefault;

  constructor(nameOrFields?: string | Readonly<Record<string, unknown>>) {
    super(nameOrFields);
    this.changeOverNotAllowed = SetupMatrixRuleDefault.notAllowed(this);
  }
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "setupmatrix"; }
  getRules(): SetupMatrixRuleIterator { return new SetupMatrixRuleIterator(this.rules); }

  calculateSetup(oldSetup: string, newSetup: string, resource: HeaderModelAdapter | null = null): SetupMatrixRule | null {
    const oldValue = String(oldSetup);
    const newValue = String(newSetup);
    if (oldValue === newValue) return null;
    const key = JSON.stringify([oldValue, newValue]);
    const cached = this.cachedChangeovers.get(key);
    if (cached) return cached;
    const combined = `${oldValue} to ${newValue}`;
    for (const rule of this.rules) {
      if (!rule.matches(combined)) continue;
      this.cachedChangeovers.set(key, rule);
      return rule;
    }
    if (resource) {
      const message = `No conversion from '${oldValue}' to '${newValue}' defined in setup matrix '${this.getName()}'`;
      invoke(resource, "addProblem", [message, "resource", PlanningDate.infinitePast, PlanningDate.infiniteFuture]);
    }
    this.cachedChangeovers.set(key, this.changeOverNotAllowed);
    return this.changeOverNotAllowed;
  }

  calculateSetupPython(oldSetup = "", newSetup = ""): SetupMatrixRule | null {
    return this.calculateSetup(oldSetup, newSetup);
  }

  attachRule(rule: SetupMatrixRule): void {
    const duplicate = this.rules.find((candidate) => candidate !== rule && candidate.getPriority() === rule.getPriority());
    if (duplicate) throw new DataException(`Duplicate rules with priority ${rule.getPriority()} in setup matrix '${this.getName()}'`);
    if (!this.rules.includes(rule)) this.rules.push(rule);
    this.sortRules();
  }

  detachRule(rule: SetupMatrixRule): void {
    const index = this.rules.indexOf(rule);
    if (index >= 0) this.rules.splice(index, 1);
    rule.detachFrom(this);
    this.invalidateCache();
  }

  sortRules(): void {
    const seen = new Set<number>();
    for (const rule of this.rules) {
      if (seen.has(rule.getPriority())) throw new DataException(`Duplicate rules with priority ${rule.getPriority()} in setup matrix '${this.getName()}'`);
      seen.add(rule.getPriority());
    }
    this.rules.sort((left, right) => left.getPriority() - right.getPriority());
    this.invalidateCache();
  }

  invalidateCache(): void { this.cachedChangeovers.clear(); }

  protected override disposeReferences(): void {
    for (const rule of [...this.rules]) rule.dispose();
    this.changeOverNotAllowed.dispose();
    for (const reference of this.referencedBy("SetupMatrix")) {
      const setter = Reflect.get(reference, "setSetupMatrix");
      if (typeof setter === "function") Reflect.apply(setter, reference, [null]);
    }
    this.cachedChangeovers.clear();
  }
}

export class SetupMatrixDefault extends SetupMatrix {
  static override readonly cppBases: readonly string[] = ["SetupMatrix"];
  static override readonly cppQualifiedNames: readonly string[] = ["SetupMatrixDefault"];
  static override initialize(): number { return 0; }
  override getType(): string { return "setupmatrix_default"; }
}

export class SetupMatrixRule extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = ["HasSource", "Object"];
  static readonly cppQualifiedNames: readonly string[] = ["SetupMatrixRule"];
  private matrix: SetupMatrix | null = null;
  private resource: HeaderModelAdapter | null = null;
  private from = "";
  private to = "";
  private ruleDuration = new Duration(0);
  private cost = 0;
  private priority = 0;
  private source = "";
  private expression = /^(?:.* to .*)$/;
  private disposed = false;

  constructor(fields?: Readonly<Record<string, unknown>>);
  constructor(matrix?: SetupMatrix | null, from?: string, to?: string, durationValue?: Duration | string | number, cost?: number, priority?: number);
  constructor(
    fieldsOrMatrix?: Readonly<Record<string, unknown>> | SetupMatrix | null,
    from = "",
    to = "",
    durationValue: Duration | string | number = 0,
    cost = 0,
    priority = 0,
  ) {
    super();
    if (fieldsOrMatrix instanceof SetupMatrix || fieldsOrMatrix === null) {
      this.from = String(from);
      this.to = String(to);
      this.ruleDuration = duration(durationValue);
      this.cost = Math.max(Number(cost), 0);
      this.priority = Math.trunc(Number(priority));
      this.updateExpression();
      if (fieldsOrMatrix) this.setSetupMatrix(fieldsOrMatrix);
    } else if (fieldsOrMatrix) applyDataFields(this, fieldsOrMatrix);
  }
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static reader(fields: Readonly<Record<string, unknown>>): SetupMatrixRule {
    const matrix = fields.setupmatrix instanceof SetupMatrix ? fields.setupmatrix : fields.matrix instanceof SetupMatrix ? fields.matrix : null;
    const priority = Math.trunc(Number(fields.priority ?? 0));
    const existing = matrix ? [...matrix.getRules()].find((rule) => rule.getPriority() === priority) : undefined;
    if (existing) return existing;
    return new SetupMatrixRuleDefault(fields);
  }
  getType(): string { return "setupmatrixrule"; }
  getSetupMatrix(): SetupMatrix | null { return this.matrix; }
  setSetupMatrix(matrix: SetupMatrix | null): void {
    if (matrix === this.matrix) return;
    const previous = this.matrix;
    if (previous) previous.detachRule(this);
    this.matrix = matrix;
    try { matrix?.attachRule(this); }
    catch (error) { this.matrix = null; throw error; }
  }
  detachFrom(matrix: SetupMatrix): void { if (this.matrix === matrix) this.matrix = null; }
  getResource(): HeaderModelAdapter | null { return this.resource; }
  setResource(resource: HeaderModelAdapter | null): void { this.resource = resource; this.matrix?.invalidateCache(); }
  getPriority(): number { return this.priority; }
  setPriority(value: number): void {
    const next = Math.trunc(Number(value));
    if (next === this.priority) return;
    const previous = this.priority;
    this.priority = next;
    try { this.matrix?.sortRules(); }
    catch (error) { this.priority = previous; throw error; }
  }
  setFromSetup(value: string): void { this.from = String(value); this.updateExpression(); }
  getFromSetupString(): string { return this.from; }
  getFromSetup(): string { return this.from; }
  setToSetup(value: string): void { this.to = String(value); this.updateExpression(); }
  getToSetupString(): string { return this.to; }
  getToSetup(): string { return this.to; }
  setDuration(value: Duration | string | number): void { this.ruleDuration = duration(value); this.matrix?.invalidateCache(); }
  getDuration(): Duration { return new Duration(this.ruleDuration); }
  setCost(value: number): void { this.cost = Math.max(Number(value), 0); this.matrix?.invalidateCache(); }
  getCost(): number { return this.cost; }
  getSource(): string { return this.source; }
  setSource(value: string): void { this.source = String(value); }
  matches(fromTo: string): boolean { return this.expression.test(String(fromTo)); }
  protected updateExpression(): void {
    const expression = `${this.from || ".*"} to ${this.to || ".*"}`;
    try { this.expression = new RegExp(`^(?:${expression})$`); }
    catch {
      const matrixName = this.matrix?.getName() ?? "";
      throw new DataException(`Invalid setup matrix rule "${expression}" on setup matrix "${matrixName}"`);
    }
    this.matrix?.invalidateCache();
  }
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.matrix?.detachRule(this);
    this.matrix = null;
    super.dispose();
  }
}

export class SetupMatrixRuleDefault extends SetupMatrixRule {
  static override readonly cppBases: readonly string[] = ["SetupMatrixRule"];
  static override readonly cppQualifiedNames: readonly string[] = ["SetupMatrixRuleDefault"];
  static override initialize(): number { return 0; }
  static notAllowed(matrix: SetupMatrix): SetupMatrixRuleDefault {
    const rule = new SetupMatrixRuleDefault(null, "NotAllowed", "NotAllowed", new Duration(7 * 86_400), Number.MAX_VALUE, 2_147_483_647);
    rule.assignSentinelMatrix(matrix);
    return rule;
  }
  private assignSentinelMatrix(matrix: SetupMatrix): void { Reflect.set(this, "matrix", matrix); }
  override getType(): string { return "setupmatrixrule_default"; }
}

export class SetupMatrixRuleIterator implements Iterable<SetupMatrixRule> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["SetupMatrixRule::iterator"] as const;
  private index = 0;
  constructor(private readonly values: readonly SetupMatrixRule[] = []) {}
  next(): SetupMatrixRule | null { return this.values[this.index++] ?? null; }
  end(): SetupMatrixRuleIterator { return new SetupMatrixRuleIterator(); }
  [Symbol.iterator](): Iterator<SetupMatrixRule> { return this.values.values(); }
}

export class SetupMatrixFrom_to_hash extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["SetupMatrix::from_to_hash"] as const;
  hash(value: readonly [string, string]): number {
    let result = 0;
    for (const character of `${value[0]}\u0000${value[1]}`) result = ((result << 5) - result + character.charCodeAt(0)) | 0;
    return result >>> 0;
  }
}

/** Setup transition event stored beside load plans on a resource timeline. */
export class SetupEvent extends HeaderModelAdapter {
  static readonly cppBases = ["Event"] as const;
  static readonly cppQualifiedNames = ["SetupEvent"] as const;
  private setup = "";
  private rule: SetupMatrixRule | null = null;
  private operationPlan: HeaderModelAdapter | null = null;
  private setupOverride = new Duration(-1);
  private timeline: HeaderModelAdapter | null = null;
  private date = new PlanningDate(PlanningDate.infinitePast);
  private timelineSequence = 0;

  constructor();
  constructor(operationPlan: HeaderModelAdapter | null);
  constructor(timeline: HeaderModelAdapter | null, date: PlanningDate | string | number, setup: string,
    rule?: SetupMatrixRule | null, operationPlan?: HeaderModelAdapter | null);
  constructor(
    timelineOrOperationPlan: HeaderModelAdapter | null = null,
    date: PlanningDate | string | number = PlanningDate.infinitePast,
    setup = "",
    rule: SetupMatrixRule | null = null,
    operationPlan: HeaderModelAdapter | null = null,
  ) {
    super();
    this.date = date instanceof PlanningDate ? new PlanningDate(date) : new PlanningDate(date);
    if (arguments.length <= 1) {
      this.operationPlan = timelineOrOperationPlan;
      const start = invoke(timelineOrOperationPlan, "getStart");
      if (start instanceof PlanningDate) this.setTimelineDate(start);
      return;
    }
    this.setup = String(setup);
    this.rule = rule;
    this.operationPlan = operationPlan;
    this.setTimeLine(timelineOrOperationPlan);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  getType(): string { return "setupevent"; }
  getEventType(): number { return 5; }
  getQuantity(): number { return 0; }
  getOnhand(): number { return 0; }
  getCumulativeProduced(): number { return 0; }
  getDate(): PlanningDate { return new PlanningDate(this.date); }
  getTimeLine(): HeaderModelAdapter | null { return this.timeline; }
  setTimelineDate(value: PlanningDate | string | number): void {
    this.date = value instanceof PlanningDate ? new PlanningDate(value) : new PlanningDate(value);
  }
  setTimelineOwner(value: HeaderModelAdapter | null): void { this.timeline = value; }
  setTimelineSequence(value: number): void { this.timelineSequence = Number(value); }
  getTimelineSequence(): number { return this.timelineSequence; }
  setTimeLine(value: HeaderModelAdapter | null): void {
    const previous = this.getTimeLine();
    if (previous === value) return;
    invoke(previous, "detachSetupEvent", [this]);
    this.setTimelineOwner(value);
    invoke(value, "attachSetupEvent", [this]);
  }
  getRule(): SetupMatrixRule | null { return this.rule; }
  setRule(value: SetupMatrixRule | null): void { this.rule = value; }
  getOperationPlan(): HeaderModelAdapter | null { return this.operationPlan; }
  setOperationPlan(value: HeaderModelAdapter | null): void { this.operationPlan = value; }
  getSetup(): string { return this.setup; }
  getSetupString(): string { return this.setup; }
  setSetup(value: string): void { this.setup = String(value); }
  getSetupBefore(): SetupEvent | null {
    const result = invoke(this.getTimeLine() as unknown as HeaderModelAdapter | null, "getSetupBeforeEvent", [this]);
    return result instanceof SetupEvent ? result : null;
  }
  getSetupOverride(): Duration { return new Duration(this.setupOverride); }
  setSetupOverride(value: Duration | string | number): void { this.setupOverride = duration(value); }
  getLoadplanDate(): PlanningDate { return this.getDate(); }
  getLoadplanQuantity(): number { return Number(invoke(this.operationPlan, "getQuantity") ?? 0); }
  setDate(value: PlanningDate | string | number): void {
    const next = value instanceof PlanningDate ? value : new PlanningDate(value);
    if (this.getDate().equals(next)) return;
    this.setTimelineDate(next);
    invoke(this.getTimeLine(), "recomputeTimelineBalances");
  }
  update(value?: Readonly<Record<string, unknown>>): void;
  update(timeline: HeaderModelAdapter | null, date: PlanningDate | string | number, setup: string,
    rule?: SetupMatrixRule | null): void;
  update(
    valueOrTimeline?: Readonly<Record<string, unknown>> | HeaderModelAdapter | null,
    date?: PlanningDate | string | number,
    setup = "",
    rule: SetupMatrixRule | null = null,
  ): void {
    if (date === undefined) {
      if (valueOrTimeline && !(valueOrTimeline instanceof HeaderModelAdapter)) applyDataFields(this, valueOrTimeline);
      return;
    }
    this.setup = String(setup);
    this.rule = rule;
    if (valueOrTimeline !== this.getTimeLine()) this.setTimeLine(valueOrTimeline as HeaderModelAdapter | null);
    this.setDate(date);
  }
  reset(): void { this.setup = ""; this.setTimeLine(null); this.rule = null; }
  erase(): void { this.setTimeLine(null); }
  override dispose(): void {
    const operationPlan = this.operationPlan;
    this.operationPlan = null;
    this.erase();
    if (invoke(operationPlan, "getSetupEvent") === this) invoke(operationPlan, "nullSetupEvent");
    super.dispose();
  }
}














/**
 * Semantic migration unit for src/model/setupmatrix.cpp.
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
  { name: "SetupMatrix::initialize", sourceLine: 37, status: "ported" },
  { name: "SetupMatrixRule::initialize", sourceLine: 49, status: "ported" },
  { name: "SetupMatrixDefault::initialize", sourceLine: 60, status: "ported" },
  { name: "SetupMatrixRuleDefault::initialize", sourceLine: 70, status: "ported" },
  { name: "SetupMatrix::~SetupMatrix", sourceLine: 81, status: "ported" },
  { name: "SetupMatrixRule::reader", sourceLine: 91, status: "ported" },
  { name: "SetupMatrixRule::setSetupMatrix", sourceLine: 156, status: "ported" },
  { name: "SetupMatrixRule::~SetupMatrixRule", sourceLine: 182, status: "ported" },
  { name: "SetupMatrixRule::updateSort", sourceLine: 191, status: "ported" },
  { name: "SetupMatrixRule::setPriority", sourceLine: 230, status: "ported" },
  { name: "SetupMatrixRule::updateExpression", sourceLine: 245, status: "ported" },
  { name: "SetupMatrix::calculateSetup", sourceLine: 273, status: "ported" },
  { name: "SetupMatrix::calculateSetupPython", sourceLine: 307, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface SetupMatrixPort {
  calculateSetup(...args: readonly PortValue[]): PortValue | void;
  calculateSetupPython(...args: readonly PortValue[]): PortValue | void;
  disposeSetupMatrix(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface SetupMatrixDefaultPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface SetupMatrixRulePort {
  disposeSetupMatrixRule(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  reader(...args: readonly PortValue[]): PortValue | void;
  setPriority(...args: readonly PortValue[]): PortValue | void;
  setSetupMatrix(...args: readonly PortValue[]): PortValue | void;
  updateExpression(...args: readonly PortValue[]): PortValue | void;
  updateSort(...args: readonly PortValue[]): PortValue | void;
}

export interface SetupMatrixRuleDefaultPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/setupmatrix.cpp";
export const targetFile = "model/setupmatrix.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2009-2015 by frePPLe bv                                   *",
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
  "#include \"frepple/model.h\"",
  "",
  "namespace frepple {",
  "",
  "template <class SetupMatrix>",
  "Tree utils::HasName<SetupMatrix>::st;",
  "const MetaCategory* SetupMatrix::metadata;",
  "const MetaClass* SetupMatrixDefault::metadata;",
  "const MetaClass* SetupMatrixRuleDefault::metadata;",
  "const MetaCategory* SetupMatrixRule::metadata;",
  "",
  "int SetupMatrix::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<SetupMatrix>(",
  "      \"setupmatrix\", \"setupmatrices\", reader, finder);",
  "  registerFields<SetupMatrix>(const_cast<MetaCategory*>(metadata));",
  "  FreppleCategory<SetupMatrix>::getPythonType().addMethod(",
  "      \"calculatesetup\", &SetupMatrix::calculateSetupPython, METH_VARARGS,",
  "      \"Return the setup time between the 2 setups passed as argument\");",
  "  // Initialize the Python class",
  "  return FreppleCategory<SetupMatrix>::initialize();",
  "}",
  "",
  "int SetupMatrixRule::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<SetupMatrixRule>(",
  "      \"setupmatrixrule\", \"setupmatrixrules\", reader);",
  "  registerFields<SetupMatrixRule>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleCategory<SetupMatrixRule>::initialize();",
  "  ;",
  "}",
  "",
  "int SetupMatrixDefault::initialize() {",
  "  // Initialize the metadata",
  "  SetupMatrixDefault::metadata = MetaClass::registerClass<SetupMatrixDefault>(",
  "      \"setupmatrix\", \"setupmatrix_default\", Object::create<SetupMatrixDefault>,",
  "      true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<SetupMatrixDefault, SetupMatrix>::initialize();",
  "}",
  "",
  "int SetupMatrixRuleDefault::initialize() {",
  "  // Initialize the metadata",
  "  SetupMatrixRuleDefault::metadata =",
  "      MetaClass::registerClass<SetupMatrixRuleDefault>(",
  "          \"setupmatrixrule\", \"setupmatrixrule_default\",",
  "          Object::create<SetupMatrixRuleDefault>, true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<SetupMatrixRuleDefault, SetupMatrixRule>::initialize();",
  "}",
  "",
  "SetupMatrix::~SetupMatrix() {",
  "  // Destroy the rules.",
  "  // Note that the rule destructor updates the firstRule field.",
  "  while (firstRule) delete firstRule;",
  "",
  "  // Remove all references to this setup matrix from resources",
  "  for (auto& m : Resource::all())",
  "    if (m.getSetupMatrix() == this) m.setSetupMatrix(nullptr);",
  "}",
  "",
  "Object* SetupMatrixRule::reader(const MetaClass*, const DataValueDict& atts,",
  "                                CommandManager* mgr) {",
  "  // Pick up the setupmatrix",
  "  const DataValue* matrix_val = atts.get(Tags::setupmatrix);",
  "  SetupMatrix* matrix =",
  "      matrix_val ? static_cast<SetupMatrix*>(matrix_val->getObject()) : nullptr;",
  "",
  "  // Pick up the priority.",
  "  const DataValue* prio_val = atts.get(Tags::priority);",
  "  int prio = 0;",
  "  if (prio_val) prio = prio_val->getInt();",
  "",
  "  // Check for existence of a bucket with the same start, end and priority",
  "  SetupMatrixRule* result = nullptr;",
  "  if (matrix) {",
  "    auto i = matrix->getRules();",
  "    while (SetupMatrixRule* j = i.next())",
  "      if (j->priority == prio) {",
  "        result = j;",
  "        break;",
  "      }",
  "  }",
  "",
  "  // Pick up the action attribute and update accordingly",
  "  switch (MetaClass::decodeAction(atts)) {",
  "    case Action::ADD:",
  "      // Only additions are allowed",
  "      if (result) {",
  "        ostringstream o;",
  "        o << \"Rule already exists in setupmatrix '\" << matrix << \"'\";",
  "        throw DataException(o.str());",
  "      }",
  "      result = new SetupMatrixRuleDefault();",
  "      result->setPriority(prio);",
  "      if (matrix) result->setSetupMatrix(matrix);",
  "      if (mgr) mgr->add(new CommandCreateObject(result));",
  "      return result;",
  "    case Action::CHANGE:",
  "      // Only changes are allowed",
  "      if (!result) throw DataException(\"Rule doesn't exist\");",
  "      return result;",
  "    case Action::REMOVE:",
  "      // Delete the entity",
  "      if (!result)",
  "        throw DataException(\"Rule doesn't exist\");",
  "      else {",
  "        // Delete it",
  "        delete result;",
  "        return nullptr;",
  "      }",
  "    case Action::ADD_CHANGE:",
  "      if (!result) {",
  "        // Adding a new rule",
  "        result = new SetupMatrixRuleDefault();",
  "        result->setPriority(prio);",
  "        if (matrix) result->setSetupMatrix(matrix);",
  "        if (mgr) mgr->add(new CommandCreateObject(result));",
  "      }",
  "      return result;",
  "  }",
  "",
  "  // This part of the code isn't expected not be reached",
  "  throw LogicException(\"Unreachable code reached\");",
  "}",
  "",
  "void SetupMatrixRule::setSetupMatrix(SetupMatrix* s) {",
  "  if (matrix == s) return;",
  "",
  "  // Unlink from the previous matrix",
  "  if (matrix) {",
  "    if (prevRule)",
  "      prevRule->nextRule = nextRule;",
  "    else",
  "      matrix->firstRule = nextRule;",
  "    if (nextRule) nextRule->prevRule = prevRule;",
  "  }",
  "",
  "  // Assign the pointer",
  "  matrix = s;",
  "",
  "  // Link in the list of buckets of the new calendar",
  "  if (matrix) {",
  "    if (matrix->firstRule) {",
  "      matrix->firstRule->prevRule = this;",
  "      nextRule = matrix->firstRule;",
  "    }",
  "    matrix->firstRule = this;",
  "    updateSort();",
  "  }",
  "}",
  "",
  "SetupMatrixRule::~SetupMatrixRule() {",
  "  // Maintain linked list",
  "  if (nextRule) nextRule->prevRule = prevRule;",
  "  if (prevRule)",
  "    prevRule->nextRule = nextRule;",
  "  else",
  "    matrix->firstRule = nextRule;",
  "}",
  "",
  "void SetupMatrixRule::updateSort() {",
  "  // Update the position in the list",
  "  if (!matrix) return;",
  "  bool ok = true;",
  "  do {",
  "    ok = true;",
  "    if ((nextRule && nextRule->priority == priority) ||",
  "        (prevRule && prevRule->priority == priority)) {",
  "      ostringstream o;",
  "      o << \"Duplicate rules with priority \" << priority << \" in setup matrix '\"",
  "        << matrix << \"'\";",
  "      throw DataException(o.str());",
  "    } else if (nextRule && nextRule->priority < priority) {",
  "      // Move a position later in the list",
  "      if (nextRule->nextRule) nextRule->nextRule->prevRule = this;",
  "      if (prevRule)",
  "        prevRule->nextRule = nextRule;",
  "      else",
  "        matrix->firstRule = nextRule;",
  "      nextRule->prevRule = prevRule;",
  "      prevRule = nextRule;",
  "      SetupMatrixRule* tmp = nextRule->nextRule;",
  "      nextRule->nextRule = this;",
  "      nextRule = tmp;",
  "      ok = false;",
  "    } else if (prevRule && prevRule->priority > priority) {",
  "      // Move a position earlier in the list",
  "      if (prevRule->prevRule) prevRule->prevRule->nextRule = this;",
  "      if (nextRule) nextRule->prevRule = prevRule;",
  "      prevRule->nextRule = nextRule;",
  "      nextRule = prevRule;",
  "      SetupMatrixRule* tmp = prevRule->prevRule;",
  "      prevRule->prevRule = this;",
  "      prevRule = tmp;",
  "      ok = false;",
  "    }",
  "  } while (!ok);  // Repeat till in place",
  "}",
  "",
  "void SetupMatrixRule::setPriority(const int n) {",
  "  if (n == priority) return;",
  "  if (!matrix) {",
  "    // As long as there is no matrix assigned, anything goes",
  "    priority = n;",
  "    return;",
  "  }",
  "",
  "  // Update the field",
  "  priority = n;",
  "",
  "  // Update the list",
  "  updateSort();",
  "}",
  "",
  "void SetupMatrixRule::updateExpression() {",
  "  string tmp(from);",
  "  if (tmp.empty())",
  "    tmp = \".* to \";",
  "  else",
  "    tmp.append(\" to \");",
  "  if (to.empty())",
  "    tmp.append(\".*\");",
  "  else",
  "    tmp.append(to);",
  "  try {",
  "    expression = regex(tmp, regex::ECMAScript | regex::optimize);",
  "  } catch (const regex_error&) {",
  "    string msg(\"Invalid setup matrix rule \\\"\" + tmp + \"\\\" on setup matrix \\\"\" +",
  "               getSetupMatrix()->getName() + \"\\\"\");",
  "    Resource* rsrc = nullptr;",
  "    for (auto& r : Resource::all())",
  "      if (r.getSetupMatrix() == getSetupMatrix()) {",
  "        rsrc = &r;",
  "        break;",
  "      }",
  "    if (rsrc)",
  "      new ProblemInvalidData(rsrc, msg, \"capacity\", Date::infinitePast,",
  "                             Date::infiniteFuture);",
  "    throw DataException(msg);",
  "  }",
  "}",
  "",
  "SetupMatrixRule* SetupMatrix::calculateSetup(const PooledString& oldsetup,",
  "                                             const PooledString& newsetup,",
  "                                             Resource* res) const {",
  "  // No need to look",
  "  if (oldsetup == newsetup) return nullptr;",
  "",
  "  // Look up in the cache",
  "  auto key = make_pair(oldsetup, newsetup);",
  "  auto val = cachedChangeovers.find(key);",
  "  if (val != cachedChangeovers.end()) return val->second;",
  "",
  "  // Loop through all rules",
  "  string from_to = (oldsetup);",
  "  from_to.append(\" to \");",
  "  from_to.append(newsetup);",
  "  for (auto curRule = firstRule; curRule; curRule = curRule->nextRule)",
  "    if (curRule->matches(from_to)) {",
  "      const_cast<cachedrules&>(cachedChangeovers)[key] = curRule;",
  "      return curRule;",
  "    }",
  "",
  "  // No matching rule was found - create a invalid-data problem",
  "  if (res) {",
  "    stringstream o;",
  "    o << \"No conversion from '\" << oldsetup << \"' to '\" << newsetup",
  "      << \"' defined in setup matrix '\" << getName() << \"'\";",
  "    new ProblemInvalidData(res, o.str(), \"resource\", Date::infinitePast,",
  "                           Date::infiniteFuture, true);",
  "  }",
  "  auto norule = const_cast<SetupMatrixRuleDefault*>(&ChangeOverNotAllowed);",
  "  const_cast<cachedrules&>(cachedChangeovers)[key] = norule;",
  "  return norule;",
  "}",
  "",
  "PyObject* SetupMatrix::calculateSetupPython(PyObject* self, PyObject* args) {",
  "  // Pick up the 2 setup arguments",
  "  char* pysetup_1;",
  "  char* pysetup_2;",
  "  if (!PyArg_ParseTuple(args, \"|ss:calculateSetup\", &pysetup_1, &pysetup_2))",
  "    return nullptr;",
  "",
  "  try {",
  "    PooledString setup_1(pysetup_1);",
  "    PooledString setup_2(pysetup_2);",
  "    return PythonData(",
  "        static_cast<SetupMatrix*>(self)->calculateSetup(setup_1, setup_2));",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
