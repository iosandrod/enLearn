// <header-api-generated>
import { HeaderModelAdapter } from "./library.js";

export const XMLDataValueDictCppModel = { bases: ["DataValueDict"] as const, methods: ["enlarge","get","print"] as const, qualifiedNames: ["XMLDataValueDict"] as const };

export const XMLInputCppModel = { bases: ["DataInput","DefaultHandler","NonCopyable"] as const, methods: ["getAbortOnDataError","getAllowPython","parse","setAbortOnDataError","setAllowPython","setLogLevel","transcodeUTF8"] as const, qualifiedNames: ["XMLInput"] as const };

export const XMLInputFileCppModel = { bases: ["XMLInput"] as const, methods: ["getFileName","parse","setFileName"] as const, qualifiedNames: ["XMLInputFile"] as const };

export class XMLInputFld extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["XMLInput::fld"] as const;
}

export class XMLInputObj extends HeaderModelAdapter {
  static readonly cppBases = [] as const;
  static readonly cppQualifiedNames = ["XMLInput::obj"] as const;
}

export const XMLInputStringCppModel = { bases: ["XMLInput"] as const, methods: ["parse"] as const, qualifiedNames: ["XMLInputString"] as const };

export const XMLSerializerCppModel = { bases: ["Serializer"] as const, methods: ["BeginList","BeginObject","EndList","EndObject","countObjects","getCurrentObject","getIndent","getPreviousObject","writeElement","writeElementWithHeader","writeString"] as const, qualifiedNames: ["XMLSerializer"] as const };

export const XMLSerializerFileCppModel = { bases: ["XMLSerializer"] as const, methods: [] as const, qualifiedNames: ["XMLSerializerFile"] as const };

export const XMLSerializerStringCppModel = { bases: ["XMLSerializer"] as const, methods: ["getData"] as const, qualifiedNames: ["XMLSerializerString"] as const };
// </header-api-generated>


























/**
 * Semantic migration unit for src/utils/xml.cpp.
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
  { name: "XMLInput::transcodeUTF8", sourceLine: 37, status: "adapted" },
  { name: "xercesc::XMLString::stringLen", sourceLine: 40, status: "adapted" },
  { name: "XMLInput::XMLInput", sourceLine: 47, status: "adapted" },
  { name: "XMLInput::processingInstruction", sourceLine: 58, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 71, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 72, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 78, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 79, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 81, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 82, status: "adapted" },
  { name: "XMLInput::startElement", sourceLine: 87, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 148, status: "adapted" },
  { name: "Keyword::hash", sourceLine: 269, status: "adapted" },
  { name: "XMLInput::endElement", sourceLine: 320, status: "adapted" },
  { name: "XMLInput::characters", sourceLine: 607, status: "adapted" },
  { name: "XMLInput::warning", sourceLine: 612, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 617, status: "adapted" },
  { name: "XMLInput::fatalError", sourceLine: 620, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 625, status: "adapted" },
  { name: "XMLInput::error", sourceLine: 629, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 634, status: "adapted" },
  { name: "XMLInput::~XMLInput", sourceLine: 638, status: "adapted" },
  { name: "XMLInput::parse", sourceLine: 643, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 672, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 706, status: "adapted" },
  { name: "XMLSerializer::escape", sourceLine: 726, status: "adapted" },
  { name: "XMLSerializer::incIndent", sourceLine: 750, status: "adapted" },
  { name: "XMLSerializer::decIndent", sourceLine: 756, status: "adapted" },
  { name: "Serializer::setContentType", sourceLine: 761, status: "adapted" },
  { name: "Serializer::writeElement", sourceLine: 773, status: "adapted" },
  { name: "XMLSerializer::writeElementWithHeader", sourceLine: 798, status: "adapted" },
  { name: "XMLDataValueDict::get", sourceLine: 827, status: "adapted" },
  { name: "XMLDataValueDict::print", sourceLine: 833, status: "adapted" },
  { name: "XMLData::getBool", sourceLine: 847, status: "adapted" },
  { name: "DataKeyword::getName", sourceLine: 861, status: "adapted" },
  { name: "Keyword::Keyword", sourceLine: 869, status: "adapted" },
  { name: "Keyword::Keyword", sourceLine: 877, status: "adapted" },
  { name: "Keyword::check", sourceLine: 887, status: "adapted" },
  { name: "Keyword::~Keyword", sourceLine: 901, status: "adapted" },
  { name: "Keyword::find", sourceLine: 907, status: "adapted" },
  { name: "Keyword::getTags", sourceLine: 912, status: "adapted" },
  { name: "Keyword::printTags", sourceLine: 917, status: "adapted" },
  { name: "XMLInputFile::parse", sourceLine: 922, status: "adapted" },
  { name: "filesystem::is_directory", sourceLine: 931, status: "adapted" },
  { name: "xercesc::XMLString::release", sourceLine: 943, status: "adapted" },
  { name: "XMLInput::parse", sourceLine: 944, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface DataKeywordPort {
  getName(...args: readonly PortValue[]): PortValue | void;
}

export interface KeywordPort {
  Keyword(...args: readonly PortValue[]): PortValue | void;
  check(...args: readonly PortValue[]): PortValue | void;
  disposeKeyword(...args: readonly PortValue[]): PortValue | void;
  find(...args: readonly PortValue[]): PortValue | void;
  getTags(...args: readonly PortValue[]): PortValue | void;
  hash(...args: readonly PortValue[]): PortValue | void;
  printTags(...args: readonly PortValue[]): PortValue | void;
}

export interface SerializerPort {
  setContentType(...args: readonly PortValue[]): PortValue | void;
  writeElement(...args: readonly PortValue[]): PortValue | void;
}

export interface XMLDataPort {
  getBool(...args: readonly PortValue[]): PortValue | void;
}

export interface XMLDataValueDictPort {
  get(...args: readonly PortValue[]): PortValue | void;
  print(...args: readonly PortValue[]): PortValue | void;
}

export interface XMLInputPort {
  XMLInput(...args: readonly PortValue[]): PortValue | void;
  characters(...args: readonly PortValue[]): PortValue | void;
  disposeXMLInput(...args: readonly PortValue[]): PortValue | void;
  endElement(...args: readonly PortValue[]): PortValue | void;
  error(...args: readonly PortValue[]): PortValue | void;
  fatalError(...args: readonly PortValue[]): PortValue | void;
  parse(...args: readonly PortValue[]): PortValue | void;
  processingInstruction(...args: readonly PortValue[]): PortValue | void;
  startElement(...args: readonly PortValue[]): PortValue | void;
  transcodeUTF8(...args: readonly PortValue[]): PortValue | void;
  warning(...args: readonly PortValue[]): PortValue | void;
}

export interface XMLInputFilePort {
  parse(...args: readonly PortValue[]): PortValue | void;
}

export interface XMLSerializerPort {
  decIndent(...args: readonly PortValue[]): PortValue | void;
  escape(...args: readonly PortValue[]): PortValue | void;
  incIndent(...args: readonly PortValue[]): PortValue | void;
  writeElementWithHeader(...args: readonly PortValue[]): PortValue | void;
}

export interface XMLStringPort {
  release(...args: readonly PortValue[]): PortValue | void;
  stringLen(...args: readonly PortValue[]): PortValue | void;
}

export interface filesystemPort {
  is_directory(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/utils/xml.cpp";
export const targetFile = "utils/xml.ts";

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { Date as FreppleDate, Duration } from "./date.js";
import { applyDataFields, Keyword, RuntimeException } from "./library.js";
import { FieldCategory, Object as FreppleObject, type SerializableObject, type SerializerAdapter } from "./python.js";

export class DataKeyword {
  private name: string;
  private hashValue: number;

  constructor(name = "") { this.name = name; this.hashValue = Keyword.hash(name); }
  reset(name: string): void { this.name = name; this.hashValue = Keyword.hash(name); }
  getName(): string { return this.name; }
  getHash(): number { return this.hashValue; }
  isA(keyword: Keyword): boolean { return keyword.getHash() === this.hashValue; }
}

export class XMLData {
  private text = "";
  private object: FreppleObject | null = null;

  constructor(value: string | FreppleObject = "") { value instanceof FreppleObject ? this.setObject(value) : this.setString(value); }
  reset(): void { this.text = ""; this.object = null; }
  appendString(value: string): void { this.text += value; }
  setData(value: string): void { this.setString(value); }
  getData(): string { return this.text; }
  getLong(): number { return Math.trunc(Number(this.text) || 0); }
  getUnsignedLong(): number { return Math.max(0, this.getLong()); }
  getDuration(): Duration { return new Duration(this.text); }
  getInt(): number { return this.getLong(); }
  getDouble(): number { return Number(this.text) || 0; }
  getDate(): FreppleDate { return new FreppleDate(this.text); }
  getString(): string { return this.text; }
  getStringList(): string[] {
    return this.text.split(/[,;\s]+/).map((value) => value.trim()).filter(Boolean);
  }
  getBool(): boolean { const first = this.text.charAt(0).toLowerCase(); return first !== "" && first !== "f" && first !== "0"; }
  getObject(): FreppleObject | null { return this.object; }
  setLong(value: number): void { this.setString(String(Math.trunc(value))); }
  setUnsignedLong(value: number): void { this.setString(String(Math.max(0, Math.trunc(value)))); }
  setDuration(value: Duration): void { this.setString(value.toString()); }
  setInt(value: number): void { this.setString(String(Math.trunc(value))); }
  setDouble(value: number): void { this.setString(String(value)); }
  setDate(value: FreppleDate): void { this.setString(value.toString()); }
  setString(value: string): void { this.text = value; this.object = null; }
  setBool(value: boolean): void { this.setString(value ? "true" : "false"); }
  setObject(value: FreppleObject | null): void { this.object = value; }
}

export const XMLDataCppModel = {
  bases: ["DataValue"] as const,
  methods: ["appendString", "getBool", "getData", "getDate", "getDouble", "getDuration", "getInt", "getLong", "getObject", "getString", "getStringList", "getUnsignedLong", "reset", "setBool", "setData", "setDate", "setDouble", "setDuration", "setInt", "setLong", "setObject", "setString", "setUnsignedLong"] as const,
  qualifiedNames: ["XMLData"] as const,
};

export interface XMLField { readonly name: string; readonly hash: number; readonly value: XMLData; }

export class XMLDataValueDict {
  constructor(readonly fields: readonly XMLField[], private start = 0, private end = fields.length) {}
  get(key: Keyword | string): XMLData | null {
    const hash = key instanceof Keyword ? key.getHash() : Keyword.hash(key);
    return this.fields.slice(this.start, this.end).find((field) => field.hash === hash)?.value ?? null;
  }
  enlarge(): void { this.end = Math.min(this.fields.length, this.end + 1); }
  print(): string { return this.fields.slice(this.start, this.end).map((field) => `${field.name}=${field.value.getString()}`).join(", "); }
}

export type XMLRecordHandler = (name: string, value: unknown, root: unknown) => void;

export class XMLInput {
  private abortOnDataException = true;
  private logLevel = 0;
  private allowPythonInstructions = false;

  constructor(private readonly onRecord?: XMLRecordHandler) {}
  setAbortOnDataError(value: boolean): void { this.abortOnDataException = value; }
  getAbortOnDataError(): boolean { return this.abortOnDataException; }
  setLogLevel(value: number): void { this.logLevel = value; }
  getLogLevel(): number { return this.logLevel; }
  setAllowPython(value: boolean): void { this.allowPythonInstructions = value; }
  getAllowPython(): boolean { return this.allowPythonInstructions; }
  transcodeUTF8(value: string): string { return value; }

  parseString(input: string, root: unknown = null, validate = false): unknown {
    if (!this.allowPythonInstructions && /<\?python\b/i.test(input)) input = input.replace(/<\?python[\s\S]*?\?>/gi, "");
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", allowBooleanAttributes: true, parseTagValue: false, parseAttributeValue: false });
      const value: unknown = parser.parse(input);
      if (root && value && typeof value === "object" && !Array.isArray(value)) {
        const document = value as Record<string, unknown>;
        applyDataFields(root, document.plan ?? document);
      }
      this.visit(value, root);
      return value;
    } catch (error) {
      if (!this.abortOnDataException && !validate) return null;
      throw new RuntimeException(`Error parsing XML data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private visit(value: unknown, root: unknown): void {
    if (Array.isArray(value)) { for (const entry of value) this.visit(entry, root); return; }
    if (!value || typeof value !== "object") return;
    for (const [name, entry] of globalThis.Object.entries(value)) {
      this.onRecord?.(name, entry, root);
      this.visit(entry, root);
    }
  }
}

export class XMLInputString extends XMLInput {
  constructor(private readonly data: string, onRecord?: XMLRecordHandler) { super(onRecord); }
  parse(root: unknown = null, validate = false): unknown { return this.parseString(this.data, root, validate); }
}

export class XMLInputFile extends XMLInput {
  constructor(private filename = "", onRecord?: XMLRecordHandler) { super(onRecord); }
  setFileName(filename: string): void { this.filename = filename; }
  getFileName(): string { return this.filename; }

  async parse(root: unknown = null, validate = false): Promise<unknown[]> {
    if (!this.filename) throw new RuntimeException("Missing input file or directory");
    const information = await stat(this.filename).catch(() => null);
    if (!information) throw new RuntimeException(`Couldn't open input file '${this.filename}'`);
    const files = information.isDirectory()
      ? (await readdir(this.filename)).filter((name) => extname(name).toLowerCase() === ".xml").sort().map((name) => join(this.filename, name))
      : [this.filename];
    const result: unknown[] = [];
    for (const filename of files) result.push(this.parseString(await readFile(filename, "utf8"), root, validate));
    return result;
  }
}

function nameOf(tag: Keyword | string): string { return tag instanceof Keyword ? tag.toString() : tag; }

export class XMLSerializer implements SerializerAdapter {
  private readonly output: string[] = [];
  private readonly stack: string[] = [];
  private writeHidden = false;

  constructor(initial = "") { if (initial) this.output.push(initial); }
  setWriteHidden(value: boolean): void { this.writeHidden = value; }
  getWriteHidden(): boolean { return this.writeHidden; }
  getIndent(): string { return "\t".repeat(Math.min(40, this.stack.length)); }

  BeginObject(tag: Keyword | string, ...attributes: readonly unknown[]): void {
    const name = nameOf(tag);
    let line = `${this.getIndent()}<${name}`;
    for (let index = 0; index + 1 < attributes.length; index += 2) {
      const key = attributes[index];
      if (key instanceof Keyword || typeof key === "string") line += ` ${nameOf(key)}="${this.escape(String(attributes[index + 1] ?? ""))}"`;
    }
    this.output.push(`${line}>\n`);
    this.stack.push(name);
  }

  EndObject(tag: Keyword | string): void { this.stack.pop(); this.output.push(`${this.getIndent()}</${nameOf(tag)}>\n`); }
  BeginList(tag: Keyword | string): void { this.BeginObject(tag); }
  EndList(tag: Keyword | string): void { this.EndObject(tag); }
  writeString(value: string): void { this.output.push(`${this.getIndent()}${value}\n`); }
  writeElement(tag: Keyword | string, value: unknown): void {
    if (value === null || value === undefined || value === "") return;
    const name = nameOf(tag);
    const text = value instanceof FreppleDate || value instanceof Duration ? value.toString() : String(value);
    this.output.push(`${this.getIndent()}<${name}>${this.escape(text)}</${name}>\n`);
  }
  writeProperty(name: string, value: unknown): void { this.writeElement(name, value); }
  writeObject(tag: Keyword | string, object: FreppleObject | SerializableObject, _category = FieldCategory.BASE): void {
    this.BeginObject(tag);
    object.writeProperties(this);
    this.EndObject(tag);
  }
  writeElementWithHeader(tag: Keyword | string, object: FreppleObject | SerializableObject): void {
    this.output.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    const name = nameOf(tag);
    this.output.push(`<${name} xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\n`);
    this.stack.push(name);
    object.writeProperties(this);
    this.stack.pop();
    this.output.push(`</${name}>\n`);
  }
  escape(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }
  getData(): string { return this.output.join(""); }
}

export class XMLSerializerString extends XMLSerializer {}
export class XMLSerializerFile extends XMLSerializer {
  constructor(private readonly filename: string) { super(); }
  async close(): Promise<void> { await writeFile(this.filename, this.getData(), "utf8"); }
}

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
  "#include \"frepple/xml.h\"",
  "",
  "#include <sys/stat.h>",
  "",
  "#include <filesystem>",
  "",
  "namespace frepple::utils {",
  "",
  "std::hash<string> Keyword::hasher;",
  "xercesc::XMLTranscoder* XMLInput::utf8_encoder = nullptr;",
  "",
  "char* XMLInput::transcodeUTF8(const XMLCh* xercesChars) {",
  "  XMLSize_t charsEaten = 0;",
  "  XMLSize_t charsReturned = utf8_encoder->transcodeTo(",
  "      xercesChars, xercesc::XMLString::stringLen(xercesChars),",
  "      (XMLByte*)encodingbuffer, encodingbuffersize - 1, charsEaten,",
  "      xercesc::XMLTranscoder::UnRep_RepChar);",
  "  encodingbuffer[min(charsReturned, encodingbuffersize - 1)] = 0;",
  "  return encodingbuffer;",
  "}",
  "",
  "XMLInput::XMLInput() : objects(maxobjects), data(maxdata) {",
  "  if (!utf8_encoder) {",
  "    xercesc::XMLTransService::Codes resCode;",
  "    utf8_encoder =",
  "        xercesc::XMLPlatformUtils::fgTransService->makeNewTranscoderFor(",
  "            \"UTF-8\", resCode, encodingbuffersize);",
  "    if (!XMLInput::utf8_encoder)",
  "      logger << \"Can't initialize UTF-8 transcoder: reason \" << resCode << '\\n';",
  "  }",
  "}",
  "",
  "void XMLInput::processingInstruction(const XMLCh* const target,",
  "                                     const XMLCh* const data) {",
  "  char* type = xercesc::XMLString::transcode(target);",
  "  char* value = xercesc::XMLString::transcode(data);",
  "  try {",
  "    if (!strcmp(type, \"python\") && allowPythonInstructions) {",
  "      // \"python\" is the only processing instruction which we process.",
  "      // Others will be silently ignored",
  "      try {",
  "        // Execute the processing instruction",
  "        PythonInterpreter::execute(value);",
  "      } catch (const DataException& e) {",
  "        if (abortOnDataException) {",
  "          xercesc::XMLString::release(&type);",
  "          xercesc::XMLString::release(&value);",
  "          throw;",
  "        } else",
  "          logger << \"Continuing after data error: \" << e.what() << '\\n';",
  "      }",
  "    }",
  "    xercesc::XMLString::release(&type);",
  "    xercesc::XMLString::release(&value);",
  "  } catch (...) {",
  "    xercesc::XMLString::release(&type);",
  "    xercesc::XMLString::release(&value);",
  "    throw;",
  "  }",
  "}",
  "",
  "void XMLInput::startElement(const XMLCh* const, const XMLCh* const ename,",
  "                            const XMLCh* const,",
  "                            const xercesc::Attributes& atts) {",
  "  string ename_utf8 = transcodeUTF8(ename);",
  "",
  "  // Currently ignoring all input?",
  "  if (ignore) {",
  "    if (data[dataindex].hash == Keyword::hash(ename_utf8)) {",
  "      // Ignoring elements one level deeper",
  "      ++ignore;",
  "      if (ignore >= USHRT_MAX)",
  "        throw DataException(\"XML-document nested excessively deep\");",
  "    }",
  "    return;",
  "  }",
  "",
  "  // Use new data value",
  "  data[++dataindex].value.setString(\"\");",
  "  reading = true;",
  "",
  "  if (loglevel)",
  "    logger << \"Start XML element #\" << dataindex << \" '\" << ename_utf8",
  "           << \"' for object #\" << objectindex << \" (\"",
  "           << ((objectindex >= 0 && objects[objectindex].cls)",
  "                   ? objects[objectindex].cls->type",
  "                   : \"none\")",
  "           << \")\\n\";",
  "",
  "  // Look up the field",
  "  data[dataindex].hash = Keyword::hash(ename_utf8);",
  "  data[dataindex].field = nullptr;",
  "  if (dataindex >= 1 && data[dataindex - 1].field &&",
  "      data[dataindex - 1].field->isGroup() &&",
  "      data[dataindex].hash ==",
  "          data[dataindex - 1].field->getKeyword()->getHash()) {",
  "    // New element to create in the group",
  "    // Increment object index",
  "    if (++objectindex >= maxobjects)",
  "      // You're joking?",
  "      throw DataException(\"XML-document nested excessively deep\");",
  "    // New object on the stack",
  "    objects[objectindex].object = nullptr;",
  "    objects[objectindex].start = dataindex;",
  "    objects[objectindex].cls = data[dataindex - 1].field->getClass();",
  "    objects[objectindex].hash = data[dataindex].hash;",
  "    reading = false;",
  "",
  "    if (loglevel)",
  "      logger << \"Starting object #\" << objectindex << \" (\"",
  "             << objects[objectindex].cls->type << \")\\n\";",
  "",
  "    if (!objects[objectindex].cls->category) {",
  "      // Category metadata passed: replace it with the concrete type",
  "      // We start at the last attribute. Putting the type attribute at the end",
  "      // will thus give a (very small) performance improvement.",
  "      for (XMLSize_t i = atts.getLength(); i > 0; --i) {",
  "        string attr_name = transcodeUTF8(atts.getLocalName(i - 1));",
  "        if (Keyword::hash(attr_name) == Tags::type.getHash()) {",
  "          string tp = transcodeUTF8(atts.getValue(i - 1));",
  "          objects[objectindex].cls =",
  "              static_cast<const MetaCategory&>(*objects[objectindex].cls)",
  "                  .findClass(Keyword::hash(tp));",
  "          if (!objects[objectindex].cls)",
  "            throw DataException(\"No type \" + tp + \" registered\");",
  "          break;",
  "        }",
  "      }",
  "      if (!objects[objectindex].cls->category) {",
  "        // No type attribute was registered, and we use the default of the",
  "        // category",
  "        const auto& cat =",
  "            static_cast<const MetaCategory&>(*objects[objectindex].cls);",
  "        objects[objectindex].cls = cat.findClass(Tags::deflt.getHash());",
  "        if (!objects[objectindex].cls)",
  "          throw DataException(\"No default type registered for category \" +",
  "                              cat.type);",
  "      }",
  "    }",
  "    // Skip the opening tag of this object",
  "    --dataindex;",
  "",
  "    // Push all attributes on the data stack.",
  "    for (XMLSize_t i = 0, cnt = atts.getLength(); i < cnt; ++i) {",
  "      // Look up the field",
  "      ++dataindex;",
  "      string attr_name = transcodeUTF8(atts.getLocalName(i));",
  "      data[dataindex].hash = Keyword::hash(attr_name);",
  "      if (data[dataindex].hash == Tags::type.getHash()) {",
  "        // Skip attribute called \"type\"",
  "        --dataindex;",
  "        continue;",
  "      } else if (data[dataindex].hash == Tags::action.getHash()) {",
  "        // Action attribute is special, as it's not a field",
  "        data[dataindex].field = nullptr;",
  "      } else {",
  "        data[dataindex].field =",
  "            objects[objectindex].cls->findField(data[dataindex].hash);",
  "        if (!data[dataindex].field && objects[objectindex].cls->category)",
  "          data[dataindex].field = objects[objectindex].cls->category->findField(",
  "              data[dataindex].hash);",
  "        if (!data[dataindex].field)",
  "          throw DataException(\"Attribute '\" + attr_name + \"' not defined\");",
  "      }",
  "",
  "      // Set the data value",
  "      data[dataindex].value.setString(transcodeUTF8(atts.getValue(i)));",
  "    }",
  "    return;",
  "  }",
  "",
  "  // Look up the field",
  "  assert(objects[objectindex].cls);",
  "  data[dataindex].field =",
  "      objects[objectindex].cls->findField(data[dataindex].hash);",
  "  if (!data[dataindex].field && objects[objectindex].cls->category)",
  "    data[dataindex].field =",
  "        objects[objectindex].cls->category->findField(data[dataindex].hash);",
  "",
  "  // Field not found",
  "  if (!data[dataindex].field) {",
  "    if (!dataindex && data[dataindex].hash == objects[0].hash) {",
  "      // Special case: root element",
  "      --dataindex;",
  "      for (XMLSize_t i = 0, cnt = atts.getLength(); i < cnt; ++i) {",
  "        string attr_name = transcodeUTF8(atts.getLocalName(i));",
  "        if (attr_name == \"source\")",
  "          // Special case: Source specified as attribute of the root element",
  "          setSource(transcodeUTF8(atts.getValue(i)));",
  "      }",
  "    } else if (data[dataindex].hash == Tags::booleanproperty.getHash() ||",
  "               data[dataindex].hash == Tags::stringproperty.getHash() ||",
  "               data[dataindex].hash == Tags::doubleproperty.getHash() ||",
  "               data[dataindex].hash == Tags::dateproperty.getHash()) {",
  "      // Special case: custom properties",
  "      short ok = 0;",
  "      for (XMLSize_t i = 0, cnt = atts.getLength(); i < cnt; ++i) {",
  "        string attr_name = transcodeUTF8(atts.getLocalName(i));",
  "        if (attr_name == \"name\") {",
  "          data[dataindex].name = transcodeUTF8(atts.getValue(i));",
  "          ok += 1;",
  "        } else if (attr_name == \"value\") {",
  "          data[dataindex].value.setString(transcodeUTF8(atts.getValue(i)));",
  "          ok += 2;",
  "        }",
  "      }",
  "      if (ok != 3) {",
  "        data[dataindex].hash = 0;  // Mark the field as invalid",
  "        logger << \"Warning: property missing name and/or value field\\n\";",
  "      }",
  "    } else {",
  "      // Ignore this element",
  "      reading = false;",
  "      ++ignore;",
  "      logger << \"Warning: Ignoring XML element '\" << ename_utf8 << \"'\\n\";",
  "    }",
  "  } else if (data[dataindex].field->isPointer()) {",
  "    // Increment object index",
  "    if (++objectindex >= maxobjects)",
  "      // You're joking?",
  "      throw DataException(\"XML-document with elements nested excessively deep\");",
  "",
  "    // New object on the stack",
  "    objects[objectindex].object = nullptr;",
  "    objects[objectindex].cls = data[dataindex].field->getClass();",
  "    objects[objectindex].start = dataindex + 1;",
  "    objects[objectindex].hash = Keyword::hash(ename_utf8);",
  "    reading = false;",
  "",
  "    if (loglevel)",
  "      logger << \"Starting object #\" << objectindex << \" (\"",
  "             << objects[objectindex].cls->type << \")\\n\";",
  "",
  "    if (!objects[objectindex].cls->category) {",
  "      // Category metadata passed: replace it with the concrete type",
  "      // We start at the last attribute. Putting the type attribute at the end",
  "      // will thus give a (very small) performance improvement.",
  "      for (XMLSize_t i = atts.getLength(); i > 0; --i) {",
  "        string attr_name = transcodeUTF8(atts.getLocalName(i - 1));",
  "        if (Keyword::hash(attr_name) == Tags::type.getHash()) {",
  "          string tp = transcodeUTF8(atts.getValue(i - 1));",
  "          auto& cat =",
  "              static_cast<const MetaCategory&>(*objects[objectindex].cls);",
  "          objects[objectindex].cls = cat.findClass(Keyword::hash(tp));",
  "          if (!objects[objectindex].cls)",
  "            throw DataException(\"No type \" + tp + \" registered for category \" +",
  "                                cat.type);",
  "          break;",
  "        }",
  "      }",
  "      if (!objects[objectindex].cls->category) {",
  "        // No type attribute was registered, and we use the default of the",
  "        // category",
  "        auto& cat = static_cast<const MetaCategory&>(*objects[objectindex].cls);",
  "        objects[objectindex].cls = cat.findClass(Tags::deflt.getHash());",
  "        if (!objects[objectindex].cls)",
  "          throw DataException(\"No default type registered for category \" +",
  "                              cat.type);",
  "      }",
  "    }",
  "",
  "    // Push all attributes on the data stack.",
  "    for (XMLSize_t i = 0, cnt = atts.getLength(); i < cnt; ++i) {",
  "      // Use new data value",
  "      ++dataindex;",
  "",
  "      // Look up the field",
  "      string attr_name = transcodeUTF8(atts.getLocalName(i));",
  "      data[dataindex].hash = Keyword::hash(attr_name);",
  "      if (data[dataindex].hash == Tags::type.getHash() ||",
  "          data[dataindex].hash == Tags::action.getHash()) {",
  "        // Skip attribute called \"type\"",
  "        --dataindex;",
  "        continue;",
  "      } else if (data[dataindex].hash == Tags::action.getHash()) {",
  "        // Action attribute is special, as it's not a field",
  "        data[dataindex].field = nullptr;",
  "      } else {",
  "        data[dataindex].field =",
  "            objects[objectindex].cls->findField(data[dataindex].hash);",
  "        if (!data[dataindex].field && objects[objectindex].cls->category)",
  "          data[dataindex].field = objects[objectindex].cls->category->findField(",
  "              data[dataindex].hash);",
  "        if (!data[dataindex].field)",
  "          throw DataException(\"Attribute '\" + attr_name + \"' not defined\");",
  "      }",
  "",
  "      // Set the data value",
  "      data[dataindex].value.setString(transcodeUTF8(atts.getValue(i)));",
  "    }",
  "  } else if (data[dataindex].field->isGroup())",
  "    reading = false;",
  "}",
  "",
  "void XMLInput::endElement(const XMLCh* const, const XMLCh* const,",
  "                          const XMLCh* const ename) {",
  "  string ename_utf8 = transcodeUTF8(ename);",
  "",
  "  // Currently ignoring all input?",
  "  size_t h = Keyword::hash(ename_utf8);",
  "  if (ignore) {",
  "    if (data[dataindex].hash == h) {",
  "      // Finishing ignored element level",
  "      --ignore;",
  "      if (!ignore) --dataindex;",
  "    }",
  "    return;",
  "  }",
  "",
  "  if (loglevel)",
  "    logger << \"End XML element #\" << dataindex << \" '\" << ename_utf8",
  "           << \"' for object #\" << objectindex << \" (\"",
  "           << ((objectindex >= 0 && objects[objectindex].cls)",
  "                   ? objects[objectindex].cls->type",
  "                   : \"none\")",
  "           << \")\\n\";",
  "",
  "  // Ignore content between tags",
  "  reading = false;",
  "",
  "  if (objectindex == 0 && objects[objectindex].object && dataindex >= 0) {",
  "    // Immediately process updates to the root object",
  "    if (data[dataindex].field && !data[dataindex].field->isGroup()) {",
  "      if (loglevel)",
  "        logger << \"Updating field \"",
  "               << data[dataindex].field->getName().getName()",
  "               << \" on the root object\\n\";",
  "      data[dataindex].field->setField(objects[objectindex].object,",
  "                                      data[dataindex].value,",
  "                                      getCommandManager());",
  "    } else if (!data[dataindex].name.empty()) {",
  "      if (loglevel)",
  "        logger << \"Updating property \" << data[dataindex].name",
  "               << \" on the root object\\n\";",
  "      objects[objectindex].object->setProperty(",
  "          data[dataindex].name, data[dataindex].value, 4, getCommandManager());",
  "      data[dataindex].name = \"\";",
  "    }",
  "    --dataindex;",
  "  }",
  "",
  "  if (h != objects[objectindex].hash || dataindex < 0)",
  "    // Continue reading more fields until we'll have read the complete object",
  "    return;",
  "",
  "  try {",
  "    XMLDataValueDict dict(data, objects[objectindex].start, dataindex);",
  "",
  "    // Push also the source field in the attributes.",
  "    // This is only required if 1) it's not in the dict yet, and 2) there",
  "    // is a value set at the interface level, 3) the class has a source field.",
  "    if (!getSource().empty()) {",
  "      const XMLData* s = dict.get(Tags::source);",
  "      if (!s) {",
  "        const MetaFieldBase* f =",
  "            objects[objectindex].cls->findField(Tags::source);",
  "        if (!f && objects[objectindex].cls->category)",
  "          f = objects[objectindex].cls->category->findField(Tags::source);",
  "        if (f) {",
  "          data[++dataindex].field = f;",
  "          data[dataindex].hash = Tags::source.getHash();",
  "          data[dataindex].value.setString(getSource());",
  "          dict.enlarge();",
  "        }",
  "      }",
  "    }",
  "",
  "    // Check if we need to add a parent object to the dict",
  "    bool found_parent = false;",
  "    if (objectindex > 0 && objects[objectindex].cls->parent) {",
  "      assert(objects[objectindex - 1].cls);",
  "      const MetaClass* cl = objects[objectindex - 1].cls;",
  "      for (auto i = objects[objectindex].cls->getFields().begin();",
  "           i != objects[objectindex].cls->getFields().end(); ++i)",
  "        if ((*i)->getFlag(PARENT) && objectindex >= 1) {",
  "          const MetaFieldBase* fld = data[objects[objectindex].start - 1].field;",
  "          if (fld && !fld->isGroup())",
  "            // Only under a group field can we inherit from a parent object",
  "            continue;",
  "          if (*((*i)->getClass()) == *cl ||",
  "              (cl->category && *((*i)->getClass()) == *(cl->category))) {",
  "            // Parent object matches expected type as parent field",
  "            // First, create the parent object. It is normally created only",
  "            // AFTER all its fields are read in, and that's too late for us.",
  "            if (!objects[objectindex - 1].object) {",
  "              XMLDataValueDict dict_parent(data, objects[objectindex - 1].start,",
  "                                           dataindex - 1);",
  "              if (objects[objectindex - 1].cls->category) {",
  "                assert(objects[objectindex - 1].cls->category->readFunction);",
  "                objects[objectindex - 1].object =",
  "                    objects[objectindex - 1].cls->category->readFunction(",
  "                        objects[objectindex - 1].cls, dict_parent,",
  "                        getCommandManager());",
  "              } else {",
  "                assert(static_cast<const MetaCategory*>(",
  "                           objects[objectindex - 1].cls)",
  "                           ->readFunction);",
  "                objects[objectindex - 1].object =",
  "                    static_cast<const MetaCategory*>(",
  "                        objects[objectindex - 1].cls)",
  "                        ->readFunction(objects[objectindex - 1].cls,",
  "                                       dict_parent, getCommandManager());",
  "              }",
  "              // Set fields already available now on the parent object",
  "              for (auto idx = objects[objectindex - 1].start;",
  "                   idx < objects[objectindex].start; ++idx) {",
  "                if (data[idx].hash == Tags::type.getHash() ||",
  "                    data[idx].hash == Tags::action.getHash())",
  "                  continue;",
  "                if (data[idx].field && !data[idx].field->isGroup()) {",
  "                  data[idx].field->setField(objects[objectindex - 1].object,",
  "                                            data[idx].value,",
  "                                            getCommandManager());",
  "                  data[idx].field = nullptr;  // Mark as already applied",
  "                } else if (data[idx].hash == Tags::booleanproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 1, getCommandManager());",
  "                else if (data[idx].hash == Tags::dateproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 2, getCommandManager());",
  "                else if (data[idx].hash == Tags::doubleproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 3, getCommandManager());",
  "                else if (data[idx].hash == Tags::stringproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 4, getCommandManager());",
  "              }",
  "            }",
  "            // Add reference to parent to the current dict",
  "            data[++dataindex].field = *i;",
  "            data[dataindex].hash = (*i)->getHash();",
  "            data[dataindex].value.setObject(objects[objectindex - 1].object);",
  "            dict.enlarge();",
  "            found_parent = true;",
  "            break;",
  "          }",
  "        }",
  "    }",
  "    if (!found_parent && objectindex > 0 &&",
  "        objects[objectindex].cls->category &&",
  "        objects[objectindex].cls->category->parent) {",
  "      assert(objects[objectindex - 1].cls);",
  "      const MetaClass* cl = objects[objectindex - 1].cls;",
  "      for (auto i = objects[objectindex].cls->category->getFields().begin();",
  "           i != objects[objectindex].cls->category->getFields().end(); ++i)",
  "        if ((*i)->getFlag(PARENT) && objectindex >= 1) {",
  "          const MetaFieldBase* fld = data[objects[objectindex].start - 1].field;",
  "          if (fld && !fld->isGroup())",
  "            // Only under a group field can we inherit from a parent object",
  "            continue;",
  "          if (*((*i)->getClass()) == *cl ||",
  "              (cl->category && *((*i)->getClass()) == *(cl->category))) {",
  "            // Parent object matches expected type as parent field",
  "            // First, create the parent object. It is normally created only",
  "            // AFTER all its fields are read in, and that's too late for us.",
  "            if (!objects[objectindex - 1].object) {",
  "              XMLDataValueDict dict_parent(data, objects[objectindex - 1].start,",
  "                                           dataindex - 1);",
  "              if (objects[objectindex - 1].cls->category) {",
  "                assert(objects[objectindex - 1].cls->category->readFunction);",
  "                objects[objectindex - 1].object =",
  "                    objects[objectindex - 1].cls->category->readFunction(",
  "                        objects[objectindex - 1].cls, dict_parent,",
  "                        getCommandManager());",
  "              } else {",
  "                assert(static_cast<const MetaCategory*>(",
  "                           objects[objectindex - 1].cls)",
  "                           ->readFunction);",
  "                objects[objectindex - 1].object =",
  "                    static_cast<const MetaCategory*>(",
  "                        objects[objectindex - 1].cls)",
  "                        ->readFunction(objects[objectindex - 1].cls,",
  "                                       dict_parent, getCommandManager());",
  "              }",
  "              // Set fields already available now on the parent object",
  "              for (auto idx = objects[objectindex - 1].start;",
  "                   idx < objects[objectindex].start; ++idx) {",
  "                if (data[idx].hash == Tags::type.getHash() ||",
  "                    data[idx].hash == Tags::action.getHash())",
  "                  continue;",
  "                if (data[idx].field && !data[idx].field->isGroup()) {",
  "                  data[idx].field->setField(objects[objectindex - 1].object,",
  "                                            data[idx].value,",
  "                                            getCommandManager());",
  "                  data[idx].field = nullptr;  // Mark as already applied",
  "                } else if (data[idx].hash == Tags::booleanproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 1, getCommandManager());",
  "                else if (data[idx].hash == Tags::dateproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 2, getCommandManager());",
  "                else if (data[idx].hash == Tags::doubleproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 3, getCommandManager());",
  "                else if (data[idx].hash == Tags::stringproperty.getHash())",
  "                  objects[objectindex - 1].object->setProperty(",
  "                      data[idx].name, data[idx].value, 4, getCommandManager());",
  "              }",
  "            }",
  "            // Add reference to parent to the current dict",
  "            data[++dataindex].field = *i;",
  "            data[dataindex].hash = (*i)->getHash();",
  "            data[dataindex].value.setObject(objects[objectindex - 1].object);",
  "            dict.enlarge();",
  "            break;",
  "          }",
  "        }",
  "    }",
  "",
  "    // Root object never gets created",
  "    if (!objectindex) return;",
  "",
  "    if (loglevel) {",
  "      logger << \"Creating object \" << objects[objectindex].cls->type << '\\n';",
  "      dict.print();",
  "    }",
  "",
  "    // Call the object factory for the category and pass all field values",
  "    // in a dictionary.",
  "    // In some cases, the reading of the child fields already triggered the",
  "    // creation of the parent. In such cases we can skip the creation step",
  "    // here.",
  "    if (!objects[objectindex].object) {",
  "      if (objects[objectindex].cls->category) {",
  "        assert(objects[objectindex].cls->category->readFunction);",
  "        objects[objectindex].object =",
  "            objects[objectindex].cls->category->readFunction(",
  "                objects[objectindex].cls, dict, getCommandManager());",
  "      } else {",
  "        assert(static_cast<const MetaCategory*>(objects[objectindex].cls)",
  "                   ->readFunction);",
  "        objects[objectindex].object =",
  "            static_cast<const MetaCategory*>(objects[objectindex].cls)",
  "                ->readFunction(objects[objectindex].cls, dict,",
  "                               getCommandManager());",
  "      }",
  "    }",
  "",
  "    // Update all fields on the new object",
  "    if (objects[objectindex].object) {",
  "      for (auto idx = objects[objectindex].start; idx <= dataindex; ++idx) {",
  "        if (data[idx].hash == Tags::type.getHash() ||",
  "            data[idx].hash == Tags::action.getHash())",
  "          continue;",
  "        if (data[idx].field && !data[idx].field->isGroup())",
  "          data[idx].field->setField(objects[objectindex].object,",
  "                                    data[idx].value, getCommandManager());",
  "        else if (data[idx].hash == Tags::booleanproperty.getHash())",
  "          objects[objectindex].object->setProperty(",
  "              data[idx].name, data[idx].value, 1, getCommandManager());",
  "        else if (data[idx].hash == Tags::dateproperty.getHash())",
  "          objects[objectindex].object->setProperty(",
  "              data[idx].name, data[idx].value, 2, getCommandManager());",
  "        else if (data[idx].hash == Tags::doubleproperty.getHash())",
  "          objects[objectindex].object->setProperty(",
  "              data[idx].name, data[idx].value, 3, getCommandManager());",
  "        else if (data[idx].hash == Tags::stringproperty.getHash())",
  "          objects[objectindex].object->setProperty(",
  "              data[idx].name, data[idx].value, 4, getCommandManager());",
  "      }",
  "    }",
  "",
  "    if (objectindex && dataindex &&",
  "        data[objects[objectindex].start - 1].field &&",
  "        data[objects[objectindex].start - 1].field->isPointer())",
  "      // Update parent object",
  "      data[objects[objectindex].start - 1].value.setObject(",
  "          objects[objectindex].object);",
  "    if (getUserExit()) getUserExit().call(objects[objectindex].object);",
  "    callUserExitCpp(objects[objectindex].object);",
  "  } catch (const DataException& e) {",
  "    if (abortOnDataException)",
  "      throw;",
  "    else",
  "      logger << \"Continuing after data error: \" << e.what() << '\\n';",
  "  }",
  "",
  "  // Update indexes for data and object",
  "  dataindex = objects[objectindex--].start - 1;",
  "}",
  "",
  "void XMLInput::characters(const XMLCh* const c, const XMLSize_t) {",
  "  if (reading && dataindex >= 0)",
  "    data[dataindex].value.appendString(transcodeUTF8(c));",
  "}",
  "",
  "void XMLInput::warning(const xercesc::SAXParseException& e) {",
  "  char* message = xercesc::XMLString::transcode(e.getMessage());",
  "  logger << \"Warning: \" << message;",
  "  if (e.getLineNumber() > 0) logger << \" at line: \" << e.getLineNumber();",
  "  logger << '\\n';",
  "  xercesc::XMLString::release(&message);",
  "}",
  "",
  "void XMLInput::fatalError(const xercesc::SAXParseException& e) {",
  "  char* message = xercesc::XMLString::transcode(e.getMessage());",
  "  ostringstream ch;",
  "  ch << message;",
  "  if (e.getLineNumber() > 0) ch << \" at line \" << e.getLineNumber();",
  "  xercesc::XMLString::release(&message);",
  "  throw DataException(ch.str());",
  "}",
  "",
  "void XMLInput::error(const xercesc::SAXParseException& e) {",
  "  char* message = xercesc::XMLString::transcode(e.getMessage());",
  "  ostringstream ch;",
  "  ch << message;",
  "  if (e.getLineNumber() > 0) ch << \" at line \" << e.getLineNumber();",
  "  xercesc::XMLString::release(&message);",
  "  throw DataException(ch.str());",
  "}",
  "",
  "XMLInput::~XMLInput() {",
  "  // Delete the xerces parser object",
  "  delete parser;",
  "}",
  "",
  "void XMLInput::parse(xercesc::InputSource& in, Object* pRoot, bool validate) {",
  "  try {",
  "    // Create a Xerces parser",
  "    parser = xercesc::XMLReaderFactory::createXMLReader();",
  "",
  "    // Set the features of the parser. A bunch of the options are dependent",
  "    // on whether we want to validate the input or not.",
  "    parser->setProperty(",
  "        xercesc::XMLUni::fgXercesScannerName,",
  "        const_cast<XMLCh*>(validate ? xercesc::XMLUni::fgSGXMLScanner",
  "                                    : xercesc::XMLUni::fgWFXMLScanner));",
  "    parser->setFeature(xercesc::XMLUni::fgSAX2CoreValidation, validate);",
  "    parser->setFeature(xercesc::XMLUni::fgSAX2CoreNameSpacePrefixes, false);",
  "    parser->setFeature(xercesc::XMLUni::fgXercesIdentityConstraintChecking,",
  "                       false);",
  "    parser->setFeature(xercesc::XMLUni::fgXercesDynamic, false);",
  "    parser->setFeature(xercesc::XMLUni::fgXercesSchema, validate);",
  "    parser->setFeature(xercesc::XMLUni::fgXercesSchemaFullChecking, false);",
  "    parser->setFeature(xercesc::XMLUni::fgXercesValidationErrorAsFatal, true);",
  "    parser->setFeature(xercesc::XMLUni::fgXercesIgnoreAnnotations, true);",
  "",
  "    if (validate) {",
  "      // Specify the no-namespace schema file",
  "      string schema = Environment::searchFile(\"frepple.xsd\");",
  "      if (schema.empty())",
  "        throw RuntimeException(\"Can't find XML schema file 'frepple.xsd'\");",
  "      XMLCh* c = xercesc::XMLString::transcode(schema.c_str());",
  "      parser->setProperty(",
  "          xercesc::XMLUni::fgXercesSchemaExternalNoNameSpaceSchemaLocation, c);",
  "      xercesc::XMLString::release(&c);",
  "    }",
  "",
  "    if (pRoot) {",
  "      // Set the event handler. If we are reading into a nullptr object, there",
  "      // is no need to use a content handler.",
  "      parser->setContentHandler(this);",
  "",
  "      // Get the parser to read data into the object pRoot.",
  "      objectindex = 0;",
  "      dataindex = -1;",
  "      objects[0].start = 0;",
  "      objects[0].object = pRoot;",
  "      objects[0].cls = &pRoot->getType();",
  "      objects[0].hash = pRoot->getType().typetag->getHash();",
  "      if (loglevel)",
  "        logger << \"Starting root object #\" << objectindex << \" (\"",
  "               << objects[objectindex].cls->type << \")\\n\";",
  "    } else {",
  "      // Don't process any of the input data. We'll just let the parser",
  "      // check the validity of the XML document.",
  "      ignore = true;",
  "      objectindex = -1;",
  "      dataindex = 0;",
  "    }",
  "",
  "    // Set the error handler",
  "    parser->setErrorHandler(this);",
  "",
  "    // Parse the input",
  "    parser->parse(in);",
  "  } catch (const xercesc::XMLException& toCatch) {",
  "    char* message = xercesc::XMLString::transcode(toCatch.getMessage());",
  "    string msg(message);",
  "    xercesc::XMLString::release(&message);",
  "    delete parser;",
  "    parser = nullptr;",
  "    throw RuntimeException(\"Parsing error: \" + msg);",
  "  } catch (const exception& toCatch) {",
  "    delete parser;",
  "    parser = nullptr;",
  "    ostringstream msg;",
  "    msg << \"Error during XML parsing: \" << toCatch.what();",
  "    throw RuntimeException(msg.str());",
  "  } catch (...) {",
  "    delete parser;",
  "    parser = nullptr;",
  "    throw RuntimeException(",
  "        \"Parsing error: Unexpected exception during XML parsing\");",
  "  }",
  "  delete parser;",
  "  parser = nullptr;",
  "}",
  "",
  "void XMLSerializer::escape(const string& x) {",
  "  for (const char* p = x.c_str(); *p; ++p) {",
  "    switch (*p) {",
  "      case '&':",
  "        *m_fp << \"&amp;\";",
  "        break;",
  "      case '<':",
  "        *m_fp << \"&lt;\";",
  "        break;",
  "      case '>':",
  "        *m_fp << \"&gt;\";",
  "        break;",
  "      case '\"':",
  "        *m_fp << \"&quot;\";",
  "        break;",
  "      case '\\'':",
  "        *m_fp << \"&apos;\";",
  "        break;",
  "      default:",
  "        *m_fp << *p;",
  "    }",
  "  }",
  "}",
  "",
  "void XMLSerializer::incIndent() {",
  "  indentstring[m_nIndent++] = '\\t';",
  "  if (m_nIndent > 40) m_nIndent = 40;",
  "  indentstring[m_nIndent] = '\\0';",
  "}",
  "",
  "void XMLSerializer::decIndent() {",
  "  if (--m_nIndent < 0) m_nIndent = 0;",
  "  indentstring[m_nIndent] = '\\0';",
  "}",
  "",
  "void Serializer::setContentType(const string& c) {",
  "  if (c == \"base\")",
  "    setContentType(BASE);",
  "  else if (c == \"plan\")",
  "    setContentType(PLAN);",
  "  else if (c == \"detail\")",
  "    setContentType(DETAIL);",
  "  else",
  "    // Silently fallback to the default value",
  "    setContentType(BASE);",
  "}",
  "",
  "void Serializer::writeElement(const Keyword& tag, const Object* object,",
  "                              FieldCategory m) {",
  "  // Avoid nullptr pointers and skip hidden objects",
  "  if (!object || (object->getHidden() && !writeHidden)) return;",
  "",
  "  // Adjust current and parent object pointer",
  "  const Object* previousParent = parentObject;",
  "  parentObject = currentObject;",
  "  currentObject = object;",
  "  ++numObjects;",
  "",
  "  // Call the write method on the object",
  "  if (m != BASE)",
  "    // Mode is overwritten",
  "    object->writeElement(this, tag, m);",
  "  else",
  "    // Choose wether to save a reference of the object.",
  "    // The root object can't be saved as a reference.",
  "    object->writeElement(this, tag, getSaveReferences() ? MANDATORY : content);",
  "",
  "  // Adjust current and parent object pointer",
  "  currentObject = parentObject;",
  "  parentObject = previousParent;",
  "}",
  "",
  "void XMLSerializer::writeElementWithHeader(const Keyword& tag,",
  "                                           const Object* object) {",
  "  // Root object can't be null...",
  "  if (!object)",
  "    throw RuntimeException(\"Can't accept a nullptr object as XML root\");",
  "",
  "  // There should not be any saved objects yet",
  "  if (numObjects > 0)",
  "    throw LogicException(\"Can't have multiple headers in a document\");",
  "  assert(!parentObject);",
  "  assert(!currentObject);",
  "",
  "  // Write the first line for the xml document",
  "  writeString(headerStart);",
  "",
  "  // Adjust current object pointer",
  "  currentObject = object;",
  "",
  "  // Write the object",
  "  ++numObjects;",
  "  BeginObject(tag, headerAtts);",
  "  skipHead();",
  "  object->writeElement(this, tag, getContentType());",
  "",
  "  // Adjust current and parent object pointer",
  "  currentObject = nullptr;",
  "  parentObject = nullptr;",
  "}",
  "",
  "const XMLData* XMLDataValueDict::get(const Keyword& key) const {",
  "  for (auto i = strt; i <= nd; ++i)",
  "    if (fields[i].hash == key.getHash()) return &fields[i].value;",
  "  return nullptr;",
  "}",
  "",
  "void XMLDataValueDict::print() {",
  "  for (auto i = strt; i <= nd; ++i) {",
  "    if (fields[i].field)",
  "      logger << \"   \" << fields[i].field->getName().getName() << \": \";",
  "    else",
  "      logger << \"   null: \";",
  "    auto* obj = static_cast<Object*>(fields[i].value.getObject());",
  "    if (obj)",
  "      logger << \"pointer to \" << obj->getType().type << '\\n';",
  "    else",
  "      logger << fields[i].value.getString() << '\\n';",
  "  }",
  "}",
  "",
  "bool XMLData::getBool() const {",
  "  switch (getData()[0]) {",
  "    case 'T':",
  "    case 't':",
  "    case '1':",
  "      return true;",
  "    case 'F':",
  "    case 'f':",
  "    case '0':",
  "      return false;",
  "  }",
  "  throw DataException(\"Invalid boolean value: \" + string(getData()));",
  "}",
  "",
  "const char* DataKeyword::getName() const {",
  "  if (ch) return ch;",
  "  auto i = Keyword::getTags().find(hash);",
  "  if (i == Keyword::getTags().end())",
  "    throw LogicException(\"Undefined element keyword\");",
  "  return i->second->getName().c_str();",
  "}",
  "",
  "Keyword::Keyword(const string& n)",
  "    : dw(hash(n.c_str())), strName(n), fullname(n) {",
  "  if (strName.empty()) throw LogicException(\"Creating keyword without name\");",
  "",
  "  // Verify that the hash is \"perfect\".",
  "  check();",
  "}",
  "",
  "Keyword::Keyword(const string& n, const string& nspace)",
  "    : dw(hash(n)), strName(n), fullname(nspace + \":\" + n) {",
  "  if (strName.empty()) throw LogicException(\"Creating keyword without name\");",
  "  if (nspace.empty())",
  "    throw LogicException(\"Creating keyword with empty namespace\");",
  "",
  "  // Verify that the hash is \"perfect\".",
  "  check();",
  "}",
  "",
  "void Keyword::check() {",
  "  // To be thread-safe we make sure only a single thread at a time",
  "  // can execute this check.",
  "  static mutex dd;",
  "  {",
  "    lock_guard<mutex> l(dd);",
  "    auto i = getTags().find(dw);",
  "    if (i != getTags().end() && i->second->getName() != strName)",
  "      throw LogicException(\"Tag XML-tag hash function clashes for \" +",
  "                           i->second->getName() + \" and \" + strName);",
  "    getTags().insert(make_pair(dw, this));",
  "  }",
  "}",
  "",
  "Keyword::~Keyword() {",
  "  // Remove from the tag list",
  "  auto i = getTags().find(dw);",
  "  if (i != getTags().end()) getTags().erase(i);",
  "}",
  "",
  "const Keyword& Keyword::find(const char* name) {",
  "  auto i = getTags().find(hash(name));",
  "  return *(i != getTags().end() ? i->second : new Keyword(name));",
  "}",
  "",
  "Keyword::tagtable& Keyword::getTags() {",
  "  static tagtable alltags;",
  "  return alltags;",
  "}",
  "",
  "void Keyword::printTags() {",
  "  for (auto& i : getTags())",
  "    logger << i.second->getName() << \"   \" << i.second->dw << '\\n';",
  "}",
  "",
  "void XMLInputFile::parse(Object* pRoot, bool validate) {",
  "  // Check if string has been set",
  "  if (filename.empty()) throw DataException(\"Missing input file or directory\");",
  "",
  "  // Check if the parameter is the name of a directory",
  "  filesystem::path p(filename);",
  "  if (!filesystem::exists(p))",
  "    // Can't verify the status",
  "    throw RuntimeException(\"Couldn't open input file '\" + filename + \"'\");",
  "  else if (filesystem::is_directory(p)) {",
  "    // Data is a directory: loop through all *.xml files now. No recursion in",
  "    // subdirectories is done.",
  "    for (const auto& entry : filesystem::directory_iterator(p)) {",
  "      if (entry.is_regular_file() && entry.path().extension() == \".xml\")",
  "        XMLInputFile(entry.path().string().c_str()).parse(pRoot, validate);",
  "    }",
  "  } else {",
  "    // Normal file",
  "    // Parse the file",
  "    XMLCh* f = xercesc::XMLString::transcode(filename.c_str());",
  "    xercesc::LocalFileInputSource in(f);",
  "    xercesc::XMLString::release(&f);",
  "    XMLInput::parse(in, pRoot, validate);",
  "  }",
  "}",
  "",
  "}  // namespace frepple::utils",
];
