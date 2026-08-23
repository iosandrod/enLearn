import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const SAMPLE_ID = process.argv[2] ?? '83986705-e24a-4e90-b240-0b0da99005f2';
const TIME_FIELDS = ['startdate', 'enddate', 'created_at', 'updated_at'] as const;

function normalizeTimestamp(value: unknown) {
  if (value == null) return null;
  return String(value)
    .replace('T', ' ')
    .replace(/([+-]\d\d):(\d\d)$/, '$1')
    .replace(/\.0+([+-]\d\d)$/, '$1');
}

function directProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (match && url.hostname.includes('.pooler.supabase.com')) {
    url.hostname = `db.${match[1]}.supabase.co`;
    url.port = '5432';
    url.username = 'postgres';
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const env = getEnv();
  const supabaseUrl =
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
  const supabaseKey =
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const rawConnectionString =
    process.env.DIRECT_URL?.trim() ?? env.DIRECT_URL ?? env.DATABASE_URL;

  if (!supabaseUrl?.trim() || !supabaseKey?.trim()) {
    throw new Error('SUPABASE_URL and a Supabase key are required.');
  }
  if (!rawConnectionString?.trim()) {
    throw new Error('DIRECT_URL or DATABASE_URL is required.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: apiRow, error } = await supabase
    .from('planning_operationplan')
    .select('id,startdate,enddate,created_at,updated_at')
    .eq('id', SAMPLE_ID)
    .maybeSingle();
  if (error) throw error;

  const direct = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  direct.on('error', () => undefined);
  await direct.connect();
  try {
    const result = await direct.query(
      `
        select
          current_setting('TimeZone') as timezone,
          id,
          startdate::text as startdate,
          enddate::text as enddate,
          created_at::text as created_at,
          updated_at::text as updated_at
        from public.planning_operationplan
        where id = $1
      `,
      [SAMPLE_ID]
    );
    const dbRow = result.rows[0] ?? null;

    const normalizedMatches = Object.fromEntries(
      TIME_FIELDS.map((field) => [
        field,
        normalizeTimestamp(apiRow?.[field]) === normalizeTimestamp(dbRow?.[field])
      ])
    );

    console.log(JSON.stringify({
      sampleId: SAMPLE_ID,
      api: apiRow,
      direct: dbRow,
      rawStringMatches: {
        rowFound: Boolean(apiRow) && Boolean(dbRow),
        startdate: apiRow?.startdate === dbRow?.startdate,
        enddate: apiRow?.enddate === dbRow?.enddate,
        created_at: apiRow?.created_at === dbRow?.created_at,
        updated_at: apiRow?.updated_at === dbRow?.updated_at
      },
      normalizedMatches: {
        rowFound: Boolean(apiRow) && Boolean(dbRow),
        ...normalizedMatches
      }
    }, null, 2));
  } finally {
    await direct.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
