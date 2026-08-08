import { computed, reactive } from 'vue';
import { ElMessage } from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import type {
  LowCodePageBlock,
  LowCodeRuntimeDirective,
} from '../../../types/lowcode';
import type { ArrayTableToolbarExecutionContext } from '../../../lowcode/form-materials/lc-array-table/index.vue';
import {
  createBuiltinLowCodeActionEditorRow,
  createDefaultButtonGroupEditorRows,
  getBuiltinLowCodeActionPresets,
  type BuiltinLowCodeActionKey,
  type LowCodeBuiltinActionSelection,
} from '../../../lowcode/actions/builtins';
import { generateNanoid } from '../../utils';
import { openGlobalDialog } from '../../../runtime/global-dialog';
import type { LowCodeContextSource } from '../../../runtime/lowcode-context';
import { registerButtonScriptMonacoTypes } from './button-script-monaco';

export type ButtonGroupDesignerButton = {
  __id?: string;
  code?: string;
  label?: string;
  status?: string;
  type?: string;
  route?: string;
  eventName?: string;
  script?: string;
  disabled?: boolean;
  directivesJson?: unknown;
  children?: ButtonGroupDesignerButton[] | string;
  [key: string]: unknown;
};

export type ButtonGroupDesignerBusinessInfo = {
  blockId: string;
  title: string;
  description: string;
  align: string;
  gap: string | number;
};

export type ButtonGroupDesignerResult = {
  business: ButtonGroupDesignerBusinessInfo;
  buttons: ButtonGroupDesignerButton[];
};

type ButtonGroupDesignerServiceOption = {
  title?: string;
  business?: Partial<ButtonGroupDesignerBusinessInfo> | null;
  buttons?: ButtonGroupDesignerButton[] | null;
  scriptContext?: LowCodeContextSource;
  onConfirm?: (result: ButtonGroupDesignerResult) => Promise<void> | void;
};

type ButtonGroupDesignerState = {
  business: ButtonGroupDesignerBusinessInfo;
  buttonsForm: {
    buttons: ButtonGroupDesignerButton[];
  };
};

type DefaultButtonPickerRow = {
  key: BuiltinLowCodeActionKey;
  label: string;
  code: string;
  selectionLabel: string;
  typeLabel: string;
  availabilityLabel: string;
  checked: boolean;
  disabled: boolean;
};

const BUTTONS_FORM_ID = 'button-group-designer-buttons-form';
const INFO_FORM_ID = 'button-group-designer-info-form';

function executeAddToolbarAction({ action, addRow }: ArrayTableToolbarExecutionContext) {
  return addRow(action.row);
}

function describeSelection(selection: LowCodeBuiltinActionSelection) {
  if (selection === 'single') return '选中一条记录';
  if (selection === 'multiple') return '可选多条记录';
  return '无需选中记录';
}

function collectButtonCodes(
  button: unknown,
  result: Set<string> = new Set<string>(),
) {
  if (!isRecord(button)) return result;

  const code = readString(button.code);
  if (code) result.add(code);
  normalizeChildrenSource(button.children).forEach((child) =>
    collectButtonCodes(child, result),
  );
  return result;
}

function collectConfiguredButtonCodes(buttons: Record<string, unknown>[]) {
  const result = new Set<string>();
  buttons.forEach((button) => collectButtonCodes(button, result));
  return result;
}

function createDefaultButtonPickerRows(
  buttons: Record<string, unknown>[],
): DefaultButtonPickerRow[] {
  const configuredCodes = collectConfiguredButtonCodes(buttons);

  return getBuiltinLowCodeActionPresets().map((preset) => {
    const actionCodes = [...collectButtonCodes(preset.action)];
    const code = readString(preset.action.code);
    const rootExists = configuredCodes.has(code);
    const disabled = actionCodes.some((actionCode) => configuredCodes.has(actionCode));

    return {
      key: preset.key,
      label: readString(preset.action.label, code),
      code,
      selectionLabel: describeSelection(preset.selection),
      typeLabel: Array.isArray(preset.action.children) && preset.action.children.length
        ? '下拉按钮'
        : '普通按钮',
      availabilityLabel: rootExists ? '已添加' : disabled ? '子按钮已存在' : '可添加',
      checked: false,
      disabled,
    };
  });
}

function appendBuiltinButtons(
  keys: BuiltinLowCodeActionKey[],
  rows: Record<string, unknown>[],
  addRow: ArrayTableToolbarExecutionContext['addRow'],
) {
  const selectedKeys = new Set(keys);
  const presets = getBuiltinLowCodeActionPresets()
    .filter((preset) => selectedKeys.has(preset.key))
    .sort(
      (previous, next) =>
        collectButtonCodes(next.action).size - collectButtonCodes(previous.action).size,
    );
  const configuredCodes = collectConfiguredButtonCodes(rows);
  const added: string[] = [];
  const skipped: string[] = [];

  presets.forEach((preset) => {
    const actionCodes = [...collectButtonCodes(preset.action)];
    const label = readString(preset.action.label, readString(preset.action.code));

    if (actionCodes.some((code) => configuredCodes.has(code))) {
      skipped.push(label);
      return;
    }

    addRow(
      createBuiltinLowCodeActionEditorRow(preset.key) as unknown as Record<string, unknown>,
    );
    actionCodes.forEach((code) => configuredCodes.add(code));
    added.push(label);
  });

  if (!added.length) {
    ElMessage.warning('所选默认按钮已存在，未添加重复编码。');
    return;
  }

  const skippedMessage = skipped.length ? `，已跳过重复项：${skipped.join('、')}` : '';
  ElMessage.success(`已添加 ${added.length} 个默认按钮${skippedMessage}`);
}

async function executeSelectDefaultButtons({
  rows,
  addRow,
}: ArrayTableToolbarExecutionContext) {
  const pickerRows = reactive(createDefaultButtonPickerRows(rows));
  const confirmDisabled = computed(
    () => !pickerRows.some((row) => row.checked && !row.disabled),
  );
  const result = await openGlobalDialog({
    title: '选择默认按钮',
    width: 'min(760px, calc(100vw - 32px))',
    height: 'min(520px, calc(100vh - 64px))',
    className: 'button-default-picker-dialog',
    props: {
      top: '8vh',
      destroyOnClose: true,
    },
    content: {
      type: 'grid',
      key: 'default-button-picker-grid',
      className: 'button-default-picker-grid',
      style: { minHeight: 0 },
      grid: {
        rows: pickerRows,
        columns: [
          { type: 'checkbox', width: 48, align: 'center' },
          { field: 'label', title: '按钮名称', minWidth: 120 },
          { field: 'code', title: '编码 code', minWidth: 140 },
          { field: 'selectionLabel', title: '使用条件', width: 126 },
          { field: 'typeLabel', title: '类型', width: 100 },
          { field: 'availabilityLabel', title: '状态', width: 110 },
        ],
        props: {
          border: true,
          stripe: true,
          size: 'small',
          height: '100%',
          showOverflow: 'tooltip',
          rowConfig: { keyField: 'key' },
          checkboxConfig: {
            checkField: 'checked',
            checkMethod: ({ row }: { row: DefaultButtonPickerRow }) => !row.disabled,
          },
        },
      },
    },
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '添加所选',
        role: 'confirm',
        status: 'primary',
        disabled: confirmDisabled,
      },
    ],
    onConfirm: () => ({
      payload: pickerRows
        .filter((row) => row.checked && !row.disabled)
        .map((row) => row.key),
    }),
  });

  if (result.action !== 'confirm' || !Array.isArray(result.payload)) return;

  appendBuiltinButtons(
    result.payload.filter((key): key is BuiltinLowCodeActionKey =>
      getBuiltinLowCodeActionPresets().some((preset) => preset.key === key),
    ),
    rows,
    addRow,
  );
}

const statusOptions = [
  { label: '默认', value: '' },
  { label: '主要 primary', value: 'primary' },
  { label: '成功 success', value: 'success' },
  { label: '警告 warning', value: 'warning' },
  { label: '危险 danger', value: 'danger' },
  { label: '信息 info', value: 'info' },
];

const actionTypeOptions = [
  { label: '普通按钮', value: 'button' },
  { label: '提交 submit', value: 'submit' },
  { label: '重置 reset', value: 'reset' },
];

const alignOptions = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' },
  { label: '两端分布', value: 'space-between' },
];

const defaultBusiness: ButtonGroupDesignerBusinessInfo = {
  blockId: 'button-group',
  title: '按钮组',
  description: '',
  align: 'left',
  gap: 8,
};

const defaultButtons: ButtonGroupDesignerButton[] = createDefaultButtonGroupEditorRows();

function ensureButtonIds(button: ButtonGroupDesignerButton): ButtonGroupDesignerButton {
  const next: ButtonGroupDesignerButton = {
    ...button,
    __id: button.__id || `button_${generateNanoid()}`,
    type: button.type || 'button',
    status: button.status || '',
    script: typeof button.script === 'string' ? button.script : '',
    directivesJson:
      typeof button.directivesJson === 'undefined' ? '[]' : button.directivesJson,
  };
  const children = normalizeChildrenSource(button.children);

  if (children.length) {
    next.children = children.map(ensureButtonIds);
  } else {
    delete next.children;
  }

  return next;
}

function createInitialButtons(buttons?: ButtonGroupDesignerButton[] | null) {
  const source = Array.isArray(buttons) && buttons.length ? buttons : defaultButtons;
  return cloneDeep(source).map(ensureButtonIds);
}

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function readJsonArray<T>(value: unknown) {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeChildrenSource(value: unknown): ButtonGroupDesignerButton[] {
  return readJsonArray<ButtonGroupDesignerButton>(value).filter(isRecord);
}

function parseDirectivesJson(value: unknown, label: string): LowCodeRuntimeDirective[] {
  if (Array.isArray(value)) return value as LowCodeRuntimeDirective[];

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as LowCodeRuntimeDirective[];
    } catch {
      // handled below with a row-specific error
    }

    throw new Error(`${label} 的 directives JSON 必须是数组`);
  }

  if (typeof value === 'undefined' || value === null || value === '') {
    return [];
  }

  throw new Error(`${label} 的 directives JSON 必须是数组`);
}

function normalizeDirectivesJsonValue(value: unknown) {
  if (typeof value === 'string') return readString(value, '[]');
  if (Array.isArray(value)) return JSON.stringify(value);
  return '[]';
}

function normalizeButtonForResult(
  button: ButtonGroupDesignerButton,
  indexPath: number[],
): ButtonGroupDesignerButton {
  const fallbackCode = `button_${indexPath.join('_')}`;
  const code = readString(button.code, fallbackCode);
  const label = readString(button.label, code);
  const children = normalizeChildrenSource(button.children).map((child, index) =>
    normalizeButtonForResult(child, [...indexPath, index + 1]),
  );
  const next: ButtonGroupDesignerButton = {
    ...Object.fromEntries(
      Object.entries(button)
        .filter(([key, value]) => key !== '__id' && typeof value !== 'undefined')
        .map(([key, value]) => [key, cloneDeep(value)]),
    ),
    code,
    label,
    type: readString(button.type, 'button'),
    status: readString(button.status),
    route: readString(button.route),
    eventName: readString(button.eventName),
    script: typeof button.script === 'string' ? button.script : '',
    disabled: Boolean(button.disabled),
    directivesJson: normalizeDirectivesJsonValue(button.directivesJson),
  };

  if (children.length) {
    next.children = children;
  } else {
    delete next.children;
  }

  delete next.__id;
  return next;
}

function flattenButtons(
  buttons: ButtonGroupDesignerButton[],
  result: ButtonGroupDesignerButton[] = [],
) {
  buttons.forEach((button) => {
    result.push(button);
    const children = normalizeChildrenSource(button.children);
    if (children.length) {
      flattenButtons(children, result);
    }
  });
  return result;
}

function createInitialBusiness(option: ButtonGroupDesignerServiceOption) {
  return {
    ...defaultBusiness,
    ...(option.business ?? {}),
  };
}

function createDesignerState(option: ButtonGroupDesignerServiceOption) {
  return reactive<ButtonGroupDesignerState>({
    business: createInitialBusiness(option),
    buttonsForm: {
      buttons: createInitialButtons(option.buttons),
    },
  });
}

function createDesignerFormModels(state: ButtonGroupDesignerState) {
  return reactive<Record<string, Record<string, unknown>>>({
    [BUTTONS_FORM_ID]: state.buttonsForm,
    [INFO_FORM_ID]: state.business as unknown as Record<string, unknown>,
  });
}

function readButtonsModel(formModels: Record<string, Record<string, unknown>>) {
  const model = formModels[BUTTONS_FORM_ID];
  const buttons = Array.isArray(model?.buttons) ? model.buttons : [];
  return buttons.map((button) => ensureButtonIds(button as ButtonGroupDesignerButton));
}

function readBusinessModel(formModels: Record<string, Record<string, unknown>>) {
  return {
    ...defaultBusiness,
    ...(formModels[INFO_FORM_ID] ?? {}),
  } as ButtonGroupDesignerBusinessInfo;
}

function validateAndBuildResult(formModels: Record<string, Record<string, unknown>>) {
  try {
    const buttons = readButtonsModel(formModels);
    const business = readBusinessModel(formModels);

    if (!buttons.length) {
      throw new Error('请至少配置一个按钮');
    }

    flattenButtons(buttons).forEach((button, index) => {
      const label = readString(button.label, `第 ${index + 1} 行`);
      if (!readString(button.label) && !readString(button.code)) {
        throw new Error(`${label} 必须填写按钮名称或编码`);
      }
      parseDirectivesJson(button.directivesJson, label);
    });

    return {
      business: {
        ...business,
        blockId: readString(business.blockId, defaultBusiness.blockId),
        title: readString(business.title),
        description: readString(business.description),
        align: readString(business.align, defaultBusiness.align),
        gap: readString(business.gap, String(defaultBusiness.gap)),
      },
      buttons: buttons.map((button, index) =>
        normalizeButtonForResult(button, [index + 1]),
      ),
    } satisfies ButtonGroupDesignerResult;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '按钮组配置格式不正确');
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createButtonRow(label = '按钮'): ButtonGroupDesignerButton {
  return {
    label,
    code: '',
    status: '',
    type: 'button',
    route: '',
    eventName: '',
    script: '',
    disabled: false,
    directivesJson: '[]',
    children: [],
  };
}

function createButtonArrayColumns(scriptContext?: LowCodeContextSource) {
  return [
    {
      field: 'label',
      title: '按钮名称',
      component: 'vxe-input',
      minWidth: 150,
      placeholder: '按钮名称',
    },
    {
      field: 'code',
      title: '编码 code',
      component: 'vxe-input',
      minWidth: 150,
      placeholder: 'create',
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
        contextSource: scriptContext,
        editorHeight: 'min(500px, calc(100vh - 250px))',
        editorOptions: {
          wordWrap: 'on',
          formatOnPaste: true,
          formatOnType: true,
        },
      },
    },
    {
      field: 'status',
      title: '状态',
      component: 'vxe-select',
      width: 140,
      options: statusOptions,
    },
    {
      field: 'type',
      title: '类型',
      component: 'vxe-select',
      width: 140,
      options: actionTypeOptions,
    },
    {
      field: 'route',
      title: '路由',
      component: 'vxe-input',
      minWidth: 180,
      placeholder: '/dashboard/...',
    },
    {
      field: 'eventName',
      title: '事件名',
      component: 'vxe-input',
      minWidth: 180,
      placeholder: 'buttonGroup.click',
    },
    {
      field: 'disabled',
      title: '禁用',
      component: 'vxe-switch',
      width: 80,
    },
    {
      field: 'directivesJson',
      title: 'directives JSON',
      component: 'lc-json-editor',
      minWidth: 260,
      defaultValue: '[]',
      props: {
        rows: 3,
        placeholder: '[]',
        jsonRootType: 'array',
        jsonValueMode: 'string',
      },
    },
  ];
}

function createDesignerBlocks(scriptContext?: LowCodeContextSource): LowCodePageBlock[] {
  return [
    {
      id: 'button-group-designer-tabs',
      kind: 'tabs',
      defaultKey: 'buttons',
      layout: {
        fillRemaining: true,
      },
      tabs: [
        {
          key: 'buttons',
          label: '按钮设计',
          blocks: [
            {
              id: BUTTONS_FORM_ID,
              kind: 'form',
              schema: {
                fields: [
                  {
                    field: 'buttons',
                    label: '按钮配置',
                    component: 'lc-array-table',
                    span: 24,
                    props: {
                      height: 560,
                      toolbarButtons: [
                        {
                          code: 'add',
                          label: '新增按钮',
                          status: 'primary',
                          execute: executeAddToolbarAction,
                        },
                        {
                          code: 'add-dropdown',
                          label: '新增下拉按钮',
                          status: 'primary',
                          row: {
                            ...createButtonRow('下拉按钮'),
                            children: [createButtonRow('下拉项')],
                          },
                          execute: executeAddToolbarAction,
                        },
                        {
                          code: 'select-default',
                          label: '选择默认按钮',
                          status: 'primary',
                          prefixIcon: 'ri-list-check-3',
                          execute: executeSelectDefaultButtons,
                        },
                      ],
                      toolbarAlign: 'left',
                      rowKey: '__id',
                      preserveRowKey: true,
                      treeConfig: {
                        childrenField: 'children',
                        expandAll: true,
                        showLine: true,
                        indent: 20,
                      },
                      minRows: 1,
                      childAddable: true,
                      addChildText: '新增子按钮',
                      movable: true,
                      copyable: true,
                      removable: true,
                      actionWidth: 156,
                      defaultRow: createButtonRow(),
                      columns: createButtonArrayColumns(scriptContext),
                    },
                  },
                ],
                actions: [],
              },
            },
          ],
        },
        {
          key: 'info',
          label: '组件信息',
          blocks: [
            {
              id: INFO_FORM_ID,
              kind: 'form',
              schema: {
                fields: [
                  {
                    field: 'blockId',
                    label: 'Block ID',
                    component: 'vxe-input',
                    props: { placeholder: 'button-group' },
                  },
                  {
                    field: 'title',
                    label: '标题',
                    component: 'vxe-input',
                    props: { placeholder: '按钮组' },
                  },
                  {
                    field: 'description',
                    label: '描述',
                    component: 'vxe-textarea',
                    span: 24,
                    props: { rows: 3 },
                  },
                  {
                    field: 'align',
                    label: '对齐方式',
                    component: 'vxe-select',
                    options: alignOptions,
                  },
                  {
                    field: 'gap',
                    label: '按钮间距',
                    component: 'vxe-input',
                    props: { placeholder: '8' },
                  },
                ],
                actions: [],
              },
            },
          ],
        },
      ],
    },
  ];
}

function isButtonGroupDesignerResult(value: unknown): value is ButtonGroupDesignerResult {
  return typeof value === 'object' && value !== null && 'business' in value && 'buttons' in value;
}

export function $$buttonGroupDesigner(option: ButtonGroupDesignerServiceOption) {
  registerButtonScriptMonacoTypes();
  const state = createDesignerState(option);
  const formModels = createDesignerFormModels(state);

  return openGlobalDialog({
    title: option.title || '按钮组设计',
    width: 'min(1280px, calc(100vw - 40px))',
    height: 'min(760px, calc(100vh - 80px))',
    className: 'button-group-designer-dialog grid-designer-dialog',
    props: {
      top: '4vh',
      destroyOnClose: true,
    },
    content: {
      type: 'lowcodeBlocks',
      lowcode: {
        blocks: createDesignerBlocks(option.scriptContext),
        formModels,
      },
    },
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '确定',
        role: 'custom',
        status: 'primary',
        onClick: async () => {
          const result = validateAndBuildResult(formModels);
          if (!result) return false;

          try {
            await option.onConfirm?.(result);
          } catch (error) {
            ElMessage.error(error instanceof Error ? error.message : '按钮配置保存失败');
            return false;
          }

          return {
            close: true,
            action: 'confirm',
            payload: result,
          };
        },
      },
    ],
  }).then((result) => {
    if (result.action === 'confirm' && isButtonGroupDesignerResult(result.payload)) {
      return result.payload;
    }

    return new Promise<ButtonGroupDesignerResult>(() => undefined);
  });
}
