import { h } from 'vue';
import { VxeButton } from 'vxe-pc-ui';
import type { VxeButtonProps } from 'vxe-pc-ui';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { createDefaultButtonGroupEditorRows } from '../../../lowcode/actions/builtins';

type ButtonGroupItem = Omit<Partial<VxeButtonProps>, 'options'> & {
  code?: string;
  label?: string;
  route?: string;
  eventName?: string;
  script?: string;
  directivesJson?: string;
  children?: ButtonGroupItem[];
  text?: boolean;
};

const defaultButtons: ButtonGroupItem[] = createDefaultButtonGroupEditorRows();
const vxeButtonPropKeys = [
  'size', 'type', 'mode', 'className', 'name', 'routerLink', 'permissionCode', 'title',
  'content', 'placement', 'status', 'icon', 'prefixIcon', 'suffixIcon', 'round', 'circle',
  'disabled', 'loading', 'trigger', 'align', 'showDropdownIcon', 'destroyOnClose', 'transfer',
  'popupConfig',
] as const satisfies readonly (keyof VxeButtonProps)[];

function readButtons(value: unknown) {
  return Array.isArray(value) && value.length ? (value as ButtonGroupItem[]) : defaultButtons;
}

function readButtonContent(button: ButtonGroupItem) {
  return button.content ?? button.label ?? button.code ?? '按钮';
}

function resolveDropdownOptions(children: ButtonGroupItem[]) {
  return children.map((child, index) => ({
    ...resolveButtonProps(child),
    name: child.name ?? child.code ?? index,
    content: readButtonContent(child),
  }));
}

function resolveButtonProps(button: ButtonGroupItem): VxeButtonProps {
  const buttonProps: Partial<VxeButtonProps> = {};
  vxeButtonPropKeys.forEach((key) => {
    const value = button[key];
    if (typeof value !== 'undefined' && value !== '') {
      (buttonProps as Record<string, unknown>)[key] = value;
    }
  });
  buttonProps.name = button.name ?? button.code;
  buttonProps.content = readButtonContent(button);
  buttonProps.mode = button.mode ?? (button.text ? 'text' : 'button');
  if (button.icon && !button.prefixIcon) buttonProps.prefixIcon = button.icon;
  const children = Array.isArray(button.children) ? button.children : [];
  if (children.length) {
    buttonProps.options = resolveDropdownOptions(children);
    buttonProps.showDropdownIcon = button.showDropdownIcon ?? true;
  }
  return buttonProps as VxeButtonProps;
}

function renderButton(button: ButtonGroupItem, index: number) {
  return h(VxeButton as any, { key: button.code || index, ...resolveButtonProps(button) });
}

export default {
  key: 'lowcode-button-group',
  moduleName: 'businessComponents',
  label: '按钮组',
  preview: () => (
    <div style={{ width: '230px', border: '1px solid #dcdfe6', borderRadius: '6px', padding: '10px', background: '#fff' }}>
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>按钮组</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{defaultButtons.map(renderButton)}</div>
    </div>
  ),
  render({ props, styles }) {
    return () => {
      const buttons = readButtons(props.buttons).filter(Boolean);
      const justifyContent = props.align === 'center' ? 'center' : props.align === 'right'
        ? 'flex-end' : props.align === 'space-between' ? 'space-between' : 'flex-start';
      return (
        <div style={{ ...styles, width: '100%', display: 'block', border: '1px solid #dcdfe6', borderRadius: '6px', background: '#fff', padding: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${props.gap || 8}px`, justifyContent }}>
            {buttons.map(renderButton)}
          </div>
        </div>
      );
    };
  },
  showStyleConfig: true,
  events: [{ label: '点击按钮时触发', value: 'buttonGroup.click' }],
} as VisualEditorComponent;
