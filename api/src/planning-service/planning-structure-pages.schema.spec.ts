import assert from 'node:assert/strict';

import {
  PLANNING_BOM_PAGE_CODE,
  PLANNING_BOM_PAGE_SCHEMA,
  PLANNING_BOM_ROUTE,
  PLANNING_ROUTING_PAGE_CODE,
  PLANNING_ROUTING_PAGE_SCHEMA,
  PLANNING_ROUTING_ROUTE,
  PLANNING_STRUCTURE_ROUTES
} from './planning-structure-pages.schema';
import {
  assertValidLowCodePageSchema,
  normalizeLowCodePageSchema
} from '../lowcode-service/lowcode.schema';

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
  assert.ok(schema.blocks.some((block) => block.kind === visualKind));
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
