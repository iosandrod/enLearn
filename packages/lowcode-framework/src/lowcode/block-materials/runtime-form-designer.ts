import { VxeUI } from 'vxe-pc-ui';
import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodePageFormBlock,
  LowCodePageSearchFormBlock,
  LowCodeRule,
} from '../../types/lowcode';
import type { LowCodeRuntimeBlockEditor } from '../../runtime/block-editor';
import type {
  FormDesignerField,
  FormDesignerResult,
} from '../../visual-editor/components/form-designer/form-designer.service';
import type { VisualEditorModelValue } from '../../visual-editor/visual-editor.utils';

type RuntimeFormBlock = LowCodePageFormBlock | LowCodePageSearchFormBlock;
type RuntimeFormMode = 'search' | 'edit';

type DesignerModelField = {
  field: string;
  component: string;
  relateInfoConfig?: unknown;
  defaultValueType?: 'function' | 'procedure';
  defaultValue?: unknown;
  defaultValueProcedure?: string;
};

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function mergeRules(originalRules: LowCodeRule[] = [], designedRules: LowCodeRule[] = []) {
  const designedRequiredRules = designedRules.filter((rule) => rule.required);
  const originalRequiredRules = originalRules.filter((rule) => rule.required);

  return [
    ...originalRules.filter((rule) => !rule.required),
    ...(designedRequiredRules.length
      ? originalRequiredRules.length
        ? originalRequiredRules
        : designedRequiredRules
      : []),
  ];
}

function runtimeFieldToDesignerField(field: LowCodeField): FormDesignerField {
  const props = cloneValue(field.props ?? {});
  const placeholder = typeof props.placeholder === 'string' ? props.placeholder : '';
  const updateScript = readString(field.updateScript) || readString(props.onChange);
  delete props.onChange;

  return {
    field: field.field,
    label: field.label,
    component: field.component,
    placeholder,
    required: field.rules?.some((rule) => rule.required === true) ?? false,
    span: field.span,
    help: field.help,
    defaultValueType: field.defaultValueType,
    defaultValue: cloneValue(field.defaultValue),
    defaultValueProcedure: field.defaultValueProcedure,
    ...(updateScript ? { updateScript } : {}),
    optionsJson: field.options?.length ? JSON.stringify(field.options) : '',
    propsJson: Object.keys(props).length ? JSON.stringify(props) : '',
    props,
  };
}

export function createFormDesignerFieldsFromSchema(
  schema: LowCodeFormSchema,
): FormDesignerField[] {
  return schema.fields.map(runtimeFieldToDesignerField);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function designerModelFields(model: unknown): DesignerModelField[] {
  if (!isRecord(model) || !isRecord(model.pages)) return [];
  const result: DesignerModelField[] = [];

  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;

    blocks.filter(isRecord).forEach((block) => {
      const props = isRecord(block.props) ? block.props : {};
      const field = readString(props.name);
      if (field) {
        const override = readString(props.__lowcodeComponent);
        const componentKey = readString(block.componentKey);
        const component = override || (
          componentKey === 'input'
            ? props.type === 'textarea'
              ? 'vxe-textarea'
              : props.type === 'password'
                ? 'vxe-password-input'
                : 'vxe-input'
            : ({
                picker: 'vxe-select',
                switch: 'vxe-switch',
                radio: 'vxe-radio-group',
                checkbox: 'vxe-checkbox-group',
                'array-table': 'lc-array-table',
                'sub-form': 'lc-sub-form',
                stepper: 'lc-stepper',
                rate: 'lc-rate',
                slider: 'lc-slider',
              } as Record<string, string>)[componentKey] || componentKey
        );
        result.push({
          field,
          component,
          relateInfoConfig: cloneValue(props.relateInfoConfig),
          defaultValueType:
            props.__lowcodeDefaultValueType === 'function' ||
            props.__lowcodeDefaultValueType === 'procedure'
              ? props.__lowcodeDefaultValueType
              : undefined,
          defaultValue: cloneValue(props.__lowcodeDefaultValue),
          defaultValueProcedure: readString(props.__lowcodeDefaultValueProcedure),
        });
      }

      if (isRecord(props.slots)) {
        Object.values(props.slots).filter(isRecord).forEach((slot) => visit(slot.children));
      }
    });
  };

  Object.values(model.pages).filter(isRecord).forEach((page) => visit(page.blocks));
  return result;
}

function isDesignerModelCurrent(block: RuntimeFormBlock) {
  if (!block.formDesignerModel) return false;
  const modelFields = designerModelFields(block.formDesignerModel);
  return modelFields.length === block.schema.fields.length && block.schema.fields.every(
    (field, index) => {
      const modelField = modelFields[index];
      if (!modelField || modelField.field !== field.field || modelField.component !== field.component) {
        return false;
      }

      if (
        field.component === 'base-info' &&
        JSON.stringify(modelField.relateInfoConfig ?? {}) !==
          JSON.stringify(field.props?.relateInfoConfig ?? {})
      ) {
        return false;
      }

      const defaultValueType = field.defaultValueType === 'function' ||
        field.defaultValueType === 'procedure'
        ? field.defaultValueType
        : undefined;
      if (modelField.defaultValueType !== defaultValueType) return false;
      if (defaultValueType === 'function') {
        return JSON.stringify(modelField.defaultValue) === JSON.stringify(field.defaultValue);
      }
      if (defaultValueType === 'procedure') {
        return modelField.defaultValueProcedure === readString(field.defaultValueProcedure);
      }
      return true;
    },
  );
}

function mergeField(
  original: LowCodeField | undefined,
  designed: LowCodeField,
  designerField?: FormDesignerField,
) {
  if (!original) return designed;

  const preserveComponentProps = original.component === designed.component;
  const originalProps = preserveComponentProps ? cloneValue(original.props ?? {}) : {};
  delete originalProps.placeholder;

  const props = {
    ...originalProps,
    ...cloneValue(designed.props ?? {}),
  };
  if (designerField) delete props.onChange;
  const rules = mergeRules(original.rules, designed.rules);
  const merged: LowCodeField = {
    ...cloneValue(original),
    ...cloneValue(designed),
    ...(Object.keys(props).length ? { props } : {}),
    ...(rules.length ? { rules } : {}),
  };
  const legacyDefaultValueScript = readString(
    (original as Record<string, unknown>).defaultValueScript,
  );

  for (const key of [
    'defaultValueType',
    'defaultValue',
    'defaultValueProcedure',
    'updateScript',
    'validationScript',
    'validationMessage',
  ] as const) {
    if (key === 'updateScript' && designerField) {
      const updateScript =
        readString(designerField.updateScript) ||
        readString(designerField.props?.onChange);
      if (updateScript) merged.updateScript = updateScript;
      else delete merged.updateScript;
      continue;
    }
    // The visual designer carries dynamic default metadata on each field.
    // Prefer that value when present, but retain metadata from the original
    // schema when an older designer payload does not include it.
    if (typeof designed[key] !== 'undefined') {
      Object.assign(merged, { [key]: designed[key] });
    } else if (typeof original[key] !== 'undefined') {
      Object.assign(merged, { [key]: original[key] });
    } else delete merged[key];
  }

  for (const key of ['createDisabled', 'editDisabled'] as const) {
    if (typeof original[key] !== 'undefined') merged[key] = original[key];
    else delete merged[key];
  }

  if (
    merged.defaultValueType === 'function' &&
    typeof merged.defaultValue === 'undefined' &&
    legacyDefaultValueScript
  ) {
    merged.defaultValue = legacyDefaultValueScript;
  }
  delete (merged as Record<string, unknown>).defaultValueScript;

  if (!Object.keys(props).length) delete merged.props;
  if (!rules.length) delete merged.rules;
  if (!designed.options) delete merged.options;
  if (!designerField?.help) delete merged.help;
  if (!designed.span) delete merged.span;

  return merged;
}

export function mergeRuntimeFormSchema(
  original: LowCodeFormSchema,
  designed: LowCodeFormSchema,
  designerFields: FormDesignerField[],
) {
  const originalByField = new Map(original.fields.map((field) => [field.field, field]));
  const canMatchByPosition = original.fields.length === designed.fields.length;
  const fields = designed.fields.map((field, index) => {
    const originalField = originalByField.get(field.field) ?? (
      canMatchByPosition ? original.fields[index] : undefined
    );
    return mergeField(originalField, field, designerFields[index]);
  });
  const schema: LowCodeFormSchema = {
    ...cloneValue(original),
    fields,
    actions: cloneValue(original.actions ?? []),
  };

  if (designed.layout?.length) schema.layout = cloneValue(designed.layout);
  else delete schema.layout;

  return schema;
}

export async function openRuntimeFormDesigner(
  block: RuntimeFormBlock,
  mode: RuntimeFormMode,
  runtimeBlockEditor: LowCodeRuntimeBlockEditor,
) {
  const formDesigner = await import(
    '../../visual-editor/components/form-designer/form-designer.service'
  );

  void formDesigner.$$formDesigner({
    title: `${block.title || (mode === 'search' ? '查询表单' : '当前表单')}设计`,
    mode,
    fields: block.schema.fields.map(runtimeFieldToDesignerField),
    layout: block.schema.layout,
    columns: block.schema.columns,
    designerModel: isDesignerModelCurrent(block)
      ? block.formDesignerModel as VisualEditorModelValue
      : null,
    pageData: runtimeBlockEditor.getPageSchema?.(),
    pageRecord: runtimeBlockEditor.getPageRecord?.(),
    serviceApi: runtimeBlockEditor.getServiceApi?.(),
    onConfirm: async (result: FormDesignerResult) => {
      const designedSchema = formDesigner.createLowCodeFormSchemaFromDesignerResult(result);
      await runtimeBlockEditor.updateBlock({
        blockId: block.id,
        changes: {
          schema: mergeRuntimeFormSchema(block.schema, designedSchema, result.fields),
          formDesignerModel: result.designerModel,
          formDesignerUpdatedAt: Date.now(),
        },
      });
    },
  });
}

export function openRuntimeFormContextMenu(
  event: MouseEvent,
  actions: {
    onDesignForm: () => void;
    onDesignField: () => void;
  },
) {
  VxeUI.contextMenu.openByEvent(event, {
    className: 'enlearn-context-menu',
    options: [
      [
        {
          code: 'design-current-form',
          name: '设计当前表单',
          prefixIcon: 'ri-layout-grid-line',
        },
        {
          code: 'design-current-field',
          name: '设计当前字段',
          prefixIcon: 'ri-edit-box-line',
        },
      ],
    ],
    events: {
      optionClick({ option }) {
        if (option.code === 'design-current-form') actions.onDesignForm();
        if (option.code === 'design-current-field') actions.onDesignField();
      },
    },
  });
}
