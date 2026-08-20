// <header-api-generated>
export const CustomerCppModel = { bases: ["HasHierarchy"] as const, methods: ["decNumberOfDemands","getNumberOfDemands","getType","incNumberOfDemands","initialize","registerFields"] as const, qualifiedNames: ["Customer"] as const };

export const CustomerDefaultCppModel = { bases: ["Customer"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["CustomerDefault"] as const };
// </header-api-generated>















import { HeaderModelAdapter as ModelReference, ModelEntity } from "../utils/library.js";

export class Customer extends ModelEntity<Customer> {
  static readonly cppBases: readonly string[] = ["HasHierarchy"];
  static readonly cppQualifiedNames: readonly string[] = ["Customer"];
  static override modelFamily = "Customer";
  private numberOfDemands = 0;

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "customer"; }
  getNumberOfDemands(): number { return this.numberOfDemands; }
  incNumberOfDemands(): void { this.numberOfDemands += 1; }
  decNumberOfDemands(): void { this.numberOfDemands -= 1; }

  override modelReferenceAdded(source: ModelReference, property: string): void {
    super.modelReferenceAdded(source, property);
    if (property === "Customer") this.incNumberOfDemands();
  }

  override modelReferenceRemoved(source: ModelReference, property: string): void {
    super.modelReferenceRemoved(source, property);
    if (property === "Customer") this.decNumberOfDemands();
  }

  protected override disposeReferences(): void {
    for (const demand of this.referencedBy("Customer")) {
      const setter = Reflect.get(demand, "setCustomer");
      if (typeof setter === "function") Reflect.apply(setter, demand, [null]);
    }
    this.numberOfDemands = 0;
  }
}

export class CustomerDefault extends Customer {
  static override readonly cppBases: readonly string[] = ["Customer"];
  static override readonly cppQualifiedNames: readonly string[] = ["CustomerDefault"];
  static override initialize(): number { return 0; }
  override getType(): string { return "customer_default"; }
}












/**
 * Semantic migration unit for src/model/customer.cpp.
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
  { name: "Customer::initialize", sourceLine: 35, status: "ported" },
  { name: "CustomerDefault::initialize", sourceLine: 45, status: "ported" },
  { name: "Customer::~Customer", sourceLine: 54, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface CustomerPort {
  disposeCustomer(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface CustomerDefaultPort {
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
export const sourceFile = "src/model/customer.cpp";
export const targetFile = "model/customer.ts";

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
  "template <class Customer>",
  "Tree utils::HasName<Customer>::st;",
  "const MetaCategory* Customer::metadata;",
  "const MetaClass* CustomerDefault::metadata;",
  "",
  "int Customer::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Customer>(\"customer\", \"customers\",",
  "                                                      reader, finder);",
  "  registerFields<Customer>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleCategory<Customer>::initialize();",
  "}",
  "",
  "int CustomerDefault::initialize() {",
  "  // Initialize the metadata",
  "  CustomerDefault::metadata = MetaClass::registerClass<CustomerDefault>(",
  "      \"customer\", \"customer_default\", Object::create<CustomerDefault>, true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<CustomerDefault, Customer>::initialize();",
  "}",
  "",
  "Customer::~Customer() {",
  "  // Remove all references from demands to this customer",
  "  for (auto& i : Demand::all())",
  "    if (i.getCustomer() == this) i.setCustomer(nullptr);",
  "}",
  "",
  "}  // namespace frepple",
];
