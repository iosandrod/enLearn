import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  createPlanningPool,
  resolvePlanningConnectionString
} from './planning-data-loader';

function connectionStringTests() {
  const resolved = new URL(resolvePlanningConnectionString(
    'postgresql://postgres.projectref:p%40ss@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' +
    '?pgbouncer=true&sslmode=require&uselibpqcompat=true&application_name=planning'
  ));
  assert.equal(resolved.hostname, 'db.projectref.supabase.co');
  assert.equal(resolved.port, '5432');
  assert.equal(resolved.username, 'postgres');
  assert.equal(resolved.password, 'p%40ss');
  assert.equal(resolved.searchParams.has('pgbouncer'), false);
  assert.equal(resolved.searchParams.has('sslmode'), false);
  assert.equal(resolved.searchParams.has('uselibpqcompat'), false);
  assert.equal(resolved.searchParams.get('application_name'), 'planning');

  const direct = new URL(resolvePlanningConnectionString(
    'postgresql://application:secret@database.internal:5433/enlearn?sslmode=require'
  ));
  assert.equal(direct.hostname, 'database.internal');
  assert.equal(direct.port, '5433');
  assert.equal(direct.username, 'application');
  assert.equal(direct.searchParams.has('sslmode'), false);

  assert.equal(resolvePlanningConnectionString('not-a-postgres-url'), 'not-a-postgres-url');
}

async function poolErrorHandlingTests() {
  const previousPlanningDatabaseUrl = process.env.PLANNING_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDirectUrl = process.env.DIRECT_URL;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  delete process.env.PLANNING_DATABASE_URL;
  delete process.env.DATABASE_URL;
  process.env.DIRECT_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/enlearn';
  console.warn = (...values: unknown[]) => warnings.push(values.map(String).join(' '));
  const pool = createPlanningPool();
  try {
    assert.ok(pool.listenerCount('error') > 0, 'The planning pool must handle idle connection errors.');

    const client = new EventEmitter();
    pool.emit('connect', client as never);
    assert.ok(client.listenerCount('error') > 0, 'Connected clients must have an error listener.');
    assert.doesNotThrow(() => client.emit('error', new Error('simulated client failure')));
    assert.doesNotThrow(() => pool.emit('error', new Error('simulated idle failure'), client as never));
    assert.ok(
      warnings.some((message) => message.includes('discarded a failed idle connection')),
      `The planning pool did not report the simulated idle failure: ${JSON.stringify(warnings)}`
    );
  } finally {
    await pool.end();
    console.warn = originalWarn;
    if (previousPlanningDatabaseUrl === undefined) delete process.env.PLANNING_DATABASE_URL;
    else process.env.PLANNING_DATABASE_URL = previousPlanningDatabaseUrl;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousDirectUrl === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = previousDirectUrl;
  }
}

async function pooledDatabasePreferenceTests() {
  const previousPlanningDatabaseUrl = process.env.PLANNING_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDirectUrl = process.env.DIRECT_URL;
  delete process.env.PLANNING_DATABASE_URL;
  process.env.DATABASE_URL =
    'postgresql://postgres.projectref:p%40ss@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres' +
    '?pgbouncer=true&sslmode=require&uselibpqcompat=true&application_name=planning';
  process.env.DIRECT_URL = 'postgresql://postgres:postgres@db.projectref.supabase.co:5432/postgres';

  const pool = createPlanningPool();
  try {
    const resolved = new URL(String(pool.options.connectionString));
    assert.equal(resolved.hostname, 'aws-0-ap-southeast-1.pooler.supabase.com');
    assert.equal(resolved.port, '6543');
    assert.equal(resolved.username, 'postgres.projectref');
    assert.equal(resolved.searchParams.has('pgbouncer'), false);
    assert.equal(resolved.searchParams.has('sslmode'), false);
    assert.equal(resolved.searchParams.has('uselibpqcompat'), false);
    assert.equal(resolved.searchParams.get('application_name'), 'planning');
  } finally {
    await pool.end();
    if (previousPlanningDatabaseUrl === undefined) delete process.env.PLANNING_DATABASE_URL;
    else process.env.PLANNING_DATABASE_URL = previousPlanningDatabaseUrl;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousDirectUrl === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = previousDirectUrl;
  }
}

async function sessionPoolPreferenceTests() {
  const previousPlanningDatabaseUrl = process.env.PLANNING_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDirectUrl = process.env.DIRECT_URL;
  delete process.env.PLANNING_DATABASE_URL;
  process.env.DATABASE_URL =
    'postgresql://postgres.projectref:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
  process.env.DIRECT_URL =
    'postgresql://postgres.projectref:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres' +
    '?sslmode=require&application_name=planning-session';

  const pool = createPlanningPool();
  try {
    const resolved = new URL(String(pool.options.connectionString));
    assert.equal(resolved.hostname, 'aws-0-ap-southeast-1.pooler.supabase.com');
    assert.equal(resolved.port, '5432');
    assert.equal(resolved.username, 'postgres.projectref');
    assert.equal(resolved.searchParams.has('sslmode'), false);
    assert.equal(resolved.searchParams.get('application_name'), 'planning-session');
  } finally {
    await pool.end();
    if (previousPlanningDatabaseUrl === undefined) delete process.env.PLANNING_DATABASE_URL;
    else process.env.PLANNING_DATABASE_URL = previousPlanningDatabaseUrl;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousDirectUrl === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = previousDirectUrl;
  }
}

async function main() {
  connectionStringTests();
  await pooledDatabasePreferenceTests();
  await sessionPoolPreferenceTests();
  await poolErrorHandlingTests();
  console.log('planning database connection resolution and error handling tests passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
