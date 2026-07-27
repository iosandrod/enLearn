import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorSelectProp,
  createEditorTableProp,
} from '../../../visual-editor/visual-editor.props';

type ButtonGroupItem = {
  code?: string;
  label?: string;
  status?: string;
  type?: string;
  route?: string;
  eventName?: string;
  disabled?: boolean;
  directivesJson?: string;
  children?: ButtonGroupItem[];
};

const defaultButtons: ButtonGroupItem[] = [
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
] as unknown as ButtonGroupItem[];

const alignOptions = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' },
  { label: '两端分布', value: 'space-between' },
];

const buttonStatusOptions = [
  { label: '默认', value: '' },
  { label: '主要', value: 'primary' },
  { label: '成功', value: 'success' },
  { label: '警告', value: 'warning' },
  { label: '危险', value: 'danger' },
  { label: '信息', value: 'info' },
];

const buttonTypeOptions = [
  { label: '普通按钮', value: 'button' },
  { label: '提交', value: 'submit' },
  { label: '重置', value: 'reset' },
];

function readButtons(value: unknown) {
  return Array.isArray(value) && value.length ? (value as ButtonGroupItem[]) : defaultButtons;
}

function readRootButtons(value: unknown) {
  return readButtons(value).filter(Boolean);
}

function buttonTone(status?: string) {
  if (status === 'primary') return { background: '#1d73d8', borderColor: '#1d73d8', color: '#fff' };
  if (status === 'success') return { background: '#16a34a', borderColor: '#16a34a', color: '#fff' };
  if (status === 'warning') return { background: '#d97706', borderColor: '#d97706', color: '#fff' };
  if (status === 'danger') return { background: '#dc2626', borderColor: '#dc2626', color: '#fff' };
  return { background: '#fff', borderColor: '#cbd5e1', color: '#334155' };
}

function renderButton(button: ButtonGroupItem, index: number) {
  const children = Array.isArray(button.children) ? button.children : [];
  return (
    <span
      key={button.code || index}
      style={{
        display: 'inline-flex',
        minHeight: '30px',
        padding: '0 11px',
        border: `1px solid ${buttonTone(button.status).borderColor}`,
        borderRadius: '4px',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        opacity: button.disabled ? 0.48 : 1,
        ...buttonTone(button.status),
      }}
    >
      {button.label || button.code || '按钮'}
      {children.length ? <i class="ri-arrow-down-s-line" aria-hidden="true" /> : null}
    </span>
  );
}

export default {
  key: 'lowcode-button-group',
  moduleName: 'businessComponents',
  label: '按钮组',
  preview: () => (
    <div
      style={{
        width: '230px',
        border: '1px solid #dcdfe6',
        borderRadius: '6px',
        padding: '10px',
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>按钮组</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {defaultButtons.map(renderButton)}
      </div>
    </div>
  ),
  render({ props, styles }) {
    return () => {
      const buttons = readRootButtons(props.buttons);
      const justifyContent =
        props.align === 'center'
          ? 'center'
          : props.align === 'right'
            ? 'flex-end'
            : props.align === 'space-between'
              ? 'space-between'
              : 'flex-start';

      return (
        <div
          style={{
            ...styles,
            width: '100%',
            display: 'block',
            border: '1px solid #dcdfe6',
            borderRadius: '6px',
            background: '#fff',
            padding: '12px',
          }}
        >
          {props.title ? (
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>{props.title}</div>
          ) : null}
          {props.description ? (
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '10px' }}>
              {props.description}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: `${props.gap || 8}px`,
              justifyContent,
            }}
          >
            {buttons.map(renderButton)}
          </div>
        </div>
      );
    };
  },
  showStyleConfig: true,
  events: [{ label: '点击按钮时触发', value: 'buttonGroup.click' }],
  props: {
    blockId: createEditorInputProp({
      label: 'Block ID',
      defaultValue: 'button-group',
    }),
    title: createEditorInputProp({
      label: '标题',
      defaultValue: '按钮组',
    }),
    description: createEditorInputProp({
      label: '描述',
      defaultValue: '',
    }),
    align: createEditorSelectProp({
      label: '对齐方式',
      options: alignOptions,
      defaultValue: 'left',
    }),
    gap: createEditorInputProp({
      label: '按钮间距',
      defaultValue: '8',
    }),
    buttons: createEditorTableProp({
      label: '按钮配置',
      option: {
        showKey: 'label',
        options: [
          { label: '编码', field: 'code' },
          { label: '名称', field: 'label' },
          {
            label: '状态',
            field: 'status',
            component: 'vxe-select',
            width: 96,
            options: buttonStatusOptions,
          },
          {
            label: '类型',
            field: 'type',
            component: 'vxe-select',
            width: 96,
            options: buttonTypeOptions,
          },
          { label: '路由', field: 'route' },
          { label: '事件名', field: 'eventName' },
          { label: '图标', field: 'icon' },
          { label: '禁用', field: 'disabled', component: 'vxe-switch', width: 72 },
          { label: '朴素', field: 'plain', component: 'vxe-switch', width: 72 },
          { label: '文本', field: 'text', component: 'vxe-switch', width: 72 },
          {
            label: '指令 JSON',
            field: 'directivesJson',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '[]',
          },
          {
            label: '子按钮 JSON',
            field: 'children',
            component: 'lc-json-editor',
            minWidth: 240,
            placeholder: '[{"code":"export","label":"导出"}]',
          },
        ],
      },
      defaultValue: defaultButtons as Record<string, any>[],
    }),
  },
} as VisualEditorComponent;
