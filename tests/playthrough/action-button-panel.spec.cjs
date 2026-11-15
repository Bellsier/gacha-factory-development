'use strict';
// PR #38 deep review (P1-1, P2-1, P2-2): the phone buttons bound with tdBindTap (#tdAction, #tdTorch, #tdDecor).
//  - A touch tap that opens a panel must not send a click into the panel that appears under the finger (before, the
//    tap's click landed on whatever control was there: a "sell all" button sold the stock).
//  - A button tapped while another finger holds the stick must act (before, only the first finger on the screen counted).
// Every check looks at the real game state and at where click events land, not only at how often the handler ran.
// Inputs are real: CDP touch (Input.dispatchTouchEvent), Playwright tap, CDP pen (Input.dispatchMouseEvent with
// pointerType 'pen'). CDP touchEnd lists the fingers being lifted; unlisted fingers remain down.
// The one synthetic part is the last step (a click that is not a PointerEvent), and it says so.
const { test, expect } = require('./fixtures.cjs');

test('행동·횃불·장식 버튼: 패널로 새는 click 없음, 조이스틱 유지 중 조작, 펜, PointerEvent가 아닌 click', async ({ page, qa }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '터치 입력 검사(휴대폰 화면)');
  qa.report.preparation = '자동 제작 연구, 강철·석탄 벽돌 각 5개, 골드 1000 준비 fixture. 플레이어 위치(빈 자리·공방 문 앞)와 장식 버튼 표시(정원 상태 대신)도 fixture. 탭·펜·조이스틱은 실제 입력.';
  let cdp, A, S, T;
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const center = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // the game state a stray click could change (raw resources are left out: they grow by themselves every tick)
  const snap = () => page.evaluate(() => JSON.stringify({
    gold: state.gold, products: state.products, research: state.research,
    checks: [...document.querySelectorAll('.tab-panel input[type=checkbox]')].map(c => +c.checked).join(''),
    fields: [...document.querySelectorAll('.tab-panel input:not([type=checkbox])')].map(i => i.value).join('|'),
    open: [...document.querySelectorAll('.tab-panel details')].map(d => +d.open).join(''),
  }));
  // every click anywhere in the document since the last call: where it landed and what kind it was
  const clicks = () => page.evaluate(() => window.__qaClicks.splice(0));
  const acts = () => page.evaluate(() => window.__qaActs);
  const torchCalls = () => page.evaluate(() => window.__qaTorchCalls);
  const settle = () => page.waitForTimeout(350); // a late click of the tap would arrive within this
  const emptySpot = () => page.evaluate(() => { tdClosePanels(); Object.assign(state.world.player, window.__qaSpot); });
  const atDoor = async () => {
    await page.evaluate(() => {
      tdClosePanels();
      const b = state.world.base;
      for (let dy = 0.3; dy < 2; dy += 0.05) { const y = b.y + dy; if (playerCanStand(b.x, y) && tdInteractTarget(b.x, y)?.action === 'open') { Object.assign(state.world.player, { x: b.x, y, facing: 'up' }); break; } }
    });
    await expect(page.locator('#tdAction')).toHaveText('열기');
  };
  const panelOpen = () => page.evaluate(() => document.body.classList.contains('td-panel-open'));
  const torches = () => page.evaluate(() => worldTorches().length);

  await qa.step('01-setup', '새 마을, 준비 fixture, click·행동 관찰', async () => {
    await qa.boot();
    await page.evaluate(() => {
      state.research.autoCraftDevice = true; Object.assign(state.products, { steel: 5, coalBrick: 5 }); state.gold = 1000; renderAll();
      const b = state.world.base;
      for (let r = 3; r < 12; r += 0.5) { const x = b.x + r, y = b.y + r; if (playerCanStand(x, y) && !tdInteractTarget(x, y)) { Object.assign(state.world.player, { x, y }); window.__qaSpot = { x, y }; break; } }
      window.__qaActs = 0; const act = tdInteractNow; window.tdInteractNow = (...a) => { window.__qaActs++; return act(...a); };
      window.__qaTorchCalls = 0; const torch = tdTorchNow;
      window.tdTorchNow = function (...a) { window.__qaTorchCalls++; return torch.apply(this, a); };
      window.__qaTouchEnds = [];
      document.addEventListener('touchend', e => window.__qaTouchEnds.push({
        ended: [...e.changedTouches].map(t => t.identifier), remaining: [...e.touches].map(t => t.identifier), trusted: e.isTrusted,
      }), { capture: true, passive: true });
      window.__qaClicks = [];
      const name = el => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '');
      document.addEventListener('click', e => { const c = e.target.closest('button,summary,input,select,label,a');
        window.__qaClicks.push({ target: name(e.target), control: c ? c.outerHTML.slice(0, 60) : null, pointerType: e.pointerType ?? null, trusted: e.isTrusted }); }, true);
    });
    cdp = await page.context().newCDPSession(page);
    A = await center('#tdAction'); S = await center('#tdStick'); T = await center('#tdTorch');
  });

  await qa.step('02-open-over-controls', '패널을 여러 위치로 스크롤해 둔 뒤 "열기" 탭: click 0, 게임 상태 불변', async () => {
    // with the panel open: the scroll positions that put an enabled control exactly under the action button's centre
    await qa.tab('dev');
    for (const k of ['steel', 'coalBrick']) await qa.press(`[data-recipe-summary="${k}"]`); // the sell buttons are inside the opened cards
    const spots = await page.evaluate(([x, y]) => {
      const p = document.querySelector('.tab-panel.active'), seen = new Set(), out = [];
      for (let s = 0; s <= p.scrollHeight - p.clientHeight; s += 20) {
        p.scrollTop = s;
        const c = document.elementFromPoint(x, y)?.closest('button,summary,input,select,label');
        if (!c || c.disabled || seen.has(c.outerHTML)) continue;
        seen.add(c.outerHTML); out.push({ scrollTop: s, control: c.outerHTML.slice(0, 60) });
      }
      p.scrollTop = 0; return out;
    }, [A.x, A.y]);
    expect(spots.some(s => s.control.includes('data-sell=')), '판매 버튼이 행동 버튼 자리에 오는 스크롤 위치가 있어야 함: ' + JSON.stringify(spots)).toBe(true);
    expect(spots.some(s => s.control.startsWith('<summary')), '레시피 펼침이 행동 버튼 자리에 오는 위치').toBe(true);
    let n = 0; const under = [];
    for (const spot of [{ scrollTop: 0, control: null }, ...spots]) {
      await page.evaluate(s => { document.querySelector('.tab-panel.active').scrollTop = s; }, spot.scrollTop);
      await atDoor(); // closes the panel; its scroll position stays
      await clicks();
      const before = await snap(), actsBefore = await acts();
      if (n++ % 2) await page.locator('#tdAction').tap(); else { await touch('touchStart', [{ ...A, id: 1 }]); await touch('touchEnd', []); }
      await expect.poll(panelOpen).toBe(true);
      await settle();
      const where = `스크롤 ${spot.scrollTop}` + (spot.control ? `, 손가락 아래 ${spot.control}` : '');
      // what really is under the finger now (the cards' texts change with the game, so the layout may have moved a little)
      under.push(await page.evaluate(([x, y]) => { const c = document.elementFromPoint(x, y)?.closest('button,summary,input,select,label'); return c && !c.disabled ? c.outerHTML.slice(0, 60) : null; }, [A.x, A.y]));
      expect(await clicks(), where + ': 이 탭에서 나온 click').toEqual([]);
      expect(await snap(), where + ': 골드·재고·체크박스·입력칸·펼침 상태').toBe(before);
      expect(await acts() - actsBefore, where + ': 행동 1회').toBe(1);
      expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.id || null), where + ': 포커스가 패널 조작 요소로 가지 않음').toBe(true);
    }
    expect(under.some(c => c?.includes('data-sell=')), '열린 패널의 판매 버튼이 손가락 아래에 있던 경우가 포함됨: ' + JSON.stringify(under)).toBe(true);
    expect(under.some(c => c?.startsWith('<summary')), '열린 패널의 레시피 펼침이 손가락 아래에 있던 경우가 포함됨').toBe(true);
    await qa.audit('행동 버튼으로 연 개발 패널');
  });

  await qa.step('03-stick-held-action', '조이스틱을 누른 채 행동 탭 → 1회(패널이 열림), 버튼 위 두 손가락 → 1회', async () => {
    await atDoor(); await clicks();
    let before = await acts(); const state0 = await snap();
    await touch('touchStart', [{ ...S, id: 1 }]);                       // a thumb resting on the stick (its centre: no walking)
    await touch('touchStart', [{ ...S, id: 1 }, { ...A, id: 2 }]);      // the other thumb on the action button
    await touch('touchEnd', []);
    await expect.poll(panelOpen, '조이스틱 유지 중 "열기"').toBe(true);
    await settle();
    expect(await acts() - before).toBe(1);
    expect(await clicks()).toEqual([]);
    expect(await snap()).toBe(state0);
    expect(await page.evaluate(() => JSON.stringify(playerHeld)), '손을 떼면 이동 입력도 풀림').toBe('{"up":false,"down":false,"left":false,"right":false}');
    // walking with the stick pushed, then the action button
    await emptySpot(); before = await acts();
    await touch('touchStart', [{ ...S, id: 1 }]); await touch('touchMove', [{ x: S.x + 40, y: S.y, id: 1 }]);
    await expect.poll(() => page.evaluate(() => playerHeld.right)).toBe(true);
    await touch('touchStart', [{ x: S.x + 40, y: S.y, id: 1 }, { ...A, id: 2 }]);
    await touch('touchEnd', []);
    await settle();
    expect(await acts() - before, '걷는 중 행동 탭').toBe(1);
    // two fingers on the button itself: one action
    await emptySpot(); before = await acts();
    await touch('touchStart', [{ ...A, id: 1 }]);
    await touch('touchStart', [{ ...A, id: 1 }, { x: A.x + 12, y: A.y + 12, id: 2 }]);
    await touch('touchEnd', []);
    await settle();
    expect(await acts() - before, '버튼 위 두 손가락').toBe(1);
    expect(await clicks()).toEqual([]);
  });

  for (const walking of [false, true]) for (const actionFirst of [true, false]) {
    const mode = walking ? 'walking' : 'panel', order = actionFirst ? 'action-first' : 'stick-first';
    await qa.step(`03-release-${mode}-${order}`, `${walking ? '걷는 중' : '공방 문 앞'}: ${actionFirst ? '행동 → 조이스틱' : '조이스틱 → 행동'} 순서로 개별 해제`, async () => {
      if (walking) await emptySpot(); else await atDoor();
      await clicks(); await page.evaluate(() => { window.__qaTouchEnds = []; });
      const before = await acts(), state0 = await snap();
      const stick = { ...S, id: 1 }, button = { ...A, id: 2 };
      const input = () => page.evaluate(() => ({ held: { ...playerHeld }, active: document.querySelector('#tdStick').classList.contains('is-active') }));
      const idle = { up: false, down: false, left: false, right: false };
      await touch('touchStart', [stick]);
      if (walking) { stick.x += 40; await touch('touchMove', [stick]); }
      expect(await input(), '누르고 있는 동안의 이동 입력').toEqual({ held: { ...idle, right: walking }, active: true });
      await touch('touchStart', [stick, button]);
      expect(await acts() - before, '아직 행동 손가락을 떼지 않음').toBe(0);
      const first = actionFirst ? button : stick, last = actionFirst ? stick : button;
      await touch('touchEnd', [first]);
      expect(await page.evaluate(() => window.__qaTouchEnds), '다른 손가락은 화면에 남아 있음').toEqual([
        { ended: [first.id], remaining: [last.id], trusted: true },
      ]);
      expect(await acts() - before, '행동 손가락을 뗄 때만 1회').toBe(actionFirst ? 1 : 0);
      expect(await input(), '조이스틱 손가락이 남아 있을 때만 입력 유지').toEqual({ held: { ...idle, right: walking && actionFirst }, active: actionFirst });
      if (!walking) expect(await panelOpen(), '행동 손가락을 뗄 때 패널 열림').toBe(actionFirst);
      await touch('touchEnd', [last]);
      await settle();
      expect(await page.evaluate(() => window.__qaTouchEnds), '각 손가락이 따로 해제됨').toEqual([
        { ended: [first.id], remaining: [last.id], trusted: true }, { ended: [last.id], remaining: [], trusted: true },
      ]);
      expect(await acts() - before, '모든 손을 뗀 뒤 총 행동 1회').toBe(1);
      expect(await input(), '모든 손을 떼면 이동 입력과 조이스틱 표시 해제').toEqual({ held: idle, active: false });
      expect(await clicks(), '후속 click 없음').toEqual([]);
      if (!walking) { expect(await panelOpen()).toBe(true); expect(await snap()).toBe(state0); }
    });
  }

  await qa.step('04-torch', '횃불 버튼: 탭 1회 = 횃불 1개 변화, 조이스틱 유지 중에도, 취소·밖에서 놓기는 0, 마우스·Enter 유지', async () => {
    // a place where the game lets a torch be set down in front of the player (the world differs from village to village)
    const spot = await page.evaluate(() => {
      tdClosePanels();
      const b = state.world.base, p = state.world.player;
      for (let r = 3; r < 30; r += 0.5) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const x = b.x + sx * r, y = b.y + sy * r;
        if (!playerCanStand(x, y) || tdInteractTarget(x, y)) continue;
        Object.assign(p, { x, y, facing: 'down' });
        const ahead = torchSpotAhead();
        if (!torchPlaceProblem(ahead.x, ahead.y) && torchAtHand() < 0) return { x, y };
      }
      return null;
    });
    expect(spot, '횃불을 놓을 수 있는 자리').not.toBeNull();
    await clicks();
    const change = async (input, expectedCalls = 1) => {
      const n = await torches(), before = await torchCalls(); await input(); await settle();
      expect(await torchCalls() - before, '입력당 tdTorchNow 실행 횟수').toBe(expectedCalls);
      return Math.abs(await torches() - n);
    };
    expect(await change(() => page.locator('#tdTorch').tap()), '탭 1회(놓기)').toBe(1);
    expect(await change(() => page.locator('#tdTorch').tap()), '탭 1회(거두기)').toBe(1);
    expect(await change(async () => {
      await touch('touchStart', [{ ...S, id: 1 }]);
      await touch('touchStart', [{ ...S, id: 1 }, { ...T, id: 2 }]);
      await touch('touchEnd', []);
    }), '조이스틱을 누른 채 횃불 탭').toBe(1);
    expect(await change(async () => { await touch('touchStart', [{ ...T, id: 3 }]); await touch('touchCancel', []); }, 0), '터치 취소').toBe(0);
    expect(await change(async () => {
      await touch('touchStart', [{ ...T, id: 4 }]); await touch('touchMove', [{ x: T.x - 160, y: T.y - 160, id: 4 }]); await touch('touchEnd', []);
    }, 0), '버튼 밖으로 밀고 놓기').toBe(0);
    expect(await clicks(), '터치에서는 click이 나오지 않음').toEqual([]);
    expect(await change(() => page.mouse.click(T.x, T.y)), '터치 뒤 마우스 클릭').toBe(1);
    expect(await change(async () => { await page.locator('#tdTorch').focus(); await page.keyboard.press('Enter'); }), '터치 뒤 Enter').toBe(1);
    expect((await clicks()).map(c => c.target), '마우스·키보드 click은 횃불 버튼에').toEqual(['#tdTorch', '#tdTorch']);
  });

  await qa.step('05-decor', '장식 버튼(표시는 fixture): 탭 1회 = 다음 장식 1번 바뀜, 조이스틱 유지 중에도', async () => {
    await emptySpot();
    // the button shows only at the garden; here it is shown in its "next kind" mode by fixture, its action is the game's own
    await page.evaluate(() => { window.tdGardenButtonMode = () => 'cycle'; });
    await expect(page.locator('#tdDecor')).toBeVisible();
    const D = await center('#tdDecor');
    const kinds = await page.evaluate(() => { const first = villageDecorNext(), seq = [first]; for (;;) { villageDecorCycle(); const k = villageDecorNext(); if (k === first) break; seq.push(k); } return seq; });
    expect(kinds.length, '장식 종류가 2개 이상').toBeGreaterThan(1);
    const steps = async (input) => { const from = kinds.indexOf(await page.evaluate(() => villageDecorNext())); await input(); await settle();
      return (kinds.indexOf(await page.evaluate(() => villageDecorNext())) - from + kinds.length) % kinds.length; };
    await clicks();
    expect(await steps(() => page.locator('#tdDecor').tap()), '탭 1회').toBe(1);
    expect(await steps(async () => {
      await touch('touchStart', [{ ...S, id: 1 }]);
      await touch('touchStart', [{ ...S, id: 1 }, { ...D, id: 2 }]);
      await touch('touchEnd', []);
    }), '조이스틱을 누른 채 탭').toBe(1);
    expect(await clicks()).toEqual([]);
    expect(await steps(() => page.mouse.click(D.x, D.y)), '마우스 클릭').toBe(1);
    await page.evaluate(() => { delete window.tdGardenButtonMode; });
  });

  await qa.step('06-pen', '펜으로 "열기": 행동 1회, click은 행동 버튼에만, 게임 상태 불변', async () => {
    await page.evaluate(() => { const p = document.querySelector('#tab-dev'); p.scrollTop = 180; });
    await atDoor(); await clicks();
    const before = await snap(), actsBefore = await acts();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: A.x, y: A.y, button: 'left', clickCount: 1, pointerType: 'pen' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: A.x, y: A.y, button: 'left', clickCount: 1, pointerType: 'pen' });
    await expect.poll(panelOpen).toBe(true);
    await settle();
    expect(await acts() - actsBefore).toBe(1);
    expect((await clicks()).map(c => c.target + '/' + c.pointerType), '펜의 click은 눌렀던 버튼으로 감').toEqual(['#tdAction/pen']);
    expect(await snap()).toBe(before);
  });

  await qa.step('07-click-without-pointerType', 'PointerEvent가 아닌 click(합성 이벤트로 흉내): 같은 탭의 click은 건너뛰고, 그 뒤 마우스·키보드 click은 실행', async () => {
    // Synthetic: this Chromium always sends click as a PointerEvent, so the other kind is dispatched by hand here.
    await emptySpot();
    const run = (events) => page.evaluate((events) => {
      const b = document.getElementById('tdAction'), r = b.getBoundingClientRect(), at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true };
      const n = window.__qaActs;
      for (const [type, o] of events) b.dispatchEvent(type === 'click' ? new MouseEvent('click', { ...at, ...o }) : new PointerEvent(type, { ...at, ...o }));
      return window.__qaActs - n;
    }, events);
    const tap = [['pointerdown', { pointerType: 'touch', pointerId: 71, isPrimary: true }], ['pointerup', { pointerType: 'touch', pointerId: 71, isPrimary: true }]];
    expect(await run([...tap, ['click', { detail: 1 }]]), '탭 + 그 탭의 click').toBe(1);
    expect(await run([...tap, ['pointerdown', { pointerType: 'mouse', pointerId: 1 }], ['click', { detail: 1 }]]), 'click 없는 탭 뒤의 마우스 click').toBe(2);
    expect(await run([...tap, ['click', { detail: 0 }]]), 'click 없는 탭 뒤의 키보드 click(detail 0)').toBe(2);
    // a real touch tap (no click reaches the button), then a mouse click that is not a PointerEvent
    await page.locator('#tdAction').tap(); await settle();
    expect(await run([['pointerdown', { pointerType: 'mouse', pointerId: 1 }], ['click', { detail: 1 }]]), '실제 탭 뒤의 마우스 click').toBe(1);
  });
});
