import assert from 'node:assert/strict';
import { buildPlanningStructurePagesMigrationSql } from './generate-planning-structure-pages-migration';

const migration = buildPlanningStructurePagesMigrationSql();
assert.match(migration, /where code = 'planning-1'/);
assert.match(migration, /'planning-routing-view'/);
assert.match(migration, /'planning-bom-view'/);
assert.match(migration, /'planning_routing_view'/);
assert.match(migration, /'planning_bom_view'/);
assert.match(migration, /'planning\.models\.view'/);

console.log('planning structure page migration tests passed');
