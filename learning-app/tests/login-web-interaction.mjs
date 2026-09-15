import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const previewUrl = process.env.ENLEARN_MOBILE_PREVIEW_URL
  ?? 'http://127.0.0.1:3102/?path=/login';
const chromePath = process.env.CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

try {
  async function prepareLogin(page, password) {
    const separator = previewUrl.includes('?') ? '&' : '?';
    await page.goto(`${previewUrl}${separator}e2e=${Date.now()}`, { waitUntil: 'networkidle' });
    await page.locator('input[type="text"]').fill('admin');
    await page.locator('input[type="password"]').fill(password);
    await page.waitForResponse((response) => (
      response.url().includes('/api/auth/account-options')
      && response.status() === 200
    ));
    await page.waitForTimeout(300);

    const loginButtonId = await page.evaluate(() => (
      [...document.querySelectorAll('span')]
        .find((node) => node.textContent?.trim() === '\u767b\u5f55')
        ?.parentElement?.id
    ));
    assert.ok(loginButtonId, 'the login action should be rendered');
    return loginButtonId;
  }

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const signInRequests = [];
  const pageErrors = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/auth/signin')) signInRequests.push(request);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const loginButtonId = await prepareLogin(page, 'definitely-wrong');
  await page.locator(`[id="${loginButtonId}"]`).click();
  const signInResponse = await page.waitForResponse(
    (response) => response.url().includes('/api/auth/signin'),
    { timeout: 5000 },
  );
  await page.waitForTimeout(300);

  assert.equal(signInResponse.status(), 401, 'the invalid password should reach the API');
  assert.equal(signInRequests.length, 1, 'one mouse click should submit exactly once');
  assert.equal(pageErrors.length, 0, 'the login interaction should not raise page errors');
  assert.equal(
    await page.locator('span').evaluateAll((nodes) => nodes.some(
      (node) => node.textContent?.includes('Invalid login credentials'),
    )),
    true,
    'the API error should be displayed after the click',
  );

  const touchContext = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    hasTouch: true,
  });
  try {
    const touchPage = await touchContext.newPage();
    const touchSignInRequests = [];
    touchPage.on('request', (request) => {
      if (request.url().includes('/api/auth/signin')) touchSignInRequests.push(request);
    });

    const touchLoginButtonId = await prepareLogin(touchPage, 'definitely-wrong-touch');
    const touchResponsePromise = touchPage.waitForResponse(
      (response) => response.url().includes('/api/auth/signin'),
      { timeout: 5000 },
    );
    await touchPage.locator(`[id="${touchLoginButtonId}"]`).tap();
    await touchResponsePromise;
    await touchPage.waitForTimeout(700);
    assert.equal(
      touchSignInRequests.length,
      1,
      'one touch tap should submit exactly once',
    );
  } finally {
    await touchContext.close();
  }

  console.log('login Web interaction checks passed');
} finally {
  await browser.close();
}
