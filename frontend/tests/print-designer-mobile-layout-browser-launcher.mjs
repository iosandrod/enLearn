import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceDir = fileURLToPath(new URL('../..', import.meta.url));
const browserExecutable = process.env.PRINT_DESIGNER_BROWSER ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const playwrightPath = join(
  workspaceDir,
  'node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/index.js',
);
const baseUrl = (process.env.PRINT_DESIGNER_TEST_SERVER_URL || 'http://localhost:3301')
  .replace(/\/$/, '');
const artifactsDir = join(workspaceDir, 'artifacts');

await mkdir(artifactsDir, { recursive: true });
const playwrightModule = await import(pathToFileURL(playwrightPath).href);
const browser = await playwrightModule.default.chromium.launch({
  executablePath: browserExecutable,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 442, height: 828 } });
const page = await context.newPage();

const box = async (locator) => {
  const value = await locator.boundingBox();
  assert.ok(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, number]) => [key, Math.round(number)]),
  );
};

try {
  await page.goto(`${baseUrl}/print-designer`, { waitUntil: 'networkidle' });
  await page.locator('.designer-mobile-panel-toggle').waitFor({ state: 'visible' });

  const closedPanel = await box(page.locator('.designer-side-panel'));
  assert.ok(closedPanel.y >= 828, 'the closed tool panel must remain below the viewport');

  const headerButtons = page.locator('#print-designer-header-actions .vxe-button');
  assert.equal(await headerButtons.count(), 6);
  const headerButtonBoxes = [];
  for (let index = 0; index < await headerButtons.count(); index += 1) {
    const buttonBox = await box(headerButtons.nth(index));
    headerButtonBoxes.push(buttonBox);
    assert.ok(buttonBox.width >= 130 && buttonBox.width <= 140);
    assert.ok(buttonBox.height >= 30 && buttonBox.height <= 34);
  }
  assert.equal(new Set(headerButtonBoxes.map((item) => item.y)).size, 2);
  assert.equal(new Set(headerButtonBoxes.map((item) => item.x)).size, 3);

  await page.screenshot({
    path: join(artifactsDir, 'print-designer-mobile-canvas.png'),
  });

  await page.locator('.designer-mobile-panel-toggle').click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('.designer-side-panel');
    if (!(panel instanceof HTMLElement)) return false;
    return Math.abs(panel.getBoundingClientRect().bottom - innerHeight) < 1;
  });

  const panelBox = await box(page.locator('.designer-side-panel'));
  assert.deepEqual(panelBox, { x: 0, y: 368, width: 442, height: 460 });

  const firstTabBox = await box(page.locator('.designer-side-tab').first());
  assert.equal(firstTabBox.width, 46);
  assert.equal(firstTabBox.height, 36);
  assert.ok(firstTabBox.x <= 8 && firstTabBox.y >= panelBox.y + 15);

  const firstToolBox = await box(page.locator('.bottom-toolbar-button').first());
  assert.equal(firstToolBox.height, 44);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    0,
  );

  await page.screenshot({
    path: join(artifactsDir, 'print-designer-mobile-tools.png'),
  });

  await page.locator('.designer-mobile-panel-toggle').click();
  await page.locator('#print-designer-header-actions .vxe-button').nth(3).click();
  const previewModal = page.locator('.print-preview-modal .vxe-modal--box');
  await previewModal.waitFor({ state: 'visible' });
  const previewModalBox = await box(previewModal);
  assert.ok(previewModalBox.x <= 7);
  assert.ok(previewModalBox.y <= 7);
  assert.ok(previewModalBox.width >= 428);
  assert.ok(previewModalBox.height >= 814);

  const previewContentBox = await box(page.locator('.print-preview-modal .vxe-modal--content'));
  assert.ok(previewContentBox.width >= 410);

  await page.evaluate(() => {
    const body = document.querySelector('.print-preview-body');
    if (!(body instanceof HTMLElement)) throw new Error('print preview body not found');
    const svg = encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120">
        <rect width="800" height="1120" fill="white"/>
        <rect x="48" y="54" width="704" height="1012" fill="none" stroke="#d7dee9" stroke-width="3"/>
        <text x="80" y="125" font-family="Arial" font-size="36" fill="#172033">Mobile print preview</text>
        <line x1="80" y1="160" x2="720" y2="160" stroke="#94a3b8" stroke-width="2"/>
        <rect x="80" y="210" width="640" height="90" rx="8" fill="#eef2f7"/>
        <rect x="80" y="340" width="300" height="300" rx="8" fill="#dbeafe"/>
        <rect x="420" y="340" width="300" height="300" rx="8" fill="#dcfce7"/>
      </svg>
    `);
    body.innerHTML = `
      <div class="print-preview-pages">
        <figure class="print-preview-page">
          <div class="print-preview-page-frame" style="aspect-ratio: 800 / 1120">
            <img alt="Mobile print preview fixture" src="data:image/svg+xml,${svg}">
          </div>
          <figcaption>Page 1</figcaption>
        </figure>
      </div>
    `;
  });
  await page.locator('.print-preview-page-frame').waitFor({ state: 'visible', timeout: 15_000 });
  const previewPageBox = await box(page.locator('.print-preview-page-frame'));
  assert.ok(previewPageBox.width >= 390);
  assert.equal(await page.locator('.print-preview-page').count(), 1);

  await page.screenshot({
    path: join(artifactsDir, 'print-designer-mobile-preview.png'),
  });

  console.log(JSON.stringify({
    headerButtonBoxes,
    panelBox,
    firstTabBox,
    firstToolBox,
    previewModalBox,
    previewContentBox,
    previewPageBox,
  }));
} finally {
  await context.close();
  await browser.close();
}
