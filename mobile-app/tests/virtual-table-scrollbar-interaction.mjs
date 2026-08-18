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

async function dragTouchThrough(context, page, points) {
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [points[0]],
  });
  for (const point of points.slice(1)) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point],
    });
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(350);
}

async function visibleTableRows(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll('div')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.position === 'absolute'
          && rect.height >= 40
          && rect.height <= 60
          && element.querySelectorAll('span').length > 0;
      });
    return candidates.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 400 && rect.top < 766;
    }).length;
  });
}

async function assertVisibleCenterColumnsAligned(page) {
  const alignment = await page.evaluate(() => {
    const headerCandidate = [...document.querySelectorAll('div')]
      .find((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.position === 'absolute'
          && rect.height >= 43
          && rect.height <= 45
          && element.children.length === 3
          && element.innerText.includes('操作');
      });

    const centerCanvas = headerCandidate?.children?.[1]?.firstElementChild;
    const bodyCenterCanvas = [...document.querySelectorAll('div')]
      .find((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.position === 'absolute'
          && rect.width > 500
          && rect.height > 300
          && element.children.length >= 5
          && [...element.children].every((child) => {
            const childRect = child.getBoundingClientRect();
            return childRect.height >= 47 && childRect.height <= 49;
          });
      });
    const rowCandidates = bodyCenterCanvas
      ? [...bodyCenterCanvas.children].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > 410 && rect.top < 760;
        })
      : [];
    const positions = (container) => container
      ? [...container.children].map((cell) => ({
          key: cell.innerText.split('\n')[0],
          left: Math.round(cell.getBoundingClientRect().left * 10) / 10,
        }))
      : [];
    const headerPositions = positions(centerCanvas);
    const expectedLeftByIndex = headerPositions.map(({ left }) => left);
    return {
      rowCount: rowCandidates.length,
      headerCount: headerPositions.length,
      aligned: rowCandidates.every((row) => {
        const rowPositions = positions(row);
        return rowPositions.length === expectedLeftByIndex.length
          && rowPositions.every(({ left }, index) => (
            Math.abs(left - expectedLeftByIndex[index]) <= 1
          ));
      }),
    };
  });
  assert.ok(alignment.headerCount > 0, 'the virtual header should contain visible center columns');
  assert.ok(alignment.rowCount >= 5, 'the viewport should contain enough rows to verify alignment');
  assert.ok(alignment.aligned, 'all visible rows must share the header column coordinates');
}

async function assertVirtualTableStructureBounded(page) {
  const structure = await page.evaluate(() => {
    const bodyCenterCanvas = [...document.querySelectorAll('div')]
      .find((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.position === 'absolute'
          && rect.width > 500
          && rect.height > 300
          && element.children.length >= 5
          && [...element.children].every((child) => {
            const childRect = child.getBoundingClientRect();
            return childRect.height >= 47 && childRect.height <= 49;
          });
      });
    const rowCandidates = bodyCenterCanvas ? [...bodyCenterCanvas.children] : [];
    const centerCellCounts = rowCandidates.map((row) => row.children.length);
    return {
      rowCount: rowCandidates.length,
      minimumCenterCells: Math.min(...centerCellCounts),
      maximumCenterCells: Math.max(...centerCellCounts),
    };
  });
  assert.ok(structure.rowCount <= 30, 'row virtualization must keep the mounted row count bounded');
  assert.ok(structure.rowCount >= 5, 'row virtualization must keep the viewport populated');
  assert.ok(structure.minimumCenterCells > 0, 'every mounted row must contain center cells');
  assert.equal(
    structure.minimumCenterCells,
    structure.maximumCenterCells,
    'all mounted rows must use the same stable column window',
  );
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

  const firstVisibleCellText = await page.locator('span').filter({ hasText: '业务申请' }).first()
    .boundingBox();
  assert.ok(firstVisibleCellText, 'the first table row should be visible before vertical swiping');

  const tableSwipeX = horizontal.box.x + horizontal.box.width / 2;
  const tableSwipeY = vertical.box.y + Math.min(90, vertical.box.height * 0.25);
  await dragTouch(context, page, {
    x: horizontal.box.x + horizontal.box.width * 0.72,
    y: tableSwipeY,
  }, {
    x: horizontal.box.x + horizontal.box.width * 0.28,
    y: tableSwipeY,
  });
  const horizontalSwipeResult = await page.locator(`[id="${horizontal.thumbId}"]`).boundingBox();
  assert.ok(
    horizontalSwipeResult.x > horizontal.thumbBox.x + 10,
    'swiping the table body horizontally should move the virtual column window',
  );
  await dragTouch(context, page, {
    x: tableSwipeX,
    y: vertical.box.y + vertical.box.height * 0.72,
  }, {
    x: tableSwipeX,
    y: vertical.box.y + vertical.box.height * 0.28,
  });
  const verticalSwipeResult = await page.locator(`[id="${vertical.thumbId}"]`).boundingBox();
  assert.ok(
    verticalSwipeResult.y > vertical.thumbBox.y + 0.2,
    'a vertical flick should move the virtual row window',
  );
  await page.touchscreen.tap(vertical.box.x + 1, vertical.box.y + 1);
  await page.waitForTimeout(250);

  const diagonalStart = {
    x: horizontal.box.x + horizontal.box.width * 0.72,
    y: vertical.box.y + vertical.box.height * 0.72,
  };
  await dragTouchThrough(context, page, Array.from({ length: 11 }, (_, step) => ({
    x: diagonalStart.x - 180 * step / 10,
    y: diagonalStart.y - 180 * step / 10,
  })));
  const diagonalHorizontalResult = await page.locator(`[id="${horizontal.thumbId}"]`).boundingBox();
  const diagonalVerticalResult = await page.locator(`[id="${vertical.thumbId}"]`).boundingBox();
  assert.ok(
    diagonalHorizontalResult.x > horizontal.thumbBox.x + 10,
    'a diagonal table gesture should advance horizontal scrolling',
  );
  assert.ok(
    diagonalVerticalResult.y > vertical.thumbBox.y + 0.2,
    'the same diagonal table gesture should advance vertical scrolling',
  );
  await assertVisibleCenterColumnsAligned(page);
  await assertVirtualTableStructureBounded(page);

  for (let pass = 0; pass < 4; pass += 1) {
    const direction = pass % 2 === 0 ? -1 : 1;
    const start = {
      x: tableSwipeX - direction * 60,
      y: vertical.box.y + vertical.box.height * (direction < 0 ? 0.72 : 0.28),
    };
    await dragTouchThrough(context, page, Array.from({ length: 25 }, (_, step) => ({
      x: start.x + direction * 150 * step / 24,
      y: start.y + direction * 190 * step / 24,
    })));
    await assertVisibleCenterColumnsAligned(page);
    await assertVirtualTableStructureBounded(page);
  }

  await page.touchscreen.tap(
    vertical.box.x + vertical.box.width / 2,
    vertical.box.y + vertical.box.height * 0.85,
  );
  await page.waitForTimeout(250);
  await dragTouch(context, page, {
    x: tableSwipeX,
    y: vertical.box.y + vertical.box.height * 0.30,
  }, {
    x: tableSwipeX,
    y: vertical.box.y + vertical.box.height * 0.72,
  });
  assert.ok(
    await visibleTableRows(page) >= 5,
    'scrolling upward from a deep virtual offset must keep the viewport filled with rows',
  );

  await page.touchscreen.tap(horizontal.box.x + 1, horizontal.box.y + 1);
  await page.touchscreen.tap(vertical.box.x + 1, vertical.box.y + 1);
  await page.waitForTimeout(250);

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
    vertical.box.y + vertical.box.height * 0.55,
  );
  await page.waitForTimeout(250);
  const verticalTrackResult = await page.locator(`[id="${vertical.thumbId}"]`).boundingBox();
  assert.ok(
    verticalTrackResult.y > vertical.box.y + 10,
    'pressing the vertical track should reposition the thumb',
  );

  await page.touchscreen.tap(horizontal.box.x + 1, horizontal.box.y + 1);
  await page.waitForTimeout(250);
  const horizontalThumb = await page.locator(`[id="${horizontal.thumbId}"]`).boundingBox();
  const verticalThumb = verticalTrackResult;

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
    y: verticalThumb.y + verticalThumb.height / 2 + 60,
  });
  const verticalDragResult = await page.locator(`[id="${vertical.thumbId}"]`).boundingBox();
  assert.ok(verticalDragResult.y > verticalThumb.y + 1, 'the vertical thumb should be draggable');

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${previewUrl}${separator}fixed=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const narrowScrollbars = await page.evaluate(() => [...document.querySelectorAll('div')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const background = getComputedStyle(element).backgroundColor;
      return element.children.length === 1
        && background.startsWith('rgba(225, 230, 233')
        && (rect.width === 18 || rect.height === 18);
    })
    .map((element) => ({
      box: element.getBoundingClientRect().toJSON(),
    })));
  const narrowHorizontal = narrowScrollbars.find(({ box }) => box.height === 18);
  assert.ok(narrowHorizontal, 'the narrow table should expose a horizontal scrollbar');
  await page.touchscreen.tap(
    narrowHorizontal.box.x + narrowHorizontal.box.width * 0.7,
    narrowHorizontal.box.y + narrowHorizontal.box.height / 2,
  );
  await page.waitForTimeout(250);
  const narrowLayers = await page.evaluate(() => [...document.querySelectorAll('div')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.position === 'absolute'
        && rect.height > 300
        && rect.width > 0
        && element.children.length >= 5
        && [...element.children].every((child) => {
          const childRect = child.getBoundingClientRect();
          return childRect.height >= 47 && childRect.height <= 49;
        });
    })
    .map((pane) => {
      const rect = pane.getBoundingClientRect();
      return {
        background: getComputedStyle(pane).backgroundColor,
        overflow: getComputedStyle(pane).overflow,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    }));
  const fixedLayer = narrowLayers.find(({ background, width }) => (
    width >= 90 && width <= 110 && background.startsWith('rgba(255, 255, 255')
  ));
  const centerCanvas = narrowLayers.find(({ background, width }) => (
    width > 500 && !background.startsWith('rgba(255, 255, 255')
  ));
  assert.ok(fixedLayer, 'the narrow viewport should contain the left fixed plane');
  assert.ok(centerCanvas, 'the narrow viewport should contain the center canvas');
  assert.ok(
    fixedLayer.background.startsWith('rgba(255, 255, 255'),
    'the left fixed plane must remain opaque after horizontal scrolling',
  );
  assert.ok(
    fixedLayer.overflow === 'hidden' && centerCanvas.overflow === 'hidden',
    'fixed and center planes must both preserve clipping boundaries',
  );
  assert.ok(centerCanvas.width > fixedLayer.width, 'the center canvas must retain horizontal range');

  assert.equal(pageErrors.length, 0, 'scrollbar interactions should not raise page errors');
  console.log('virtual-table scrollbar interaction checks passed');
} finally {
  await browser.close();
}
