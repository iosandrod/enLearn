import { reactive } from 'vue';
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElGrid,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTabPane,
  ElTabs,
} from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import type { LowCodeRuntimeDirective } from '../../../types/lowcode';
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
  directivesJson?: string;
  children?: ButtonGroupDesignerButton[];
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
  activeTab: string;
  business: ButtonGroupDesignerBusinessInfo;
  buttons: ButtonGroupDesignerButton[];
};

type ButtonGroupDesignerMethods = {
  addRoot(): void;
  addChild(row: ButtonGroupDesignerButton): void;
  copy(row: ButtonGroupDesignerButton): void;
  remove(row: ButtonGroupDesignerButton): void;
  move(row: ButtonGroupDesignerButton, offset: number): void;
  reset(): void;
};

type ButtonLocation = {
  siblings: ButtonGroupDesignerButton[];
  index: number;
};

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

function createButton(partial: Partial<ButtonGroupDesignerButton> = {}): ButtonGroupDesignerButton {
  return {
    __id: `button_${generateNanoid()}`,
    code: '',
    label: '按钮',
    status: '',
    type: 'button',
    route: '',
    eventName: '',
    disabled: false,
    directivesJson: '[]',
    ...partial,
  };
}

function ensureButtonIds(button: ButtonGroupDesignerButton): ButtonGroupDesignerButton {
  const next = {
    ...button,
    __id: button.__id || `button_${generateNanoid()}`,
    type: button.type || 'button',
    status: button.status || '',
    directivesJson: button.directivesJson || '[]',
  };

  if (Array.isArray(button.children) && button.children.length) {
    next.children = button.children.map(ensureButtonIds);
  } else {
    delete next.children;
  }

  return next;
}

function createInitialButtons(buttons?: ButtonGroupDesignerButton[] | null) {
  const source = Array.isArray(buttons) && buttons.length ? buttons : defaultButtons;
  return cloneDeep(source).map(ensureButtonIds);
}

function refreshButtonIds(button: ButtonGroupDesignerButton): ButtonGroupDesignerButton {
  button.__id = `button_${generateNanoid()}`;
  button.children?.forEach(refreshButtonIds);
  return button;
}

function findButtonLocation(
  buttons: ButtonGroupDesignerButton[],
  row: ButtonGroupDesignerButton,
): ButtonLocation | null {
  const index = buttons.findIndex((item) => item.__id === row.__id);
  if (index >= 0) {
    return { siblings: buttons, index };
  }

  for (const button of buttons) {
    if (!Array.isArray(button.children)) continue;
    const childLocation = findButtonLocation(button.children, row);
    if (childLocation) return childLocation;
  }

  return null;
}

function isRootButton(buttons: ButtonGroupDesignerButton[], row: ButtonGroupDesignerButton) {
  return buttons.some((button) => button.__id === row.__id);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseDirectivesJson(value: unknown, label: string) {
  const text = readString(value, '[]');

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as LowCodeRuntimeDirective[];
  } catch {
    // handled below with a row-specific error
  }

  throw new Error(`${label} 的 directives JSON 必须是数组`);
}

function normalizeButtonForResult(
  button: ButtonGroupDesignerButton,
  indexPath: number[],
): ButtonGroupDesignerButton {
  const fallbackCode = `button_${indexPath.join('_')}`;
  const code = readString(button.code, fallbackCode);
  const label = readString(button.label, code);
  const children = (button.children ?? []).map((child, index) =>
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
    directivesJson: readString(button.directivesJson, '[]'),
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
    if (Array.isArray(button.children)) {
      flattenButtons(button.children, result);
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
    activeTab: 'buttons',
    business: createInitialBusiness(option),
    buttons: createInitialButtons(option.buttons),
  });
}

function createDesignerMethods(state: ButtonGroupDesignerState): ButtonGroupDesignerMethods {
  return {
    addRoot: () => {
      state.buttons.push(createButton());
    },
    addChild: (row) => {
      if (!isRootButton(state.buttons, row)) {
        ElMessage.warning('下拉按钮暂不支持继续添加子项');
        return;
      }
      row.children ??= [];
      row.children.push(createButton({ label: '下拉按钮' }));
    },
    copy: (row) => {
      const location = findButtonLocation(state.buttons, row);
      if (!location) return;
      const copy = refreshButtonIds(cloneDeep(row));
      location.siblings.splice(location.index + 1, 0, copy);
    },
    remove: (row) => {
      const location = findButtonLocation(state.buttons, row);
      if (!location) return;
      if (state.buttons.length <= 1 && location.siblings === state.buttons) {
        ElMessage.warning('至少保留一个按钮');
        return;
      }
      location.siblings.splice(location.index, 1);
    },
    move: (row, offset) => {
      const location = findButtonLocation(state.buttons, row);
      if (!location) return;
      const targetIndex = location.index + offset;
      if (targetIndex < 0 || targetIndex >= location.siblings.length) return;
      const [button] = location.siblings.splice(location.index, 1);
      location.siblings.splice(targetIndex, 0, button);
    },
    reset: () => {
      state.buttons = createInitialButtons(defaultButtons);
    },
  };
}

function validateAndBuildResult(state: ButtonGroupDesignerState) {
  try {
    if (!state.buttons.length) {
      throw new Error('请至少配置一个按钮');
    }

    flattenButtons(state.buttons).forEach((button, index) => {
      const label = readString(button.label, `第 ${index + 1} 行`);
      if (!readString(button.label) && !readString(button.code)) {
        throw new Error(`${label} 必须填写按钮名称或编码`);
      }
      parseDirectivesJson(button.directivesJson, label);
    });

    return {
      business: {
        ...state.business,
        blockId: readString(state.business.blockId, defaultBusiness.blockId),
        title: readString(state.business.title),
        description: readString(state.business.description),
        align: readString(state.business.align, defaultBusiness.align),
        gap: readString(state.business.gap, String(defaultBusiness.gap)),
      },
      buttons: state.buttons.map((button, index) =>
        normalizeButtonForResult(button, [index + 1]),
      ),
    } satisfies ButtonGroupDesignerResult;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '按钮组配置格式不正确');
    return null;
  }
}

function renderSelectOptions(options: { label: string; value: unknown }[]) {
  return options.map((option) => (
    <ElOption key={String(option.value)} label={option.label} value={option.value} />
  ));
}

function createColumns(
  state: ButtonGroupDesignerState,
  methods: ButtonGroupDesignerMethods,
) {
  return [
    {
      type: 'seq',
      title: '#',
      width: 56,
    },
    {
      field: 'label',
      title: '按钮名称',
      minWidth: 180,
      treeNode: true,
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElInput v-model={row.label} placeholder="按钮名称" />
        ),
      },
    },
    {
      field: 'code',
      title: '编码 code',
      minWidth: 160,
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElInput v-model={row.code} placeholder="create" />
        ),
      },
    },
    {
      field: 'status',
      title: '状态',
      width: 148,
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElSelect v-model={row.status}>{renderSelectOptions(statusOptions)}</ElSelect>
        ),
      },
    },
    {
      field: 'type',
      title: '类型',
      width: 140,
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElSelect v-model={row.type}>{renderSelectOptions(actionTypeOptions)}</ElSelect>
        ),
      },
    },
    {
      field: 'route',
      title: '路由',
      minWidth: 190,
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElInput v-model={row.route} placeholder="/dashboard/..." />
        ),
      },
    },
    {
      field: 'eventName',
      title: '事件名',
      minWidth: 190,
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElInput v-model={row.eventName} placeholder="buttonGroup.click" />
        ),
      },
    },
    {
      field: 'disabled',
      title: '禁用',
      width: 88,
      align: 'center',
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElSwitch v-model={row.disabled} />
        ),
      },
    },
    {
      field: 'directivesJson',
      title: 'directives JSON',
      minWidth: 260,
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <ElInput v-model={row.directivesJson} type="textarea" rows={2} placeholder="[]" />
        ),
      },
    },
    {
      title: '操作',
      width: 280,
      fixed: 'right',
      slots: {
        default: ({ row }: { row: ButtonGroupDesignerButton }) => (
          <div class="button-group-designer-row-actions">
            {isRootButton(state.buttons, row) ? (
              <ElButton text type="primary" onClick={() => methods.addChild(row)}>
                子项
              </ElButton>
            ) : null}
            <ElButton text type="primary" onClick={() => methods.move(row, -1)}>
              上移
            </ElButton>
            <ElButton text type="primary" onClick={() => methods.move(row, 1)}>
              下移
            </ElButton>
            <ElButton text type="primary" onClick={() => methods.copy(row)}>
              复制
            </ElButton>
            <ElButton text type="danger" onClick={() => methods.remove(row)}>
              删除
            </ElButton>
          </div>
        ),
      },
    },
  ];
}

function renderButtonDesigner(
  state: ButtonGroupDesignerState,
  methods: ButtonGroupDesignerMethods,
) {
  return (
    <div class="button-group-designer-panel">
      <div class="grid-designer-actions">
        <ElButton type="primary" onClick={methods.addRoot}>
          新增按钮
        </ElButton>
        <ElButton onClick={methods.reset}>重置示例</ElButton>
      </div>
      <ElGrid
        {...({
          data: state.buttons,
          columns: createColumns(state, methods),
          border: true,
          height: 540,
          rowConfig: { keyField: '__id' },
          treeConfig: {
            childrenField: 'children',
            expandAll: true,
          },
          class: 'button-group-designer-tree-grid',
        } as any)}
      />
    </div>
  );
}

function renderBaseInfo(state: ButtonGroupDesignerState) {
  return (
    <ElForm model={state.business} labelPosition="top" class="grid-designer-panel">
      <div class="grid-designer-card">
        <h3>按钮组信息</h3>
        <div class="grid-designer-form-grid">
          <ElFormItem label="Block ID">
            <ElInput v-model={state.business.blockId} placeholder="button-group" />
          </ElFormItem>
          <ElFormItem label="标题">
            <ElInput v-model={state.business.title} placeholder="按钮组" />
          </ElFormItem>
          <ElFormItem label="描述" class="grid-designer-col-span-2">
            <ElInput v-model={state.business.description} type="textarea" rows={3} />
          </ElFormItem>
          <ElFormItem label="对齐方式">
            <ElSelect v-model={state.business.align}>{renderSelectOptions(alignOptions)}</ElSelect>
          </ElFormItem>
          <ElFormItem label="按钮间距">
            <ElInput v-model={state.business.gap} placeholder="8" />
          </ElFormItem>
        </div>
      </div>
    </ElForm>
  );
}

function renderDesignerContent(
  state: ButtonGroupDesignerState,
  methods: ButtonGroupDesignerMethods,
) {
  return (
    <div class="grid-designer-workbench">
      <ElTabs v-model={state.activeTab} class="grid-designer-tabs">
        <ElTabPane label="按钮设计" name="buttons">
          {renderButtonDesigner(state, methods)}
        </ElTabPane>
        <ElTabPane label="组件信息" name="info">
          {renderBaseInfo(state)}
        </ElTabPane>
      </ElTabs>
    </div>
  );
}

function isButtonGroupDesignerResult(value: unknown): value is ButtonGroupDesignerResult {
  return typeof value === 'object' && value !== null && 'business' in value && 'buttons' in value;
}

export function $$buttonGroupDesigner(option: ButtonGroupDesignerServiceOption) {
  const state = createDesignerState(option);
  const methods = createDesignerMethods(state);

  return openGlobalDialog({
    title: option.title || '按钮组设计',
    width: 'min(1280px, calc(100vw - 40px))',
    className: 'button-group-designer-dialog grid-designer-dialog',
    props: {
      top: '4vh',
      destroyOnClose: true,
    },
    content: {
      type: 'render',
      render: () => renderDesignerContent(state, methods),
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
          const result = validateAndBuildResult(state);
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
