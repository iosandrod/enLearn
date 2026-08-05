import { reactive } from 'vue';
import { ElMessage } from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import type { LowCodePageBlock, LowCodeRuntimeDirective } from '../../../types/lowcode';
import { generateNanoid } from '../../utils';
import { openGlobalDialog } from '../../../runtime/global-dialog';

export type ButtonGroupDesignerButton = {
  __id?: string;
  code?: string;
  label?: string;
  status?: string;
  type?: string;
  route?: string;
  eventName?: string;
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
};

type ButtonGroupDesignerState = {
  business: ButtonGroupDesignerBusinessInfo;
  buttonsForm: {
    buttons: ButtonGroupDesignerButton[];
  };
};

const BUTTONS_FORM_ID = 'button-group-designer-buttons-form';
const INFO_FORM_ID = 'button-group-designer-info-form';

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

const defaultButtons: ButtonGroupDesignerButton[] = [
  {
    code: 'create',
    label: '新增',
    status: 'primary',
    type: 'button',
    eventName: 'buttonGroup.create',
    directivesJson: '[]',
  },
  {
    code: 'more',
    label: '更多',
    type: 'button',
    eventName: 'buttonGroup.more',
    directivesJson: '[]',
    children: [
      {
        code: 'import',
        label: '导入',
        type: 'button',
        eventName: 'buttonGroup.import',
        directivesJson: '[]',
      },
      {
        code: 'export',
        label: '导出',
        type: 'button',
        eventName: 'buttonGroup.export',
        directivesJson: '[]',
      },
    ],
  },
];

function ensureButtonIds(button: ButtonGroupDesignerButton): ButtonGroupDesignerButton {
  const next: ButtonGroupDesignerButton = {
    ...button,
    __id: button.__id || `button_${generateNanoid()}`,
    type: button.type || 'button',
    status: button.status || '',
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
    code,
    label,
    type: readString(button.type, 'button'),
    status: readString(button.status),
    route: readString(button.route),
    eventName: readString(button.eventName),
    disabled: Boolean(button.disabled),
    directivesJson: normalizeDirectivesJsonValue(button.directivesJson),
  };

  if (children.length) {
    next.children = children;
  }

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

function createButtonArrayColumns() {
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
      component: 'vxe-textarea',
      minWidth: 260,
      defaultValue: '[]',
      props: {
        rows: 3,
        placeholder: '[]',
      },
    },
  ];
}

function createDesignerBlocks(): LowCodePageBlock[] {
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
                          command: 'add',
                          status: 'primary',
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
                      defaultRow: {
                        label: '按钮',
                        code: '',
                        status: '',
                        type: 'button',
                        route: '',
                        eventName: '',
                        disabled: false,
                        directivesJson: '[]',
                        children: [],
                      },
                      columns: createButtonArrayColumns(),
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
        blocks: createDesignerBlocks(),
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
        onClick: () => {
          const result = validateAndBuildResult(formModels);
          if (!result) return false;

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
