import assert from 'node:assert/strict';

import type { ResourceConfigMap } from './base.service';
import type { ServiceContext } from './interfaces/service-executor';
import { AdminService } from '../admin-service/admin.service';
import { ChatService } from '../chat-service/chat.service';
import { EntityDesignService } from '../entity-design-service/entity-design.service';
import { FilesService } from '../files-service/files.service';
import { LowCodeService } from '../lowcode-service/lowcode.service';
import { MesService } from '../mes-service/mes.service';
import { NotificationService } from '../notification-service/notification.service';
import { PostsService } from '../posts-service/posts.service';
import { PlanningService } from '../planning-service/planning.service';
import { workflowResources } from '../workflow/workflow.resources';

type ServiceWithResources = {
  resources(): ResourceConfigMap;
};

type AdminServiceWithDynamicConfig = ServiceWithResources & {
  buildDynamicCrudConfig(ctx: Record<string, unknown>): Record<string, unknown>;
};

const services = [
  new AdminService(),
  new ChatService(),
  new EntityDesignService(),
  new FilesService(),
  new LowCodeService(),
  new MesService(),
  new NotificationService(),
  new PostsService(),
  new PlanningService()
] as unknown as ServiceWithResources[];

const lowcodeService = services[4];

services.push({ resources: () => workflowResources });

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

const adminService = new AdminService() as unknown as AdminServiceWithDynamicConfig;
const adminResources = adminService.resources();
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

assert.equal(
  adminResources.sales_orders.detailRelations?.sales_order_lines?.updateMode,
  'changes'
);
assert.ok(adminResources.sales_order_lines.create);
assert.ok(adminResources.sales_order_lines.update);
assert.ok(adminResources.sales_order_lines.delete);

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

const lowcodeResources = lowcodeService.resources();
assert.equal(lowcodeResources.lowcode_pages.transactionalHooks, true);
assert.equal(
  (lowcodeResources.lowcode_pages.databaseHooks?.beforeCreate as string),
  'public.dynamic_crud_normalize_lowcode_page'
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
