import type {
  LowCodeAction,
  LowCodePageBlock,
  LowCodeRuntimeDirective,
} from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  isDefined,
  isPlainRecord,
  normalizeField,
  normalizeRows,
  readFormDesignerLayout,
  readJsonArray,
  readJsonObject,
  readString,
  readVisualBlockProps,
  toBlockId,
  upsertFormDataSource,
} from '../helpers';

function normalizeActionStatus(value: unknown): LowCodeAction['status'] {
  const status = readString(value);
  return ['primary', 'success', 'warning', 'danger', 'info'].includes(status)
    ? (status as LowCodeAction['status'])
    : undefined;
}

function normalizeActionType(value: unknown): LowCodeAction['type'] {
  const type = readString(value, 'button');
  return type === 'submit' || type === 'reset' ? type : 'button';
}

function normalizeDirectives(value: unknown) {
  const directives = Array.isArray(value)
    ? value
    : readJsonArray<LowCodeRuntimeDirective>(value) ?? [];

  return directives.filter(
    (item): item is LowCodeRuntimeDirective =>
      isPlainRecord(item) && typeof item.type === 'string' && item.type.trim().length > 0,
  );
}

function normalizeActions(value: unknown): LowCodeAction[] {
  return normalizeRows(value)
    .map((row, index) => {
      const code = readString(row.code, `action${index + 1}`);
      const label = readString(row.label, code);
      if (!code || !label) return null;

      const status = normalizeActionStatus(row.status);
      const route = readString(row.route);
      const eventName = readString(row.eventName);
      const directives = normalizeDirectives(row.directivesJson ?? row.directives);

      return {
        code,
        label,
        type: normalizeActionType(row.type),
        ...(status ? { status } : {}),
        ...(route ? { route } : {}),
        ...(eventName ? { eventName } : {}),
        ...(row.disabled === true ? { disabled: true } : {}),
        ...(directives.length ? { directives } : {}),
      } as LowCodeAction;
    })
    .filter(Boolean) as LowCodeAction[];
}

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
    initialValuesJson: '{}',
    submitText: '保存',
    resetText: '重置',
    formActions: [],
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
    const sourceKey = readString(props.sourceKey);
    const submitSourceKey = readString(props.submitSourceKey, sourceKey);
    const layout = readFormDesignerLayout(props.formDesignerModel);
    const submitLabel = readString(props.submitText, '保存');
    const resetLabel = readString(props.resetText, '重置');
    const initialValues = readJsonObject(props.initialValuesJson, {});
    const designedActions = normalizeActions(props.formActions);

    if (sourceKey) {
      upsertFormDataSource(context.dataSources, sourceKey, props, false);
    }
    if (submitSourceKey && submitSourceKey !== sourceKey) {
      upsertFormDataSource(context.dataSources, submitSourceKey, props, false);
    }

    return {
      id: toBlockId(props.blockId, block._vid),
      kind: 'form',
      title: readString(props.title, 'Edit Form'),
      ...(sourceKey ? { sourceKey } : {}),
      ...(submitSourceKey ? { submitSourceKey } : {}),
      ...(Object.keys(initialValues).length ? { initialValues } : {}),
      schema: {
        fields,
        ...(layout ? { layout } : {}),
        actions: designedActions.length
          ? designedActions
          : [
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
