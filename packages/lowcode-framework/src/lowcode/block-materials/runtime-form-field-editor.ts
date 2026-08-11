import { VxeUI } from 'vxe-pc-ui';
import type { LowCodeRuntimeBlockEditor } from '../../runtime/block-editor';
import { openGlobalDialog } from '../../runtime/global-dialog';
import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodePageFormBlock,
  LowCodePageSearchFormBlock,
  LowCodeRule,
} from '../../types/lowcode';
import { loadLowCodeFormDefinition } from '../form-definition-loader';

export const RUNTIME_FORM_FIELD_EDITOR_CODE = 'runtime-form-field-editor';

type RuntimeFormBlock = LowCodePageFormBlock | LowCodePageSearchFormBlock;
type FieldEditorModel = Record<string, unknown> & {
  field: string;
  label: string;
  required: boolean;
  requiredMessage: string;
  defaultValueType: 'none' | 'literal' | 'function';
  defaultValue?: unknown;
  defaultValueScript: string;
  optionsCode: string;
  updateScript: string;
  validationScript: string;
  validationMessage: string;
};

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function notifyError(error: unknown) {
  const content = error instanceof Error ? error.message : '字段配置保存失败。';
  const modal = (VxeUI as unknown as {
    modal?: { message?: (options: Record<string, unknown>) => unknown };
  }).modal;

  if (modal?.message) {
    void modal.message({ content, status: 'error' });
    return;
  }
  console.error(content);
}

function getRequiredRule(field: LowCodeField) {
  return field.rules?.find((rule) => rule.required === true);
}

function createEditorModel(block: RuntimeFormBlock, field: LowCodeField): FieldEditorModel {
  const requiredRule = getRequiredRule(field);
  const hasLiteralDefault = Object.prototype.hasOwnProperty.call(
    block.initialValues ?? {},
    field.field,
  );
  const defaultValueType = field.defaultValueType === 'function'
    ? 'function'
    : hasLiteralDefault
      ? 'literal'
      : 'none';

  return {
    field: field.field,
    label: field.label,
    required: Boolean(requiredRule),
    requiredMessage: requiredRule?.message || `${field.label}不能为空`,
    defaultValueType,
    defaultValue: hasLiteralDefault
      ? formatLiteralDefaultValue(block.initialValues?.[field.field])
      : undefined,
    defaultValueScript: field.defaultValueScript ?? '',
    optionsCode: field.optionsCode ?? '',
    updateScript: field.updateScript ?? '',
    validationScript: field.validationScript ?? '',
    validationMessage: field.validationMessage ?? `${field.label}校验不通过`,
  };
}

function updateRequiredRule(
  rules: LowCodeRule[] = [],
  required: boolean,
  message: string,
) {
  const unrelatedRules = rules.filter((rule) => rule.required !== true);
  if (!required) return unrelatedRules;
  return [
    ...unrelatedRules,
    {
      required: true,
      message: message || '该字段不能为空',
    },
  ];
}

function createUpdatedField(field: LowCodeField, values: FieldEditorModel) {
  const label = readString(values.label) || field.label;
  const rules = updateRequiredRule(
    field.rules,
    values.required === true,
    readString(values.requiredMessage) || `${label}不能为空`,
  );
  const updated: LowCodeField = {
    ...cloneValue(field),
    label,
    ...(readString(values.optionsCode) ? { optionsCode: readString(values.optionsCode) } : {}),
    ...(values.defaultValueType === 'function'
      ? {
          defaultValueType: 'function',
          defaultValueScript: readString(values.defaultValueScript),
        }
      : {}),
    ...(readString(values.updateScript)
      ? { updateScript: readString(values.updateScript) }
      : {}),
    ...(readString(values.validationScript)
      ? {
          validationScript: readString(values.validationScript),
          validationMessage:
            readString(values.validationMessage) || `${label}校验不通过`,
        }
      : {}),
    ...(rules.length ? { rules } : {}),
  };

  if (!readString(values.optionsCode)) delete updated.optionsCode;
  if (values.defaultValueType !== 'function') {
    delete updated.defaultValueType;
    delete updated.defaultValueScript;
  }
  if (!readString(values.updateScript)) delete updated.updateScript;
  if (!readString(values.validationScript)) {
    delete updated.validationScript;
    delete updated.validationMessage;
  }
  if (!rules.length) delete updated.rules;

  return updated;
}

function createUpdatedInitialValues(
  block: RuntimeFormBlock,
  field: LowCodeField,
  values: FieldEditorModel,
) {
  const initialValues = cloneValue(block.initialValues ?? {});
  if (values.defaultValueType === 'literal') {
    initialValues[field.field] = parseLiteralDefaultValue(values.defaultValue);
  } else {
    delete initialValues[field.field];
  }
  return initialValues;
}

function parseLiteralDefaultValue(value: unknown) {
  if (typeof value !== 'string') return cloneValue(value);
  const text = value.trim();
  if (!text) return '';
  if (!/^(?:[\[{]|-?\d|true$|false$|null$|")/.test(text)) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function formatLiteralDefaultValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'undefined') return '';
  try {
    return JSON.stringify(cloneValue(value));
  } catch {
    return String(value ?? '');
  }
}

function hydrateEditorSchema(schema: LowCodeFormSchema) {
  return cloneValue(schema);
}

export async function openRuntimeFormFieldEditor(
  block: RuntimeFormBlock,
  field: LowCodeField,
  runtimeBlockEditor: LowCodeRuntimeBlockEditor,
) {
  try {
    const serviceApi = runtimeBlockEditor.getServiceApi?.();
    if (!serviceApi) throw new Error('当前页面未提供字段设计所需的数据服务。');

    const definition = await loadLowCodeFormDefinition(
      serviceApi,
      RUNTIME_FORM_FIELD_EDITOR_CODE,
    );
    const model = createEditorModel(block, field);
    const result = await openGlobalDialog<FieldEditorModel>({
      title: `${field.label || field.field} - 字段属性`,
      width: 'min(920px, calc(100vw - 32px))',
      className: 'runtime-form-field-editor-dialog',
      props: {
        top: '5vh',
        destroyOnClose: true,
      },
      model,
      form: {
        schema: hydrateEditorSchema(definition.schema),
        props: {
          padding: false,
          titleWidth: 126,
        },
      },
      actions: [
        { code: 'cancel', label: '取消', role: 'cancel' },
        {
          code: 'confirm',
          label: '保存',
          role: 'confirm',
          status: 'primary',
        },
      ],
      onConfirm: async (context) => {
        const values = context.model;
        if (values.defaultValueType === 'function' && !readString(values.defaultValueScript)) {
          notifyError('默认值类型为函数时，默认值函数不能为空。');
          return { close: false };
        }

        const fieldIndex = block.schema.fields.findIndex(
          (candidate) => candidate.field === field.field,
        );
        if (fieldIndex < 0) {
          notifyError(`未找到字段“${field.field}”。`);
          return { close: false };
        }

        try {
          const fields = block.schema.fields.map((candidate, index) =>
            index === fieldIndex ? createUpdatedField(candidate, values) : cloneValue(candidate),
          );
          await runtimeBlockEditor.updateBlock({
            blockId: block.id,
            changes: {
              schema: {
                ...cloneValue(block.schema),
                fields,
              },
              initialValues: createUpdatedInitialValues(block, field, values),
              formDesignerUpdatedAt: Date.now(),
            },
          });
        } catch (error) {
          notifyError(error);
          return { close: false };
        }
      },
    });

    return result.action === 'confirm' ? result.values : undefined;
  } catch (error) {
    notifyError(error);
    return undefined;
  }
}
