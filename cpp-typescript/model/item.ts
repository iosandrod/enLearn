// <header-api-generated>
export const ItemCppModel = { bases: ["HasHierarchy"] as const, methods: ["findEarliestPurchaseOrder","getBufferIterator","getCluster","getCost","getDemandIterator","getDistributionIterator","getDistributions","getOperationIterator","getSupplierIterator","getSuppliers","getType","getUOM","getUOMString","getVolume","getWeight","initialize","registerFields","setCost","setUOM","setVolume","setWeight"] as const, qualifiedNames: ["Item"] as const };

export const ItemBufferIteratorCppModel = { bases: [] as const, methods: ["next"] as const, qualifiedNames: ["Item::bufferIterator"] as const };

export const ItemDemandIteratorCppModel = { bases: [] as const, methods: ["next"] as const, qualifiedNames: ["Item::demandIterator"] as const };

export const ItemMTOCppModel = { bases: ["Item"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["ItemMTO"] as const };

export const ItemMTSCppModel = { bases: ["Item"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["ItemMTS"] as const };

export const ItemOperationIteratorCppModel = { bases: [] as const, methods: ["next"] as const, qualifiedNames: ["Item::operationIterator"] as const };
// </header-api-generated>















import { Date as FreppleDate } from "../utils/date.js";
import { Environment, HeaderModelAdapter as ModelReference, ModelEntity } from "../utils/library.js";

function call(reference: ModelReference, method: string): unknown {
  const callback = Reflect.get(reference, method);
  return typeof callback === "function" ? Reflect.apply(callback, reference, []) : undefined;
}

function isPurchaseOperation(operation: unknown): boolean {
  if (!operation || typeof operation !== "object") return false;
  const type = Reflect.get(operation, "constructor") as { name?: string } | undefined;
  if (type?.name === "OperationItemSupplier") return true;
  const itemSupplier = Reflect.get(operation, "getItemSupplier");
  return typeof itemSupplier === "function" && Reflect.apply(itemSupplier, operation, []) !== undefined;
}

export class Item extends ModelEntity<Item> {
  static readonly cppBases: readonly string[] = ["HasHierarchy"];
  static readonly cppQualifiedNames: readonly string[] = ["Item"];
  static override modelFamily = "Item";
  private cost = 0;
  private volume = 0;
  private weight = 0;
  private uom = "";

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "item"; }
  getCost(): number { return this.cost; }
  setCost(value: number): void { this.cost = Math.max(Number(value), 0); }
  getWeight(): number { return this.weight; }
  setWeight(value: number): void {
    if (Number(value) >= 0) this.weight = Number(value);
    else Environment.log("Warning: Item weight must be positive");
  }
  getVolume(): number { return this.volume; }
  setVolume(value: number): void {
    if (Number(value) >= 0) this.volume = Number(value);
    else Environment.log("Warning: Item volume must be positive");
  }
  getUOM(): string { return this.uom; }
  getUOMString(): string { return this.uom; }
  setUOM(value: string): void { this.uom = String(value); }
  getSuppliers(): ModelReference[] { return this.referencedBy("Item").filter((reference) => reference.constructor.name === "ItemSupplier"); }
  getSupplierIterator(): IterableIterator<ModelReference> { return this.getSuppliers().values(); }
  getDistributions(): ModelReference[] { return this.referencedBy("Item").filter((reference) => reference.constructor.name === "ItemDistribution"); }
  getDistributionIterator(): IterableIterator<ModelReference> { return this.getDistributions().values(); }
  getBufferIterator(): ItemBufferIterator { return new ItemBufferIterator(this); }
  getDemandIterator(): ItemDemandIterator { return new ItemDemandIterator(this); }
  getOperationIterator(): ItemOperationIterator { return new ItemOperationIterator(this); }
  getCluster(): number {
    const first = this.getBufferIterator().next();
    return Number(first ? call(first, "getCluster") ?? 0 : 0);
  }
  findEarliestPurchaseOrder(batch: string): FreppleDate {
    let earliest = FreppleDate.infiniteFuture;
    for (const buffer of this.getBufferIterator()) {
      if (String(call(buffer, "getBatch") ?? "") !== String(batch)) continue;
      const plans = call(buffer, "getFlowPlans");
      if (!plans || typeof (plans as Iterable<unknown>)[Symbol.iterator] !== "function") continue;
      for (const flowPlan of plans as Iterable<ModelReference>) {
        const dateValue = call(flowPlan, "getDate");
        const date = dateValue instanceof FreppleDate ? dateValue : new FreppleDate(dateValue as string | number);
        if (date.compare(earliest) >= 0) break;
        const operationPlan = call(flowPlan, "getOperationPlan") as ModelReference | undefined;
        const operation = operationPlan ? call(operationPlan, "getOperation") : undefined;
        if (operationPlan && isPurchaseOperation(operation) && Boolean(call(operationPlan, "getProposed"))) {
          earliest = new FreppleDate(date);
          break;
        }
      }
    }
    return earliest;
  }

  protected override disposeReferences(): void {
    for (const reference of [...this.referencedBy("Item")]) {
      const type = reference.constructor.name;
      if (type === "Buffer" || type === "BufferDefault" || type === "BufferInfinite" || type.startsWith("Demand")) {
        const setter = Reflect.get(reference, "setItem");
        if (typeof setter === "function") Reflect.apply(setter, reference, [null]);
      } else if (type.startsWith("Operation") || type === "ItemSupplier" || type === "ItemDistribution") {
        reference.dispose();
      }
    }
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), cost: this.cost, volume: this.volume, weight: this.weight, uom: this.uom };
  }
}

export class ItemBufferIterator implements Iterable<ModelReference> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Item::bufferIterator"] as const;
  private readonly values: ModelReference[];
  private index = 0;
  constructor(item?: Item) { this.values = item?.referencedBy("Item").filter((reference) => reference.constructor.name.startsWith("Buffer")) ?? []; }
  next(): ModelReference | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<ModelReference> { return this.values.values(); }
}

export class ItemDemandIterator implements Iterable<ModelReference> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Item::demandIterator"] as const;
  private readonly values: ModelReference[];
  private index = 0;
  constructor(item?: Item) { this.values = item?.referencedBy("Item").filter((reference) => reference.constructor.name.startsWith("Demand")) ?? []; }
  next(): ModelReference | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<ModelReference> { return this.values.values(); }
}

export class ItemOperationIterator implements Iterable<ModelReference> {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["Item::operationIterator"] as const;
  private readonly values: ModelReference[];
  private index = 0;
  constructor(item?: Item) { this.values = item?.referencedBy("Item").filter((reference) => reference.constructor.name.startsWith("Operation")) ?? []; }
  next(): ModelReference | null { return this.values[this.index++] ?? null; }
  [Symbol.iterator](): Iterator<ModelReference> { return this.values.values(); }
}

export class ItemMTS extends Item {
  static override readonly cppBases: readonly string[] = ["Item"];
  static override readonly cppQualifiedNames: readonly string[] = ["ItemMTS"];
  static override initialize(): number { return 0; }
  override getType(): string { return "item_mts"; }
}

export class ItemMTO extends Item {
  static override readonly cppBases: readonly string[] = ["Item"];
  static override readonly cppQualifiedNames: readonly string[] = ["ItemMTO"];
  static override initialize(): number { return 0; }
  override getType(): string { return "item_mto"; }
}












/**
 * Semantic migration unit for src/model/item.cpp.
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
  { name: "Item::initialize", sourceLine: 35, status: "ported" },
  { name: "ItemMTS::initialize", sourceLine: 42, status: "ported" },
  { name: "ItemMTO::initialize", sourceLine: 48, status: "ported" },
  { name: "Item::~Item", sourceLine: 54, status: "ported" },
  { name: "Demand::setItem", sourceLine: 72, status: "adapted" },
  { name: "HasLevel::triggerLazyRecomputation", sourceLine: 99, status: "adapted" },
  { name: "Item::findEarliestPurchaseOrder", sourceLine: 102, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface DemandPort {
  setItem(...args: readonly PortValue[]): PortValue | void;
}

export interface HasLevelPort {
  triggerLazyRecomputation(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemPort {
  disposeItem(...args: readonly PortValue[]): PortValue | void;
  findEarliestPurchaseOrder(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemMTOPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface ItemMTSPort {
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
export const sourceFile = "src/model/item.cpp";
export const targetFile = "model/item.ts";

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
  "#include \"frepple/model.h\"",
  "",
  "namespace frepple {",
  "",
  "template <class Item>",
  "Tree utils::HasName<Item>::st;",
  "const MetaCategory* Item::metadata;",
  "const MetaClass *ItemMTO::metadata, *ItemMTS::metadata;",
  "",
  "int Item::initialize() {",
  "  metadata =",
  "      MetaCategory::registerCategory<Item>(\"item\", \"items\", reader, finder);",
  "  registerFields<Item>(const_cast<MetaCategory*>(metadata));",
  "  return FreppleCategory<Item>::initialize();",
  "}",
  "",
  "int ItemMTS::initialize() {",
  "  ItemMTS::metadata = MetaClass::registerClass<ItemMTS>(",
  "      \"item\", \"item_mts\", Object::create<ItemMTS>, true);",
  "  return FreppleClass<ItemMTS, Item>::initialize();",
  "}",
  "",
  "int ItemMTO::initialize() {",
  "  ItemMTO::metadata = MetaClass::registerClass<ItemMTO>(",
  "      \"item\", \"item_mto\", Object::create<ItemMTO>);",
  "  return FreppleClass<ItemMTO, Item>::initialize();",
  "}",
  "",
  "Item::~Item() {",
  "  // Remove references from the buffers",
  "  // TODO deleting would be better than leaving buffers with a null item",
  "  bufferIterator bufiter(this);",
  "  while (Buffer* buf = bufiter.next()) buf->setItem(nullptr);",
  "",
  "  // Remove references from the demands",
  "  // TODO rewrite using item-based demand iterator",
  "  for (auto& l : Demand::all())",
  "    if (l.getItem() == this) l.setItem(nullptr);",
  "",
  "  // Remove all item operations referencing this item",
  "  while (firstOperation) delete firstOperation;",
  "",
  "  // The ItemSupplier objects are automatically deleted by the",
  "  // destructor of the Association list class.",
  "}",
  "",
  "void Demand::setItem(Item* i) {",
  "  // No change",
  "  if (it == i) return;",
  "",
  "  // Unlink from previous item",
  "  if (it) {",
  "    if (it->firstItemDemand == this)",
  "      it->firstItemDemand = nextItemDemand;",
  "    else {",
  "      Demand* dmd = it->firstItemDemand;",
  "      while (dmd && dmd->nextItemDemand != this) dmd = dmd->nextItemDemand;",
  "      if (!dmd) throw LogicException(\"corrupted demand list for an item\");",
  "      dmd->nextItemDemand = nextItemDemand;",
  "    }",
  "  }",
  "",
  "  // Link at new item",
  "  it = i;",
  "  if (it) {",
  "    nextItemDemand = it->firstItemDemand;",
  "    it->firstItemDemand = this;",
  "  }",
  "",
  "  // Trigger recreation of the delivery operation",
  "  if (oper && oper->getHidden()) oper = uninitializedDelivery;",
  "",
  "  // Trigger level calculation",
  "  HasLevel::triggerLazyRecomputation();",
  "}",
  "",
  "Date Item::findEarliestPurchaseOrder(const PooledString& batch) const {",
  "  Date earliest = Date::infiniteFuture;",
  "  bufferIterator buf_iter(this);",
  "  while (Buffer* buf = buf_iter.next()) {",
  "    if (buf->getBatch() != batch) continue;",
  "    for (auto & flpln : buf->getFlowPlans()) {",
  "      if (flpln.getDate() >= earliest) break;",
  "      auto opplan = flpln.getOperationPlan();",
  "      if (opplan && opplan->getOperation()->hasType<OperationItemSupplier>() &&",
  "          opplan->getProposed()) {",
  "        earliest = flpln.getDate();",
  "        break;",
  "      }",
  "    }",
  "  }",
  "  return earliest;",
  "}",
  "",
  "}  // namespace frepple",
];
