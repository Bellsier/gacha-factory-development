'use strict';
// Issue #32 (03-proximity-mine): right after a quick flick of the stick, Chromium could deliver the phone action
// button's pointerdown/pointerup without a click, so the tap did nothing. The button now acts on a touch
// pointerup and skips the click that follows. Each tap must act exactly once; mouse and keyboard keep working.
// The stick is driven the way navigation.cjs does it (CDP touch on #tdStick); the tap is Playwright's tap.
const { test, expect } = require('./fixtures.cjs');

test('행동 버튼: 조이스틱을 튕긴 직후 탭도 정확히 한 번 실행, 마우스·키보드 유지', async ({ page, qa }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  qa.report.preparation = '플레이어를 주변에 대상이 없는 자리로 옮김(준비 fixture). 실행 횟수는 게임의 tdInteractNow 호출을 셈(관찰만).';
  await qa.step('01-setup', '새 마을, 대상 없는 자리, 실행 횟수 관찰', async () => {
    await qa.boot();
    await page.evaluate(() => {
      const b = state.world.base;
      for (let r = 3; r < 12; r += 0.5) { const x = b.x + r, y = b.y + r; if (playerCanStand(x, y) && !tdInteractTarget(x, y)) { Object.assign(state.world.player, { x, y }); window.__qaSpot = { x, y }; break; } }
      window.__qaActs = 0; const act = tdInteractNow; window.tdInteractNow = (...a) => { window.__qaActs++; return act(...a); };
    });
  });
  if (mobile) {
    await qa.step('02-flick-then-tap', '조이스틱을 빠르게 튕긴 뒤 0·130·300·600ms 안에 탭 ×5 → 매번 1회 (일반 터치 컨텍스트)', async () => {
      // A plain touch context (no device user agent): there the dropped click shows up often (measured before the
      // fix: 1/20, 1/20, 0/20, 14/20 taps acted), so this check fails reliably without the fix.
      const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale: 'ko-KR' });
      await ctx.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      const p = await ctx.newPage();
      try {
        await p.goto(page.url());
        await p.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready');
        await p.waitForFunction(() => S2Runtime.session && S2Runtime.canPlay());
        await p.evaluate(() => {
          const b = state.world.base;
          for (let r = 3; r < 12; r += 0.5) { const x = b.x + r, y = b.y + r; if (playerCanStand(x, y) && !tdInteractTarget(x, y)) { Object.assign(state.world.player, { x, y }); window.__qaSpot = { x, y }; break; } }
          window.__qaActs = 0; const act = tdInteractNow; window.tdInteractNow = (...a) => { window.__qaActs++; return act(...a); };
        });
        const box = await p.locator('#tdStick').boundingBox(), c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const results = [];
        for (const gap of [0, 130, 300, 600]) for (let i = 0; i < 5; i++) {
          // back to the empty spot with every panel closed (the flick moves the player a little; a tap that now
          // really acts may open something, e.g. the workshop, which hides the action button)
          await p.evaluate(() => { tdClosePanels(); Object.assign(state.world.player, window.__qaSpot); });
          const s = await ctx.newCDPSession(p);
          await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...c, id: 1 }] });
          await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + (i % 2 ? 40 : -40), y: c.y, id: 1 }] });
          await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await s.detach();
          if (gap) await p.waitForTimeout(gap); // the gap under test, not a wait for the game
          const before = await p.evaluate(() => window.__qaActs);
          await p.locator('#tdAction').tap();
          await p.waitForTimeout(400); // the tap's own action, or a late duplicate click, lands within this window
          results.push(await p.evaluate(() => window.__qaActs) - before);
        }
        expect(results, '탭마다 실행 횟수(0 = 탭 소실, 2 = 중복)').toEqual(Array(20).fill(1));
      } finally { await ctx.close(); }
    });
  } else {
    await qa.step('02-mouse-keyboard', '마우스 클릭 1회 → 1회, 키보드 Enter·Space → 각 1회', async () => {
      // the action button is a phone control; on a PC it is hidden, so check it through the same handlers when shown
      await page.evaluate(() => document.body.classList.add('td-touch'));
      for (const how of ['click', 'Enter', 'Space']) {
        const before = await page.evaluate(() => window.__qaActs);
        if (how === 'click') await page.locator('#tdAction').click();
        else { await page.locator('#tdAction').focus(); await page.keyboard.press(how); }
        await page.waitForTimeout(300); // a double run would show up here
        expect(await page.evaluate(() => window.__qaActs) - before, how).toBe(1);
      }
    });
  }
});
