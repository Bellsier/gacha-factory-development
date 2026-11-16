'use strict';
// Issue #32 POST-QA B/D: the recipe card's stock-target field keeps an unfinished number ("1e") and an
// input-method composition across a card rebuild (renderAll — what a finished tunnel contract, a research
// or a purchase calls), without turning the target into "no limit". Real Chromium keyboard input; the
// composition steps use CDP Input.imeSetComposition (a synthetic composition, NOT a real OS IME).
const { test, expect } = require('./fixtures.cjs');

test('UX-01 목표 재고 초안: 불완전 숫자·조합 중 재렌더, 정상 입력·정규화·포커스·커서', async ({ page, qa }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  qa.report.preparation = '자동 제작 연구 완료, 철광석 40·석탄 20, 강철 재고 7만 준비 fixture로 주입. 재렌더는 게임의 renderAll()을 직접 호출(터널 공사 완료 등이 부르는 같은 함수). 입력은 실제 키보드, 조합은 CDP 합성.';
  const field = '[data-craft-target="steel"]';
  const target = () => page.evaluate(() => state.craftTarget.steel || 0);
  const fieldState = () => page.locator(field).evaluate(el => ({ value: el.value, bad: el.validity.badInput, focused: el === document.activeElement, same: el.__qaMark === true }));
  const mark = () => page.locator(field).evaluate(el => { el.__qaMark = true; });
  const rebuild = () => page.evaluate(() => renderAll());
  const typeInto = async (text) => {
    await qa.activate(page.locator(field));
    await page.keyboard.press('ControlOrMeta+A');
    if (text === '') await page.keyboard.press('Backspace'); else await page.keyboard.type(text);
  };
  const commit = async (text) => { await typeInto(text); await page.keyboard.press('Tab'); await expect.poll(() => page.evaluate(() => document.activeElement && !document.activeElement.hasAttribute('data-craft-target'))).toBe(true); };

  await qa.step('01-setup', '새 마을, 개발 탭, 강철 상세 열기', async () => {
    await qa.boot();
    await page.evaluate(() => { state.research.autoCraftDevice = true; Object.assign(state.resources, { iron: 40, coal: 20 }); state.products.steel = 7; renderAll(); });
    await qa.tab('dev');
    await qa.press('[data-recipe-summary="steel"]');
    await expect(page.locator('[data-recipe-more="steel"]')).toHaveAttribute('open', '');
  });

  await qa.step('02-target-7-auto', '목표 7 입력, 자동 제작 켜기(목표 도달로 쉼)', async () => {
    await commit('7');
    expect(await target()).toBe(7);
    await qa.activate(page.locator('[data-autocraft="steel"]'));
    expect(await page.evaluate(() => state.autoCraft.steel)).toBe(true);
    await expect(page.locator('[data-recipe-auto-state="steel"]')).toHaveText('자동 제작 · 목표 재고 도달로 쉬는 중');
  });

  await qa.step('03-unfinished-1e', 'B: "1e" 입력 중 재렌더 → 목표 7 유지, 초안·포커스 유지, 자동 제작 제한 유지', async () => {
    await typeInto('1e');
    expect(await fieldState()).toMatchObject({ value: '', bad: true, focused: true });
    await mark();
    await rebuild();
    expect(await fieldState(), '편집 중인 칸은 교체되지 않음(같은 노드, 불완전 값 유지)').toEqual({ value: '', bad: true, focused: true, same: true });
    expect(await target()).toBe(7);
    await page.waitForTimeout(1500); // auto-craft keeps resting at the target while the field is open
    expect(await page.evaluate(() => state.products.steel)).toBe(7);
    await page.keyboard.press('Tab'); // leave the unfinished number: the target stays and the field shows it again
    await expect.poll(target).toBe(7);
    await expect(page.locator(field)).toHaveValue('7');
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => state.products.steel), '목표 제한이 풀리면 강철이 늘어남').toBe(7);
  });

  await qa.step('04-intentional-clear', '의도적으로 지운 빈칸은 기존 규칙대로 제한 없음(0)', async () => {
    await commit('');
    expect(await target()).toBe(0);
    await expect.poll(() => page.evaluate(() => state.products.steel), { timeout: 10_000 }).toBeGreaterThan(7); // the limit is really gone
    await qa.activate(page.locator('[data-autocraft="steel"]'));
    expect(await page.evaluate(() => state.autoCraft.steel)).toBe(false);
  });

  await qa.step('05-valid-draft', '정상 입력 "42": 입력 중 재렌더에도 같은 칸·초안 유지, 칸을 떠날 때 적용', async () => {
    await typeInto('4');
    await mark();
    await rebuild();
    await page.keyboard.type('2');
    expect(await fieldState()).toEqual({ value: '42', bad: false, focused: true, same: true });
    expect(await target(), '칸을 떠나기 전에는 적용되지 않음').toBe(0);
    await page.keyboard.press('Tab');
    await expect.poll(target).toBe(42);
  });

  await qa.step('06-caret', '커서 위치: "12" → ←, 재렌더, "9" → "192"', async () => {
    await typeInto('12');
    await page.keyboard.press('ArrowLeft');
    await rebuild();
    await page.keyboard.type('9');
    expect((await fieldState()).value).toBe('192');
    await page.keyboard.press('Tab');
    await expect.poll(target).toBe(192);
  });

  await qa.step('07-normalize', '기존 정규화: -3→0, 5.7→5, 9999999→999999', async () => {
    for (const [typed, want] of [['-3', 0], ['5.7', 5], ['9999999', 999999]]) {
      await commit(typed);
      await expect.poll(target).toBe(want);
      await expect(page.locator(field)).toHaveValue(want ? String(want) : '');
    }
  });

  await qa.step('08-deferred-structure', '편집 중 구조 변경(지역 해금)은 칸을 떠난 뒤 반영, 상세 펼침 유지', async () => {
    await typeInto('3');
    await page.evaluate(() => { state.unlockedSites[resourceByKey('mana').site] = true; renderAll(); });
    await expect(page.locator('[data-stock="alloy"]'), '편집 중에는 카드 목록을 다시 그리지 않음').toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-stock="alloy"]')).toHaveCount(1);
    await expect.poll(target).toBe(3);
    await expect(page.locator('[data-recipe-more="steel"]')).toHaveAttribute('open', '');
  });

  await qa.step('09-composition', 'D: 조합(CDP 합성) "12" 중 재렌더 → "123" 확정이 대조군과 같음', async () => {
    const cdp = await page.context().newCDPSession(page);
    const compose = async (withRebuild) => {
      await typeInto('');
      await cdp.send('Input.imeSetComposition', { text: '12', selectionStart: 2, selectionEnd: 2 });
      if (withRebuild) await rebuild();
      await cdp.send('Input.imeSetComposition', { text: '123', selectionStart: 3, selectionEnd: 3 });
      await cdp.send('Input.insertText', { text: '123' });
      const v = (await fieldState()).value;
      await page.keyboard.press('Tab');
      return v;
    };
    const control = await compose(false), rebuilt = await compose(true);
    expect(control, '대조군(재렌더 없음)').toBe('123');
    expect(rebuilt, '조합 중 재렌더').toBe(control);
    await expect.poll(target).toBe(123);
    await cdp.detach();
    await qa.audit('제작 카드 목표 재고');
  });
});
