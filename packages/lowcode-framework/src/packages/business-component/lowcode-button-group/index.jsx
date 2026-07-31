import { h } from 'vue';
import { VxeButton } from 'vxe-pc-ui';
import { createEditorInputProp, createEditorSelectProp, createEditorTableProp, } from '../../../visual-editor/visual-editor.props';
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
    { label: '错误', value: 'error' },
    { label: '危险', value: 'danger' },
    { label: '信息', value: 'info' },
];
const buttonTypeOptions = [
    { label: '普通按钮', value: 'button' },
    { label: '提交', value: 'submit' },
    { label: '重置', value: 'reset' },
];
const buttonModeOptions = [
    { label: '按钮', value: 'button' },
    { label: '文本', value: 'text' },
];
const vxeButtonPropKeys = [
    'size',
    'type',
    'mode',
    'className',
    'name',
    'routerLink',
    'permissionCode',
    'title',
    'content',
    'placement',
    'status',
    'icon',
    'prefixIcon',
    'suffixIcon',
    'round',
    'circle',
    'disabled',
    'loading',
    'trigger',
    'align',
    'showDropdownIcon',
    'destroyOnClose',
    'transfer',
    'popupConfig',
];
function readButtons(value) {
    return Array.isArray(value) && value.length ? value : defaultButtons;
}
function readRootButtons(value) {
    return readButtons(value).filter(Boolean);
}
function readButtonContent(button) {
    return button.content ?? button.label ?? button.code ?? '按钮';
}
function resolveDropdownOptions(children) {
    return children.map((child, index) => ({
        ...resolveButtonProps(child),
        name: child.name ?? child.code ?? index,
        content: readButtonContent(child),
    }));
}
function resolveButtonProps(button) {
    const buttonProps = {};
    vxeButtonPropKeys.forEach((key) => {
        const value = button[key];
        if (typeof value !== 'undefined' && value !== '') {
            buttonProps[key] = value;
        }
    });
    buttonProps.name = button.name ?? button.code;
    buttonProps.content = readButtonContent(button);
    buttonProps.mode = button.mode ?? (button.text ? 'text' : 'button');
    if (button.icon && !button.prefixIcon) {
        buttonProps.prefixIcon = button.icon;
    }
    const children = Array.isArray(button.children) ? button.children : [];
    if (children.length) {
        buttonProps.options = resolveDropdownOptions(children);
        buttonProps.showDropdownIcon = button.showDropdownIcon ?? true;
    }
    return buttonProps;
}
function renderButton(button, index) {
    return h(VxeButton, {
        key: button.code || index,
        ...resolveButtonProps(button),
    });
}
export default {
    key: 'lowcode-button-group',
    moduleName: 'businessComponents',
    label: '按钮组',
    preview: () => (<div style={{
        width: '230px',
        border: '1px solid #dcdfe6',
        borderRadius: '6px',
        padding: '10px',
        background: '#fff',
    }}>
        <div style={{ fontWeight: 600, marginBottom: '8px' }}>按钮组</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {defaultButtons.map(renderButton)}
        </div>
    </div>),
    render({ props, styles }) {
        return () => {
            const buttons = readRootButtons(props.buttons);
            const justifyContent = props.align === 'center'
                ? 'center'
                : props.align === 'right'
                    ? 'flex-end'
                    : props.align === 'space-between'
                        ? 'space-between'
                        : 'flex-start';
            return (<div style={{
                ...styles,
                width: '100%',
                display: 'block',
                border: '1px solid #dcdfe6',
                borderRadius: '6px',
                background: '#fff',
                padding: '12px',
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: `${props.gap || 8}px`,
                    justifyContent,
                }}>
                    {buttons.map(renderButton)}
                </div>
            </div>);
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
                    {
                        label: '模式',
                        field: 'mode',
                        component: 'vxe-select',
                        width: 96,
                        options: buttonModeOptions,
                    },
                    { label: '路由', field: 'route' },
                    { label: '事件名', field: 'eventName' },
                    { label: '图标', field: 'icon' },
                    { label: '前缀图标', field: 'prefixIcon' },
                    { label: '后缀图标', field: 'suffixIcon' },
                    { label: '禁用', field: 'disabled', component: 'vxe-switch', width: 72 },
                    { label: '圆角', field: 'round', component: 'vxe-switch', width: 72 },
                    { label: '圆形', field: 'circle', component: 'vxe-switch', width: 72 },
                    { label: '下拉图标', field: 'showDropdownIcon', component: 'vxe-switch', width: 92 },
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
            defaultValue: defaultButtons,
        }),
    },
};
