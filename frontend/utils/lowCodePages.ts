import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/runtime';
import type { LowCodePageRecord } from '@enlearn/lowcode-framework/types/lowcode';

export type LowCodePageLookup = {
  code?: string;
  route?: string;
  includeData?: boolean;
};

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstPage(value: unknown) {
  return Array.isArray(value) ? (value[0] as LowCodePageRecord | undefined) : undefined;
}

export async function listLowCodePages(
  serviceApi: Pick<LowCodeHostServiceApi, 'invoke'>,
  postData: Record<string, unknown> = {},
) {
  const rows = await serviceApi.invoke<LowCodePageRecord[]>('admin', 'listItems', {
    entityCode: 'lowcode_pages',
    ...postData,
  });

  return Array.isArray(rows) ? rows : [];
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
    ...(code ? { code } : {}),
    ...(route ? { route } : {}),
    includeData: lookup.includeData !== false,
    limit: 1,
  });
  const page = firstPage(rows);

  if (!page) {
    throw new Error('Low-code page not found.');
  }

  return page;
}
