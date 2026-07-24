import { createApp, defineComponent, getCurrentInstance, nextTick, onMounted, PropType, reactive, ref } from 'vue';
import ElementPlus, { ElButton, ElDialog, ElMessage } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { cloneDeep } from 'lodash-es';
import VisualEditorProvider from '@/components/VisualEditorProvider.vue';
import { visualConfig } from '@/visual.config';
import {
  createNewBlock,
  type VisualEditorBlockData,
  type VisualEditorModelValue,
  type VisualEditorPage,
} from '@/visual-editor/visual-editor.utils';
import { defer } from '@/visual-editor/utils/defer';

export type FormDesignerField = {
  field: string;
  label: string;
  component: string;
  placeholder?: string;
  required?: boolean | string;
  span?: number | string;
  help?: string;
  optionsJson?: string;
};

export type FormDesignerResult = {
  fields: FormDesignerField[];
  designerModel: VisualEditorModelValue;
};

type FormDesignerMode = 'search' | 'edit';

interface FormDesignerServiceOption {
  title?: string;
  mode?: FormDesignerMode;
  fields?: FormDesignerField[];
  designerModel?: VisualEditorModelValue | null;
  onConfirm: (value: FormDesignerResult) => void;
}

type FormProviderInstance = {
  getSnapshot: () => {
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  };
};

const defaultActions: VisualEditorModelValue['actions'] = {
  fetch: {
    name: '接口请求',
    apis: [],
  },
  dialog: {
    name: '对话框',
    handlers: [],
  },
};

const runtimeToEditorComponent: Record<string, string> = {
  'vxe-input': 'input',
  'vxe-textarea': 'input',
  'vxe-password-input': 'input',
  'vxe-select': 'picker',
  'vxe-tree-select': 'picker',
  'vxe-switch': 'switch',
  'vxe-radio-group': 'radio',
  'vxe-checkbox-group': 'checkbox',
};

const editorToRuntimeComponent: Record<string, string> = {
  input: 'vxe-input',
  picker: 'vxe-select',
  switch: 'vxe-switch',
  radio: 'vxe-radio-group',
  checkbox: 'vxe-checkbox-group',
};

const optionComponents = new Set([
  'vxe-select',
  'vxe-tree-select',
  'vxe-radio-group',
  'vxe-checkbox-group',
]);

function normalizeRequired(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  }
  return false;
}

function normalizeSpan(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function readString(value: unknown, fallback = '') {
  if (Array.isArray(value)) {
    return readString(value[value.length - 1], fallback);
  }

  if (typeof value === 'string') {
    return value.trim() || fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

function normalizeFieldName(label: string, index = 0) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  return normalized || `field_${index + 1}`;
}

function isVisualEditorModel(value: unknown): value is VisualEditorModelValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { pages?: unknown }).pages === 'object' &&
    (value as { pages?: unknown }).pages !== null
  );
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringifyOptions(value: unknown) {
  const options = parseJsonArray(value);
  return options?.length ? JSON.stringify(options) : '';
}

function createDefaultField(index = 0): FormDesignerField {
  return {
    field: `field_${index + 1}`,
    label: `字段${index + 1}`,
    component: 'vxe-input',
    placeholder: '请输入',
    required: false,
    span: 1,
    help: '',
    optionsJson: '',
  };
}

function applyCommonFieldProps(block: VisualEditorBlockData, field: FormDesignerField, index: number) {
  const fieldName = readString(field.field, normalizeFieldName(field.label || '', index));
  const label = readString(field.label, fieldName || `字段${index + 1}`);

  block.props.name = fieldName;
  block.props.label = label;
  block.props.placeholder = readString(field.placeholder, '请输入');
  block.props.required = normalizeRequired(field.required);
  block.props.__formSpan = normalizeSpan(field.span) || 1;
  block.props.__formHelp = readString(field.help);
}

function createFieldBlock(field: FormDesignerField, index: number) {
  const runtimeComponent = readString(field.component, 'vxe-input');
  const componentKey = runtimeToEditorComponent[runtimeComponent] || 'input';
  const component = visualConfig.componentMap[componentKey];

  if (!component) return null;

  const block = createNewBlock(cloneDeep(component));
  block.focus = index === 0;
  applyCommonFieldProps(block, field, index);

  if (runtimeComponent === 'vxe-textarea') {
    block.props.type = 'textarea';
  }

  if (runtimeComponent === 'vxe-password-input') {
    block.props.type = 'password';
  }

  if (runtimeComponent === 'vxe-tree-select') {
    block.props.__lowcodeComponent = 'vxe-tree-select';
  }

  const options = parseJsonArray(field.optionsJson);
  if (options?.length) {
    if (componentKey === 'picker') {
      block.props.columns = options;
    }

    if (componentKey === 'radio' || componentKey === 'checkbox') {
      block.props.options = options;
    }
  }

  return block;
}

function normalizeFields(fields: unknown): FormDesignerField[] {
  if (!Array.isArray(fields)) return [];

  return fields.map((field, index) => {
    const row = typeof field === 'object' && field !== null ? (field as Record<string, unknown>) : {};
    const fallback = createDefaultField(index);

    return {
      field: readString(row.field, fallback.field),
      label: readString(row.label, fallback.label),
      component: readString(row.component, fallback.component),
      placeholder: readString(row.placeholder, fallback.placeholder),
      required: normalizeRequired(row.required),
      span: normalizeSpan(row.span) || 1,
      help: readString(row.help),
      optionsJson: readString(row.optionsJson),
    };
  });
}

function createFormModel(fields: FormDesignerField[], title = '表单设计'): VisualEditorModelValue {
  const normalizedFields = fields.length ? fields : [createDefaultField()];
  const blocks = normalizedFields
    .map((field, index) => createFieldBlock(field, index))
    .filter(Boolean) as VisualEditorBlockData[];

  return {
    pages: {
      '/': {
        title,
        path: '/',
        config: {
          bgColor: '',
          bgImage: '',
          keepAlive: false,
        },
        blocks,
      },
    },
    models: [],
    actions: cloneDeep(defaultActions),
  };
}

function resolveInitialModel(option: FormDesignerServiceOption) {
  if (isVisualEditorModel(option.designerModel)) {
    return cloneDeep(option.designerModel);
  }

  return createFormModel(
    normalizeFields(cloneDeep(option.fields)),
    option.title || '表单设计',
  );
}

function flattenBlocks(blocks: VisualEditorBlockData[] = []) {
  const result: VisualEditorBlockData[] = [];

  blocks.forEach((block) => {
    result.push(block);
    const slots = block.props?.slots || {};
    Object.keys(slots).forEach((slotKey) => {
      result.push(...flattenBlocks(slots[slotKey]?.children || []));
    });
  });

  return result;
}

function getRuntimeComponent(block: VisualEditorBlockData) {
  const overrideComponent = readString(block.props?.__lowcodeComponent);
  if (overrideComponent) return overrideComponent;

  if (block.componentKey === 'input') {
    if (block.props?.type === 'textarea') return 'vxe-textarea';
    if (block.props?.type === 'password') return 'vxe-password-input';
  }

  return editorToRuntimeComponent[block.componentKey] || '';
}

function getOptionsJson(block: VisualEditorBlockData, runtimeComponent: string) {
  if (!optionComponents.has(runtimeComponent)) return '';

  if (block.componentKey === 'picker') {
    return stringifyOptions(block.props?.columns);
  }

  return stringifyOptions(block.props?.options);
}

function blockToField(block: VisualEditorBlockData, index: number): FormDesignerField | null {
  const runtimeComponent = getRuntimeComponent(block);
  if (!runtimeComponent) return null;

  const label = readString(block.props?.label, block.label || `字段${index + 1}`);
  const field = readString(block.props?.name, normalizeFieldName(label, index));

  if (!field || !label) return null;

  return {
    field,
    label,
    component: runtimeComponent,
    placeholder: readString(block.props?.placeholder),
    required: normalizeRequired(block.props?.required),
    span: normalizeSpan(block.props?.__formSpan) || normalizeSpan(block.props?.span),
    help: readString(block.props?.__formHelp || block.props?.help),
    optionsJson: getOptionsJson(block, runtimeComponent),
  };
}

function extractFields(page: VisualEditorPage) {
  return flattenBlocks(page.blocks)
    .map((block, index) => blockToField(block, index))
    .filter(Boolean) as FormDesignerField[];
}

function validateFields(fields: FormDesignerField[]) {
  if (!fields.length) {
    ElMessage.error('请至少拖入一个表单项控件');
    return false;
  }

  const invalidField = fields.find((field) => !field.field || !field.label);
  if (invalidField) {
    ElMessage.error('字段绑定和标签不能为空');
    return false;
  }

  const duplicateField = fields.find(
    (field, index) => fields.findIndex((item) => item.field === field.field) !== index,
  );

  if (duplicateField) {
    ElMessage.error(`字段 ${duplicateField.field} 重复`);
    return false;
  }

  return true;
}

const ServiceComponent = defineComponent({
  props: {
    option: { type: Object as PropType<FormDesignerServiceOption>, required: true },
  },
  setup(props) {
    const ctx = getCurrentInstance()!;
    const providerRef = ref<FormProviderInstance | null>(null);

    const state = reactive({
      option: props.option,
      showFlag: false,
      providerKey: 0,
      initialData: createFormModel([], props.option.title || '表单设计'),
      mounted: (() => {
        const dfd = defer();
        onMounted(() => setTimeout(() => dfd.resolve(), 0));
        return dfd.promise;
      })(),
    });

    const methods = {
      service: async (option: FormDesignerServiceOption) => {
        state.option = option;
        state.initialData = resolveInitialModel(option);
        state.providerKey += 1;
        providerRef.value = null;
        await methods.show();
      },
      show: async () => {
        await state.mounted;
        state.showFlag = true;
        await nextTick();
      },
      hide: () => {
        state.showFlag = false;
      },
    };

    const handler = {
      onConfirm: () => {
        const snapshot = providerRef.value?.getSnapshot();
        if (!snapshot) {
          ElMessage.error('表单设计器还未初始化完成');
          return;
        }

        const fields = extractFields(snapshot.currentPage);
        if (!validateFields(fields)) return;

        state.option.onConfirm({
          fields,
          designerModel: snapshot.model,
        });
        methods.hide();
      },
      onCancel: () => {
        methods.hide();
      },
    };

    Object.assign(ctx.proxy!, methods);

    return () => (
      <ElDialog
        v-model={state.showFlag}
        title={state.option.title || '表单设计'}
        width="min(1280px, calc(100vw - 40px))"
        top="4vh"
        class="form-designer-dialog form-workbench-dialog"
        destroyOnClose={true}
      >
        {{
          default: () => (
            <div class="form-workbench">
              <div class="form-workbench-toolbar">
                <div>
                  <strong>表单拖拽设计</strong>
                  <span>拖入表单项控件，选中后在右侧配置字段绑定、标签和校验</span>
                </div>
                {false ? (
                <label>
                  <span>表单列数</span>
                  <input
                    value={1}
                    min={1}
                    max={6}
                    type="number"
                    onInput={() => undefined}
                  />
                </label>
                ) : null}
              </div>
              <VisualEditorProvider
                key={state.providerKey}
                ref={providerRef}
                initialData={state.initialData}
                initialPath="/"
                showHeader={false}
                leftExcludeLabels={['页面', '数据源']}
                leftWidth="300px"
                allowFormDesign={false}
                showPageSetting={false}
                workbenchMode="form"
                persistToSession={false}
              />
            </div>
          ),
          footer: () => (
            <div class="form-workbench-footer">
              <ElButton onClick={handler.onCancel}>取消</ElButton>
              <ElButton type="primary" onClick={handler.onConfirm}>
                确定
              </ElButton>
            </div>
          ),
        }}
      </ElDialog>
    );
  },
});

export const $$formDesigner = (() => {
  let ins: any;
  return (option: Omit<FormDesignerServiceOption, 'onConfirm'>) => {
    if (!ins) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const app = createApp(ServiceComponent, {
        option: {
          ...option,
          onConfirm: () => undefined,
        },
      });
      app.use(ElementPlus, { locale: zhCn });
      app.config.globalProperties.$$refs = {};
      ins = app.mount(el);
    }
    const dfd = defer<FormDesignerResult>();
    ins.service({
      ...option,
      onConfirm: dfd.resolve,
    });
    return dfd.promise;
  };
})();
