import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const tableNames = [
  'ai_conversations',
  'ai_messages',
  'ai_assistant_conversations',
  'ai_assistant_messages',
  'ai_runs',
  'ai_tool_calls',
  'ai_proposals',
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
  'conversion_records',
  'chat_messages'
] as const;

const legacyTableNames = [
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

function connectionString(raw: string) {
  const url = new URL(normalizePostgresConnectionString(raw));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const env = getEnv();
  const raw = env.DIRECT_URL || env.DATABASE_URL;
  if (!raw) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const client = new Client({
    connectionString: connectionString(raw),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000
  });
  await client.connect();

  try {
    const tables = [];
    for (const name of tableNames) {
      const exists = (await client.query<{ exists: boolean }>(
        'select to_regclass($1) is not null as exists',
        [`public.${name}`]
      )).rows[0]?.exists ?? false;
      const count = exists
        ? Number((await client.query<{ count: string }>(
            `select count(*)::bigint as count from public.${name}`
          )).rows[0]?.count ?? 0)
        : null;
      tables.push({ name, exists, count });
    }

    const columns = (await client.query(`
      select table_name, column_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name in (
          'ai_conversations', 'ai_messages',
          'ai_assistant_conversations', 'ai_assistant_messages',
          'chat_messages', 'users'
        )
        and (
          table_name <> 'users'
          or column_name in (
            'role', 'city', 'english_level', 'learning_goal',
            'source_channel', 'lead_status', 'assigned_consultant_id'
          )
        )
      order by table_name, ordinal_position
    `)).rows;
    const foreignKeys = (await client.query(`
      select
        conrelid::regclass::text as source,
        conname,
        confrelid::regclass::text as target
      from pg_constraint
      where contype = 'f'
        and (
          conrelid::regclass::text like 'ai_%'
          or confrelid::regclass::text like 'ai_%'
        )
      order by 1, 2
    `)).rows;
    const roles = (await client.query(`
      select code
      from public.admin_roles
      where code in ('consultant_manager', 'teaching_manager')
      order by code
    `)).rows;
    const chatConstraints = (await client.query(`
      select
        constraints.conname,
        constraints.contype,
        pg_get_constraintdef(constraints.oid) as definition
      from pg_constraint constraints
      where constraints.conrelid = 'public.chat_messages'::regclass
      order by constraints.contype, constraints.conname
    `)).rows;
    const chatPolicies = (await client.query(`
      select policyname, cmd, roles, qual, with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'chat_messages'
      order by policyname
    `)).rows;
    const tableComments = (await client.query(`
      select
        classes.relname as table_name,
        obj_description(classes.oid, 'pg_class')::jsonb ->> 'title' as title,
        obj_description(classes.oid, 'pg_class')::jsonb ->> 'description' as description
      from pg_class classes
      join pg_namespace namespaces on namespaces.oid = classes.relnamespace
      where namespaces.nspname = 'public'
        and classes.relname in ('ai_conversations', 'ai_messages', 'chat_messages', 'users')
      order by classes.relname
    `)).rows;
    const legacyMetadata = (await client.query(`
      with legacy_names as (
        select unnest($1::text[]) as name
      ), metadata as (
        select
          'lowcode_pages'::text as source,
          pages.code as key,
          concat_ws(' | ', pages.route, pages.title, pages.table_name, pages.schema::text) as value
        from public.lowcode_pages pages
        union all
        select
          'admin_entities',
          entities.code,
          concat_ws(
            ' | ', entities.title, entities.table_name, entities.route_path,
            entities.description, entities.schema::text
          )
        from public.admin_entities entities
        union all
        select
          'admin_routes',
          routes.code,
          concat_ws(' | ', routes.title, routes.path, routes.page_code, routes.metadata::text)
        from public.admin_routes routes
        union all
        select
          'entity_design_tables',
          tables.code,
          concat_ws(' | ', tables.schema_name, tables.table_name, tables.title, tables.description)
        from public.entity_design_tables tables
        union all
        select
          'dynamic_crud_resource_registry',
          registry.resource_name,
          concat_ws(' | ', registry.table_name, registry.config::text)
        from public.dynamic_crud_resource_registry registry
        union all
        select
          'system_option_sources',
          sources.code,
          concat_ws(' | ', sources.name, sources.description, sources.source_config::text)
        from public.system_option_sources sources
      )
      select distinct metadata.source, metadata.key, legacy_names.name as matched_name
      from metadata
      join legacy_names
        on lower(metadata.value) like '%' || lower(legacy_names.name) || '%'
      order by metadata.source, metadata.key, legacy_names.name
    `, [legacyTableNames])).rows;
    const conversations = (await client.query(`
      select
        conversations.id,
        conversations.account_id,
        conversations.created_by,
        conversations.title,
        conversations.mode,
        conversations.page_ref,
        conversations.created_at,
        count(distinct messages.id)::integer as message_count,
        coalesce(
          array_agg(distinct runs.request_id order by runs.request_id)
            filter (where runs.request_id is not null),
          '{}'::text[]
        ) as request_ids
      from public.ai_conversations conversations
      left join public.ai_messages messages
        on messages.conversation_id = conversations.id
      left join public.ai_runs runs
        on runs.conversation_id = conversations.id
      group by conversations.id
      order by conversations.created_at, conversations.id
    `)).rows;

    console.log(JSON.stringify({
      tables,
      columns,
      foreignKeys,
      roles,
      chatConstraints,
      chatPolicies,
      tableComments,
      legacyMetadata,
      conversations
    }, null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
