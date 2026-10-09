import { BadRequestException, Injectable } from '@nestjs/common';
import { executePrintDatabaseQuery, normalizePrintDatabaseConfig, PRINT_DATABASE_TIMEOUT_MS } from './print-database-connection';
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
  protected getDataSourceClient() {
    return createSupabaseClient('admin');
  }

  async resolve(sourceCodeValue: unknown, paramsValue: unknown, context: PrintRuntimeContext) {
    const sourceCode = readSourceCode(sourceCodeValue);
    const params = isRecord(paramsValue) ? paramsValue : {};
    const client = this.getDataSourceClient();
    const { data: script, error } = await client
      .from('print_datasource_script')
      .select('id, code, datasource_code, script, schema, version')
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
    const datasourceCode = readString(script.datasource_code);
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
          params,
          ...(datasourceCode ? { datasource: {} } : {})
        }
      },
      (name, args) => this.callCapability(name, args, context, datasourceCode),
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
      .select('code, name, datasource_code, schema, version, updated_at')
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
        .select('id, code, name, datasource_code, script, schema, enabled, version, updated_at')
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
      const hasDataSourceCode = Object.prototype.hasOwnProperty.call(value, 'datasource_code');
      if (hasDataSourceCode && value.datasource_code != null && typeof value.datasource_code !== 'string') {
        throw new BadRequestException('datasource_code must be a string or null.');
      }
      const datasourceCode = readString(value.datasource_code);
      const payload = {
        ...(id ? { id } : {}),
        user_id: context.userId,
        code,
        name,
        script,
        ...(hasDataSourceCode ? { datasource_code: datasourceCode ? readSourceCode(datasourceCode) : null } : {}),
        schema,
        enabled: value.enabled !== false,
        version: Number.isInteger(value.version) && Number(value.version) > 0 ? Number(value.version) : 1
      };
      const query = id
        ? client.from('print_datasource_script').update(payload).eq('id', id).eq('user_id', context.userId).select('id, code, name, datasource_code, script, schema, enabled, version, updated_at').single()
        : client.from('print_datasource_script').insert(payload).select('id, code, name, datasource_code, script, schema, enabled, version, updated_at').single();
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
    try {
      normalizePrintDatabaseConfig(schema);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '连接配置无效。');
    }
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

  async testConnection(value: Record<string, unknown>, context: PrintRuntimeContext) {
    let schema = readSchema(value.schema);
    if (!Object.prototype.hasOwnProperty.call(value, 'schema')) {
      const id = readString(value.id);
      const code = id ? '' : readSourceCode(value.sourceCode || value.code);
      const query = createSupabaseClient('admin').from('print_datasource_typeorm')
        .select('schema').eq('user_id', context.userId);
      const { data, error } = await (id ? query.eq('id', id) : query.eq('code', code)).maybeSingle();
      if (error || !data) throw new BadRequestException('数据源不存在或无权访问。');
      schema = readSchema(data.schema);
    }
    try {
      const result = await executePrintDatabaseQuery(schema);
      return { ok: true, driver: result.driver, elapsedMs: result.elapsedMs, timeoutMs: PRINT_DATABASE_TIMEOUT_MS, message: '数据源连接成功。' };
    } catch (error) {
      // Driver messages can include connection strings or credentials. Return a bounded, safe result.
      const detail = error instanceof Error ? error.message : '';
      const validation = /^(请填写|数据库端口|数据源驱动)/.test(detail);
      const timeout = /timeout|timed out|etimedout|超时/i.test(detail);
      return { ok: false, timeoutMs: PRINT_DATABASE_TIMEOUT_MS, message: validation ? detail : timeout
        ? '数据源连接超时（2000ms）。'
        : '数据源连接失败，请检查地址、端口、数据库、账号、密码和加密设置。' };
    }
  }

  private async callCapability(name: string, args: unknown[], context: PrintRuntimeContext, datasourceCode: string) {
    if (name === 'http.request') return this.httpRequest(args);
    if (name === 'dataSource.query') {
      if (!datasourceCode) throw new Error('当前打印脚本未关联数据库数据源。');
      const query = readString(args[0]);
      if (!query) throw new Error('请提供查询 SQL。');
      if (!Array.isArray(args[1])) throw new Error('查询参数必须是数组。');
      return this.queryTypeorm(datasourceCode, { query, parameters: args[1] }, context);
    }
    if (name === 'dataSource.get') {
      const sourceCode = args[0];
      const params = args[1];
      if (!datasourceCode) throw new Error('当前打印脚本未关联数据库数据源。');
      if (readSourceCode(sourceCode) !== datasourceCode) {
        throw new Error('打印脚本只能查询已关联的数据库数据源。');
      }
      return this.queryTypeorm(datasourceCode, params, context);
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
    const client = this.getDataSourceClient();
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
    const query = readString(params.query || config.query);
    if (!/^\s*(select|with)\b/i.test(query) || query.includes(';')) throw new Error('Only a single read-only SELECT query is allowed.');
    const parameters = Array.isArray(params.parameters) ? params.parameters : Array.isArray(config.parameters) ? config.parameters : [];
    const result = await executePrintDatabaseQuery(config, query, parameters, MAX_RECORDS);
    return normalizeRecords(result.records);
  }
}

function createEntryFunctionSource(source: string) {
  const normalized = source.trim().replace(/;\s*$/, '');
  return `async function printDataSourceEntry(input) {
    const configured = (\n${normalized}\n);
    if (typeof configured !== 'function') throw new TypeError('Print data source script must be a function.');
    return await configured(input.context);
  }`;
}
