import { Client } from 'pg';

const connectionString = process.argv[2] ?? process.env.DATABASE_URL;

function maskConnectionString(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = '****';
    }
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
  }
}

async function main() {
  if (!connectionString) {
    console.error('Missing database URL.');
    console.error('Usage: pnpm db:test "<postgresql://user:password@host:5432/database>"');
    console.error('Or set DATABASE_URL before running: pnpm db:test');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  console.log(`Testing PostgreSQL connection: ${maskConnectionString(connectionString)}`);

  try {
    await client.connect();

    const result = await client.query<{
      database: string;
      user_name: string;
      server_time: Date;
      version: string;
    }>(`
      select
        current_database() as database,
        current_user as user_name,
        now() as server_time,
        version() as version
    `);

    const row = result.rows[0];

    console.log('Connection successful.');
    console.log(`Database: ${row.database}`);
    console.log(`User: ${row.user_name}`);
    console.log(`Server time: ${row.server_time}`);
    console.log(`PostgreSQL: ${row.version}`);
  } catch (error) {
    console.error('Connection failed.');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main();
