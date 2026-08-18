import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.TRIGGER_WORKFLOW_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const baseUrl = (process.env.TRIGGER_WORKFLOW_TEST_SERVER_URL || 'http://127.0.0.1:3000')
  .replace(/\/$/, '');

const playwrightModule = await import(pathToFileURL(playwrightPath).href);
let browser;
let context;
let page;
const pageErrors = [];
const consoleErrors = [];

try {
  browser = await playwrightModule.default.chromium.launch({
    executablePath: browserExecutable,
    headless: true,
  });
  context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(`${baseUrl}/tests/trigger-workflow-canvas-browser.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () => document.querySelector('#result')?.textContent !== 'pending',
    undefined,
    { timeout: 25_000 },
  );

  const toolbar = page.getByRole('toolbar', { name: '画布工具' });
  await toolbar.waitFor({ state: 'visible' });
  const fileActions = page.getByRole('group', { name: '流程文件操作' });
  await fileActions.waitFor({ state: 'visible' });
  for (const label of ['新建流程', '保存流程', '加载流程']) {
    await fileActions.getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible' });
  }
  await fileActions.getByRole('button', { name: '新建流程', exact: true }).click();
  await fileActions.getByRole('button', { name: '保存流程', exact: true }).click();
  await fileActions.getByRole('button', { name: '加载流程', exact: true }).click();
  assert.deepEqual(
    await page.evaluate(() => window.__triggerWorkflowCanvasSmoke.emittedActions()),
    ['new-workflow', 'save-workflow', 'load-workflow'],
  );
  const toolbarBox = await toolbar.boundingBox();
  const canvasBox = await page.locator('.trigger-editor__canvas').boundingBox();
  assert.ok(toolbarBox && canvasBox);
  assert.ok(toolbarBox.x >= canvasBox.x && toolbarBox.x + toolbarBox.width <= canvasBox.x + canvasBox.width);
  assert.ok(toolbarBox.y >= canvasBox.y && toolbarBox.y + toolbarBox.height <= canvasBox.y + canvasBox.height);
  const screenshotClip = {
    x: Math.max(0, canvasBox.x - 8),
    y: Math.max(0, canvasBox.y - 8),
    width: Math.min(1600 - Math.max(0, canvasBox.x - 8), canvasBox.width + 16),
    height: Math.min(960 - Math.max(0, canvasBox.y - 8), canvasBox.height + 16),
  };
  await page.screenshot({
    path: join(workspaceDir, 'artifacts/trigger-workflow-canvas-tools.png'),
    clip: screenshotClip,
  });

  for (const label of ['撤销', '重做', '缩小', '放大', '适应画布', '自动整理节点', '清空画布']) {
    await toolbar.getByRole('button', { name: label }).waitFor({ state: 'visible' });
  }

  const initial = await page.evaluate(() => window.__triggerWorkflowCanvasSmoke.snapshot());
  assert.ok(initial.nodes.length > 0);
  assert.ok(initial.edges.length > 0);
  assert.equal(await toolbar.getByRole('button', { name: '撤销' }).isDisabled(), true);

  const startPaletteItem = page.locator('.trigger-editor__palette-item[data-node-type="start"]');
  const endPaletteItem = page.locator('.trigger-editor__palette-item[data-node-type="end"]');
  await startPaletteItem.waitFor({ state: 'visible' });
  await endPaletteItem.waitFor({ state: 'visible' });
  assert.equal(await startPaletteItem.getAttribute('draggable'), 'true');
  assert.equal(await endPaletteItem.getAttribute('draggable'), 'true');

  const inspector = page.locator('.trigger-editor__inspector');
  await inspector.getByText('触发设置', { exact: true }).click();
  await inspector.getByText('数据库请求路径', { exact: true }).waitFor({ state: 'visible' });
  const webhookPathInput = inspector.locator('[data-lc-field="webhookPath"] input');
  await webhookPathInput.fill('/expenses/database-schema');
  await page.waitForFunction(() => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes
      .find((node) => node.id === 'webhook')
      ?.config?.webhook?.path === '/expenses/database-schema'
  ));

  await page.locator('.vue-flow__node').filter({ hasText: '校验报销数据' }).click();
  await inspector.getByText('任务配置', { exact: true }).waitFor({ state: 'visible' });
  await inspector.getByText('执行策略', { exact: true }).waitFor({ state: 'visible' });
  await inspector.getByText('高级配置', { exact: true }).waitFor({ state: 'visible' });
  await inspector.getByText('任务配置', { exact: true }).click();
  await inspector.getByText('任务类型', { exact: true }).waitFor({ state: 'visible' });
  await inspector.getByText('任务导入路径', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(
    await inspector.locator('[data-lc-field="frontendFunction"]').count(),
    0,
    'Registered tasks must not render the frontend function field.',
  );
  const importPathInput = inspector.locator('[data-lc-field="taskImportPath"] input');
  await importPathInput.fill('./tasks/expense-validate');
  await page.waitForFunction(() => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes
      .find((node) => node.id === 'validate_expense')
      ?.config?.task?.importPath === './tasks/expense-validate'
  ));

  const taskTypeSelect = inspector.locator('[data-lc-field="taskType"] .vxe-select');
  await taskTypeSelect.click();
  await page.getByText('发送前端指令', { exact: true }).last().click();
  await inspector.locator('[data-lc-field="frontendFunction"]').waitFor({ state: 'visible' });
  assert.equal(await inspector.locator('[data-lc-field="taskId"]').count(), 0);
  assert.equal(await inspector.locator('[data-lc-field="procedureName"]').count(), 0);
  await inspector.locator('[data-lc-field="frontendFunction"] .lc-monaco-editor__trigger').waitFor({ state: 'visible' });

  await taskTypeSelect.click();
  await page.getByText('执行存储过程', { exact: true }).last().click();
  await inspector.locator('[data-lc-field="procedureName"] input').waitFor({ state: 'visible' });
  await inspector.locator('[data-lc-field="procedureSchema"] input').waitFor({ state: 'visible' });
  assert.equal(await inspector.locator('[data-lc-field="frontendFunction"]').count(), 0);
  await inspector.locator('[data-lc-field="procedureName"] input').fill('publish_expense');
  await page.waitForFunction(() => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes
      .find((node) => node.id === 'validate_expense')
      ?.config?.task?.procedureName === 'publish_expense'
  ));

  await toolbar.getByRole('button', { name: '缩小' }).click();
  await toolbar.getByRole('button', { name: '放大' }).click();
  await toolbar.getByRole('button', { name: '适应画布' }).click();

  await startPaletteItem.dragTo(page.locator('.trigger-editor__canvas'), {
    targetPosition: { x: Math.round(canvasBox.width * 0.36), y: Math.round(canvasBox.height * 0.24) },
  });
  await page.waitForFunction(() => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes.filter((node) => node.type === 'start').length === 1
  ));
  await endPaletteItem.dragTo(page.locator('.trigger-editor__canvas'), {
    targetPosition: { x: Math.round(canvasBox.width * 0.64), y: Math.round(canvasBox.height * 0.72) },
  });
  await page.waitForFunction(() => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes.filter((node) => node.type === 'end').length === 2
  ));
  const beforeClear = await page.evaluate(() => window.__triggerWorkflowCanvasSmoke.snapshot());
  const requiredNodeCount = 2;

  await toolbar.getByRole('button', { name: '清空画布' }).click();
  await page.getByText(/确定清除画布中的/).waitFor({ state: 'visible' });
  assert.match(await page.locator('body').innerText(), /清空画布/);
  await page.getByRole('button', { name: '清空', exact: true }).last().click();
  await page.waitForFunction(() => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes.every(
      (node) => node.type === 'start' || node.type === 'end'
    ) &&
    window.__triggerWorkflowCanvasSmoke.snapshot().edges.length === 0
  ));
  const cleared = await page.evaluate(() => window.__triggerWorkflowCanvasSmoke.snapshot());
  assert.equal(cleared.nodes.filter((node) => node.type === 'start').length, 1);
  assert.equal(cleared.nodes.filter((node) => node.type === 'end').length, 1);
  assert.equal(cleared.nodes.length, requiredNodeCount);

  await toolbar.getByRole('button', { name: '撤销' }).click();
  await page.waitForFunction((nodeCount) => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes.length === nodeCount
  ), beforeClear.nodes.length);
  const restored = await page.evaluate(() => window.__triggerWorkflowCanvasSmoke.snapshot());
  assert.equal(restored.edges.length, beforeClear.edges.length);

  await toolbar.getByRole('button', { name: '重做' }).click();
  await page.waitForFunction((nodeCount) => (
    window.__triggerWorkflowCanvasSmoke.snapshot().nodes.length === nodeCount &&
    window.__triggerWorkflowCanvasSmoke.snapshot().edges.length === 0
  ), requiredNodeCount);
  assert.equal(await toolbar.getByRole('button', { name: '清空画布' }).isDisabled(), true);

  await page.evaluate(() => {
    const current = window.__triggerWorkflowCanvasSmoke.snapshot();
    window.__triggerWorkflowCanvasSmoke.replace({ ...current, nodes: [], edges: [] });
  });
  await page.waitForFunction(() => {
    const snapshot = window.__triggerWorkflowCanvasSmoke.snapshot();
    return snapshot.nodes.length === 2 &&
      snapshot.nodes.filter((node) => node.type === 'start').length === 1 &&
      snapshot.nodes.filter((node) => node.type === 'end').length === 1;
  });
  await page.locator('.vue-flow__node[data-id="start"]').waitFor({ state: 'visible' });
  await page.locator('.vue-flow__node[data-id="end"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.vue-flow__node').count(), 2);
  assert.equal(await page.locator('.vue-flow__node[data-id="start"]').evaluate(
    (element) => element.classList.contains('draggable')
  ), true);
  assert.equal(await page.locator('.vue-flow__node[data-id="end"]').evaluate(
    (element) => element.classList.contains('draggable')
  ), true);

  await page.evaluate(() => {
    const current = window.__triggerWorkflowCanvasSmoke.snapshot();
    window.__triggerWorkflowCanvasSmoke.replace({
      ...current,
      nodes: [{
        id: 'legacy_task',
        type: 'task',
        name: '旧草稿任务',
        position: { x: 380, y: 200 },
        config: { task: { id: 'legacy.task' } },
      }],
      edges: [],
    });
  });
  await page.waitForFunction(() => {
    const snapshot = window.__triggerWorkflowCanvasSmoke.snapshot();
    return snapshot.nodes.length === 3 &&
      snapshot.nodes.some((node) => node.type === 'start') &&
      snapshot.nodes.some((node) => node.type === 'end') &&
      snapshot.nodes.some((node) => node.id === 'legacy_task');
  });
  await page.locator('.vue-flow__node[data-id="legacy_task"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.vue-flow__node').count(), 3);

  await page.evaluate(() => {
    const current = window.__triggerWorkflowCanvasSmoke.snapshot();
    window.__triggerWorkflowCanvasSmoke.replace({
      ...current,
      nodes: [{
        id: 'legacy_schedule',
        type: 'schedule',
        name: '旧草稿定时触发',
        position: { x: 380, y: 40 },
        config: { schedule: { cron: '0 8 * * *', timezone: 'Asia/Shanghai' } },
      }],
      edges: [],
    });
  });
  await page.waitForFunction(() => {
    const snapshot = window.__triggerWorkflowCanvasSmoke.snapshot();
    return snapshot.nodes.length === 2 &&
      snapshot.nodes.filter((node) => node.type === 'schedule').length === 1 &&
      snapshot.nodes.filter((node) => node.type === 'start').length === 0 &&
      snapshot.nodes.filter((node) => node.type === 'end').length === 1;
  });
  await page.locator('.vue-flow__node[data-id="legacy_schedule"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.vue-flow__node[data-id="legacy_schedule"]').evaluate(
    (element) => element.classList.contains('draggable')
  ), true);
  assert.equal(await page.locator('.vue-flow__node[data-id="start"]').count(), 0);
  assert.equal(await page.locator('.vue-flow__node[data-id="end"]').count(), 1);
  assert.equal(await page.locator('.vue-flow__node').count(), 2);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  console.log('Trigger workflow canvas browser integration passed.');
} catch (error) {
  const debug = page
    ? await page.evaluate(() => ({
        snapshot: window.__triggerWorkflowCanvasSmoke?.snapshot?.(),
        text: document.body.innerText.slice(0, 5000),
      })).catch(() => null)
    : null;
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(debug)}\n${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`,
  );
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}
