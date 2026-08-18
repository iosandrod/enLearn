import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function readDotEnv(filePath: string) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
        return [key, value];
      })
  );
}

async function main() {
  const repoRoot = existsSync(resolve(process.cwd(), 'supabase'))
    ? process.cwd()
    : resolve(process.cwd(), '..');
  const env = {
    ...readDotEnv(resolve(repoRoot, '.env')),
    ...readDotEnv(resolve(repoRoot, '.env.local'))
  };
  const supabaseUrl = process.env.SUPABASE_URL ?? env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const parent = await supabase
    .from('admin_routes')
    .select('id')
    .eq('code', 'approval-management-root')
    .single();
  if (parent.error || !parent.data) {
    throw new Error(parent.error?.message ?? 'Approval Management route was not found.');
  }

  const now = new Date().toISOString();
  const route = await supabase
    .from('admin_routes')
    .upsert({
      code: 'approval-flow-console',
      title: '审批流总控制台',
      path: '/dashboard/approval/console',
      parent_id: parent.data.id,
      route_type: 'page',
      icon: 'ri-dashboard-3-line',
      page_code: null,
      permission_code: 'workflow.runtime.manage',
      visible: true,
      keep_alive: true,
      layout: 'dashboard',
      status: 'active',
      sort_order: 15,
      metadata: { group: 'approval', category: 'runtime', native: true },
      updated_at: now
    }, { onConflict: 'code' })
    .select('code, path')
    .single();
  if (route.error) throw new Error(route.error.message);

  const [permission, roles] = await Promise.all([
    supabase.from('admin_permissions').select('id').eq('code', 'workflow.runtime.manage').single(),
    supabase.from('admin_roles').select('id').in('code', ['system_admin', 'operations_admin'])
  ]);
  if (permission.error || !permission.data) {
    throw new Error(permission.error?.message ?? 'Workflow runtime permission was not found.');
  }
  if (roles.error) throw new Error(roles.error.message);

  const grants = (roles.data ?? []).map((role) => ({
    role_id: role.id,
    permission_id: permission.data.id
  }));
  if (grants.length) {
    const result = await supabase
      .from('admin_role_permissions')
      .upsert(grants, { onConflict: 'role_id,permission_id' });
    if (result.error) throw new Error(result.error.message);
  }

  console.log(JSON.stringify(route.data));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
