'use strict';
// Issue #32 C: the open panel scrolls BELOW its top band, so no visible control ever sits under the fixed close
// button (before, a card button scrolled under it and a tap there closed the panel instead). Real input only:
// scrolling is the panel's own scrollTop (what a wheel/drag does), actions are real clicks/taps/keys.
const { test, expect } = require('./fixtures.cjs');

// In the page: scroll the open panel from top to bottom; at each step list the controls whose VISIBLE part (inside
// the panel, below the band) overlaps the close button and where a click there would land on the close button.
const coveredWhileScrolling = () => page => page.evaluate(async () => {
  const panel = document.querySelector('.tab-panel.active'), close = document.getElementById('tdClose');
  const pr = panel.getBoundingClientRect(), cr = close.getBoundingClientRect();
  const band = getComputedStyle(panel, '::before'), head = band.position === 'sticky' ? parseFloat(band.height) : 0;
  const covered = [];
  for (let y = 0; ; y += 8) {
    panel.scrollTop = y; await new Promise(requestAnimationFrame);
    for (const el of panel.querySelectorAll('button,summary,input,select,label')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const top = Math.max(r.top, pr.top + head), bottom = Math.min(r.bottom, pr.bottom);
      const ox = Math.min(r.right, cr.right) - Math.max(r.left, cr.left), oy = Math.min(bottom, cr.bottom) - Math.max(top, cr.top);
      if (ox > 0 && oy > 0) covered.push({ y, control: el.outerHTML.slice(0, 60) });
    }
    if (y >= panel.scrollHeight - panel.clientHeight) break;
  }
  panel.scrollTop = 0;
  return { head, closeInsideBand: cr.top >= pr.top - 1 && cr.bottom <= pr.top + head + 1, covered: covered.slice(0, 5), coveredCount: covered.length };
});

test('패널 머리 띠: 닫기 버튼 밑으로 조작 요소가 지나가지 않음, 판매·닫기·키보드 포커스', async ({ page, qa }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  qa.report.preparation = '자동 제작 연구, 강철·석탄 벽돌 각 5개, 골드 1000만 준비 fixture로 주입(카드와 버튼이 많이 보이게). 판매·닫기·키 입력은 실제 조작.';
  await qa.step('01-setup', '새 마을, 준비 fixture', async () => {
    await qa.boot();
    await page.evaluate(() => { state.research.autoCraftDevice = true; Object.assign(state.products, { steel: 5, coalBrick: 5 }); state.gold = 1000; renderAll(); });
  });
  for (const tab of ['dev', 'mining', 'village', 'workers', 'delivery']) {
    await qa.step('02-scroll-' + tab, `${tab} 패널: 처음부터 끝까지 스크롤하는 동안 닫기 버튼 밑의 조작 요소 0`, async () => {
      await qa.tab(tab);
      if (tab === 'dev') for (const k of ['steel', 'coalBrick']) await qa.press(`[data-recipe-summary="${k}"]`);
      const r = await coveredWhileScrolling()(page);
      expect(r.coveredCount, '닫기 버튼 밑에 보이는 조작 요소: ' + JSON.stringify(r.covered)).toBe(0);
      expect(r.head, '머리 띠(패널 위 여백 높이)').toBeGreaterThanOrEqual(56);
      expect(r.closeInsideBand, '닫기 버튼은 머리 띠 안에 있음').toBe(true);
    });
  }
  await qa.step('03-sell-near-top', '판매 버튼을 패널 위쪽까지 스크롤한 뒤 실제로 누르면 판매(패널은 열린 채)', async () => {
    await qa.tab('dev');
    await page.evaluate(() => { const p = document.querySelector('.tab-panel.active'), s = document.querySelector('[data-sell="steel"]'), c = document.getElementById('tdClose');
      p.scrollTop += s.getBoundingClientRect().top - c.getBoundingClientRect().top; }); // the scroll that used to put it under the close button
    const before = await page.evaluate(() => state.gold);
    await qa.press('[data-sell="steel"]');
    await expect.poll(() => page.evaluate(() => state.gold)).toBeGreaterThan(before);
    expect(await page.evaluate(() => document.body.classList.contains('td-panel-open'))).toBe(true);
    await qa.audit('개발 패널 판매 직후');
  });
  await qa.step('04-focus-below-band', '키보드 포커스가 머리 띠 밑으로 숨지 않음(Shift+Tab으로 위쪽 조작 요소로)', async () => {
    const field = page.locator('[data-craft-target="steel"]');
    await field.focus();
    await page.evaluate(() => { document.querySelector('.tab-panel.active').scrollTop += 2000; }); // the field scrolls out above
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // back to the field: the browser scrolls it into view
    await expect(field).toBeFocused();
    const r = await page.evaluate(() => { const p = document.querySelector('.tab-panel.active'), f = document.querySelector('[data-craft-target="steel"]');
      return { fieldTop: f.getBoundingClientRect().top, bandBottom: p.getBoundingClientRect().top + parseFloat(getComputedStyle(p, '::before').height) }; });
    expect(r.fieldTop, '포커스된 칸이 머리 띠 아래에 보임').toBeGreaterThanOrEqual(r.bandBottom - 1);
  });
  await qa.step('05-close', mobile ? '닫기 버튼 탭으로 패널 닫기, 다시 열고 Esc로 닫기' : '닫기 버튼 클릭으로 패널 닫기, 다시 열고 Esc로 닫기', async () => {
    await qa.press('#tdClose');
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('td-panel-open'))).toBe(false);
    await qa.tab('dev');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('td-panel-open'))).toBe(false);
  });
});
