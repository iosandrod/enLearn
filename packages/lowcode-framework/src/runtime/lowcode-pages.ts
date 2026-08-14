import type { LowCodeHostServiceApi } from '../core/host';
import type { LowCodePageRecord, LowCodePageSchema } from '../types/lowcode';

export type LowCodePageLookup = {
  id?: string;
  code?: string;
  route?: string;
  includeData?: boolean;
};

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return String(error ?? '');

  const candidate = error as {
    statusMessage?: unknown;
    message?: unknown;
    data?: { statusMessage?: unknown; message?: unknown };
  };
  return [
    candidate.statusMessage,
    candidate.message,
    candidate.data?.statusMessage,
    candidate.data?.message,
  ].filter((value): value is string => typeof value === 'string').join(' ');
}

function isMissingLowCodePageError(error: unknown) {
  const candidate = error as { status?: unknown; statusCode?: unknown } | null;
  const status = candidate?.statusCode ?? candidate?.status;
  const message = readErrorMessage(error).toLowerCase();
  return status === 404 || (
    (message.includes('low-code page') || message.includes('lowcode page')) &&
    message.includes('not found')
  );
}

function isUniqueConflictError(error: unknown) {
  const message = readErrorMessage(error).toLowerCase();
  return message.includes('duplicate key') || message.includes('unique constraint');
}

function buildEditPageRoute(page: LowCodePageRecord) {
  const route = readString(page.route).split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return `${route || '/dashboard'}/edit`;
}

function buildEmptyEditPageSchema(page: LowCodePageRecord): LowCodePageSchema {
  const code = `${page.code}-edit`;
  const route = buildEditPageRoute(page);

  return {
    schemaVersion: 1,
    code,
    route,
    title: `${page.title || page.code}编辑`,
    pageType: 'edit',
    description: '',
    layout: page.layout || 'dashboard',
    status: 'published',
    keepAlive: page.keep_alive !== false,
    blocks: [],
    dataSources: {},
  };
}

function buildEditPageSaveData(page: LowCodePageRecord, schema: LowCodePageSchema) {
  const publishedAt = new Date().toISOString();
  return {
    code: schema.code,
    route: schema.route,
    title: schema.title,
    description: schema.description ?? null,
    layout: schema.layout ?? 'dashboard',
    status: 'published',
    keep_alive: schema.keepAlive ?? true,
    page_type: 'edit',
    edit_page_id: null,
    view_name: page.view_name ?? null,
    table_name: page.table_name ?? null,
    schema,
    version: 1,
    published_at: publishedAt,
    __details: [
      {
        resource: 'lowcode_page_versions',
        mode: 'replace',
        foreignKey: 'page_id',
        parentKey: 'id',
        rows: [{ version: 1, schema, published_at: publishedAt }],
      },
    ],
  };
}

export async function listLowCodePages(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  postData: Record<string, unknown> = {},
) {
  const rows = await serviceApi.invoke<LowCodePageRecord[]>('lowcode', 'listItems', {
    tableName: 'lowcode_pages',
    sorts: [{ field: 'updated_at', direction: 'desc' }],
    ...postData,
  });

  return Array.isArray(rows) ? rows : [];
}

export async function getLowCodePage(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  lookup: LowCodePageLookup,
) {
  const id = readString(lookup.id);
  const code = readString(lookup.code);
  const route = readString(lookup.route);

  if (!id && !code && !route) {
    throw new Error('id, code, or route is required.');
  }

  const rows = await listLowCodePages(serviceApi, {
    filters: {
      ...(id ? { id } : {}),
      ...(code ? { code } : {}),
      ...(route ? { route } : {}),
    },
    includeData: lookup.includeData !== false,
    limit: 1,
  });
  const page = rows[0];

  if (!page) {
    throw new Error('Low-code page not found.');
  }

  return page;
}

async function findLowCodePage(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  lookup: LowCodePageLookup,
) {
  try {
    return await getLowCodePage(serviceApi, lookup);
  } catch (error) {
    if (isMissingLowCodePageError(error)) return undefined;
    throw error;
  }
}

async function linkEditPage(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  page: LowCodePageRecord,
  editPage: LowCodePageRecord,
) {
  if (page.edit_page_id === editPage.id) return;

  const savedPage = await serviceApi.invoke<LowCodePageRecord>('lowcode', 'saveItem', {
    resource: 'lowcode_pages',
    id: page.id,
    data: { edit_page_id: editPage.id },
  });
  page.edit_page_id = readString(savedPage?.edit_page_id) || editPage.id;
}

/**
 * Resolves a list page's edit page, creating and linking an empty one when needed.
 */
export async function ensureLowCodeEditPage(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  page: LowCodePageRecord,
) {
  const linkedPageId = readString(page.edit_page_id);
  if (linkedPageId) {
    const linkedPage = await findLowCodePage(serviceApi, {
      id: linkedPageId,
      includeData: false,
    });
    if (linkedPage) return linkedPage;
  }

  const editCode = `${page.code}-edit`;
  const existingPage = await findLowCodePage(serviceApi, {
    code: editCode,
    includeData: false,
  });
  if (existingPage) {
    await linkEditPage(serviceApi, page, existingPage);
    return existingPage;
  }

  const schema = buildEmptyEditPageSchema(page);
  const data = buildEditPageSaveData(page, schema);

  try {
    const createdPage = await serviceApi.invoke<LowCodePageRecord>('lowcode', 'saveItem', {
      resource: 'lowcode_pages',
      data,
      afterSave: [
        {
          action: 'update',
          resource: 'lowcode_pages',
          data: { edit_page_id: { $ref: 'saved.id' } },
          where: { id: page.id },
          expect: 1,
        },
      ],
    });
    page.edit_page_id = createdPage.id;
    return createdPage;
  } catch (error) {
    if (!isUniqueConflictError(error)) throw error;

    const concurrentPage = await findLowCodePage(serviceApi, {
      code: editCode,
      includeData: false,
    });
    if (!concurrentPage) throw error;
    await linkEditPage(serviceApi, page, concurrentPage);
    return concurrentPage;
  }
}
