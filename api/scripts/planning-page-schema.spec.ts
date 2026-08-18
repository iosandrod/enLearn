import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  PLANNING_MODEL_BY_KEY,
  PLANNING_MODEL_DEFINITIONS
} from '../src/planning-service/planning.models';
import {
  buildPlanningCategoryMigrationSql,
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
    assert.equal(formField?.component, relation.relationTree ? 'vxe-tree-select' : 'vxe-select');
    assert.equal(formField?.optionsSourceKey, `${relation.relation}Options`);
    assert.deepEqual(
      formField?.optionProps,
      relation.relationTree
        ? { label: 'label', value: 'id', children: 'children' }
        : { label: 'label', value: 'id' }
    );
    const source = edit.dataSources[`${relation.relation}Options`];
    assert.equal(source?.serviceMethod, 'listRelationOptions');
    assert.equal(
      source?.postData?.labelField,
      relation.relationLabelField ??
        PLANNING_MODEL_BY_KEY.get(relation.relation!)?.labelField ??
        PLANNING_MODEL_BY_KEY.get(relation.relation!)?.businessKey ??
        'id'
    );
    const expectedFilters = {
      ...(relation.relationFilters ?? {}),
      ...Object.fromEntries(Object.entries(relation.relationFilterBindings ?? {}).map(
        ([targetField, sourceField]) => [
          targetField,
          `{{ forms.${model.key}_edit_form.${sourceField} }}`
        ]
      ))
    };
    assert.deepEqual(source?.postData?.filters ?? {}, expectedFilters);
    assert.equal(Boolean(source?.postData?.tree), Boolean(relation.relationTree));

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

const planningItem = PLANNING_MODEL_BY_KEY.get('planning_item')!;
const planningItemList = buildPlanningListSchema(planningItem) as any;
const planningItemEdit = buildPlanningEditSchema(planningItem) as any;
const planningItemGrid = planningItemList.blocks.find((block: any) => block.kind === 'grid');
const planningItemForm = planningItemEdit.blocks
  .find((block: any) => block.kind === 'tabs')
  ?.tabs?.[0]?.blocks?.find((block: any) => block.kind === 'form');
const planningItemSave = planningItemEdit.blocks[0]?.actions
  ?.find((action: any) => action.code === 'save')
  ?.directives?.find((directive: any) => directive.type === 'invokeService');
assert.equal(planningItem.fields.find((field) => field.name === 'name')?.label, '物料编码');
assert.equal(planningItem.fields.find((field) => field.name === 'display_name')?.label, '物料名称');
assert.equal(planningItem.fields.find((field) => field.name === 'display_name')?.required, true);
assert.ok(planningItemGrid?.schema?.grid?.columns?.some(
  (column: any) => column.field === 'display_name' && column.title === '物料名称'
));
assert.ok(planningItemForm?.schema?.fields?.some(
  (field: any) => field.field === 'display_name' && field.rules?.[0]?.required === true
));
assert.equal(
  planningItemSave?.postData?.data?.display_name,
  '{{ forms.planning_item_edit_form.display_name }}'
);

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const itemDisplayNameMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260813090000_planning_item_display_name.sql'),
  'utf8'
);
assert.match(itemDisplayNameMigration, /add column if not exists display_name text/);
assert.match(itemDisplayNameMigration, /alter column display_name set not null/);
assert.match(itemDisplayNameMigration, /line\.item_code = item\.name/);
assert.match(itemDisplayNameMigration, /next_config := next_config - 'config_hash'/);
assert.match(itemDisplayNameMigration, /'\{config_hash\}'[\s\S]*?to_jsonb\(next_hash\)/);
assert.doesNotMatch(
  itemDisplayNameMigration,
  /allowed_fields[^;]*\|\| '\["display_name"\]'/,
  'The registry migration must not append duplicate display_name fields on rerun.'
);

for (const [modelKey, targetType] of [
  ['planning_item', 'item'],
  ['planning_customer', 'customer'],
  ['planning_supplier', 'supplier']
] as const) {
  const model = PLANNING_MODEL_BY_KEY.get(modelKey)!;
  const categoryField = model.fields.find((field) => field.name === 'category_id');
  assert.equal(categoryField?.relation, 'planning_category');
  assert.deepEqual(categoryField?.relationFilters, {
    target_type: targetType,
    status: 'active'
  });
  assert.equal(categoryField?.relationTree, true);
  assert.ok(model.fields.some((field) => field.name === 'category' && field.readOnly));
  assert.ok(model.fields.some((field) => field.name === 'subcategory' && field.readOnly));
}

const categoryModel = PLANNING_MODEL_BY_KEY.get('planning_category')!;
const categoryEdit = buildPlanningEditSchema(categoryModel) as any;
const categoryParentSource = categoryEdit.dataSources.planning_categoryOptions;
assert.deepEqual(categoryParentSource.postData.filters, {
  status: 'active',
  target_type: '{{ forms.planning_category_edit_form.target_type }}'
});
assert.deepEqual(categoryParentSource.loadAfterSourceKeys, ['planning_categoryRows']);
assert.equal(
  categoryParentSource.postData.excludeId,
  '{{ forms.planning_category_edit_form.id }}'
);
const categoryEditForm = categoryEdit.blocks
  .find((block: any) => block.kind === 'tabs')
  ?.tabs?.[0]?.blocks?.find((block: any) => block.kind === 'form');
const targetTypeField = categoryEditForm?.schema?.fields?.find(
  (field: any) => field.field === 'target_type'
);
assert.deepEqual(targetTypeField?.events?.change, [
  {
    type: 'setFormField',
    blockId: 'planning_category_edit_form',
    field: 'parent_id',
    value: ''
  },
  { type: 'refreshDataSources', sourceKeys: ['planning_categoryOptions'] }
]);

const categoryMigration = buildPlanningCategoryMigrationSql();
assert.match(categoryMigration, /create table if not exists public\.planning_category/);
assert.match(categoryMigration, /alter table public\.planning_item\s+add column if not exists category_id uuid/);
assert.match(categoryMigration, /CAT_' \|\| upper\(left\(md5\(btrim\(p_value\)\), 12\)\)/);
assert.match(categoryMigration, /before insert or update of category_id on public\.planning_item/);
assert.match(categoryMigration, /when \(old\.category_id is not null and new\.category_id is null\)/);
assert.match(categoryMigration, /before update of category, subcategory on public\.planning_item/);
assert.match(categoryMigration, /when \(new\.category_id is not null\)/);
assert.match(categoryMigration, /after update of name, parent_id on public\.planning_category/);
assert.match(categoryMigration, /where parent\.code = 'planning-1'/);
assert.match(categoryMigration, /comment on table public\.%I is %L/);
assert.match(categoryMigration, /planning_category-list/);
assert.match(categoryMigration, /planning_item-list/);
assert.match(categoryMigration, /planning_customer-list/);
assert.match(categoryMigration, /planning_supplier-list/);
assert.doesNotMatch(categoryMigration, /create table if not exists public\.planning_forecast/);
assert.doesNotMatch(categoryMigration, /planning_demand-list/);
assert.doesNotMatch(categoryMigration, /planning-operationplan/);
assert.doesNotMatch(categoryMigration, /update public\.admin_routes\s+set status = 'inactive'/);
assert.doesNotMatch(categoryMigration, /insert into public\.admin_permissions/);

assert.match(routesSql, /'planning-routing-view'/);
assert.match(routesSql, /'planning-bom-view'/);

console.log('planning low-code page schema tests passed');
