import { shallowReactive } from 'vue';
import { getLowCodeBlockMaterial, registerLowCodeBlockMaterial } from '../block-materials';
import { getLowCodeFormMaterial, registerLowCodeFormMaterial } from '../form-materials';
import { compileLowCodeMaterialSfc } from './sfc-compiler';
import {
  getLowCodeBlockMaterialAdapter,
  getLowCodeFormMaterialAdapter,
} from './material-adapters';
import {
  registerLowCodeBlockMaterialComponent,
  registerLowCodeFormMaterialComponent,
} from './component-bridge';
import type {
  LowCodeMaterialCatalogResult,
  LowCodeMaterialLoadError,
  LowCodeMaterialModule,
  LowCodeMaterialRow,
  LowCodeMaterialServiceApi,
} from './types';

export const lowCodeMaterialCatalogState = shallowReactive({
  loading: false,
  ready: false,
  rows: [] as LowCodeMaterialRow[],
  errors: [] as LowCodeMaterialLoadError[],
});

type LowCodeMaterialCatalogBridge = {
  getState: () => LowCodeMaterialCatalogResult & {
    loading: boolean;
    ready: boolean;
  };
  refresh: (serviceApi: LowCodeMaterialServiceApi) => Promise<LowCodeMaterialCatalogResult>;
  reset: () => void;
};

const compiledSourceModules = new Map<string, LowCodeMaterialModule>();
let initialization: Promise<LowCodeMaterialCatalogResult> | undefined;

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeSourcePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function normalizeMaterialRow(value: unknown): LowCodeMaterialRow | undefined {
  const row = readRecord(value);
  const kind = readString(row.material_kind);
  const code = readString(row.code);
  const sourceText = readString(row.source_text);
  const sourcePath = readString(row.source_path);
  if ((kind !== 'page' && kind !== 'form') || !code || !sourceText || !sourcePath) {
    return undefined;
  }

  return {
    id: readString(row.id),
    material_kind: kind,
    code,
    label: readString(row.label, code),
    description: readString(row.description) || null,
    category: readString(row.category, kind),
    renderer_type: readString(row.renderer_type, 'vue-sfc') as LowCodeMaterialRow['renderer_type'],
    source_path: sourcePath,
    source_text: sourceText,
    source_hash: readString(row.source_hash),
    material_version: readString(row.material_version, '1.0.0'),
    aliases: readStringArray(row.aliases),
    sort_order: Number(row.sort_order) || 0,
    manifest: readRecord(row.manifest),
    dependencies: readStringArray(row.dependencies),
    status: readString(row.status, 'published') as LowCodeMaterialRow['status'],
    enabled: row.enabled !== false,
    is_system: row.is_system === true,
  };
}

function resolveCompiledSource(_sourcePath: string, request: string) {
  return compiledSourceModules.get(normalizeSourcePath(request));
}

async function fetchMaterialRows(serviceApi: LowCodeMaterialServiceApi) {
  const result = await serviceApi.invoke<unknown[]>('lowcode', 'listItems', {
    resource: 'lowcode_materials',
    filters: { enabled: true, status: 'published' },
    sorts: [
      { field: 'material_kind', direction: 'asc' },
      { field: 'sort_order', direction: 'asc' },
      { field: 'code', direction: 'asc' },
    ],
    limit: 100,
  });
  return (Array.isArray(result) ? result : [])
    .map(normalizeMaterialRow)
    .filter((row): row is LowCodeMaterialRow => Boolean(row));
}

async function compileAndRegister(rows: LowCodeMaterialRow[]) {
  const errors: LowCodeMaterialLoadError[] = [];
  let compiled = 0;

  for (const row of rows) {
    if (row.renderer_type !== 'vue-sfc') continue;
    try {
      const result = await compileLowCodeMaterialSfc(row, resolveCompiledSource);
      compiledSourceModules.set(normalizeSourcePath(row.source_path), {
        __esModule: true,
        default: result.component,
      });
      if (row.material_kind === 'page') {
        registerLowCodeBlockMaterialComponent(row.code, result.component, row.aliases);
        const existing = getLowCodeBlockMaterial(row.code);
        const adapter = getLowCodeBlockMaterialAdapter(row.code);
        registerLowCodeBlockMaterial({
          ...existing,
          ...adapter,
          type: row.code,
          label: row.label,
          component: result.component,
          materialVersion: row.material_version,
          aliases: row.aliases,
          order: row.sort_order,
        });
      } else {
        registerLowCodeFormMaterialComponent(row.code, result.component, row.aliases);
        let existing;
        try {
          existing = getLowCodeFormMaterial(row.code);
        } catch {
          existing = undefined;
        }
        const adapter = getLowCodeFormMaterialAdapter(row.code);
        registerLowCodeFormMaterial({
          ...existing,
          ...adapter,
          type: row.code,
          label: row.label,
          component: result.component,
          aliases: row.aliases,
          order: row.sort_order,
        });
      }
      compiled += 1;
    } catch (error) {
      errors.push({
        kind: row.material_kind,
        code: row.code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { compiled, errors };
}

function catalogSnapshot(): LowCodeMaterialCatalogResult & { loading: boolean; ready: boolean } {
  return {
    loading: lowCodeMaterialCatalogState.loading,
    ready: lowCodeMaterialCatalogState.ready,
    rows: [...lowCodeMaterialCatalogState.rows],
    compiled: lowCodeMaterialCatalogState.rows.filter((row) =>
      compiledSourceModules.has(normalizeSourcePath(row.source_path))).length,
    errors: [...lowCodeMaterialCatalogState.errors],
  };
}

function installBrowserBridge() {
  if (typeof window === 'undefined') return;
  const bridge: LowCodeMaterialCatalogBridge = {
    getState: catalogSnapshot,
    refresh: initializeLowCodeMaterialCatalog,
    reset: resetLowCodeMaterialCatalog,
  };
  Object.defineProperty(window, '__LOWCODE_MATERIAL_CATALOG__', {
    configurable: true,
    enumerable: false,
    value: bridge,
  });
}

export function initializeLowCodeMaterialCatalog(serviceApi: LowCodeMaterialServiceApi) {
  installBrowserBridge();
  if (initialization) return initialization;
  lowCodeMaterialCatalogState.loading = true;
  initialization = (async () => {
    let rows: LowCodeMaterialRow[];
    try {
      rows = await fetchMaterialRows(serviceApi);
    } catch (error) {
      // The database catalog is introduced incrementally. Hosts (and older
      // embedded designer test fixtures) that do not expose the new resource
      // must continue using the statically registered legacy materials.
      // Keep this a non-fatal fallback; a warning remains visible for
      // operators while the registry stays usable.
      console.warn(
        '[LowCode Material] Catalog unavailable; using legacy material registry.',
        error,
      );
      lowCodeMaterialCatalogState.rows = [];
      lowCodeMaterialCatalogState.errors = [];
      lowCodeMaterialCatalogState.ready = false;
      return { rows: [], compiled: 0, errors: [] };
    }
    const { compiled, errors } = await compileAndRegister(rows);
    lowCodeMaterialCatalogState.rows = rows;
    lowCodeMaterialCatalogState.errors = errors;
    lowCodeMaterialCatalogState.ready = errors.length === 0 && compiled === rows.length;
    return { rows, compiled, errors };
  })().finally(() => {
    lowCodeMaterialCatalogState.loading = false;
  });
  initialization.catch(() => {
    initialization = undefined;
  });
  return initialization;
}

export function resetLowCodeMaterialCatalog() {
  initialization = undefined;
  compiledSourceModules.clear();
  lowCodeMaterialCatalogState.loading = false;
  lowCodeMaterialCatalogState.ready = false;
  lowCodeMaterialCatalogState.rows = [];
  lowCodeMaterialCatalogState.errors = [];
  installBrowserBridge();
}

declare global {
  interface Window {
    __LOWCODE_MATERIAL_CATALOG__?: LowCodeMaterialCatalogBridge;
  }
}

installBrowserBridge();
