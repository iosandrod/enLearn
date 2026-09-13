import assert from 'node:assert/strict';
import {
  applyMaterialPropFieldValue,
  createMaterialPropModel,
  createMaterialPropOptionSources,
} from '../src/visual-editor/material-prop-forms/visual-props';
import type { MaterialPropFormField } from '../src/visual-editor/material-prop-forms/types';
import type { VisualEditorBlockData } from '../src/visual-editor/visual-editor.utils';

const requestParamsField: MaterialPropFormField = {
  field: 'postDataJson',
  label: '请求参数',
  component: 'lc-sub-form',
  target: 'props',
  path: 'postDataJson',
  valueKind: 'raw',
  props: {
    schema: {
      fields: [],
      actions: [],
    },
  },
};

const optionSources = createMaterialPropOptionSources([], undefined);
assert.deepEqual(
  optionSources['grid-designer-source-fields'],
  optionSources.__visualTableFields,
);
assert.notEqual(
  optionSources['grid-designer-source-fields'],
  optionSources.__visualTableFields,
);

const block = {
  props: {
    postDataJson: JSON.stringify({
      limit: 20,
      filters: {
        status: 'active',
        account_id: { op: 'eq', value: '{{ accountId }}', required: true },
      },
    }),
  },
} as unknown as VisualEditorBlockData;

const model = createMaterialPropModel(block, [requestParamsField]);
assert.deepEqual(model.postDataJson, {
  limit: 20,
  filters: [
    {
      logic: 'and',
      field: 'status',
      value: 'active',
      required: false,
      children: [],
    },
    {
      logic: 'and',
      field: 'account_id',
      op: 'eq',
      value: '{{ accountId }}',
      required: true,
      children: [],
    },
  ],
});

applyMaterialPropFieldValue(block, requestParamsField, {
  limit: 50,
  search: '',
  filters: [
    {
      logic: 'or',
      field: '',
      value: '',
      required: false,
      children: [
        {
          logic: 'and',
          field: 'status',
          op: 'eq',
          value: 'active',
          required: false,
          children: [],
        },
        {
          logic: 'and',
          field: 'priority',
          op: 'gte',
          value: 3,
          required: true,
          children: [],
        },
      ],
    },
  ],
});

assert.deepEqual(block.props.postDataJson, {
  limit: 50,
  filters: {
    logic: 'and',
    conditions: [
      {
        logic: 'or',
        conditions: [
          { field: 'status', op: 'eq', value: 'active' },
          { field: 'priority', op: 'gte', value: 3, required: true },
        ],
      },
    ],
  },
});

console.log('Material property request-parameter compatibility tests passed.');
