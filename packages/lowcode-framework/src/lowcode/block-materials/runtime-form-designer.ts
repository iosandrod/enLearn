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

  return {
    field: field.field,
    label: field.label,
    component: field.component,
    placeholder,
    required: field.rules?.some((rule) => rule.required === true) ?? false,
    span: field.span,
    help: field.help,
    optionsJson: field.options?.length ? JSON.stringify(field.options) : '',
    propsJson: Object.keys(props).length ? JSON.stringify(props) : '',
    props,
  };
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
  const rules = mergeRules(original.rules, designed.rules);
  const merged: LowCodeField = {
    ...cloneValue(original),
    ...cloneValue(designed),
    ...(Object.keys(props).length ? { props } : {}),
    ...(rules.length ? { rules } : {}),
  };

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
    designerModel: (block.formDesignerModel as VisualEditorModelValue | undefined) ?? null,
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

export function openRuntimeFormContextMenu(event: MouseEvent, onDesign: () => void) {
  VxeUI.contextMenu.openByEvent(event, {
    className: 'enlearn-context-menu',
    options: [
      [
        {
          code: 'design-current-form',
          name: '设计当前表单',
          prefixIcon: 'ri-layout-grid-line',
        },
      ],
    ],
    events: {
      optionClick({ option }) {
        if (option.code === 'design-current-form') onDesign();
      },
    },
  });
}
