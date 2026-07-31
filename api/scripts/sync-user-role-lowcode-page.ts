import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../..');

function readDotEnv(filePath: string) {
  const text = fs.readFileSync(filePath, 'utf8');
  const env: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
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

async function syncAdminRoutes(supabase: SupabaseClient, now: string) {
  const routePageCodes = [
    'admin-system-home',
    'admin-system-users',
    'admin-system-roles',
    'admin-system-permissions',
    'admin-system-routes',
    'admin-system-entities',
  ];
  const { data: pageRows, error: pageRowsError } = await supabase
    .from('lowcode_pages')
    .select('code')
    .in('code', routePageCodes);

  if (pageRowsError) throw pageRowsError;

  const existingPageCodes = new Set(
    (pageRows ?? []).map((row: { code?: string }) => row.code).filter(Boolean)
  );
  const pageCode = (code: string) => (existingPageCodes.has(code) ? code : null);

  async function upsertRoute(route: Record<string, unknown>) {
    const routeCode = typeof route.code === 'string' ? route.code : '';
    const { data: existingRoute, error: existingRouteError } = routeCode
      ? await supabase
          .from('admin_routes')
          .select('visible, status')
          .eq('code', routeCode)
          .maybeSingle()
      : { data: null, error: null };

    if (existingRouteError) throw existingRouteError;

    const { data, error } = await supabase
      .from('admin_routes')
      .upsert(
        {
          visible: existingRoute?.visible ?? true,
          keep_alive: true,
          layout: 'dashboard',
          status: existingRoute?.status ?? 'active',
          metadata: {},
          updated_at: now,
          ...route,
        },
        { onConflict: 'code' }
      )
      .select('id, code, title, path, parent_id, page_code, permission_code')
      .single();

    if (error) throw error;
    return data as { id: string; code: string; title: string; path: string };
  }

  const businessRoot = await upsertRoute({
    code: 'business-root',
    title: '生产运营',
    path: '/dashboard/business/_group',
    route_type: 'group',
    icon: 'ri-dashboard-line',
    page_code: null,
    permission_code: null,
    sort_order: 10,
    metadata: { group: 'business' },
  });

  const systemRoot = await upsertRoute({
    code: 'system-root',
    title: '系统设置',
    path: '/dashboard/system',
    route_type: 'group',
    icon: 'ri-settings-3-line',
    page_code: pageCode('admin-system-home'),
    permission_code: null,
    sort_order: 20,
    metadata: { group: 'system' },
  });

  const childRoutes = [
    {
      code: 'dashboard-home',
      title: '工作台',
      path: '/dashboard',
      parent_id: businessRoot.id,
      route_type: 'page',
      icon: 'ri-home-2-line',
      page_code: null,
      permission_code: null,
      sort_order: 10,
      metadata: { group: 'business' },
    },
    {
      code: 'lowcode-pages',
      title: '低代码页面管理',
      path: '/dashboard/low-code',
      parent_id: businessRoot.id,
      route_type: 'page',
      icon: 'ri-table-line',
      page_code: null,
      permission_code: 'lowcode.pages.manage',
      sort_order: 20,
      metadata: { group: 'business' },
    },
    {
      code: 'lowcode-visual-designer',
      title: '可视化设计器',
      path: '/dashboard/low-code/designer',
      parent_id: businessRoot.id,
      route_type: 'page',
      icon: 'ri-edit-box-line',
      page_code: null,
      permission_code: 'lowcode.pages.manage',
      sort_order: 30,
      metadata: { group: 'business' },
    },
    {
      code: 'workflow-designer',
      title: '审批流设计器',
      path: '/dashboard/workflow/designer',
      parent_id: businessRoot.id,
      route_type: 'page',
      icon: 'ri-git-branch-line',
      page_code: null,
      permission_code: 'workflow.definitions.manage',
      sort_order: 40,
      metadata: { group: 'business' },
    },
    {
      code: 'system-users',
      title: '用户权限档案',
      path: '/dashboard/system/users',
      parent_id: systemRoot.id,
      route_type: 'page',
      icon: 'ri-user-settings-line',
      page_code: pageCode('admin-system-users'),
      permission_code: 'admin.users.manage',
      sort_order: 20,
      metadata: { group: 'system' },
    },
    {
      code: 'system-roles',
      title: '角色管理',
      path: '/dashboard/system/roles',
      parent_id: systemRoot.id,
      route_type: 'page',
      icon: 'ri-team-line',
      page_code: pageCode('admin-system-roles'),
      permission_code: 'admin.roles.manage',
      sort_order: 30,
      metadata: { group: 'system' },
    },
    {
      code: 'system-permissions',
      title: '权限管理',
      path: '/dashboard/system/permissions',
      parent_id: systemRoot.id,
      route_type: 'page',
      icon: 'ri-key-2-line',
      page_code: pageCode('admin-system-permissions'),
      permission_code: 'admin.permissions.manage',
      sort_order: 40,
      metadata: { group: 'system' },
    },
    {
      code: 'system-routes',
      title: '动态路由',
      path: '/dashboard/system/routes',
      parent_id: systemRoot.id,
      route_type: 'page',
      icon: 'ri-route-line',
      page_code: pageCode('admin-system-routes'),
      permission_code: 'admin.routes.manage',
      sort_order: 50,
      metadata: { group: 'system' },
    },
    {
      code: 'system-entities',
      title: '实体管理',
      path: '/dashboard/system/entities',
      parent_id: systemRoot.id,
      route_type: 'page',
      icon: 'ri-table-2',
      page_code: pageCode('admin-system-entities'),
      permission_code: 'admin.entities.manage',
      sort_order: 60,
      metadata: { group: 'system' },
    },
  ];

  const children = [];
  for (const route of childRoutes) {
    children.push(await upsertRoute(route));
  }

  return {
    roots: [businessRoot, systemRoot],
    children,
  };
}

async function main() {
  const env = readDotEnv(path.join(workspaceRoot, '.env.local'));
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const now = new Date().toISOString();
  const routeResult = await syncAdminRoutes(supabase, now);

  console.log(
    JSON.stringify(
      {
        routes: routeResult,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
