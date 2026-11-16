'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test, expect } = require('./fixtures.cjs');
const { prepareHudVillage } = require('./checkpoint.cjs');
const { hudGeometry } = require('./hud-geometry.cjs');
const base = '224b3dad86614438ec28ad065bd71d3bbc4b0726';
const root = path.resolve(__dirname, '../..');

async function scrollWithInput(page, selector, mobile) {
  const panel = page.locator(selector), box = await panel.boundingBox();
  if (!mobile) { await page.mouse.move(box.x + 6, box.y + box.height / 2); await page.mouse.wheel(0, 180); }
  else {
    const session = await page.context().newCDPSession(page);
    const x = box.x + 6, y = box.y + box.height * 0.75;
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 50, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 130, id: 1 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await session.detach(); }
  }
  await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(20);
}

test('pre-S4: 저장 HUD 가림 회귀·전후 비교·기존 저장 호환', async ({ page, qa }, testInfo) => {
  test.setTimeout(240_000);
  qa.report.preparation = 'HUD 표시 전용 후반 마을 fixture. 실제 플레이 완주가 아님. 기준 코드와 수정 코드를 같은 격리 프로필/저장으로 비교하며 스크롤 위치는 DOM으로 샘플링한다.';
  const previous = file => execFileSync('git', ['show', base + ':' + file], { cwd: root, encoding: 'utf8' });
  await page.route('**/css/style.css', route => route.fulfill({ contentType: 'text/css', body: previous('css/style.css') }));
  await page.route('**/js/save-runtime.js', route => route.fulfill({ contentType: 'text/javascript', body: previous('js/save-runtime.js') }));
  const name = 'HUD 검증용 긴 마을 이름을 안전하게 표시합니다 0123456789'.slice(0, 40);
  let villageId, manual;
  await qa.step('hud-preparation', '기준 UI에서 긴 이름과 표시용 마을 준비·자동/수동 저장', async () => {
    await qa.boot();
    await qa.press('#s2Open'); await page.locator('[data-s2-name]').fill(name); await qa.press('[data-s2-new]');
    await page.waitForFunction(n => S2Runtime.session?.name === n && S2Runtime.canPlay(), name);
    villageId = await page.evaluate(() => S2Runtime.session.id);
    await prepareHudVillage(page);
    await qa.tab('workers');
    for (let i = 0; i < 4; i++) await qa.press('#gachaGoldBtn');
    await qa.tab('research'); await qa.press('[data-research="deliveryContract"]');
    await expect.poll(() => page.evaluate(async id => (await S2Runtime.engine.read(id)).snapshot.payload.run.characters.length, villageId), { timeout: 15_000 }).toBe(4);
    await qa.press('#s2Open');
    const section = page.locator('[data-s2-manual-section]');
    if (!(await section.evaluate(el => el.open))) await qa.activate(section.locator('summary'));
    await qa.activate(page.locator('[data-s2-manuals] .s2-row').first().getByRole('button', { name: '여기에 저장', exact: true }));
    await expect(page.locator('[data-s2-manuals] .s2-row').first()).toContainText(name);
    manual = await page.evaluate(async () => (await S2Runtime.engine.list()).manual.find(m => m.id === 1));
    await qa.press('[data-s2-close]');
  }, '표시 fixture 준비 + 기준 코드의 실제 저장');

  const capture = async mode => {
    const faults = [];
    for (const tab of ['workers', 'research', 'delivery', 'village']) {
      await qa.tab(tab);
      const selector = '#tab-' + tab;
      for (const [where, fraction] of [['top', 0], ['middle', 0.5], ['bottom', 1]]) {
        await qa.step(`${mode}-${tab}-${where}`, `${mode}: ${tab} ${where} 텍스트·조작 가림`, async () => {
          await page.locator(selector).evaluate((el, f) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * f; }, fraction);
          if (mode === 'after' && where === 'top') {
            await scrollWithInput(page, selector, testInfo.project.name === 'mobile');
            qa.report.stages.at(-1).nativeScrollVerified = true;
            await page.locator(selector).evaluate(el => { el.scrollTop = 0; });
          }
          let g = await hudGeometry(page, selector); qa.report.stages.at(-1).geometry = g;
          faults.push(...g.overlaps, ...g.textOverlaps, ...g.controlOverlaps);
          if (mode === 'after') {
            await expect.poll(async () => (await hudGeometry(page, selector)).overlaps).toEqual([]);
            g = await hudGeometry(page, selector); qa.report.stages.at(-1).geometry = g;
            expect(g.textOverlaps, '저장 HUD가 텍스트를 가리지 않아야 함').toEqual([]);
            expect(g.controlOverlaps, '저장 HUD가 버튼/입력을 가리지 않아야 함').toEqual([]);
            await qa.audit(`HUD 회귀: ${tab} ${where}`);
            expect(g.outside).toEqual([]); expect(g.hud.every(h => h.visible && !h.clipped)).toBe(true);
            expect(g.buttonHit, '저장 버튼은 화면에서 실제로 누를 수 있어야 함').toBe(true);
            if (where === 'middle') {
              await qa.press('#s2Open'); await expect(page.locator('#s2Menu')).toBeVisible();
              await expect(page.locator('[data-s2-current]')).toContainText(name); await qa.press('[data-s2-close]');
            }
          }
        }, mode === 'before' ? '기준224b3da 비교 관찰(알려진 가림)' : '수정 코드 UI 검증');
      }
    }
    return faults;
  };
  const oldFaults = await capture('before');
  expect(oldFaults.length, '기준 버전의 실제 가림을 검출해야 함').toBeGreaterThan(0);
  await qa.step('hud-compatible-reload', '수정 UI에서 기준 저장 이어하기·원본 수동 저장 유지', async () => {
    await page.unroute('**/css/style.css'); await page.unroute('**/js/save-runtime.js');
    await page.reload(); await page.waitForFunction(() => GameBootstrap.state === 'ready');
    await qa.press('[data-s2-recent]');
    await page.waitForFunction(id => S2Runtime.session?.id === id && S2Runtime.canPlay(), villageId);
    expect(await page.evaluate(async () => (await S2Runtime.engine.list()).manual.find(m => m.id === 1))).toEqual(manual);
    expect(await page.evaluate(() => state.village.donated.length + state.village.specimens.length)).toBe(18);
    expect(await page.evaluate(() => state.characters.length)).toBe(4);
    expect(manual.snapshot.payload.saveVersion).toBe(1);
  });
  await capture('after');
  await qa.step('hud-world', '일반 월드에서도 저장 HUD·조이스틱·탭이 겹치지 않음', async () => {
    await qa.press('#tdClose');
    const g = await hudGeometry(page); qa.report.stages.at(-1).geometry = g;
    expect(g.overlaps).toEqual([]); expect(g.outside).toEqual([]); expect(g.buttonHit).toBe(true);
  });
  await qa.tab('village');
  await qa.step('hud-save-menu', '실제 저장 버튼으로 기존 저장 화면 접근', async () => {
    await qa.press('#s2Open'); await expect(page.locator('#s2Menu')).toBeVisible();
    await expect(page.locator('[data-s2-current]')).toContainText(name);
    expect(await page.evaluate(async () => (await S2Runtime.engine.list()).manual.find(m => m.id === 1))).toEqual(manual);
  });
  await qa.press('[data-s2-close]');
  await qa.step('hud-log', '기록 패널에서도 HUD와 스크롤 영역 분리·저장 접근', async () => {
    await qa.activate(page.locator('.td-log-btn'));
    await expect(page.locator('#logSection')).toBeVisible();
    await expect.poll(async () => (await hudGeometry(page, '#logSection')).overlaps).toEqual([]);
    const g = await hudGeometry(page, '#logSection'); qa.report.stages.at(-1).geometry = g;
    expect(g.textOverlaps).toEqual([]); expect(g.controlOverlaps).toEqual([]); expect(g.buttonHit).toBe(true);
    await qa.press('#s2Open'); await expect(page.locator('#s2Menu')).toBeVisible(); await qa.press('[data-s2-close]');
  });
  for (const viewport of [{ width: 320, height: 568 }, { width: 760, height: 600 }, { width: 844, height: 390 }, { width: 1024, height: 640 }]) {
    await qa.step(`hud-responsive-${viewport.width}-${viewport.height}`, `${viewport.width}×${viewport.height} 월드·패널·저장 접근`, async () => {
      await qa.press('#tdClose'); await page.setViewportSize(viewport);
      await expect.poll(async () => (await hudGeometry(page)).overlaps).toEqual([]);
      let g = await hudGeometry(page); expect(g.outside).toEqual([]); expect(g.buttonHit).toBe(true);
      await qa.press('#s2Open'); await expect(page.locator('#s2Menu')).toBeVisible(); await qa.press('[data-s2-close]');
      await qa.tab('research');
      await expect.poll(async () => (await hudGeometry(page, '#tab-research')).overlaps).toEqual([]);
      g = await hudGeometry(page, '#tab-research'); qa.report.stages.at(-1).geometry = g;
      expect(g.outside).toEqual([]); expect(g.buttonHit).toBe(true);
      expect(g.hud.every(h => h.visible && !h.clipped)).toBe(true);
    });
  }
});
