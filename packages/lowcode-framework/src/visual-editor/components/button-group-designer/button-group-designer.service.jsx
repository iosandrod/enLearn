import { reactive } from 'vue';
import { ElMessage } from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import { generateNanoid } from '../../utils';
import { openGlobalDialog } from '../../../runtime/global-dialog';

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

const defaultBusiness = {
  blockId: 'button-group',
  title: '按钮组',
  description: '',
  align: 'left',
  gap: 8,
};

const defaultButtons = [
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

function ensureButtonIds(button) {
  const next = {
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

function createInitialButtons(buttons) {
  const source = Array.isArray(buttons) && buttons.length ? buttons : defaultButtons;
  return cloneDeep(source).map(ensureButtonIds);
}

function readString(value, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function readJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeChildrenSource(value) {
  return readJsonArray(value).filter(isRecord);
}

function parseDirectivesJson(value, label) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
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

function normalizeDirectivesJsonValue(value) {
  if (typeof value === 'string') return readString(value, '[]');
  if (Array.isArray(value)) return JSON.stringify(value);
  return '[]';
}

function normalizeButtonForResult(button, indexPath) {
  const fallbackCode = `button_${indexPath.join('_')}`;
  const code = readString(button.code, fallbackCode);
  const label = readString(button.label, code);
  const children = normalizeChildrenSource(button.children).map((child, index) =>
    normalizeButtonForResult(child, [...indexPath, index + 1]),
  );
  const next = {
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

function flattenButtons(buttons, result = []) {
  buttons.forEach((button) => {
    result.push(button);
    const children = normalizeChildrenSource(button.children);
    if (children.length) {
      flattenButtons(children, result);
    }
  });
  return result;
}

function createInitialBusiness(option) {
  return {
    ...defaultBusiness,
    ...(option.business ?? {}),
  };
}

function createDesignerState(option) {
  return reactive({
    business: createInitialBusiness(option),
    buttonsForm: {
      buttons: createInitialButtons(option.buttons),
    },
  });
}

function createDesignerFormModels(state) {
  return reactive({
    [BUTTONS_FORM_ID]: state.buttonsForm,
    [INFO_FORM_ID]: state.business,
  });
}

function readButtonsModel(formModels) {
  const model = formModels[BUTTONS_FORM_ID];
  const buttons = Array.isArray(model?.buttons) ? model.buttons : [];
  return buttons.map((button) => ensureButtonIds(button));
}

function readBusinessModel(formModels) {
  return {
    ...defaultBusiness,
    ...(formModels[INFO_FORM_ID] ?? {}),
  };
}

function validateAndBuildResult(formModels) {
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
    };
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '按钮组配置格式不正确');
    return null;
  }
}

function isRecord(value) {
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
    {
      field: 'children',
      title: '子按钮 JSON',
      component: 'lc-json-editor',
      minWidth: 260,
      defaultValue: [],
      props: {
        rows: 3,
        placeholder: '[{ "code": "import", "label": "导入" }]',
      },
    },
  ];
}

function createDesignerBlocks() {
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
                      addText: '新增按钮',
                      toolbarAlign: 'left',
                      rowKey: '__id',
                      preserveRowKey: true,
                      minRows: 1,
                      movable: true,
                      copyable: true,
                      removable: true,
                      actionWidth: 128,
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

function isButtonGroupDesignerResult(value) {
  return typeof value === 'object' && value !== null && 'business' in value && 'buttons' in value;
}

export function $$buttonGroupDesigner(option) {
  const state = createDesignerState(option);
  const formModels = createDesignerFormModels(state);

  return openGlobalDialog({
    title: option.title || '按钮组设计',
    width: 'min(1280px, calc(100vw - 40px))',
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

    return new Promise(() => undefined);
  });
}
