import assert from 'node:assert/strict';

import { PLANNING_CONSOLE_PAGE_SCHEMA } from '../planning-service/planning-console.schema';
import { LowCodeService } from './lowcode.service';

type RuntimeService = {
  applyPlanningRuntimeAccess(schema: Record<string, unknown>, canManage: boolean): void;
};

function cloneSchema() {
  return structuredClone(PLANNING_CONSOLE_PAGE_SCHEMA) as Record<string, unknown>;
}

function flattenedBlocks(schema: Record<string, unknown>) {
  const result: Record<string, unknown>[] = [];
  const visit = (blocks: unknown[]) => {
    for (const value of blocks) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const block = value as Record<string, unknown>;
      result.push(block);
      if (Array.isArray(block.blocks)) visit(block.blocks);
      if (Array.isArray(block.tabs)) {
        for (const tab of block.tabs as Record<string, unknown>[]) {
          if (Array.isArray(tab.blocks)) visit(tab.blocks);
        }
      }
    }
  };
  visit(Array.isArray(schema.blocks) ? schema.blocks : []);
  return result;
}

function actions(schema: Record<string, unknown>) {
  const block = flattenedBlocks(schema).find((candidate) => candidate.id === 'planning_console_actions');
  return Array.isArray(block?.actions) ? block.actions as Record<string, unknown>[] : [];
}

const service = new LowCodeService() as unknown as RuntimeService;

const readOnlySchema = cloneSchema();
service.applyPlanningRuntimeAccess(readOnlySchema, false);
assert.deepEqual(actions(readOnlySchema).map((action) => action.code), ['refresh']);
for (const block of flattenedBlocks(readOnlySchema).filter((candidate) => candidate.kind === 'grid')) {
  const blockSchema = block.schema as Record<string, unknown>;
  assert.deepEqual(blockSchema.rowActions, { edit: false, delete: false, actions: [] });
  const grid = blockSchema.grid as Record<string, unknown>;
  const columns = Array.isArray(grid.columns) ? grid.columns as Record<string, unknown>[] : [];
  assert.equal(columns.some((column) => (
    column.slots as Record<string, unknown> | undefined
  )?.default === 'actions'), false);
}

const managerSchema = cloneSchema();
service.applyPlanningRuntimeAccess(managerSchema, true);
assert.deepEqual(actions(managerSchema).map((action) => action.code), [
  'preflight', 'run', 'cancel', 'publish', 'refresh'
]);

console.log('planning low-code runtime access tests passed');
