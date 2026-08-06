import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const previewUrl = process.env.ENLEARN_MOBILE_TABLE_PREVIEW_URL
  ?? 'http://127.0.0.1:3102/?path=/demo/table';
const chromePath = process.env.CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

async function dragTouch(context, page, start, end) {
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [start],
  });
  for (let step = 1; step <= 10; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: start.x + (end.x - start.x) * step / 10,
        y: start.y + (end.y - start.y) * step / 10,
      }],
    });
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(250);
}

try {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const separator = previewUrl.includes('?') ? '&' : '?';
  await page.goto(`${previewUrl}${separator}e2e=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const scrollbars = await page.evaluate(() => [...document.querySelectorAll('div')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const background = getComputedStyle(element).backgroundColor;
      return element.children.length === 1
        && background.startsWith('rgba(225, 230, 233')
        && (rect.width === 18 || rect.height === 18);
    })
    .map((element) => ({
      box: element.getBoundingClientRect().toJSON(),
      thumbId: element.children[0].id,
      thumbBox: element.children[0].getBoundingClientRect().toJSON(),
    })));
  const horizontal = scrollbars.find(({ box }) => box.height === 18);
  const vertical = scrollbars.find(({ box }) => box.width === 18);
  assert.ok(horizontal, 'the horizontal scrollbar should always be visible');
  assert.ok(vertical, 'the vertical scrollbar should always be visible');

  await page.touchscreen.tap(
    horizontal.box.x + horizontal.box.width * 0.75,
    horizontal.box.y + horizontal.box.height / 2,
  );
  await page.waitForTimeout(250);
  const horizontalTrackResult = await page.locator(`[id="${horizontal.thumbId}"]`).boundingBox();
  assert.ok(
    horizontalTrackResult.x > horizontal.thumbBox.x + 100,
    'pressing the horizontal track should reposition the thumb',
  );

  await page.touchscreen.tap(
    vertical.box.x + vertical.box.width / 2,
    vertical.box.y + vertical.box.height * 0.75,
  );
  await page.waitForTimeout(250);
  const verticalTrackResult = await page.locator(`[id="${vertical.thumbId}"]`).boundingBox();
  assert.ok(
    verticalTrackResult.y > vertical.thumbBox.y + 20,
    'pressing the vertical track should reposition the thumb',
  );

  await page.touchscreen.tap(horizontal.box.x + 1, horizontal.box.y + 1);
  await page.touchscreen.tap(vertical.box.x + 1, vertical.box.y + 1);
  await page.waitForTimeout(250);
  const horizontalThumb = await page.locator(`[id="${horizontal.thumbId}"]`).boundingBox();
  const verticalThumb = await page.locator(`[id="${vertical.thumbId}"]`).boundingBox();

  await dragTouch(context, page, {
    x: horizontalThumb.x + horizontalThumb.width / 2,
    y: horizontalThumb.y + horizontalThumb.height / 2,
  }, {
    x: horizontalThumb.x + horizontalThumb.width / 2 + 120,
    y: horizontalThumb.y + horizontalThumb.height / 2,
  });
  const horizontalDragResult = await page.locator(`[id="${horizontal.thumbId}"]`).boundingBox();
  assert.ok(
    horizontalDragResult.x > horizontalThumb.x + 60,
    'the horizontal thumb should be draggable',
  );

  await dragTouch(context, page, {
    x: verticalThumb.x + verticalThumb.width / 2,
    y: verticalThumb.y + verticalThumb.height / 2,
  }, {
    x: verticalThumb.x + verticalThumb.width / 2,
    y: verticalThumb.y + verticalThumb.height / 2 + 90,
  });
  const verticalDragResult = await page.locator(`[id="${vertical.thumbId}"]`).boundingBox();
  assert.ok(verticalDragResult.y > verticalThumb.y + 20, 'the vertical thumb should be draggable');

  assert.equal(pageErrors.length, 0, 'scrollbar interactions should not raise page errors');
  console.log('virtual-table scrollbar interaction checks passed');
} finally {
  await browser.close();
}
