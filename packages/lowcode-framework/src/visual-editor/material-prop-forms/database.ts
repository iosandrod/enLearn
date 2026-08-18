import type { LowCodeHostServiceApi } from '../../core/host';
import { registerMaterialPropForm } from './registry';
import type { MaterialPropFormDefinition } from './types';

export const MATERIAL_PROP_FORM_CODE_PREFIX = 'material-prop.';

type MaterialPropFormRecord = {
  code?: unknown;
  name?: unknown;
  schema?: unknown;
};

const loadedRequests = new WeakMap<
  LowCodeHostServiceApi,
  Promise<MaterialPropFormDefinition[]>
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDefinition(record: MaterialPropFormRecord) {
  if (!isRecord(record.schema)) return null;

  const schema = structuredClone(record.schema);
  const code = readString(record.code);
  const componentKey = readString(schema.componentKey) ||
    (code.startsWith(MATERIAL_PROP_FORM_CODE_PREFIX)
      ? code.slice(MATERIAL_PROP_FORM_CODE_PREFIX.length)
      : '');

  if (!componentKey || !Array.isArray(schema.fields) || !Array.isArray(schema.actions)) {
    return null;
  }
  if (schema.layout !== undefined && !Array.isArray(schema.layout)) return null;

  return {
    componentKey,
    title: readString(schema.title) || readString(record.name) || componentKey,
    extendsVisualProps: schema.extendsVisualProps !== false,
    mergeBuiltinFields: schema.mergeBuiltinFields !== false,
    separateArrayTableTabs: schema.separateArrayTableTabs === true,
    fields: schema.fields,
    ...(Array.isArray(schema.layout) ? { layout: schema.layout } : {}),
    actions: schema.actions,
  } as MaterialPropFormDefinition;
}

export function loadDatabaseMaterialPropForms(serviceApi: LowCodeHostServiceApi) {
  const activeRequest = loadedRequests.get(serviceApi);
  if (activeRequest) return activeRequest;

  const request = serviceApi
    .invoke<MaterialPropFormRecord[]>('lowcode', 'listItems', {
      resource: 'lowcode_form_definitions',
      filters: {
        code: { op: 'startsWith', value: MATERIAL_PROP_FORM_CODE_PREFIX },
        enabled: true,
      },
      limit: 500,
    })
    .then((rows) => {
      const definitions = (Array.isArray(rows) ? rows : [])
        .map(normalizeDefinition)
        .filter((definition): definition is MaterialPropFormDefinition => definition !== null);

      definitions.forEach(registerMaterialPropForm);
      return definitions;
    })
    .catch((error) => {
      loadedRequests.delete(serviceApi);
      throw error;
    });

  loadedRequests.set(serviceApi, request);
  return request;
}

export function reloadDatabaseMaterialPropForms(serviceApi: LowCodeHostServiceApi) {
  loadedRequests.delete(serviceApi);
  return loadDatabaseMaterialPropForms(serviceApi);
}
