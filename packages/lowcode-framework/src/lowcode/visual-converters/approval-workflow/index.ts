import type { LowCodePageApprovalWorkflowDesignerBlock } from '../../../types/lowcode';
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
  type: 'approval-workflow-designer',
  componentKey: 'approval-workflow-designer',
  order: 15,
  defaultProps: {
    blockId: 'approval-workflow-flow',
    sourceKey: 'workflowModel',
    readonly: false,
  },
  toRuntimeBlock(block) {
    const props = readVisualBlockProps(block);
    const model = isPlainRecord(props.model)
      ? props.model
      : readJsonObject(props.modelJson);
    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'approval-workflow-designer',
      sourceKey: readString(props.sourceKey, 'workflowModel'),
      ...(Object.keys(model).length ? { model } : {}),
      ...(typeof props.readonly !== 'undefined'
        ? { readonly: readBoolean(props.readonly, false) }
        : {}),
      materialVersion: '1.0.0',
    } as LowCodePageApprovalWorkflowDesignerBlock;
  },
};

export default converter;
