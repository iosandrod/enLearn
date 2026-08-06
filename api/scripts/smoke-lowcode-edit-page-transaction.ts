import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { createSupabaseClient } from '../src/common/utils/supabase';

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

async function postJsonWithAccount(
  path: string,
  body: JsonRecord,
  accessToken: string,
  accountId: string
) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'x-account-id': accountId
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

async function assignSmokeUserAccess(
  userId: string
) {
  const admin = createSupabaseClient('admin');
  const { data, error } = await admin.rpc('prepare_api_smoke_test_access', {
    p_user_id: userId,
    p_permission_code: 'lowcode.pages.manage'
  });
  if (error) throw new Error(error.message);
  const access = isRecord(data) ? data : {};
  const accountId = typeof access.account_id === 'string' ? access.account_id : '';
  assert.ok(accountId, 'An active business account set is required.');
  return accountId;
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
  const supabaseAdmin = createSupabaseClient('admin');
  let userId = '';

  try {
    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? 'Could not create the test user.');
    }
    userId = createdUser.user.id;

    const accountId = await assignSmokeUserAccess(userId);

    const signIn = await postJson('/api/auth/signin', { email, password });
    if (!signIn.response.ok || !isRecord(signIn.payload)) {
      throw new Error(readMessage(signIn.payload) || 'Could not sign in the test user.');
    }
    const session = isRecord(signIn.payload.session) ? signIn.payload.session : {};
    const user = isRecord(signIn.payload.user) ? signIn.payload.user : {};
    const accessToken = typeof session.access_token === 'string' ? session.access_token : '';
    const signedInUserId = typeof user.id === 'string' ? user.id : '';
    assert.ok(accessToken, 'Sign-in response must include an access token.');
    assert.equal(signedInUserId, userId, 'Sign-in response must include the created user id.');

    const { error: listPageError } = await supabaseAdmin.from('lowcode_pages').insert({
      id: listPageId,
      code: listCode,
      route: listRoute,
      title: 'Transactional List Page',
      layout: 'dashboard',
      status: 'published',
      keep_alive: true,
      page_type: 'list',
      schema: { ...buildSchema(), code: listCode, route: listRoute, pageType: 'list' },
      version: 1,
      created_by: userId,
      updated_by: userId,
      published_at: new Date().toISOString()
    });
    if (listPageError) throw new Error(listPageError.message);

    const save = await postJsonWithAccount(
      '/api/service',
      buildSaveRequest(buildSchema()),
      accessToken,
      accountId
    );
    if (!save.response.ok) {
      throw new Error(readMessage(save.payload) || 'Transactional edit-page save failed.');
    }

    const { data: listPage, error: listPageReadError } = await supabaseAdmin
      .from('lowcode_pages')
      .select('edit_page_id')
      .eq('id', listPageId)
      .single();
    if (listPageReadError) throw new Error(listPageReadError.message);
    assert.ok(listPage.edit_page_id, 'List page must be linked to the saved edit page.');
    const [{ count: editCount }, { count: versionCount }] = await Promise.all([
      supabaseAdmin
        .from('lowcode_pages')
        .select('id', { count: 'exact', head: true })
        .eq('id', listPage.edit_page_id),
      supabaseAdmin
        .from('lowcode_page_versions')
        .select('id', { count: 'exact', head: true })
        .eq('page_id', listPage.edit_page_id)
    ]);
    assert.equal(editCount, 1);
    assert.equal(versionCount, 1);

    const rollbackCode = `${editCode}-rollback`;
    const rollbackRoute = `${editRoute}-rollback`;
    const rollbackSchema = {
      ...buildSchema(),
      code: rollbackCode,
      route: rollbackRoute
    };
    const failedSave = await postJsonWithAccount(
      '/api/service',
      buildSaveRequest(rollbackSchema, {
        parentId: randomUUID(),
        pageCode: rollbackCode,
        pageRoute: rollbackRoute
      }),
      accessToken,
      accountId
    );
    assert.equal(failedSave.response.ok, false);
    assert.match(readMessage(failedSave.payload), /expected 1 affected row/);

    const { data: rollbackPages, error: rollbackReadError } = await supabaseAdmin
      .from('lowcode_pages')
      .select('id')
      .eq('code', rollbackCode);
    if (rollbackReadError) throw new Error(rollbackReadError.message);
    assert.deepEqual(rollbackPages, []);
    console.log('Low-code edit-page transaction smoke test passed.');
  } finally {
    await Promise.resolve(
      supabaseAdmin
        .from('lowcode_pages')
        .delete()
        .or(`id.eq.${listPageId},code.eq.${editCode}`)
    ).catch(() => undefined);
    if (userId) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
