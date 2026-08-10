import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import {
  assertLowCodeGridTableAssociations,
  assertPlanningConsoleAggregateSources,
  inspectLowCodeGridTableAssociations,
  inspectPlanningConsoleAggregateSources
} from './lowcode-grid-table-associations';

async function main() {
  const env = getEnv();
  const rawConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const audit = await inspectLowCodeGridTableAssociations(client);
    const planningSources = await inspectPlanningConsoleAggregateSources(client);
    console.log(JSON.stringify({
      grids: process.argv.includes('--all') ? audit.grids : undefined,
      totalGrids: audit.totalGrids,
      associatedGrids: audit.associatedGrids,
      unresolvedGrids: audit.unresolvedGrids,
      unknownUnresolvedGrids: audit.unknownUnresolvedGrids,
      invalidAssociations: audit.invalidAssociations,
      prefixedAssociations: audit.prefixedAssociations,
      optionCount: audit.optionCount,
      prefixedOptionCount: audit.prefixedOptionCount,
      versionMismatchCount: audit.versionMismatchCount,
      nullBlockCount: audit.nullBlockCount,
      unexpectedSourceTypeCount: audit.unexpectedSourceTypeCount,
      planningConsoleAggregateSources: planningSources
    }, null, 2));

    if (process.argv.includes('--verify')) {
      assertLowCodeGridTableAssociations(audit);
      assertPlanningConsoleAggregateSources(planningSources);
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
