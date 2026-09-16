import assert from 'node:assert/strict';

import type { ResourceConfigMap } from './base.service';
import type { ServiceContext } from './interfaces/service-executor';
import { AdminService } from '../admin-service/admin.service';
import { readMigratedResourceMetadata } from './service-resource-metadata.spec-helper';

type ServiceWithResources = {
  resources(): ResourceConfigMap;
};

type AdminServiceWithDynamicConfig = ServiceWithResources & {
  buildDynamicCrudConfig(ctx: Record<string, unknown>): Record<string, unknown>;
};

const migratedResources = readMigratedResourceMetadata();
const services = Object.entries(migratedResources).map(([name, resources]) => ({
  constructor: { name },
  resources: () => resources
})) as unknown as ServiceWithResources[];
const lowcodeResources = migratedResources.lowcode;
const workflowResources = migratedResources.workflow;

for (const service of services) {
  for (const [resourceName, config] of Object.entries(service.resources())) {
    const tableName = config.tableName.split('.').at(-1);
    assert.equal(
      resourceName,
      tableName,
      `${service.constructor.name}.${resourceName} must match table ${config.tableName}`
    );
  }
}

const adminResources = migratedResources.admin;
class AdminServiceProbe extends AdminService {
  protected override resources() {
    return adminResources;
  }
}
const adminService = new AdminServiceProbe() as unknown as AdminServiceWithDynamicConfig;
const roleResource = adminResources.admin_roles;
const dynamicRoleConfig = adminService.buildDynamicCrudConfig({
  action: 'create',
  serviceName: 'admin',
  resourceName: 'admin_roles',
  resource: roleResource,
  input: {},
  data: {},
  filters: undefined,
  context: {} as ServiceContext,
  client: {},
  ids: [],
  meta: {}
});
const serializedRole = (
  dynamicRoleConfig.resources as Record<string, Record<string, unknown>>
).admin_roles;
const roleHooks = serializedRole.hooks as Record<string, Array<Record<string, unknown>>>;
assert.equal(
  roleHooks.afterCreate[0]?.function,
  'public.dynamic_crud_sync_role_permissions'
);
assert.deepEqual(roleResource.databaseHookInputFields, ['permission_codes', 'permissionCodes']);

const createConfig = serializedRole.create as Record<string, unknown>;
assert.deepEqual(createConfig.input_allowed_fields, roleResource.create?.allowedFields);
assert.ok((createConfig.allowed_fields as string[]).includes('created_at'));
assert.ok((createConfig.allowed_fields as string[]).includes('created_by'));

assert.equal(adminResources.sales_orders.detailRelations, undefined);
assert.ok(adminResources.sales_order_lines.create);
assert.ok(adminResources.sales_order_lines.update);
assert.ok(adminResources.sales_order_lines.delete);
assert.ok(adminResources.system_option_items.delete);
assert.deepEqual(
  adminResources.system_option_items.databaseHooks?.afterDelete,
  {
    function: 'public.dynamic_crud_prevent_system_row_delete',
    args: { message: 'System option items cannot be deleted.' }
  }
);

const dynamicSalesConfig = adminService.buildDynamicCrudConfig({
  action: 'update',
  serviceName: 'admin',
  resourceName: 'sales_orders',
  resource: adminResources.sales_orders,
  input: {},
  data: {},
  filters: undefined,
  context: {} as ServiceContext,
  client: {},
  ids: [],
  meta: {
    requestDetailRelations: {
      sales_order_lines: {
        resource: 'sales_order_lines',
        foreignKey: 'order_id',
        parentKey: 'id',
        inheritFields: ['account_id'],
        updateMode: 'changes'
      }
    }
  }
});
assert.deepEqual(
  (dynamicSalesConfig.detail_relations as Record<string, unknown>).sales_order_lines,
  {
    resource: 'sales_order_lines',
    foreign_key: 'order_id',
    parent_key: 'id',
    inherit_fields: ['account_id'],
    update_mode: 'changes'
  }
);

const transactionalResources = [
  'admin_roles',
  'admin_routes',
  'admin_entities'
];
for (const resourceName of transactionalResources) {
  assert.equal(adminResources[resourceName]?.transactionalHooks, true);
  assert.ok(adminResources[resourceName]?.databaseHooks);
}
assert.ok(adminResources.admin_routes.databaseHookInputFields?.includes('type'));

assert.equal(lowcodeResources.lowcode_pages.transactionalHooks, true);
assert.equal(
  (lowcodeResources.lowcode_pages.databaseHooks?.beforeCreate as string),
  'public.dynamic_crud_normalize_lowcode_page'
);
assert.ok(
  lowcodeResources.lowcode_pages.create?.allowedFields?.includes('relate_config')
);
assert.ok(
  lowcodeResources.lowcode_pages.update?.allowedFields?.includes('relate_config')
);
assert.deepEqual(
  lowcodeResources.lowcode_form_definitions.permissions,
  {
    create: 'lowcode.pages.manage',
    update: 'lowcode.pages.manage',
    delete: 'lowcode.pages.manage'
  }
);
assert.equal(lowcodeResources.lowcode_form_definitions.clientMode, 'user');
assert.ok(
  lowcodeResources.lowcode_form_definitions.create?.allowedFields?.includes('schema')
);
assert.equal(workflowResources.wf_model.transactionalHooks, true);
assert.equal(
  workflowResources.wf_model.databaseHooks?.beforeCreate,
  'public.dynamic_crud_normalize_workflow_model'
);
assert.equal(
  workflowResources.wf_job.databaseHooks?.beforeCreate,
  'public.dynamic_crud_normalize_workflow_job'
);

console.log('resource configuration tests passed');
