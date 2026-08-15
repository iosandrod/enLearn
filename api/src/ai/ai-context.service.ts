import { Inject, Injectable } from '@nestjs/common';
import { AI_SERVICE_ROUTER, type AiServiceRouter } from './ai-service-router';
import type { AiClientContext, AiPageRef, AiPrincipal } from './ai.types';

const MAX_CONTEXT_BYTES = 64 * 1024;
const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_LENGTH = 20;
const MAX_FIELDS = 160;
const MAX_DEPTH = 6;
const SENSITIVE_KEY = /password|passphrase|token|cookie|authorization|api[_-]?key|secret|credential|private[_-]?key|connection[_-]?string/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateString(value: string) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...`
    : value;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1));
  }
  if (!isRecord(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, MAX_FIELDS)
      .map(([key, item]) => [key, sanitizeValue(item, depth + 1)])
  );
}

function sanitizeSampleValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'string') return value ? '[redacted]' : '';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeSampleValue(item, depth + 1));
  }
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, MAX_FIELDS)
      .map(([key, item]) => [key, sanitizeSampleValue(item, depth + 1)])
  );
}

function summarizeActions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_FIELDS).map((action) => {
    if (!isRecord(action)) return {};
    return sanitizeValue({
      code: action.code,
      label: action.label,
      eventName: action.eventName,
      route: action.route,
      directives: action.directives,
      hasScript: Boolean(readString(action.script)),
      children: summarizeActions(action.children)
    });
  });
}

function isActionColumn(value: unknown) {
  if (!isRecord(value)) return false;
  const slots = isRecord(value.slots) ? value.slots : {};
  return value.type === 'action' || slots.default === 'actions';
}

function summarizeRowActions(value: unknown, columns: unknown[]) {
  if (!columns.some(isActionColumn)) return [];
  const rowActions = isRecord(value) ? value : {};
  const customActions = summarizeActions(rowActions.actions);
  if (customActions.length) return customActions;

  const actions: Record<string, unknown>[] = [];
  if (rowActions.edit !== false) {
    actions.push({
      code: 'edit',
      label: readString(rowActions.editLabel) || '编辑',
      repeatedPerRow: true
    });
  }
  if (rowActions.delete !== false) {
    actions.push({
      code: 'delete',
      label: readString(rowActions.deleteLabel) || '删除',
      repeatedPerRow: true
    });
  }
  return actions;
}

function summarizeBlocks(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_FIELDS).flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const schema = isRecord(candidate.schema) ? candidate.schema : {};
    const grid = isRecord(schema.grid) ? schema.grid : {};
    const rawColumns = Array.isArray(grid.columns)
      ? grid.columns.slice(0, MAX_FIELDS)
      : [];
    const fields = Array.isArray(schema.fields)
      ? schema.fields.slice(0, MAX_FIELDS).map((field) => {
          if (!isRecord(field)) return {};
          return sanitizeValue({
            field: field.field,
            label: field.label,
            component: field.component,
            required: Array.isArray(field.rules)
              ? field.rules.some((rule) => isRecord(rule) && rule.required === true)
              : false
          });
        })
      : [];
    const columns = rawColumns.length
      ? rawColumns.map((column) => {
          if (!isRecord(column)) return {};
          return sanitizeValue({
            field: column.field,
            title: column.title,
            type: column.type,
            visible: column.visible,
            actionColumn: isActionColumn(column)
          });
        })
      : [];
    const tabs = Array.isArray(candidate.tabs)
      ? candidate.tabs.slice(0, MAX_ARRAY_LENGTH).map((tab) => {
          if (!isRecord(tab)) return {};
          return {
            key: readString(tab.key),
            label: readString(tab.label),
            blocks: summarizeBlocks(tab.blocks)
          };
        })
      : [];

    return [{
      id: readString(candidate.id),
      kind: readString(candidate.kind),
      title: readString(candidate.title),
      description: readString(candidate.description),
      sourceKey: readString(candidate.sourceKey),
      targetSourceKey: readString(candidate.targetSourceKey),
      fields,
      columns,
      actions: summarizeActions(candidate.actions ?? schema.actions),
      toolbarActions: summarizeActions(schema.toolbar),
      rowActions: summarizeRowActions(schema.rowActions, rawColumns),
      blocks: summarizeBlocks(candidate.blocks),
      overlays: summarizeBlocks(candidate.overlays),
      tabs
    }];
  });
}

function summarizePageRecord(page: unknown) {
  if (!isRecord(page)) return {};
  const schema = isRecord(page.schema) ? page.schema : {};
  const dataSources = isRecord(schema.dataSources)
    ? Object.fromEntries(
        Object.entries(schema.dataSources).slice(0, MAX_FIELDS).map(([key, value]) => {
          const source = isRecord(value) ? value : {};
          return [key, sanitizeValue({
            key: source.key,
            label: source.label,
            sourceType: source.sourceType,
            serviceName: source.serviceName,
            serviceMethod: source.serviceMethod,
            tableName: source.tableName ?? source.table_name,
            viewName: source.viewName,
            autoLoad: source.autoLoad
          })];
        })
      )
    : {};

  return {
    id: readString(page.id),
    code: readString(page.code ?? schema.code),
    route: readString(page.route ?? schema.route),
    title: readString(page.title ?? schema.title),
    pageType: readString(page.page_type ?? schema.pageType),
    status: readString(page.status ?? schema.status),
    version: Number(page.version) || undefined,
    description: truncateString(readString(page.description ?? schema.description)),
    dataSources,
    blocks: summarizeBlocks(schema.blocks),
    overlays: summarizeBlocks(schema.overlays),
    functions: Array.isArray(schema.functions)
      ? schema.functions.slice(0, MAX_FIELDS).map((item) => {
          const fn = isRecord(item) ? item : {};
          return sanitizeValue({
            name: fn.name,
            label: fn.label,
            description: fn.description,
            enabled: fn.enabled,
            hasScript: Boolean(readString(fn.script))
          });
        })
      : [],
    scriptPolicy: sanitizeValue(schema.scriptPolicy)
  };
}

function validateClientPageHint(clientPage: unknown, serverPage: unknown) {
  if (!isRecord(clientPage) || !isRecord(serverPage)) return;
  const checks: Array<[string, string]> = [
    ['id', readString(serverPage.id)],
    ['code', readString(serverPage.code)],
    ['route', readString(serverPage.route)]
  ];
  for (const [key, expected] of checks) {
    const actual = readString(clientPage[key]);
    if (actual && expected && actual !== expected) {
      throw new Error('Client page context does not match the authorized server page.');
    }
  }
  const actualVersion = Number(clientPage.version);
  const expectedVersion = Number(serverPage.version);
  if (actualVersion > 0 && expectedVersion > 0 && actualVersion !== expectedVersion) {
    throw new Error('Client page version does not match the authorized server page.');
  }
}

function enforceByteLimit(value: Record<string, unknown>) {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, 'utf8') <= MAX_CONTEXT_BYTES) return value;
  const compact = {
    page: isRecord(value.page)
      ? {
          id: value.page.id,
          code: value.page.code,
          route: value.page.route,
          title: value.page.title,
          pageType: value.page.pageType,
          version: value.page.version,
          blocks: Array.isArray(value.page.blocks) ? value.page.blocks.slice(0, 30) : []
        }
      : {},
    route: value.route,
    selection: value.selection,
    truncated: true
  };
  if (Buffer.byteLength(JSON.stringify(compact), 'utf8') <= MAX_CONTEXT_BYTES) {
    return compact;
  }
  return {
    page: isRecord(value.page)
      ? {
          id: value.page.id,
          code: value.page.code,
          route: value.page.route,
          title: value.page.title,
          pageType: value.page.pageType,
          version: value.page.version
        }
      : {},
    route: sanitizeValue(value.route, MAX_DEPTH),
    selection: sanitizeValue(value.selection, MAX_DEPTH),
    truncated: true
  };
}

@Injectable()
export class AiContextService {
  constructor(
    @Inject(AI_SERVICE_ROUTER)
    private readonly router: AiServiceRouter
  ) {}

  async assemble(options: {
    principal: AiPrincipal;
    pageRef?: AiPageRef;
    clientContext?: AiClientContext;
    includeSampleData?: boolean;
  }) {
    let page: unknown;
    if (options.pageRef?.id || options.pageRef?.code || options.pageRef?.route) {
      page = await this.router.invoke(
        'lowcode',
        'getRuntimePage',
        {
          ...(options.pageRef.id ? { id: options.pageRef.id } : {}),
          ...(options.pageRef.code ? { code: options.pageRef.code } : {}),
          ...(options.pageRef.route ? { route: options.pageRef.route } : {})
        },
        options.principal.context
      );
    }

    const client = isRecord(options.clientContext) ? options.clientContext : {};
    validateClientPageHint(client.page, page);
    const result: Record<string, unknown> = {
      route: sanitizeValue(client.route),
      page: summarizePageRecord(page),
      selection: sanitizeValue(client.selection),
      account: {
        code: options.principal.context.accountCode,
        name: options.principal.context.accountName
      }
    };
    if (options.includeSampleData === true && 'sampleData' in client) {
      result.sampleData = sanitizeSampleValue(client.sampleData);
      result.sampleDataAuthorized = true;
    }

    return enforceByteLimit(result);
  }
}

export const aiContextInternals = {
  sanitizeValue,
  sanitizeSampleValue,
  summarizeRowActions,
  summarizePageRecord,
  validateClientPageHint,
  enforceByteLimit,
  SENSITIVE_KEY
};
