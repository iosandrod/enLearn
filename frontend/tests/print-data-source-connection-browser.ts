import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const requireApi = createRequire(resolve('api/package.json'));
const { Client } = requireApi('pg');
const { chromium } = requireApi('playwright-core');
const { getEnv } = requireApi('./src/common/utils/env.ts');
const { PrintDataSourceRuntime } = requireApi('./src/print-service/print-data-source.runtime.ts');
async function main() {
  const env = getEnv();
  const url = new URL(env.DIRECT_URL || env.DATABASE_URL!);
  for (const key of ['sslmode', 'pgbouncer', 'uselibpqcompat']) url.searchParams.delete(key);
  const db = new Client({ connectionString: url.toString(), ssl: false });
  await db.connect();
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const runtime = new PrintDataSourceRuntime();
    const config = { driver: 'pgsql', host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), username: decodeURIComponent(url.username), password: decodeURIComponent(url.password), query: 'SELECT 1', parameters: [] };
    const record = { id: 'test-id', code: 'test.database', name: '连接验证', type: 'typeorm', enabled: true, version: 1, schema: config };
    let saved: Record<string, unknown> | undefined;
    const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.exposeFunction('testService', async (service: string, method: string, payload: Record<string, any>) => {
      if (service === 'lowcode') {
        if (payload.resource === 'lowcode_materials') return (await db.query("select * from public.lowcode_materials where enabled=true and status='published' and material_kind='form'")).rows;
        if (payload.resource === 'lowcode_form_definitions') return (await db.query('select code,schema from public.lowcode_form_definitions where code=$1', [payload.filters.code])).rows;
        return [];
      }
      if (method === 'listManagedDataSources') return [record];
      if (method === 'testDataSourceConnection') return runtime.testConnection(payload, { accountId: 'test', userId: 'test' });
      if (method === 'saveDataSource') { saved = payload; return { ...record, ...payload }; }
      throw new Error(`Unexpected service method ${method}`);
    });
    await page.goto(`${process.env.FRONTEND_URL || 'http://localhost:3301'}/tests/print-data-source-connection-browser.html`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '编辑', exact: true }).click({ timeout: 60000 });
    const modal = page.locator('.vxe-modal--wrapper').filter({ has: page.locator('.lc-global-dialog__body') });
    try {
      await modal.locator('.lc-sub-form [data-lc-field="host"] input').waitFor({ timeout: 30000 });
    } catch (error) {
      console.error('PAGE', await page.locator('body').innerText());
      console.error('ERRORS', errors);
      throw error;
    }
    assert.equal(await modal.locator('[data-lc-field="port"] input').inputValue(), String(config.port));
    assert.equal(await modal.locator('[data-lc-field="password"] input').getAttribute('type'), 'password');
    await modal.getByRole('button', { name: '测试数据源连接', exact: true }).click();
    await modal.getByRole('status').filter({ hasText: '数据源连接成功' }).waitFor();
    await modal.locator('[data-lc-field="host"] input').fill('');
    await modal.getByRole('button', { name: '测试数据源连接', exact: true }).click();
    await modal.getByRole('status').filter({ hasText: '请填写主机' }).waitFor();
    await modal.locator('[data-lc-field="host"] input').fill(config.host);
    await modal.getByRole('button', { name: '保存', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
    assert.ok(saved);
    assert.equal((saved.schema as any).host, config.host);
    assert.equal((saved.schema as any).timeoutMs, 2000);
    await page.getByRole('button', { name: '新建数据源', exact: true }).click();
    await modal.locator('.lc-sub-form [data-lc-field="driver"] input').waitFor();
    for (const [label, port, encryption] of [['MySQL', '3306', false], ['MSSQL / SQL Server', '1433', true], ['PostgreSQL', '5432', false]] as const) {
      await modal.locator('[data-lc-field="driver"] input').click();
      await page.locator('.vxe-select-option').filter({ hasText: label }).click();
      await page.waitForTimeout(100);
      assert.equal(await modal.locator('[data-lc-field="port"] input').inputValue(), port);
      assert.equal(await modal.locator('[data-lc-field="encrypt"]').isVisible(), encryption);
      assert.equal(await modal.locator('[data-lc-field="ssl"]').isVisible(), !encryption);
    }
    await modal.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log('Browser verified database sub-form, password masking, real connection test, pending input validation, and object schema save.');
  } finally { await browser.close(); await db.end(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
