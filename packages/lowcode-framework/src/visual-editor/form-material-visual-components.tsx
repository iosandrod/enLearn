import LowCodeFormField from '../components/LowCodeFormField.vue';
import type { LowCodeField, LowCodeOption } from '../types/lowcode';
import type { VisualEditorComponent } from './visual-editor.utils';

type FormMaterialVisualDefinition = {
  label: string;
  runtimeComponent: string;
  defaultProps?: Record<string, unknown>;
  events?: { label: string; value: string }[];
};

const definitions: Record<string, FormMaterialVisualDefinition> = {
  input: { label: '输入框', runtimeComponent: 'vxe-input' },
  picker: { label: '下拉选择', runtimeComponent: 'vxe-select' },
  switch: { label: '开关', runtimeComponent: 'vxe-switch' },
  checkbox: {
    label: '复选框',
    runtimeComponent: 'vxe-checkbox-group',
    defaultProps: { modelValue: [] },
  },
  radio: { label: '单选框', runtimeComponent: 'vxe-radio-group' },
  stepper: { label: '步进器', runtimeComponent: 'lc-stepper' },
  rate: { label: '评分', runtimeComponent: 'lc-rate' },
  slider: { label: '滑块', runtimeComponent: 'lc-slider' },
  'array-table': { label: '数组表格', runtimeComponent: 'lc-array-table' },
  'sub-form': { label: '子表单', runtimeComponent: 'lc-sub-form' },
};

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptions(value: unknown): LowCodeOption[] {
  return Array.isArray(value)
    ? value.filter(isRecord).map((option) => ({ ...option }) as LowCodeOption)
    : [];
}

function createField(
  componentKey: string,
  props: Record<string, unknown>,
  fallbackField: string,
): LowCodeField {
  const definition = definitions[componentKey];
  const {
    name,
    label,
    required,
    modelValue: _modelValue,
    columns,
    options,
    ...restProps
  } = props;
  const runtimeComponent =
    componentKey === 'input' && restProps.type === 'textarea'
      ? 'vxe-textarea'
      : componentKey === 'input' && restProps.type === 'password'
        ? 'vxe-password-input'
        : definition.runtimeComponent;
  const componentProps = {
    ...(definition.defaultProps ?? {}),
    ...restProps,
    ...(componentKey === 'array-table' ? { columns } : {}),
  };
  const fieldOptions = componentKey === 'picker'
    ? readOptions(columns)
    : readOptions(options);

  return {
    field: readString(name, fallbackField),
    label: readString(label, definition.label),
    component: runtimeComponent,
    ...(Object.keys(componentProps).length ? { props: componentProps } : {}),
    ...(fieldOptions.length ? { options: fieldOptions } : {}),
    ...(required === true ? { rules: [{ required: true, message: '该字段不能为空' }] } : {}),
  };
}

function createPreview(componentKey: string, definition: FormMaterialVisualDefinition) {
  const field = createField(
    componentKey,
    { name: componentKey, label: definition.label, ...(definition.defaultProps ?? {}) },
    componentKey,
  );
  return (
    <div style={{ width: '220px', minWidth: 0 }}>
      <LowCodeFormField
        field={field}
        modelValue={componentKey === 'checkbox' ? [] : componentKey === 'rate' ? 3 : ''}
        options={[
          { label: '选项一', value: 'option1' },
          { label: '选项二', value: 'option2' },
        ]}
      />
    </div>
  );
}

function createVisualComponent(
  componentKey: string,
  definition: FormMaterialVisualDefinition,
): VisualEditorComponent {
  return {
    key: componentKey,
    moduleName: 'formComponents',
    label: definition.label,
    preview: () => createPreview(componentKey, definition),
    render: ({ styles, props, block }) => () => {
      const field = createField(componentKey, props, block._vid);
      const options = componentKey === 'picker'
        ? readOptions(props.columns)
        : readOptions(props.options);
      return (
        <div style={{ ...styles, minWidth: 0 }}>
          <LowCodeFormField
            field={field}
            modelValue={props.modelValue}
            options={options}
            {...{
              'onUpdate:modelValue': (value: unknown) => {
                props.modelValue = value;
              },
            }}
          />
        </div>
      );
    },
    events: definition.events ?? [{ label: '值变化', value: 'update:model-value' }],
    styles: { width: '100%' },
  };
}

export const formMaterialVisualComponents = Object.fromEntries(
  Object.entries(definitions).map(([componentKey, definition]) => [
    componentKey,
    createVisualComponent(componentKey, definition),
  ]),
) as Record<string, VisualEditorComponent>;
