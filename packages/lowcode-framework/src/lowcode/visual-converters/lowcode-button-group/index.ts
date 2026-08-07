import type {
  LowCodeButtonGroupAction,
  LowCodePageButtonGroupBlock,
  LowCodeRuntimeDirective,
} from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  isPlainRecord,
  normalizeRows,
  readBoolean,
  readDimension,
  readJsonArray,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';

function normalizeStatus(value: unknown) {
  const status = readString(value);
  return ['primary', 'success', 'warning', 'error', 'danger', 'info'].includes(status)
    ? (status as LowCodeButtonGroupAction['status'])
    : undefined;
}

function normalizeType(value: unknown) {
  const type = readString(value, 'button');
  return ['submit', 'reset', 'button'].includes(type)
    ? (type as LowCodeButtonGroupAction['type'])
    : 'button';
}

function normalizeMode(value: unknown) {
  const mode = readString(value);
  return mode === 'text' || mode === 'button'
    ? (mode as LowCodeButtonGroupAction['mode'])
    : undefined;
}

function normalizeDirectives(value: unknown): LowCodeRuntimeDirective[] {
  const rows = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? readJsonArray<LowCodeRuntimeDirective>(value) ?? []
      : [];

  return rows.filter(
    (item): item is LowCodeRuntimeDirective =>
      isPlainRecord(item) && typeof item.type === 'string' && item.type.trim().length > 0,
  );
}

function normalizeButton(
  row: Record<string, unknown>,
  indexPath: number[],
): LowCodeButtonGroupAction | null {
  const fallbackCode = `button_${indexPath.join('_')}`;
  const code = readString(row.code, fallbackCode);
  const label = readString(row.label, code);
  if (!code && !label) return null;

  const childrenSource = Array.isArray(row.children)
    ? row.children
    : readJsonArray<Record<string, unknown>>(row.children) ?? [];
  const children = normalizeRows(childrenSource)
    .map((child, index) => normalizeButton(child, [...indexPath, index + 1]))
    .filter(Boolean) as LowCodeButtonGroupAction[];
  const directives = normalizeDirectives(row.directivesJson ?? row.directives);
  const status = normalizeStatus(row.status);
  const route = readString(row.route);
  const eventName = readString(row.eventName);
  const script = typeof row.script === 'string' ? row.script : '';
  const icon = readString(row.icon);
  const prefixIcon = readString(row.prefixIcon);
  const suffixIcon = readString(row.suffixIcon);
  const mode = normalizeMode(row.mode) ?? (readBoolean(row.text, false) ? 'text' : undefined);

  return {
    code,
    label,
    type: normalizeType(row.type),
    ...(status ? { status } : {}),
    ...(mode ? { mode } : {}),
    ...(route ? { route } : {}),
    ...(eventName ? { eventName } : {}),
    ...(script.trim() ? { script } : {}),
    ...(icon ? { icon } : {}),
    ...(prefixIcon ? { prefixIcon } : {}),
    ...(suffixIcon ? { suffixIcon } : {}),
    ...(typeof row.disabled !== 'undefined' ? { disabled: readBoolean(row.disabled, false) } : {}),
    ...(typeof row.round !== 'undefined' ? { round: readBoolean(row.round, false) } : {}),
    ...(typeof row.circle !== 'undefined' ? { circle: readBoolean(row.circle, false) } : {}),
    ...(typeof row.showDropdownIcon !== 'undefined'
      ? { showDropdownIcon: readBoolean(row.showDropdownIcon, true) }
      : {}),
    ...(typeof row.text !== 'undefined' ? { text: readBoolean(row.text, false) } : {}),
    ...(directives.length ? { directives } : {}),
    ...(children.length ? { children } : {}),
  };
}

function normalizeButtons(value: unknown) {
  return normalizeRows(value)
    .map((button, index) => normalizeButton(button, [index + 1]))
    .filter(Boolean) as LowCodeButtonGroupAction[];
}

function normalizeAlign(value: unknown): LowCodePageButtonGroupBlock['align'] {
  const align = readString(value, 'left');
  return align === 'center' || align === 'right' || align === 'space-between'
    ? align
    : 'left';
}

const converter: VisualToLowCodeConverter = {
  type: 'lowcode-button-group',
  componentKey: 'lowcode-button-group',
  order: 20,
  defaultProps: {
    blockId: 'button-group',
    title: '按钮组',
    description: '',
    align: 'left',
    gap: 8,
    buttons: [],
  },
  validate(block) {
    const props = readVisualBlockProps(block);
    return normalizeButtons(props.buttons).length ? [] : ['button group requires at least one button'];
  },
  toRuntimeBlock(block) {
    const props = readVisualBlockProps(block);
    const gap = readDimension(props.gap);

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'buttonGroup',
      title: readString(props.title),
      description: readString(props.description),
      align: normalizeAlign(props.align),
      ...(typeof gap !== 'undefined' ? { gap } : {}),
      actions: normalizeButtons(props.buttons),
    } as LowCodePageButtonGroupBlock;
  },
};

export default converter;
