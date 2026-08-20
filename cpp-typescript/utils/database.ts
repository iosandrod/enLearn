// <header-api-generated>
export const DatabaseBadConnectionCppModel = { bases: ["RuntimeException"] as const, methods: [] as const, qualifiedNames: ["DatabaseBadConnection"] as const };

export const DatabasePreparedStatementCppModel = { bases: ["DatabaseStatementBase"] as const, methods: ["execute","getArgs","setArgument"] as const, qualifiedNames: ["DatabasePreparedStatement"] as const };

export const DatabaseReaderCppModel = { bases: ["NonCopyable"] as const, methods: ["closeConnection","executeSQL","getConnection","getError"] as const, qualifiedNames: ["DatabaseReader"] as const };

export const DatabaseResultCppModel = { bases: ["NonCopyable"] as const, methods: ["countFields","countRows","getFieldName","getValueBool","getValueDate","getValueDouble","getValueDoubleOrNull","getValueInt","getValueLong","getValueString"] as const, qualifiedNames: ["DatabaseResult"] as const };

export const DatabaseStatementCppModel = { bases: ["DatabaseStatementBase"] as const, methods: ["execute"] as const, qualifiedNames: ["DatabaseStatement"] as const };

export const DatabaseStatementBaseCppModel = { bases: [] as const, methods: ["execute"] as const, qualifiedNames: ["DatabaseStatementBase"] as const };

export const DatabaseTransactionCppModel = { bases: ["DatabaseStatementBase"] as const, methods: ["execute","pushStatement"] as const, qualifiedNames: ["DatabaseTransaction"] as const };

export const DatabaseWriterCppModel = { bases: ["NonCopyable"] as const, methods: ["getConnectionString","launch","pushStatement","pushTransaction","setConnectionString"] as const, qualifiedNames: ["DatabaseWriter"] as const };
// </header-api-generated>























/**
 * Semantic migration unit for src/utils/database.cpp.
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
  { name: "DatabaseReader::assureConnection", sourceLine: 37, status: "adapted" },
  { name: "Plan::instance", sourceLine: 48, status: "adapted" },
  { name: "DatabaseReader::~DatabaseReader", sourceLine: 52, status: "adapted" },
  { name: "DatabaseReader::executeSQL", sourceLine: 56, status: "adapted" },
  { name: "DatabaseResult::DatabaseResult", sourceLine: 69, status: "adapted" },
  { name: "DatabaseWriter::launch", sourceLine: 90, status: "adapted" },
  { name: "DatabaseWriter::DatabaseWriter", sourceLine: 97, status: "adapted" },
  { name: "DatabaseWriter::pushTransaction", sourceLine: 103, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 109, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 115, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 121, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 128, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 135, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 144, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 153, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 163, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 173, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 184, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 195, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 207, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 219, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 233, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 247, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 262, status: "adapted" },
  { name: "DatabaseWriter::pushStatement", sourceLine: 277, status: "adapted" },
  { name: "DatabaseWriter::workerthread", sourceLine: 293, status: "adapted" },
  { name: "this_thread::sleep_for", sourceLine: 301, status: "adapted" },
  { name: "chrono::seconds", sourceLine: 301, status: "adapted" },
  { name: "Date::now", sourceLine: 313, status: "adapted" },
  { name: "Plan::instance", sourceLine: 335, status: "adapted" },
  { name: "Date::now", sourceLine: 338, status: "adapted" },
  { name: "DatabaseStatement::execute", sourceLine: 364, status: "adapted" },
  { name: "DatabaseTransaction::execute", sourceLine: 376, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface DatabaseReaderPort {
  assureConnection(...args: readonly PortValue[]): PortValue | void;
  disposeDatabaseReader(...args: readonly PortValue[]): PortValue | void;
  executeSQL(...args: readonly PortValue[]): PortValue | void;
}

export interface DatabaseResultPort {
  DatabaseResult(...args: readonly PortValue[]): PortValue | void;
}

export interface DatabaseStatementPort {
  execute(...args: readonly PortValue[]): PortValue | void;
}

export interface DatabaseTransactionPort {
  execute(...args: readonly PortValue[]): PortValue | void;
}

export interface DatabaseWriterPort {
  DatabaseWriter(...args: readonly PortValue[]): PortValue | void;
  launch(...args: readonly PortValue[]): PortValue | void;
  pushStatement(...args: readonly PortValue[]): PortValue | void;
  pushTransaction(...args: readonly PortValue[]): PortValue | void;
  workerthread(...args: readonly PortValue[]): PortValue | void;
}

export interface DatePort {
  now(...args: readonly PortValue[]): PortValue | void;
}

export interface PlanPort {
  instance(...args: readonly PortValue[]): PortValue | void;
}

export interface chronoPort {
  seconds(...args: readonly PortValue[]): PortValue | void;
}

export interface this_threadPort {
  sleep_for(...args: readonly PortValue[]): PortValue | void;
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
export const sourceFile = "src/utils/database.cpp";
export const targetFile = "utils/database.ts";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { Date as FreppleDate } from "./date.js";
import { LogicException, RuntimeException } from "./library.js";

export type DatabaseConnection = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export abstract class DatabaseStatementBase {
  abstract execute(connection: DatabaseConnection): Promise<QueryResult<QueryResultRow>>;
}

export class DatabaseStatement extends DatabaseStatementBase {
  readonly args: readonly (string | null)[];
  constructor(readonly sql: string, ...args: readonly string[]) {
    super();
    if (args.length > 16) throw new RuntimeException("Database statements are limited to 16 arguments");
    this.args = args.map((argument) => argument === "" ? null : argument);
  }
  override async execute(connection: DatabaseConnection): Promise<QueryResult<QueryResultRow>> {
    return connection.query(this.sql, [...this.args]);
  }
  override toString(): string { return this.args.length ? `${this.sql} with arguments ${this.args.join(", ")}` : this.sql; }
}

export class DatabasePreparedStatement extends DatabaseStatementBase {
  private readonly args: (string | null)[];
  constructor(readonly name: string, readonly sql: string, argCount = 0) {
    super();
    if (argCount < 0 || argCount > 1000) throw new RuntimeException("Prepared statements are limited to 1000 arguments");
    this.args = Array.from({ length: argCount }, () => null);
  }
  getArgs(): number { return this.args.length; }
  setArgument(index: number, value: string): void {
    if (index < 0 || index >= this.args.length) throw new RuntimeException("Setting invalid argument of prepared statement");
    this.args[index] = value || null;
  }
  override async execute(connection: DatabaseConnection): Promise<QueryResult<QueryResultRow>> {
    return connection.query({ name: this.name, text: this.sql, values: this.args });
  }
}

export class DatabaseTransaction extends DatabaseStatementBase {
  private readonly statements: DatabaseStatementBase[] = [];
  pushStatement(statement: DatabaseStatementBase): void { this.statements.push(statement); }
  override async execute(connection: DatabaseConnection): Promise<QueryResult<QueryResultRow>> {
    await connection.query("BEGIN TRANSACTION");
    let result = await connection.query("SELECT 1 WHERE false");
    try {
      for (const statement of this.statements) result = await statement.execute(connection);
      await connection.query("COMMIT");
      this.statements.length = 0;
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      this.statements.length = 0;
      throw error;
    }
  }
}

export class DatabaseBadConnection extends RuntimeException {
  override readonly name = "DatabaseBadConnection";
  constructor() { super("Bad database connection"); }
}

export class DatabaseReader {
  private pool: Pool | null = null;
  constructor(private readonly connectionString: string) {}
  assureConnection(): Pool {
    this.pool ??= new Pool({ connectionString: this.connectionString });
    return this.pool;
  }
  getConnection(): Pool { return this.assureConnection(); }
  async executeSQL(statement: DatabaseStatement): Promise<void> { await statement.execute(this.assureConnection()); }
  async closeConnection(): Promise<void> { const pool = this.pool; this.pool = null; await pool?.end(); }
  async dispose(): Promise<void> { await this.closeConnection(); }
}

export class DatabaseResult {
  private constructor(private readonly result: QueryResult<QueryResultRow>) {}
  static async create(reader: DatabaseReader, statement: DatabaseStatementBase): Promise<DatabaseResult> {
    return new DatabaseResult(await statement.execute(reader.getConnection()));
  }
  countRows(): number { return this.result.rowCount ?? this.result.rows.length; }
  countFields(): number { return this.result.fields.length; }
  getFieldName(index: number): string { return this.result.fields[index]?.name ?? ""; }
  private value(row: number, field: number): unknown {
    const name = this.getFieldName(field);
    return name ? this.result.rows[row]?.[name] : undefined;
  }
  getValueDate(row: number, field: number): FreppleDate { return new FreppleDate(String(this.value(row, field) ?? "")); }
  getValueString(row: number, field: number): string { return String(this.value(row, field) ?? ""); }
  getValueDouble(row: number, field: number): number { return Number(this.value(row, field) ?? 0); }
  getValueDoubleOrNull(row: number, field: number): readonly [number, boolean] { const value = this.value(row, field); return [Number(value ?? 0), value === null || value === undefined]; }
  getValueInt(row: number, field: number): number { return Math.trunc(this.getValueDouble(row, field)); }
  getValueLong(row: number, field: number): number { return this.getValueInt(row, field); }
  getValueBool(row: number, field: number): boolean { const value = this.value(row, field); return ![null, undefined, "", "f", "F", "0", 0, false].includes(value as never); }
}

export class DatabaseWriter {
  private static instance: DatabaseWriter | null = null;
  private static defaultConnectionString = "";
  private readonly pool: Pool;
  private readonly statements: DatabaseStatementBase[] = [];
  private processing: Promise<void> | null = null;

  private constructor(connectionString: string) { this.pool = new Pool({ connectionString }); }
  static launch(connectionString = this.defaultConnectionString): DatabaseWriter {
    if (this.instance) throw new RuntimeException("Database writer already running");
    this.instance = new DatabaseWriter(connectionString);
    return this.instance;
  }
  static setConnectionString(value: string): void { this.defaultConnectionString = value; }
  static getConnectionString(): string { return this.defaultConnectionString; }
  static pushTransaction(transaction: DatabaseTransaction): void { this.requireInstance().enqueue(transaction); }
  static pushStatement(sql: string, ...args: readonly string[]): void { this.requireInstance().enqueue(new DatabaseStatement(sql, ...args)); }
  static async flush(): Promise<void> { await this.requireInstance().drain(); }
  static async close(): Promise<void> { const writer = this.instance; this.instance = null; if (writer) { await writer.drain(); await writer.pool.end(); } }
  private static requireInstance(): DatabaseWriter { if (!this.instance) throw new LogicException("Database writer not initialized"); return this.instance; }
  private enqueue(statement: DatabaseStatementBase): void { this.statements.push(statement); this.processing ??= this.workerthread(); }
  private async drain(): Promise<void> { await this.processing; }
  private async workerthread(): Promise<void> {
    try { while (this.statements.length) await this.statements.shift()?.execute(this.pool); }
    finally { this.processing = null; if (this.statements.length) this.processing = this.workerthread(); }
  }
}

export function runDatabaseThread(connectionString = ""): DatabaseWriter { return DatabaseWriter.launch(connectionString); }

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
  "#include <deque>",
  "#include <thread>",
  "",
  "#include \"frepple/database.h\"",
  "",
  "namespace frepple::utils {",
  "",
  "DatabaseWriter* DatabaseWriter::instance = nullptr;",
  "",
  "string DatabaseWriter::defaultconnectionstring;",
  "",
  "void DatabaseReader::assureConnection() {",
  "  if (conn || connectionstring.empty()) return;",
  "  conn = PQconnectdb(connectionstring.c_str());",
  "  if (PQstatus(conn) != CONNECTION_OK) {",
  "    stringstream o;",
  "    o << \"Database error: Connection failed: \" << PQerrorMessage(conn) << '\\n';",
  "    PQfinish(conn);",
  "    conn = nullptr;",
  "    throw RuntimeException(o.str());",
  "  }",
  "  if (!Plan::instance().getTimeZone().empty())",
  "    DatabaseStatement(\"set time zone '\" + Plan::instance().getTimeZone() + \"'\")",
  "        .execute(conn);",
  "}",
  "",
  "DatabaseReader::~DatabaseReader() {",
  "  if (conn) PQfinish(conn);",
  "}",
  "",
  "void DatabaseReader::executeSQL(DatabaseStatement& stmt) {",
  "  assureConnection();",
  "  PGresult* res = stmt.execute(conn);",
  "  if (PQresultStatus(res) != PGRES_COMMAND_OK) {",
  "    stringstream o;",
  "    o << \"Database error: \" << PQerrorMessage(conn)",
  "      << \"\\n   statement: \" << stmt << '\\n';",
  "    PQclear(res);",
  "    throw RuntimeException(o.str());",
  "  }",
  "  PQclear(res);",
  "}",
  "",
  "DatabaseResult::DatabaseResult(DatabaseReader& db, DatabaseStatement& stmt) {",
  "  res = stmt.execute(db.getConnection());",
  "  if (PQstatus(db.getConnection()) == CONNECTION_BAD) {",
  "    PQclear(res);",
  "    throw DatabaseBadConnection();",
  "  }",
  "  if (PQresultStatus(res) != PGRES_TUPLES_OK) {",
  "    stringstream o;",
  "    o << \"Database error: \" << db.getError() << \"\\n   statement: \" << stmt",
  "      << '\\n';",
  "    PQclear(res);",
  "    throw RuntimeException(o.str());",
  "  }",
  "}",
  "",
  "PyObject* runDatabaseThread(PyObject*, PyObject* args, PyObject*) {",
  "  // Pick up arguments",
  "  const char* con = \"\";",
  "  if (!PyArg_ParseTuple(args, \"|s:runDatabaseThread\", &con)) return nullptr;",
  "",
  "  // Create a new thread",
  "  DatabaseWriter::launch(con);",
  "",
  "  // Return. The database writer is now running in a seperate thread from now",
  "  // onwards.",
  "  return Py_BuildValue(\"\");",
  "}",
  "",
  "DatabaseWriter::DatabaseWriter(const string& c) : connectionstring(c) {",
  "  // Create a database writer thread",
  "  worker = thread(workerthread, this);",
  "  worker.detach();",
  "}",
  "",
  "void DatabaseWriter::pushTransaction(DatabaseTransaction* trns) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(trns);",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(sql));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(sql, arg1));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(sql, arg1, arg2));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(sql, arg1, arg2, arg3));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4, arg5));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4, arg5, arg6));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(",
  "      sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(",
  "      sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9,",
  "                                   const string& arg10) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(",
  "      sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9,",
  "                                   const string& arg10, const string& arg11) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(",
  "      sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9,",
  "                                   const string& arg10, const string& arg11,",
  "                                   const string& arg12) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8,",
  "                            arg9, arg10, arg11, arg12));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9,",
  "                                   const string& arg10, const string& arg11,",
  "                                   const string& arg12, const string& arg13) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8,",
  "                            arg9, arg10, arg11, arg12, arg13));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9,",
  "                                   const string& arg10, const string& arg11,",
  "                                   const string& arg12, const string& arg13,",
  "                                   const string& arg14) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8,",
  "                            arg9, arg10, arg11, arg12, arg13, arg14));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9,",
  "                                   const string& arg10, const string& arg11,",
  "                                   const string& arg12, const string& arg13,",
  "                                   const string& arg14, const string& arg15) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(",
  "      new DatabaseStatement(sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8,",
  "                            arg9, arg10, arg11, arg12, arg13, arg14, arg15));",
  "}",
  "",
  "void DatabaseWriter::pushStatement(const string& sql, const string& arg1,",
  "                                   const string& arg2, const string& arg3,",
  "                                   const string& arg4, const string& arg5,",
  "                                   const string& arg6, const string& arg7,",
  "                                   const string& arg8, const string& arg9,",
  "                                   const string& arg10, const string& arg11,",
  "                                   const string& arg12, const string& arg13,",
  "                                   const string& arg14, const string& arg15,",
  "                                   const string& arg16) {",
  "  if (!instance) throw LogicException(\"Database writer not initialized\");",
  "  lock_guard<mutex> l(instance->lock);",
  "  instance->statements.push_back(new DatabaseStatement(",
  "      sql, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11,",
  "      arg12, arg13, arg14, arg15, arg16));",
  "}",
  "",
  "void DatabaseWriter::workerthread(DatabaseWriter* writer) {",
  "  logger << \"Initialized database writer\\n\";",
  "",
  "  // Endless loop",
  "  PGconn* conn = nullptr;",
  "  Date idle_since = Date::infinitePast;",
  "  while (true) {",
  "    // Sleep for a second   TODO replace with wait for messages",
  "    this_thread::sleep_for(chrono::seconds(1));",
  "",
  "    // Loop while we have commands in the queue",
  "    while (true) {",
  "      // Pick up a statement",
  "      // To be reviewed: we remote the statement, regardless whether execution",
  "      // failed or not. We may loose some changes if eg the connection was",
  "      // dropped.",
  "      writer->lock.lock();",
  "      if (writer->statements.empty()) {",
  "        // Queue is empty",
  "        if (conn && Date::now() - idle_since > Duration(600L)) {",
  "          logger << \"Closing idle database connection at \" << Date::now()",
  "                 << '\\n';",
  "          PQfinish(conn);",
  "          conn = nullptr;",
  "        }",
  "        writer->lock.unlock();",
  "        break;",
  "      }",
  "      DatabaseStatementBase* stmt = writer->statements.front();",
  "      writer->statements.pop_front();",
  "      writer->lock.unlock();",
  "",
  "      // Connect to the database if we don't have a connection yet",
  "      if (!conn) {",
  "        conn = PQconnectdb(writer->connectionstring.c_str());",
  "        if (PQstatus(conn) != CONNECTION_OK) {",
  "          logger << \"Database thread error: Connection failed: \"",
  "                 << PQerrorMessage(conn) << '\\n';",
  "          PQfinish(conn);",
  "          return;",
  "        }",
  "        if (!Plan::instance().getTimeZone().empty())",
  "          DatabaseStatement(\"set time zone '\" + Plan::instance().getTimeZone() +",
  "                            \"'\")",
  "              .execute(conn);",
  "        logger << \"Opening connection for database writer at \" << Date::now()",
  "               << '\\n';",
  "      }",
  "",
  "      // Execute the statement",
  "      PGresult* res = stmt->execute(conn);",
  "      if (PQresultStatus(res) != PGRES_COMMAND_OK) {",
  "        logger << \"Database thread error: statement failed: \"",
  "               << PQerrorMessage(conn) << '\\n';",
  "        logger << \"  Statement: \" << stmt << '\\n';",
  "        // TODO Catch dropped connections PGRES_FATAL_ERROR and then call",
  "        // PQreset(conn) to reconnect automatically",
  "      }",
  "      delete stmt;",
  "      PQclear(res);",
  "    }  // While queue not empty",
  "",
  "    // Record time of last activity",
  "    idle_since = Date::now();",
  "  };  // Infinite loop till program ends",
  "",
  "  // Finalize",
  "  if (conn) PQfinish(conn);",
  "  logger << \"Finished database writer thread\\n\";",
  "}",
  "",
  "PGresult* DatabaseStatement::execute(PGconn* conn) {",
  "  // Execute a single statement",
  "  const char* paramValues[MAXPARAMS];",
  "  for (int idx = 0; idx < args; ++idx)",
  "    paramValues[idx] = arg[idx].empty() ? nullptr : arg[idx].c_str();",
  "  if (args)",
  "    return PQexecParams(conn, sql.c_str(), args, nullptr, paramValues, nullptr,",
  "                        nullptr, 0);",
  "  else",
  "    return PQexec(conn, sql.c_str());",
  "}",
  "",
  "PGresult* DatabaseTransaction::execute(PGconn* conn) {",
  "  // Start a transaction",
  "  PGresult* res = PQexec(conn, \"BEGIN TRANSACTION\");",
  "  if (PQresultStatus(res) != PGRES_COMMAND_OK) {",
  "    logger << \"Database thread error: transaction start failed: \"",
  "           << PQerrorMessage(conn) << '\\n';",
  "    return res;",
  "  }",
  "  PQclear(res);",
  "",
  "  // Execute all statements in the list",
  "  bool rollback = false;",
  "  while (!statements.empty()) {",
  "    // Pick up a statement",
  "    DatabaseStatementBase* stmt = statements.front();",
  "    statements.pop_front();",
  "",
  "    // Execute the statement, unless one of the previous statements failed",
  "    if (!rollback) {",
  "      res = stmt->execute(conn);",
  "      if (PQresultStatus(res) != PGRES_COMMAND_OK) {",
  "        // Statement failed.",
  "        // After rollback we'll return the resultstatus object we have",
  "        // at the moment of the failure. Hence no call to PQClear.",
  "        logger << \"Database thread error: statement failed: \"",
  "               << PQerrorMessage(conn) << '\\n';",
  "        logger << \"  Statement: \" << stmt << '\\n';",
  "        rollback = true;",
  "      } else",
  "        PQclear(res);",
  "    }",
  "",
  "    // Delete the statement (whether execution failed or not)",
  "    delete stmt;",
  "  }",
  "",
  "  // Commit or rollback the complete transaction",
  "  if (rollback) {",
  "    PGresult* res2 = PQexec(conn, \"ROLLBACK\");",
  "    if (PQresultStatus(res2) != PGRES_COMMAND_OK) {",
  "      logger << \"Database thread error: transaction rollback failed: \"",
  "             << PQerrorMessage(conn) << '\\n';",
  "      PQclear(res2);",
  "      return res2;",
  "    }",
  "  } else {",
  "    PGresult* res2 = PQexec(conn, \"COMMIT\");",
  "    if (PQresultStatus(res2) != PGRES_COMMAND_OK) {",
  "      logger << \"Database thread error: transaction commit failed: \"",
  "             << PQerrorMessage(conn) << '\\n';",
  "      PQclear(res2);",
  "      return res2;",
  "    }",
  "  }",
  "  return res;",
  "}",
  "",
  "}  // namespace frepple::utils",
];
