import assert from 'node:assert/strict';
import {
  PlanningEngineResultValidationError,
  validatePlanningEngineResult
} from './planning-engine-result';

function resultFixture() {
  return {
    operationPlans: [{
      reference: 'OP-1',
      type: 'MO',
      status: 'proposed',
      quantity: 1,
      start: '2026-08-09T00:00:00.000Z',
      end: '2026-08-10T00:00:00.000Z',
      operation: 'Make item'
    }],
    operationPlanMaterials: [{
      operationPlanReference: 'OP-1',
      item: 'Item',
      location: 'Plant',
      quantity: 1,
      date: '2026-08-10T00:00:00.000Z',
      status: 'proposed'
    }],
    operationPlanResources: [],
    problems: [],
    constraints: [],
    resourcePlans: [],
    engine: {
      bridge: 'test',
      references: {
        buffers: [{ name: 'Item @ Plant', item: 'Item', location: 'Plant', batch: null }],
        demands: ['Demand 1'],
        operations: [{
          name: 'Make item',
          hidden: false,
          buffers: ['Item @ Plant'],
          resources: [],
          suboperations: []
        }]
      }
    }
  };
}

const valid = validatePlanningEngineResult(resultFixture());
assert.equal(valid.operationPlans[0].reference, 'OP-1');
assert.equal(valid.engine.references.operations[0].name, 'Make item');

const unknownRoot = { ...resultFixture(), unexpected: true };
assert.throws(
  () => validatePlanningEngineResult(unknownRoot),
  (error: unknown) => error instanceof PlanningEngineResultValidationError &&
    error.path === '$.unexpected'
);

const danglingDetail = resultFixture();
danglingDetail.operationPlanMaterials[0].operationPlanReference = 'MISSING';
assert.throws(
  () => validatePlanningEngineResult(danglingDetail),
  /unknown operation plan reference MISSING/
);

const unknownReferenceField = resultFixture();
Object.assign(unknownReferenceField.engine.references.operations[0], { type: 'invented' });
assert.throws(
  () => validatePlanningEngineResult(unknownReferenceField),
  /unknown field/
);

const duplicateDemandReference = resultFixture();
duplicateDemandReference.engine.references.demands.push('Demand 1');
assert.throws(
  () => validatePlanningEngineResult(duplicateDemandReference),
  /duplicate value Demand 1/
);

const unknownStatus = resultFixture();
unknownStatus.operationPlans[0].status = 'invented';
assert.throws(
  () => validatePlanningEngineResult(unknownStatus),
  /unsupported value invented/
);

const timezoneLessDate = resultFixture();
timezoneLessDate.operationPlans[0].start = '2026-08-09 00:00:00';
assert.throws(
  () => validatePlanningEngineResult(timezoneLessDate),
  /explicit UTC offset/
);

console.log('planning engine result protocol tests passed');
