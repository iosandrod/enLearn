import { shallowRef } from 'vue';
import type { AiPageContextSnapshot, AiSelection } from '../types/ai';

type SnapshotProvider = () => unknown;

const pageRecord = shallowRef<Record<string, unknown> | null>(null);
const selection = shallowRef<AiSelection>({});
let snapshotProvider: SnapshotProvider | undefined;

const SENSITIVE_KEY = /password|passphrase|token|cookie|authorization|api[_-]?key|secret|credential|private[_-]?key|connection[_-]?string/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return value.slice(0, 256);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, 160)
      .map(([key, item]) => [key, sanitize(item, depth + 1)])
  );
}

function sanitizeSample(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'string') return value ? '[redacted]' : '';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeSample(item, depth + 1));
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .slice(0, 160)
      .map(([key, item]) => [key, sanitizeSample(item, depth + 1)])
  );
}

function summarizeSchema(schema: unknown) {
  if (!isRecord(schema)) return {};
  const summarizeBlocks = (blocks: unknown): unknown[] => Array.isArray(blocks)
    ? blocks.slice(0, 100).map((candidate) => {
        if (!isRecord(candidate)) return {};
        const blockSchema = isRecord(candidate.schema) ? candidate.schema : {};
        const grid = isRecord(blockSchema.grid) ? blockSchema.grid : {};
        return {
          id: candidate.id,
          kind: candidate.kind,
          title: candidate.title,
          sourceKey: candidate.sourceKey,
          fields: Array.isArray(blockSchema.fields)
            ? blockSchema.fields.slice(0, 100).map((field) => isRecord(field)
              ? { field: field.field, label: field.label, component: field.component }
              : {})
            : [],
          columns: Array.isArray(grid.columns)
            ? grid.columns.slice(0, 100).map((column) => isRecord(column)
              ? { field: column.field, title: column.title, type: column.type }
              : {})
            : [],
          actions: Array.isArray(candidate.actions)
            ? candidate.actions.slice(0, 50).map((action) => isRecord(action)
              ? { code: action.code, label: action.label, eventName: action.eventName, hasScript: Boolean(action.script) }
              : {})
            : [],
          blocks: summarizeBlocks(candidate.blocks),
          tabs: Array.isArray(candidate.tabs)
            ? candidate.tabs.slice(0, 20).map((tab) => isRecord(tab)
              ? { key: tab.key, label: tab.label, blocks: summarizeBlocks(tab.blocks) }
              : {})
            : []
        };
      })
    : [];
  return {
    dataSources: sanitize(schema.dataSources),
    blocks: summarizeBlocks(schema.blocks),
    overlays: summarizeBlocks(schema.overlays),
    functions: Array.isArray(schema.functions)
      ? schema.functions.map((fn) => isRecord(fn)
        ? { name: fn.name, label: fn.label, description: fn.description, hasScript: Boolean(fn.script) }
        : {})
      : [],
    scriptPolicy: sanitize(schema.scriptPolicy)
  };
}

export function setAiPageContext(
  page: Record<string, unknown> | null,
  provider?: SnapshotProvider
) {
  pageRecord.value = page;
  snapshotProvider = provider;
}

export function clearAiPageContext(pageId?: string) {
  if (pageId && String(pageRecord.value?.id ?? '') !== pageId) return;
  pageRecord.value = null;
  snapshotProvider = undefined;
  selection.value = {};
}

export function useAiPageContext() {
  const route = useRoute();

  function build(includeSampleData = false): AiPageContextSnapshot {
    const page = pageRecord.value;
    const result: AiPageContextSnapshot = {
      pageRef: page
        ? {
            id: String(page.id ?? '') || undefined,
            code: String(page.code ?? '') || undefined,
            route: String(page.route ?? '') || undefined,
            version: Number(page.version) || undefined
          }
        : undefined,
      clientContext: {
        route: {
          path: route.path,
          fullPath: route.fullPath,
          queryKeys: Object.keys(route.query),
          paramKeys: Object.keys(route.params)
        },
        page: page
          ? {
              id: page.id,
              code: page.code,
              route: page.route,
              title: page.title,
              pageType: page.page_type,
              version: page.version,
              schema: summarizeSchema(page.schema)
            }
          : undefined,
        selection: selection.value
      },
      hasSampleData: Boolean(snapshotProvider)
    };
    if (includeSampleData && snapshotProvider) {
      const snapshot = snapshotProvider();
      if (isRecord(snapshot)) {
        result.clientContext.sampleData = sanitizeSample({
          resolvedData: snapshot.resolvedData,
          formModels: snapshot.formModels,
          searchFilters: snapshot.searchFilters,
          gridStates: snapshot.gridStates
        });
      }
    }
    return result;
  }

  return { pageRecord, selection, build };
}

export const aiPageContextInternals = { sanitize, sanitizeSample, summarizeSchema, SENSITIVE_KEY };
