import { BadRequestException, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { executeTriggerWorkflowFunction } from '../workflow/trigger/trigger-workflow.script-runtime';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { createSupabaseClient } from '../common/utils/supabase';

const MAX_SCRIPT_SOURCE_BYTES = 256 * 1024;
const MAX_RESULT_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 5000;
const MAX_HTTP_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

type PrintRuntimeContext = ServiceContext & { accountId: string; userId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function jsonBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value === undefined ? null : value), 'utf8');
}

function readSourceCode(value: unknown) {
  const sourceCode = readString(value);
  if (!sourceCode) throw new BadRequestException('sourceCode is required.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(sourceCode)) {
    throw new BadRequestException('sourceCode has an invalid format.');
  }
  return sourceCode;
}

function normalizeRecords(value: unknown) {
  const records = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.records)
      ? value.records
      : isRecord(value) && Array.isArray(value.data)
        ? value.data
        : undefined;
  if (!records) throw new BadRequestException('Data source script must return an array or { records }.');
  if (records.length > MAX_RECORDS) throw new BadRequestException(`A data source supports at most ${MAX_RECORDS} records.`);
  if (!records.every(isRecord)) throw new BadRequestException('Data source records must be objects.');
  if (jsonBytes(records) > MAX_RESULT_BYTES) throw new BadRequestException('Data source result exceeds 5 MB.');
  return records as Array<Record<string, unknown>>;
}

function readSchema(value: unknown) {
  if (value === undefined || value === null || value === '') return {};
  if (!isRecord(value)) throw new BadRequestException('Data source schema must be an object.');
  if (jsonBytes(value) > 256 * 1024) throw new BadRequestException('Data source schema is too large.');
  return value;
}

function readManagedSourceType(value: unknown): 'script' | 'typeorm' {
  return value === 'typeorm' ? 'typeorm' : 'script';
}

@Injectable()
export class PrintDataSourceRuntime {
  async resolve(sourceCodeValue: unknown, paramsValue: unknown, context: PrintRuntimeContext) {
    const sourceCode = readSourceCode(sourceCodeValue);
    const params = isRecord(paramsValue) ? paramsValue : {};
    const client = createSupabaseClient('admin');
    const { data: script, error } = await client
      .from('print_datasource_script')
      .select('id, code, script, schema, version')
      .eq('user_id', context.userId)
      .eq('code', sourceCode)
      .eq('enabled', true)
      .maybeSingle();
    if (error) throw new BadRequestException(`Unable to load print data source: ${error.message}`);
    if (!script) throw new BadRequestException(`Print data source script not found: ${sourceCode}`);
    const source = readString(script.script);
    if (!source || Buffer.byteLength(source, 'utf8') > MAX_SCRIPT_SOURCE_BYTES) {
      throw new BadRequestException('Print data source script is empty or too large.');
    }
    const result = await executeTriggerWorkflowFunction(
      createEntryFunctionSource(source),
      {
        payload: params,
        variables: {},
        context: {
          accountId: context.accountId,
          userId: context.userId,
          requestId: context.requestId ?? null,
          sourceCode,
          params
        }
      },
      (name, args) => this.callCapability(name, args, context),
      DEFAULT_TIMEOUT_MS
    );
    return {
      sourceCode,
      version: Number(script.version ?? 1),
      schema: isRecord(script.schema) ? script.schema : {},
      records: normalizeRecords(result)
    };
  }

  async list(context: PrintRuntimeContext) {
    const client = createSupabaseClient('admin');
    const { data, error } = await client
      .from('print_datasource_script')
      .select('code, name, schema, version, updated_at')
      .eq('user_id', context.userId)
      .eq('enabled', true)
      .order('code', { ascending: true });
    if (error) throw new BadRequestException(`Unable to list print data sources: ${error.message}`);
    return data ?? [];
  }

  async listManaged(context: PrintRuntimeContext) {
    const client = createSupabaseClient('admin');
    const [scripts, typeorm] = await Promise.all([
      client.from('print_datasource_script')
        .select('id, code, name, script, schema, enabled, version, updated_at')
        .eq('user_id', context.userId)
        .order('code', { ascending: true }),
      client.from('print_datasource_typeorm')
        .select('id, code, name, schema, enabled, version, updated_at')
        .eq('user_id', context.userId)
        .order('code', { ascending: true })
    ]);
    if (scripts.error) throw new BadRequestException(`Unable to list script data sources: ${scripts.error.message}`);
    if (typeorm.error) throw new BadRequestException(`Unable to list TypeORM data sources: ${typeorm.error.message}`);
    return [
      ...(scripts.data ?? []).map((row) => ({ ...row, type: 'script' as const })),
      ...(typeorm.data ?? []).map((row) => ({ ...row, type: 'typeorm' as const, script: '' }))
    ].sort((left, right) => String(left.code).localeCompare(String(right.code)));
  }

  async saveManaged(value: Record<string, unknown>, context: PrintRuntimeContext) {
    const sourceType = readManagedSourceType(value.type);
    const code = readSourceCode(value.code);
    const name = readString(value.name) || code;
    const schema = readSchema(value.schema);
    const id = readString(value.id);
    const client = createSupabaseClient('admin');
    if (sourceType === 'script') {
      const script = readString(value.script);
      if (!script) throw new BadRequestException('script is required for a script data source.');
      const payload = {
        ...(id ? { id } : {}),
        user_id: context.userId,
        code,
        name,
        script,
        schema,
        enabled: value.enabled !== false,
        version: Number.isInteger(value.version) && Number(value.version) > 0 ? Number(value.version) : 1
      };
      const query = id
        ? client.from('print_datasource_script').update(payload).eq('id', id).eq('user_id', context.userId).select('id, code, name, script, schema, enabled, version, updated_at').single()
        : client.from('print_datasource_script').insert(payload).select('id, code, name, script, schema, enabled, version, updated_at').single();
      const { data, error } = await query;
      if (error) throw new BadRequestException(`Unable to save script data source: ${error.message}`);
      return { ...data, type: 'script' as const };
    }

    const payload = {
      ...(id ? { id } : {}),
      user_id: context.userId,
      code,
      name,
      schema,
      enabled: value.enabled !== false,
      version: Number.isInteger(value.version) && Number(value.version) > 0 ? Number(value.version) : 1
    };
    const query = id
      ? client.from('print_datasource_typeorm').update(payload).eq('id', id).eq('user_id', context.userId).select('id, code, name, schema, enabled, version, updated_at').single()
      : client.from('print_datasource_typeorm').insert(payload).select('id, code, name, schema, enabled, version, updated_at').single();
    const { data, error } = await query;
    if (error) throw new BadRequestException(`Unable to save TypeORM data source: ${error.message}`);
    return { ...data, type: 'typeorm' as const, script: '' };
  }

  async deleteManaged(value: Record<string, unknown>, context: PrintRuntimeContext) {
    const id = readString(value.id);
    if (!id) throw new BadRequestException('id is required.');
    const sourceType = readManagedSourceType(value.type);
    const table = sourceType === 'typeorm' ? 'print_datasource_typeorm' : 'print_datasource_script';
    const { error } = await createSupabaseClient('admin').from(table).delete()
      .eq('id', id)
      .eq('user_id', context.userId);
    if (error) throw new BadRequestException(`Unable to delete data source: ${error.message}`);
    return { id, type: sourceType, deleted: true };
  }

  private async callCapability(name: string, args: unknown[], context: PrintRuntimeContext) {
    if (name === 'http.request') return this.httpRequest(args);
    if (name === 'dataSource.get') {
      const sourceCode = args[0];
      const params = args[1];
      return this.queryTypeorm(sourceCode, params, context);
    }
    throw new Error(`Unsupported print data source capability: ${name}`);
  }

  private async httpRequest(args: unknown[]) {
    const url = readString(args[0]);
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http and https data source URLs are allowed.');
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      hostname.endsWith('.local')
    ) {
      throw new Error('Private or local HTTP data source URLs are not allowed.');
    }
    const init = isRecord(args[1]) ? args[1] : {};
    const method = readString(init.method).toUpperCase() || 'GET';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('HTTP method is not allowed.');
    const headers = isRecord(init.headers)
      ? Object.fromEntries(Object.entries(init.headers).filter(([key]) => !/^host$|^content-length$/i.test(key)).map(([key, value]) => [key, String(value)]))
      : {};
    const body = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method, headers, body, redirect: 'error', signal: controller.signal });
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_HTTP_RESPONSE_BYTES) throw new Error('HTTP response is too large.');
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_HTTP_RESPONSE_BYTES) throw new Error('HTTP response is too large.');
      let data: unknown = text;
      try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), data };
    } finally {
      clearTimeout(timer);
    }
  }

  private async queryTypeorm(sourceCodeValue: unknown, paramsValue: unknown, context: PrintRuntimeContext) {
    const sourceCode = readSourceCode(sourceCodeValue);
    const params = isRecord(paramsValue) ? paramsValue : {};
    const client = createSupabaseClient('admin');
    const { data: source, error } = await client
      .from('print_datasource_typeorm')
      .select('schema')
      .eq('user_id', context.userId)
      .eq('code', sourceCode)
      .eq('enabled', true)
      .maybeSingle();
    if (error) throw new Error(`Unable to load TypeORM data source: ${error.message}`);
    if (!source || !isRecord(source.schema)) throw new Error(`TypeORM data source not found: ${sourceCode}`);
    const config = source.schema;
    const driver = readString(config.type || config.driver).toLowerCase();
    if (driver && !['postgres', 'postgresql'].includes(driver)) {
      throw new Error(`Unsupported TypeORM data source driver: ${driver}.`);
    }
    const connectionString = readString(config.url || config.connectionString) || buildConnectionString(config);
    if (!connectionString) throw new Error('TypeORM data source schema.url is required.');
    const query = readString(params.query || config.query);
    if (!/^\s*(select|with)\b/i.test(query) || query.includes(';')) throw new Error('Only a single read-only SELECT query is allowed.');
    const parameters = Array.isArray(params.parameters) ? params.parameters : Array.isArray(config.parameters) ? config.parameters : [];
    const pool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: DEFAULT_TIMEOUT_MS,
      statement_timeout: DEFAULT_TIMEOUT_MS,
      query_timeout: DEFAULT_TIMEOUT_MS
    });
    let connection: import('pg').PoolClient | undefined;
    try {
      connection = await pool.connect();
      await connection.query('begin read only');
      const result = await connection.query(
        `select * from (${query}) as print_data_source_result limit ${MAX_RECORDS + 1}`,
        parameters
      );
      if (result.rows.length > MAX_RECORDS) {
        throw new Error(`A data source supports at most ${MAX_RECORDS} records.`);
      }
      await connection.query('commit');
      return result.rows.slice(0, MAX_RECORDS);
    } catch (error) {
      await connection?.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      connection?.release();
      await pool.end().catch(() => undefined);
    }
  }
}

function buildConnectionString(config: Record<string, unknown>) {
  const host = readString(config.host);
  const database = readString(config.database || config.databaseName);
  if (!host || !database) return '';
  const user = encodeURIComponent(readString(config.username || config.user));
  const password = encodeURIComponent(readString(config.password));
  const port = Number(config.port);
  const auth = user ? `${user}${password ? `:${password}` : ''}@` : '';
  const portPart = Number.isInteger(port) && port > 0 ? `:${port}` : '';
  return `postgresql://${auth}${host}${portPart}/${encodeURIComponent(database)}`;
}

function createEntryFunctionSource(source: string) {
  const normalized = source.trim().replace(/;\s*$/, '');
  return `async function printDataSourceEntry(input) {
    const configured = (\n${normalized}\n);
    if (typeof configured !== 'function') throw new TypeError('Print data source script must be a function.');
    return await configured(input.context);
  }`;
}
