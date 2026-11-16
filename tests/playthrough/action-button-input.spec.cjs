'use strict';
// PR #38 review P2: the phone action button (#tdAction, tdBindTap) must act exactly once per touch tap, act on a
// tap whose click the browser never sends, and never swallow a separate mouse / keyboard input that follows.
// Inputs are real: CDP touch (Input.dispatchTouchEvent, the way navigation.cjs drives touch), Playwright tap,
// mouse and keyboard. Each action is counted at the game's tdInteractNow (observed, not changed).
// Chromium's own order, checked first: a tap gives pointerdown/pointerup/click(pointerType 'touch', same
// pointerId); mouse click pointerType 'mouse'; Enter/Space click pointerType '' and detail 0; a second finger is
// isPrimary false and gives no click; a touch that is cancelled gives pointercancel and no pointerup.
const { test, expect } = require('./fixtures.cjs');

test('행동 버튼 입력: 탭 1회=행동 1회, click 없는 탭, 터치 뒤 마우스·키보드, 취소·밖에서 놓기·연속·멀티터치·패널', async ({ page, qa }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '터치 입력 검사(휴대폰 화면의 행동 버튼)');
  qa.report.preparation = '플레이어를 대상 없는 자리(그리고 마지막 단계에서 공방 문 앞)로 옮기는 준비 fixture. 실행 횟수는 tdInteractNow 호출을 관찰.';
  let cdp, center;
  const acts = () => page.evaluate(() => window.__qaActs);
  const reset = () => page.evaluate(() => { tdClosePanels(); Object.assign(state.world.player, window.__qaSpot); });
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  // counts how many actions one input caused, waiting long enough for a late click to show up as a second action
  const count = async (input) => { await reset(); const before = await acts(); await input(); await page.waitForTimeout(350); return (await acts()) - before; };

  await qa.step('01-setup', '새 마을, 대상 없는 자리, 실행 횟수 관찰', async () => {
    await qa.boot();
    await page.evaluate(() => {
      const b = state.world.base;
      for (let r = 3; r < 12; r += 0.5) { const x = b.x + r, y = b.y + r; if (playerCanStand(x, y) && !tdInteractTarget(x, y)) { Object.assign(state.world.player, { x, y }); window.__qaSpot = { x, y }; break; } }
      window.__qaActs = 0; const act = tdInteractNow; window.tdInteractNow = (...a) => { window.__qaActs++; return act(...a); };
    });
    cdp = await page.context().newCDPSession(page);
    const box = await page.locator('#tdAction').boundingBox();
    center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });

  await qa.step('02-tap-once', '탭 1회 → 1회, 연속 탭 5회 → 5회', async () => {
    expect(await count(() => page.locator('#tdAction').tap())).toBe(1);
    expect(await count(async () => { for (let i = 0; i < 5; i++) await page.locator('#tdAction').tap(); })).toBe(5);
  });

  await qa.step('03-tap-without-click', '두 손가락 탭(브라우저 click 없음) → 1회', async () => {
    expect(await count(async () => {
      await touch('touchStart', [{ ...center, id: 1 }, { x: center.x + 12, y: center.y + 12, id: 2 }]);
      await touch('touchEnd', []);
    })).toBe(1);
  });

  for (const [name, input] of [
    ['mouse', () => page.mouse.click(center.x, center.y)],
    ['Enter', async () => { await page.locator('#tdAction').focus(); await page.keyboard.press('Enter'); }],
    ['Space', async () => { await page.locator('#tdAction').focus(); await page.keyboard.press('Space'); }],
  ]) {
    await qa.step('04-after-touch-' + name, `click 없는 터치 직후의 ${name} 입력은 따로 1회 실행`, async () => {
      await reset();
      const before = await acts();
      await touch('touchStart', [{ ...center, id: 1 }, { x: center.x + 12, y: center.y + 12, id: 2 }]);
      await touch('touchEnd', []);
      await expect.poll(acts).toBe(before + 1);
      await input(); // right after the touch: before the fix a timer swallowed this input
      await page.waitForTimeout(350);
      expect(await acts() - before, '터치 1 + ' + name + ' 1').toBe(2);
    });
  }

  await qa.step('05-tap-then-mouse-keyboard', '정상 탭(click 있음) 직후 마우스·Enter → 각 1회', async () => {
    await reset();
    const before = await acts();
    await page.locator('#tdAction').tap();
    await page.mouse.click(center.x, center.y);
    await page.locator('#tdAction').focus(); await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    expect(await acts() - before).toBe(3);
  });

  await qa.step('06-cancel-and-slide-off', '터치 취소 → 0회, 버튼 밖으로 밀고 놓기 → 0회', async () => {
    expect(await count(async () => { await touch('touchStart', [{ ...center, id: 3 }]); await touch('touchCancel', []); })).toBe(0);
    expect(await count(async () => {
      await touch('touchStart', [{ ...center, id: 4 }]);
      await touch('touchMove', [{ x: center.x - 160, y: center.y - 160, id: 4 }]);
      await touch('touchEnd', []);
    })).toBe(0);
  });

  await qa.step('07-panel-opens', '공방 문 앞에서 탭 → 패널이 열리고 행동은 1회(버튼이 숨겨져도 중복 없음)', async () => {
    await page.evaluate(() => {
      tdClosePanels();
      const b = state.world.base;
      for (let dy = 0.3; dy < 2; dy += 0.05) { const y = b.y + dy; if (playerCanStand(b.x, y) && tdInteractTarget(b.x, y)?.action === 'open') { Object.assign(state.world.player, { x: b.x, y, facing: 'up' }); break; } }
    });
    await expect(page.locator('#tdAction')).toHaveText('열기');
    const before = await acts();
    await page.locator('#tdAction').tap();
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('td-panel-open'))).toBe(true);
    await page.waitForTimeout(350);
    expect(await acts() - before).toBe(1);
    await page.evaluate(() => tdClosePanels());
  });
});
