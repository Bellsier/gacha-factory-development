'use strict';
// Issue #32 UX-01 F-01: the recipe card's auto-craft and auto-sell checkboxes must tick with a real
// Space key (the browser's own toggle), without a world action; the summary keeps its Space/Enter;
// Tab order and the Task95/99 movement contract stay. Real Chromium keyboard input only — no
// synthetic keydown, no check()/setChecked(), no forced clicks on hidden controls.
const { test, expect } = require('./fixtures.cjs');

test('UX-01 키보드: 자동 제작·자동 판매 체크박스 Space, summary Space/Enter, Tab, 이동 키', async ({ page, qa }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  qa.report.preparation = '자동 제작 연구 완료, 철광석 40·석탄 20·골드 1000만 준비 fixture로 주입. 체크·판매·구매·이동은 실제 키보드/포인터 입력.';
  const steel = '[data-recipe-more="steel"]', summary = '[data-recipe-summary="steel"]', auto = '[data-autocraft="steel"]', sellToggle = '[data-autoselltoggle="steel"]';
  // world actions (the game's own tdInteractNow, which the global Space/E handler calls) and the
  // browser's default events on the two checkboxes are counted, never altered
  const counters = () => page.evaluate(() => ({ ...window.__qaKeys }));
  const resetCounters = () => page.evaluate(() => { for (const k of Object.keys(window.__qaKeys)) window.__qaKeys[k] = 0; });
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a ? [...a.attributes].map(x => x.name).find(n => n.startsWith('data-')) + '=' + (a.getAttribute([...a.attributes].map(x => x.name).find(n => n.startsWith('data-'))) || '') : ''; });
  const tabTo = async (selector, limit = 12) => {
    for (let i = 0; i < limit; i++) {
      if (await page.locator(selector).evaluate(el => el === document.activeElement)) return i;
      await page.keyboard.press('Tab');
    }
    throw new Error('Tab으로 ' + selector + '에 도달하지 못함. 현재 포커스: ' + await focused());
  };

  await qa.step('01-setup', '새 마을, 개발 탭, 준비 fixture', async () => {
    await qa.boot();
    await page.evaluate(() => {
      state.research.autoCraftDevice = true; Object.assign(state.resources, { iron: 40, coal: 20 }); state.gold = 1000; renderAll();
      window.__qaKeys = { world: 0, click: 0, change: 0, input: 0 };
      const act = tdInteractNow; window.tdInteractNow = (...a) => { window.__qaKeys.world++; return act(...a); };
      for (const type of ['click', 'change', 'input']) document.addEventListener(type, (e) => { if (e.target.matches && e.target.matches('[data-autocraft="steel"],[data-autoselltoggle="steel"]')) window.__qaKeys[type]++; }, true);
    });
    await qa.tab('dev');
    await expect(page.locator(steel)).not.toHaveAttribute('open', '');
  });

  await qa.step('02-summary-keys', 'summary: Enter로 열고 Space로 닫고 다시 Space로 열기(월드 행동 0)', async () => {
    await page.locator(summary).focus();
    await resetCounters();
    await page.keyboard.press('Enter');
    await expect(page.locator(steel)).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(page.locator(steel)).not.toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(page.locator(steel)).toHaveAttribute('open', '');
    expect((await counters()).world, 'summary 키로 월드 행동이 일어나면 안 됨').toBe(0);
  });

  await qa.step('03-autocraft-space', '자동 제작: summary에서 Tab으로 진입, Space로 OFF→ON→OFF', async () => {
    await page.locator(summary).focus();
    const tabs = await tabTo(auto);
    expect(tabs, 'summary 다음 Tab 몇 번 안에 자동 제작 체크박스').toBeLessThanOrEqual(3);
    await resetCounters();
    expect(await page.evaluate(() => state.autoCraft.steel)).toBeFalsy();
    await page.keyboard.press('Space');
    await expect(page.locator(auto)).toBeChecked();
    expect(await page.evaluate(() => state.autoCraft.steel)).toBe(true);
    expect(await counters()).toEqual({ world: 0, click: 1, change: 1, input: 1 });
    await page.keyboard.press('Space');
    await expect(page.locator(auto)).not.toBeChecked();
    expect(await page.evaluate(() => state.autoCraft.steel)).toBe(false);
    expect(await counters()).toEqual({ world: 0, click: 2, change: 2, input: 2 });
    await expect(page.locator(auto)).toBeFocused();
  });

  await qa.step('04-autocraft-works', '키보드로 켠 자동 제작이 실제로 강철을 만든다', async () => {
    await page.locator(auto).focus();
    await page.keyboard.press('Space');
    await expect(page.locator(auto)).toBeChecked();
    await expect.poll(() => page.evaluate(() => state.products.steel), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.keyboard.press('Space');
    await expect(page.locator(auto)).not.toBeChecked();
    expect(await page.evaluate(() => state.autoCraft.steel)).toBe(false);
  });

  await qa.step('05-autosell-space', '자동 판매: 실제 구매 → 새 토글에 포커스 → Space로 ON→OFF→ON', async () => {
    const gold = await page.evaluate(() => state.gold);
    await page.locator('[data-buyautosell="steel"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(sellToggle)).toBeFocused();
    expect(await page.evaluate(() => [state.autoSell.steel, state.autoSellOn.steel, state.gold < 1000])).toEqual([true, true, true]);
    expect(await page.evaluate(() => state.gold)).toBeLessThan(gold);
    await resetCounters();
    await page.keyboard.press('Space');
    await expect(page.locator(sellToggle)).not.toBeChecked();
    expect(await page.evaluate(() => state.autoSellOn.steel)).toBe(false);
    await page.keyboard.press('Space');
    await expect(page.locator(sellToggle)).toBeChecked();
    expect(await page.evaluate(() => state.autoSellOn.steel)).toBe(true);
    await page.keyboard.press('Space');
    await expect(page.locator(sellToggle)).not.toBeChecked();
    expect(await page.evaluate(() => state.autoSellOn.steel)).toBe(false);
    expect(await counters()).toEqual({ world: 0, click: 3, change: 3, input: 3 });
  });

  await qa.step('06-closed-details-tab', '닫힌 상세의 체크박스는 Tab 순서에서 빠짐', async () => {
    await page.locator(summary).focus();
    await page.keyboard.press('Enter'); // close
    await expect(page.locator(steel)).not.toHaveAttribute('open', '');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement && document.activeElement.closest('[data-recipe-more="steel"] .recipe-more-body') !== null), '닫힌 상세 안으로 포커스가 들어가면 안 됨').toBe(false);
    }
    await page.locator(summary).focus();
    await page.keyboard.press('Enter'); // open again for the next step
    await expect(page.locator(steel)).toHaveAttribute('open', '');
  });

  await qa.step('07-movement-contract', 'Task95/99: 체크박스 포커스에서 이동 키는 걷고 keyup에서 멈춤', async () => {
    await page.locator(auto).focus();
    for (const [key, axis, sign] of [['d', 'x', 1], ['ArrowLeft', 'x', -1]]) {
      const start = await page.evaluate(() => ({ ...state.world.player }));
      await page.keyboard.down(key);
      await expect.poll(() => page.evaluate(([a, s, v]) => (state.world.player[a] - v) * s, [axis, sign, start[axis]]), { timeout: 5_000 }).toBeGreaterThan(0.05);
      await page.keyboard.up(key);
      await expect.poll(() => page.evaluate(() => state.world.player.pose)).toBe('idle');
      const stopped = await page.evaluate(a => state.world.player[a], axis);
      await page.waitForTimeout(300);
      expect(await page.evaluate(a => state.world.player[a], axis), 'keyup 뒤에는 멈춰 있어야 함').toBe(stopped);
    }
    expect(await page.evaluate(() => state.autoCraft.steel), '이동 키가 체크박스를 바꾸면 안 됨').toBe(false);
  });

  await qa.step('08-pointer', mobile ? '터치로 두 체크박스 체크·해제' : '마우스로 두 체크박스 체크·해제', async () => {
    await resetCounters();
    for (const sel of [auto, sellToggle]) {
      const before = await page.locator(sel).isChecked();
      await qa.activate(page.locator(sel));
      await expect(page.locator(sel)).toBeChecked({ checked: !before });
      await qa.activate(page.locator(sel));
      await expect(page.locator(sel)).toBeChecked({ checked: before });
    }
    expect(await page.evaluate(() => [state.autoCraft.steel, state.autoSellOn.steel])).toEqual([false, false]);
    expect((await counters()).world).toBe(0);
    await qa.audit('제작 카드 키보드');
  });
});
