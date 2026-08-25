/*
 * @Author: 卜启缘
 * @Date: 2021-06-10 16:23:06
 * @LastEditTime: 2021-07-11 18:36:24
 * @LastEditors: 卜启缘
 * @Description: 组件属性编辑器
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\components\right-attribute-panel\components\attr-editor\index.tsx
 */
import { computed, defineComponent, inject, ref, watch } from 'vue';
import { ElAlert, ElEmpty, ElMessage } from '../../../common/designer-ui';
import LowCodeForm from '../../../../../components/LowCodeForm.vue';
import { useLowCodeHost } from '../../../../../core/host';
import { lowCodeOptionSourceRegistry } from '../../../../../runtime/option-source-registry';
import { useVisualData } from '../../../../hooks/useVisualData';
import {
  applyMaterialPropFieldValue,
  createMaterialPropForm,
  createMaterialPropModel,
  createMaterialPropOptionSources,
  loadDatabaseMaterialPropForm,
  type MaterialPropFormField,
  type MaterialPropFormDefinition,
} from '../../../../material-prop-forms';
import type { LowCodeField, LowCodeFormSchema } from '../../../../../types/lowcode';
import {
  formDesignerPageDataKey,
  formDesignerTableFieldOptionsKey,
} from '../../../../form-designer-context';
import styles from '../../index.module.scss';

const formInputComponentTypeOptionCode = 'form_input_component_type';
const formFieldComponentTypeOptionCode = 'form_field_component_type';
const componentTypeOptionCodes = [
  formFieldComponentTypeOptionCode,
  formInputComponentTypeOptionCode,
] as const;
const componentTypeOptionsSourceKey = '__formInputComponentTypes';

// Runtime field materials reuse a visual editor shell; the original runtime key is preserved on the block.
const componentTypeVisualMap: Record<string, string> = {
  'vxe-input': 'input',
  'vxe-textarea': 'input',
  'vxe-password-input': 'input',
  'vxe-select': 'picker',
  'vxe-tree-select': 'picker',
  'vxe-switch': 'switch',
  'vxe-radio-group': 'radio',
  'vxe-checkbox-group': 'checkbox',
  'lc-cascader': 'picker',
  'lc-number-input': 'input',
  'lc-color-picker': 'input',
  'lc-option-select': 'picker',
  'lc-json-editor': 'input',
  'lc-monaco-editor': 'input',
  'base-info': 'input',
  'lc-array-table': 'array-table',
  'lc-sub-form': 'sub-form',
};

const editorDefaultRuntimeMap: Record<string, string | undefined> = {
  input: 'vxe-input',
  picker: 'vxe-select',
  switch: 'vxe-switch',
  radio: 'vxe-radio-group',
  checkbox: 'vxe-checkbox-group',
  'array-table': 'lc-array-table',
  'sub-form': 'lc-sub-form',
};

const defaultCodeEditorProps = {
  dialog: true,
  dialogTitle: '编辑表单代码',
  language: 'javascript',
  theme: 'vs',
  scriptThisType: 'LowCodeButtonScriptThis',
  contextDrawer: true,
  contextDrawerTitle: '当前页面上下文',
  editorHeight: 'min(500px, calc(100vh - 250px))',
  editorOptions: {
    wordWrap: 'on',
    formatOnPaste: true,
    formatOnType: true,
  },
};

type ComponentTypeOption = {
  label: string;
  value: string;
  componentKey: string;
  runtimeComponent?: string;
  disabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function createDefaultChoiceOptions() {
  return [
    { label: '选项一', value: 'option1' },
    { label: '选项二', value: 'option2' },
  ];
}

export const AttrEditor = defineComponent({
  setup() {
    const { currentBlock, jsonData, historyState, visualConfig } = useVisualData();
    const host = useLowCodeHost();
    const designerPageData = inject(formDesignerPageDataKey, null);
    const injectedTableFieldOptions = inject(formDesignerTableFieldOptionsKey, null);
    const definition = ref<MaterialPropFormDefinition | null>(null);
    const loading = ref(false);
    const loadError = ref('');
    const systemComponentTypeOptions = ref<ComponentTypeOption[]>([]);
    let loadSequence = 0;
    const tableFieldPageData = computed(() => designerPageData?.value ?? jsonData);
    const currentComponentMeta = computed(() => {
      const componentKey = currentBlock.value?.componentKey;
      return componentKey ? visualConfig.componentMap[componentKey] : undefined;
    });
    const isFormInputComponentBlock = computed(() => {
      const block = currentBlock.value;
      return Boolean(
        block?._vid &&
        (block.moduleName === 'formComponents' ||
          currentComponentMeta.value?.moduleName === 'formComponents'),
      );
    });
    const optionSources = computed(() => {
      const sources = createMaterialPropOptionSources(
        jsonData.models,
        tableFieldPageData.value,
      );
      if (injectedTableFieldOptions) {
        sources.__visualTableFields = injectedTableFieldOptions.value;
      }
      return sources;
    });

    const registeredComponentTypeOptions = computed<ComponentTypeOption[]>(() => {
      const seen = new Set<string>();
      const registered = visualConfig.componentModules.formComponents
        .filter((component) => {
          if (seen.has(component.key)) return false;
          seen.add(component.key);
          return true;
        })
        .map((component) => ({
          label: component.label || component.key,
          value: component.key,
          componentKey: component.key,
          runtimeComponent: editorDefaultRuntimeMap[component.key],
          disabled: false,
        }));
      if (!seen.has('lc-monaco-editor')) {
        registered.push({
          label: '代码输入框',
          value: 'lc-monaco-editor',
          componentKey: 'input',
          runtimeComponent: 'lc-monaco-editor',
          disabled: false,
        });
      }
      return registered;
    });

    const componentTypeOptions = computed(() => {
      const options = systemComponentTypeOptions.value.length
        ? systemComponentTypeOptions.value
        : registeredComponentTypeOptions.value;
      const hasCodeEditorOption = options.some(
        (option) =>
          option.value === 'lc-monaco-editor' ||
          option.runtimeComponent === 'lc-monaco-editor',
      );
      if (hasCodeEditorOption) return options;

      const fallbackCodeEditor = registeredComponentTypeOptions.value.find(
        (option) => option.runtimeComponent === 'lc-monaco-editor',
      );
      return fallbackCodeEditor ? [...options, fallbackCodeEditor] : options;
    });

    const componentTypeFormSchema = computed<LowCodeFormSchema>(() => ({
      fields: [
        {
          field: 'componentKey',
          label: '组件类型',
          component: 'vxe-select',
          optionsSourceKey: componentTypeOptionsSourceKey,
          props: {
            clearable: false,
            filterable: true,
            placeholder: '请选择组件类型',
          },
        },
      ],
      layout: [],
      actions: [],
    }));

    const componentTypeFormModel = computed(() => {
      const block = currentBlock.value;
      if (!block) return { componentKey: '' };

      const runtimeComponent =
        readString(block.props?.__lowcodeComponent) ||
        (block.componentKey === 'input' && block.props?.type === 'textarea'
          ? 'vxe-textarea'
          : block.componentKey === 'input' && block.props?.type === 'password'
            ? 'vxe-password-input'
            : editorDefaultRuntimeMap[block.componentKey]);
      const selected = componentTypeOptions.value.find(
        (option) =>
          !option.disabled &&
          (runtimeComponent
            ? option.runtimeComponent === runtimeComponent
            : option.componentKey === block.componentKey),
      );

      return { componentKey: selected?.value ?? block.componentKey ?? '' };
    });

    const componentTypeFormOptionSources = computed(() => ({
      [componentTypeOptionsSourceKey]: componentTypeOptions.value,
    }));

    const normalizeComponentTypeOptions = (value: unknown): ComponentTypeOption[] => {
      if (!Array.isArray(value)) return [];

      const seen = new Set<string>();
      return value
        .map((option): ComponentTypeOption | null => {
          const optionRecord = isRecord(option) ? option : {};
          const nextValue = readString(optionRecord.value ?? option);
          const componentKey = componentTypeVisualMap[nextValue] ?? nextValue;
          const component = componentKey ? visualConfig.componentMap[componentKey] : undefined;
          const runtimeComponent =
            componentTypeVisualMap[nextValue]
              ? nextValue
              : editorDefaultRuntimeMap[componentKey];
          const dedupeKey = runtimeComponent || `editor:${componentKey}`;
          if (
            !nextValue ||
            seen.has(dedupeKey) ||
            !component ||
            component.moduleName !== 'formComponents'
          ) {
            return null;
          }

          seen.add(dedupeKey);
          return {
            label: readString(optionRecord.label) || component.label || nextValue,
            value: nextValue,
            componentKey,
            runtimeComponent,
            disabled: optionRecord.disabled === true,
          };
        })
        .filter((option): option is ComponentTypeOption => Boolean(option));
    };

    const loadComponentTypeOptions = async () => {
      try {
        const sources = await lowCodeOptionSourceRegistry.refresh(
          [...componentTypeOptionCodes],
          () => host.getServiceApi(),
        );
        systemComponentTypeOptions.value = normalizeComponentTypeOptions(
          componentTypeOptionCodes.flatMap((code) => sources[code] ?? []),
        );
      } catch (error) {
        systemComponentTypeOptions.value = [];
      }
    };

    void loadComponentTypeOptions();

    watch(
      () => currentBlock.value?.componentKey,
      async (componentKey) => {
        const sequence = ++loadSequence;
        definition.value = null;
        loadError.value = '';
        if (!componentKey) {
          loading.value = false;
          return;
        }

        loading.value = true;
        try {
          const loaded = await loadDatabaseMaterialPropForm(host.getServiceApi(), componentKey);
          if (sequence === loadSequence) definition.value = loaded;
        } catch (error) {
          if (sequence === loadSequence) {
            loadError.value = error instanceof Error ? error.message : '属性表单加载失败';
          }
        } finally {
          if (sequence === loadSequence) loading.value = false;
        }
      },
      { immediate: true },
    );

    const applyComponentTypeDefaults = (
      previousComponentKey: string,
      nextComponentKey: string,
    ) => {
      const block = currentBlock.value;
      if (!block?._vid) return;

      const props = block.props ?? {};
      block.props = props;
      const previousComponent = visualConfig.componentMap[previousComponentKey];
      const existingLabel = readString(block.label);
      const hasCustomLabel = Boolean(
        readString(props.label) ||
        (existingLabel && existingLabel !== previousComponent?.label),
      );

      if (hasCustomLabel && !readString(props.label)) {
        props.label = existingLabel;
      }

      delete props.__lowcodeComponent;

      if (nextComponentKey === 'picker' && !Array.isArray(props.columns)) {
        props.columns = Array.isArray(props.options)
          ? cloneValue(props.options)
          : Array.isArray(props.__lowcodeOptions)
            ? cloneValue(props.__lowcodeOptions)
            : createDefaultChoiceOptions();
      }

      if (
        (nextComponentKey === 'radio' || nextComponentKey === 'checkbox') &&
        !Array.isArray(props.options)
      ) {
        props.options = Array.isArray(props.columns)
          ? cloneValue(props.columns)
          : Array.isArray(props.__lowcodeOptions)
            ? cloneValue(props.__lowcodeOptions)
            : createDefaultChoiceOptions();
      }

      if (nextComponentKey === 'checkbox' && !Array.isArray(props.modelValue)) {
        props.modelValue = [];
      }
      if (nextComponentKey === 'switch' && props.modelValue === undefined) {
        props.modelValue = false;
      }
    };

    const changeComponentType = (value: unknown) => {
      const block = currentBlock.value;
      if (!block?._vid) return;

      const selectedOption = componentTypeOptions.value.find(
        (option) => option.value === readString(value),
      );
      const requestedValue = readString(value);
      const nextComponentKey =
        selectedOption?.componentKey ??
        componentTypeVisualMap[requestedValue] ??
        requestedValue;
      const nextRuntimeComponent = selectedOption?.runtimeComponent;
      const previousComponentKey = block.componentKey ?? '';
      if (
        !nextComponentKey ||
        (nextComponentKey === previousComponentKey &&
          nextRuntimeComponent === readString(block.props?.__lowcodeComponent))
      ) return;

      const component = visualConfig.componentMap[nextComponentKey];
      const isAllowedOption = Boolean(selectedOption && !selectedOption.disabled);
      if (!component || component.moduleName !== 'formComponents' || !isAllowedOption) {
        ElMessage.warning(`组件类型“${requestedValue || nextComponentKey}”未注册`);
        return;
      }

      applyComponentTypeDefaults(previousComponentKey, component.key);
      if (nextRuntimeComponent === 'lc-monaco-editor') {
        const editorOptions = isRecord(block.props.editorOptions)
          ? block.props.editorOptions
          : {};
        Object.assign(block.props, {
          ...defaultCodeEditorProps,
          dialog: block.props.dialog !== false,
          dialogTitle: readString(block.props.dialogTitle) || defaultCodeEditorProps.dialogTitle,
          language: readString(block.props.language) || defaultCodeEditorProps.language,
          theme: readString(block.props.theme) || defaultCodeEditorProps.theme,
          editorOptions: {
            ...defaultCodeEditorProps.editorOptions,
            ...editorOptions,
          },
        });
      }
      if (
        nextRuntimeComponent &&
        nextRuntimeComponent !== editorDefaultRuntimeMap[nextComponentKey]
      ) {
        block.props.__lowcodeComponent = nextRuntimeComponent;
      } else {
        delete block.props.__lowcodeComponent;
      }
      if (nextRuntimeComponent === 'vxe-textarea') {
        block.props.type = 'textarea';
      } else if (nextRuntimeComponent === 'vxe-password-input') {
        block.props.type = 'password';
      } else {
        delete block.props.type;
      }
      block.componentKey = component.key;
      block.moduleName = component.moduleName;
      if (!readString(block.props?.label)) {
        block.label = component.label;
      }
      block.draggable = component.draggable ?? true;
      block.showStyleConfig = component.showStyleConfig ?? true;
      block.events = component.events || [];
    };

    const handleComponentTypeFormChange = (payload: {
      field: LowCodeField;
      value: unknown;
    }) => {
      if (payload.field.field === 'componentKey') {
        changeComponentType(payload.value);
      }
    };

    const renderComponentTypeEditor = () => {
      if (!isFormInputComponentBlock.value) return null;

      return (
        <div class={styles.componentTypeEditor}>
          <LowCodeForm
            key={`${currentBlock.value._vid}-component-type-${historyState.restoreVersion}`}
            className={styles.componentTypeForm}
            schema={componentTypeFormSchema.value}
            modelValue={componentTypeFormModel.value}
            optionSources={componentTypeFormOptionSources.value}
            titleWidth={64}
            titleAsterisk={false}
            span={24}
            padding={false}
            onFieldChange={handleComponentTypeFormChange}
          />
        </div>
      );
    };

    const formState = computed(() => {
      const block = currentBlock.value;
      if (!block || !definition.value) return null;
      const schema = createMaterialPropForm(definition.value, block);

      return {
        schema,
        model: createMaterialPropModel(block, schema.fields),
        optionSources: optionSources.value,
      };
    });

    const handleFieldChange = (payload: {
      field: LowCodeField;
      value: unknown;
    }) => {
      if (!currentBlock.value?._vid) return;
      applyMaterialPropFieldValue(
        currentBlock.value,
        payload.field as MaterialPropFormField,
        payload.value,
      );
    };

    return () => (
      <>
        {!currentBlock.value?._vid ? (
          <ElEmpty description="请选择画布节点" imageSize={96} />
        ) : (
          <>
            {renderComponentTypeEditor()}
            {loading.value ? (
              <ElEmpty description="正在加载属性表单…" imageSize={72} />
            ) : loadError.value ? (
              <ElAlert type="error" title="属性表单加载失败" description={loadError.value} showIcon={true} />
            ) : !formState.value ? (
              <ElEmpty description="该物料尚未配置属性表单" imageSize={96} />
            ) : (
              <div class="material-prop-form flex-1 h-full" style="height: 100%; overflow: auto;">
                <LowCodeForm
                  key={`${currentBlock.value._vid}-${currentBlock.value.componentKey}-${historyState.restoreVersion}`}
                  schema={formState.value!.schema}
                  modelValue={formState.value!.model}
                  optionSources={formState.value!.optionSources}
                  vertical={true}
                  onFieldChange={handleFieldChange}
                />
              </div>
            )}
          </>
        )}
      </>
    );
  },
});
