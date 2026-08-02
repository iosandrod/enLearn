import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/runtime';
import type {
  LowCodePageOpenType,
  LowCodePageRecord,
  LowCodePageRelation
} from '@enlearn/lowcode-framework/types/lowcode';

export type LowCodePageLookup = {
  code?: string;
  route?: string;
  includeData?: boolean;
  includeRelations?: boolean;
};

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstPage(value: unknown) {
  return Array.isArray(value) ? (value[0] as LowCodePageRecord | undefined) : undefined;
}

type RelationPageRow = Pick<LowCodePageRecord, 'id' | 'code' | 'route' | 'title' | 'status'>;

type RelationRow = {
  id: string;
  source_page_id: string;
  action_key: string;
  target_page_id: string;
  open_type: LowCodePageOpenType;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  source_page?: RelationPageRow | RelationPageRow[] | null;
  target_page?: RelationPageRow | RelationPageRow[] | null;
};

const relationSelect = `
  id,
  source_page_id,
  action_key,
  target_page_id,
  open_type,
  metadata,
  created_at,
  updated_at,
  source_page:source_page_id(id, code, route, title, status),
  target_page:target_page_id(id, code, route, title, status)
`;

function readRelationPage(value?: RelationPageRow | RelationPageRow[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeRelation(row: RelationRow): LowCodePageRelation {
  const sourcePage = readRelationPage(row.source_page);
  const targetPage = readRelationPage(row.target_page);

  return {
    id: row.id,
    sourcePageId: row.source_page_id,
    sourcePageCode: sourcePage?.code ?? '',
    sourcePageRoute: sourcePage?.route,
    sourcePageTitle: sourcePage?.title,
    actionKey: row.action_key,
    targetPageId: row.target_page_id,
    targetPageCode: targetPage?.code ?? '',
    targetPageRoute: targetPage?.route,
    targetPageTitle: targetPage?.title,
    openType: row.open_type || 'page',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingRelationTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('lowcode_page_relations') || message.includes('Could not find the table');
}

async function listLowCodePageRelations(serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>) {
  try {
    const rows = await serviceApi.invoke<RelationRow[]>('lowcode', 'listItems', {
      tableName: 'lowcode_page_relations',
      select: relationSelect,
      sorts: [{ field: 'updated_at', direction: 'desc' }],
      limit: 1000,
    });

    return Array.isArray(rows) ? rows.map(normalizeRelation) : [];
  } catch (error) {
    if (isMissingRelationTable(error)) return [];
    throw error;
  }
}

function attachRelations(pages: LowCodePageRecord[], relations: LowCodePageRelation[]) {
  return pages.map((page) => ({
    ...page,
    relations: {
      outgoing: relations.filter((relation) => relation.sourcePageId === page.id),
      incoming: relations.filter((relation) => relation.targetPageId === page.id),
    },
  }));
}

export async function listLowCodePages(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  postData: Record<string, unknown> = {},
) {
  const { includeRelations, ...listPostData } = postData;
  const rows = await serviceApi.invoke<LowCodePageRecord[]>('lowcode', 'listItems', {
    tableName: 'lowcode_pages',
    sorts: [{ field: 'updated_at', direction: 'desc' }],
    ...listPostData,
  });

  const pages = Array.isArray(rows) ? rows : [];
  if (includeRelations !== true) return pages;

  return attachRelations(pages, await listLowCodePageRelations(serviceApi));
}

export async function getLowCodePage(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  lookup: LowCodePageLookup,
) {
  const code = readString(lookup.code);
  const route = readString(lookup.route);

  if (!code && !route) {
    throw new Error('code or route is required.');
  }

  const rows = await listLowCodePages(serviceApi, {
    filters: {
      ...(code ? { code } : {}),
      ...(route ? { route } : {}),
    },
    includeData: lookup.includeData !== false,
    includeRelations: lookup.includeRelations === true,
    limit: 1,
  });
  const page = firstPage(rows);

  if (!page) {
    throw new Error('Low-code page not found.');
  }

  return page;
}
