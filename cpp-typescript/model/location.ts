// <header-api-generated>
export const LocationCppModel = { bases: ["HasHierarchy"] as const, methods: ["getAvailable","getDistributionIterator","getDistributions","getType","initialize","registerFields","setAvailable"] as const, qualifiedNames: ["Location"] as const };

export const LocationDefaultCppModel = { bases: ["Location"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["LocationDefault"] as const };
// </header-api-generated>















import { HeaderModelAdapter as ModelReference, ModelEntity } from "../utils/library.js";
import type { Calendar } from "./calendar.js";

function referenceType(reference: ModelReference): string {
  return reference.constructor.name;
}

export class Location extends ModelEntity<Location> {
  static readonly cppBases: readonly string[] = ["HasHierarchy"];
  static readonly cppQualifiedNames: readonly string[] = ["Location"];
  static override modelFamily = "Location";
  private available: Calendar | null = null;

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "location"; }
  getAvailable(): Calendar | null { return this.available; }
  setAvailable(value: Calendar | null): void {
    if (this.available === value) return;
    if (this.available && typeof this.available === "object") {
      const callback = Reflect.get(this.available, "modelReferenceRemoved");
      if (typeof callback === "function") Reflect.apply(callback, this.available, [this, "Available"]);
    }
    this.available = value;
    if (value && typeof value === "object") {
      const callback = Reflect.get(value, "modelReferenceAdded");
      if (typeof callback === "function") Reflect.apply(callback, value, [this, "Available"]);
    }
  }
  getDistributions(): ModelReference[] { return this.referencedBy("Origin"); }
  getDistributionIterator(): IterableIterator<ModelReference> { return this.getDistributions().values(); }

  protected override disposeReferences(): void {
    this.setAvailable(null);
    for (const reference of [...this.referencedBy("Location")]) {
      const type = referenceType(reference);
      if (["Buffer", "BufferDefault", "BufferInfinite", "Resource", "ResourceDefault", "ResourceInfinite", "ResourceBuckets", "Operation", "ItemSupplier"].includes(type)) {
        reference.dispose();
      } else if (type.startsWith("Operation") && type !== "OperationPlan") {
        reference.dispose();
      } else {
        const setter = Reflect.get(reference, "setLocation");
        if (typeof setter === "function") Reflect.apply(setter, reference, [null]);
      }
    }
    for (const distribution of [...this.referencedBy("Origin")]) distribution.dispose();
  }
}

export class LocationDefault extends Location {
  static override readonly cppBases: readonly string[] = ["Location"];
  static override readonly cppQualifiedNames: readonly string[] = ["LocationDefault"];
  static override initialize(): number { return 0; }
  override getType(): string { return "location_default"; }
}









/**
 * Semantic migration unit for src/model/location.cpp.
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
  { name: "Location::initialize", sourceLine: 35, status: "ported" },
  { name: "LocationDefault::initialize", sourceLine: 45, status: "ported" },
  { name: "Location::~Location", sourceLine: 54, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface LocationPort {
  disposeLocation(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface LocationDefaultPort {
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
export const sourceFile = "src/model/location.cpp";
export const targetFile = "model/location.ts";

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
  "template <class Location>",
  "Tree utils::HasName<Location>::st;",
  "const MetaCategory* Location::metadata;",
  "const MetaClass* LocationDefault::metadata;",
  "",
  "int Location::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Location>(\"location\", \"locations\",",
  "                                                      reader, finder);",
  "  registerFields<Location>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleCategory<Location>::initialize();",
  "}",
  "",
  "int LocationDefault::initialize() {",
  "  // Initialize the metadata",
  "  LocationDefault::metadata = MetaClass::registerClass<LocationDefault>(",
  "      \"location\", \"location_default\", Object::create<LocationDefault>, true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<LocationDefault, Location>::initialize();",
  "}",
  "",
  "Location::~Location() {",
  "  // Remove all references from buffers to this location",
  "  for (auto buf = Buffer::begin(); buf != Buffer::end();) {",
  "    if (buf->getLocation() == this) {",
  "      auto tmp = &*buf;",
  "      ++buf;",
  "      delete tmp;",
  "    } else",
  "      ++buf;",
  "  }",
  "",
  "  // Remove all references from resources to this location",
  "  for (auto res = Resource::begin(); res != Resource::end();) {",
  "    if (res->getLocation() == this) {",
  "      auto tmp = &*res;",
  "      ++res;",
  "      delete tmp;",
  "    } else",
  "      ++res;",
  "  }",
  "",
  "  // Remove all references from operations to this location",
  "  for (auto oper = Operation::begin(); oper != Operation::end();) {",
  "    if (oper->getLocation() == this) {",
  "      auto tmp = &*oper;",
  "      ++oper;",
  "      delete tmp;",
  "    } else",
  "      ++oper;",
  "  }",
  "",
  "  // Remove all references from demands to this location",
  "  for (auto& dmd : Demand::all())",
  "    if (dmd.getLocation() == this) dmd.setLocation(nullptr);",
  "",
  "  // Remove all item suppliers referencing this location",
  "  for (auto& sup : Supplier::all()) {",
  "    for (auto it = sup.getItems().begin(); it != sup.getItems().end();) {",
  "      if (it->getLocation() == this) {",
  "        const ItemSupplier* itemsup = &*it;",
  "        ++it;  // Advance iterator before the delete",
  "        delete itemsup;",
  "      } else",
  "        ++it;",
  "    }",
  "  }",
  "",
  "  // Remove all item distributions referencing this location",
  "  for (auto& it : Item::all()) {",
  "    for (auto dist = it.getDistributions().begin();",
  "         dist != it.getDistributions().end();) {",
  "      if (dist->getOrigin() == this) {",
  "        const ItemDistribution* itemdist = &*dist;",
  "        ++dist;  // Advance iterator before the delete",
  "        delete itemdist;",
  "      } else",
  "        ++dist;",
  "    }",
  "  }",
  "}",
  "",
  "}  // namespace frepple",
];
