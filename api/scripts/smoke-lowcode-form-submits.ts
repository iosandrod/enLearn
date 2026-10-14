import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const connection = env.DIRECT_URL ?? env.DATABASE_URL;
  assert.ok(connection, 'DIRECT_URL or DATABASE_URL is required.');
  const url = new URL(normalizePostgresConnectionString(connection));
  for (const key of ['pgbouncer', 'sslmode', 'uselibpqcompat']) url.searchParams.delete(key);
  const client = new Client({
    connectionString: url.toString(),
    ssl: ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('begin');
    const { rows: users } = await client.query('select id from auth.users limit 1');
    assert.ok(users[0]?.id, 'A local test user is required.');
    const userId: string = users[0].id;
    const otherUserId = randomUUID();
    const defaultFormCode = `feedback-auth-regression-${randomUUID()}`;
    const privateFormCode = `feedback-private-regression-${randomUUID()}`;
    const disabledFormCode = `feedback-disabled-regression-${randomUUID()}`;
    await client.query(`
      insert into public.lowcode_form_definitions (code, name, schema, enabled)
      select $1, '默认需要登录的回归表单', schema, true
      from public.lowcode_form_definitions where code = 'print-designer.feedback'
    `, [defaultFormCode]);
    const { rows: defaults } = await client.query('select allow_anonymous_submit from public.lowcode_form_definitions where code = $1', [defaultFormCode]);
    assert.equal(defaults[0]?.allow_anonymous_submit, false, 'New forms must require login by default.');
    await client.query(`
      insert into public.lowcode_form_definitions (code, name, schema, enabled, access_level, allow_anonymous_submit)
      select $1, '私有回归表单', schema, true, 'pro', true
      from public.lowcode_form_definitions where code = 'print-designer.feedback'
    `, [privateFormCode]);
    await client.query(`
      insert into public.lowcode_form_definitions (code, name, schema, enabled, allow_anonymous_submit)
      select $1, '停用回归表单', schema, false, true
      from public.lowcode_form_definitions where code = 'print-designer.feedback'
    `, [disabledFormCode]);
    const data = { type: 'bug', title: '反馈提交回归验证', content: '中文、换行\n及 JSON 数据', nested: { checked: true } };
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);

    const { rows } = await client.query("select public.submit_lowcode_form('print-designer.feedback', $1::jsonb) as submission", [JSON.stringify(data)]);
    const submission = rows[0].submission;
    assert.equal(submission.user_id, userId);
    assert.deepEqual(submission.data, data);
    const { rows: saved } = await client.query('select * from public.lowcode_form_submits where id = $1', [submission.id]);
    assert.deepEqual(saved[0].data, data);
    const { rows: definitions } = await client.query("select id from public.lowcode_form_definitions where code = 'print-designer.feedback'");
    assert.equal(submission.form_id, definitions[0].id);
    const { rows: authenticatedDefault } = await client.query('select public.submit_lowcode_form($1, $2::jsonb) as submission', [defaultFormCode, JSON.stringify(data)]);
    assert.equal(authenticatedDefault[0].submission.user_id, userId);

    async function expectRejected(sql: string, params: unknown[], expected: RegExp) {
      await client.query('savepoint rejected_submission');
      try {
        await assert.rejects(client.query(sql, params), expected);
      } finally {
        await client.query('rollback to savepoint rejected_submission');
      }
    }
    await expectRejected("select public.submit_lowcode_form('print-designer.feedback', $1::jsonb)", [JSON.stringify({ ...data, title: '   ' })], /标题不能为空/);
    await expectRejected("select public.submit_lowcode_form('print-designer.feedback', '[]'::jsonb)", [], /JSON 对象/);
    await expectRejected("select public.submit_lowcode_form('missing-feedback-form', '{}'::jsonb)", [], /表单不存在/);
    await expectRejected('insert into public.lowcode_form_submits(form_id, user_id, data) values ($1, $2, $3)', [submission.form_id, otherUserId, data], /row-level security/);

    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: otherUserId, role: 'authenticated' })]);
    const { rowCount } = await client.query('select id from public.lowcode_form_submits where id = $1', [submission.id]);
    assert.equal(rowCount, 0, 'Other users must not see this submission.');
    await client.query('set local role anon');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'anon' })]);
    const { rows: anonymous } = await client.query("select public.submit_lowcode_form('print-designer.feedback', $1::jsonb) as submission", [JSON.stringify(data)]);
    const anonymousSubmission = anonymous[0].submission;
    assert.equal(anonymousSubmission.user_id, null);
    assert.equal(anonymousSubmission.form_id, submission.form_id);
    assert.deepEqual(anonymousSubmission.data, data);
    await expectRejected('select public.submit_lowcode_form($1, $2::jsonb)', [defaultFormCode, JSON.stringify(data)], /请先登录/);
    await expectRejected('select public.submit_lowcode_form($1, $2::jsonb)', [privateFormCode, JSON.stringify(data)], /无权访问/);
    await expectRejected('select public.submit_lowcode_form($1, $2::jsonb)', [disabledFormCode, JSON.stringify(data)], /已停用/);
    await expectRejected("select public.submit_lowcode_form('print-designer.feedback', $1::jsonb)", [JSON.stringify({ ...data, title: '   ' })], /标题不能为空/);
    await expectRejected('select * from public.lowcode_form_submits', [], /permission denied/);
    await expectRejected('insert into public.lowcode_form_submits(form_id, user_id, data) values ($1, $2, $3)', [submission.form_id, userId, data], /permission denied/);
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    const { rowCount: anonymousVisible } = await client.query('select id from public.lowcode_form_submits where id = $1', [anonymousSubmission.id]);
    assert.equal(anonymousVisible, 0, 'Authenticated users must not see anonymous submissions.');
    await client.query('reset role');
    const { rows: anonymousSaved } = await client.query('select * from public.lowcode_form_submits where id = $1', [anonymousSubmission.id]);
    assert.equal(anonymousSaved[0].user_id, null);
    assert.deepEqual(anonymousSaved[0].data, data);
    await client.query('rollback');
    console.log('PASS: anonymous feedback, login required by default, authenticated user association, JSON persistence, required fields, access levels, disabled forms and submission isolation (all test writes rolled back).');
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
