import assert from 'node:assert/strict';
import { buildPlanningStructurePagesMigrationSql } from './generate-planning-structure-pages-migration';

const migration = buildPlanningStructurePagesMigrationSql();
assert.match(migration, /where code = 'planning-1'/);
assert.match(migration, /'planning-routing-view'/);
assert.match(migration, /'planning-bom-view'/);
assert.match(migration, /'planning_routing_view'/);
assert.match(migration, /'planning_bom_view'/);
assert.match(migration, /'planning\.models\.view'/);
assert.match(migration, /planning_operationmaterial/);
assert.match(migration, /planning_operationresource/);
assert.match(migration, /planning_suboperation/);
assert.match(migration, /planning_operation_dependency/);
assert.match(migration, /rowCurrentChange/);
assert.match(migration, /requiredFilters/);
assert.match(migration, /operationId/);

console.log('planning structure page migration tests passed');
