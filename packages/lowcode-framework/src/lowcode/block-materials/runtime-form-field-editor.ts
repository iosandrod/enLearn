import { VxeUI } from 'vxe-pc-ui';
import type { LowCodeHostServiceApi } from '../../core/host';
import type { LowCodeRuntimeBlockEditor } from '../../runtime/block-editor';
import { openGlobalDialog } from '../../runtime/global-dialog';
import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodePageFormBlock,
  LowCodePageSearchFormBlock,
  LowCodeRelateInfoConfig,
  LowCodeRule,
} from '../../types/lowcode';
import { lowCodeOptionSourceRegistry } from '../../runtime/option-source-registry';
import { loadLowCodeFormDefinition } from '../form-definition-loader';

export const RUNTIME_FORM_FIELD_EDITOR_CODE = 'runtime-form-field-editor';

type RuntimeFormBlock = LowCodePageFormBlock | LowCodePageSearchFormBlock;
type FieldEditorModel = Record<string, unknown> & {
  field: string;
  label: string;
  component: LowCodeField['component'];
  required: boolean;
  requiredMessage: string;
  createDisabled: boolean;
  editDisabled: boolean;
  relateInfoConfig: LowCodeRelateInfoConfig;
  defaultValueType: 'none' | 'literal' | 'function' | 'procedure';
  defaultValue?: unknown;
  defaultValueScript: string;
  defaultValueProcedure: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRelateInfoConfig(value: unknown): LowCodeRelateInfoConfig {
  if (!isRecord(value)) return {};
  const config = cloneValue(value) as LowCodeRelateInfoConfig;
  const mappings = config.fieldMappings ?? config.mappings;

  if (Array.isArray(mappings)) {
    config.fieldMappings = mappings
      .filter(isRecord)
      .map((mapping) => ({
        sourceField: readString(mapping.sourceField),
        targetField: readString(mapping.targetField),
      }))
      .filter((mapping) => mapping.sourceField && mapping.targetField);
    delete config.mappings;
  } else if (isRecord(mappings)) {
    config.fieldMappings = Object.entries(mappings)
      .map(([targetField, sourceField]) => ({
        sourceField: readString(sourceField),
        targetField: readString(targetField),
      }))
      .filter((mapping) => mapping.sourceField && mapping.targetField);
    delete config.mappings;
  }

  return config;
}

function createDefaultRelateInfoConfig(fieldName: string) {
  return {
    sourceType: 'entity',
    valueField: 'id',
    displayField: 'name',
    displayValueField: `${fieldName}_label`,
    searchable: true,
    pageSize: 100,
    fieldMappings: [{ sourceField: 'id', targetField: fieldName }],
  } satisfies LowCodeRelateInfoConfig;
}

function createRelateInfoConfig(field: LowCodeField) {
  const config = normalizeRelateInfoConfig(field.props?.relateInfoConfig);
  if (Object.keys(config).length || field.component !== 'base-info') return config;
  return createDefaultRelateInfoConfig(field.field);
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
  const defaultValueType = field.defaultValueType === 'function' ||
    field.defaultValueType === 'procedure'
    ? field.defaultValueType
    : hasLiteralDefault
      ? 'literal'
      : 'none';

  return {
    field: field.field,
    label: field.label,
    component: field.component,
    required: Boolean(requiredRule),
    requiredMessage: requiredRule?.message || `${field.label}不能为空`,
    createDisabled: field.createDisabled === true,
    editDisabled: field.editDisabled === true,
    relateInfoConfig: createRelateInfoConfig(field),
    defaultValueType,
    defaultValue: hasLiteralDefault
      ? formatLiteralDefaultValue(block.initialValues?.[field.field])
      : undefined,
    defaultValueScript: field.defaultValueScript ?? '',
    defaultValueProcedure: field.defaultValueProcedure ?? '',
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
  const component = readString(values.component) || field.component;
  const rules = updateRequiredRule(
    field.rules,
    values.required === true,
    readString(values.requiredMessage) || `${label}不能为空`,
  );
  const updated: LowCodeField = {
    ...cloneValue(field),
    label,
    component,
    ...(values.createDisabled === true ? { createDisabled: true } : {}),
    ...(values.editDisabled === true ? { editDisabled: true } : {}),
    ...(readString(values.optionsCode) ? { optionsCode: readString(values.optionsCode) } : {}),
    ...(values.defaultValueType === 'function'
      ? {
          defaultValueType: 'function',
          defaultValueScript: readString(values.defaultValueScript),
        }
      : {}),
    ...(values.defaultValueType === 'procedure'
      ? {
          defaultValueType: 'procedure',
          defaultValueProcedure: readString(values.defaultValueProcedure),
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
  const props = cloneValue(updated.props ?? {});
  const configuredRelateInfo = normalizeRelateInfoConfig(values.relateInfoConfig);
  const relateInfoConfig = component === 'base-info' && !Object.keys(configuredRelateInfo).length
    ? createDefaultRelateInfoConfig(field.field)
    : configuredRelateInfo;
  if (Object.keys(relateInfoConfig).length) {
    props.relateInfoConfig = relateInfoConfig;
  } else {
    delete props.relateInfoConfig;
  }
  if (Object.keys(props).length) updated.props = props;
  else delete updated.props;

  if (!readString(values.optionsCode)) delete updated.optionsCode;
  if (values.createDisabled !== true) delete updated.createDisabled;
  if (values.editDisabled !== true) delete updated.editDisabled;
  if (values.defaultValueType !== 'function') delete updated.defaultValueScript;
  if (values.defaultValueType !== 'procedure') delete updated.defaultValueProcedure;
  if (!['function', 'procedure'].includes(values.defaultValueType)) {
    delete updated.defaultValueType;
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

function normalizeProcedureOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((procedure) => {
      const name = readString(procedure.value ?? procedure.name);
      const label = readString(procedure.label) || name;
      return name ? { label, value: name } : undefined;
    })
    .filter((option): option is { label: string; value: string } => Boolean(option));
}

async function hydrateProcedureOptions(
  schema: LowCodeFormSchema,
  serviceApi: LowCodeHostServiceApi,
) {
  const hydrated = hydrateEditorSchema(schema);
  const procedureField = hydrated.fields.find(
    (candidate) => candidate.field === 'defaultValueProcedure',
  );
  if (!procedureField) return hydrated;

  procedureField.options = normalizeProcedureOptions(
    await serviceApi.invoke('lowcode', 'listDefaultValueProcedures', {}),
  );
  return hydrated;
}

async function preloadEditorOptionSources(
  schema: LowCodeFormSchema,
  serviceApi: LowCodeHostServiceApi,
) {
  const missingCodes = [...new Set(
    schema.fields
      .map((candidate) => readString(candidate.optionsCode))
      .filter(Boolean),
  )].filter((code) => !lowCodeOptionSourceRegistry.peek(code));

  if (missingCodes.length) {
    await lowCodeOptionSourceRegistry.refresh(missingCodes, () => serviceApi);
  }
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
    await preloadEditorOptionSources(definition.schema, serviceApi);
    const editorSchema = await hydrateProcedureOptions(definition.schema, serviceApi);
    const model = createEditorModel(block, field);
    const result = await openGlobalDialog<FieldEditorModel>({
      title: `${field.label || field.field} - 字段属性`,
      width: 'min(920px, calc(100vw - 32px))',
      className: 'runtime-form-field-editor-dialog',
      props: {
        top: '5vh',
        height: 'min(860px, calc(100vh - 48px))',
        destroyOnClose: true,
      },
      model,
      form: {
        schema: editorSchema,
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
        if (
          values.defaultValueType === 'procedure' &&
          !readString(values.defaultValueProcedure)
        ) {
          notifyError('默认值类型为存储过程时，必须选择存储过程。');
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
