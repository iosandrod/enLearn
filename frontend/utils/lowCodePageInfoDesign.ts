import type {
  LowCodePageApi,
  LowCodePageFunction,
  LowCodePageRelateConfig,
  LowCodePageRecord,
  LowCodePageSchema,
} from '@enlearn/lowcode-framework/types/lowcode';

export type PageInfoDesignForm = {
  code: string;
  route: string;
  title: string;
  tableName: string;
  relateConfig: LowCodePageRelateConfig;
  pageType: LowCodePageRecord['page_type'];
  layout: LowCodePageRecord['layout'];
  status: LowCodePageRecord['status'];
  keepAlive: boolean;
  description: string;
  functions: LowCodePageFunction[];
  apis: Array<LowCodePageApi & { name: string }>;
};

export function createPageInfoDesignForm(page: LowCodePageRecord): PageInfoDesignForm {
  return {
    code: page.code,
    route: page.route,
    title: page.title,
    tableName: normalizePageTableName(page.table_name),
    relateConfig: normalizePageRelateConfig(page.relate_config),
    pageType: page.page_type,
    layout: page.layout,
    status: page.status,
    keepAlive: page.keep_alive,
    description: page.description ?? '',
    functions: (page.schema.functions ?? []).map((pageFunction) => ({
      ...pageFunction,
      enabled: pageFunction.enabled !== false,
    })),
    apis: Object.entries(page.schema.apis ?? {}).map(([name, api]) => ({
      name,
      ...api,
      method: api.method ?? 'POST',
      postData: { ...(api.postData ?? {}) },
    })),
  };
}

function normalizePageTableName(value: unknown) {
  return typeof value === 'string'
    ? value.trim().replace(/^public\./i, '')
    : '';
}

function normalizePageRelateConfig(value: unknown): LowCodePageRelateConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as LowCodePageRelateConfig;
}

function normalizePageFunctions(value: unknown): LowCodePageFunction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
    )
    .map((item) => ({
      name: String(item.name ?? '').trim(),
      label: String(item.label ?? '').trim(),
      description: String(item.description ?? '').trim(),
      enabled: item.enabled !== false,
      script: typeof item.script === 'string' ? item.script : '',
    }))
    .filter((item) => item.name || item.script);
}

function normalizePageApis(value: unknown): PageInfoDesignForm['apis'] {
  if (!Array.isArray(value)) return [];
  const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  return value
    .filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
    )
    .map((item) => {
      const method = String(item.method ?? 'POST').trim().toUpperCase();
      return {
        name: String(item.name ?? '').trim(),
        serviceName: String(item.serviceName ?? '').trim(),
        serviceMethod: String(item.serviceMethod ?? '').trim(),
        method: (methods.has(method) ? method : 'POST') as LowCodePageApi['method'],
        resultPath: String(item.resultPath ?? '').trim(),
        postData:
          typeof item.postData === 'object' && item.postData !== null && !Array.isArray(item.postData)
            ? { ...(item.postData as Record<string, unknown>) }
            : {},
      };
    })
    .filter((item) => item.name || item.serviceName || item.serviceMethod);
}

export function normalizePageInfoDesignForm(
  value: PageInfoDesignForm,
  page: LowCodePageRecord,
): PageInfoDesignForm {
  const pageTypes: LowCodePageRecord['page_type'][] = ['list', 'edit', 'detail', 'custom'];
  const layouts: LowCodePageRecord['layout'][] = ['default', 'dashboard', 'blank'];
  const statuses: LowCodePageRecord['status'][] = ['draft', 'published', 'archived'];

  return {
    code: page.code,
    route: page.route,
    title: String(value.title ?? '').trim(),
    tableName: normalizePageTableName(value.tableName),
    relateConfig: normalizePageRelateConfig(value.relateConfig),
    pageType: pageTypes.includes(value.pageType) ? value.pageType : page.page_type,
    layout: layouts.includes(value.layout) ? value.layout : page.layout,
    status: statuses.includes(value.status) ? value.status : page.status,
    keepAlive: value.keepAlive !== false,
    description: String(value.description ?? '').trim(),
    functions: normalizePageFunctions(value.functions),
    apis: normalizePageApis(value.apis),
  };
}

function pageApiRecord(apis: PageInfoDesignForm['apis']): Record<string, LowCodePageApi> {
  return Object.fromEntries(apis.map(({ name, ...api }) => [name, {
    serviceName: api.serviceName,
    serviceMethod: api.serviceMethod,
    method: api.method,
    ...(api.resultPath ? { resultPath: api.resultPath } : {}),
    ...(api.postData && Object.keys(api.postData).length ? { postData: api.postData } : {}),
  }]));
}

export function buildPageInfoSaveData(page: LowCodePageRecord, value: PageInfoDesignForm) {
  const schema: LowCodePageSchema = {
    ...page.schema,
    code: page.code,
    route: page.route,
    title: value.title,
    pageType: value.pageType,
    description: value.description,
    layout: value.layout,
    status: value.status,
    keepAlive: value.keepAlive,
    functions: value.functions,
    apis: pageApiRecord(value.apis),
  };

  return {
    code: page.code,
    route: page.route,
    title: value.title,
    description: value.description || null,
    layout: value.layout,
    status: value.status,
    keep_alive: value.keepAlive,
    page_type: value.pageType,
    table_name: value.tableName || null,
    relate_config: normalizePageRelateConfig(value.relateConfig),
    edit_page_id: page.edit_page_id,
    schema,
    version: page.version + 1,
    published_at: value.status === 'published'
      ? new Date().toISOString()
      : page.published_at,
  };
}
