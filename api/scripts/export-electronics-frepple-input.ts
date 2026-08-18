import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PlanningDataLoader } from '../src/planning-service/execution/planning-data-loader';
import { buildFreppleInput } from '../src/planning-service/execution/frepple-input.builder';
import { resolvePlanningParameters } from '../src/planning-service/execution/planning-parameters';

async function main() {
  const env = getEnv();
  const configured = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!configured?.trim()) throw new Error('DATABASE_URL or DIRECT_URL is required.');
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(configured),
    connectionTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false }
  });
  try {
    const snapshot = await new PlanningDataLoader(pool).load('00000000-0000-4000-8000-000000000001');
    const input = buildFreppleInput(snapshot, resolvePlanningParameters(snapshot, {
      currentdate: '2026-08-10T00:00:00.000Z'
    }));
    await writeFile('../artifacts/electronics-frepple-request.json', JSON.stringify(input.request));
  } finally {
    await pool.end();
  }
}

void main();
