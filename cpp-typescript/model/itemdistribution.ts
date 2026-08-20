// <header-api-generated>
export const ItemDistributionCppModel = { bases: ["HasSource","Node","Object"] as const, methods: ["create","deleteOperationPlans","finder","getBatchWindow","getCost","getDestination","getFence","getItem","getLeadTime","getOperations","getOrigin","getResource","getResourceQuantity","getSizeMaximum","getSizeMinimum","getSizeMultiple","getType","initialize","registerFields","setBatchWindow","setCost","setDestination","setFence","setItem","setLeadTime","setOrigin","setResource","setResourceQuantity","setSizeMaximum","setSizeMinimum","setSizeMultiple"] as const, qualifiedNames: ["ItemDistribution"] as const };

export const ItemDistributionOperationIteratorCppModel = { bases: [] as const, methods: ["next"] as const, qualifiedNames: ["ItemDistribution::OperationIterator"] as const };

export const OperationItemDistributionCppModel = { bases: ["OperationFixedTime"] as const, methods: ["findOrCreate","getDestination","getItemDistribution","getOrderType","getOrigin","getType","initialize","registerFields","solve","trimExcess"] as const, qualifiedNames: ["OperationItemDistribution"] as const };
// </header-api-generated>















import { Date as PlanningDate, DateRange, Duration } from "../utils/date.js";
import { AssociationEntity, DataException, Environment, HeaderModelAdapter, LogicException } from "../utils/library.js";
import type { Buffer } from "./buffer.js";
import { FlowEnd, FlowStart } from "./flow.js";
import type { Item } from "./item.js";
import { LoadDefault } from "./load.js";
import type { Location } from "./location.js";
import { Operation, OperationFixedTime } from "./operation.js";
import type { Resource } from "./resource.js";

type DurationInput = Duration | number | string;

export interface ItemDistributionFinder {
  readonly item?: Item | null;
  readonly origin?: Location | null;
  readonly destination?: Location | null;
  readonly effective_start?: PlanningDate | string | number;
  readonly effective_end?: PlanningDate | string | number;
  readonly priority?: number;
  readonly name?: string;
}

function duration(value: DurationInput): Duration { return value instanceof Duration ? new Duration(value) : new Duration(value); }
function call(target: unknown, method: string, ...args: readonly unknown[]): unknown {
  if (!target || typeof target !== "object") return undefined;
  const callback = Reflect.get(target, method);
  return typeof callback === "function" ? Reflect.apply(callback, target, args) : undefined;
}
function nameOf(target: unknown): string { return String(call(target, "getName") ?? ""); }
function sameDate(left: PlanningDate, right: PlanningDate | string | number | undefined): boolean {
  return right === undefined || left.equals(right instanceof PlanningDate ? right : new PlanningDate(right));
}
function relink(source: HeaderModelAdapter, property: string, previous: HeaderModelAdapter | null, next: HeaderModelAdapter | null): void {
  if (previous === next) return;
  previous?.modelReferenceRemoved(source, property);
  next?.modelReferenceAdded(source, property);
}

export class ItemDistribution extends AssociationEntity<Location, Item> {
  static readonly cppBases: readonly string[] = ["HasSource", "Node", "Object"];
  static readonly cppQualifiedNames: readonly string[] = ["ItemDistribution"];
  private origin: Location | null = null;
  private resource: Resource | null = null;
  private leadtime = new Duration();
  private sizeMinimum = 1;
  private sizeMultiple = 1;
  private sizeMaximum = Number.MAX_VALUE;
  private cost = 0;
  private resourceQuantity = 1;
  private fence = new Duration();
  private batchWindow = new Duration();
  private readonly operations: OperationItemDistribution[] = [];

  constructor(item?: Item | null, origin?: Location | null, destination?: Location | null, priority = 1, effective?: DateRange) {
    super();
    this.setItem(item ?? null);
    this.setOrigin(origin ?? null);
    this.setDestination(destination ?? null);
    this.setPriority(priority);
    if (effective) this.setEffective(effective);
  }

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  static create(fields: ItemDistributionFinder): ItemDistribution {
    return new ItemDistribution(fields.item ?? null, fields.origin ?? null, fields.destination ?? null, fields.priority ?? 1);
  }
  create(fields: ItemDistributionFinder): ItemDistribution { return ItemDistribution.create(fields); }
  getType(): string { return "itemdistribution"; }
  getItem(): Item | null { return this.getPtrB(); }
  setItem(value: Item | null): void { this.assignPtrB(value, "Item"); }
  getOrigin(): Location | null { return this.origin; }
  setOrigin(value: Location | null): void {
    if (!value) return;
    if (value === this.getDestination()) throw new LogicException("Source and destination of an ItemDistribution must be different");
    if (this.origin) throw new DataException("Can't reassign existing association");
    this.origin = value;
    value.modelReferenceAdded(this, "Origin");
  }
  getDestination(): Location | null { return this.getPtrA(); }
  setDestination(value: Location | null): void {
    if (value === this.origin && value) throw new LogicException("Source and destination of an ItemDistribution must be different");
    this.assignPtrA(value, "Destination");
  }
  getResource(): Resource | null { return this.resource; }
  setResource(value: Resource | null): void {
    relink(this, "Resource", this.resource, value);
    this.resource = value;
  }
  getLeadTime(): Duration { return new Duration(this.leadtime); }
  setLeadTime(value: DurationInput): void {
    const next = duration(value);
    if (next.seconds < 0) Environment.log("Warning: ItemDistribution can't have a negative lead time");
    else this.leadtime = next;
  }
  getSizeMinimum(): number { return this.sizeMinimum; }
  setSizeMinimum(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: ItemDistribution can't have a negative minimum size");
    else this.sizeMinimum = Number(value);
  }
  getSizeMultiple(): number { return this.sizeMultiple; }
  setSizeMultiple(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: ItemDistribution can't have a negative multiple size");
    else this.sizeMultiple = Number(value);
  }
  getSizeMaximum(): number { return this.sizeMaximum; }
  setSizeMaximum(value: number): void {
    const next = Number(value);
    if (next < this.sizeMinimum) Environment.log("Warning: ItemDistribution maximum size must be higher than the minimum size");
    else if (next <= 0) Environment.log("Warning: ItemDistribution maximum size must be positive");
    else this.sizeMaximum = next;
  }
  getCost(): number { return this.cost; }
  setCost(value: number): void { this.cost = Math.max(Number(value), 0); }
  getResourceQuantity(): number { return this.resourceQuantity; }
  setResourceQuantity(value: number): void {
    if (Number(value) < 0) Environment.log("Warning: Resource_quantity must be positive");
    else this.resourceQuantity = Number(value);
  }
  getFence(): Duration { return new Duration(this.fence); }
  setFence(value: DurationInput): void { this.fence = duration(value); }
  getBatchWindow(): Duration { return new Duration(this.batchWindow); }
  setBatchWindow(value: DurationInput): void { this.batchWindow = duration(value); }
  getOperations(): ItemDistributionOperationIterator { return new ItemDistributionOperationIterator(this); }
  attachOperation(operation: OperationItemDistribution): void { if (!this.operations.includes(operation)) this.operations.unshift(operation); }
  detachOperation(operation: OperationItemDistribution): void {
    const index = this.operations.indexOf(operation);
    if (index >= 0) this.operations.splice(index, 1);
  }
  operationSnapshot(): readonly OperationItemDistribution[] { return [...this.operations]; }
  deleteOperationPlans(deleteLockedOpplans = false): void {
    for (const operation of [...this.operations]) call(operation, "deleteOperationPlans", deleteLockedOpplans);
  }

  static finder(fields: ItemDistributionFinder): ItemDistribution | null {
    if (!fields.item || !fields.origin || !fields.destination) return null;
    for (const association of ItemDistribution.all()) {
      if (association.getItem() !== fields.item || association.getOrigin() !== fields.origin || association.getDestination() !== fields.destination) continue;
      if (!sameDate(association.getEffectiveStart(), fields.effective_start)) continue;
      if (!sameDate(association.getEffectiveEnd(), fields.effective_end)) continue;
      if (fields.priority !== undefined && association.getPriority() !== Math.trunc(fields.priority)) continue;
      if (fields.name !== undefined && association.getName() !== fields.name) continue;
      return association;
    }
    return null;
  }
  finder(fields: ItemDistributionFinder): ItemDistribution | null { return ItemDistribution.finder(fields); }

  override modelReferenceTargetDisposed(target: HeaderModelAdapter, property: string): void {
    if (property === "Origin" || property === "Destination") this.dispose();
    else if (property === "Resource") this.setResource(null);
    else super.modelReferenceTargetDisposed(target, property);
  }
  override dispose(): void {
    for (const operation of [...this.operations]) operation.dispose();
    if (this.origin) this.origin.modelReferenceRemoved(this, "Origin");
    this.origin = null;
    this.setResource(null);
    super.dispose();
  }
}

export class ItemDistributionOperationIterator implements Iterable<OperationItemDistribution> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["ItemDistribution::OperationIterator"] as const;
  private readonly values: readonly OperationItemDistribution[];
  private index = 0;
  constructor(distribution?: ItemDistribution | null) { this.values = distribution?.operationSnapshot() ?? []; }
  next(): OperationItemDistribution | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<OperationItemDistribution> { return this.values[Symbol.iterator](); }
}

export class OperationItemDistribution extends OperationFixedTime {
  static override modelFamily = "Operation";
  static override readonly cppBases = ["OperationFixedTime"] as const;
  static override readonly cppQualifiedNames = ["OperationItemDistribution"] as const;
  private owner: ItemDistribution | null = null;
  private origin: Buffer | null = null;
  private destination: Buffer | null = null;
  private disposed = false;

  constructor(owner?: ItemDistribution | null, origin?: Buffer | null, destination?: Buffer | null) {
    super();
    if (!owner && !origin && !destination) return;
    if (!owner) throw new LogicException("An OperationItemDistribution always needs to point to an ItemDistribution");
    if (!origin && !destination) throw new LogicException("An OperationItemDistribution always needs to point to a destination and/or a source buffer");
    if (origin && destination && origin === destination) throw new LogicException("Source and destination of an OperationItemDistribution must be different");
    this.owner = owner;
    this.origin = origin ?? null;
    this.destination = destination ?? null;
    this.origin?.modelReferenceAdded(this, "Origin");
    this.destination?.modelReferenceAdded(this, "Destination");
    this.setName(OperationItemDistribution.makeName(owner, this.origin, this.destination));
    this.setDuration(owner.getLeadTime());
    this.setSizeMultiple(owner.getSizeMultiple());
    this.setSizeMinimum(owner.getSizeMinimum());
    this.setSizeMaximum(owner.getSizeMaximum());
    this.setSource(owner.getSource());
    this.setCost(owner.getCost());
    this.setFence(owner.getFence());
    this.setBatchWindow(owner.getBatchWindow());
    this.setHidden(true);
    this.setLocation((call(this.destination ?? this.origin, "getLocation") as Location | null | undefined) ?? null);
    if (this.destination) new FlowEnd(this, this.destination, 1);
    if (this.origin) new FlowStart(this, this.origin, -1);
    if (owner.getResource()) new LoadDefault(this, owner.getResource(), owner.getResourceQuantity());
    owner.attachOperation(this);
  }

  private static makeName(owner: ItemDistribution, origin: Buffer | null, destination: Buffer | null): string {
    const item = call(destination ?? origin, "getItem");
    const sourceBatch = String(call(origin, "getBatch") ?? "");
    const destinationBatch = String(call(destination, "getBatch") ?? "");
    const batch = sourceBatch || destinationBatch;
    const from = origin ? ` from ${nameOf(call(origin, "getLocation"))}` : "";
    const to = destination ? ` to ${nameOf(call(destination, "getLocation"))}` : "";
    const effective = owner.getEffectiveStart().isInitialized() ? ` valid from ${owner.getEffectiveStart().toString()}` : "";
    return `Ship ${nameOf(item)}${batch ? ` @ ${batch}` : ""}${from}${to}${effective}`;
  }
  static findOrCreate(owner: ItemDistribution, origin: Buffer, destination: Buffer): OperationItemDistribution {
    if (!owner || !origin || !destination) throw new LogicException("An OperationItemDistribution always needs to point to a ItemDistribution, a source buffer and a destination buffer");
    if (origin === destination) throw new LogicException("Source and destination of an OperationItemDistribution must be different");
    const operationName = OperationItemDistribution.makeName(owner, origin, destination);
    const existing = Operation.find(operationName);
    if (existing) {
      if (existing instanceof OperationItemDistribution) return existing;
      throw new DataException(`Name clash on operation ${operationName}`);
    }
    return new OperationItemDistribution(owner, origin, destination);
  }
  findOrCreate(owner: ItemDistribution, origin: Buffer, destination: Buffer): OperationItemDistribution { return OperationItemDistribution.findOrCreate(owner, origin, destination); }
  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "operation_itemdistribution"; }
  getItemDistribution(): ItemDistribution | null { return this.owner; }
  getOrigin(): Buffer | null { return this.origin; }
  getDestination(): Buffer | null { return this.destination; }
  override getOrderType(): string { return "DO"; }
  override deleteOperationPlans(deleteLockedOpplans = false): void { super.deleteOperationPlans(deleteLockedOpplans); }
  override solve(solver: unknown, payload?: unknown): unknown { return call(solver, "solve", this, payload); }
  trimExcess(): void {
    const plans = call(this.destination, "getFlowPlans");
    if (!plans || typeof (plans as Iterable<unknown>)[Symbol.iterator] !== "function") return;
    for (const plan of plans as Iterable<unknown>) call(plan, "trimExcess", this, false);
  }
  override modelReferenceTargetDisposed(_target: HeaderModelAdapter, property: string): void {
    if (property === "Origin" || property === "Destination") this.dispose();
    else super.modelReferenceTargetDisposed(_target, property);
  }
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner?.detachOperation(this);
    this.origin?.modelReferenceRemoved(this, "Origin");
    this.destination?.modelReferenceRemoved(this, "Destination");
    this.owner = null;
    this.origin = null;
    this.destination = null;
    super.dispose();
  }
}














/**
 * Semantic migration unit for src/model/itemdistribution.cpp.
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
  { name: "ItemDistribution::initialize", sourceLine: 34, status: "adapted" },
  { name: "ItemDistribution::ItemDistribution", sourceLine: 56, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 60, status: "adapted" },
  { name: "ItemDistribution::~ItemDistribution", sourceLine: 63, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 72, status: "adapted" },
  { name: "ItemDistribution::create", sourceLine: 75, status: "adapted" },
  { name: "ItemDistribution::setItem", sourceLine: 142, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 145, status: "adapted" },
  { name: "ItemDistribution::deleteOperationPlans", sourceLine: 148, status: "adapted" },
  { name: "OperationItemDistribution::initialize", sourceLine: 153, status: "adapted" },
  { name: "OperationItemDistribution::findOrCreate", sourceLine: 175, status: "adapted" },
  { name: "OperationItemDistribution::OperationItemDistribution", sourceLine: 203, status: "adapted" },
  { name: "OperationItemDistribution::~OperationItemDistribution", sourceLine: 254, status: "adapted" },
  { name: "OperationItemDistribution::getOrigin", sourceLine: 272, status: "adapted" },
  { name: "OperationItemDistribution::getDestination", sourceLine: 278, status: "adapted" },
  { name: "ItemDistribution::finder", sourceLine: 284, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface HasLevelPort {
  triggerLazyRecomputation(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemDistributionPort {
  ItemDistribution(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  deleteOperationPlans(...args: readonly PortValue[]): PortValue | void;
  disposeItemDistribution(...args: readonly PortValue[]): PortValue | void;
  finder(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
  setItem(...args: readonly PortValue[]): PortValue | void;
}

export interface OperationItemDistributionPort {
  OperationItemDistribution(...args: readonly PortValue[]): PortValue | void;
  disposeOperationItemDistribution(...args: readonly PortValue[]): PortValue | void;
  findOrCreate(...args: readonly PortValue[]): PortValue | void;
  getDestination(...args: readonly PortValue[]): PortValue | void;
  getOrigin(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/model/itemdistribution.cpp";
export const targetFile = "model/itemdistribution.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2015 by frePPLe bv                                        *",
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
  "const MetaCategory* ItemDistribution::metacategory;",
  "const MetaClass* ItemDistribution::metadata;",
  "const MetaClass* OperationItemDistribution::metadata;",
  "",
  "int ItemDistribution::initialize() {",
  "  // Initialize the metadata",
  "  metacategory = MetaCategory::registerCategory<ItemDistribution>(",
  "      \"itemdistribution\", \"itemdistributions\",",
  "      Association<Location, Location, ItemDistribution>::reader, finder);",
  "  metadata = MetaClass::registerClass<ItemDistribution>(",
  "      \"itemdistribution\", \"itemdistribution\", Object::create<ItemDistribution>,",
  "      true);",
  "  registerFields<ItemDistribution>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<ItemDistribution>::getPythonType();",
  "  x.setName(\"itemdistribution\");",
  "  x.setDoc(\"frePPLe itemdistribution\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.supportcreate(create);",
  "  x.addMethod(\"toXML\", toXML, METH_VARARGS, \"return a XML representation\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "ItemDistribution::ItemDistribution() {",
  "  initType(metadata);",
  "",
  "  // Trigger level and cluster recomputation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "ItemDistribution::~ItemDistribution() {",
  "  // Delete the association from the related objects",
  "  if (getItem()) getItem()->distributions.erase(this);",
  "  if (getDestination()) getDestination()->distributions.erase(this);",
  "",
  "  // Delete all owned distribution operations",
  "  while (firstOperation) delete firstOperation;",
  "",
  "  // Trigger level and cluster recomputation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "PyObject* ItemDistribution::create(PyTypeObject* , PyObject* ,",
  "                                   PyObject* kwds) {",
  "  try {",
  "    // Pick up the item",
  "    PyObject* it = PyDict_GetItemString(kwds, \"item\");",
  "    if (!it) throw DataException(\"missing item on ItemDistribution\");",
  "    if (!PyObject_TypeCheck(it, Item::metadata->pythonClass))",
  "      throw DataException(\"ItemDistribution item must be of type item\");",
  "",
  "    /* XXX",
  "    // Pick up the priority",
  "    PyObject* q1 = PyDict_GetItemString(kwds,\"priority\");",
  "    int q2 = q1 ? PythonData(q1).getInt() : 1;",
  "",
  "    // Pick up the effective dates",
  "    DateRange eff;",
  "    PyObject* eff_start = PyDict_GetItemString(kwds,\"effective_start\");",
  "    if (eff_start)",
  "    {",
  "      PythonData d(eff_start);",
  "      eff.setStart(d.getDate());",
  "    }",
  "    PyObject* eff_end = PyDict_GetItemString(kwds,\"effective_end\");",
  "    if (eff_end)",
  "    {",
  "      PythonData d(eff_end);",
  "      eff.setEnd(d.getDate());",
  "    }",
  "    */",
  "",
  "    // Create the ItemDistribution",
  "    auto* l = new ItemDistribution();",
  "    l->setItem(static_cast<Item*>(it));",
  "",
  "    // Iterate over extra keywords, and set attributes.   @todo move this",
  "    // responsibility to the readers...",
  "    if (l) {",
  "      PyObject *key, *value;",
  "      Py_ssize_t pos = 0;",
  "      while (PyDict_Next(kwds, &pos, &key, &value)) {",
  "        PythonData field(value);",
  "        PyObject* key_utf8 = PyUnicode_AsUTF8String(key);",
  "        DataKeyword attr(PyBytes_AsString(key_utf8));",
  "        Py_DECREF(key_utf8);",
  "        if (!attr.isA(Tags::item) && !attr.isA(Tags::type) &&",
  "            !attr.isA(Tags::action)) {",
  "          const MetaFieldBase* fmeta = l->getType().findField(attr.getHash());",
  "          if (!fmeta && l->getType().category)",
  "            fmeta = l->getType().category->findField(attr.getHash());",
  "          if (fmeta)",
  "            // Update the attribute",
  "            fmeta->setField(l, field);",
  "          else",
  "            l->setProperty(attr.getName(), value);",
  "        }",
  "      };",
  "    }",
  "",
  "    // Return the object",
  "    Py_INCREF(l);",
  "    return static_cast<PyObject*>(l);",
  "  } catch (...) {",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "}",
  "",
  "void ItemDistribution::setItem(Item* i) {",
  "  if (!i) return;",
  "  setPtrB(i, i->getDistributions());",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "void ItemDistribution::deleteOperationPlans(bool b) {",
  "  for (OperationItemDistribution* i = firstOperation; i; i = i->nextOperation)",
  "    i->deleteOperationPlans(b);",
  "}",
  "",
  "int OperationItemDistribution::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaClass::registerClass<OperationItemDistribution>(",
  "      \"operation\", \"operation_itemdistribution\");",
  "  registerFields<OperationItemDistribution>(const_cast<MetaClass*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<OperationItemDistribution>::getPythonType();",
  "  x.setName(\"operation_itemdistribution\");",
  "  x.setDoc(\"frePPLe operation_itemdistribution\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.addMethod(\"decoupledLeadTime\", &getDecoupledLeadTimePython, METH_VARARGS,",
  "              \"return the total lead time\");",
  "  x.addMethod(\"setFence\", &setFencePython, METH_VARARGS,",
  "              \"Update the fence based on date\");",
  "  x.addMethod(\"getFence\", &getFencePython, METH_NOARGS,",
  "              \"Retrieve the fence date\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "Operation* OperationItemDistribution::findOrCreate(ItemDistribution* i,",
  "                                                   Buffer* src, Buffer* dest) {",
  "  if (!i || !src || !dest)",
  "    throw LogicException(",
  "        \"An OperationItemDistribution always needs to point to \"",
  "        \"a ItemDistribution, a source buffer and a destination buffer\");",
  "  if (dest == src)",
  "    throw LogicException(",
  "        \"Source and destination of an OperationItemDistribution must be \"",
  "        \"different\");",
  "  stringstream o;",
  "  o << \"Ship \" << dest->getItem()->getName();",
  "  if (src->getBatch())",
  "    o << \" @ \" << src->getBatch();",
  "  else if (dest->getBatch())",
  "    o << \" @ \" << dest->getBatch();",
  "  o << \" from \" << src->getLocation()->getName() << \" to \"",
  "    << dest->getLocation()->getName();",
  "  if (i->getEffectiveStart()) o << \" valid from \" << i->getEffectiveStart();",
  "  auto oper = Operation::find(o.str());",
  "  if (oper) {",
  "    if (!oper->hasType<OperationItemDistribution>())",
  "      throw DataException(\"Name clash on operation \" + o.str());",
  "    return oper;",
  "  } else",
  "    return new OperationItemDistribution(i, src, dest);",
  "}",
  "",
  "OperationItemDistribution::OperationItemDistribution(ItemDistribution* i,",
  "                                                     Buffer* src, Buffer* dest)",
  "    : itemdist(i) {",
  "  if (!i)",
  "    throw LogicException(",
  "        \"An OperationItemDistribution always needs to point to an \"",
  "        \"ItemDistribution\");",
  "  if (!dest && !src)",
  "    throw LogicException(",
  "        \"An OperationItemDistribution always needs to point to a destination \"",
  "        \"and/or a source buffer\");",
  "  if (dest == src)",
  "    throw LogicException(",
  "        \"Source and destination of an OperationItemDistribution must be \"",
  "        \"different\");",
  "  stringstream o;",
  "  auto item = dest ? dest->getItem() : src->getItem();",
  "  o << \"Ship \" << item->getName();",
  "  if (src && src->getBatch())",
  "    o << \" @ \" << src->getBatch();",
  "  else if (dest && dest->getBatch())",
  "    o << \" @ \" << dest->getBatch();",
  "  if (src && src->getLocation()) o << \" from \" << src->getLocation()->getName();",
  "  if (dest && dest->getLocation())",
  "    o << \" to \" << dest->getLocation()->getName();",
  "  if (i->getEffectiveStart()) o << \" valid from \" << i->getEffectiveStart();",
  "  setName(o.str());",
  "  setDuration(i->getLeadTime());",
  "  setSizeMultiple(i->getSizeMultiple());",
  "  setSizeMinimum(i->getSizeMinimum());",
  "  setSizeMaximum(i->getSizeMaximum());",
  "  setLocation(dest ? dest->getLocation() : src->getLocation());",
  "  setSource(i->getSource());",
  "  setCost(i->getCost());",
  "  setFence(i->getFence());",
  "  setBatchWindow(i->getBatchWindow());",
  "  setHidden(true);",
  "  if (dest) new FlowEnd(this, dest, 1);",
  "  if (src) new FlowStart(this, src, -1);",
  "  initType(metadata);",
  "",
  "  // Optionally, create a load",
  "  if (i->getResource())",
  "    new LoadDefault(this, i->getResource(), i->getResourceQuantity());",
  "",
  "  // Insert in the list of ItemDistribution operations.",
  "  // The list is not sorted (for performance reasons).",
  "  nextOperation = i->firstOperation;",
  "  const_cast<ItemDistribution*>(i)->firstOperation = this;",
  "}",
  "",
  "OperationItemDistribution::~OperationItemDistribution() {",
  "  // Remove from the list of operations of this item distribution",
  "  if (itemdist) {",
  "    if (itemdist->firstOperation == this) {",
  "      // We were at the head",
  "      itemdist->firstOperation = nextOperation;",
  "    } else {",
  "      // We were in the middle",
  "      OperationItemDistribution* i = itemdist->firstOperation;",
  "      while (i && i->nextOperation != this && i->nextOperation) i = i->nextOperation;",
  "      if (!i)",
  "        logger << \"Error: ItemDistribution operation list corrupted\\n\";",
  "      else",
  "        i->nextOperation = nextOperation;",
  "    }",
  "  }",
  "}",
  "",
  "Buffer* OperationItemDistribution::getOrigin() const {",
  "  for (const auto& i : getFlows())",
  "    if (i.getQuantity() < 0.0) return i.getBuffer();",
  "  return nullptr;",
  "}",
  "",
  "Buffer* OperationItemDistribution::getDestination() const {",
  "  for (const auto& i : getFlows())",
  "    if (i.getQuantity() > 0.0) return i.getBuffer();",
  "  return nullptr;",
  "}",
  "",
  "Object* ItemDistribution::finder(const DataValueDict& d) {",
  "  // Check item field",
  "  const DataValue* tmp = d.get(Tags::item);",
  "  if (!tmp) return nullptr;",
  "  Item* item = static_cast<Item*>(tmp->getObject());",
  "",
  "  // Check origin field",
  "  tmp = d.get(Tags::origin);",
  "  if (!tmp) return nullptr;",
  "  Location* origin = tmp ? static_cast<Location*>(tmp->getObject()) : nullptr;",
  "",
  "  // Check destination field",
  "  tmp = d.get(Tags::destination);",
  "  if (!tmp) return nullptr;",
  "  auto* destination = static_cast<Location*>(tmp->getObject());",
  "",
  "  // Walk over all suppliers of the item, and return",
  "  // the first one with matching",
  "  const DataValue* hasEffectiveStart = d.get(Tags::effective_start);",
  "  Date effective_start;",
  "  if (hasEffectiveStart) effective_start = hasEffectiveStart->getDate();",
  "  const DataValue* hasEffectiveEnd = d.get(Tags::effective_end);",
  "  Date effective_end;",
  "  if (hasEffectiveEnd) effective_end = hasEffectiveEnd->getDate();",
  "  const DataValue* hasPriority = d.get(Tags::priority);",
  "  int priority = 0;",
  "  if (hasPriority) priority = hasPriority->getInt();",
  "  auto itemdist_iter = item->getDistributionIterator();",
  "  while (ItemDistribution* i = itemdist_iter.next()) {",
  "    if (i->getOrigin() != origin) continue;",
  "    if (i->getDestination() != destination) continue;",
  "    if (hasEffectiveStart && i->getEffectiveStart() != effective_start)",
  "      continue;",
  "    if (hasEffectiveEnd && i->getEffectiveEnd() != effective_end) continue;",
  "    if (hasPriority && i->getPriority() != priority) continue;",
  "    return const_cast<ItemDistribution*>(&*i);",
  "  }",
  "  return nullptr;",
  "}",
  "",
  "}  // namespace frepple",
];
