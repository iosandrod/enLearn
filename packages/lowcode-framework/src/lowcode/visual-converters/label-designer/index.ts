import type { LowCodePageLabelDesignerBlock } from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  readBoolean,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';

const converter: VisualToLowCodeConverter = {
  type: 'label-designer',
  componentKey: 'label-designer',
  order: 17,
  defaultProps: {
    blockId: 'label-designer-canvas',
    templateName: '标签打印模板',
    readonly: false,
  },
  toRuntimeBlock(block) {
    const props = readVisualBlockProps(block);
    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'label-designer',
      ...(readString(props.templateId) ? { templateId: readString(props.templateId) } : {}),
      templateName: readString(props.templateName, '标签打印模板'),
      readonly: readBoolean(props.readonly, false),
      materialVersion: '1.0.0',
    } as LowCodePageLabelDesignerBlock;
  },
};

export default converter;
