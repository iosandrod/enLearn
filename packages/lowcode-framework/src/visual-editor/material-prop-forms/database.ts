import type { LowCodeHostServiceApi } from '../../core/host';
import { registerMaterialPropForm, unregisterMaterialPropForm } from './registry';
import type { MaterialPropFormDefinition } from './types';

export const MATERIAL_PROP_FORM_CODE_PREFIX = 'material-prop.';

export function getMaterialPropFormCode(componentKey: string) {
  return `${MATERIAL_PROP_FORM_CODE_PREFIX}${componentKey.trim().toLowerCase()}`;
}

type MaterialPropFormRecord = {
  code?: unknown;
  name?: unknown;
  schema?: unknown;
};

const loadedRequests = new WeakMap<
  LowCodeHostServiceApi,
  Map<string, Promise<MaterialPropFormDefinition | null>>
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasRootTabs(layout: unknown): boolean {
  return (
    Array.isArray(layout) &&
    layout.length === 1 &&
    isRecord(layout[0]) &&
    layout[0].kind === 'tabs' &&
    Array.isArray(layout[0].tabs) &&
    layout[0].tabs.length > 0
  );
}

function normalizeDefinition(record: MaterialPropFormRecord) {
  if (!isRecord(record.schema)) return null;

  const schema = structuredClone(record.schema);
  const code = readString(record.code);
  const componentKey = readString(schema.componentKey) ||
    (code.startsWith(MATERIAL_PROP_FORM_CODE_PREFIX)
      ? code.slice(MATERIAL_PROP_FORM_CODE_PREFIX.length)
      : '');

  if (
    !componentKey ||
    !Array.isArray(schema.fields) ||
    !Array.isArray(schema.actions) ||
    !hasRootTabs(schema.layout)
  ) {
    return null;
  }

  return {
    componentKey,
    title: readString(schema.title) || readString(record.name) || componentKey,
    fields: schema.fields,
    layout: schema.layout,
    actions: schema.actions,
  } as MaterialPropFormDefinition;
}

function getRequestMap(serviceApi: LowCodeHostServiceApi) {
  let requests = loadedRequests.get(serviceApi);
  if (!requests) {
    requests = new Map();
    loadedRequests.set(serviceApi, requests);
  }
  return requests;
}

export function loadDatabaseMaterialPropForm(
  serviceApi: LowCodeHostServiceApi,
  componentKey: string,
) {
  const normalizedKey = componentKey.trim();
  if (!normalizedKey) return Promise.resolve(null);

  const requests = getRequestMap(serviceApi);
  const activeRequest = requests.get(normalizedKey);
  if (activeRequest) return activeRequest;

  const code = getMaterialPropFormCode(normalizedKey);

  const request = serviceApi
    .invoke<MaterialPropFormRecord[]>('lowcode', 'listItems', {
      resource: 'lowcode_form_definitions',
      filters: {
        code,
        enabled: true,
      },
      limit: 1,
    })
    .then((rows) => {
      const definition = normalizeDefinition(Array.isArray(rows) ? rows[0] ?? {} : {});
      if (definition?.componentKey === normalizedKey) {
        registerMaterialPropForm(definition);
        return definition;
      }
      unregisterMaterialPropForm(normalizedKey);
      return null;
    })
    .catch((error) => {
      requests.delete(normalizedKey);
      throw error;
    });

  requests.set(normalizedKey, request);
  return request;
}

export function reloadDatabaseMaterialPropForm(
  serviceApi: LowCodeHostServiceApi,
  componentKey: string,
) {
  getRequestMap(serviceApi).delete(componentKey.trim());
  unregisterMaterialPropForm(componentKey.trim());
  return loadDatabaseMaterialPropForm(serviceApi, componentKey);
}
