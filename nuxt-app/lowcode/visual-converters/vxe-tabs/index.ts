import type { LowCodePageBlock } from '~/types/lowcode';
import type { VisualEditorBlockData } from '@/visual-editor/visual-editor.utils';
import type { VisualToLowCodeConverter } from '../types';
import {
  isPlainRecord,
  normalizeRows,
  readString,
  readVisualBlockProps,
  toBlockId,
  toTabsSlotKey,
} from '../helpers';

const converter: VisualToLowCodeConverter = {
  type: 'vxe-tabs',
  componentKey: 'vxe-tabs',
  order: 40,
  defaultProps: {
    blockId: 'tabs-panel',
    panes: [
      { title: '基础信息', name: 'basic' },
      { title: '详细信息', name: 'detail' },
      { title: '操作记录', name: 'logs' },
    ],
    modelValue: 'basic',
  },
  validate(block) {
    const props = readVisualBlockProps(block);
    return normalizeRows(props.panes).length ? [] : ['tabs requires at least one pane'];
  },
  toRuntimeBlock(block, context) {
    const props = readVisualBlockProps(block);
    const rows = normalizeRows(props.panes);
    const usedKeys = new Set<string>();
    const slots = isPlainRecord(props.slots) ? props.slots : {};
    const tabs = rows.map((row, index) => {
      const key = readString(row.name, `tab${index + 1}`);
      const label = readString(row.title, `页签 ${index + 1}`);
      let slotKey = toTabsSlotKey(key, index);

      if (usedKeys.has(slotKey)) {
        slotKey = `${slotKey}_${index + 1}`;
      }
      usedKeys.add(slotKey);

      const rawSlot = slots[slotKey];
      const slot = isPlainRecord(rawSlot) ? rawSlot : {};
      const children = Array.isArray(slot.children)
        ? (slot.children as VisualEditorBlockData[])
        : [];

      return {
        key,
        label,
        blocks: context.convertBlocks(children),
      };
    });

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'tabs',
      ...(readString(props.title) ? { title: readString(props.title) } : {}),
      ...(readString(props.description) ? { description: readString(props.description) } : {}),
      defaultKey: readString(props.modelValue, tabs[0]?.key),
      tabs,
    } as LowCodePageBlock;
  },
};

export default converter;
