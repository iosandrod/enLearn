import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.TRIGGER_DATABASE_URL;
  const projectName = process.env.TRIGGER_PROJECT_NAME ?? 'enlearn-workflow-local';
  const schema = process.env.TRIGGER_DATABASE_SCHEMA ?? schemaFromUrl(databaseUrl) ?? 'public';
  if (!databaseUrl) throw new Error('TRIGGER_DATABASE_URL is required.');

  const client = new Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  try {
    await client.connect();
    const schemaExists = await client.query<{ exists: boolean }>(
      'select exists (select 1 from pg_namespace where nspname = $1) as exists',
      [schema]
    );
    if (!schemaExists.rows[0]?.exists) throw new Error(`Database schema does not exist: ${schema}`);
    await client.query("select set_config('search_path', $1, false)", [
      `"${schema.replaceAll('"', '""')}"`
    ]);
    const result = await client.query<{ externalRef: string }>(
      `select "externalRef"
      from "Project"
      where "name" = $1 and "deletedAt" is null
      order by "createdAt" asc
      limit 1`,
      [projectName]
    );
    if (!result.rows[0]) process.exitCode = 2;
    else process.stdout.write(result.rows[0].externalRef);
  } finally {
    await client.end();
  }
}

function normalizeDatabaseUrl(value: string) {
  const url = new URL(value);
  for (const parameter of ['schema', 'connection_limit', 'pool_timeout', 'connection_timeout']) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

function schemaFromUrl(value: string | undefined) {
  if (!value) return undefined;
  return new URL(value).searchParams.get('schema') ?? undefined;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
