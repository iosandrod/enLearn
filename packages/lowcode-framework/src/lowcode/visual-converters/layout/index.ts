import type {
  LowCodePageBlock,
  LowCodePageContainerBlock,
  LowCodePageDrawerBlock,
  LowCodePageModalBlock,
  LowCodePageSectionBlock,
} from '../../../types/lowcode';
import type { VisualEditorBlockData } from '../../../visual-editor/visual-editor.utils';
import type { VisualToLowCodeConverter } from '../types';
import {
  isPlainRecord,
  readBoolean,
  readDimension,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';

type SlotItem = {
  span?: number | string;
  children?: VisualEditorBlockData[];
};

function readSlotItems(value: unknown): SlotItem[] {
  if (!isPlainRecord(value)) return [];

  return Object.entries(value)
    .filter(([key, slot]) => key !== 'value' && isPlainRecord(slot))
    .sort(([prevKey], [nextKey]) => {
      const prevIndex = Number(prevKey.replace('slot', ''));
      const nextIndex = Number(nextKey.replace('slot', ''));
      return prevIndex - nextIndex;
    })
    .map(([, slot]) => ({
      span: (slot as SlotItem).span,
      children: Array.isArray((slot as SlotItem).children)
        ? (slot as SlotItem).children
        : [],
    }));
}

const runtimeKinds = new Set(['container', 'section', 'modal', 'drawer']);

function normalizeRuntimeKind(value: unknown) {
  const kind = readString(value, 'container');
  return runtimeKinds.has(kind) ? kind : 'container';
}

function readSlotChildren(value: unknown) {
  if (!isPlainRecord(value)) return [];

  return Object.entries(value)
    .filter(([key, slot]) => key !== 'value' && isPlainRecord(slot))
    .sort(([prevKey], [nextKey]) => {
      const prevIndex = Number(prevKey.replace('slot', ''));
      const nextIndex = Number(nextKey.replace('slot', ''));
      return prevIndex - nextIndex;
    })
    .flatMap(([, slot]) => {
      const children = (slot as SlotItem).children;
      return Array.isArray(children) ? children : [];
    });
}

const converter: VisualToLowCodeConverter = {
  type: 'layout',
  componentKey: 'layout',
  order: 5,
  defaultProps: {
    blockId: 'container-block',
    runtimeKind: 'container',
    title: '',
    description: '',
    open: false,
    width: '',
    placement: 'right',
    gutter: '',
  },
  toRuntimeBlock(block, context) {
    const props = readVisualBlockProps(block);
    const id = toBlockId(props.blockId, block._vid);
    const title = readString(props.title);
    const description = readString(props.description);
    const runtimeKind = normalizeRuntimeKind(props.runtimeKind);
    const slotItems = runtimeKind === 'container' ? readSlotItems(props.slots) : [];
    const blocks = runtimeKind === 'container'
      ? slotItems.map((slot, index) => ({
          id: `${id}__slot_${index}`,
          kind: 'container' as const,
          columns: 1,
          gap: 0,
          panel: false,
          blocks: context.convertBlocks(slot.children),
        }))
      : context.convertBlocks(readSlotChildren(props.slots));
    const overlays = Array.isArray(props.overlays)
      ? context.convertOverlays(props.overlays as VisualEditorBlockData[])
      : [];
    const width = readDimension(props.width);

    if (runtimeKind === 'modal') {
      return {
        id,
        kind: 'modal',
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        open: readBoolean(props.open, false),
        ...(typeof width !== 'undefined' ? { width } : {}),
        blocks,
        ...(overlays.length ? { overlays } : {}),
      } as LowCodePageModalBlock;
    }

    if (runtimeKind === 'drawer') {
      const placement = readString(props.placement, 'right');
      return {
        id,
        kind: 'drawer',
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        open: readBoolean(props.open, false),
        ...(typeof width !== 'undefined' ? { width } : {}),
        placement: placement === 'left' ? 'left' : 'right',
        blocks,
        ...(overlays.length ? { overlays } : {}),
      } as LowCodePageDrawerBlock;
    }

    if (runtimeKind === 'section') {
      return {
        id,
        kind: 'section',
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        panel: readBoolean(props.panel, true),
        blocks,
      } as LowCodePageSectionBlock;
    }

    const gap = readDimension(props.gutter);
    return {
      id,
      kind: 'container',
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      columns: slotItems.length || (blocks.length ? blocks.length : 1),
      ...(slotItems.length
        ? {
            columnSpans: slotItems.map((slot) => {
              const span = Number(slot.span);
              return Number.isFinite(span) && span > 0 ? span : 1;
            }),
          }
        : {}),
      gap: typeof gap === 'number' ? gap : Number(gap) || 8,
      panel: readBoolean(props.panel, false),
      blocks,
    } as LowCodePageContainerBlock;
  },
};

export default converter;
