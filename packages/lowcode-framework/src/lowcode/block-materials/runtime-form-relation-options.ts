import { reactive } from 'vue';
import type { LowCodeHostServiceApi } from '../../core/host';
import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodeOption,
  LowCodeRelateInfoConfig,
} from '../../types/lowcode';
import {
  metadataColumnsToOptions,
  splitQualifiedTableName,
} from '../metadata-options';

export const RELATION_RESOURCE_OPTIONS = 'runtimeRelationResources';
export const RELATION_SOURCE_FIELD_OPTIONS = 'runtimeRelationSourceFields';
export const RELATION_TARGET_FIELD_OPTIONS = 'runtimeRelationTargetFields';

type RelationEditorModel = Record<string, unknown> & {
  relateInfoConfig?: LowCodeRelateInfoConfig;
};

type RelationEntity = {
  code: string;
  tableName: string;
  label: string;
  columns: LowCodeOption[];
};

type RelationTable = {
  tableName: string;
  entityCode: string;
  label: string;
};

export type RuntimeRelationEditorOptionSources = ReturnType<
  typeof createRuntimeRelationEditorOptionSources
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function uniqueOptions(...groups: ReadonlyArray<readonly LowCodeOption[]>) {
  const options = new Map<string, LowCodeOption>();
  groups.flat().forEach((option) => {
    const value = readString(option.value);
    if (!value || options.has(value)) return;
    options.set(value, { ...option, value });
  });
  return [...options.values()];
}

function option(value: string, label = value): LowCodeOption {
  return { value, label: label === value ? value : `${label} (${value})` };
}

function readTableFullName(value: Record<string, unknown>) {
  const fullName = readString(value.full_name ?? value.fullName ?? value.tableName);
  if (fullName) return fullName;
  const schemaName = readString(value.schema_name ?? value.schemaName, 'public');
  const tableName = readString(value.table_name ?? value.name);
  return tableName ? `${schemaName}.${tableName}` : '';
}

function tableNameMatches(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  return splitQualifiedTableName(left).tableName === splitQualifiedTableName(right).tableName;
}

function normalizeEntities(value: unknown): RelationEntity[] {
  const tables = isRecord(value) && Array.isArray(value.tables) ? value.tables : [];
  return tables
    .filter(isRecord)
    .map((table) => {
      const tableName = readTableFullName(table);
      const code = readString(table.code, splitQualifiedTableName(tableName).tableName);
      const title = readString(table.title, code || tableName);
      return {
        code,
        tableName,
        label: title === code ? code : `${title} (${code})`,
        columns: uniqueOptions(
          metadataColumnsToOptions(table.columns),
          metadataColumnsToOptions(table.physical_columns ?? table.physicalColumns),
        ),
      };
    })
    .filter((entity) => entity.code || entity.tableName);
}

function normalizeTables(value: unknown): RelationTable[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((table) => {
      const tableName = readString(
        table.tableName ?? table.table_name ?? table.value,
        readTableFullName(table),
      );
      const entityCode = readString(table.entityCode ?? table.entity_code);
      const title = readString(table.title ?? table.label, tableName);
      return {
        tableName,
        entityCode,
        label: title.includes(tableName) ? title : `${title} (${tableName})`,
      };
    })
    .filter((table) => table.tableName);
}

function normalizeViews(value: unknown): RelationTable[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((view) => !readString(view.status) || readString(view.status) === 'published')
    .map((view) => {
      const tableName = readTableFullName({
        ...view,
        table_name: view.view_name,
      });
      const code = readString(view.code, splitQualifiedTableName(tableName).tableName);
      const title = readString(view.title, code || tableName);
      return {
        tableName,
        entityCode: code,
        label: title.includes(tableName) ? title : `${title} (${tableName})`,
      };
    })
    .filter((view) => view.tableName);
}

function collectTargetFields(schema: LowCodeFormSchema): LowCodeOption[] {
  return schema.fields
    .map((field) => {
      const value = readString(field.field);
      const label = readString(field.label, value);
      return value ? option(value, label) : null;
    })
    .filter((item): item is LowCodeOption => Boolean(item));
}

function setOptions(
  sources: Record<string, unknown>,
  key: string,
  options: LowCodeOption[],
) {
  sources[key] = uniqueOptions(options);
}

function readConfig(model: RelationEditorModel) {
  if (!isRecord(model.relateInfoConfig)) model.relateInfoConfig = {};
  return model.relateInfoConfig as LowCodeRelateInfoConfig;
}

function keepValid(value: unknown, options: LowCodeOption[]) {
  const current = readString(value);
  return current && options.some((candidate) => readString(candidate.value) === current)
    ? current
    : '';
}

function keepValidMany(value: unknown, options: LowCodeOption[]) {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => readString(item)).filter(
    (current) => current && options.some((candidate) => readString(candidate.value) === current),
  );
}

function clearInvalidSourceSelections(config: LowCodeRelateInfoConfig, options: LowCodeOption[]) {
  if (Object.prototype.hasOwnProperty.call(config, 'valueField')) {
    config.valueField = keepValid(config.valueField, options);
  }
  if (Object.prototype.hasOwnProperty.call(config, 'displayField')) {
    config.displayField = keepValidMany(config.displayField, options);
  }
  if (Object.prototype.hasOwnProperty.call(config, 'searchField')) {
    config.searchField = keepValid(config.searchField, options);
  }
  if (Array.isArray(config.fieldMappings)) {
    config.fieldMappings = config.fieldMappings.map((mapping) => ({
      ...mapping,
      sourceField: keepValid(mapping.sourceField, options),
    }));
  }
}

function clearInvalidTargetSelections(config: LowCodeRelateInfoConfig, options: LowCodeOption[]) {
  if (Object.prototype.hasOwnProperty.call(config, 'displayValueField')) {
    config.displayValueField = keepValid(config.displayValueField, options);
  }
  if (Array.isArray(config.fieldMappings)) {
    config.fieldMappings = config.fieldMappings.map((mapping) => ({
      ...mapping,
      targetField: keepValid(mapping.targetField, options),
    }));
  }
}

async function invokeOr<T>(
  serviceApi: LowCodeHostServiceApi,
  serviceName: string,
  serviceMethod: string,
  postData: Record<string, unknown>,
  fallback: T,
) {
  try {
    return await serviceApi.invoke<T>(serviceName, serviceMethod, postData);
  } catch {
    return fallback;
  }
}

export async function createRuntimeRelationEditorOptionSources(
  serviceApi: LowCodeHostServiceApi,
  schema: LowCodeFormSchema,
) {
  const sources = reactive<Record<string, unknown>>({});
  const [entityGraph, tableRows, viewRows] = await Promise.all([
    invokeOr<Record<string, unknown>>(serviceApi, 'entityDesign', 'listDesign', {}, {}),
    invokeOr<unknown[]>(serviceApi, 'lowcode', 'listTablePageOptions', {}, []),
    invokeOr<unknown[]>(serviceApi, 'entityDesign', 'listViews', {}, []),
  ]);
  const tableOptions = normalizeTables(tableRows);
  const entities = normalizeEntities(entityGraph);
  tableOptions.forEach((table) => {
    if (!table.entityCode || entities.some((entity) => entity.code === table.entityCode)) return;
    entities.push({
      code: table.entityCode,
      tableName: table.tableName,
      label: table.label,
      columns: [],
    });
  });
  const tables = [...tableOptions, ...normalizeViews(viewRows)];
  const targetOptions = collectTargetFields(schema);
  let sourceRequest = 0;

  setOptions(sources, RELATION_RESOURCE_OPTIONS, uniqueOptions(
    entities.map((entity) => ({
      label: entity.label,
      value: entity.code,
    })),
    tables
      .filter((table) => !entities.some((entity) =>
        (table.entityCode && entity.code === table.entityCode) ||
        tableNameMatches(entity.tableName, table.tableName)
      ))
      .map((table) => ({
        label: table.label,
        value: table.entityCode || table.tableName,
      })),
  ));
  setOptions(sources, RELATION_TARGET_FIELD_OPTIONS, targetOptions);
  setOptions(sources, RELATION_SOURCE_FIELD_OPTIONS, []);

  function findEntity(config: LowCodeRelateInfoConfig) {
    const resource = readString(config.resource);
    const entityCode = readString(config.entityCode, resource);
    const tableName = readString(config.tableName ?? config.viewName, resource);
    return entities.find((entity) =>
      (entityCode && entity.code === entityCode) ||
      (tableName && tableNameMatches(entity.tableName, tableName))
    );
  }

  function findTable(config: LowCodeRelateInfoConfig) {
    const resource = readString(config.resource);
    const entityCode = readString(config.entityCode, resource);
    const tableName = readString(config.tableName ?? config.viewName, resource);
    return tables.find((table) =>
      (tableName && tableNameMatches(table.tableName, tableName)) ||
      (entityCode && table.entityCode === entityCode)
    );
  }

  async function refreshSourceFields(
    model: RelationEditorModel,
    clearInvalid: boolean,
    resetBeforeLoad = false,
  ) {
    const request = ++sourceRequest;
    const config = readConfig(model);
    const entity = findEntity(config);
    const table = findTable(config);
    const tableName = readString(entity?.tableName, table?.tableName);
    let fieldOptions = entity?.columns ?? [];

    if (resetBeforeLoad && request === sourceRequest) {
      setOptions(sources, RELATION_SOURCE_FIELD_OPTIONS, fieldOptions);
      clearInvalidSourceSelections(config, fieldOptions);
    }

    if (tableName) {
      const tableColumns = await invokeOr<unknown[]>(
        serviceApi,
        'lowcode',
        'listTableColumns',
        { tableName },
        [],
      );
      fieldOptions = uniqueOptions(fieldOptions, metadataColumnsToOptions(tableColumns));

      if (!fieldOptions.length) {
        const target = splitQualifiedTableName(tableName);
        const matchingView = viewRows.filter(isRecord).find((view) =>
          tableNameMatches(readTableFullName({ ...view, table_name: view.view_name }), tableName)
        );
        const viewColumns = await invokeOr<unknown[]>(
          serviceApi,
          'entityDesign',
          'listViewColumns',
          {
            id: readString(matchingView?.id),
            schema_name: target.schemaName,
            view_name: target.tableName,
          },
          [],
        );
        fieldOptions = uniqueOptions(fieldOptions, metadataColumnsToOptions(viewColumns));
      }
    }

    if (request !== sourceRequest) return;
    setOptions(sources, RELATION_SOURCE_FIELD_OPTIONS, fieldOptions);
    if (clearInvalid) clearInvalidSourceSelections(config, fieldOptions);
  }

  async function initialize(model: RelationEditorModel) {
    const config = readConfig(model);
    if (
      !readString(config.resource) &&
      (readString(config.entityCode) || readString(config.tableName ?? config.viewName))
    ) {
      config.resource = readString(
        config.entityCode,
        readString(config.tableName ?? config.viewName),
      );
    }
    clearInvalidTargetSelections(config, targetOptions);
    await refreshSourceFields(model, false);
  }

  async function handleFieldChange(
    payload: { field: LowCodeField; value: unknown; previousValue?: unknown },
    model: RelationEditorModel,
  ) {
    if (payload.field.field !== 'relateInfoConfig') return;
    const config = readConfig(model);
    const previous = isRecord(payload.previousValue)
      ? payload.previousValue as LowCodeRelateInfoConfig
      : {};
    const resourceChanged = readString(previous.resource) !== readString(config.resource);
    if (resourceChanged) {
      const resource = readString(config.resource);
      const selectedEntity = entities.find((entity) => entity.code === resource);
      const selectedTable = tables.find((table) =>
        table.entityCode === resource || tableNameMatches(table.tableName, resource)
      );
      config.sourceType = 'entity';
      config.entityCode = selectedEntity?.code || selectedTable?.entityCode || '';
      config.tableName = selectedEntity?.tableName || selectedTable?.tableName || resource;
      config.viewName = '';
      config.pageId = '';
      config.pageCode = '';
      config.pageRoute = '';
      config.lowcodePage = '';
      config.sourceKey = '';
      config.serviceName = '';
      config.serviceMethod = '';
    }
    clearInvalidTargetSelections(config, targetOptions);
    await refreshSourceFields(model, true, resourceChanged);
  }

  return {
    sources,
    initialize,
    handleFieldChange,
  };
}

function configureSelect(
  field: LowCodeField | undefined,
  optionsSourceKey: string,
  placeholder: string,
) {
  if (!field) return;
  field.component = 'vxe-select';
  field.optionsSourceKey = optionsSourceKey;
  delete field.optionsCode;
  field.props = {
    ...(field.props ?? {}),
    clearable: true,
    filterable: true,
    placeholder,
  };
}

export function hydrateRuntimeRelationEditorSchema(schema: LowCodeFormSchema) {
  const hydrated = cloneValue(schema);
  const relationField = hydrated.fields.find((field) => field.field === 'relateInfoConfig');
  if (!relationField || relationField.component !== 'lc-sub-form') return hydrated;
  const relationSchema = isRecord(relationField.props?.schema)
    ? relationField.props.schema as LowCodeFormSchema
    : undefined;
  if (!relationSchema || !Array.isArray(relationSchema.fields)) return hydrated;
  const fields = new Map(relationSchema.fields.map((field) => [field.field, field]));

  configureSelect(fields.get('resource'), RELATION_RESOURCE_OPTIONS, '请选择业务资源');
  configureSelect(fields.get('valueField'), RELATION_SOURCE_FIELD_OPTIONS, '请选择值字段');
  configureSelect(fields.get('displayField'), RELATION_SOURCE_FIELD_OPTIONS, '请选择显示字段');
  const displayField = fields.get('displayField');
  if (displayField) displayField.props = { ...(displayField.props ?? {}), multiple: true };
  configureSelect(fields.get('searchField'), RELATION_SOURCE_FIELD_OPTIONS, '请选择搜索字段');
  configureSelect(fields.get('displayValueField'), RELATION_TARGET_FIELD_OPTIONS, '请选择目标字段');

  const visibleFields = new Set([
    'resource',
    'valueField',
    'displayField',
    'displayValueField',
    'searchField',
    'pageSize',
    'searchable',
    'fieldMappings',
  ]);
  relationSchema.fields = relationSchema.fields.filter((field) => visibleFields.has(field.field));

  const mappingsField = fields.get('fieldMappings');
  const columns = Array.isArray(mappingsField?.props?.columns)
    ? mappingsField.props.columns.filter(isRecord)
    : [];
  columns.forEach((column) => {
    const field = readString(column.field);
    if (field !== 'sourceField' && field !== 'targetField') return;
    column.component = 'vxe-select';
    column.optionsSourceKey = field === 'sourceField'
      ? RELATION_SOURCE_FIELD_OPTIONS
      : RELATION_TARGET_FIELD_OPTIONS;
    column.props = {
      ...(isRecord(column.props) ? column.props : {}),
      clearable: true,
      filterable: true,
    };
  });

  return hydrated;
}
