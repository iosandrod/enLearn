import { strict as assert } from 'node:assert';
import {
  createTriggerEdgeFormModel,
  createTriggerEdgeFormSchema,
  createTriggerNodeFormModel,
  createTriggerNodeFormSchema,
  updateTriggerEdgeFromFormField,
  updateTriggerNodeFromFormField
} from '../src/inspector-form';
import { createApprovalTriggerWorkflow } from '../src/templates';

const workflow = createApprovalTriggerWorkflow();
const approvalNode = workflow.nodes.find((node) => node.id === 'manager_approval');
assert.ok(approvalNode);

const schema = createTriggerNodeFormSchema(approvalNode);
assert.ok(schema.fields.some((field) => field.field === 'assigneeType'));
assert.ok(schema.fields.some((field) => field.component === 'lc-json-editor'));

const model = createTriggerNodeFormModel(approvalNode);
assert.equal(model.name, '经理审批');
assert.equal(model.assigneeIds, 'manager');

const renamed = updateTriggerNodeFromFormField(approvalNode, 'name', '主管审批');
assert.equal(renamed.name, '主管审批');

const reassigned = updateTriggerNodeFromFormField(approvalNode, 'assigneeIds', 'manager, finance');
assert.deepEqual(reassigned.config?.approval?.assigneeIds, ['manager', 'finance']);

const edge = workflow.edges.find((item) => item.name === '普通金额');
assert.ok(edge);
assert.ok(createTriggerEdgeFormSchema(edge).fields.some((field) => field.field === 'conditionOperator'));
assert.equal(createTriggerEdgeFormModel(edge).conditionType, 'field');

const expressionEdge = updateTriggerEdgeFromFormField(edge, 'conditionType', 'expression');
assert.equal(expressionEdge.condition?.type, 'expression');

console.log('trigger-workflow-editor inspector form tests passed');
