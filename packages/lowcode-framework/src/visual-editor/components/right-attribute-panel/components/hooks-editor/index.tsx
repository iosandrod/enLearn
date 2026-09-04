import { computed, defineComponent, onMounted, ref } from 'vue';
import { cloneDeep } from 'lodash-es';
import LowCodeForm from '../../../../../components/LowCodeForm.vue';
import { ElEmpty } from '../../../common/designer-ui';
import type {
  LowCodeExecuteActionHook,
  LowCodeFormSchema,
  LowCodeField,
  LowCodeOption,
} from '../../../../../types/lowcode';
import { useVisualData } from '../../../../hooks/useVisualData';
import { useLowCodeHost } from '../../../../../core/host';
import styles from '../../index.module.scss';

function nodeActionKindForVisualBlock(block: { componentKey?: string; props?: Record<string, unknown> }) {
  const componentKey = block.componentKey ?? '';
  if (componentKey === 'lowcode-search-form') return 'searchForm';
  if (componentKey === 'form' || componentKey === 'lowcode-edit-form') return 'form';
  if (componentKey === 'lowcode-grid') return 'grid';
  if (componentKey === 'lowcode-button-group') return 'buttonGroup';
  if (componentKey === 'approval-workflow-designer') return 'approvalWorkflowDesigner';
  if (componentKey === 'vxe-tabs') return 'tabs';
  if (componentKey === 'lowcode-modal') return 'modal';
  if (componentKey === 'lowcode-drawer') return 'drawer';
  if (componentKey === 'container') return 'container';
  if (componentKey === 'section') return 'section';
  if (block.props?.__lowcodeComponent === 'lowcode-grid') return 'grid';
  return componentKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveActionOptions(value: unknown, nodeKind: string): LowCodeOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .filter((option) => {
      const metadata = isRecord(option.metadata) ? option.metadata : {};
      const optionNodeKind = readString(
        option.node_type ?? option.nodeKind ?? option.node_kind ?? metadata.nodeKind ?? metadata.node_kind,
      );
      return optionNodeKind === nodeKind;
    })
    .map((option) => ({
      label: readString(option.label) || readString(option.name) || readString(option.action_code),
      value: readString(
        option.action_code ?? (isRecord(option.metadata) ? option.metadata.method : option.value),
      ) || readString(option.value),
      rawValue: isRecord(option.metadata)
        ? option.metadata.method ?? option.rawValue ?? option.value
        : option.rawValue ?? option.value,
      disabled: option.disabled === true,
    }))
    .filter((option) => option.label && option.value);
}

function createHooksSchema(actionOptions: LowCodeOption[]): LowCodeFormSchema {
  return {
  fields: [
    {
      field: 'hooks',
      label: 'executeAction 钩子',
      component: 'lc-array-table',
      span: 24,
      props: {
        height: 420,
        rowKey: '__rowKey',
        showSeq: true,
        movable: false,
        copyable: false,
        defaultRow: {
          phase: 'before',
          method: '',
          enabled: true,
          critical: true,
          script: '',
        },
        toolbarButtons: [
          {
            code: 'add',
            label: '新增钩子',
            command: 'add',
            status: 'primary',
          },
        ],
        columns: [
          {
            field: 'name',
            title: '名称',
            component: 'vxe-select',
            minWidth: 170,
            options: actionOptions,
            props: {
              filterable: true,
              allowCreate: true,
              clearable: true,
              placeholder: '选择或输入事件名称',
            },
          },
          {
            field: 'phase',
            title: '阶段',
            component: 'vxe-select',
            width: 92,
            options: [
              { label: '执行前', value: 'before', rawValue: 'before' },
              { label: '执行后', value: 'after', rawValue: 'after' },
            ],
          },
          {
            field: 'script',
            title: '执行脚本',
            component: 'lc-monaco-editor',
            minWidth: 260,
            placeholder: '例如：await this.$source.refresh("records")',
            defaultValue: '',
            props: {
              dialog: true,
              dialogTitle: '编辑按钮执行脚本',
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
            },
          },
          {
            field: 'enabled',
            title: '启用',
            component: 'vxe-switch',
            width: 72,
          },
          {
            field: 'critical',
            title: '失败中断',
            component: 'vxe-switch',
            width: 92,
          },
        ],
      },
    },
  ],
  layout: [{ kind: 'field', field: 'hooks' }],
  actions: [],
  };
}

function normalizeHooks(value: unknown): LowCodeExecuteActionHook[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((hook) => ({
      ...(typeof hook.name === 'string' && hook.name.trim()
        ? { name: hook.name.trim() }
        : {}),
      phase: hook.phase === 'after' ? 'after' : 'before',
      ...(typeof hook.method === 'string' && hook.method.trim()
        ? { method: hook.method.trim() }
        : {}),
      enabled: hook.enabled !== false,
      critical: hook.critical !== false,
      script: typeof hook.script === 'string' ? hook.script : '',
    }));
}

export const HooksEditor = defineComponent({
  name: 'ExecuteActionHooksEditor',
  setup() {
    const { currentBlock, historyState } = useVisualData();
    const host = useLowCodeHost();
    const actionOptions = ref<unknown[]>([]);
    onMounted(async () => {
      actionOptions.value = await host.getServiceApi().invoke<unknown[]>(
        'lowcode',
        'listItems',
        {
          resource: 'lowcode_node_actions',
          filters: { enabled: true },
          sorts: [
            { field: 'node_type', direction: 'asc' },
            { field: 'sort_order', direction: 'asc' },
          ],
          limit: 500,
        },
      );
    });

    const nodeKind = computed(() => nodeActionKindForVisualBlock(currentBlock.value ?? {}));
    const nodeActionOptions = computed(() => resolveActionOptions(
      actionOptions.value,
      nodeKind.value,
    ));
    const schema = computed(() => createHooksSchema(nodeActionOptions.value));
    const model = computed(() => ({
      hooks: cloneDeep(normalizeHooks(currentBlock.value?.hooks)),
    }));
    const editorKey = computed(
      () => `${currentBlock.value?._vid ?? 'empty'}-hooks-${historyState.restoreVersion}`,
    );

    const handleFieldChange = (payload: { field: LowCodeField; value: unknown }) => {
      if (payload.field.field !== 'hooks' || !currentBlock.value?._vid) return;
      currentBlock.value.hooks = normalizeHooks(payload.value).map((hook) =>
        hook.name ? { ...hook, method: hook.name } : hook,
      );
    };

    return () => {
      if (!currentBlock.value?._vid) {
        return <ElEmpty description="请选择画布节点" imageSize={96} />;
      }

      return (
        <div class={styles.hooksEditor}>
          <LowCodeForm
            key={editorKey.value}
            schema={schema.value}
            modelValue={model.value}
            vertical={true}
            onFieldChange={handleFieldChange}
          />
        </div>
      );
    };
  },
});
