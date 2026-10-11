import type { LowCodePageBlock } from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  createLowCodeFormSchema,
  isPlainRecord,
  readJsonObject,
  readLowCodeFormSchema,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';
import { normalizeLowCodeSearchQueryLogic } from '../../search-query-logic';

const converter: VisualToLowCodeConverter = {
  type: 'lowcode-search-form',
  componentKey: 'lowcode-search-form',
  order: 10,
  defaultProps: {
    blockId: 'query-form',
    title: '查询条件',
    sourceKey: 'records',
    initialValuesJson: '{}',
    fields: [],
    queryLogic: [],
  },
  toRuntimeBlock(block) {
    const props = readVisualBlockProps(block);
    const preservedSchema = readLowCodeFormSchema(props.schema);
    const formSchema = createLowCodeFormSchema(
      props.fields,
      props.formDesignerModel,
      props.schema,
    );
    const sourceKey = readString(props.sourceKey, 'records');
    const initialValues = readJsonObject(props.initialValuesJson, {});

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'searchForm',
      title: readString(props.title, 'Query Conditions'),
      targetSourceKey: sourceKey,
      ...(Object.keys(initialValues).length ? { initialValues } : {}),
      ...(isPlainRecord(props.formDesignerModel)
        ? { formDesignerModel: props.formDesignerModel }
        : {}),
      ...(typeof props.formDesignerUpdatedAt === 'number'
        ? { formDesignerUpdatedAt: props.formDesignerUpdatedAt }
        : {}),
      queryLogic: normalizeLowCodeSearchQueryLogic(props.queryLogic ?? preservedSchema?.queryLogic),
      schema: {
        ...formSchema,
        queryLogic: normalizeLowCodeSearchQueryLogic(props.queryLogic ?? preservedSchema?.queryLogic),
        actions: preservedSchema
          ? formSchema.actions
          : [
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
