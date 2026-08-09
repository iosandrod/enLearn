import assert from 'node:assert/strict';

import {
  PLANNING_MODEL_BY_KEY,
  PLANNING_MODEL_DEFINITIONS
} from '../src/planning-service/planning.models';
import {
  buildPlanningEditSchema,
  buildPlanningListSchema,
  buildPlanningRoutesSql
} from './generate-planning-migration';

const routesSql = buildPlanningRoutesSql();
assert.match(routesSql, /'planning-root'[\s\S]*"navigation":"sidebar"/);
assert.doesNotMatch(
  routesSql,
  /"navigation":"container"/,
  'Planning descendants must inherit the root sidebar placement instead of being flattened away.'
);

for (const model of PLANNING_MODEL_DEFINITIONS) {
  const list = buildPlanningListSchema(model) as any;
  const edit = buildPlanningEditSchema(model) as any;
  const create = list.blocks[0]?.actions?.find((action: any) => action.code === 'create');
  const save = edit.blocks[0]?.actions?.find((action: any) => action.code === 'save');
  const editForm = edit.blocks[1]?.tabs?.[0]?.blocks?.[0];
  if (model.access === 'view') {
    assert.equal(create, undefined);
    assert.equal(save, undefined);
  } else {
    assert.equal(create?.permissionCode, 'planning.models.manage');
    assert.equal(save?.permissionCode, 'planning.models.manage');
    assert.ok(save?.directives?.some((directive: any) => directive.type === 'invokeService'));
  }
  assert.equal(editForm?.id, `${model.key}_edit_form`);

  const saveDirective = save?.directives?.find((directive: any) => directive.type === 'invokeService');
  if (model.access !== 'view') {
    assert.equal(saveDirective?.postData?.id, `{{ forms.${model.key}_edit_form.id }}`);
    assert.ok(
      Object.values(saveDirective?.postData?.data ?? {}).every(
        (value) => typeof value === 'string' && value.includes(`forms.${model.key}_edit_form.`)
      )
    );
  }

  const fields = editForm?.schema?.fields ?? [];
  for (const numeric of model.fields.filter(
    (field) => field.kind === 'number' || field.kind === 'integer'
  )) {
    const formField = fields.find((field: any) => field.field === numeric.name);
    assert.equal(formField?.component, 'vxe-input');
    assert.equal(formField?.props?.type, 'number');
  }
  for (const relation of model.fields.filter((field) => field.kind === 'relation')) {
    const formField = fields.find((field: any) => field.field === relation.name);
    assert.equal(formField?.component, 'vxe-select');
    assert.equal(formField?.optionsSourceKey, `${relation.relation}Options`);
    assert.deepEqual(formField?.optionProps, { label: 'label', value: 'id' });
    const source = edit.dataSources[`${relation.relation}Options`];
    assert.equal(source?.serviceMethod, 'listRelationOptions');
    assert.equal(
      source?.postData?.labelField,
      PLANNING_MODEL_BY_KEY.get(relation.relation!)?.businessKey ?? 'id'
    );

    const grid = list.blocks.find((block: any) => block.kind === 'grid');
    const relationColumn = grid?.schema?.grid?.columns?.find(
      (column: any) => column.title === relation.label
    );
    if (relationColumn) {
      assert.equal(relationColumn.field, `${relation.name}_label`);
    }
  }
}

const planningRun = PLANNING_MODEL_BY_KEY.get('planning_run');
assert.ok(planningRun?.fields.some((field) => field.name === 'attempt' && field.readOnly));
assert.ok(planningRun?.fields.some((field) => field.name === 'output' && field.readOnly));
const planningRunList = buildPlanningListSchema(planningRun!) as any;
const planningRunEdit = buildPlanningEditSchema(planningRun!) as any;
const planningRunEditFields = planningRunEdit.blocks[1]?.tabs?.[0]?.blocks?.[0]?.schema?.fields ?? [];
assert.ok(planningRunEditFields.some(
  (field: any) => field.field === 'attempt' && field.props?.disabled === true
));
assert.ok(planningRunEditFields.some(
  (field: any) => field.field === 'output' && field.props?.disabled === true
));
assert.ok(planningRunList.blocks.some((block: any) => block.kind === 'grid'));

console.log('planning low-code page schema tests passed');
