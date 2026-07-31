import { getLowCodeBlockMaterial } from './block-materials';
export const LOW_CODE_SCHEMA_VERSION = 1;
const schemaMigrations = [];
export function registerLowCodeSchemaMigration(migration) {
    const existsIndex = schemaMigrations.findIndex((item) => item.from === migration.from && item.to === migration.to);
    if (existsIndex >= 0) {
        schemaMigrations.splice(existsIndex, 1, migration);
    }
    else {
        schemaMigrations.push(migration);
    }
    schemaMigrations.sort((prev, next) => prev.from - next.from || prev.to - next.to);
}
export function getLowCodeSchemaMigrations() {
    return [...schemaMigrations];
}
export class LowCodeSchemaValidationError extends Error {
    issues;
    constructor(issues) {
        super(formatLowCodeSchemaIssues(issues));
        this.name = 'LowCodeSchemaValidationError';
        this.issues = issues;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readString(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function readSchemaVersion(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : LOW_CODE_SCHEMA_VERSION;
}
function normalizePageType(value) {
    return value === 'list' || value === 'edit' || value === 'detail' || value === 'custom'
        ? value
        : 'custom';
}
function normalizeBlockKind(kind) {
    return kind === 'search-form' ? 'searchForm' : kind;
}
function normalizeDataSource(key, value) {
    const source = isRecord(value) ? value : {};
    const sourceKey = readString(source.key, key);
    const label = readString(source.label);
    const saveMethod = readString(source.saveMethod);
    const deleteMethod = readString(source.deleteMethod);
    return {
        key: sourceKey,
        ...(label ? { label } : {}),
        serviceName: readString(source.serviceName),
        serviceMethod: readString(source.serviceMethod),
        ...(saveMethod ? { saveMethod } : {}),
        ...(deleteMethod ? { deleteMethod } : {}),
        ...(isRecord(source.postData) ? { postData: source.postData } : {}),
        autoLoad: source.autoLoad !== false,
    };
}
function normalizeDataSources(value) {
    if (!isRecord(value))
        return {};
    return Object.fromEntries(Object.entries(value).map(([key, source]) => [key, normalizeDataSource(key, source)]));
}
function normalizeDirectives(value) {
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
function normalizeEventHandlers(value) {
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
function normalizeBlocks(value) {
    return Array.isArray(value)
        ? value.map((block) => normalizeBlock(block)).filter(isRecord)
        : [];
}
function normalizeOverlays(value) {
    return Array.isArray(value)
        ? value
            .map((block) => normalizeBlock(block))
            .filter((block) => isRecord(block) && (block.kind === 'modal' || block.kind === 'drawer'))
        : [];
}
function normalizeTabs(value) {
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
function normalizeBlock(value) {
    if (!isRecord(value))
        return value;
    const kind = normalizeBlockKind(readString(value.kind));
    const material = getLowCodeBlockMaterial(kind);
    const materialVersion = readString(value.materialVersion, material?.materialVersion ?? undefined);
    const block = {
        ...value,
        kind,
        ...(materialVersion ? { materialVersion } : {}),
    };
    if (kind === 'container' ||
        kind === 'section' ||
        kind === 'modal' ||
        kind === 'drawer') {
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
export function normalizeLowCodePageSchema(value, options = {}) {
    if (!isRecord(value)) {
        throw new LowCodeSchemaValidationError([
            {
                level: 'error',
                path: 'schema',
                message: 'Schema must be an object.',
            },
        ]);
    }
    const code = readString(value.code, options.fallbackCode);
    const route = readString(value.route, options.fallbackRoute);
    const title = readString(value.title, options.fallbackTitle);
    const description = readString(value.description);
    const eventHandlers = normalizeEventHandlers(value.eventHandlers);
    return {
        schemaVersion: readSchemaVersion(value.schemaVersion),
        code,
        route,
        title,
        pageType: normalizePageType(value.pageType),
        ...(description ? { description } : {}),
        layout: value.layout === 'default' || value.layout === 'dashboard' || value.layout === 'blank'
            ? value.layout
            : 'dashboard',
        status: value.status === 'draft' || value.status === 'published' || value.status === 'archived'
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
export function migrateLowCodePageSchema(value, options = {}) {
    if (!isRecord(value)) {
        return normalizeLowCodePageSchema(value, options);
    }
    let nextValue = { ...value };
    let version = readSchemaVersion(nextValue.schemaVersion);
    while (version < LOW_CODE_SCHEMA_VERSION) {
        const migration = schemaMigrations.find((item) => item.from === version);
        if (!migration)
            break;
        nextValue = {
            ...migration.migrate(nextValue),
            schemaVersion: migration.to,
        };
        version = migration.to;
    }
    return normalizeLowCodePageSchema(nextValue, options);
}
function pushIssue(issues, level, path, message) {
    issues.push({ level, path, message });
}
function validateDataSources(schema, issues) {
    Object.entries(schema.dataSources ?? {}).forEach(([key, source]) => {
        const path = `dataSources.${key}`;
        if (!source.key) {
            pushIssue(issues, 'error', `${path}.key`, 'Data source key is required.');
        }
        if (!source.serviceName) {
            pushIssue(issues, 'error', `${path}.serviceName`, 'Service name is required.');
        }
        if (!source.serviceMethod) {
            pushIssue(issues, 'error', `${path}.serviceMethod`, 'Service method is required.');
        }
    });
}
function validateDirectives(directives, issues, path) {
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
function validateEventHandlers(schema, issues) {
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
function dataSourceExists(schema, key) {
    const sourceKey = readString(key);
    return !sourceKey || Boolean(schema.dataSources?.[sourceKey]);
}
function validateFields(fields, issues, path) {
    if (!Array.isArray(fields) || fields.length === 0) {
        pushIssue(issues, 'error', path, 'Form fields cannot be empty.');
        return;
    }
    fields.forEach((field, index) => {
        if (!isRecord(field)) {
            pushIssue(issues, 'error', `${path}.${index}`, 'Field must be an object.');
            return;
        }
        if (!field.field) {
            pushIssue(issues, 'error', `${path}.${index}.field`, 'Field name is required.');
        }
        if (!field.label) {
            pushIssue(issues, 'error', `${path}.${index}.label`, 'Field label is required.');
        }
    });
}
function validateColumns(columns, issues, path) {
    const dataColumns = Array.isArray(columns)
        ? columns.filter((column) => isRecord(column) && (column.field || column.title))
        : [];
    if (!dataColumns.length) {
        pushIssue(issues, 'error', path, 'Grid columns cannot be empty.');
    }
}
function validateNestedBlocks(blocks, schema, issues, blockIds, path) {
    if (!Array.isArray(blocks))
        return;
    blocks.forEach((child, index) => validateBlock(child, schema, issues, blockIds, `${path}.${index}`));
}
function validateBlock(block, schema, issues, blockIds, path) {
    if (!isRecord(block)) {
        pushIssue(issues, 'error', path, 'Block must be an object.');
        return;
    }
    const id = readString(block.id);
    const kind = readString(block.kind);
    if (!id) {
        pushIssue(issues, 'error', `${path}.id`, 'Block ID is required.');
    }
    else if (blockIds.has(id)) {
        pushIssue(issues, 'error', `${path}.id`, `Duplicate Block ID "${id}".`);
    }
    else {
        blockIds.add(id);
    }
    if (!kind) {
        pushIssue(issues, 'error', `${path}.kind`, 'Block kind is required.');
        return;
    }
    const material = getLowCodeBlockMaterial(kind);
    if (!material) {
        pushIssue(issues, 'error', `${path}.kind`, `Block kind "${kind}" is not registered.`);
    }
    else if (!block.materialVersion) {
        pushIssue(issues, 'warning', `${path}.materialVersion`, 'Material version is missing.');
    }
    if (kind === 'form') {
        const schemaRecord = isRecord(block.schema) ? block.schema : {};
        validateFields(schemaRecord.fields, issues, `${path}.schema.fields`);
        if (!dataSourceExists(schema, block.sourceKey)) {
            pushIssue(issues, 'error', `${path}.sourceKey`, `Data source "${block.sourceKey}" does not exist.`);
        }
        if (!dataSourceExists(schema, block.submitSourceKey)) {
            pushIssue(issues, 'error', `${path}.submitSourceKey`, `Submit data source "${block.submitSourceKey}" does not exist.`);
        }
    }
    if (kind === 'searchForm') {
        const schemaRecord = isRecord(block.schema) ? block.schema : {};
        validateFields(schemaRecord.fields, issues, `${path}.schema.fields`);
        if (!dataSourceExists(schema, block.targetSourceKey)) {
            pushIssue(issues, 'error', `${path}.targetSourceKey`, `Target data source "${block.targetSourceKey}" does not exist.`);
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
            pushIssue(issues, 'error', `${path}.deleteSourceKey`, `Delete data source "${block.deleteSourceKey}" does not exist.`);
        }
    }
    if (kind === 'tabs') {
        const tabs = Array.isArray(block.tabs) ? block.tabs : [];
        if (!tabs.length) {
            pushIssue(issues, 'error', `${path}.tabs`, 'Tabs must contain at least one pane.');
        }
        const paneKeys = new Set();
        tabs.forEach((tab, index) => {
            const panePath = `${path}.tabs.${index}`;
            if (!isRecord(tab)) {
                pushIssue(issues, 'error', panePath, 'Tab pane must be an object.');
                return;
            }
            const tabKey = readString(tab.key);
            const tabLabel = readString(tab.label);
            if (!tabKey) {
                pushIssue(issues, 'error', `${panePath}.key`, 'Tab key is required.');
            }
            else if (paneKeys.has(tabKey)) {
                pushIssue(issues, 'error', `${panePath}.key`, `Duplicate tab key "${tabKey}".`);
            }
            else {
                paneKeys.add(tabKey);
            }
            if (!tabLabel) {
                pushIssue(issues, 'error', `${panePath}.label`, 'Tab label is required.');
            }
            validateNestedBlocks(tab.blocks, schema, issues, blockIds, `${panePath}.blocks`);
        });
    }
    if (kind === 'container' ||
        kind === 'section' ||
        kind === 'modal' ||
        kind === 'drawer') {
        validateNestedBlocks(block.blocks, schema, issues, blockIds, `${path}.blocks`);
        if (kind === 'modal' || kind === 'drawer') {
            validateNestedBlocks(block.overlays, schema, issues, blockIds, `${path}.overlays`);
        }
    }
}
export function validateLowCodePageSchema(schema) {
    const issues = [];
    if (schema.schemaVersion !== LOW_CODE_SCHEMA_VERSION) {
        pushIssue(issues, 'error', 'schemaVersion', `Unsupported schema version "${schema.schemaVersion}".`);
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
    const blockIds = new Set();
    schema.blocks.forEach((block, index) => validateBlock(block, schema, issues, blockIds, `blocks.${index}`));
    (schema.overlays ?? []).forEach((block, index) => validateBlock(block, schema, issues, blockIds, `overlays.${index}`));
    return issues;
}
export function formatLowCodeSchemaIssue(issue) {
    return `${issue.path}: ${issue.message}`;
}
export function formatLowCodeSchemaIssues(issues) {
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
export function assertValidLowCodePageSchema(schema) {
    const issues = validateLowCodePageSchema(schema);
    const errors = issues.filter((issue) => issue.level === 'error');
    if (errors.length) {
        throw new LowCodeSchemaValidationError(errors);
    }
    return issues;
}
export function prepareLowCodePageSchema(value, options = {}) {
    const schema = migrateLowCodePageSchema(value, options);
    assertValidLowCodePageSchema(schema);
    return schema;
}
