import { cloneDeep } from 'lodash-es';
import type { VisualEditorBlockData } from '../visual-editor.utils';
import { useDotProp } from '../hooks/useDotProp';
import { collectPageTableFieldOptions } from './table-field-options';
import type {
  MaterialPropFieldTarget,
  MaterialPropFormDefinition,
  MaterialPropFormField,
  MaterialPropFormSchema,
} from './types';

const visualModelsSourceKey = '__visualModels';
const visualTableFieldsSourceKey = '__visualTableFields';
const gridDesignerSourceFieldsKey = 'grid-designer-source-fields';
const layoutGridSpan = 24;
const minLayoutSpan = 1;

export function getVisualModelsSourceKey() {
  return visualModelsSourceKey;
}

export function getVisualTableFieldsSourceKey() {
  return visualTableFieldsSourceKey;
}

export function createMaterialPropForm(
  definition: MaterialPropFormDefinition,
  block: VisualEditorBlockData,
): MaterialPropFormSchema {
  const fields = cloneDeep(definition.fields).map((field) => {
    if (definition.componentKey !== 'input') return field;

    const runtimePath = {
      defaultValueType: '__lowcodeDefaultValueType',
      defaultValue: '__lowcodeDefaultValue',
      defaultValueProcedure: '__lowcodeDefaultValueProcedure',
    }[field.field];
    return runtimePath ? { ...field, target: 'props' as const, path: runtimePath } : field;
  });

  ensureDefaultValues(block, fields);

  return {
    title: definition.title ?? block.label,
    fields,
    layout: cloneDeep(definition.layout),
    actions: cloneDeep(definition.actions),
  };
}

export function createMaterialPropModel(
  block: VisualEditorBlockData,
  fields: MaterialPropFormField[],
) {
  ensureDefaultValues(block, fields);

  return fields.reduce<Record<string, unknown>>((model, field) => {
    const value = readFieldValue(block, field);
    model[field.field] = cloneDeep(
      field.optionsSourceKey === visualTableFieldsSourceKey && Array.isArray(value)
        ? value[value.length - 1] ?? ''
        : value,
    );
    return model;
  }, {});
}

export function createMaterialPropOptionSources(
  models: readonly unknown[],
  pageData?: unknown,
) {
  const tableFields = collectPageTableFieldOptions(pageData);
  return {
    [visualModelsSourceKey]: cloneDeep(models),
    [visualTableFieldsSourceKey]: tableFields,
    [gridDesignerSourceFieldsKey]: cloneDeep(tableFields),
  };
}

export function applyMaterialPropFieldValue(
  block: VisualEditorBlockData,
  field: MaterialPropFormField,
  value: unknown,
) {
  const target = getTargetObject(block, field.target);
  const path = field.path ?? field.field;
  const { propObj, prop } = useDotProp(target, path);
  const nextValue = normalizeFieldValue(field, value, propObj[prop]);

  propObj[prop] = nextValue;

  field.syncTo?.forEach((syncPath) => {
    const syncTarget = useDotProp(target, syncPath);
    syncTarget.propObj[syncTarget.prop] = nextValue;
  });
}


function ensureDefaultValues(
  block: VisualEditorBlockData,
  fields: MaterialPropFormField[],
) {
  fields.forEach((field) => {
    const target = getTargetObject(block, field.target);
    const path = field.path ?? field.field;
    const { propObj, prop } = useDotProp(target, path);

    if (propObj[prop] === undefined && Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
      propObj[prop] = cloneDeep(field.defaultValue);
    }
  });
}

function readFieldValue(block: VisualEditorBlockData, field: MaterialPropFormField) {
  const target = getTargetObject(block, field.target);
  const path = field.path ?? field.field;
  const { propObj, prop } = useDotProp(target, path);

  if (field.valueKind === 'layoutSlots') {
    return stringifyLayoutSlots(propObj[prop]);
  }

  if (isStructuredRequestParamsField(field)) {
    return createStructuredRequestParamsModel(propObj[prop]);
  }

  return propObj[prop];
}

function getTargetObject(
  block: VisualEditorBlockData,
  target: MaterialPropFieldTarget = 'props',
) {
  if (target === 'block') return block;
  if (target === 'styles') {
    block.styles ??= {};
    return block.styles;
  }

  block.props ??= {};
  return block.props;
}

function normalizeFieldValue(
  field: MaterialPropFormField,
  value: unknown,
  currentValue?: unknown,
) {
  if (isStructuredRequestParamsField(field)) {
    return createStructuredRequestParamsValue(value);
  }

  if (field.valueKind === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  if (field.valueKind === 'boolean') {
    return Boolean(value);
  }

  if (field.valueKind === 'json' && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (field.valueKind === 'layoutSlots') {
    return createLayoutSlotsFromRatio(value, currentValue);
  }

  if (field.valueKind === 'string') {
    return value === undefined || value === null ? '' : String(value);
  }

  return value;
}

function isStructuredRequestParamsField(field: MaterialPropFormField) {
  return field.component === 'lc-sub-form' && (field.path ?? field.field) === 'postDataJson';
}

function createStructuredRequestParamsModel(value: unknown) {
  const request = readJsonObjectValue(value);
  request.filters = createRequestFilterRows(request.filters);
  return request;
}

function createStructuredRequestParamsValue(value: unknown) {
  if (!isRecord(value)) return {};

  const request = compactObject(cloneDeep(value));
  const filters = createRequestFilterGroup(value.filters);
  if (filters) request.filters = filters;
  else delete request.filters;
  return request;
}

function readJsonObjectValue(value: unknown) {
  if (isRecord(value)) return cloneDeep(value);
  if (typeof value !== 'string' || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function createRequestFilterRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord).map((row) => ({
      logic: readFilterLogic(row.logic),
      field: readStringValue(row.field),
      value: cloneDeep(row.value ?? ''),
      required: row.required === true,
      ...(readStringValue(row.op) ? { op: readStringValue(row.op) } : {}),
      children: createRequestFilterRows(row.children),
    }));
  }

  if (!isRecord(value)) return [];
  if (Array.isArray(value.conditions)) {
    const rows = value.conditions
      .map(requestFilterConditionToRow)
      .filter((row): row is Record<string, unknown> => Boolean(row));
    return readFilterLogic(value.logic) === 'and'
      ? rows
      : [{ logic: 'or', field: '', value: '', required: false, children: rows }];
  }

  return Object.entries(value).map(([field, rawValue]) => {
    const operatorValue = isRecord(rawValue) && 'value' in rawValue;
    return {
      logic: 'and',
      field,
      value: cloneDeep(operatorValue ? rawValue.value : rawValue),
      required: operatorValue && rawValue.required === true,
      ...(operatorValue && readStringValue(rawValue.op)
        ? { op: readStringValue(rawValue.op) }
        : {}),
      children: [],
    };
  });
}

function requestFilterConditionToRow(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (Array.isArray(value.conditions)) {
    return {
      logic: readFilterLogic(value.logic),
      field: '',
      value: '',
      required: value.required === true,
      children: value.conditions
        .map(requestFilterConditionToRow)
        .filter((row): row is Record<string, unknown> => Boolean(row)),
    };
  }

  const field = readStringValue(value.field);
  if (!field) return null;
  return {
    logic: 'and',
    field,
    value: cloneDeep(value.value),
    required: value.required === true,
    ...(readStringValue(value.op) ? { op: readStringValue(value.op) } : {}),
    children: [],
  };
}

function createRequestFilterGroup(value: unknown) {
  const conditions = (Array.isArray(value) ? value : [])
    .map(requestFilterRowToCondition)
    .filter((condition): condition is Record<string, unknown> => Boolean(condition));
  return conditions.length ? { logic: 'and', conditions } : undefined;
}

function requestFilterRowToCondition(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const field = readStringValue(value.field);
  const children = (Array.isArray(value.children) ? value.children : [])
    .map(requestFilterRowToCondition)
    .filter((condition): condition is Record<string, unknown> => Boolean(condition));
  const ownCondition = field
    ? compactObject({
        field,
        op: readStringValue(value.op) || undefined,
        value: cloneDeep(value.value),
        required: value.required === true ? true : undefined,
      })
    : null;
  const conditions = [...(ownCondition ? [ownCondition] : []), ...children];

  if (!conditions.length) return null;
  if (conditions.length === 1 && !children.length) return conditions[0];
  return { logic: readFilterLogic(value.logic), conditions };
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(value).reduce<Record<string, unknown>>((result, [key, item]) => {
    if (item === undefined || item === null || item === '') return result;
    if (Array.isArray(item) && item.length === 0) return result;
    if (isRecord(item)) {
      const child = compactObject(item);
      if (Object.keys(child).length) result[key] = child;
      return result;
    }
    result[key] = item;
    return result;
  }, {});
}

function readFilterLogic(value: unknown): 'and' | 'or' {
  return readStringValue(value).toLowerCase() === 'or' ? 'or' : 'and';
}

function readStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampLayoutSpan(value: unknown, fallback = minLayoutSpan) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(layoutGridSpan, Math.max(minLayoutSpan, Math.round(numeric)));
}

function parseLayoutRatio(value: unknown, fallback: number[] = [12, 12]) {
  const spans = String(value || '')
    .split(/[:：,\s]+/)
    .map((span) => clampLayoutSpan(span, 0))
    .filter((span) => span > 0)
    .slice(0, layoutGridSpan);

  return spans.length ? spans : fallback;
}

function readLayoutSlotItems(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, any>)
    .filter(([key, slot]) => key !== 'value' && slot && typeof slot === 'object')
    .sort(([prevKey], [nextKey]) => {
      const prevIndex = Number(prevKey.replace('slot', ''));
      const nextIndex = Number(nextKey.replace('slot', ''));
      return prevIndex - nextIndex;
    })
    .map(([key, slot], index) => ({
      ...slot,
      key: slot.key || key || `slot${index}`,
      span: clampLayoutSpan(slot.span),
      children: Array.isArray(slot.children) ? slot.children : [],
    }));
}

function stringifyLayoutSlots(value: unknown) {
  if (typeof value === 'string') return value;
  const items = readLayoutSlotItems(value);
  return items.length
    ? items.map((item) => String(clampLayoutSpan(item.span))).join(':')
    : '12:12';
}

function createLayoutSlotsFromRatio(value: unknown, currentValue?: unknown) {
  const previousItems = readLayoutSlotItems(currentValue);
  const fallback = previousItems.length ? previousItems.map((item) => item.span) : [12, 12];
  const spans = parseLayoutRatio(value, fallback);

  return spans.reduce(
    (prev, span, index) => {
      const previousItem = previousItems[index];
      prev[`slot${index}`] = {
        key: `slot${index}`,
        span,
        children: previousItem?.children || [],
      };
      return prev;
    },
    { value: spans.join(':') } as Record<string, unknown>,
  );
}
