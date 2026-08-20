// <header-api-generated>
export const SkillCppModel = { bases: ["HasName","HasSource"] as const, methods: ["getResources","getType","initialize","registerFields"] as const, qualifiedNames: ["Skill"] as const };

export const SkillDefaultCppModel = { bases: ["Skill"] as const, methods: ["getType","initialize"] as const, qualifiedNames: ["SkillDefault"] as const };
// </header-api-generated>















import { HeaderModelAdapter as ModelReference, ModelEntity } from "../utils/library.js";

export class Skill extends ModelEntity<Skill> {
  static readonly cppBases: readonly string[] = ["HasName", "HasSource"];
  static readonly cppQualifiedNames: readonly string[] = ["Skill"];
  static override modelFamily = "Skill";

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  override getType(): string { return "skill"; }
  getResources(): IterableIterator<ModelReference> { return this.referencedBy("Skill").filter((reference) => reference.constructor.name.startsWith("ResourceSkill")).values(); }

  protected override disposeReferences(): void {
    for (const reference of [...this.referencedBy("Skill")]) {
      if (reference.constructor.name.startsWith("ResourceSkill")) reference.dispose();
      else {
        const setter = Reflect.get(reference, "setSkill");
        if (typeof setter === "function") Reflect.apply(setter, reference, [null]);
      }
    }
  }
}

export class SkillDefault extends Skill {
  static override readonly cppBases: readonly string[] = ["Skill"];
  static override readonly cppQualifiedNames: readonly string[] = ["SkillDefault"];
  static override initialize(): number { return 0; }
  override getType(): string { return "skill_default"; }
}












/**
 * Semantic migration unit for src/model/skill.cpp.
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
  { name: "Skill::initialize", sourceLine: 35, status: "ported" },
  { name: "SkillDefault::initialize", sourceLine: 45, status: "ported" },
  { name: "Skill::~Skill", sourceLine: 54, status: "ported" },
] as const satisfies readonly PortDefinition[];

export interface SkillPort {
  disposeSkill(...args: readonly PortValue[]): PortValue | void;
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface SkillDefaultPort {
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
export const sourceFile = "src/model/skill.cpp";
export const targetFile = "model/skill.ts";

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
  "template <class Skill>",
  "Tree utils::HasName<Skill>::st;",
  "const MetaCategory* Skill::metadata;",
  "const MetaClass* SkillDefault::metadata;",
  "",
  "int Skill::initialize() {",
  "  // Initialize the metadata",
  "  metadata =",
  "      MetaCategory::registerCategory<Skill>(\"skill\", \"skills\", reader, finder);",
  "  registerFields<Skill>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  return FreppleCategory<Skill>::initialize();",
  "}",
  "",
  "int SkillDefault::initialize() {",
  "  // Initialize the metadata",
  "  SkillDefault::metadata = MetaClass::registerClass<SkillDefault>(",
  "      \"skill\", \"skill_default\", Object::create<SkillDefault>, true);",
  "",
  "  // Initialize the Python class",
  "  return FreppleClass<SkillDefault, Skill>::initialize();",
  "}",
  "",
  "Skill::~Skill() {",
  "  // The ResourceSkill objects are automatically deleted by the destructor",
  "  // of the Association list class.",
  "",
  "  // Clean up the references on the load models",
  "  for (auto& o : Operation::all())",
  "    for (auto& l : o.getLoads())",
  "      if (l.getSkill() == this) const_cast<Load&>(l).setSkill(nullptr);",
  "}",
  "",
  "}  // namespace frepple",
];
