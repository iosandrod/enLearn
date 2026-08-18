import LowCodeForm from '../../../components/LowCodeForm.vue';
import { isLowCodeFormSchema } from '../../../lowcode/form-schema';
import type { LowCodeFormProps, LowCodeFormSchema } from '../../../types/lowcode';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorInputNumberProp,
  createEditorInputProp,
  createEditorJsonProp,
  createEditorModelBindProp,
} from '../../../visual-editor/visual-editor.props';

const defaultSchema: LowCodeFormSchema = {
  fields: [
    {
      field: 'name',
      label: 'Name',
      component: 'vxe-input',
      props: {
        placeholder: 'Enter name',
      },
      span: 1,
    },
    {
      field: 'remark',
      label: 'Remark',
      component: 'vxe-textarea',
      props: {
        placeholder: 'Enter remark',
      },
      span: 1,
    },
  ],
  actions: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createLowCodeFormProps(
  props: Record<string, unknown>,
  schema: LowCodeFormSchema,
): LowCodeFormProps {
  return {
    ...(props as Partial<LowCodeFormProps>),
    schema,
    modelValue: isRecord(props.modelValue) ? props.modelValue : {},
  };
}

export default {
  key: 'sub-form',
  moduleName: 'baseWidgets',
  label: 'Sub Form',
  preview: () => (
    <div
      style={{
        display: 'grid',
        width: '220px',
        gap: '8px',
      }}
    >
      <div style={{ color: '#475569', fontSize: '13px' }}>Sub Form</div>
      <LowCodeForm schema={defaultSchema} modelValue={{}} />
    </div>
  ),
  render: ({ styles, props }) => {
    return () => {
      const schema = isLowCodeFormSchema(props.schema) ? props.schema : null;

      return (
        <div style={{ ...styles, width: '100%', minWidth: 0 }}>
          {schema ? (
            <LowCodeForm
              {...createLowCodeFormProps(props, schema)}
              {...{
                'onUpdate:modelValue': (value: Record<string, unknown>) => {
                  props.modelValue = value;
                },
              }}
            />
          ) : (
            <div
              role="alert"
              style={{
                display: 'grid',
                minHeight: '48px',
                placeItems: 'center',
                color: '#b42318',
                fontSize: '12px',
              }}
            >
              子表单 Schema 未配置
            </div>
          )}
        </div>
      );
    };
  },
  props: {
    modelValue: createEditorJsonProp({
      label: 'Model Value',
      defaultValue: {},
    }),
    schema: createEditorJsonProp({
      label: 'Form Schema',
      defaultValue: defaultSchema,
    }),
    name: createEditorModelBindProp({ label: 'Field Binding', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Sub Form' }),
    __formSpan: createEditorInputNumberProp({
      label: 'Form Span',
      defaultValue: 1,
      min: 1,
      max: 6,
    }),
    __formHelp: createEditorInputProp({
      label: 'Help Text',
      defaultValue: '',
    }),
  },
  events: [{ label: 'Model value changed', value: 'update:model-value' }],
  resize: {
    width: true,
  },
  model: {
    default: 'Field Binding',
  },
} as VisualEditorComponent;
