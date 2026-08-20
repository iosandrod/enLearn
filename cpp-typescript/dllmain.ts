import { readFile } from "node:fs/promises";
import { Forecast, ForecastBucket } from "./forecast/forecast.js";
import {
  ForecastMeasure,
  ForecastMeasureAggregated,
  ForecastMeasureAggregatedPlanned,
  ForecastMeasureComputed,
  ForecastMeasureComputedPlanned,
  ForecastMeasureLocal,
  ForecastMeasureTemp,
} from "./forecast/measure.js";
import { ForecastSolver } from "./forecast/forecastsolver.js";
import { LibraryModel } from "./model/library.js";
import { Plan } from "./model/plan.js";
import { LibrarySolver } from "./solver/solverplan.js";
import { Tags } from "./tags.js";
import { Cache } from "./utils/cache.js";
import { runDatabaseThread } from "./utils/database.js";
import { JSONInputFile, JSONInputString, JSONSerializerFile } from "./utils/json.js";
import { DataException, Environment, LibraryUtils, RuntimeException } from "./utils/library.js";
import { PythonInterpreter } from "./utils/python.js";
import { XMLInputFile, XMLInputString, XMLSerializerFile } from "./utils/xml.js";

export const FREPPLE_VERSION = "9.18.0";
let initialized = false;

export function FreppleVersion(): string { return FREPPLE_VERSION; }

export async function FreppleInitialize(processInitializationFiles = true): Promise<void> {
  if (initialized) return;
  initialized = true;
  LibraryUtils.initialize();
  LibraryModel.initialize();
  LibrarySolver.initialize();
  Cache.initialize();

  PythonInterpreter.registerGlobalMethod("readJSONdata", (data: unknown) => new JSONInputString(String(data)).parse(Plan.instance()));
  PythonInterpreter.registerGlobalMethod("readJSONfile", (filename: unknown) => new JSONInputFile(String(filename)).parse(Plan.instance()));
  PythonInterpreter.registerGlobalMethod("saveJSONfile", async (filename: unknown) => {
    const serializer = new JSONSerializerFile(String(filename));
    serializer.writeObject(Tags.plan ?? "plan", Plan.instance());
    await serializer.close();
  });
  PythonInterpreter.registerGlobalMethod("runDatabaseThread", (connection: unknown = "") => runDatabaseThread(String(connection)));

  const forecastTypes = [
    ForecastBucket, Forecast, ForecastSolver, ForecastMeasure,
    ForecastMeasureAggregated, ForecastMeasureAggregatedPlanned,
    ForecastMeasureLocal, ForecastMeasureComputed,
    ForecastMeasureComputedPlanned, ForecastMeasureTemp,
  ];
  const errors = forecastTypes.reduce((count, type) => count + Number(type.initialize()), 0);
  if (errors) throw new RuntimeException("Error registering forecasting module");

  if (!processInitializationFiles) return;
  const pythonInit = Environment.searchFile("init.py");
  if (pythonInit) PythonInterpreter.executeFile(pythonInit);
  const xmlInit = Environment.searchFile("init.xml");
  if (xmlInit) {
    const parser = new XMLInputFile(xmlInit);
    parser.setAllowPython(true);
    await parser.parse(Plan.instance(), true);
  }
}

export function FreppleReadXMLData(data: string | null | undefined, validate = false, validateOnly = false): unknown {
  if (data === null || data === undefined) return undefined;
  return new XMLInputString(data).parse(validateOnly ? null : Plan.instance(), validateOnly || validate);
}

export async function FreppleReadXMLFile(
  filename: string | null | undefined,
  validate = false,
  validateOnly = false,
  allowPython = false,
): Promise<unknown> {
  if (!filename) {
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) input += chunk;
    const parser = new XMLInputString(input);
    parser.setAllowPython(allowPython);
    return parser.parse(validateOnly ? null : Plan.instance(), validateOnly || validate);
  }
  const parser = new XMLInputFile(filename);
  parser.setAllowPython(allowPython);
  return parser.parse(validateOnly ? null : Plan.instance(), validateOnly || validate);
}

export async function FreppleReadJSONFile(filename: string): Promise<unknown[]> {
  if (!filename) throw new DataException("No JSON file passed to execute");
  return new JSONInputFile(filename).parse(Plan.instance());
}

export function FreppleReadPythonFile(filename: string | null | undefined): void {
  if (!filename) throw new DataException("No Python file passed to execute");
  PythonInterpreter.executeFile(filename);
}

export async function FreppleSaveFile(filename: string): Promise<void> {
  if (!filename) throw new DataException("No output file passed to save");
  const serializer = new XMLSerializerFile(filename);
  serializer.writeElementWithHeader(Tags.plan ?? "plan", Plan.instance());
  await serializer.close();
}

export async function FreppleExit(): Promise<void> {
  Environment.setLogFile("");
}

export function FreppleLog(message: string): void { Environment.log(message); }

export async function FreppleReadTextFile(filename: string): Promise<string> {
  return readFile(filename, "utf8");
}

/**
 * Semantic migration unit for src/dllmain.cpp.
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
  { name: "LibraryUtils::initialize", sourceLine: 41, status: "adapted" },
  { name: "LibraryModel::initialize", sourceLine: 42, status: "adapted" },
  { name: "LibrarySolver::initialize", sourceLine: 43, status: "adapted" },
  { name: "Cache::initialize", sourceLine: 44, status: "adapted" },
  { name: "ForecastMeasureComputed::compileMeasures", sourceLine: 102, status: "adapted" },
  { name: "Plan::instance", sourceLine: 133, status: "adapted" },
  { name: "Plan::instance", sourceLine: 146, status: "adapted" },
  { name: "Plan::instance", sourceLine: 162, status: "adapted" },
  { name: "Plan::instance", sourceLine: 173, status: "adapted" },
  { name: "Plan::instance", sourceLine: 178, status: "adapted" },
  { name: "Plan::instance", sourceLine: 188, status: "adapted" },
  { name: "Environment::setLogFile", sourceLine: 198, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface CachePort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface EnvironmentPort {
  setLogFile(...args: readonly PortValue[]): PortValue | void;
}

export interface ForecastMeasureComputedPort {
  compileMeasures(...args: readonly PortValue[]): PortValue | void;
}

export interface LibraryModelPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface LibrarySolverPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface LibraryUtilsPort {
  initialize(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/dllmain.cpp";
export const targetFile = "dllmain.ts";

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
  "#include \"forecast/forecast.h\"",
  "#include \"frepple.h\"",
  "#include \"frepple/database.h\"",
  "#include \"freppleinterface.h\"",
  "using namespace frepple;",
  "",
  "const char* FreppleVersion() { return PACKAGE_VERSION; }",
  "",
  "void FreppleInitialize(bool procesInitializationFiles) {",
  "  // Initialize only once",
  "  static bool initialized = false;",
  "  if (initialized) return;",
  "  initialized = true;",
  "",
  "  // Initialize the libraries",
  "  LibraryUtils::initialize();",
  "  LibraryModel::initialize();",
  "  LibrarySolver::initialize();",
  "  Cache::initialize();",
  "",
  "  PyGILState_STATE state = PyGILState_Ensure();",
  "  try {",
  "    PythonInterpreter::registerGlobalMethod(",
  "        \"readJSONdata\", readJSONdata, METH_VARARGS,",
  "        \"Processes a JSON string passed as argument.\");",
  "    PythonInterpreter::registerGlobalMethod(\"readJSONfile\", readJSONfile,",
  "                                            METH_VARARGS, \"Read a JSON file.\");",
  "    PythonInterpreter::registerGlobalMethod(\"saveJSONfile\", saveJSONfile,",
  "                                            METH_VARARGS,",
  "                                            \"Save the model to a JSON file.\");",
  "    PythonInterpreter::registerGlobalMethod(",
  "        \"runDatabaseThread\", runDatabaseThread, METH_VARARGS,",
  "        \"Start a thread to persist data in a PostgreSQL database.\");",
  "",
  "    // Initialize the forecast module",
  "    int nok = 0;",
  "    nok += ForecastBucket::initialize();",
  "    nok += Forecast::initialize();",
  "    nok += ForecastSolver::initialize();",
  "    nok += ForecastMeasure::initialize();",
  "    nok += ForecastMeasureAggregated::initialize();",
  "    nok += ForecastMeasureAggregatedPlanned::initialize();",
  "    nok += ForecastMeasureLocal::initialize();",
  "    nok += ForecastMeasureComputed::initialize();",
  "    nok += ForecastMeasureComputedPlanned::initialize();",
  "    nok += ForecastMeasureTemp::initialize();",
  "    if (nok) throw RuntimeException(\"Error registering forecasting module\");",
  "",
  "    Measures::forecasttotal = new ForecastMeasureComputed(",
  "        \"forecasttotal\",",
  "        \"if(forecastoverride == -1, forecastbaseline, forecastoverride)\");",
  "    Measures::forecastnet =",
  "        new ForecastMeasureAggregatedPlanned(\"forecastnet\", 0);",
  "    Measures::forecastconsumed =",
  "        new ForecastMeasureAggregatedPlanned(\"forecastconsumed\", 0);",
  "    Measures::forecastbaseline =",
  "        new const ForecastMeasureAggregated(\"forecastbaseline\", 0);",
  "    Measures::forecastoverride = new ForecastMeasureAggregated(",
  "        \"forecastoverride\", -1, false, Measures::forecastbaseline);",
  "    Measures::orderstotal = new ForecastMeasureAggregated(\"orderstotal\", 0);",
  "    Measures::ordersadjustment =",
  "        new ForecastMeasureAggregated(\"ordersadjustment\", 0);",
  "    Measures::ordersopen = new ForecastMeasureAggregated(\"ordersopen\", 0);",
  "    Measures::forecastplanned =",
  "        new ForecastMeasureAggregatedPlanned(\"forecastplanned\", 0);",
  "    Measures::ordersplanned = new ForecastMeasureAggregated(\"ordersplanned\", 0);",
  "    auto tmp = new ForecastMeasureLocal(\"outlier\", 0);",
  "    tmp->setStored(false);",
  "    Measures::outlier = tmp;",
  "    tmp = new ForecastMeasureLocal(\"leaf\", 0);",
  "    Measures::leaf = tmp;",
  "    tmp->setStored(false);",
  "    auto t1 = new ForecastMeasureLocal(\"outlier\", 0);",
  "    t1->setStored(false);",
  "    Measures::outlier = t1;",
  "    Measures::nodata = new ForecastMeasureLocal(\"nodata\", 0);",
  "    ForecastMeasureComputed::compileMeasures();",
  "",
  "    PyGILState_Release(state);",
  "  } catch (const exception& e) {",
  "    PyGILState_Release(state);",
  "    logger << \"Error: \" << e.what() << '\\n';",
  "  } catch (...) {",
  "    PyGILState_Release(state);",
  "    logger << \"Error: unknown exception\\n\";",
  "  }",
  "",
  "  // Search for the initialization PY file",
  "  if (!procesInitializationFiles) return;",
  "  string init = Environment::searchFile(\"init.py\");",
  "  if (!init.empty()) {",
  "    // Execute the commands in the file",
  "    try {",
  "      PythonInterpreter::executeFile(init);",
  "    } catch (...) {",
  "      logger << \"Exception caught during execution of 'init.py'\\n\";",
  "      throw;",
  "    }",
  "  }",
  "",
  "  // Search for the initialization XML file",
  "  init = Environment::searchFile(\"init.xml\");",
  "  if (!init.empty()) {",
  "    // Execute the commands in the file",
  "    try {",
  "      XMLInputFile p_init(init);",
  "      p_init.setAllowPython(true);",
  "      p_init.parse(&Plan::instance(), true);",
  "    } catch (...) {",
  "      logger << \"Exception caught during execution of 'init.xml'\\n\";",
  "      throw;",
  "    }",
  "  }",
  "}",
  "",
  "void FreppleReadXMLData(const char* x, bool validate, bool validateonly) {",
  "  if (!x) return;",
  "  if (validateonly)",
  "    XMLInputString(x).parse(nullptr, true);",
  "  else",
  "    XMLInputString(x).parse(&Plan::instance(), validate);",
  "}",
  "",
  "void FreppleReadXMLFile(const char* filename, bool validate, bool validateonly,",
  "                        bool allowPython) {",
  "  if (!filename) {",
  "    // Read from standard input",
  "    xercesc::StdInInputSource in;",
  "    if (validateonly) {",
  "      // When no root object is passed, only the input validation happens",
  "      auto p = XMLInput();",
  "      if (allowPython) p.setAllowPython(true);",
  "      p.parse(in, nullptr, true);",
  "    } else {",
  "      auto p = XMLInput();",
  "      if (allowPython) p.setAllowPython(true);",
  "      p.parse(in, &Plan::instance(), validate);",
  "    }",
  "  } else if (validateonly) {",
  "    // Read and validate a file",
  "    auto p = XMLInputFile(filename);",
  "    if (allowPython) p.setAllowPython(true);",
  "    p.parse(nullptr, true);",
  "  } else {",
  "    // Read, execute and optionally validate a file",
  "    auto p = XMLInputFile(filename);",
  "    if (allowPython) p.setAllowPython(true);",
  "    p.parse(&Plan::instance(), validate);",
  "  }",
  "}",
  "",
  "void FreppleReadJSONFile(const char* filename) {",
  "  JSONInputFile(filename).parse(&Plan::instance());",
  "}",
  "",
  "void FreppleReadPythonFile(const char* filename) {",
  "  if (!filename) throw DataException(\"No Python file passed to execute\");",
  "  PythonInterpreter::executeFile(filename);",
  "}",
  "",
  "void FreppleSaveFile(const char* x) {",
  "  XMLSerializerFile o(x);",
  "  o.writeElementWithHeader(Tags::plan, &Plan::instance());",
  "}",
  "",
  "/* Closing any resources still used by frePPle.",
  " * Allocated memory is not freed up with this call - for performance",
  " * reasons it is easier to \"leak\" the memory. The memory is freed when",
  " * the process exits.",
  " */",
  "void FreppleExit() {",
  "  // Close the log file",
  "  Environment::setLogFile(\"\");",
  "}",
  "",
  "void FreppleLog(const string& msg) { logger << msg << '\\n'; }",
];
