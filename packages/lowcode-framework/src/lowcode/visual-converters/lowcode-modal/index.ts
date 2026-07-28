import type { LowCodePageModalBlock } from '../../../types/lowcode';
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
  children?: VisualEditorBlockData[];
};

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
  type: 'modal',
  componentKey: 'lowcode-modal',
  order: 30,
  defaultProps: {
    blockId: 'modal-block',
    title: '弹框',
    description: '',
    open: false,
    width: 640,
  },
  toRuntimeBlock(block, context) {
    const props = readVisualBlockProps(block);
    const id = toBlockId(props.blockId, block._vid);
    const title = readString(props.title);
    const description = readString(props.description);
    const width = readDimension(props.width);
    const overlays = Array.isArray(props.overlays)
      ? context.convertOverlays(props.overlays as VisualEditorBlockData[])
      : [];

    return {
      id,
      kind: 'modal',
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      open: readBoolean(props.open, false),
      ...(typeof width !== 'undefined' ? { width } : {}),
      blocks: context.convertBlocks(readSlotChildren(props.slots)),
      ...(overlays.length ? { overlays } : {}),
    } as LowCodePageModalBlock;
  },
};

export default converter;
