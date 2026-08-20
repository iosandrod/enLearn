import LowCodeForm from '../../../components/LowCodeForm.vue';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import type { LowCodeAction, LowCodeFormProps, LowCodeFormSchema } from '../../../types/lowcode';
import {
  createLowCodeFormSchema,
  isPlainRecord,
  readJsonObject,
  readLowCodeFormSchema,
} from '../../../lowcode/visual-converters/helpers';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';

const defaultFields = [
  { field: 'email', label: '邮箱', component: 'vxe-input', placeholder: '请输入邮箱' },
  { field: 'role', label: '角色', component: 'vxe-input', placeholder: '请输入角色' },
];

const defaultActions: LowCodeAction[] = [
  { code: 'submit', label: '查询', type: 'submit', status: 'primary' },
  { code: 'reset', label: '重置', type: 'reset' },
];

const previewSchema: LowCodeFormSchema = createLowCodeFormSchema(defaultFields);
previewSchema.columns = 2;
previewSchema.actions = defaultActions;

function createDesignSchema(props: Record<string, unknown>): LowCodeFormSchema {
  const preservedSchema = readLowCodeFormSchema(props.schema);
  const fields = Array.isArray(props.fields) ? props.fields : preservedSchema?.fields ?? [];
  const schema = createLowCodeFormSchema(fields, props.formDesignerModel, props.schema);
  return preservedSchema ? schema : { ...schema, actions: defaultActions };
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
          {...createDesignFormProps(props)}
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
  events: [],
} as VisualEditorComponent;
