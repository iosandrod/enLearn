import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';

import { PLANNING_CONSOLE_PAGE_SCHEMA } from '../planning-service/planning-console.schema';
import { LowCodeService } from './lowcode.service';

type RuntimeService = {
  applyPlanningRuntimeAccess(schema: Record<string, unknown>, canManage: boolean): void;
  applyMesRuntimeAccess(schema: Record<string, unknown>, canManage: boolean): void;
  preparePageWrite(postData: Record<string, unknown>): Record<string, unknown>;
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

const validPageWrite = service.preparePageWrite({
  resource: 'lowcode_pages',
  data: {
    table_name: 'public.runtime_save_rows',
    schema: {
      schemaVersion: 1,
      code: 'runtime-save-test',
      route: '/dashboard/runtime-save-test',
      title: 'Runtime save test',
      blocks: [],
    },
  },
});
assert.deepEqual(
  (validPageWrite.data as Record<string, unknown>).schema,
  {
    schemaVersion: 1,
    code: 'runtime-save-test',
    route: '/dashboard/runtime-save-test',
    title: 'Runtime save test',
    pageType: 'custom',
    layout: 'dashboard',
    status: 'draft',
    keepAlive: true,
    dataSources: {},
    blocks: [],
  },
);
assert.equal(
  (validPageWrite.data as Record<string, unknown>).table_name,
  'runtime_save_rows',
  'Low-code page writes must omit the public schema from table_name.',
);
assert.deepEqual(
  service.preparePageWrite({
    resource: 'lowcode_pages',
    data: { table_name: ' public.runtime_save_rows ' },
  }),
  {
    resource: 'lowcode_pages',
    data: { table_name: 'runtime_save_rows' },
  },
  'Relation-only page updates must normalize table_name without requiring a schema write.',
);
assert.deepEqual(
  service.preparePageWrite({
    resource: 'lowcode_pages',
    data: { table_name: 'tenant.runtime_save_rows' },
  }),
  {
    resource: 'lowcode_pages',
    data: { table_name: 'tenant.runtime_save_rows' },
  },
  'Non-public schema qualifiers must be preserved.',
);
assert.throws(
  () => service.preparePageWrite({
    resource: 'lowcode_pages',
    data: {
      schema: {
        schemaVersion: 1,
        code: 'invalid-runtime-save-test',
        route: '/dashboard/invalid-runtime-save-test',
        title: 'Invalid runtime save test',
        blocks: [null],
      },
    },
  }),
  /Block must be an object/,
  'Saving a low-code page must reject invalid runtime blocks.',
);
assert.throws(
  () => service.preparePageWrite({
    resource: 'lowcode_pages',
    data: {
      schema: {
        schemaVersion: 1,
        code: 'invalid-schema-save-test',
        route: '/dashboard/invalid-schema-save-test',
        title: 'Invalid schema save test',
        blocks: [{ id: 'unsupported-block', kind: 'unsupported' }],
      },
    },
  }),
  (error: unknown) => {
    assert.ok(error instanceof BadRequestException);
    assert.equal(error.getStatus(), 400);
    assert.deepEqual(error.getResponse(), {
      statusCode: 400,
      code: 'LOW_CODE_SCHEMA_VALIDATION_FAILED',
      error: 'Low-code page schema validation failed',
      message: [
        'Schema validation failed with 1 error(s).',
        'blocks.0.kind: Block kind "unsupported" is not registered.',
      ].join('\n'),
      issues: [{
        level: 'error',
        path: 'blocks.0.kind',
        message: 'Block kind "unsupported" is not registered.',
      }],
    });
    return true;
  },
  'Schema validation failures must be returned as structured HTTP 400 errors.',
);

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
assert.deepEqual(
  (managerSchema.scriptPolicy as Record<string, Record<string, unknown>>)?.context?.formBlockIds,
  ['planning_console_filter', 'planning_console_result_filter']
);

const mesSchema = {
  blocks: [
    {
      id: 'mes-actions',
      kind: 'buttonGroup',
      actions: [
        { code: 'refresh', label: 'Refresh' },
        { code: 'pause', label: 'Pause', permissionCode: 'mes.execution.manage' }
      ]
    },
    {
      id: 'mes-grid',
      kind: 'grid',
      schema: {
        grid: { columns: [{ field: 'id', title: 'ID' }] },
        rowActions: {
          edit: false,
          delete: false,
          actions: [
            { code: 'inspect', label: 'Inspect' },
            { code: 'reverse', label: 'Reverse', permissionCode: 'mes.execution.manage' }
          ]
        }
      }
    }
  ]
};
service.applyMesRuntimeAccess(mesSchema, false);
assert.deepEqual(
  (mesSchema.blocks[0].actions ?? []).map((action) => action.code),
  ['refresh']
);
assert.deepEqual(
  (mesSchema.blocks[1].schema?.rowActions?.actions ?? []).map((action) => action.code),
  ['inspect']
);

console.log('planning low-code runtime access tests passed');
