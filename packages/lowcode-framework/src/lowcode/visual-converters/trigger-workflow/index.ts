import type { LowCodePageTriggerWorkflowDesignerBlock } from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  isPlainRecord,
  readBoolean,
  readJsonObject,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';

const converter: VisualToLowCodeConverter = {
  type: 'trigger-workflow-designer',
  componentKey: 'trigger-workflow-designer',
  order: 16,
  defaultProps: {
    blockId: 'trigger-workflow-flow',
    sourceKey: 'triggerWorkflowModel',
    readonly: false,
  },
  toRuntimeBlock(block) {
    const props = readVisualBlockProps(block);
    const model = isPlainRecord(props.model)
      ? props.model
      : readJsonObject(props.modelJson);
    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'trigger-workflow-designer',
      sourceKey: readString(props.sourceKey, 'triggerWorkflowModel'),
      ...(Object.keys(model).length ? { model } : {}),
      ...(typeof props.readonly !== 'undefined'
        ? { readonly: readBoolean(props.readonly, false) }
        : {}),
      materialVersion: '1.0.0',
    } as LowCodePageTriggerWorkflowDesignerBlock;
  },
};

export default converter;
