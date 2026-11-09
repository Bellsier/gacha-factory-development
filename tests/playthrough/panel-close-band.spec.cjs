'use strict';
// Issue #32 C: the open panel scrolls BELOW its top band, so no visible control ever sits under the fixed close
// button (before, a card button scrolled under it and a tap there closed the panel instead). Real input only:
// scrolling is the panel's own scrollTop (what a wheel/drag does), actions are real clicks/taps/keys.
const { test, expect } = require('./fixtures.cjs');

// In the page: scroll the open panel from top to bottom; at each step list the controls whose VISIBLE part (inside
// the panel, below the band) overlaps the close button and where a click there would land on the close button.
// step: scroll increment in px; below the close button's 44px height, so no control can pass under it unsampled
const coveredWhileScrolling = (step = 8) => page => page.evaluate(async (step) => {
  // the open panel: the log, or the active tab's panel
  const panel = document.querySelector('body.td-log-open #logSection') || document.querySelector('.tab-panel.active'), close = document.getElementById('tdClose');
  const pr = panel.getBoundingClientRect(), cr = close.getBoundingClientRect();
  const band = getComputedStyle(panel, '::before'), head = band.position === 'sticky' ? parseFloat(band.height) : 0;
  const covered = [];
  for (let y = 0; ; y += step) {
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
}, step);

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

// PR #38 review P3: the same guarantee on more screens, the log panel, browser zoom and a larger root font. One
// fresh context per case (the pc project runs it once). Zoom is emulated as the CSS viewport a 1280x800 window has
// at that zoom, with the matching device pixel ratio; the font case sets the root font size (not an OS setting).
const CASES = [
  ['320x568', { width: 320, height: 568 }, 1, true], ['390x844', { width: 390, height: 844 }, 1, true], ['844x390', { width: 844, height: 390 }, 1, true],
  ['568x320', { width: 568, height: 320 }, 1, true], ['1280x800', { width: 1280, height: 800 }, 1, false],
  ['1280x800 확대 150%', { width: 853, height: 533 }, 1.5, false], ['1280x800 확대 200%', { width: 640, height: 400 }, 2, false],
  ['390x844 글자 125%', { width: 390, height: 844 }, 1, true, '125%'], ['1280x800 글자 125%', { width: 1280, height: 800 }, 1, false, '125%'],
];
test('패널 머리 띠: 4개 기준 화면·작은 가로·확대·큰 글자, 기록 패널 포함', async ({ page, qa }, testInfo) => {
  test.skip(testInfo.project.name !== 'pc', '화면 조건을 직접 만들어 한 번만 실행');
  test.setTimeout(420_000); // 9 screens x 7 panels, each scrolled top to bottom
  qa.report.preparation = '각 조건마다 새 컨텍스트. 강철 5·골드 1000·연구, 기록 60줄을 준비 fixture로 주입(스크롤이 생기게).';
  await qa.boot();
  const url = page.url();
  for (const [name, viewport, dsf, mobile, font] of CASES) {
    await qa.step('cases-' + name, `${name}: 7개 패널(기록 포함) 스크롤 중 닫기 버튼 밑 조작 요소 0, 닫기 버튼은 띠 안에서 눌림`, async () => {
      const ctx = await page.context().browser().newContext({ viewport, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile, locale: 'ko-KR' });
      await ctx.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      const p = await ctx.newPage();
      try {
        await p.goto(url);
        await p.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready');
        await p.waitForFunction(() => S2Runtime.session && S2Runtime.canPlay());
        await p.evaluate((f) => { if (f) document.documentElement.style.fontSize = f; state.research.autoCraftDevice = true; state.products.steel = 5; state.gold = 1000; for (let i = 0; i < 60; i++) log('기록 ' + i); renderAll(); }, font || null);
        for (const panel of ['dev', 'mining', 'village', 'workers', 'delivery', 'research', 'log']) {
          if (panel === 'log') await p.locator('.td-log-btn').click(); else await p.locator(`.tab-btn[data-tab="${panel}"]`).click();
          const r = await coveredWhileScrolling(16)(p);
          expect(r.coveredCount, `${name} ${panel}: ` + JSON.stringify(r.covered)).toBe(0);
          expect(r.closeInsideBand, `${name} ${panel}: 닫기 버튼은 머리 띠 안`).toBe(true);
          await p.locator('#tdClose').click(); // the close button itself is reachable and closes the panel
          await expect.poll(() => p.evaluate(() => document.body.classList.contains('td-panel-open') || document.body.classList.contains('td-log-open'))).toBe(false);
        }
      } finally { await ctx.close(); }
    });
  }
});
