export const LOW_CODE_SCHEMA_VERSION = 1;

export type LowCodePageSchema = {
  schemaVersion?: number;
  code: string;
  route: string;
  title: string;
  pageType?: 'list' | 'edit' | 'detail' | 'custom';
  description?: string;
  layout?: 'default' | 'dashboard' | 'blank';
  status?: 'draft' | 'published' | 'archived';
  keepAlive?: boolean;
  visualEditor?: Record<string, unknown>;
  config?: {
    bgColor?: string;
    bgImage?: string;
  };
  dataSources?: Record<
    string,
    {
      key: string;
      label?: string;
      serviceName?: string;
      serviceMethod?: string;
      saveMethod?: string;
      deleteMethod?: string;
      entityCode?: string;
      entity_code?: string;
      tableName?: string;
      table_name?: string;
      postData?: Record<string, unknown>;
      autoLoad?: boolean;
    }
  >;
  eventHandlers?: Array<{
    id?: string;
    event: string;
    blockId?: string;
    blockKind?: string;
    actionCode?: string;
    field?: string;
    disabled?: boolean;
    directives: Array<Record<string, unknown> & { type: string; disabled?: boolean }>;
  }>;
  blocks: Array<Record<string, unknown>>;
  overlays?: Array<Record<string, unknown>>;
};

export type LowCodeSchemaIssueLevel = 'error' | 'warning';

export type LowCodeSchemaIssue = {
  level: LowCodeSchemaIssueLevel;
  path: string;
  message: string;
};

export class LowCodeSchemaValidationError extends Error {
  issues: LowCodeSchemaIssue[];

  constructor(issues: LowCodeSchemaIssue[]) {
    super(formatLowCodeSchemaIssues(issues));
    this.name = 'LowCodeSchemaValidationError';
    this.issues = issues;
  }
}

const knownBlockKinds = new Set([
  'buttonGroup',
  'container',
  'detail',
  'drawer',
  'form',
  'grid',
  'modal',
  'searchForm',
  'section',
  'statCard',
  'tabs',
  'text',
  'toolbar',
  'tree',
]);

const materialVersions: Record<string, string> = Object.fromEntries(
  Array.from(knownBlockKinds).map((kind) => [kind, '1.0.0'])
);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const legacyListMethodEntityCodes: Record<string, string> = {
  listUsers: 'users',
  listRoles: 'admin_roles',
  listPermissions: 'admin_permissions',
  listRoutes: 'admin_routes',
  listEntities: 'admin_entities',
  listPages: 'lowcode_pages',
};

function readPostDataObject(value: unknown) {
  if (isRecord(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function readSchemaVersion(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : LOW_CODE_SCHEMA_VERSION;
}

function normalizePageType(value: unknown) {
  return value === 'list' || value === 'edit' || value === 'detail' || value === 'custom'
    ? value
    : 'custom';
}

function normalizeBlockKind(kind: string) {
  return kind === 'search-form' ? 'searchForm' : kind;
}

function readDataSourceEntityCode(source: Record<string, unknown>) {
  const postData = readPostDataObject(source.postData);
  return readString(source.entityCode ?? source.entity_code ?? postData.entityCode ?? postData.entity_code);
}

function readDataSourceTableName(source: Record<string, unknown>) {
  const postData = readPostDataObject(source.postData);
  return readString(source.tableName ?? source.table_name ?? postData.tableName ?? postData.table_name);
}

function hasDataSourceTableTarget(source: {
  entityCode?: string;
  entity_code?: string;
  tableName?: string;
  table_name?: string;
}) {
  return Boolean(source.entityCode || source.entity_code || source.tableName || source.table_name);
}

function normalizeDataSource(key: string, value: unknown) {
  const source = isRecord(value) ? value : {};
  const sourceKey = readString(source.key, key);
  const label = readString(source.label);
  const sourcePostData = readPostDataObject(source.postData);
  const sourceServiceName = readString(source.serviceName);
  const sourceServiceMethod = readString(source.serviceMethod);
  const legacyEntityCode = legacyListMethodEntityCodes[sourceServiceMethod];
  const entityCode = legacyEntityCode || readDataSourceEntityCode(source);
  const tableName = readDataSourceTableName(source);
  const usesListItems = Boolean(entityCode || tableName || sourceServiceMethod === 'listTableRows');
  const saveMethod = readString(source.saveMethod);
  const deleteMethod = readString(source.deleteMethod);
  const postData = {
    ...sourcePostData,
    ...(legacyEntityCode ? { entityCode: legacyEntityCode } : {}),
    ...(entityCode && !sourcePostData.entityCode && !sourcePostData.entity_code ? { entityCode } : {}),
    ...(tableName && !sourcePostData.tableName && !sourcePostData.table_name ? { tableName } : {}),
  };

  return {
    key: sourceKey,
    ...(label ? { label } : {}),
    serviceName: usesListItems ? 'admin' : sourceServiceName,
    serviceMethod: usesListItems ? 'listItems' : sourceServiceMethod,
    ...(saveMethod ? { saveMethod } : {}),
    ...(deleteMethod ? { deleteMethod } : {}),
    ...(entityCode ? { entityCode } : {}),
    ...(tableName ? { tableName } : {}),
    ...(Object.keys(postData).length ? { postData } : {}),
    autoLoad: source.autoLoad !== false,
  };
}

function normalizeDataSources(value: unknown) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, source]) => [key, normalizeDataSource(key, source)])
  );
}

function normalizeDirectives(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((directive) => ({
          ...directive,
          type: readString(directive.type),
          disabled: directive.disabled === true,
        }))
    : [];
}

function normalizeEventHandlers(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((handler) => {
          const id = readString(handler.id);
          const blockId = readString(handler.blockId);
          const blockKind = readString(handler.blockKind);
          const actionCode = readString(handler.actionCode);
          const field = readString(handler.field);

          return {
            ...(id ? { id } : {}),
            event: readString(handler.event, '*'),
            ...(blockId ? { blockId } : {}),
            ...(blockKind ? { blockKind } : {}),
            ...(actionCode ? { actionCode } : {}),
            ...(field ? { field } : {}),
            disabled: handler.disabled === true,
            directives: normalizeDirectives(handler.directives),
          };
        })
        .filter((handler) => Boolean(handler.event))
    : [];
}

function normalizeBlocks(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((block) => normalizeBlock(block)).filter(isRecord)
    : [];
}

function normalizeOverlays(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? (value
        .map((block) => normalizeBlock(block))
        .filter((block) => isRecord(block) && (block.kind === 'modal' || block.kind === 'drawer')) as Array<Record<string, unknown>>)
    : [];
}

function normalizeTabs(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((tab, index) => ({
          ...tab,
          key: readString(tab.key, `tab${index + 1}`),
          label: readString(tab.label, `Tab ${index + 1}`),
          blocks: normalizeBlocks(tab.blocks),
        }))
    : [];
}

function normalizeBlock(value: unknown) {
  if (!isRecord(value)) return value;

  const kind = normalizeBlockKind(readString(value.kind));
  const materialVersion = readString(value.materialVersion, materialVersions[kind]);
  const block = {
    ...value,
    kind,
    ...(materialVersion ? { materialVersion } : {}),
  };

  if (
    kind === 'container' ||
    kind === 'section' ||
    kind === 'modal' ||
    kind === 'drawer'
  ) {
    return {
      ...block,
      blocks: normalizeBlocks(value.blocks),
      ...((kind === 'modal' || kind === 'drawer') && Array.isArray(value.overlays)
        ? { overlays: normalizeOverlays(value.overlays) }
        : {}),
    };
  }

  if (kind === 'tabs') {
    return {
      ...block,
      tabs: normalizeTabs(value.tabs),
    };
  }

  return block;
}

export function normalizeLowCodePageSchema(value: unknown): LowCodePageSchema {
  if (!isRecord(value)) {
    throw new LowCodeSchemaValidationError([
      {
        level: 'error',
        path: 'schema',
        message: 'Schema must be an object.',
      },
    ]);
  }

  const code = readString(value.code);
  const route = readString(value.route);
  const title = readString(value.title);
  const description = readString(value.description);
  const eventHandlers = normalizeEventHandlers(value.eventHandlers);

  return {
    schemaVersion: readSchemaVersion(value.schemaVersion),
    code,
    route,
    title,
    pageType: normalizePageType(value.pageType),
    ...(description ? { description } : {}),
    layout:
      value.layout === 'default' || value.layout === 'dashboard' || value.layout === 'blank'
        ? value.layout
        : 'dashboard',
    status:
      value.status === 'draft' || value.status === 'published' || value.status === 'archived'
        ? value.status
        : 'draft',
    keepAlive: value.keepAlive !== false,
    ...(isRecord(value.visualEditor) ? { visualEditor: value.visualEditor } : {}),
    ...(isRecord(value.config)
      ? {
          config: {
            bgColor: typeof value.config.bgColor === 'string' ? value.config.bgColor : undefined,
            bgImage: typeof value.config.bgImage === 'string' ? value.config.bgImage : undefined,
          },
        }
      : {}),
    dataSources: normalizeDataSources(value.dataSources),
    ...(eventHandlers.length ? { eventHandlers } : {}),
    blocks: normalizeBlocks(value.blocks),
    ...(Array.isArray(value.overlays) ? { overlays: normalizeOverlays(value.overlays) } : {}),
  };
}

export function migrateLowCodePageSchema(value: unknown) {
  return normalizeLowCodePageSchema(value);
}

function pushIssue(
  issues: LowCodeSchemaIssue[],
  level: LowCodeSchemaIssueLevel,
  path: string,
  message: string
) {
  issues.push({ level, path, message });
}

function dataSourceExists(schema: LowCodePageSchema, key?: unknown) {
  const sourceKey = readString(key);
  return !sourceKey || Boolean(schema.dataSources?.[sourceKey]);
}

function validateDataSources(schema: LowCodePageSchema, issues: LowCodeSchemaIssue[]) {
  Object.entries(schema.dataSources ?? {}).forEach(([key, source]) => {
    const path = `dataSources.${key}`;
    const hasTableTarget = hasDataSourceTableTarget(source);

    if (!source.key) {
      pushIssue(issues, 'error', `${path}.key`, 'Data source key is required.');
    }

    if (!source.serviceName && !hasTableTarget) {
      pushIssue(issues, 'error', `${path}.serviceName`, 'Service name is required.');
    }

    if (!source.serviceMethod && !hasTableTarget) {
      pushIssue(issues, 'error', `${path}.serviceMethod`, 'Service method is required.');
    }
  });
}

function validateDirectives(
  directives: unknown,
  issues: LowCodeSchemaIssue[],
  path: string
) {
  if (!Array.isArray(directives)) {
    pushIssue(issues, 'error', path, 'Directives must be an array.');
    return;
  }

  directives.forEach((directive, index) => {
    if (!isRecord(directive)) {
      pushIssue(issues, 'error', `${path}.${index}`, 'Directive must be an object.');
      return;
    }

    if (!readString(directive.type)) {
      pushIssue(issues, 'error', `${path}.${index}.type`, 'Directive type is required.');
    }
  });
}

function validateEventHandlers(schema: LowCodePageSchema, issues: LowCodeSchemaIssue[]) {
  (schema.eventHandlers ?? []).forEach((handler, index) => {
    const path = `eventHandlers.${index}`;

    if (!handler.event) {
      pushIssue(issues, 'error', `${path}.event`, 'Event name is required.');
    }

    if (!handler.directives.length) {
      pushIssue(issues, 'error', `${path}.directives`, 'Event handler requires at least one directive.');
    }

    validateDirectives(handler.directives, issues, `${path}.directives`);
  });
}

function validateFields(
  fields: unknown,
  issues: LowCodeSchemaIssue[],
  path: string
) {
  if (!Array.isArray(fields) || fields.length === 0) {
    pushIssue(issues, 'error', path, 'Form fields cannot be empty.');
    return;
  }

  fields.forEach((field, index) => {
    if (!isRecord(field)) {
      pushIssue(issues, 'error', `${path}.${index}`, 'Field must be an object.');
      return;
    }

    if (!readString(field.field)) {
      pushIssue(issues, 'error', `${path}.${index}.field`, 'Field name is required.');
    }

    if (!readString(field.label)) {
      pushIssue(issues, 'error', `${path}.${index}.label`, 'Field label is required.');
    }
  });
}

function validateColumns(
  columns: unknown,
  issues: LowCodeSchemaIssue[],
  path: string
) {
  const dataColumns = Array.isArray(columns)
    ? columns.filter((column) => isRecord(column) && (column.field || column.title))
    : [];

  if (!dataColumns.length) {
    pushIssue(issues, 'error', path, 'Grid columns cannot be empty.');
  }
}

function validateNestedBlocks(
  blocks: unknown,
  schema: LowCodePageSchema,
  issues: LowCodeSchemaIssue[],
  blockIds: Set<string>,
  path: string
) {
  if (!Array.isArray(blocks)) return;

  blocks.forEach((block, index) =>
    validateBlock(block, schema, issues, blockIds, `${path}.${index}`)
  );
}

function validateBlock(
  block: unknown,
  schema: LowCodePageSchema,
  issues: LowCodeSchemaIssue[],
  blockIds: Set<string>,
  path: string
) {
  if (!isRecord(block)) {
    pushIssue(issues, 'error', path, 'Block must be an object.');
    return;
  }

  const id = readString(block.id);
  const kind = readString(block.kind);

  if (!id) {
    pushIssue(issues, 'error', `${path}.id`, 'Block ID is required.');
  } else if (blockIds.has(id)) {
    pushIssue(issues, 'error', `${path}.id`, `Duplicate Block ID "${id}".`);
  } else {
    blockIds.add(id);
  }

  if (!kind) {
    pushIssue(issues, 'error', `${path}.kind`, 'Block kind is required.');
    return;
  }

  if (!knownBlockKinds.has(kind)) {
    pushIssue(issues, 'error', `${path}.kind`, `Block kind "${kind}" is not registered.`);
  } else if (!readString(block.materialVersion)) {
    pushIssue(issues, 'warning', `${path}.materialVersion`, 'Material version is missing.');
  }

  if (kind === 'form') {
    const schemaRecord = isRecord(block.schema) ? block.schema : {};
    validateFields(schemaRecord.fields, issues, `${path}.schema.fields`);

    if (!dataSourceExists(schema, block.sourceKey)) {
      pushIssue(issues, 'error', `${path}.sourceKey`, `Data source "${block.sourceKey}" does not exist.`);
    }

    if (!dataSourceExists(schema, block.submitSourceKey)) {
      pushIssue(
        issues,
        'error',
        `${path}.submitSourceKey`,
        `Submit data source "${block.submitSourceKey}" does not exist.`
      );
    }
  }

  if (kind === 'searchForm') {
    const schemaRecord = isRecord(block.schema) ? block.schema : {};
    validateFields(schemaRecord.fields, issues, `${path}.schema.fields`);

    if (!dataSourceExists(schema, block.targetSourceKey)) {
      pushIssue(
        issues,
        'error',
        `${path}.targetSourceKey`,
        `Target data source "${block.targetSourceKey}" does not exist.`
      );
    }
  }

  if (kind === 'grid') {
    const schemaRecord = isRecord(block.schema) ? block.schema : {};
    const grid = isRecord(schemaRecord.grid) ? schemaRecord.grid : {};
    validateColumns(grid.columns, issues, `${path}.schema.grid.columns`);

    if (!dataSourceExists(schema, block.sourceKey)) {
      pushIssue(issues, 'error', `${path}.sourceKey`, `Data source "${block.sourceKey}" does not exist.`);
    }

    if (!dataSourceExists(schema, block.deleteSourceKey)) {
      pushIssue(
        issues,
        'error',
        `${path}.deleteSourceKey`,
        `Delete data source "${block.deleteSourceKey}" does not exist.`
      );
    }
  }

  if (kind === 'tabs') {
    const tabs = Array.isArray(block.tabs) ? block.tabs : [];
    if (!tabs.length) {
      pushIssue(issues, 'error', `${path}.tabs`, 'Tabs must contain at least one pane.');
    }

    const paneKeys = new Set<string>();
    tabs.forEach((tab, index) => {
      const panePath = `${path}.tabs.${index}`;
      if (!isRecord(tab)) {
        pushIssue(issues, 'error', panePath, 'Tab pane must be an object.');
        return;
      }

      const key = readString(tab.key);
      if (!key) {
        pushIssue(issues, 'error', `${panePath}.key`, 'Tab key is required.');
      } else if (paneKeys.has(key)) {
        pushIssue(issues, 'error', `${panePath}.key`, `Duplicate tab key "${key}".`);
      } else {
        paneKeys.add(key);
      }

      if (!readString(tab.label)) {
        pushIssue(issues, 'error', `${panePath}.label`, 'Tab label is required.');
      }

      validateNestedBlocks(tab.blocks, schema, issues, blockIds, `${panePath}.blocks`);
    });
  }

  if (
    kind === 'container' ||
    kind === 'section' ||
    kind === 'modal' ||
    kind === 'drawer'
  ) {
    validateNestedBlocks(block.blocks, schema, issues, blockIds, `${path}.blocks`);

    if (kind === 'modal' || kind === 'drawer') {
      validateNestedBlocks(block.overlays, schema, issues, blockIds, `${path}.overlays`);
    }
  }
}

export function validateLowCodePageSchema(schema: LowCodePageSchema) {
  const issues: LowCodeSchemaIssue[] = [];

  if (schema.schemaVersion !== LOW_CODE_SCHEMA_VERSION) {
    pushIssue(
      issues,
      'error',
      'schemaVersion',
      `Unsupported schema version "${schema.schemaVersion}".`
    );
  }

  if (!schema.code) {
    pushIssue(issues, 'error', 'code', 'Page code is required.');
  }

  if (!schema.route) {
    pushIssue(issues, 'error', 'route', 'Page route is required.');
  }

  if (!schema.title) {
    pushIssue(issues, 'error', 'title', 'Page title is required.');
  }

  validateDataSources(schema, issues);
  validateEventHandlers(schema, issues);

  const blockIds = new Set<string>();
  schema.blocks.forEach((block, index) =>
    validateBlock(block, schema, issues, blockIds, `blocks.${index}`)
  );
  (schema.overlays ?? []).forEach((block, index) =>
    validateBlock(block, schema, issues, blockIds, `overlays.${index}`)
  );

  return issues;
}

export function formatLowCodeSchemaIssue(issue: LowCodeSchemaIssue) {
  return `${issue.path}: ${issue.message}`;
}

export function formatLowCodeSchemaIssues(issues: LowCodeSchemaIssue[]) {
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  const blockingIssues = errors.length ? errors : warnings;
  const summary = errors.length
    ? `Schema validation failed with ${errors.length} error(s).`
    : `Schema validation produced ${warnings.length} warning(s).`;

  return [
    summary,
    ...blockingIssues.slice(0, 6).map(formatLowCodeSchemaIssue),
    ...(blockingIssues.length > 6 ? [`...and ${blockingIssues.length - 6} more.`] : []),
  ].join('\n');
}

export function assertValidLowCodePageSchema(schema: LowCodePageSchema) {
  const issues = validateLowCodePageSchema(schema);
  const errors = issues.filter((issue) => issue.level === 'error');

  if (errors.length) {
    throw new LowCodeSchemaValidationError(errors);
  }

  return issues;
}

export function prepareLowCodePageSchema(value: unknown) {
  const schema = migrateLowCodePageSchema(value);
  assertValidLowCodePageSchema(schema);
  return schema;
}
