import LowCodeForm from '../../../components/LowCodeForm.vue';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import type { LowCodeFormProps, LowCodeFormSchema } from '../../../types/lowcode';
import {
  createLowCodeFormSchema,
  isPlainRecord,
  readJsonObject,
} from '../../../lowcode/visual-converters/helpers';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';

const previewSchema: LowCodeFormSchema = {
  fields: [
    { field: 'username', label: 'Username', component: 'vxe-input', props: { placeholder: 'Username' }, rules: [{ required: true, message: 'Username is required' }] },
    { field: 'password', label: 'Password', component: 'vxe-password-input', props: { placeholder: 'Password' }, rules: [{ required: true, message: 'Password is required' }] },
  ],
  actions: [],
};

function createDesignSchema(props: Record<string, unknown>) {
  return createLowCodeFormSchema(props.fields, props.formDesignerModel, props.schema);
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
    align: props.inputAlign as LowCodeFormProps['align'],
    titleAlign: props.labelAlign as LowCodeFormProps['titleAlign'],
    titleWidth: props.labelWidth as LowCodeFormProps['titleWidth'],
    titleColon: props.colon === true,
  };
}

function renderEmptyForm() {
  return (
    <div
      style={{
        display: 'grid',
        minHeight: '88px',
        placeItems: 'center',
        color: '#909399',
        fontSize: '13px',
      }}
    >
      当前表单为空
    </div>
  );
}

export default {
  key: 'form',
  moduleName: 'businessComponents',
  label: 'Form',
  preview: () => <LowCodeForm schema={previewSchema} modelValue={{}} />,
  render({ props, styles, block }) {
    const { registerRef } = useGlobalProperties();
    return () => {
      const formProps = createDesignFormProps(props);
      return (
        <div style={{ minHeight: '112px', ...styles, width: '100%', minWidth: 0 }}>
          <LowCodeForm ref={(el) => registerRef(el, block._vid)} {...formProps} />
          {!formProps.schema.fields.length && renderEmptyForm()}
        </div>
      );
    };
  },
  styles: { width: '100%', minHeight: '112px' },
  resize: { height: true, width: true },
  events: [
    { label: 'Submit', value: 'submit' },
    { label: 'Model value changed', value: 'update:model-value' },
  ],
} as VisualEditorComponent;
