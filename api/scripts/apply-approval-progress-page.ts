import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const migrationFile = 'supabase/migrations/20260805090000_approval_progress_management.sql';

function getRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'supabase/migrations'))) return cwd;

  const parent = resolve(cwd, '..');
  if (existsSync(resolve(parent, 'supabase/migrations'))) return parent;

  throw new Error('Could not find supabase/migrations from the current directory.');
}

function readDotEnv(filePath: string) {
  if (!existsSync(filePath)) return {};

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function readPageSchema(migrationSource: string) {
  const match = migrationSource.match(/\$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/);
  if (!match) throw new Error('Could not read the approval progress page schema.');
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function assertResult(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function main() {
  const repoRoot = getRepoRoot();
  const env = {
    ...readDotEnv(resolve(repoRoot, '.env')),
    ...readDotEnv(resolve(repoRoot, '.env.local'))
  };
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    env.SUPABASE_URL ??
    env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const migrationSource = readFileSync(resolve(repoRoot, migrationFile), 'utf8');
  const schema = readPageSchema(migrationSource);
  const now = new Date().toISOString();

  const existingPageResult = await supabase
    .from('lowcode_pages')
    .select('id, version')
    .eq('code', 'approval-progress')
    .maybeSingle();
  assertResult(existingPageResult.error, 'Read approval progress page');

  const existingPage = existingPageResult.data;
  const version = Number(existingPage?.version ?? 0) + 1;
  const pagePayload = {
    code: 'approval-progress',
    route: '/dashboard/approval/progress',
    title: '\u5ba1\u6279\u8fdb\u5ea6\u7ba1\u7406',
    description: '\u5ba1\u6279\u5b9e\u4f8b\u3001\u8282\u70b9\u5b9e\u4f8b\u4e0e\u5ba1\u6279\u4efb\u52a1\u67e5\u8be2\u3002',
    page_type: 'list',
    layout: 'dashboard',
    status: 'published',
    keep_alive: true,
    schema,
    version,
    published_at: now,
    updated_at: now
  };

  const pageResult = existingPage
    ? await supabase
        .from('lowcode_pages')
        .update(pagePayload)
        .eq('id', existingPage.id)
        .select('id, code, route, page_type, version')
        .single()
    : await supabase
        .from('lowcode_pages')
        .insert(pagePayload)
        .select('id, code, route, page_type, version')
        .single();
  assertResult(pageResult.error, 'Save approval progress page');
  if (!pageResult.data) throw new Error('Approval progress page was not returned after save.');

  const versionResult = await supabase.from('lowcode_page_versions').upsert(
    {
      page_id: pageResult.data.id,
      version,
      schema,
      published_at: now
    },
    { onConflict: 'page_id,version' }
  );
  assertResult(versionResult.error, 'Save approval progress page version');

  const entityResult = await supabase.from('admin_entities').upsert(
    [
      {
        code: 'wf_process_instance',
        title: '\u5ba1\u6279\u5b9e\u4f8b',
        table_name: 'public.wf_process_instance',
        route_path: '/dashboard/approval/progress',
        page_code: 'approval-progress',
        icon: 'ri-route-line',
        description: 'Workflow process instances shown as the approval progress master records.',
        primary_key: 'id',
        status: 'active',
        sort_order: 220,
        schema: {},
        updated_at: now
      },
      {
        code: 'wf_node_instance',
        title: '\u8282\u70b9\u5b9e\u4f8b',
        table_name: 'public.wf_node_instance',
        route_path: '/dashboard/approval/progress/nodes',
        page_code: null,
        icon: 'ri-node-tree',
        description: 'Workflow node instances associated with an approval process instance.',
        primary_key: 'id',
        status: 'active',
        sort_order: 221,
        schema: {},
        updated_at: now
      },
      {
        code: 'wf_task',
        title: '\u5ba1\u6279\u4efb\u52a1',
        table_name: 'public.wf_task',
        route_path: '/dashboard/approval/progress/tasks',
        page_code: null,
        icon: 'ri-task-line',
        description: 'Workflow approval tasks associated with an approval process instance.',
        primary_key: 'id',
        status: 'active',
        sort_order: 222,
        schema: {},
        updated_at: now
      }
    ],
    { onConflict: 'code' }
  );
  assertResult(entityResult.error, 'Register approval progress entities');

  const parentResult = await supabase
    .from('admin_routes')
    .select('id, code, metadata')
    .eq('code', 'approval-management-root')
    .single();
  assertResult(parentResult.error, 'Read Approval Management route');
  if (!parentResult.data) throw new Error('Approval Management route was not found.');

  const parentMetadata =
    parentResult.data.metadata && typeof parentResult.data.metadata === 'object'
      ? parentResult.data.metadata
      : {};
  const parentUpdateResult = await supabase
    .from('admin_routes')
    .update({ metadata: { ...parentMetadata, navigation: 'sidebar' }, updated_at: now })
    .eq('id', parentResult.data.id);
  assertResult(parentUpdateResult.error, 'Update Approval Management navigation');

  const routeResult = await supabase
    .from('admin_routes')
    .upsert(
      {
        code: 'approval-progress',
        title: '\u5ba1\u6279\u8fdb\u5ea6\u7ba1\u7406',
        path: '/dashboard/approval/progress',
        parent_id: parentResult.data.id,
        route_type: 'page',
        icon: 'ri-route-line',
        page_code: 'approval-progress',
        permission_code: 'workflow.runtime.manage',
        visible: true,
        keep_alive: true,
        layout: 'dashboard',
        status: 'active',
        sort_order: 20,
        metadata: { group: 'approval', category: 'runtime' },
        updated_at: now
      },
      { onConflict: 'code' }
    )
    .select('code, parent_id')
    .single();
  assertResult(routeResult.error, 'Save approval progress menu route');

  const permissionResult = await supabase
    .from('admin_permissions')
    .select('id')
    .eq('code', 'workflow.runtime.manage')
    .single();
  assertResult(permissionResult.error, 'Read workflow runtime permission');
  if (!permissionResult.data) throw new Error('Workflow runtime permission was not found.');

  const roleResult = await supabase
    .from('admin_roles')
    .select('id')
    .in('code', ['system_admin', 'operations_admin']);
  assertResult(roleResult.error, 'Read approval progress roles');

  const rolePermissionRows = (roleResult.data ?? []).map((role) => ({
    role_id: role.id,
    permission_id: permissionResult.data.id
  }));
  if (rolePermissionRows.length) {
    const rolePermissionResult = await supabase
      .from('admin_role_permissions')
      .upsert(rolePermissionRows, { onConflict: 'role_id,permission_id' });
    assertResult(rolePermissionResult.error, 'Grant approval progress permission');
  }

  console.log(
    JSON.stringify({
      code: pageResult.data.code,
      route: pageResult.data.route,
      page_type: pageResult.data.page_type,
      menu_code: routeResult.data?.code,
      parent_code: parentResult.data.code,
      entity_count: 3
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
