import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { getPostgresPool } from '../src/common/utils/database';

type JsonRecord = Record<string, unknown>;

const apiUrl = (process.env.API_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `lowcode-edit-transaction-${runId}@example.test`;
const password = `LowCodeTx-${runId}-A9!`;
const listPageId = randomUUID();
const listCode = `tx-list-${runId}`;
const editCode = `${listCode}-edit`;
const listRoute = `/dashboard/transaction-test/${runId}`;
const editRoute = `${listRoute}/edit`;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readMessage).filter(Boolean).join(' ');
  if (!isRecord(value)) return '';
  return [value.message, value.error, value.statusMessage]
    .map(readMessage)
    .filter(Boolean)
    .join(' ');
}

async function postJson(path: string, body: JsonRecord, accessToken?: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  return { response, payload };
}

function buildSchema() {
  return {
    schemaVersion: 1,
    code: editCode,
    route: editRoute,
    title: 'Transactional Edit Page',
    pageType: 'edit',
    description: '',
    layout: 'dashboard',
    status: 'published',
    keepAlive: true,
    blocks: [],
    dataSources: {}
  };
}

function buildSaveRequest(
  schema: JsonRecord,
  options: { parentId?: string; pageCode?: string; pageRoute?: string } = {}
): JsonRecord {
  const publishedAt = new Date().toISOString();
  const pageCode = options.pageCode ?? editCode;
  const pageRoute = options.pageRoute ?? editRoute;
  return {
    serviceName: 'lowcode',
    serviceMethod: 'saveItem',
    postData: {
      resource: 'lowcode_pages',
      data: {
        code: pageCode,
        route: pageRoute,
        title: 'Transactional Edit Page',
        description: null,
        layout: 'dashboard',
        status: 'published',
        keep_alive: true,
        page_type: schema.pageType,
        schema,
        version: 1,
        published_at: publishedAt,
        edit_page_id: null,
        __details: [
          {
            resource: 'lowcode_page_versions',
            mode: 'replace',
            foreignKey: 'page_id',
            parentKey: 'id',
            rows: [{ version: 1, schema, published_at: publishedAt }]
          }
        ]
      },
      afterSave: [
        {
          action: 'update',
          resource: 'lowcode_pages',
          data: { edit_page_id: { $ref: 'saved.id' } },
          where: { id: options.parentId ?? listPageId },
          expect: 1
        }
      ]
    }
  };
}

async function main() {
  const pool = getPostgresPool();
  let userId = '';

  try {
    const createdUser = await postJson('/api/auth/signup', { email, password });
    if (!createdUser.response.ok || !isRecord(createdUser.payload)) {
      throw new Error(readMessage(createdUser.payload) || 'Could not create the test user.');
    }

    const signIn = await postJson('/api/auth/signin', { email, password });
    if (!signIn.response.ok || !isRecord(signIn.payload)) {
      throw new Error(readMessage(signIn.payload) || 'Could not sign in the test user.');
    }
    const session = isRecord(signIn.payload.session) ? signIn.payload.session : {};
    const user = isRecord(signIn.payload.user) ? signIn.payload.user : {};
    const accessToken = typeof session.access_token === 'string' ? session.access_token : '';
    userId = typeof user.id === 'string' ? user.id : '';
    assert.ok(accessToken, 'Sign-in response must include an access token.');
    assert.ok(userId, 'Sign-in response must include a user id.');

    await pool.query(
      `insert into public.admin_user_roles (user_id, role_id)
       select $1, id from public.admin_roles where code = 'system_admin'
       on conflict (user_id, role_id) do nothing`,
      [userId]
    );

    await pool.query(
      `insert into public.lowcode_pages (
         id, code, route, title, layout, status, keep_alive, page_type, schema, version,
         created_by, updated_by, published_at
       ) values ($1, $2, $3, $4, 'dashboard', 'published', true, 'list', $5::jsonb, 1, $6, $6, now())`,
      [
        listPageId,
        listCode,
        listRoute,
        'Transactional List Page',
        JSON.stringify({ ...buildSchema(), code: listCode, route: listRoute, pageType: 'list' }),
        userId
      ]
    );

    const save = await postJson('/api/service', buildSaveRequest(buildSchema()), accessToken);
    if (!save.response.ok) {
      throw new Error(readMessage(save.payload) || 'Transactional edit-page save failed.');
    }

    const result = await pool.query<{
      edit_page_id: string | null;
      edit_count: number;
      version_count: number;
    }>(
      `select
         list_page.edit_page_id,
         count(distinct edit_page.id)::int as edit_count,
         count(version_row.id)::int as version_count
       from public.lowcode_pages list_page
       left join public.lowcode_pages edit_page on edit_page.id = list_page.edit_page_id
       left join public.lowcode_page_versions version_row on version_row.page_id = edit_page.id
       where list_page.id = $1
       group by list_page.edit_page_id`,
      [listPageId]
    );

    assert.ok(result.rows[0]?.edit_page_id, 'List page must be linked to the saved edit page.');
    assert.equal(result.rows[0]?.edit_count, 1);
    assert.equal(result.rows[0]?.version_count, 1);

    const rollbackCode = `${editCode}-rollback`;
    const rollbackRoute = `${editRoute}-rollback`;
    const rollbackSchema = {
      ...buildSchema(),
      code: rollbackCode,
      route: rollbackRoute
    };
    const failedSave = await postJson(
      '/api/service',
      buildSaveRequest(rollbackSchema, {
        parentId: randomUUID(),
        pageCode: rollbackCode,
        pageRoute: rollbackRoute
      }),
      accessToken
    );
    assert.equal(failedSave.response.ok, false);
    assert.match(readMessage(failedSave.payload), /expected 1 affected row/);

    const rollbackResult = await pool.query<{ page_count: number; version_count: number }>(
      `select
         count(distinct page.id)::int as page_count,
         count(version_row.id)::int as version_count
       from public.lowcode_pages page
       left join public.lowcode_page_versions version_row on version_row.page_id = page.id
       where page.code = $1`,
      [rollbackCode]
    );
    assert.deepEqual(rollbackResult.rows[0], { page_count: 0, version_count: 0 });
    console.log('Low-code edit-page transaction smoke test passed.');
  } finally {
    await pool.query('delete from public.lowcode_pages where id = $1 or code = $2', [
      listPageId,
      editCode
    ]).catch(() => undefined);
    if (userId) {
      await pool.query('delete from auth.users where id = $1', [userId]).catch(() => undefined);
    }
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
