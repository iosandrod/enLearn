import type { LowCodePageBlock } from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  isDefined,
  normalizeField,
  normalizeRows,
  readFormDesignerLayout,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';

const converter: VisualToLowCodeConverter = {
  type: 'lowcode-search-form',
  componentKey: 'lowcode-search-form',
  order: 10,
  defaultProps: {
    blockId: 'query-form',
    title: '查询条件',
    sourceKey: 'records',
    fields: [],
  },
  toRuntimeBlock(block) {
    const props = readVisualBlockProps(block);
    const fields = normalizeRows(props.fields).map(normalizeField).filter(isDefined);
    const sourceKey = readString(props.sourceKey, 'records');
    const layout = readFormDesignerLayout(props.formDesignerModel);

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'searchForm',
      title: readString(props.title, 'Query Conditions'),
      targetSourceKey: sourceKey,
      schema: {
        fields,
        ...(layout ? { layout } : {}),
        actions: [
          {
            code: 'submit',
            label: '查询',
            type: 'submit',
            status: 'primary',
          },
          {
            code: 'reset',
            label: '重置',
            type: 'reset',
          },
        ],
      },
    } as LowCodePageBlock;
  },
};

export default converter;
