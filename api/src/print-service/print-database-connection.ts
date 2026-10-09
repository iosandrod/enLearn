import { Client } from 'pg';
import { createConnection } from 'mysql2';
import { ConnectionPool } from 'mssql';

export const PRINT_DATABASE_TIMEOUT_MS = 2000;
export type PrintDatabaseDriver = 'mssql' | 'mysql' | 'pgsql';

export type PrintDatabaseConfig = {
  driver: PrintDatabaseDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  encrypt: boolean;
  trustServerCertificate: boolean;
  instanceName: string;
  applicationName: string;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePrintDatabaseConfig(value: Record<string, unknown>): PrintDatabaseConfig {
  let config = { ...value };
  const connectionString = text(config.url || config.connectionString);
  if (!text(config.host) && connectionString) {
    const url = new URL(connectionString);
    config = {
      ...config,
      driver: config.driver || config.type || url.protocol.replace(':', ''),
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || config.port,
      database: decodeURIComponent(url.pathname.slice(1)),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: config.ssl ?? ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? ''),
    };
  }
  const aliases: Record<string, PrintDatabaseDriver> = {
    pgsql: 'pgsql', postgres: 'pgsql', postgresql: 'pgsql',
    mysql: 'mysql', mysql2: 'mysql', mssql: 'mssql', sqlserver: 'mssql',
  };
  const driverKey = text(config.driver || config.type || 'pgsql').toLowerCase();
  const driver = Object.prototype.hasOwnProperty.call(aliases, driverKey) ? aliases[driverKey] : undefined;
  if (!driver) throw new Error('数据源驱动仅支持 MSSQL、MySQL、PostgreSQL。');
  const host = text(config.host);
  const database = text(config.database || config.databaseName);
  const username = text(config.username || config.user);
  if (!host || !database || !username) throw new Error('请填写主机、数据库名称和用户名。');
  const port = Number(config.port ?? { mssql: 1433, mysql: 3306, pgsql: 5432 }[driver]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('数据库端口必须是 1 到 65535 的整数。');
  return {
    driver, host, port, database, username,
    password: typeof config.password === 'string' ? config.password : '',
    ssl: config.ssl === true,
    encrypt: config.encrypt !== false,
    trustServerCertificate: config.trustServerCertificate === true,
    instanceName: text(config.instanceName),
    applicationName: text(config.applicationName) || 'EnLearn Print',
  };
}

/** A probe always uses SELECT 1; configured queries are used only by the print runtime. */
export async function executePrintDatabaseQuery(
  value: Record<string, unknown>,
  query?: string,
  parameters: unknown[] = [],
  maxRecords = 5000,
) {
  const config = normalizePrintDatabaseConfig(value);
  const testing = query === undefined;
  if (!testing && (!/^\s*(select|with)\b/i.test(query) || query.includes(';'))) {
    throw new Error('只允许一条 SELECT 查询，不能包含分号。');
  }
  if (!testing && config.driver === 'mssql' && !/^\s*select\b/i.test(query)) {
    throw new Error('MSSQL 打印查询请使用 SELECT 语句。');
  }
  const sql = testing ? 'SELECT 1 AS connected' : config.driver === 'mssql'
    ? `SELECT TOP (${maxRecords + 1}) * FROM (${query}) AS print_data_source_result`
    : `SELECT * FROM (${query}) AS print_data_source_result LIMIT ${maxRecords + 1}`;
  let close: () => void = () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const cleanup = () => { try { close(); } catch { /* Cleanup must not override the test result. */ } };
  const startedAt = Date.now();
  const work = async (): Promise<Array<Record<string, unknown>>> => {
    if (config.driver === 'pgsql') {
      const connection = new Client({
        host: config.host, port: config.port, database: config.database,
        user: config.username, password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: !config.trustServerCertificate } : false,
        application_name: config.applicationName,
        connectionTimeoutMillis: PRINT_DATABASE_TIMEOUT_MS,
        statement_timeout: PRINT_DATABASE_TIMEOUT_MS,
        query_timeout: PRINT_DATABASE_TIMEOUT_MS,
      });
      connection.on('error', () => undefined);
      close = () => { void connection.end().catch(() => undefined); };
      await connection.connect();
      if (expired) return [];
      if (!testing) await connection.query('BEGIN READ ONLY');
      const result = await connection.query(sql, parameters);
      if (!testing) await connection.query('COMMIT');
      return result.rows;
    }
    if (config.driver === 'mysql') {
      const connection = createConnection({
        host: config.host, port: config.port, database: config.database,
        user: config.username, password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: !config.trustServerCertificate } : undefined,
        connectTimeout: PRINT_DATABASE_TIMEOUT_MS,
        multipleStatements: false,
      });
      connection.on('error', () => undefined);
      close = () => connection.destroy();
      const promise = connection.promise();
      await promise.connect();
      if (expired) return [];
      if (!testing) await promise.query('START TRANSACTION READ ONLY');
      const [rows] = await promise.query({ sql, timeout: PRINT_DATABASE_TIMEOUT_MS }, parameters);
      if (!testing) await promise.query('COMMIT');
      if (!Array.isArray(rows)) throw new Error('数据库查询没有返回记录数组。');
      return rows as Array<Record<string, unknown>>;
    }
    const connections = new Set<{ close(): void }>();
    const pool = new ConnectionPool({
      server: config.host,
      ...(!config.instanceName ? { port: config.port } : {}),
      database: config.database, user: config.username, password: config.password,
      connectionTimeout: PRINT_DATABASE_TIMEOUT_MS,
      requestTimeout: PRINT_DATABASE_TIMEOUT_MS,
      beforeConnect: (connection) => { connections.add(connection); },
      pool: { min: 0, max: 1, idleTimeoutMillis: PRINT_DATABASE_TIMEOUT_MS },
      options: {
        encrypt: config.encrypt, trustServerCertificate: config.trustServerCertificate,
        appName: config.applicationName,
        maxRetriesOnTransientErrors: 0,
        ...(config.instanceName ? { instanceName: config.instanceName } : {}),
      },
    });
    pool.on('error', () => undefined);
    let request: ReturnType<ConnectionPool['request']> | undefined;
    close = () => {
      try { request?.cancel(); } catch { /* A completed request may no longer be cancellable. */ }
      connections.forEach((connection) => { try { connection.close(); } catch { /* Already closed. */ } });
      void pool.close().catch(() => undefined);
    };
    await pool.connect();
    if (expired) { cleanup(); return []; }
    request = pool.request();
    parameters.forEach((parameter, index) => request!.input(`p${index + 1}`, parameter));
    const result = await request.query(sql);
    return result.recordset ?? [];
  };
  try {
    const rows = await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error('数据源连接或查询超时（2000ms）。'));
          cleanup();
        }, PRINT_DATABASE_TIMEOUT_MS);
      }),
    ]);
    if (rows.length > maxRecords) throw new Error(`数据源最多支持 ${maxRecords} 条记录。`);
    return { driver: config.driver, records: rows, elapsedMs: Date.now() - startedAt };
  } finally {
    if (timer) clearTimeout(timer);
    cleanup();
  }
}
