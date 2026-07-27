import type { LowCodePageBlock } from '~/types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  isDefined,
  normalizeField,
  normalizeRows,
  readFormDesignerLayout,
  readString,
  readVisualBlockProps,
  toBlockId,
  upsertFormDataSource,
} from '../helpers';

const converter: VisualToLowCodeConverter = {
  type: 'lowcode-edit-form',
  componentKey: 'lowcode-edit-form',
  componentKeys: ['form'],
  order: 20,
  defaultProps: {
    blockId: 'edit-form',
    title: '编辑信息',
    sourceKey: 'record',
    submitSourceKey: 'record',
    serviceName: 'admin',
    serviceMethod: 'getUser',
    saveMethod: 'saveUser',
    postDataJson: '{}',
    submitText: '保存',
    resetText: '重置',
    fields: [],
  },
  validate(block) {
    const props = readVisualBlockProps(block);
    return normalizeRows(props.fields).length ? [] : ['form requires at least one field'];
  },
  match(block) {
    return block.componentKey === 'form' && Array.isArray(block.props?.fields);
  },
  toRuntimeBlock(block, context) {
    const props = readVisualBlockProps(block);
    const fields = normalizeRows(props.fields).map(normalizeField).filter(isDefined);
    const sourceKey = readString(props.sourceKey, 'record');
    const submitSourceKey = readString(props.submitSourceKey, sourceKey);
    const layout = readFormDesignerLayout(props.formDesignerModel);
    const submitLabel = readString(props.submitText, '保存');
    const resetLabel = readString(props.resetText, '重置');

    upsertFormDataSource(context.dataSources, sourceKey, props, false);
    if (submitSourceKey !== sourceKey) {
      upsertFormDataSource(context.dataSources, submitSourceKey, props, false);
    }

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'form',
      title: readString(props.title, 'Edit Form'),
      sourceKey,
      submitSourceKey,
      schema: {
        fields,
        ...(layout ? { layout } : {}),
        actions: [
          {
            code: 'submit',
            label: submitLabel,
            type: 'submit',
            status: 'primary',
          },
          {
            code: 'reset',
            label: resetLabel,
            type: 'reset',
          },
        ],
      },
    } as LowCodePageBlock;
  },
};

export default converter;
