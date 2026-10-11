import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

// Only use a disposable, empty local database. Fixture planning_item columns
// reproduce the FK contract verified on the target database.
const account = '00000000-0000-4000-8000-000000000001';
const otherAccount = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';

async function main() {
  const connectionString = process.env.WMS_TEST_DATABASE_URL;
  if (!connectionString) throw new Error('WMS_TEST_DATABASE_URL is required.');
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('WMS smoke must use an isolated local database.');
  }
  const client = new Client({ connectionString });
  await client.connect();
  const repoRoot = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  try {
    const existing = await client.query(`select tablename from pg_tables
      where schemaname not in ('pg_catalog', 'information_schema')`);
    assert.equal(existing.rowCount, 0, 'Use an empty disposable database; existing tables are never replaced.');
    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
        if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
        if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
      end $$;
      create schema auth;
      create schema basejump;
      grant usage on schema public, auth, basejump to authenticated, anon, service_role;
      create table auth.users(id uuid primary key);
      create table basejump.accounts(id uuid primary key);
      create table public.planning_item(
        id uuid primary key default gen_random_uuid(),
        account_id uuid not null references basejump.accounts(id),
        unique(account_id, id)
      );
      create table public.admin_permissions(
        code text primary key, name text, description text, resource_type text,
        resource_key text, action_code text, status text, sort_order integer
      );
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''app.test_user'', true), '''')::uuid';
      create function public.is_active_account_member(p_account uuid) returns boolean
        language sql stable as 'select auth.uid() is not null and p_account =
          nullif(current_setting(''app.test_account'', true), '''')::uuid';
      create function public.has_account_permission(p_account uuid, p_code text) returns boolean
        language sql stable as 'select public.is_active_account_member(p_account) and
          (p_code = ''wms.core.view'' or current_setting(''app.test_manage'', true) = ''true'')';
    `);
    await client.query('insert into auth.users values ($1)', [user]);
    await client.query('insert into basejump.accounts values ($1), ($2)', [account, otherAccount]);
    const item = (await client.query('insert into public.planning_item(account_id) values ($1) returning id', [account])).rows[0].id;
    const otherItem = (await client.query('insert into public.planning_item(account_id) values ($1) returning id', [otherAccount])).rows[0].id;
    await client.query(await readFile(resolve(repoRoot, 'docs/wms-core-schema.sql'), 'utf8'));

    const warehouse = (await client.query(`insert into wms_warehouse(account_id,code,name)
      values ($1,'MAIN','Main') returning id`, [account])).rows[0].id;
    await client.query(`insert into wms_warehouse(account_id,code,name) values ($1,'MAIN','Other')`, [otherAccount]);
    const source = (await client.query(`insert into wms_location(account_id,warehouse_id,code,name)
      values ($1,$2,'A','Source') returning id`, [account, warehouse])).rows[0].id;
    const target = (await client.query(`insert into wms_location(account_id,warehouse_id,code,name)
      values ($1,$2,'B','Target') returning id`, [account, warehouse])).rows[0].id;
    await client.query(`select set_config('app.test_user',$1,false),
      set_config('app.test_account',$2,false), set_config('app.test_manage','true',false)`, [user, account]);
    await client.query('set role authenticated');

    async function document(type: string, quantity: number, expected: number | null = null) {
      const id = (await client.query(`insert into wms_document(account_id,code,type,warehouse_id,target_warehouse_id)
        values ($1,gen_random_uuid()::text,$2,$3,case when $2='transfer' then $3::uuid else null end)
        returning id`, [account, type, warehouse])).rows[0].id;
      await client.query(`insert into wms_document_line(account_id,document_id,line_no,item_id,location_id,
        target_location_id,quantity,expected_quantity) values ($1,$2,1,$3,$4,$5,$6,$7)`,
        [account, id, item, source, type === 'transfer' ? target : null, quantity, expected]);
      return id as string;
    }
    async function post(id: string) {
      return client.query('select public.wms_post_document($1,$2)', [account, id]);
    }
    async function quantity(location: string) {
      const result = await client.query(`select quantity from wms_inventory_balance
        where account_id=$1 and item_id=$2 and location_id=$3 and batch=''`, [account, item, location]);
      return Number(result.rows[0]?.quantity ?? 0);
    }
    async function ledgerCount() {
      return Number((await client.query('select count(*) from wms_inventory_ledger')).rows[0].count);
    }

    const receipt = await document('receipt', 10);
    await post(receipt);
    await post(receipt);
    assert.equal(await quantity(source), 10);
    assert.equal(await ledgerCount(), 1, 'Retries must not post twice.');
    await assert.rejects(client.query('update wms_inventory_balance set quantity=99'), /permission denied/);
    await assert.rejects(client.query('insert into wms_inventory_ledger default values'), /permission denied/);
    assert.equal((await client.query('select * from wms_warehouse')).rowCount, 1, 'RLS hides other accounts.');
    assert.equal((await client.query(`update wms_document_line set quantity=99 where document_id=$1 returning id`, [receipt])).rowCount, 0);
    await assert.rejects(client.query(`insert into wms_document_line(account_id,document_id,line_no,item_id,location_id,quantity)
      values ($1,$2,2,$3,$4,1)`, [account, receipt, item, source]), /draft|row-level security/);

    const transfer = await document('transfer', 4);
    await post(transfer);
    assert.equal(await quantity(source), 6);
    assert.equal(await quantity(target), 4);
    assert.equal(await ledgerCount(), 3, 'Transfers create two ledger records.');

    const issue = await document('issue', 8);
    await assert.rejects(post(issue), /Insufficient WMS stock/);
    assert.equal(await quantity(source), 6);
    assert.equal(await ledgerCount(), 3);
    assert.equal((await client.query('select status from wms_document where id=$1', [issue])).rows[0].status, 'draft');
    await client.query('update wms_document_line set quantity=1 where document_id=$1', [issue]);
    await post(issue);
    assert.equal(await quantity(source), 5);

    const staleCount = await document('count', 3, 6);
    await assert.rejects(post(staleCount), /count is stale/);
    assert.equal(await quantity(source), 5);
    await client.query('update wms_document_line set expected_quantity=5 where document_id=$1', [staleCount]);
    await post(staleCount);
    assert.equal(await quantity(source), 3);
    const equalCount = await document('count', 3, 3);
    const beforeEqualCount = await ledgerCount();
    await post(equalCount);
    assert.equal(await ledgerCount(), beforeEqualCount, 'Unchanged counts do not create zero movement records.');

    const adjustment = await document('adjustment', 1);
    await post(adjustment);
    assert.equal(await quantity(source), 4);
    const cancelled = await document('issue', 1);
    await client.query(`update wms_document set status='cancelled' where id=$1`, [cancelled]);
    await assert.rejects(post(cancelled), /not draft/);
    const wrongItemDocument = await document('receipt', 1);
    await assert.rejects(client.query(`update wms_document_line set item_id=$1 where document_id=$2`,
      [otherItem, wrongItemDocument]), /foreign key/);
    await assert.rejects(client.query(`update wms_document set status='posted',posted_at=now() where id=$1`,
      [wrongItemDocument]), /row-level security/);

    // A valid first movement followed by a failing second movement must roll
    // back both the balance and ledger changes from the entire statement.
    const partialFailure = await document('issue', 1);
    await client.query(`insert into wms_document_line(account_id,document_id,line_no,item_id,location_id,quantity)
      values ($1,$2,2,$3,$4,100)`, [account, partialFailure, item, target]);
    const beforeFailure = await ledgerCount();
    await assert.rejects(post(partialFailure), /Insufficient WMS stock/);
    assert.equal(await quantity(source), 4);
    assert.equal(await quantity(target), 4);
    assert.equal(await ledgerCount(), beforeFailure);

    await client.query(`select set_config('app.test_manage','false',false)`);
    await assert.rejects(post(wrongItemDocument), /permission required/);
    await client.query(`select set_config('app.test_manage','true',false)`);

    const parallelA = await document('issue', 3);
    const parallelB = await document('issue', 3);
    async function parallelPost(id: string) {
      const worker = new Client({ connectionString });
      await worker.connect();
      try {
        await worker.query(`select set_config('app.test_user',$1,false),
          set_config('app.test_account',$2,false),set_config('app.test_manage','true',false)`, [user, account]);
        await worker.query('set role authenticated');
        return await worker.query('select public.wms_post_document($1,$2)', [account, id]);
      } finally { await worker.end(); }
    }
    const concurrent = await Promise.allSettled([parallelPost(parallelA), parallelPost(parallelB)]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent issues must not oversell.');
    const rejected = concurrent.find(result => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && /Insufficient WMS stock/.test(String(rejected.reason)));
    assert.equal(await quantity(source), 1);

    await client.query('reset role');
    await assert.rejects(client.query(`update wms_document_line set quantity=99 where document_id=$1`, [receipt]), /draft/);
    await assert.rejects(client.query('update wms_inventory_ledger set quantity_change=2'), /immutable/);
    await assert.rejects(client.query('delete from wms_inventory_ledger'), /immutable/);
    await assert.rejects(client.query('update wms_inventory_balance set batch=\'changed\''), /dimensions cannot change/);
    await assert.rejects(client.query(`insert into wms_inventory_balance(account_id,item_id,location_id,quantity)
      values ($1,$2,$3,1)`, [account, item, source]), /unique constraint/);
    const mismatches = await client.query(`select b.id from wms_inventory_balance b
      left join wms_inventory_ledger l on l.account_id=b.account_id and l.balance_id=b.id
      group by b.id having b.quantity <> coalesce(sum(l.quantity_change),0)`);
    assert.equal(mismatches.rowCount, 0, 'Balances must equal the sum of immutable ledger movements.');
    console.log('WMS core smoke passed: item reuse, RLS, receipt/issue/transfer/count/adjustment, retries, rollback, concurrency and immutable ledger.');
  } finally { await client.end(); }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
