import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const finalMigration = '20260813150000_ai_assistant.sql';
const legacyTables = [
  'lead_events',
  'courses',
  'course_sections',
  'lessons',
  'course_enrollments',
  'lesson_progress',
  'ai_scenarios',
  'speech_assessments',
  'teachers',
  'chat_sessions',
  'campuses',
  'trial_classes',
  'trial_bookings',
  'consultant_tasks',
  'conversion_records'
] as const;
const currentCommentTables = [
  'ai_conversations',
  'ai_messages',
  'chat_messages',
  'users'
] as const;

async function main() {
  const url = process.env.AI_TEST_DATABASE_URL;
  if (!url) throw new Error('AI_TEST_DATABASE_URL is required.');

  const repoRoot = resolve(process.cwd(), '..');
  const migrationDirectory = resolve(repoRoot, 'supabase', 'migrations');
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name) && name <= finalMigration)
    .sort();

  assert.equal(migrations.at(-1), finalMigration);
  assert.ok(migrations.includes('20260721093000_application_profile_foundation.sql'));
  assert.ok(migrations.includes('20260721103000_application_profile_foundation_marker.sql'));
  assert.ok(!migrations.some((name) => name.includes('english_training')));

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query('begin');
    await client.query(`
      create schema if not exists auth;
      create schema if not exists storage;

      do $bootstrap$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role;
        end if;
      end
      $bootstrap$;

      create table if not exists auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );

      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $function$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $function$;

      create or replace function auth.role()
      returns text
      language sql
      stable
      as $function$
        select coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          current_user
        )
      $function$;

      create table if not exists storage.buckets (
        id text primary key,
        name text not null unique,
        public boolean not null default false,
        file_size_limit bigint
      );

      create table if not exists storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets(id) on delete cascade,
        name text not null,
        owner uuid,
        metadata jsonb,
        created_at timestamptz not null default now()
      );

      create or replace function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      as $function$
        select string_to_array(name, '/')
      $function$;

      insert into auth.users (id, email, raw_user_meta_data)
      values (
        '00000000-0000-4000-8000-000000000002',
        'migration-chain@example.test',
        '{"full_name":"Migration Chain"}'::jsonb
      );
    `);

    for (const migration of migrations) {
      try {
        await client.query(await readFile(resolve(migrationDirectory, migration), 'utf8'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${migration}: ${message}`, { cause: error });
      }
    }

    const verification = await client.query<{
      account_id_exists: boolean;
      legacy_tables_exist: boolean;
      legacy_profile_columns_exist: boolean;
      temporary_tables_exist: boolean;
      legacy_entity_metadata_exists: boolean;
      invalid_comments: number;
    }>(`
      select
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'ai_conversations'
            and column_name = 'account_id'
        ) as account_id_exists,
        exists (
          select 1
          from unnest($1::text[]) legacy(table_name)
          where to_regclass('public.' || legacy.table_name) is not null
        ) as legacy_tables_exist,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'users'
            and column_name in (
              'city', 'english_level', 'learning_goal', 'source_channel',
              'lead_status', 'assigned_consultant_id'
            )
        ) as legacy_profile_columns_exist,
        to_regclass('public.ai_assistant_conversations') is not null
          or to_regclass('public.ai_assistant_messages') is not null as temporary_tables_exist,
        exists (
          select 1
          from public.entity_design_tables tables
          where tables.schema_name = 'public'
            and tables.table_name = any($1::text[])
        ) as legacy_entity_metadata_exists,
        (
          select count(*)::integer
          from pg_class classes
          join pg_namespace namespaces on namespaces.oid = classes.relnamespace
          cross join lateral (
            select obj_description(classes.oid, 'pg_class')::jsonb as metadata
          ) comments
          where namespaces.nspname = 'public'
            and classes.relkind in ('r', 'p')
            and classes.relname = any($2::text[])
            and (
              jsonb_typeof(comments.metadata) is distinct from 'object'
              or jsonb_typeof(comments.metadata -> 'title') is distinct from 'string'
              or nullif(btrim(comments.metadata ->> 'title'), '') is null
              or jsonb_typeof(comments.metadata -> 'description') is distinct from 'string'
              or nullif(btrim(comments.metadata ->> 'description'), '') is null
              or jsonb_typeof(comments.metadata -> 'relation') is distinct from 'array'
            )
        ) as invalid_comments
    `, [legacyTables, currentCommentTables]);

    assert.deepEqual(verification.rows[0], {
      account_id_exists: true,
      legacy_tables_exist: false,
      legacy_profile_columns_exist: false,
      temporary_tables_exist: false,
      legacy_entity_metadata_exists: false,
      invalid_comments: 0
    });

    console.log(`AI assistant full migration chain passed (${migrations.length} migrations)`);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

void main();
