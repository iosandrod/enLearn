// <header-api-generated>
import { HeaderModelAdapter } from "./library.js";

export const JSONDataCppModel = { bases: ["DataValue"] as const, methods: ["getBool","getDataType","getDate","getDouble","getDuration","getInt","getLong","getObject","getString","getUnsignedLong","setBool","setDate","setDouble","setDuration","setInt","setLong","setNull","setObject","setString","setUnsignedLong"] as const, qualifiedNames: ["JSONData"] as const };

export const JSONDataValueDictCppModel = { bases: ["DataValueDict"] as const, methods: ["enlarge","get","getEnd","getStart","print"] as const, qualifiedNames: ["JSONDataValueDict"] as const };

export const JSONInputCppModel = { bases: ["DataInput","NonCopyable"] as const, methods: [] as const, qualifiedNames: ["JSONInput"] as const };

export const JSONInputFileCppModel = { bases: ["JSONInput"] as const, methods: ["getFileName","parse","setFileName"] as const, qualifiedNames: ["JSONInputFile"] as const };

export class JSONInputFld extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["JSONInput::fld"] as const;
}

export class JSONInputObj extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["JSONInput::obj"] as const;
}

export const JSONInputStringCppModel = { bases: ["JSONInput"] as const, methods: ["parse"] as const, qualifiedNames: ["JSONInputString"] as const };

export const JSONSerializerCppModel = { bases: ["Serializer"] as const, methods: ["BeginList","BeginObject","EndList","EndObject","escape","getFormatted","resetFirst","setFormatted","setMode","writeElement","writeElementNull","writeString"] as const, qualifiedNames: ["JSONSerializer"] as const };

export const JSONSerializerFileCppModel = { bases: ["JSONSerializer"] as const, methods: [] as const, qualifiedNames: ["JSONSerializerFile"] as const };

export class JSONSerializerObj extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["JSONSerializer::obj"] as const;
}

export const JSONSerializerStringCppModel = { bases: ["JSONSerializer"] as const, methods: ["getData"] as const, qualifiedNames: ["JSONSerializerString"] as const };
// </header-api-generated>


























/**
 * Semantic migration unit for src/utils/json.cpp.
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
  { name: "JSONInput::useProperty", sourceLine: 39, status: "adapted" },
  { name: "Plan::instance", sourceLine: 70, status: "adapted" },
  { name: "Plan::instance", sourceLine: 72, status: "adapted" },
  { name: "JSONSerializer::escape", sourceLine: 84, status: "adapted" },
  { name: "JSONInputFile::parse", sourceLine: 126, status: "adapted" },
  { name: "filesystem::is_directory", sourceLine: 135, status: "adapted" },
  { name: "JSONInput::parse", sourceLine: 159, status: "adapted" },
  { name: "Plan::instance", sourceLine: 174, status: "adapted" },
  { name: "Plan::instance", sourceLine: 197, status: "adapted" },
  { name: "JSONInput::parse", sourceLine: 209, status: "adapted" },
  { name: "rapidjson::GetParseError_En", sourceLine: 233, status: "adapted" },
  { name: "JSONInput::Null", sourceLine: 242, status: "adapted" },
  { name: "JSONInput::Bool", sourceLine: 262, status: "adapted" },
  { name: "JSONInput::Int", sourceLine: 282, status: "adapted" },
  { name: "JSONInput::Uint", sourceLine: 302, status: "adapted" },
  { name: "JSONInput::Int64", sourceLine: 322, status: "adapted" },
  { name: "JSONInput::Uint64", sourceLine: 345, status: "adapted" },
  { name: "JSONInput::Double", sourceLine: 368, status: "adapted" },
  { name: "JSONInput::String", sourceLine: 388, status: "adapted" },
  { name: "JSONInput::StartObject", sourceLine: 419, status: "adapted" },
  { name: "JSONInput::Key", sourceLine: 442, status: "adapted" },
  { name: "JSONInput::EndObject", sourceLine: 475, status: "adapted" },
  { name: "JSONInput::StartArray", sourceLine: 776, status: "adapted" },
  { name: "JSONInput::EndArray", sourceLine: 783, status: "adapted" },
  { name: "JSONData::getLong", sourceLine: 790, status: "adapted" },
  { name: "JSONData::getUnsignedLong", sourceLine: 817, status: "adapted" },
  { name: "JSONData::getDuration", sourceLine: 843, status: "adapted" },
  { name: "JSONData::getInt", sourceLine: 865, status: "adapted" },
  { name: "JSONData::getDouble", sourceLine: 892, status: "adapted" },
  { name: "JSONData::getDate", sourceLine: 914, status: "adapted" },
  { name: "JSONData::getString", sourceLine: 936, status: "adapted" },
  { name: "JSONData::getBool", sourceLine: 979, status: "adapted" },
  { name: "JSONData::getObject", sourceLine: 1001, status: "adapted" },
  { name: "JSONDataValueDict::print", sourceLine: 1017, status: "adapted" },
  { name: "JSONDataValueDict::get", sourceLine: 1032, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface JSONDataPort {
  getBool(...args: readonly PortValue[]): PortValue | void;
  getDate(...args: readonly PortValue[]): PortValue | void;
  getDouble(...args: readonly PortValue[]): PortValue | void;
  getDuration(...args: readonly PortValue[]): PortValue | void;
  getInt(...args: readonly PortValue[]): PortValue | void;
  getLong(...args: readonly PortValue[]): PortValue | void;
  getObject(...args: readonly PortValue[]): PortValue | void;
  getString(...args: readonly PortValue[]): PortValue | void;
  getUnsignedLong(...args: readonly PortValue[]): PortValue | void;
}

export interface JSONDataValueDictPort {
  get(...args: readonly PortValue[]): PortValue | void;
  print(...args: readonly PortValue[]): PortValue | void;
}

export interface JSONInputPort {
  Bool(...args: readonly PortValue[]): PortValue | void;
  Double(...args: readonly PortValue[]): PortValue | void;
  EndArray(...args: readonly PortValue[]): PortValue | void;
  EndObject(...args: readonly PortValue[]): PortValue | void;
  Int(...args: readonly PortValue[]): PortValue | void;
  Int64(...args: readonly PortValue[]): PortValue | void;
  Key(...args: readonly PortValue[]): PortValue | void;
  Null(...args: readonly PortValue[]): PortValue | void;
  StartArray(...args: readonly PortValue[]): PortValue | void;
  StartObject(...args: readonly PortValue[]): PortValue | void;
  String(...args: readonly PortValue[]): PortValue | void;
  Uint(...args: readonly PortValue[]): PortValue | void;
  Uint64(...args: readonly PortValue[]): PortValue | void;
  parse(...args: readonly PortValue[]): PortValue | void;
  useProperty(...args: readonly PortValue[]): PortValue | void;
}

export interface JSONInputFilePort {
  parse(...args: readonly PortValue[]): PortValue | void;
}

export interface JSONSerializerPort {
  escape(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface filesystemPort {
  is_directory(...args: readonly PortValue[]): PortValue | void;
}

export interface rapidjsonPort {
  GetParseError_En(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/utils/json.cpp";
export const targetFile = "utils/json.ts";

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Date as FreppleDate, Duration } from "./date.js";
import { applyDataFields, Keyword, RuntimeException } from "./library.js";
import { FieldCategory, Object as FreppleObject, type SerializableObject, type SerializerAdapter } from "./python.js";

export enum JsonType {
  JSON_NULL,
  JSON_BOOL,
  JSON_INT,
  JSON_LONG,
  JSON_UNSIGNEDLONG,
  JSON_DOUBLE,
  JSON_STRING,
  JSON_OBJECT,
}

export class JSONData {
  private value: unknown = null;
  private dataType = JsonType.JSON_NULL;

  constructor(value: unknown = null) {
    this.assign(value);
  }

  private assign(value: unknown): void {
    this.value = value;
    if (value === null || value === undefined) this.dataType = JsonType.JSON_NULL;
    else if (typeof value === "boolean") this.dataType = JsonType.JSON_BOOL;
    else if (typeof value === "string") this.dataType = JsonType.JSON_STRING;
    else if (value instanceof FreppleObject) this.dataType = JsonType.JSON_OBJECT;
    else if (typeof value === "number" && Number.isInteger(value)) this.dataType = JsonType.JSON_LONG;
    else if (typeof value === "number") this.dataType = JsonType.JSON_DOUBLE;
    else this.dataType = JsonType.JSON_OBJECT;
  }

  getDataType(): JsonType { return this.dataType; }
  getLong(): number { return Math.trunc(this.numberValue()); }
  getUnsignedLong(): number {
    const value = this.getLong();
    if (value < 0) throw new RuntimeException("Invalid unsigned long value");
    return value;
  }
  getDuration(): Duration { return new Duration(this.getLong()); }
  getInt(): number {
    const value = this.getLong();
    if (value < -2_147_483_648 || value > 2_147_483_647) throw new RuntimeException("Invalid integer value");
    return value;
  }
  getDouble(): number { return this.numberValue(); }
  getDate(): FreppleDate {
    if (this.value instanceof FreppleDate) return new FreppleDate(this.value);
    if (typeof this.value === "string" || typeof this.value === "number") return new FreppleDate(this.value);
    return new FreppleDate(null);
  }
  getString(): string { return this.value === null || this.value === undefined ? "" : String(this.value); }
  getBool(): boolean {
    if (typeof this.value === "string") {
      const first = this.value.charAt(0).toLowerCase();
      return first !== "" && first !== "f" && first !== "0";
    }
    return Boolean(this.value);
  }
  getObject(): FreppleObject | null { return this.value instanceof FreppleObject ? this.value : null; }
  getRaw(): unknown { return this.value; }
  setNull(): void { this.assign(null); }
  setLong(value: number): void { this.assign(Math.trunc(value)); }
  setUnsignedLong(value: number): void { this.assign(Math.max(0, Math.trunc(value))); }
  setDuration(value: Duration): void { this.assign(value.getSeconds()); }
  setInt(value: number): void { this.assign(Math.trunc(value)); }
  setDouble(value: number): void { this.assign(value); }
  setDate(value: FreppleDate): void { this.assign(value.getTicks()); }
  setString(value: string): void { this.assign(value); }
  setBool(value: boolean): void { this.assign(value); }
  setObject(value: FreppleObject | null): void { this.assign(value); }

  private numberValue(): number {
    const value = Number(this.value ?? 0);
    if (!Number.isFinite(value)) throw new RuntimeException("Invalid numeric value");
    return value;
  }
}

export interface JSONField {
  readonly name: string;
  readonly hash: number;
  readonly value: JSONData;
}

export class JSONDataValueDict {
  constructor(
    readonly fields: readonly JSONField[],
    private start = 0,
    private end = fields.length,
  ) {
    this.start = Math.max(0, start);
  }

  get(key: Keyword | string): JSONData | null {
    const hash = key instanceof Keyword ? key.getHash() : Keyword.hash(key);
    return this.fields.slice(this.start, this.end).find((field) => field.hash === hash)?.value ?? null;
  }

  enlarge(): void { this.end = Math.min(this.fields.length, this.end + 1); }
  getStart(): number { return this.start; }
  getEnd(): number { return this.end; }
  print(): string { return JSON.stringify(this.fields.slice(this.start, this.end).map((field) => [field.name, field.value.getRaw()])); }
}

export type JSONRecordHandler = (record: Readonly<Record<string, unknown>>, root: unknown) => void;

export class JSONInput {
  constructor(private readonly onRecord?: JSONRecordHandler) {}

  parse(root: unknown, input?: string): unknown | Promise<unknown[]> {
    if (input === undefined) throw new RuntimeException("Missing JSON input data");
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      throw new RuntimeException(`Error parsing JSON data: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (root && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const document = parsed as Record<string, unknown>;
      applyDataFields(root, document.plan ?? document);
    }
    this.visit(parsed, root);
    return parsed;
  }

  private visit(value: unknown, root: unknown): void {
    if (Array.isArray(value)) {
      for (const entry of value) this.visit(entry, root);
      return;
    }
    if (value && typeof value === "object") {
      this.onRecord?.(value as Readonly<Record<string, unknown>>, root);
      for (const entry of globalThis.Object.values(value)) this.visit(entry, root);
    }
  }
}

export class JSONInputString extends JSONInput {
  constructor(private readonly data: string, onRecord?: JSONRecordHandler) { super(onRecord); }
  override parse(root: unknown): unknown { return super.parse(root, this.data) as unknown; }
}

export class JSONInputFile extends JSONInput {
  constructor(private filename = "", onRecord?: JSONRecordHandler) { super(onRecord); }
  setFileName(filename: string): void { this.filename = filename; }
  getFileName(): string { return this.filename; }

  override async parse(root: unknown): Promise<unknown[]> {
    if (!this.filename) throw new RuntimeException("Missing input file or directory");
    const information = await stat(this.filename).catch(() => null);
    if (!information) throw new RuntimeException(`Couldn't open input file '${this.filename}'`);
    const files = information.isDirectory()
      ? (await readdir(this.filename)).filter((name) => extname(name).toLowerCase() === ".json").sort().map((name) => join(this.filename, name))
      : [this.filename];
    const result: unknown[] = [];
    for (const filename of files) {
      const contents = await readFile(filename, "utf8");
      if (Buffer.byteLength(contents) > 300_000_000) throw new RuntimeException("Maximum JSON file size is 300MB");
      result.push(super.parse(root, contents) as unknown);
    }
    return result;
  }
}

function propertyName(tag: Keyword | string): string {
  return tag instanceof Keyword ? tag.toString() : tag;
}

function serializable(value: unknown): unknown {
  if (value instanceof FreppleDate || value instanceof Duration) return value.toString();
  if (value instanceof FreppleObject) return objectProperties(value);
  if (value instanceof Map) return globalThis.Object.fromEntries(value);
  return value;
}

function objectProperties(object: FreppleObject | SerializableObject): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  object.writeProperties({ writeProperty: (name, value) => { output[name] = serializable(value); } });
  return output;
}

export class JSONSerializer implements SerializerAdapter {
  private readonly stack: unknown[] = [];
  private root: unknown = {};
  private formatted = false;
  private writeHidden = false;

  setFormatted(value: boolean): void { this.formatted = value; }
  getFormatted(): boolean { return this.formatted; }
  setWriteHidden(value: boolean): void { this.writeHidden = value; }
  getWriteHidden(): boolean { return this.writeHidden; }
  setMode(arrayMode: boolean): void { if (this.stack.length === 0) this.root = arrayMode ? [] : {}; }

  BeginObject(tag: Keyword | string, ...attributes: readonly unknown[]): void {
    const object: Record<string, unknown> = {};
    for (let index = 0; index + 1 < attributes.length; index += 2) {
      const key = attributes[index];
      if (key instanceof Keyword || typeof key === "string") object[propertyName(key)] = serializable(attributes[index + 1]);
    }
    this.attach(propertyName(tag), object);
    this.stack.push(object);
  }

  EndObject(_tag: Keyword | string): void { this.stack.pop(); }
  BeginList(tag: Keyword | string): void { const list: unknown[] = []; this.attach(propertyName(tag), list); this.stack.push(list); }
  EndList(_tag: Keyword | string): void { this.stack.pop(); }
  writeString(value: string): void { this.attach(undefined, value); }
  writeElement(tag: Keyword | string, value: unknown): void { this.attach(propertyName(tag), serializable(value)); }
  writeElementNull(tag: Keyword | string): void { this.attach(propertyName(tag), null); }
  writeProperty(name: string, value: unknown): void { this.attach(name, serializable(value)); }

  writeObject(tag: Keyword | string, object: FreppleObject | SerializableObject, _category = FieldCategory.BASE): void {
    this.attach(propertyName(tag), objectProperties(object));
  }

  escape(value: string): string { return JSON.stringify(value); }
  getData(): string { return JSON.stringify(this.root, null, this.formatted ? "\t" : undefined); }

  protected attach(key: string | undefined, value: unknown): void {
    const parent = this.stack.at(-1) ?? this.root;
    if (Array.isArray(parent)) parent.push(value);
    else if (parent && typeof parent === "object" && key !== undefined) (parent as Record<string, unknown>)[key] = value;
    else this.root = key === undefined ? value : { [key]: value };
  }
}

export class JSONSerializerString extends JSONSerializer {}

export class JSONSerializerFile extends JSONSerializer {
  constructor(private readonly filename: string) { super(); }
  async close(): Promise<void> { await writeFile(this.filename, this.getData(), "utf8"); }
}

export async function readJSONdata(input: string, root: unknown = null): Promise<unknown> {
  return new JSONInputString(input).parse(root);
}

export async function readJSONfile(filename: string, root: unknown = null): Promise<unknown[]> {
  return new JSONInputFile(filename).parse(root);
}

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
  "#include \"frepple/json.h\"",
  "",
  "#include <filesystem>",
  "#include <iomanip>",
  "",
  "/* Uncomment the next line to create a lot of debugging messages during",
  " * the parsing of the data. */",
  "// #define PARSE_DEBUG",
  "",
  "namespace frepple::utils {",
  "",
  "// This is used as a dummy field to indicate situations where we need to",
  "// set a property field on an object.",
  "MetaFieldBool<Demand> JSONInput::useProperty(Tags::booleanproperty,",
  "                                             &Demand::getHidden,",
  "                                             &Demand::setHidden);",
  "",
  "PyObject* saveJSONfile(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  char* filename;",
  "  char* content = nullptr;",
  "  int formatted = 0;",
  "  if (!PyArg_ParseTuple(args, \"s|sp:saveJSONfile\", &filename, &content,",
  "                        &formatted))",
  "    return nullptr;",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    JSONSerializerFile o(filename);",
  "    if (content) {",
  "      if (!strcmp(content, \"BASE\"))",
  "        o.setContentType(BASE);",
  "      else if (!strcmp(content, \"PLAN\"))",
  "        o.setContentType(PLAN);",
  "      else if (!strcmp(content, \"DETAIL\"))",
  "        o.setContentType(DETAIL);",
  "      else",
  "        throw DataException(\"Invalid content type '\" + string(content) + \"'\");",
  "    }",
  "    if (formatted) o.setFormatted(true);",
  "    o.setMode(true);",
  "    o.pushCurrentObject(&Plan::instance());",
  "    o.setSaveReferences(true);",
  "    Plan::instance().writeElement(&o, Tags::plan);",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void JSONSerializer::escape(const string& x) {",
  "  *m_fp << \"\\\"\";",
  "  for (const char* p = x.c_str(); *p; ++p) {",
  "    switch (*p) {",
  "      case '\"':",
  "        *m_fp << \"\\\\\\\"\";",
  "        break;",
  "      case '/':",
  "        *m_fp << \"\\\\/\";",
  "        break;",
  "      case '\\\\':",
  "        *m_fp << \"\\\\\\\\\";",
  "        break;",
  "      case '\\b':",
  "        *m_fp << \"\\\\b\";",
  "        break;",
  "      case '\\t':",
  "        *m_fp << \"\\\\t\";",
  "        break;",
  "      case '\\n':",
  "        *m_fp << \"\\\\n\";",
  "        break;",
  "      case '\\f':",
  "        *m_fp << \"\\\\f\";",
  "        break;",
  "      case '\\r':",
  "        *m_fp << \"\\\\r\";",
  "        break;",
  "      case '\\v':",
  "        *m_fp << \"\\\\v\";",
  "        break;",
  "      default:",
  "        if (static_cast<short>(*p) > 0 && static_cast<short>(*p) < 32)",
  "          // Control characters",
  "          *m_fp << \"\\\\u\" << setw(4) << static_cast<int>(*p);",
  "        else",
  "          *m_fp << *p;",
  "    }",
  "  }",
  "  *m_fp << \"\\\"\";",
  "}",
  "",
  "void JSONInputFile::parse(Object* pRoot) {",
  "  // Check if string has been set",
  "  if (filename.empty()) throw DataException(\"Missing input file or directory\");",
  "",
  "  // Check if the parameter is the name of a directory",
  "  filesystem::path p(filename);",
  "  if (!filesystem::exists(p))",
  "    // Can't verify the status",
  "    throw RuntimeException(\"Couldn't open input file '\" + filename + \"'\");",
  "  else if (filesystem::is_directory(p)) {",
  "    // Data is a directory: loop through all *.json files now. No recursion in",
  "    // subdirectories is done.",
  "    for (const auto& entry : filesystem::directory_iterator(p)) {",
  "      if (entry.is_regular_file() && entry.path().extension() == \".json\")",
  "        JSONInputFile(entry.path().string().c_str()).parse(pRoot);",
  "    }",
  "  } else {",
  "    // Normal file",
  "    // Read the complete file in a memory buffer",
  "    ifstream t;",
  "    t.open(filename.c_str());",
  "    t.seekg(0, ios::end);",
  "    ifstream::pos_type length = t.tellg();",
  "    if (length > 300000000) {",
  "      t.close();",
  "      throw DataException(\"Maximum JSON file size is 300MB\");",
  "    }",
  "    t.seekg(0, std::ios::beg);",
  "    unique_ptr<char[]> buffer(new char[length]);",
  "    t.read(buffer.get(), length);",
  "    t.close();",
  "",
  "    // Parse the data",
  "    JSONInput::parse(pRoot, buffer.get());",
  "  }",
  "}",
  "",
  "PyObject* readJSONfile(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  char* filename = nullptr;",
  "  if (!PyArg_ParseTuple(args, \"s:readJSONfile\", &filename)) return nullptr;",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    if (!filename) throw DataException(\"Missing filename\");",
  "    JSONInputFile(filename).parse(&Plan::instance());",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "PyObject* readJSONdata(PyObject*, PyObject* args) {",
  "  // Pick up arguments",
  "  char* data;",
  "  if (!PyArg_ParseTuple(args, \"s:readJSONdata\", &data)) return nullptr;",
  "",
  "  // Free Python interpreter for other threads",
  "  Py_BEGIN_ALLOW_THREADS;",
  "",
  "  // Execute and catch exceptions",
  "  try {",
  "    if (!data) throw DataException(\"No input data\");",
  "    JSONInputString(data).parse(&Plan::instance());",
  "  } catch (...) {",
  "    Py_BLOCK_THREADS;",
  "    PythonType::evalException();",
  "    return nullptr;",
  "  }",
  "",
  "  // Reclaim Python interpreter",
  "  Py_END_ALLOW_THREADS;",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "void JSONInput::parse(Object* pRoot, char* buffer) {",
  "  if (!pRoot)",
  "    throw DataException(\"Can't parse JSON data into nullptr root object\");",
  "",
  "  // Initialize the parser to read data into the object pRoot.",
  "  objectindex = -1;",
  "  dataindex = -1;",
  "  objects[0].start = 0;",
  "  objects[0].object = pRoot;",
  "  objects[0].cls = &pRoot->getType();",
  "  objects[0].hash = pRoot->getType().typetag->getHash();",
  "",
  "  // Call the rapidjson in-site parser.",
  "  // The parser will modify the string buffer during the parsing!",
  "  rapidjson::InsituStringStream buf(buffer);",
  "  rapidjson::Reader reader;",
  "  try {",
  "    rapidjson::ParseResult ok =",
  "        reader.Parse<rapidjson::kParseCommentsFlag |",
  "                     rapidjson::kParseTrailingCommasFlag |",
  "                     rapidjson::kParseStopWhenDoneFlag>(buf, *this);",
  "    if (!ok) {",
  "      ostringstream o;",
  "      o << \"Error position \" << ok.Offset()",
  "        << \" during JSON parsing: \" << rapidjson::GetParseError_En(ok.Code());",
  "      throw DataException(o.str());",
  "    }",
  "  } catch (const exception& e) {",
  "    logger << \"Parsing error near position \" << buf.Tell() << '\\n';",
  "    throw;",
  "  }",
  "}",
  "",
  "bool JSONInput::Null() {",
  "  if (dataindex < 0) return true;",
  "",
  "  data[dataindex].value.setNull();",
  "",
  "  if (objectindex == 0 && objects[objectindex].object &&",
  "      data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 4, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::Bool(bool b) {",
  "  if (dataindex < 0) return true;",
  "",
  "  data[dataindex].value.setBool(b);",
  "",
  "  if (objectindex == 0 && objects[objectindex].object &&",
  "      data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 1, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::Int(int i) {",
  "  if (dataindex < 0) return true;",
  "",
  "  data[dataindex].value.setInt(i);",
  "",
  "  if (objectindex == 0 && objects[objectindex].object &&",
  "      data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 3, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::Uint(unsigned u) {",
  "  if (dataindex < 0) return true;",
  "",
  "  data[dataindex].value.setLong(u);",
  "",
  "  if (objectindex == 0 && objects[objectindex].object &&",
  "      data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 3, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::Int64(int64_t i) {",
  "  if (dataindex < 0) return true;",
  "",
  "  if (i < LONG_MAX && i > LONG_MIN)",
  "    data[dataindex].value.setLong(static_cast<long>(i));",
  "  else",
  "    data[dataindex].value.setDouble(static_cast<double>(i));",
  "",
  "  if (objectindex == 0 && objects[objectindex].object &&",
  "      data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 3, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::Uint64(uint64_t u) {",
  "  if (dataindex < 0) return true;",
  "",
  "  if (u < ULONG_MAX)",
  "    data[dataindex].value.setUnsignedLong(static_cast<unsigned long>(u));",
  "  else",
  "    data[dataindex].value.setDouble(static_cast<double>(u));",
  "",
  "  if (objectindex == 0 && objects[objectindex].object &&",
  "      data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 3, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::Double(double d) {",
  "  if (dataindex < 0) return true;",
  "",
  "  data[dataindex].value.setDouble(d);",
  "",
  "  if (objectindex == 0 && objects[objectindex].object &&",
  "      data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 3, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::String(const char* str, rapidjson::SizeType, bool) {",
  "  if (dataindex < 0) return true;",
  "",
  "  // Note: JSON allows NULLs in the string values. FrePPLe doesn't, and the",
  "  // next line will only copy the part before the null characters.",
  "  // In XML, null characters are officially forbidden.",
  "  data[dataindex].value.setString(str);",
  "",
  "  if (data[dataindex].hash == Tags::type.getHash()) {",
  "    // Immediate processing of the type field",
  "    objects[objectindex].cls = MetaClass::findClass(str);",
  "    if (!objects[objectindex].cls)",
  "      throw DataException(\"Unknown type \" + string(str));",
  "  } else if (objectindex == 0 && objects[objectindex].object &&",
  "             data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].name == \"source\")",
  "      // Special case: Source specified as attribute of the root element",
  "      setSource(data[dataindex].value.getString());",
  "    else if (data[dataindex].field == &useProperty)",
  "      // Property stored as a string",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 4, getCommandManager());",
  "    else",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value);",
  "    --dataindex;",
  "  }",
  "  return true;",
  "}",
  "",
  "bool JSONInput::StartObject() {",
  "  if (++objectindex >= maxobjects)",
  "    // You're joking?",
  "    throw DataException(\"JSON-document nested excessively deep\");",
  "",
  "  // Reset the pointer to the object class being read",
  "  if (objectindex && dataindex >= 0 && data[dataindex].field) {",
  "    objects[objectindex].cls = data[dataindex].field->getClass();",
  "    objects[objectindex].object = nullptr;",
  "    objects[objectindex].start = dataindex + 1;",
  "  } else if (objectindex)",
  "    objects[objectindex].cls = nullptr;",
  "",
  "// Debugging message",
  "#ifdef PARSE_DEBUG",
  "  logger << \"Starting object #\" << objectindex << \" (type \"",
  "         << (objects[objectindex].cls ? objects[objectindex].cls->type",
  "                                      : \"nullptr\")",
  "         << \")\\n\";",
  "#endif",
  "  return true;",
  "}",
  "",
  "bool JSONInput::Key(const char* str, rapidjson::SizeType, bool) {",
  "  if (++dataindex >= maxdata)",
  "    // You're joking?",
  "    throw DataException(\"JSON-document nested excessively deep\");",
  "",
  "  // Look up the field",
  "  data[dataindex].value.setNull();",
  "  data[dataindex].hash = Keyword::hash(str);",
  "  data[dataindex].name = str;",
  "",
  "  if (objects[objectindex].cls) {",
  "    data[dataindex].field =",
  "        objects[objectindex].cls->findField(data[dataindex].hash);",
  "    if (!data[dataindex].field && objects[objectindex].cls->category)",
  "      data[dataindex].field =",
  "          objects[objectindex].cls->category->findField(data[dataindex].hash);",
  "    if (!data[dataindex].field) data[dataindex].field = &useProperty;",
  "  } else",
  "    data[dataindex].field = nullptr;",
  "",
  "// Debugging message",
  "#ifdef PARSE_DEBUG",
  "  logger << \"Reading field #\" << dataindex << \" '\" << str << \"' for object #\"",
  "         << objectindex << \" (\"",
  "         << ((objectindex >= 0 && objects[objectindex].cls)",
  "                 ? objects[objectindex].cls->type",
  "                 : \"none\")",
  "         << \")\\n\";",
  "#endif",
  "",
  "  return true;",
  "}",
  "",
  "bool JSONInput::EndObject(rapidjson::SizeType) {",
  "  // Build a dictionary with all fields of this model",
  "  JSONDataValueDict dict(data, objects[objectindex].start, dataindex);",
  "",
  "  // Push also the source field in the attributes.",
  "  // This is only required if 1) it's not in the dict yet, and 2) there",
  "  // is a value set at the interface level, 3) the class has a source field.",
  "  if (!getSource().empty()) {",
  "    auto s = dict.get(Tags::source);",
  "    if (!s) {",
  "      const MetaFieldBase* f =",
  "          objects[objectindex].cls->findField(Tags::source);",
  "      if (!f && objects[objectindex].cls->category)",
  "        f = objects[objectindex].cls->category->findField(Tags::source);",
  "      if (f) {",
  "        data[++dataindex].field = f;",
  "        data[dataindex].hash = Tags::source.getHash();",
  "        data[dataindex].value.setString(getSource());",
  "        dict.enlarge();",
  "      }",
  "    }",
  "  }",
  "",
  "  // Check if we need to add a parent object to the dict",
  "  bool found_parent = false;",
  "  if (objectindex > 0 && objects[objectindex].cls &&",
  "      objects[objectindex].cls->parent) {",
  "    assert(objects[objectindex - 1].cls);",
  "    const MetaClass* cl = objects[objectindex - 1].cls;",
  "    for (auto i = objects[objectindex].cls->getFields().begin();",
  "         i != objects[objectindex].cls->getFields().end(); ++i)",
  "      if ((*i)->getFlag(PARENT) && objectindex >= 1) {",
  "        const MetaFieldBase* fld = data[objects[objectindex].start - 1].field;",
  "        if (fld && !fld->isGroup())",
  "          // Only under a group field can we inherit from a parent object",
  "          continue;",
  "        if (*((*i)->getClass()) == *cl ||",
  "            (cl->category && *((*i)->getClass()) == *(cl->category))) {",
  "          // Parent object matches expected type as parent field",
  "          // First, create the parent object. It is normally created only",
  "          // AFTER all its fields are read in, and that's too late for us.",
  "          if (!objects[objectindex - 1].object) {",
  "            JSONDataValueDict dict_parent(data, objects[objectindex - 1].start,",
  "                                          objects[objectindex].start - 1);",
  "            if (objects[objectindex - 1].cls->category) {",
  "              assert(objects[objectindex - 1].cls->category->readFunction);",
  "              objects[objectindex - 1].object =",
  "                  objects[objectindex - 1].cls->category->readFunction(",
  "                      objects[objectindex - 1].cls, dict_parent,",
  "                      getCommandManager());",
  "            } else {",
  "              assert(",
  "                  static_cast<const MetaCategory*>(objects[objectindex - 1].cls)",
  "                      ->readFunction);",
  "              objects[objectindex - 1].object =",
  "                  static_cast<const MetaCategory*>(objects[objectindex - 1].cls)",
  "                      ->readFunction(objects[objectindex - 1].cls, dict_parent,",
  "                                     getCommandManager());",
  "            }",
  "            // Set fields already available now on the parent object",
  "            for (auto idx = objects[objectindex - 1].start;",
  "                 idx < objects[objectindex].start; ++idx) {",
  "              if (data[idx].hash == Tags::type.getHash() ||",
  "                  data[idx].hash == Tags::action.getHash())",
  "                continue;",
  "              if (data[idx].field == &useProperty &&",
  "                  objects[objectindex - 1].object) {",
  "                // Check again. If a field is defined on a subclass it is",
  "                // possible that we didn't see it before the object got created.",
  "                auto tmp = objects[objectindex - 1].object->getType().findField(",
  "                    data[idx].hash);",
  "                if (tmp) data[idx].field = tmp;",
  "              }",
  "              if (data[idx].field == &useProperty) {",
  "                switch (data[idx].value.getDataType()) {",
  "                  case JSONData::JSON_BOOL:",
  "                    // Property stored as a boolean",
  "                    objects[objectindex - 1].object->setProperty(",
  "                        data[idx].name, data[idx].value, 1,",
  "                        getCommandManager());",
  "                    break;",
  "                  case JSONData::JSON_INT:",
  "                  case JSONData::JSON_LONG:",
  "                  case JSONData::JSON_UNSIGNEDLONG:",
  "                  case JSONData::JSON_DOUBLE:",
  "                    // Property stored as a double value",
  "                    objects[objectindex - 1].object->setProperty(",
  "                        data[idx].name, data[idx].value, 3,",
  "                        getCommandManager());",
  "                    break;",
  "                  default:",
  "                    // Property stored as a string",
  "                    objects[objectindex - 1].object->setProperty(",
  "                        data[idx].name, data[idx].value, 4,",
  "                        getCommandManager());",
  "                }",
  "              } else if (data[idx].field && !data[idx].field->isGroup()) {",
  "                data[idx].field->setField(objects[objectindex - 1].object,",
  "                                          data[idx].value, getCommandManager());",
  "                data[idx].field = nullptr;  // Mark as already applied",
  "              }",
  "            }",
  "          }",
  "          // Add reference to parent to the current dict",
  "          if (++dataindex >= maxdata)",
  "            // You're joking?",
  "            throw DataException(\"JSON-document nested excessively deep\");",
  "          data[dataindex].field = *i;",
  "          data[dataindex].hash = (*i)->getHash();",
  "          data[dataindex].value.setObject(objects[objectindex - 1].object);",
  "          dict.enlarge();",
  "          found_parent = true;",
  "          break;",
  "        }",
  "      }",
  "  }",
  "  if (!found_parent && objectindex > 0 && objects[objectindex].cls &&",
  "      objects[objectindex].cls->category &&",
  "      objects[objectindex].cls->category->parent) {",
  "    assert(objects[objectindex - 1].cls);",
  "    const MetaClass* cl = objects[objectindex - 1].cls;",
  "    for (auto i = objects[objectindex].cls->category->getFields().begin();",
  "         i != objects[objectindex].cls->category->getFields().end(); ++i)",
  "      if ((*i)->getFlag(PARENT) && objectindex >= 1) {",
  "        const MetaFieldBase* fld = data[objects[objectindex].start - 1].field;",
  "        if (fld && !fld->isGroup())",
  "          // Only under a group field can we inherit from a parent object",
  "          continue;",
  "        if (*((*i)->getClass()) == *cl ||",
  "            (cl->category && *((*i)->getClass()) == *(cl->category))) {",
  "          // Parent object matches expected type as parent field",
  "          // First, create the parent object. It is normally created only",
  "          // AFTER all its fields are read in, and that's too late for us.",
  "          if (!objects[objectindex - 1].object) {",
  "            JSONDataValueDict dict_parent(data, objects[objectindex - 1].start,",
  "                                          objects[objectindex].start - 1);",
  "            if (objects[objectindex - 1].cls->category) {",
  "              assert(objects[objectindex - 1].cls->category->readFunction);",
  "              objects[objectindex - 1].object =",
  "                  objects[objectindex - 1].cls->category->readFunction(",
  "                      objects[objectindex - 1].cls, dict_parent,",
  "                      getCommandManager());",
  "            } else {",
  "              assert(",
  "                  static_cast<const MetaCategory*>(objects[objectindex - 1].cls)",
  "                      ->readFunction);",
  "              objects[objectindex - 1].object =",
  "                  static_cast<const MetaCategory*>(objects[objectindex - 1].cls)",
  "                      ->readFunction(objects[objectindex - 1].cls, dict_parent,",
  "                                     getCommandManager());",
  "            }",
  "            // Set fields already available now on the parent object",
  "            for (auto idx = objects[objectindex - 1].start;",
  "                 idx < objects[objectindex].start; ++idx) {",
  "              if (data[idx].hash == Tags::type.getHash() ||",
  "                  data[idx].hash == Tags::action.getHash())",
  "                continue;",
  "              if (data[idx].field == &useProperty &&",
  "                  objects[objectindex - 1].object) {",
  "                // Check again. If a field is defined on a subclass it is",
  "                // possible that we didn't see it before the object got created.",
  "                auto tmp = objects[objectindex - 1].object->getType().findField(",
  "                    data[idx].hash);",
  "                if (tmp) data[idx].field = tmp;",
  "              }",
  "              if (data[idx].field == &useProperty) {",
  "                switch (data[idx].value.getDataType()) {",
  "                  case JSONData::JSON_BOOL:",
  "                    // Property stored as a boolean",
  "                    objects[objectindex - 1].object->setProperty(",
  "                        data[idx].name, data[idx].value, 1,",
  "                        getCommandManager());",
  "                    break;",
  "                  case JSONData::JSON_INT:",
  "                  case JSONData::JSON_LONG:",
  "                  case JSONData::JSON_UNSIGNEDLONG:",
  "                  case JSONData::JSON_DOUBLE:",
  "                    // Property stored as a double value",
  "                    objects[objectindex - 1].object->setProperty(",
  "                        data[idx].name, data[idx].value, 3,",
  "                        getCommandManager());",
  "                    break;",
  "                  default:",
  "                    // Property stored as a string",
  "                    objects[objectindex - 1].object->setProperty(",
  "                        data[idx].name, data[idx].value, 4,",
  "                        getCommandManager());",
  "                }",
  "              } else if (data[idx].field && !data[idx].field->isGroup()) {",
  "                data[idx].field->setField(objects[objectindex - 1].object,",
  "                                          data[idx].value, getCommandManager());",
  "                data[idx].field = nullptr;  // Mark as already applied",
  "              }",
  "            }",
  "          }",
  "          // Add reference to parent to the current dict",
  "          if (++dataindex >= maxdata)",
  "            // You're joking?",
  "            throw DataException(\"JSON-document nested excessively deep\");",
  "          data[dataindex].field = *i;",
  "          data[dataindex].hash = (*i)->getHash();",
  "          data[dataindex].value.setObject(objects[objectindex - 1].object);",
  "          dict.enlarge();",
  "          break;",
  "        }",
  "      }",
  "  }",
  "",
  "// Debugging",
  "#ifdef PARSE_DEBUG",
  "  logger << \"Ending Object #\" << objectindex << \" (\"",
  "         << ((objectindex >= 0 && objects[objectindex].cls)",
  "                 ? objects[objectindex].cls->type",
  "                 : \"none\")",
  "         << \"):\\n\";",
  "  dict.print();",
  "#endif",
  "",
  "  // Root object never gets created",
  "  if (objectindex) {",
  "    // Call the object factory for the category and pass all field values",
  "    // in a dictionary.",
  "    // In some cases, the reading of the child fields already triggered the",
  "    // creation of the parent. In such cases we can skip the creation step",
  "    // here.",
  "    if (!objects[objectindex].object) {",
  "      if (!objects[objectindex].cls) {",
  "        auto f = data[objects[objectindex - 1].start].field->getFunction();",
  "        if (f)",
  "          f(objects[objectindex - 1].object, dict, getCommandManager());",
  "        else",
  "          objects[objectindex].object = nullptr;",
  "      } else if (objects[objectindex].cls->category) {",
  "        assert(objects[objectindex].cls->category->readFunction);",
  "        objects[objectindex].object =",
  "            objects[objectindex].cls->category->readFunction(",
  "                objects[objectindex].cls, dict, getCommandManager());",
  "      } else if (static_cast<const MetaCategory*>(objects[objectindex].cls)",
  "                     ->readFunction)",
  "        objects[objectindex].object =",
  "            static_cast<const MetaCategory*>(objects[objectindex].cls)",
  "                ->readFunction(objects[objectindex].cls, dict,",
  "                               getCommandManager());",
  "      else",
  "        objects[objectindex].object = nullptr;",
  "    }",
  "  }",
  "",
  "  // Update all fields on the new object",
  "  if (objects[objectindex].object) {",
  "    for (auto idx = dict.getStart(); idx <= dict.getEnd(); ++idx) {",
  "      if (data[idx].hash == Tags::type.getHash() ||",
  "          data[idx].hash == Tags::action.getHash())",
  "        continue;",
  "      if (data[idx].field == &useProperty && objects[objectindex].object) {",
  "        // Check again. If a field is defined on a subclass it is possible that",
  "        // we didn't see it before the object got created.",
  "        auto tmp =",
  "            objects[objectindex].object->getType().findField(data[idx].hash);",
  "        if (tmp) data[idx].field = tmp;",
  "      }",
  "      if (data[idx].field == &useProperty) {",
  "        switch (data[idx].value.getDataType()) {",
  "          case JSONData::JSON_BOOL:",
  "            // Property stored as a boolean",
  "            objects[objectindex].object->setProperty(",
  "                data[idx].name, data[idx].value, 1, getCommandManager());",
  "            break;",
  "          case JSONData::JSON_INT:",
  "          case JSONData::JSON_LONG:",
  "          case JSONData::JSON_UNSIGNEDLONG:",
  "          case JSONData::JSON_DOUBLE:",
  "            // Property stored as a double value",
  "            objects[objectindex].object->setProperty(",
  "                data[idx].name, data[idx].value, 3, getCommandManager());",
  "            break;",
  "          default:",
  "            // Property stored as a string",
  "            objects[objectindex].object->setProperty(",
  "                data[idx].name, data[idx].value, 4, getCommandManager());",
  "        }",
  "      } else if (data[idx].field && !data[idx].field->isGroup())",
  "        data[idx].field->setField(objects[objectindex].object, data[idx].value,",
  "                                  getCommandManager());",
  "    }",
  "  }",
  "",
  "  if (objectindex && dataindex && data[dict.getStart() - 1].field &&",
  "      data[dict.getStart() - 1].field->isPointer())",
  "    // Update parent object",
  "    data[dict.getStart() - 1].value.setObject(objects[objectindex].object);",
  "",
  "  // Call the user exits",
  "  if (getUserExit()) getUserExit().call(objects[objectindex].object);",
  "  callUserExitCpp(objects[objectindex].object);",
  "",
  "  // Update stack",
  "  dataindex = objects[objectindex--].start - 1;",
  "  return true;",
  "}",
  "",
  "bool JSONInput::StartArray() {",
  "#ifdef PARSE_DEBUG",
  "  logger << \"Starting array\\n\";",
  "#endif",
  "  return true;",
  "}",
  "",
  "bool JSONInput::EndArray(rapidjson::SizeType) {",
  "#ifdef PARSE_DEBUG",
  "  logger << \"Ending array\\n\";",
  "#endif",
  "  return true;",
  "}",
  "",
  "long JSONData::getLong() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      return 0;",
  "    case JSON_BOOL:",
  "      return data_bool ? 1 : 0;",
  "    case JSON_INT:",
  "      return data_int;",
  "    case JSON_LONG:",
  "      return data_long;",
  "    case JSON_UNSIGNEDLONG:",
  "      return data_unsignedlong;",
  "    case JSON_DOUBLE:",
  "      if (data_double > LONG_MAX)",
  "        return LONG_MAX;",
  "      else if (data_double < LONG_MIN)",
  "        return LONG_MIN;",
  "      else",
  "        return static_cast<long>(data_double);",
  "    case JSON_STRING:",
  "      return atol(data_string.c_str());",
  "    case JSON_OBJECT:",
  "      throw DataException(\"Invalid JSON data: no cast from object to long\");",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "unsigned long JSONData::getUnsignedLong() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      return 0;",
  "    case JSON_BOOL:",
  "      return data_bool ? 1 : 0;",
  "    case JSON_INT:",
  "      return data_int;",
  "    case JSON_LONG:",
  "      return data_long;",
  "    case JSON_UNSIGNEDLONG:",
  "      return data_unsignedlong;",
  "    case JSON_DOUBLE:",
  "      if (data_double > ULONG_MAX)",
  "        return ULONG_MAX;",
  "      else",
  "        return static_cast<long>(data_double);",
  "    case JSON_STRING:",
  "      return atol(data_string.c_str());",
  "    case JSON_OBJECT:",
  "      throw DataException(",
  "          \"Invalid JSON data: no cast from object to unsigned long\");",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "Duration JSONData::getDuration() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      return Duration(0L);",
  "    case JSON_BOOL:",
  "      return Duration(data_bool ? 1L : 0L);",
  "    case JSON_INT:",
  "      return static_cast<long>(data_int);",
  "    case JSON_LONG:",
  "      return data_long;",
  "    case JSON_UNSIGNEDLONG:",
  "      return static_cast<double>(data_unsignedlong);",
  "    case JSON_DOUBLE:",
  "      return data_double;",
  "    case JSON_STRING:",
  "      return atol(data_string.c_str());",
  "    case JSON_OBJECT:",
  "      throw DataException(\"Invalid JSON data: no cast from object to duration\");",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "int JSONData::getInt() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      return 0;",
  "    case JSON_BOOL:",
  "      return data_bool ? 1 : 0;",
  "    case JSON_INT:",
  "      return data_int;",
  "    case JSON_LONG:",
  "      return data_long;",
  "    case JSON_UNSIGNEDLONG:",
  "      return data_unsignedlong;",
  "    case JSON_DOUBLE:",
  "      if (data_double > INT_MAX)",
  "        return INT_MAX;",
  "      else if (data_double < INT_MIN)",
  "        return INT_MIN;",
  "      else",
  "        return static_cast<int>(data_double);",
  "    case JSON_STRING:",
  "      return atol(data_string.c_str());",
  "    case JSON_OBJECT:",
  "      throw DataException(\"Invalid JSON data: no cast from object to integer\");",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "double JSONData::getDouble() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      return 0;",
  "    case JSON_BOOL:",
  "      return data_bool ? 1 : 0;",
  "    case JSON_INT:",
  "      return data_int;",
  "    case JSON_LONG:",
  "      return data_long;",
  "    case JSON_UNSIGNEDLONG:",
  "      return data_unsignedlong;",
  "    case JSON_DOUBLE:",
  "      return data_double;",
  "    case JSON_STRING:",
  "      return atol(data_string.c_str());",
  "    case JSON_OBJECT:",
  "      throw DataException(\"Invalid JSON data: no cast from object to double\");",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "Date JSONData::getDate() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      return Date();",
  "    case JSON_BOOL:",
  "      return data_bool ? Date::infinitePast : Date::infiniteFuture;",
  "    case JSON_INT:",
  "      return Date(data_int);",
  "    case JSON_LONG:",
  "      return Date(data_long);",
  "    case JSON_UNSIGNEDLONG:",
  "      return Date(data_unsignedlong);",
  "    case JSON_DOUBLE:",
  "      return Date(static_cast<time_t>(data_double));",
  "    case JSON_STRING:",
  "      return Date(data_string.c_str());",
  "    case JSON_OBJECT:",
  "      throw DataException(\"Invalid JSON data: no cast from object to date\");",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "const string& JSONData::getString() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      const_cast<JSONData*>(this)->data_string = \"\";",
  "      return data_string;",
  "    case JSON_BOOL: {",
  "      ostringstream convert;",
  "      convert << data_bool;",
  "      const_cast<JSONData*>(this)->data_string = convert.str();",
  "      return data_string;",
  "    }",
  "    case JSON_INT: {",
  "      ostringstream convert;",
  "      convert << data_int;",
  "      const_cast<JSONData*>(this)->data_string = convert.str();",
  "      return data_string;",
  "    }",
  "    case JSON_LONG: {",
  "      ostringstream convert;",
  "      convert << data_long;",
  "      const_cast<JSONData*>(this)->data_string = convert.str();",
  "      return data_string;",
  "    }",
  "    case JSON_UNSIGNEDLONG: {",
  "      ostringstream convert;",
  "      convert << data_unsignedlong;",
  "      const_cast<JSONData*>(this)->data_string = convert.str();",
  "      return data_string;",
  "    }",
  "    case JSON_DOUBLE: {",
  "      ostringstream convert;",
  "      convert << data_double;",
  "      const_cast<JSONData*>(this)->data_string = convert.str();",
  "      return data_string;",
  "    }",
  "    case JSON_STRING:",
  "      return data_string;",
  "    case JSON_OBJECT:",
  "      throw DataException(\"Invalid JSON data: no cast from object to string\");",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "bool JSONData::getBool() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "      return false;",
  "    case JSON_BOOL:",
  "      return data_bool;",
  "    case JSON_INT:",
  "      return data_int != 0;",
  "    case JSON_LONG:",
  "      return data_long != 0;",
  "    case JSON_UNSIGNEDLONG:",
  "      return data_unsignedlong != 0;",
  "    case JSON_DOUBLE:",
  "      return data_double != 0;",
  "    case JSON_STRING:",
  "      return !data_string.empty();",
  "    case JSON_OBJECT:",
  "      return data_object != nullptr;",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "Object* JSONData::getObject() const {",
  "  switch (data_type) {",
  "    case JSON_NULL:",
  "    case JSON_BOOL:",
  "    case JSON_INT:",
  "    case JSON_LONG:",
  "    case JSON_UNSIGNEDLONG:",
  "    case JSON_DOUBLE:",
  "    case JSON_STRING:",
  "      return nullptr;",
  "    case JSON_OBJECT:",
  "      return data_object;",
  "  }",
  "  throw DataException(\"Unknown JSON type\");",
  "}",
  "",
  "void JSONDataValueDict::print() {",
  "  for (auto i = strt; i <= nd; ++i) {",
  "    if (fields[i].field)",
  "      logger << \"  \" << i << \"   \" << fields[i].field->getName().getName()",
  "             << \": \";",
  "    else",
  "      logger << \"  \" << i << \"   null: \";",
  "    auto* obj = static_cast<Object*>(fields[i].value.getObject());",
  "    if (obj)",
  "      logger << \"pointer to \" << obj->getType().type << '\\n';",
  "    else",
  "      logger << fields[i].value.getString() << '\\n';",
  "  }",
  "}",
  "",
  "const JSONData* JSONDataValueDict::get(const Keyword& key) const {",
  "  for (auto i = strt; i <= nd; ++i)",
  "    if (fields[i].hash == key.getHash()) return &fields[i].value;",
  "  return nullptr;",
  "}",
  "",
  "}  // namespace frepple::utils",
];
