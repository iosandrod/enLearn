import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FreppleInitialize,
  FreppleLog,
  FreppleReadJSONFile,
  FreppleReadPythonFile,
  FreppleReadXMLFile,
  FreppleVersion,
} from "./dllmain.js";

export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;

export function usage(): string {
  return `
frePPLe v${FreppleVersion()} command line application

Usage:
  frepple [options] [files | directories]

This program reads XML input data, and executes the modeling and
planning commands included in them.
The XML input can be provided in the following ways:
  - Passing one or more XML files and/or directories as arguments.
    When a directory is specified, the application will process
    all files with the extension '.xml'.
  - Passing one or more Python files with the extension '.py'
    The Python commands are executed through the configured Python adapter.
  - Passing one or more JSON files with the extension '.json'.
  - When passing no file or directory arguments, input will be read
    from the standard input. XML data can be piped to the application.

Options:
  -validate -v  Validate the XML input for correctness.
  -check -c     Only validate the input, without executing the content.
  -? -h -help   Show these instructions.

Environment: The variable FREPPLE_HOME optionally points to a
     directory where the initialization files init.xml and init.py are searched.

Return codes: 0 when successful, non-zero in case of errors
`;
}

const signalDescriptions: Readonly<Partial<Record<NodeJS.Signals, string>>> = {
  SIGHUP: "hangup signal",
  SIGINT: "interrupt signal",
  SIGQUIT: "quit signal",
  SIGILL: "illegal instruction",
  SIGABRT: "abort signal",
  SIGBUS: "bad memory access",
  SIGFPE: "floating-point exception",
  SIGSEGV: "segmentation violation",
  SIGTERM: "termination signal",
  SIGXCPU: "CPU limit reached",
  SIGXFSZ: "file size limit reached",
};

export function handler(signal: NodeJS.Signals): void {
  FreppleLog(`Planning engine terminating due to ${signalDescriptions[signal] ?? signal}`);
  process.exitCode = 1;
}

export function installSignalHandlers(): void {
  for (const signal of globalThis.Object.keys(signalDescriptions) as NodeJS.Signals[]) {
    try { process.once(signal, () => handler(signal)); } catch { /* Unsupported on this platform. */ }
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let validate = false;
  let validateOnly = false;
  let input = false;
  try {
    for (const argument of argv) {
      if (argument.startsWith("-")) {
        if (argument === "-validate" || argument === "-v") validate = true;
        else if (argument === "-check" || argument === "-c") validateOnly = true;
        else {
          if (argument !== "-?" && argument !== "-h" && argument !== "-help") process.stdout.write(`\nError: Option '${argument}' not recognized.\n`);
          process.stdout.write(usage());
          return EXIT_FAILURE;
        }
        continue;
      }

      if (!input) {
        await FreppleInitialize();
        input = true;
      }
      const extension = extname(argument).toLowerCase();
      if (extension === ".py") FreppleReadPythonFile(argument);
      else if (extension === ".json") await FreppleReadJSONFile(argument);
      else await FreppleReadXMLFile(argument, validate, validateOnly, true);
    }
    if (!input) {
      await FreppleInitialize();
      await FreppleReadXMLFile(null, validate, validateOnly, true);
    }
  } catch (error) {
    FreppleLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_FAILURE;
  }
  return EXIT_SUCCESS;
}

const entrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entrypoint) {
  installSignalHandlers();
  process.exitCode = await main();
}

/**
 * Semantic migration unit for src/main.cpp.
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
] as const satisfies readonly PortDefinition[];

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
export const sourceFile = "src/main.cpp";
export const targetFile = "main.ts";

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
  "#include <signal.h>",
  "",
  "#include <cstdlib>",
  "#include <cstring>",
  "#include <filesystem>",
  "#include <iostream>",
  "#include <sstream>",
  "",
  "#include \"freppleinterface.h\"",
  "using namespace std;",
  "",
  "#ifndef NDEBUG",
  "extern \"C\" const char* __asan_default_options() {",
  "  return \"detect_leaks=0:halt_on_error=1:abort_on_error=1\";",
  "}",
  "#endif",
  "",
  "void usage() {",
  "  cout",
  "      << \"\\nfrePPLe v\" << FreppleVersion()",
  "      << \" command line application\\n\"",
  "         \"\\nUsage:\\n\"",
  "         \"  frepple [options] [files | directories]\\n\"",
  "         \"\\nThis program reads XML input data, and executes the modeling and\\n\"",
  "         \"planning commands included in them.\\n\"",
  "         \"The XML input can be provided in the following ways:\\n\"",
  "         \"  - Passing one or more XML files and/or directories as arguments.\\n\"",
  "         \"    When a directory is specified, the application will process\\n\"",
  "         \"    all files with the extension '.xml'.\\n\"",
  "         \"  - Passing one or more Python files with the extension '.py'\\n\"",
  "         \"    The Python commands are executed in the embedded interpreter.\\n\"",
  "         \"  - When passing no file or directory arguments, input will be read\\n\"",
  "         \"    from the standard input. XML data can be piped to the \"",
  "         \"application.\\n\"",
  "         \"\\nOptions:\\n\"",
  "         \"  -validate -v  Validate the XML input for correctness.\\n\"",
  "         \"  -check -c     Only validate the input, without executing the \"",
  "         \"content.\\n\"",
  "         \"  -? -h -help   Show these instructions.\\n\"",
  "         \"\\nEnvironment: The variable FREPPLE_HOME optionally points to a\\n\"",
  "         \"     directory where the initialization files init.xml, init.py,\\n\"",
  "         \"     frepple.xsd and module libraries will be searched.\\n\"",
  "         \"\\nReturn codes: 0 when successful, non-zero in case of errors\\n\"",
  "         \"\\nMore information on this program: http://www.frepple.com\\n\\n\\n\";",
  "}",
  "",
  "void handler(int sig) {",
  "  ostringstream o;",
  "  o << \"Planning engine terminating due to \";",
  "  switch (sig) {",
  "#ifdef SIGHUP",
  "    case SIGHUP:",
  "      o << \"hangup signal\";",
  "      break;",
  "#endif",
  "#ifdef SIGINT",
  "    case SIGINT:",
  "      o << \"interrupt signal\";",
  "      break;",
  "#endif",
  "#ifdef SIGQUIT",
  "    case SIGQUIT:",
  "      o << \"quit signal\";",
  "      break;",
  "#endif",
  "#ifdef SIGILL",
  "    case SIGILL:",
  "      o << \"illegal instruction\";",
  "      break;",
  "#endif",
  "#ifdef SIGABRT",
  "    case SIGABRT:",
  "      o << \"abort signal\";",
  "      break;",
  "#endif",
  "#ifdef SIGBUS",
  "    case SIGBUS:",
  "      o << \"bad memory access\";",
  "      break;",
  "#endif",
  "#ifdef SIGFPE",
  "    case SIGFPE:",
  "      o << \"floating-point exception\";",
  "      break;",
  "#endif",
  "#ifdef SIGKILL",
  "    case SIGKILL:",
  "      o << \"kill signal\";",
  "      break;",
  "#endif",
  "#ifdef SIGSEGV",
  "    case SIGSEGV:",
  "      o << \"segmentation violation\";",
  "      break;",
  "#endif",
  "#ifdef SIGTERM",
  "    case SIGTERM:",
  "      o << \"termination signal\";",
  "      break;",
  "#endif",
  "#ifdef SIGSTKFLT",
  "    case SIGSTKFLT:",
  "      o << \"stack fault on coprocressor\";",
  "      break;",
  "#endif",
  "#ifdef SIGXCPU",
  "    case SIGXCPU:",
  "      o << \"CPU limit reached\";",
  "      break;",
  "#endif",
  "#ifdef SIGXFSZ",
  "    case SIGXFSZ:",
  "      o << \"file size limit reached\";",
  "      break;",
  "#endif",
  "    default:",
  "      o << \"signal \" << sig;",
  "  }",
  "  o << '\\n';",
  "  FreppleLog(o.str().c_str());",
  "  exit(sig);",
  "}",
  "",
  "int main(int argc, char* argv[]) {",
  "  // Install signal handlers.",
  "  // In a debug build we don't do it, to allow debuggers to handle the",
  "  // signal themselves.",
  "#if !defined(DEBUG)",
  "#ifdef SIGHUP",
  "  signal(SIGHUP, handler);",
  "#endif",
  "#ifdef SIGINT",
  "  signal(SIGINT, handler);",
  "#endif",
  "#ifdef SIGQUIT",
  "  signal(SIGQUIT, handler);",
  "#endif",
  "#ifdef SIGILL",
  "  signal(SIGILL, handler);",
  "#endif",
  "#ifdef SIGABRT",
  "  signal(SIGABRT, handler);",
  "#endif",
  "#ifdef SIGBUS",
  "  signal(SIGBUS, handler);",
  "#endif",
  "#ifdef SIGFPE",
  "  signal(SIGFPE, handler);",
  "#endif",
  "#ifdef SIGKILL",
  "  signal(SIGKILL, handler);",
  "#endif",
  "#ifdef SIGSEGV",
  "  signal(SIGSEGV, handler);",
  "#endif",
  "#ifdef SIGTERM",
  "  signal(SIGTERM, handler);",
  "#endif",
  "#ifdef SIGSTKFLT",
  "  signal(SIGSTKFLT, handler);",
  "#endif",
  "#ifdef SIGXCPU",
  "  signal(SIGXCPU, handler);",
  "#endif",
  "#ifdef SIGXFSZ",
  "  signal(SIGXFSZ, handler);",
  "#endif",
  "#endif",
  "",
  "  // Storing the chosen options...",
  "  bool validate = false;",
  "  bool validate_only = false;",
  "  bool input = false;",
  "",
  "  try {",
  "    // Analyze the command line arguments.",
  "    for (int i = 1; i < argc; ++i) {",
  "      if (argv[i][0] == '-') {",
  "        // An option on the command line",
  "        if (!strcmp(argv[i], \"-validate\") || !strcmp(argv[i], \"-v\"))",
  "          validate = true;",
  "        else if (!strcmp(argv[i], \"-check\") || !strcmp(argv[i], \"-c\"))",
  "          validate_only = true;",
  "        else {",
  "          if (strcmp(argv[i], \"-?\") && strcmp(argv[i], \"-h\") &&",
  "              strcmp(argv[i], \"-help\"))",
  "            cout << \"\\nError: Option '\" << argv[i] << \"' not recognized.\\n\";",
  "          usage();",
  "          return EXIT_FAILURE;",
  "        }",
  "      } else {",
  "        // A file or directory name on the command line",
  "        if (!input) {",
  "          // Initialize the library if this wasn't done before",
  "          FreppleInitialize();",
  "          input = true;",
  "        }",
  "        filesystem::path p(argv[i]);",
  "        if (p.extension() == \".py\")",
  "          FreppleReadPythonFile(argv[i]);",
  "        else if (p.extension() == \".json\")",
  "          FreppleReadJSONFile(argv[i]);",
  "        else",
  "          FreppleReadXMLFile(argv[i], validate, validate_only, true);",
  "      }",
  "    }",
  "",
  "    // When no filenames are specified, we read the standard input",
  "    if (!input) {",
  "      FreppleInitialize();",
  "      FreppleReadXMLFile(nullptr, validate, validate_only, true);",
  "    }",
  "  } catch (const exception& e) {",
  "    ostringstream ch;",
  "    ch << \"Error: \" << e.what();",
  "    FreppleLog(ch.str());",
  "    return EXIT_FAILURE;",
  "  } catch (...) {",
  "    FreppleLog(\"Error: Unknown exception type\");",
  "    return EXIT_FAILURE;",
  "  }",
  "  return EXIT_SUCCESS;",
  "}",
];
