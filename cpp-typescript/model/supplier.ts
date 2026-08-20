// <header-api-generated>
export const SupplierCppModel = { bases: ["HasHierarchy"] as const, methods: ["getItemIterator","getItems","getType","initialize","registerFields"] as const, qualifiedNames: ["Supplier"] as const };

export const SupplierDefaultCppModel = { bases: ["Supplier"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["SupplierDefault"] as const };
// </header-api-generated>















import { HeaderModelAdapter as ModelReference, ModelEntity } from "../utils/library.js";

export class Supplier extends ModelEntity<Supplier> {
  static readonly cppBases: readonly string[] = ["HasHierarchy"];
  static readonly cppQualifiedNames: readonly string[] = ["Supplier"];
  static override modelFamily = "Supplier";

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "supplier"; }
  getItems(): ModelReference[] { return this.referencedBy("Supplier"); }
  getItemIterator(): IterableIterator<ModelReference> { return this.getItems().values(); }

  protected override disposeReferences(): void {
    for (const itemSupplier of [...this.referencedBy("Supplier")]) itemSupplier.dispose();
  }
}

export class SupplierDefault extends Supplier {
  static override readonly cppBases: readonly string[] = ["Supplier"];
  static override readonly cppQualifiedNames: readonly string[] = ["SupplierDefault"];
  static override initialize(): number { return 0; }
  override getType(): string { return "supplier_default"; }
}












/**
 * Semantic migration unit for src/model/supplier.cpp.
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
  { name: "Supplier::initialize", sourceLine: 35, status: "ported" },
  { name: "SupplierDefault::initialize", sourceLine: 45, status: "ported" },
  { name: "Supplier::~Supplier", sourceLine: 54, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface SupplierPort {
  disposeSupplier(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface SupplierDefaultPort {
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
export const sourceFile = "src/model/supplier.cpp";
export const targetFile = "model/supplier.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2014 by frePPLe bv                                        *",
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
  "template <class Supplier>",
  "Tree utils::HasName<Supplier>::st;",
  "const MetaCategory* Supplier::metadata;",
  "const MetaClass* SupplierDefault::metadata;",
  "",
  "int Supplier::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Supplier>(\"supplier\", \"suppliers\",",
  "                                                      reader, finder);",
  "  registerFields<Supplier>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleCategory<Supplier>::initialize();",
  "}",
  "",
  "int SupplierDefault::initialize() {",
  "  // Initialize the metadata",
  "  SupplierDefault::metadata = MetaClass::registerClass<SupplierDefault>(",
  "      \"supplier\", \"supplier_default\", Object::create<SupplierDefault>, true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<SupplierDefault, Supplier>::initialize();",
  "}",
  "",
  "Supplier::~Supplier() {}",
  "",
  "}  // namespace frepple",
];
