import assert from 'node:assert/strict';

import { LowCodeService } from './lowcode.service';
import {
  LowCodeSchemaValidationError,
  prepareLowCodePageSchema,
} from './lowcode.schema';

type MaterialRegistryHarness = {
  toPageMaterialVersions(rows: unknown): Readonly<Record<string, string>>;
};

const service = new LowCodeService() as unknown as MaterialRegistryHarness;
const databaseMaterialVersions = service.toPageMaterialVersions([{
  code: 'trigger-workflow-designer',
  material_version: '1.2.3',
  aliases: ['trigger-flow'],
}]);

assert.deepEqual(databaseMaterialVersions, {
  'trigger-workflow-designer': '1.2.3',
  'trigger-flow': '1.2.3',
});

const sourceSchema = {
  schemaVersion: 1,
  code: 'trigger-workflow-designer-save-test',
  route: '/dashboard/trigger-workflow/designer-save-test',
  title: 'Trigger workflow designer save test',
  blocks: [{
    id: 'trigger-workflow-flow',
    kind: 'trigger-workflow-designer',
    sourceKey: 'triggerWorkflowModel',
  }],
};
const schema = prepareLowCodePageSchema(sourceSchema, databaseMaterialVersions);

assert.deepEqual(schema.blocks, [{
  id: 'trigger-workflow-flow',
  kind: 'trigger-workflow-designer',
  sourceKey: 'triggerWorkflowModel',
  materialVersion: '1.2.3',
}]);
assert.throws(
  () => prepareLowCodePageSchema(sourceSchema, {}),
  (error: unknown) => error instanceof LowCodeSchemaValidationError
    && error.issues.some((issue) => issue.path === 'blocks.0.kind'),
  'A database-backed page material must not be accepted when it is absent from the registry query.',
);

console.log('low-code database material registry tests passed');
