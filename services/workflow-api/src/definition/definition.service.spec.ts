import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { DefinitionService } from './definition.service';

async function main() {
const service = new DefinitionService();

const model = await service.saveModel(
  {
    tenantId: 'default',
    code: 'expense_approval',
    name: 'Expense Approval',
    documentType: 'expense',
    schema: {
      schemaVersion: 1,
      code: 'expense_approval',
      name: 'Expense Approval',
      nodes: [
        { id: 'start', type: 'start', name: 'Start' },
        {
          id: 'approval',
          type: 'approval',
          name: 'Approval',
          config: {
            assigneeStrategy: {
              type: 'initiatorManager',
              level: 1
            }
          }
        },
        { id: 'end', type: 'end', name: 'End' }
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'approval' },
        { id: 'e2', source: 'approval', target: 'end' }
      ]
    }
  },
  {
    tenantId: 'default',
    userId: '00000000-0000-0000-0000-000000000001'
  }
);

assert.equal(model.currentVersion, 0);
assert.equal((await service.listModels({ documentType: 'expense' })).length, 1);

const published = await service.publishModel(
  model.id,
  { remark: 'first publish' },
  {
    tenantId: 'default',
    userId: '00000000-0000-0000-0000-000000000001'
  }
);

assert.equal(published.version.version, 1);
assert.equal(published.definition.status, 'active');
assert.equal((await service.listDefinitions({ documentType: 'expense' })).length, 1);

const disabled = await service.disableDefinition(published.definition.id);
assert.equal(disabled.status, 'disabled');

await assert.rejects(
  () =>
    service.saveModel(
      {
        code: 'invalid',
        name: 'Invalid',
        schema: {
          schemaVersion: 1,
          code: 'invalid',
          name: 'Invalid',
          nodes: [],
          edges: []
        }
      },
      {
        tenantId: 'default'
      }
    ),
  BadRequestException
);

console.log('workflow-api definition service tests passed');
}

void main();
