import assert from 'node:assert/strict';

import {
  PLANNING_BOM_PAGE_CODE,
  PLANNING_BOM_PAGE_SCHEMA,
  PLANNING_BOM_ROUTE,
  PLANNING_ROUTING_PAGE_CODE,
  PLANNING_ROUTING_PAGE_SCHEMA,
  PLANNING_ROUTING_ROUTE,
  PLANNING_ROUTE_DESIGNER_PAGE_CODE,
  PLANNING_ROUTE_DESIGNER_PAGE_SCHEMA,
  PLANNING_ROUTE_DESIGNER_ROUTE,
  PLANNING_STRUCTURE_ROUTES
} from './planning-structure-pages.schema';
import {
  assertValidLowCodePageSchema,
  isRecord,
  normalizeLowCodePageSchema
} from '../lowcode-service/lowcode.schema';

function flattenBlocks(blocks: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(blocks)) return [];

  return blocks.filter(isRecord).flatMap((block) => [
    block,
    ...flattenBlocks(block.blocks),
    ...(Array.isArray(block.tabs)
      ? block.tabs.filter(isRecord).flatMap((tab) => flattenBlocks(tab.blocks))
      : [])
  ]);
}

for (const [input, code, route, visualKind, sourceKey] of [
  [PLANNING_ROUTING_PAGE_SCHEMA, PLANNING_ROUTING_PAGE_CODE, PLANNING_ROUTING_ROUTE, 'planningFlow', 'flow'],
  [PLANNING_BOM_PAGE_SCHEMA, PLANNING_BOM_PAGE_CODE, PLANNING_BOM_ROUTE, 'planningBom', 'bom']
] as const) {
  const schema = normalizeLowCodePageSchema(input);
  const issues = assertValidLowCodePageSchema(schema);
  assert.equal(issues.filter((issue) => issue.level === 'error').length, 0);
  assert.equal(schema.code, code);
  assert.equal(schema.route, route);
  assert.equal(schema.dataSources?.[sourceKey]?.sourceType, 'custom');
  assert.equal(schema.dataSources?.[sourceKey]?.serviceMethod, 'getPlanningConsoleData');
  assert.ok(flattenBlocks(schema.blocks).some((block) => block.kind === visualKind));
  const filter = schema.blocks.find((block) => block.kind === 'searchForm');
  assert.ok(filter);
  const filterSchema = filter?.schema as Record<string, unknown> | undefined;
  const fields = Array.isArray(filterSchema?.fields)
    ? filterSchema.fields as Array<Record<string, unknown>>
    : [];
  assert.ok(fields.length > 0);
  for (const field of fields) {
    const events = field.events as Record<string, unknown> | undefined;
    const change = Array.isArray(events?.change)
      ? events.change as Array<Record<string, unknown>>
      : [];
    assert.ok(change.some((directive) =>
      directive.type === 'refreshDataSources' &&
      Array.isArray(directive.sourceKeys) &&
      directive.sourceKeys.includes(sourceKey)
    ));
  }
}

const routingSchema = normalizeLowCodePageSchema(PLANNING_ROUTING_PAGE_SCHEMA);
const routingBlocks = flattenBlocks(routingSchema.blocks);
const routingGrid = routingBlocks.find((block) => block.id === 'planning_routing_grid');
assert.equal(routingGrid?.kind, 'grid');
assert.equal(routingGrid?.tableType, 'main');
assert.equal(routingGrid?.sourceKey, 'routingOperations');

const routingGridSchema = isRecord(routingGrid?.schema) ? routingGrid.schema : {};
const routingGridEvents = isRecord(routingGridSchema.events) ? routingGridSchema.events : {};
const rowCurrentChange = Array.isArray(routingGridEvents.rowCurrentChange)
  ? routingGridEvents.rowCurrentChange.filter(isRecord)
  : [];
assert.deepEqual(
  rowCurrentChange.map((directive) => directive.sourceKey),
  ['routingSuboperations', 'routingMaterials', 'routingResources', 'routingDependencies', 'flow']
);
assert.ok(rowCurrentChange.slice(0, -1).every((directive) =>
  directive.type === 'setSearchFilters' &&
  isRecord(directive.values) &&
  directive.values.operation_id === '{{ event.row.id }}'
));
const flowDirective = rowCurrentChange.at(-1);
assert.equal(flowDirective?.type, 'setSearchFilters');
assert.ok(isRecord(flowDirective?.values));
assert.equal(flowDirective.values.operationId, '{{ event.row.id }}');

const flowSource = routingSchema.dataSources?.flow;
assert.equal(flowSource?.autoLoad, false);
assert.deepEqual(flowSource?.postData?.filters, {
  itemId: '{{ forms.planning_routing_filter.itemId }}',
  resourceId: '{{ forms.planning_routing_filter.resourceId }}',
  operationId: '__none__'
});
assert.deepEqual(flowSource?.postData?.requiredFilters, ['operationId']);

const routingFilter = routingBlocks.find((block) => block.id === 'planning_routing_filter');
assert.deepEqual(routingFilter?.initialValues, { itemId: '', resourceId: '' });
const routingFilterSchema = isRecord(routingFilter?.schema) ? routingFilter.schema : {};
assert.equal(routingFilterSchema.columns, 2);
const routingFilterFields = Array.isArray(routingFilterSchema.fields)
  ? routingFilterSchema.fields.filter(isRecord)
  : [];
assert.deepEqual(
  routingFilterFields.map((field) => field.field),
  ['itemId', 'resourceId']
);
assert.equal(routingSchema.dataSources?.operationOptions, undefined);

for (const [sourceKey, resource, gridId] of [
  ['routingSuboperations', 'planning_suboperation', 'planning_routing_suboperations_grid'],
  ['routingMaterials', 'planning_operationmaterial', 'planning_routing_materials_grid'],
  ['routingResources', 'planning_operationresource', 'planning_routing_resources_grid'],
  ['routingDependencies', 'planning_operation_dependency', 'planning_routing_dependencies_grid']
] as const) {
  const source = routingSchema.dataSources?.[sourceKey];
  assert.equal(source?.sourceType, 'custom');
  assert.equal(source?.serviceName, 'planning');
  assert.equal(source?.serviceMethod, 'listItems');
  assert.equal(source?.autoLoad, false);
  assert.equal(source?.postData?.resource, resource);
  assert.equal(source?.postData?.tableName, resource);
  assert.deepEqual(source?.postData?.filters, { operation_id: '__none__' });
  assert.deepEqual(source?.postData?.requiredFilters, ['operation_id']);

  const detail = routingBlocks.find((block) => block.id === gridId);
  assert.equal(detail?.kind, 'grid');
  assert.equal(detail?.tableType, 'detail');
  assert.equal(detail?.sourceKey, sourceKey);
}

assert.equal(routingSchema.dataSources?.routingOperations?.autoLoad, true);
assert.equal(routingSchema.dataSources?.routingOperations?.postData?.resource, 'planning_operation');
assert.ok(routingBlocks.some((block) => block.id === 'planning_routing_flow'));

const routeDesignerSchema = normalizeLowCodePageSchema(PLANNING_ROUTE_DESIGNER_PAGE_SCHEMA);
assert.equal(
  assertValidLowCodePageSchema(routeDesignerSchema).filter((issue) => issue.level === 'error').length,
  0
);
assert.equal(routeDesignerSchema.code, PLANNING_ROUTE_DESIGNER_PAGE_CODE);
assert.equal(routeDesignerSchema.route, PLANNING_ROUTE_DESIGNER_ROUTE);
assert.deepEqual(routeDesignerSchema.blocks.map((block) => block.kind), ['searchForm', 'planningFlow', 'tabs']);
assert.equal(routeDesignerSchema.blocks[0]?.id, 'planning_route_designer_filter');
assert.equal(routeDesignerSchema.blocks[1]?.id, 'planning_route_designer_flow');
assert.equal(routeDesignerSchema.blocks[1]?.sourceKey, 'flow');
assert.equal(routeDesignerSchema.blocks[1]?.height, 560);
assert.equal(routeDesignerSchema.blocks[2]?.id, 'planning_route_designer_detail_tabs');
assert.equal(routeDesignerSchema.dataSources?.flow?.autoLoad, false);
assert.deepEqual(routeDesignerSchema.dataSources?.flow?.postData?.filters, {
  operationId: '{{ forms.planning_route_designer_filter.operationId }}'
});
assert.deepEqual(routeDesignerSchema.dataSources?.flow?.postData?.requiredFilters, ['operationId']);
assert.equal(routeDesignerSchema.dataSources?.routeOptions?.postData?.optionType, 'route');
const routeDesignerFilter = routeDesignerSchema.blocks[0];
assert.deepEqual(routeDesignerFilter?.initialValues, { operationId: '' });
assert.equal(routeDesignerSchema.dataSources?.routingOperations, undefined);
assert.equal(routeDesignerSchema.dataSources?.itemOptions, undefined);
assert.equal(routeDesignerSchema.dataSources?.resourceOptions, undefined);

const routeDesignerTabs = routeDesignerSchema.blocks[2]?.tabs;
assert.ok(Array.isArray(routeDesignerTabs));
assert.deepEqual(routeDesignerTabs?.map((tab: any) => tab.key), [
  'suboperations',
  'materials',
  'resources',
  'dependencies'
]);
const routeDesignerBlocks = flattenBlocks(routeDesignerSchema.blocks);
assert.equal(routeDesignerBlocks.some((block) => block.id === 'planning_route_designer_filter'), true);
assert.equal(routeDesignerBlocks.some((block) => block.id === 'planning_routing_grid'), false);

for (const sourceKey of [
  'routingSuboperations',
  'routingMaterials',
  'routingResources',
  'routingDependencies'
]) {
  assert.equal(routeDesignerSchema.dataSources?.[sourceKey]?.autoLoad, false);
  assert.deepEqual(routeDesignerSchema.dataSources?.[sourceKey]?.postData?.filters, {
    operation_id: '__none__'
  });
}

const routeDesignerHandler = routeDesignerSchema.eventHandlers?.[0];
assert.equal(routeDesignerHandler?.event, 'planningFlow.nodeSelect');
assert.equal(routeDesignerHandler?.blockId, 'planning_route_designer_flow');
assert.deepEqual(
  routeDesignerHandler?.directives.map((directive) => directive.sourceKey),
  ['routingSuboperations', 'routingMaterials', 'routingResources', 'routingDependencies']
);
assert.ok(routeDesignerHandler?.directives.every((directive) =>
  directive.type === 'setSearchFilters' &&
  isRecord(directive.values) &&
  directive.values.operation_id === '{{ event.row.id }}'
));

const routingHandler = PLANNING_ROUTING_PAGE_SCHEMA.eventHandlers?.[0];
assert.equal(routingHandler?.event, 'planningFlow.nodeSelect');
assert.match(String(routingHandler?.directives[0]?.route), /planning\/operation\/edit\?id=\{\{ row\.id \}\}/);

const bomHandler = PLANNING_BOM_PAGE_SCHEMA.eventHandlers?.[0];
assert.equal(bomHandler?.event, 'planningBom.nodeSelect');
assert.match(String(bomHandler?.directives[0]?.route), /planning\/\{\{ row\.entityType \}\}\/edit/);

assert.deepEqual(
  PLANNING_STRUCTURE_ROUTES.map((route) => [route.title, route.sortOrder]),
  [['工艺路线', 70], ['BOM', 80]]
);

console.log('planning structure page schema tests passed');
