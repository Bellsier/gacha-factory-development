'use strict';
const { test, expect } = require('./fixtures.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');

test('독립 시나리오: 느린 초기화 로딩 후 완성 화면', async ({ page, qa }) => {
  await page.route('**/js/save-engine.js', async route => {
    const source = await fs.readFile(path.join(__dirname, '../../js/save-engine.js'), 'utf8');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: source + '\nconst qaOpen=SaveEngine.open;SaveEngine.open=async function(...args){await new Promise(resolve=>window.__qaReleaseStorage=resolve);return qaOpen.apply(this,args);};' });
  });
  try {
    await qa.step('01-loading', '저장소 초기화 보류 중 불투명 로딩 화면', async () => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.__qaReleaseStorage === 'function');
      await expect(page.locator('#gameBootstrap')).toBeVisible();
      await expect(page.locator('.wrap')).toHaveCSS('visibility', 'hidden');
    }, '환경 준비: 저장소 초기화 지연');
    await page.evaluate(() => window.__qaReleaseStorage());
    await qa.step('02-ready', '로딩 해제 후 완성된 플레이 화면', async () => {
      await page.waitForFunction(() => GameBootstrap.state === 'ready');
      await expect(page.locator('#gameBootstrap')).toBeHidden();
      await expect(page.locator('#tdCanvas')).toBeVisible();
      await qa.audit('첫 플레이 화면');
    });
  } finally { if (!page.isClosed()) await page.evaluate(() => window.__qaReleaseStorage?.()).catch(() => {}); }
});

test('독립 시나리오: 저장소 오류와 실제 재시도 버튼', async ({ page, context, qa }) => {
  qa.report.preparation = '새 프로필의 첫 문서에서만 IndexedDB 접근 불가 주입. 기존 저장 데이터 없음.';
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('qa-once')) {
      sessionStorage.setItem('qa-once', '1');
      Object.defineProperty(window, 'indexedDB', { value: undefined });
    }
  });
  await qa.step('01-error', '저장소 실패 시 무한 로딩 대신 오류·재시도', async () => {
    await page.goto('/');
    await page.waitForFunction(() => GameBootstrap.state === 'error');
    await expect(page.locator('#gameBootRetry')).toBeVisible();
    expect(await page.evaluate(() => S2Runtime.canPlay())).toBe(false);
    await qa.audit('초기화 오류 화면');
  }, '환경 준비: IndexedDB 오류');
  await qa.step('02-retry', '재시도 버튼으로 정상 시작', async () => {
    await qa.press('#gameBootRetry');
    await page.waitForFunction(() => GameBootstrap.state === 'ready' && S2Runtime.canPlay());
    await expect(page.locator('#gameBootRetry')).toBeHidden();
  });
});
