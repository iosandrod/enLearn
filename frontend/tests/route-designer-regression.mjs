import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const routeDesignerVue = new URL('../pages/dashboard/planning/route-designer.vue', import.meta.url);
await assert.rejects(
  access(routeDesignerVue),
  (error) => error?.code === 'ENOENT',
  'The route designer must not have a dedicated frontend Vue page.',
);

const [routerSource, dynamicPageSource, flowSource, schemaSource, migrationSource, generatorSource, applyServiceSource, planningServiceSource] = await Promise.all([
  readFile(new URL('../src/router.ts', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/[...slug].vue', import.meta.url), 'utf8'),
  readLowCodeMaterialSource('page', 'planningFlow'),
  readFile(new URL('../../api/src/planning-service/planning-structure-pages.schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260902090000_planning_route_designer_lowcode_page.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../api/scripts/generate-planning-route-designer-migration.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../api/scripts/apply-planning-service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../api/src/planning-service/planning.service.ts', import.meta.url), 'utf8'),
]);

assert.doesNotMatch(
  routerSource,
  /route-designer\.vue/,
  'The static router must not import a dedicated route designer page.',
);
assert.doesNotMatch(
  routerSource,
  /path: '\/dashboard\/planning\/route-designer'/,
  'The route designer path must be handled by the database-driven catch-all page.',
);
assert.match(
  routerSource,
  /path: '\/dashboard\/:slug\(\.\*\)\*'/,
  'The dashboard catch-all route must remain available for low-code pages.',
);
assert.match(
  dynamicPageSource,
  /getLowCodePage\(serviceApi, \{[\s\S]*route: props\.routePath/,
  'The target route must load its page definition from the database.',
);
assert.match(flowSource, /node-planning-container/);
assert.match(flowSource, /containers\?: Record<string, unknown>\[\]/);
assert.match(flowSource, /parentOperationPath/);
assert.match(flowSource, /viewMode = ref<'lanes' \| 'graph'>\('graph'\)/);
assert.match(flowSource, /parentOperationId/);
assert.match(flowSource, /nodes-draggable="true"/);
assert.match(flowSource, /@node-drag-stop="handleNodeDragStop"/);
assert.match(flowSource, /flowContainers\.value\.filter\(\(container\) =>/);
assert.match(flowSource, /@contextmenu\.stop\.prevent="openContextMenu/);
assert.match(flowSource, /isParallel/);
assert.match(flowSource, /getLowCodePage/);
assert.match(flowSource, /planning_operation-edit/);
assert.match(flowSource, /<LowCodeForm/);
assert.match(flowSource, /insertRouteOperation/);
assert.doesNotMatch(flowSource, /resource: 'planning_operation'/);
assert.doesNotMatch(flowSource, /resource: 'planning_suboperation'/);

assert.match(schemaSource, /PLANNING_ROUTE_DESIGNER_PAGE_CODE = 'planning_route_designer'/);
assert.match(schemaSource, /PLANNING_ROUTE_DESIGNER_ROUTE = '\/dashboard\/planning\/route-designer'/);
assert.match(schemaSource, /buildPlanningRouteDesignerPageSchema/);
assert.match(schemaSource, /event: 'planningFlow\.nodeSelect'/);
assert.match(schemaSource, /values: \{ operation_id: '\{\{ event\.row\.id \}\}' \}/);
assert.match(schemaSource, /tabs\.filter\(\(tab\) => tab\.key !== 'flow'\)/);

assert.match(
  migrationSource,
  /insert into public\.lowcode_pages \([\s\S]*'planning_route_designer',[\s\S]*'\/dashboard\/planning\/route-designer'/,
  'The database migration must register the route designer page.',
);
assert.match(migrationSource, /insert into public\.lowcode_page_versions/);
assert.match(migrationSource, /page_code = 'planning_route_designer'/);
assert.match(migrationSource, /jsonb_array_length\(page\.schema->'blocks'\) = 3/);
assert.match(migrationSource, /"blocks":\[\{"id":"planning_route_designer_filter","kind":"searchForm"[\s\S]*?\{"id":"planning_route_designer_flow","kind":"planningFlow"[\s\S]*?\{"id":"planning_route_designer_detail_tabs","kind":"tabs"/);
assert.match(migrationSource, /"routeOptions"/);
assert.match(migrationSource, /"operationId":"\{\{ forms\.planning_route_designer_filter\.operationId \}\}"/);
assert.match(migrationSource, /"flow":\{"key":"flow"[\s\S]*?"autoLoad":true/);
assert.match(migrationSource, /"routingSuboperations"/);
assert.match(migrationSource, /"routingMaterials"/);
assert.match(migrationSource, /"routingResources"/);
assert.match(migrationSource, /"routingDependencies"/);
assert.match(migrationSource, /"event":"planningFlow\.nodeSelect"/);
assert.equal((migrationSource.match(/"type":"setSearchFilters"/g) ?? []).length, 4);
assert.equal((migrationSource.match(/operation_id":"\{\{ event\.row\.id \}\}"/g) ?? []).length, 4);
assert.match(migrationSource, /"searchForm"/);
assert.doesNotMatch(migrationSource, /"routingOperations"/);
assert.doesNotMatch(migrationSource, /"itemOptions"/);
assert.doesNotMatch(migrationSource, /"resourceOptions"/);
assert.doesNotMatch(migrationSource, /"key":"flow","label":"路线图"/);

assert.match(generatorSource, /PLANNING_ROUTE_DESIGNER_PAGE_SCHEMA/);
assert.match(generatorSource, /20260902090000_planning_route_designer_lowcode_page\.sql/);
assert.match(applyServiceSource, /20260902090000_planning_route_designer_lowcode_page\.sql/);
assert.match(applyServiceSource, /route_designer_page/);
assert.doesNotMatch(planningServiceSource, /method === 'getRouteDesignerLayout'/);
assert.doesNotMatch(planningServiceSource, /method === 'saveRouteDesignerLayout'/);

console.log('Database-driven route designer regression test passed.');
