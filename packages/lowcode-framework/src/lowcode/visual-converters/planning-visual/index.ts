import type {
  LowCodePageBlock,
  LowCodePageDataSource,
} from '../../../types/lowcode';
import type { VisualToLowCodeConverter } from '../types';
import {
  readBoolean,
  readDimension,
  readJsonArray,
  readJsonObject,
  readString,
  readVisualBlockProps,
  toBlockId,
} from '../helpers';

const componentKinds = {
  'planning-flow': { kind: 'planningFlow', dataset: 'flow', sourceKey: 'flow' },
  'planning-gantt': { kind: 'planningGantt', dataset: 'operationPlans', sourceKey: 'operationPlans' },
  'planning-bom': { kind: 'planningBom', dataset: 'bom', sourceKey: 'bom' },
} as const;

function registerDataSource(
  context: Parameters<NonNullable<VisualToLowCodeConverter['toRuntimeBlock']>>[1],
  sourceKey: string,
  props: Record<string, unknown>,
  dataset: string,
) {
  const postData = readJsonObject(props.postDataJson, { dataset, filters: {} });
  const source: LowCodePageDataSource = {
    key: sourceKey,
    label: readString(props.title, sourceKey),
    sourceType: 'custom',
    serviceName: readString(props.serviceName, 'planning'),
    serviceMethod: readString(props.serviceMethod, 'getPlanningConsoleData'),
    postData,
    autoLoad: true,
  };
  context.dataSources[sourceKey] = source;
}

const converter: VisualToLowCodeConverter = {
  type: 'planning-visual',
  componentKeys: Object.keys(componentKinds),
  order: 70,
  toRuntimeBlock(block, context) {
    const definition = componentKinds[block.componentKey as keyof typeof componentKinds];
    if (!definition) return null;
    const props = readVisualBlockProps(block);
    const sourceKey = readString(props.sourceKey, definition.sourceKey);
    const common = {
      id: toBlockId(props.blockId, block._vid),
      kind: definition.kind,
      title: readString(props.title),
      description: readString(props.description),
      sourceKey,
      height: readDimension(props.height) ?? 420,
      materialVersion: '1.0.0',
    };
    registerDataSource(context, sourceKey, props, definition.dataset);

    if (definition.kind === 'planningFlow') {
      return {
        ...common,
        kind: 'planningFlow',
        fitViewOnInit: readBoolean(props.fitViewOnInit, true),
      } as LowCodePageBlock;
    }
    if (definition.kind === 'planningGantt') {
      return {
        ...common,
        kind: 'planningGantt',
        rowLabelField: readString(props.rowLabelField, 'resource_name'),
        startField: readString(props.startField, 'startdate'),
        endField: readString(props.endField, 'enddate'),
        labelField: readString(props.labelField, 'reference'),
        statusField: readString(props.statusField, 'status'),
        colorField: readString(props.colorField, 'gantt_color'),
        ...(readString(props.settingsFormCode)
          ? { settingsFormCode: readString(props.settingsFormCode) }
          : {}),
      } as LowCodePageBlock;
    }

    const rows = readJsonArray<Record<string, unknown>>(props.rowsJson);
    return {
      ...common,
      kind: 'planningBom',
      keyField: readString(props.keyField, 'id'),
      titleField: readString(props.titleField, 'title'),
      childrenField: readString(props.childrenField, 'children'),
      ...(rows?.length ? { rows } : {}),
    } as LowCodePageBlock;
  },
};

export default converter;
