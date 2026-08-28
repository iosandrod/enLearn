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
  return {
    [visualModelsSourceKey]: cloneDeep(models),
    [visualTableFieldsSourceKey]: collectPageTableFieldOptions(pageData),
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
