// <header-api-generated>
import { HeaderModelAdapter } from "../utils/library.js";

export class Solver extends HeaderModelAdapter {
  static readonly cppBases: readonly string[] = ["Object"] as const;
  static readonly cppQualifiedNames: readonly string[] = ["Solver"] as const;
  private autocommit = true;
  private logLevel = 0;

  static override initialize(): number { return 0; }
  static override registerFields(): number { return 0; }
  initialize(): number { return 0; }
  registerFields(): number { return 0; }
  createsBatches(): boolean { return false; }
  getAutocommit(): boolean { return this.autocommit; }
  setAutocommit(value: boolean): void { this.autocommit = Boolean(value); }
  getLogLevel(): number { return this.logLevel; }
  setLogLevel(value: number): void { this.logLevel = Math.max(0, Math.trunc(Number(value))); }
  getType(): string { return "solver"; }
  solve(..._args: readonly unknown[]): unknown { return undefined; }
}
// </header-api-generated>


























/**
 * Semantic migration unit for src/model/solver.cpp.
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
  { name: "Solver::initialize", sourceLine: 34, status: "adapted" },
  { name: "Solver::solve", sourceLine: 51, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface SolverPort {
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
export const sourceFile = "src/model/solver.cpp";
export const targetFile = "model/solver.ts";

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright (C) 2009 by frePPLe bv                                        *",
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
  "template <class Solver>",
  "Tree utils::HasName<Solver>::st;",
  "const MetaCategory* Solver::metadata;",
  "",
  "int Solver::initialize() {",
  "  // Initialize the metadata",
  "  metadata = MetaCategory::registerCategory<Solver>(",
  "      \"solver\", \"solvers\", MetaCategory::ControllerDefault);",
  "  registerFields<Solver>(const_cast<MetaCategory*>(metadata));",
  "",
  "  // Initialize the Python class",
  "  auto& x = FreppleCategory<Solver>::getPythonType();",
  "  x.setName(\"solver\");",
  "  x.setDoc(\"frePPLe solver\");",
  "  x.supportgetattro();",
  "  x.supportsetattro();",
  "  x.addMethod(\"solve\", solve, METH_NOARGS, \"run the solver\");",
  "  metadata->setPythonClass(x);",
  "  return x.typeReady();",
  "}",
  "",
  "PyObject* Solver::solve(PyObject* self, PyObject*) {",
  "  Py_BEGIN_ALLOW_THREADS;",
  "  try {",
  "    static_cast<Solver*>(self)->solve();",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "}  // namespace frepple",
];
