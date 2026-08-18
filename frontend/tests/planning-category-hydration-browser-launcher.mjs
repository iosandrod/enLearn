import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = resolve(import.meta.dirname, '../..');
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const browserExecutable = process.env.PLANNING_CATEGORY_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const categoryId = '11111111-1111-4111-8111-111111111111';
const requestOrder = [];
const relationRequests = [];
let pageRequestCount = 0;
let initialPageResponse;

const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

await page.route('**/api/service', async (route) => {
  const body = route.request().postDataJSON();

  if (
    body?.serviceName === 'lowcode' &&
    body?.serviceMethod === 'listItems' &&
    body?.postData?.filters?.route === '/dashboard/planning/category/edit'
  ) {
    pageRequestCount += 1;
    if (pageRequestCount > 1) {
      await route.fulfill(initialPageResponse);
      return;
    }
    requestOrder.push('page');
    initialPageResponse = {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        serviceName: 'lowcode',
        serviceMethod: 'listItems',
        data: [{
          id: 'category-edit-page',
          code: 'planning_category-edit',
          route: '/dashboard/planning/category/edit',
          title: '主数据类别编辑',
          page_type: 'edit',
          version: 1,
          schema: {
            schemaVersion: 1,
            code: 'planning_category-edit',
            route: '/dashboard/planning/category/edit',
            title: '主数据类别编辑',
            pageType: 'edit',
            dataSources: {
              planning_categoryRows: {
                key: 'planning_categoryRows',
                serviceName: 'planning',
                serviceMethod: 'listItems',
                postData: {
                  resource: 'planning_category',
                  filters: { id: '{{ route.query.id }}' },
                  limit: 1,
                },
                autoLoad: true,
              },
              planning_categoryOptions: {
                key: 'planning_categoryOptions',
                serviceName: 'planning',
                serviceMethod: 'listRelationOptions',
                postData: {
                  resource: 'planning_category',
                  excludeId: '{{ forms.planning_category_edit_form.id }}',
                  filters: {
                    status: 'active',
                    target_type: '{{ forms.planning_category_edit_form.target_type }}',
                  },
                  tree: true,
                },
                loadAfterSourceKeys: ['planning_categoryRows'],
                autoLoad: true,
              },
            },
            blocks: [{
              id: 'planning_category_edit_form',
              kind: 'form',
              sourceKey: 'planning_categoryRows',
              initialValues: {
                id: '',
                target_type: '',
                name: '',
                parent_id: '',
              },
              schema: {
                columns: 2,
                fields: [
                  { field: 'target_type', label: '类别对象', component: 'vxe-input' },
                  { field: 'name', label: '类别名称', component: 'vxe-input' },
                  {
                    field: 'parent_id',
                    label: '上级类别',
                    component: 'vxe-tree-select',
                    optionsSourceKey: 'planning_categoryOptions',
                    optionProps: { label: 'label', value: 'id', children: 'children' },
                  },
                ],
                actions: [],
              },
            }],
          },
        }],
      }),
    };
    await route.fulfill(initialPageResponse);
    return;
  }

  if (
    body?.serviceName === 'planning' &&
    body?.serviceMethod === 'listItems' &&
    body?.postData?.resource === 'planning_category'
  ) {
    requestOrder.push('record');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        serviceName: 'planning',
        serviceMethod: 'listItems',
        data: [{
          id: categoryId,
          target_type: 'item',
          name: '成品',
          parent_id: '',
        }],
      }),
    });
    return;
  }

  if (
    body?.serviceName === 'planning' &&
    body?.serviceMethod === 'listRelationOptions'
  ) {
    requestOrder.push('options');
    relationRequests.push(body.postData);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        serviceName: 'planning',
        serviceMethod: 'listRelationOptions',
        data: [],
      }),
    });
    return;
  }

  await route.continue();
});

try {
  await page.goto(`${baseUrl}/dashboard/planning/category/edit?id=${categoryId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  assert.notEqual(new URL(page.url()).pathname, '/signin', 'Page redirected to sign in.');
  const nameInput = page.locator('.vxe-form--item').filter({ hasText: '类别名称' })
    .locator('input').first();
  await nameInput.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => Array.from(
    document.querySelectorAll('.lc-form input'),
  ).some((input) => input.value === '成品'));
  assert.equal(await nameInput.inputValue(), '成品');
  await nameInput.fill('成品-编辑中');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  if (relationRequests.length !== 1) {
    throw new Error(JSON.stringify({
      requestOrder,
      relationRequests,
      pageErrors,
      consoleErrors,
      body: (await page.locator('body').innerText()).slice(0, 1000),
    }));
  }

  assert.deepEqual(requestOrder.slice(0, 3), ['page', 'record', 'options']);
  assert.equal(relationRequests.length, 1);
  assert.equal(relationRequests[0].filters?.target_type, 'item');
  assert.equal(relationRequests[0].excludeId, categoryId);
  assert.equal(
    await nameInput.inputValue(),
    '成品-编辑中',
    'A later dependency wave must not overwrite edits in a form hydrated by an earlier wave.',
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({
    ok: true,
    requestOrder,
    relationRequest: relationRequests[0],
  }));
} finally {
  await context.close();
  await browser.close();
}
