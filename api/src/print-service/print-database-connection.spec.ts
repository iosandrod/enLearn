import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { executePrintDatabaseQuery, normalizePrintDatabaseConfig, PRINT_DATABASE_TIMEOUT_MS } from './print-database-connection';
import { getEnv } from '../common/utils/env';
import { PrintDataSourceRuntime } from './print-data-source.runtime';
import { executeTriggerWorkflowFunction } from '../workflow/trigger/trigger-workflow.script-runtime';

type StoredRow = Record<string, unknown>;

function createDataSourceClient(scripts: StoredRow[], dataSources: StoredRow[]) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select() { return builder; },
        eq(field: string, value: unknown) { filters[field] = value; return builder; },
        async maybeSingle() {
          const rows = table === 'print_datasource_script' ? scripts : dataSources;
          const data = rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null;
          return { data, error: null };
        },
      };
      return builder;
    },
  };
}

class PrintDataSourceRuntimeHarness extends PrintDataSourceRuntime {
  constructor(private readonly client: ReturnType<typeof createDataSourceClient>) { super(); }
  protected override getDataSourceClient() { return this.client as never; }
}

async function main() {
  const defaults = { host: '127.0.0.1', database: 'test', username: 'test', password: ' secret ' };
  for (const [driver, port] of [['mssql', 1433], ['mysql', 3306], ['pgsql', 5432]] as const) {
    const config = normalizePrintDatabaseConfig({ ...defaults, driver });
    assert.equal(config.port, port);
    assert.equal(config.password, ' secret ', 'Passwords must not be trimmed.');
  }
  assert.equal(normalizePrintDatabaseConfig({ ...defaults, driver: 'postgres' }).driver, 'pgsql');
  assert.throws(() => normalizePrintDatabaseConfig({ ...defaults, driver: 'sqlite' }), /仅支持/);
  assert.throws(() => normalizePrintDatabaseConfig({ ...defaults, driver: 'constructor' }), /仅支持/);
  assert.throws(() => normalizePrintDatabaseConfig({ ...defaults, port: 70000 }), /端口/);
  assert.throws(() => normalizePrintDatabaseConfig({ ...defaults, port: 0 }), /端口/);
  await assert.rejects(executePrintDatabaseQuery(defaults, 'DELETE FROM orders'), /SELECT/);

  const capabilityCalls: Array<{ name: string; args: unknown[] }> = [];
  const proxyResult = await executeTriggerWorkflowFunction(
    `async function main(input) {
      return {
        keys: Object.keys(input.context.datasource),
        rows: await input.context.datasource.query('SELECT $1', ['value'])
      };
    }`,
    { payload: {}, variables: {}, context: { datasource: {} } },
    async (name, args) => {
      capabilityCalls.push({ name, args });
      return [{ value: 'ok' }];
    },
  );
  assert.deepEqual(proxyResult, { keys: ['query'], rows: [{ value: 'ok' }] });
  assert.deepEqual(capabilityCalls, [{ name: 'dataSource.query', args: ['SELECT $1', ['value']] }]);
  const noProxyResult = await executeTriggerWorkflowFunction(
    'function main(input) { return typeof input.context.datasource; }',
    { payload: {}, variables: {}, context: {} },
    async () => undefined,
  );
  assert.equal(noProxyResult, 'undefined');

  // A TCP server that accepts connections but never completes a database handshake.
  // Verify the actual drivers are cancelled within one shared 2000ms deadline.
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.resume();
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await Promise.all(['pgsql', 'mysql', 'mssql'].map(async (driver) => {
      const started = Date.now();
      await assert.rejects(executePrintDatabaseQuery({ ...defaults, driver, port: address.port }), /timeout|etimedout|超时/i);
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 1800 && elapsed < 2800, `${driver} elapsed ${elapsed}ms`);
    }));
    await delay(300);
    assert.equal(sockets.size, 0, 'All drivers must close their TCP connections after the deadline.');
    const runtime = new PrintDataSourceRuntime();
    const result = await runtime.testConnection({ schema: { ...defaults, driver: 'mysql', port: address.port } }, {
      accountId: 'test-account', userId: 'test-user',
    });
    assert.equal(result.ok, false);
    assert.equal(result.timeoutMs, PRINT_DATABASE_TIMEOUT_MS);
    assert.match(result.message, /2000ms/);
    assert.ok(!result.message.includes(defaults.password));
    await delay(300);
    assert.equal(sockets.size, 0, 'The connection test endpoint must also release timed-out connections.');
  } finally {
    sockets.forEach((socket) => socket.destroy());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Opt into a real PostgreSQL smoke test against the configured development database.
  if (process.env.PRINT_TEST_LOCAL_DATABASE === '1') {
    const env = getEnv();
    const url = env.DIRECT_URL || env.DATABASE_URL;
    assert.ok(url);
    const schema = { driver: 'pgsql', url };
    const probe = await executePrintDatabaseQuery({ ...schema, query: 'DELETE FROM must_not_execute' });
    assert.equal(probe.records[0].connected, 1, 'Connection tests must ignore configured SQL.');
    const query = await executePrintDatabaseQuery(schema, 'SELECT $1::text AS value', ['parameter-ok']);
    assert.equal(query.records[0].value, 'parameter-ok');
    await assert.rejects(executePrintDatabaseQuery(schema, 'SELECT pg_sleep(3)'), /timeout|超时/i);
    const result = await new PrintDataSourceRuntime().testConnection({ schema }, { accountId: 'test', userId: 'test' });
    assert.equal(result.ok, true);
    assert.equal(result.timeoutMs, 2000);

    const associatedRuntime = new PrintDataSourceRuntimeHarness(createDataSourceClient([
      {
        id: 'script-1', user_id: 'test', code: 'script.associated', datasource_code: 'database.associated', enabled: true,
        version: 1, schema: {},
        script: `async function main(context) {
          return await context.datasource.query('SELECT $1::text AS value', ['associated-ok']);
        }`,
      },
      {
        id: 'script-2', user_id: 'test', code: 'script.unassociated', datasource_code: null, enabled: true,
        version: 1, schema: {},
        script: 'function main(context) { return [{ hasDatasource: typeof context.datasource !== "undefined" }]; }',
      },
      {
        id: 'script-3', user_id: 'test', code: 'script.escape', datasource_code: 'database.associated', enabled: true,
        version: 1, schema: {},
        script: `async function main(context) {
          return await context.dataSource.get('database.other', { query: 'SELECT 1' });
        }`,
      },
    ], [
      { user_id: 'test', code: 'database.associated', enabled: true, schema },
      { user_id: 'test', code: 'database.other', enabled: true, schema },
    ]));
    const associated = await associatedRuntime.resolve('script.associated', {}, { accountId: 'test', userId: 'test' });
    assert.deepEqual(associated.records, [{ value: 'associated-ok' }]);
    const unassociated = await associatedRuntime.resolve('script.unassociated', {}, { accountId: 'test', userId: 'test' });
    assert.deepEqual(unassociated.records, [{ hasDatasource: false }]);
    await assert.rejects(
      associatedRuntime.resolve('script.escape', {}, { accountId: 'test', userId: 'test' }),
      /只能查询已关联/,
    );
  }
  console.log('Database configuration, driver deadlines, cleanup, test endpoint and credential-safe results verified.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
