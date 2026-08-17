import LowCodeForm from '../../../components/LowCodeForm.vue';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import type {
  LowCodeAction,
  LowCodeFormProps,
  LowCodeFormSchema,
} from '../../../types/lowcode';
import {
  createLowCodeFormSchema,
  isPlainRecord,
  readJsonObject,
  readLowCodeFormSchema,
} from '../../../lowcode/visual-converters/helpers';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorJsonProp,
  createEditorTableProp,
} from '../../../visual-editor/visual-editor.props';

const defaultFields = [
  {
    field: 'email',
    label: '邮箱',
    component: 'vxe-input',
    placeholder: '请输入邮箱',
  },
  {
    field: 'role',
    label: '角色',
    component: 'vxe-input',
    placeholder: '请输入角色',
  },
];

const defaultActions: LowCodeAction[] = [
  {
    code: 'submit',
    label: '查询',
    type: 'submit',
    status: 'primary',
  },
  {
    code: 'reset',
    label: '重置',
    type: 'reset',
  },
];

const previewSchema: LowCodeFormSchema = createLowCodeFormSchema(defaultFields);
previewSchema.columns = 2;
previewSchema.actions = defaultActions;

const formComponentOptions = [
  { label: '输入框', value: 'vxe-input' },
  { label: '多行文本', value: 'vxe-textarea' },
  { label: '下拉选择', value: 'vxe-select' },
  { label: '开关', value: 'vxe-switch' },
  { label: '密码框', value: 'vxe-password-input' },
  { label: '数字输入', value: 'lc-number-input' },
  { label: 'JSON 编辑器', value: 'lc-json-editor' },
  { label: '代码编辑器', value: 'lc-monaco-editor' },
  { label: '关联资料', value: 'base-info' },
  { label: '表格输入', value: 'lc-array-table' },
  { label: '子表单', value: 'lc-sub-form' },
];

function createDesignSchema(props: Record<string, unknown>): LowCodeFormSchema {
  const preservedSchema = readLowCodeFormSchema(props.schema);
  const fields = Array.isArray(props.fields)
    ? props.fields
    : preservedSchema?.fields ?? [];
  const schema = createLowCodeFormSchema(
    fields,
    props.formDesignerModel,
    props.schema,
  );

  return preservedSchema
    ? schema
    : {
        ...schema,
        actions: defaultActions,
      };
}

function createDesignModel(props: Record<string, unknown>) {
  if (isPlainRecord(props.modelValue)) return props.modelValue;
  return readJsonObject(props.initialValuesJson, {});
}

function createDesignFormProps(props: Record<string, unknown>): LowCodeFormProps {
  return {
    schema: createDesignSchema(props),
    modelValue: createDesignModel(props),
    optionSources: isPlainRecord(props.optionSources) ? props.optionSources : {},
    loading: props.loading === true,
    disabled: props.disabled === true,
    readonly: props.readonly === true,
  };
}

export default {
  key: 'lowcode-search-form',
  moduleName: 'businessComponents',
  label: '查询表单',
  preview: () => <LowCodeForm schema={previewSchema} modelValue={{}} />,
  render({ props, styles, block }) {
    const { registerRef } = useGlobalProperties();
    return () => (
      <div style={{ ...styles, width: '100%', minWidth: 0 }}>
        <LowCodeForm
          ref={(element) => registerRef(element, block._vid)}
          modelValue={{}}
          // {...createDesignFormProps(props)}
          schema={props.schema as LowCodeFormSchema}//
          {...{
            'onUpdate:modelValue': (value: Record<string, unknown>) => {
              props.modelValue = value;
            },
          }}
        />
      </div>
    );
  },
  showStyleConfig: true,
  events: [
   
  ],
  props: {
    blockId: createEditorInputProp({
      label: 'Block ID',
      defaultValue: 'query-form',
    }),
    title: createEditorInputProp({
      label: '标题',
      defaultValue: '查询条件',
    }),
    sourceKey: createEditorInputProp({
      label: '目标数据源',
      defaultValue: 'records',
    }),
    initialValuesJson: createEditorJsonProp({
      label: '初始值',
      defaultValue: '{}',
      rootType: 'object',
      valueMode: 'string',
    }),
    fields: createEditorTableProp({
      label: '查询字段',
      option: {
        showKey: 'label',
        options: [
          { label: '字段', field: 'field' },
          { label: '标签', field: 'label' },
          {
            label: '组件',
            field: 'component',
            component: 'vxe-select',
            minWidth: 132,
            options: formComponentOptions,
          },
          { label: '占位提示', field: 'placeholder' },
          { label: '必填', field: 'required', component: 'vxe-switch', width: 72 },
          { label: '跨列', field: 'span' },
          { label: '帮助文本', field: 'help' },
          {
            label: '选项 JSON',
            field: 'optionsJson',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '[{"label":"A","value":"a"}]',
          },
          {
            label: '属性 JSON',
            field: 'propsJson',
            component: 'lc-json-editor',
            minWidth: 240,
            placeholder: '{"columns":[]}',
          },
        ],
      },
      defaultValue: defaultFields,
    }),
  },
} as VisualEditorComponent;
