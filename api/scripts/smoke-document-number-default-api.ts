import assert from 'node:assert/strict';
import { createSupabaseClient } from '../src/common/utils/supabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  const admin = createSupabaseClient('admin');
  const publicClient = createSupabaseClient('public');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `document-number-api-${suffix}@example.test`;
  const password = `DocumentNumber-${suffix}-A9!`;
  let userId = '';
  let accountId = '';

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error;
    userId = created.data.user.id;

    const accessResult = await admin.rpc('prepare_api_smoke_test_access', {
      p_user_id: userId,
      p_permission_code: 'lowcode.pages.manage',
    });
    if (accessResult.error) throw accessResult.error;
    const access = isRecord(accessResult.data) ? accessResult.data : {};
    accountId = typeof access.account_id === 'string' ? access.account_id : '';
    assert.ok(accountId);

    const signedIn = await publicClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) throw signedIn.error;
    const userClient = createSupabaseClient('user', {
      authorization: `Bearer ${signedIn.data.session.access_token}`,
    });

    const listed = await userClient.rpc('read_lowcode_default_value_procedure', {
      p_action: 'list',
      p_procedure: null,
      p_context: {},
    });
    if (listed.error) throw listed.error;
    assert.ok(
      Array.isArray(listed.data) && listed.data.some(
        (option) => isRecord(option) && option.value === 'public.generate_document_number',
      ),
      'The document number generator must appear in the stored-procedure dropdown.',
    );

    const generated = await userClient.rpc('read_lowcode_default_value_procedure', {
      p_action: 'execute',
      p_procedure: 'public.generate_document_number',
      p_context: {
        accountId,
        blockId: 'sales-order-edit-form',
        field: 'doc_no',
        values: {
          doc_type_code: 'STD-SO',
          doc_date: '2026-08-12',
        },
      },
    });
    if (generated.error) throw generated.error;
    assert.match(String(generated.data), /^SO20260812\d{4}$/);

    console.log(JSON.stringify({
      listed: true,
      generated: generated.data,
      accountId,
    }));
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
