'use strict';
const { test, expect } = require('./fixtures.cjs');
const { holdDirection, walkToMine } = require('./navigation.cjs');
const { commitReady } = require('./save-wait.cjs');

test('무주입: 새 마을부터 채굴·판매·첫 인부·저장·재접속·복원 사본', async ({ page, qa }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  let villageId, manual, autosave, workerChange;
  await qa.step('01-new-village', '첫 실행 및 UI로 새 마을 생성', async () => {
    await qa.boot();
    expect(await page.evaluate(() => state.gold)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('gachaFactorySave'))).toBeNull();
    await qa.press('#s2Open');
    await page.locator('[data-s2-name]').fill('자동 플레이 ' + testInfo.project.name);
    await qa.press('[data-s2-new]');
    await page.waitForFunction(() => S2Runtime.session?.name.startsWith('자동 플레이 ') && !S2Runtime.transitioning && S2Runtime.canPlay());
    villageId = await page.evaluate(() => S2Runtime.session.id);
  });
  await qa.step('02-collision', '키보드/터치 이동과 공방 벽 충돌', async () => {
    await holdDirection(page, 'up', mobile, () => page.waitForFunction(() => state.world.player.facing === 'up' && state.world.player.pose === 'idle' && playerHeld.up));
    const at = await page.evaluate(() => ({ p: { ...state.world.player }, b: { ...state.world.base } }));
    expect(at.p.y).toBeGreaterThanOrEqual(at.b.y - 0.041);
    expect(at.p.y).toBeLessThan(at.b.y + 0.001);
    expect(at.p.x).toBeCloseTo(at.b.x, 2);
    await holdDirection(page, 'down', mobile, () => page.waitForFunction(() => state.world.player.y > state.world.base.y + 0.7));
    expect(await page.evaluate(() => playerCanStand(state.world.player.x, state.world.player.y))).toBe(true);
  });
  await qa.step('03-proximity-mine', '광맥까지 실제 이동 후 근접 채굴', async () => {
    await walkToMine(page, 'mine_start_iron', mobile);
    if (await page.evaluate(() => mineById('mine_start_iron').developmentState !== 'secured')) {
      if (mobile) await qa.press('#tdAction'); else await page.keyboard.press('e');
      await page.waitForFunction(() => mineById('mine_start_iron').developmentState === 'secured');
    }
    const before = await page.evaluate(() => state.resources.iron);
    if (mobile) await qa.press('#tdAction'); else await page.keyboard.press('e');
    await expect.poll(() => page.evaluate(() => state.resources.iron)).toBeGreaterThan(before);
  });
  await qa.step('04-harvest', '채굴 패널의 철광석·석탄 수집', async () => {
    await qa.tab('mining');
    for (const resource of ['iron', 'coal']) {
      const id = 'mine_start_' + resource;
      if (await page.locator(`[data-secure-mine="${id}"]`).isEnabled()) await qa.press(`[data-secure-mine="${id}"]`);
      const target = resource === 'iron' ? 22 : 11;
      for (let attempts = 0; await page.evaluate(k => state.resources[k], resource) < target; attempts++) {
        expect(attempts, '반복 채굴 상한').toBeLessThan(30);
        await qa.press(`[data-mine-mine="${id}"]`);
      }
    }
  });
  await qa.step('05-craft-sell', '강철 10개 실제 제작·판매로 50G 달성', async () => {
    await qa.tab('dev');
    for (let i = 0; i < 10; i++) await qa.press('[data-craft="steel"]');
    expect(await page.evaluate(() => state.products.steel)).toBe(10);
    // UX-01: selling lives in the closed 「판매 · 자동화 설정」; open it with real input (no forced click on a hidden button)
    const more = page.locator('[data-recipe-more="steel"]');
    await expect(more).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-sell="steel"]')).toBeHidden();
    await expect(page.locator('[data-recipe-sell-hint="steel"]')).toBeVisible();
    if (mobile) await qa.press('[data-recipe-summary="steel"]');
    else {
      // keyboard: Space on the summary opens it and does not act in the world
      // count world actions (the game's own tdInteractNow, called by the Space/E handler) around the key press
      const player = await page.evaluate(() => { window.__qaActs = 0; window.__qaAct = tdInteractNow; window.tdInteractNow = (...a) => { window.__qaActs++; return window.__qaAct(...a); }; return JSON.stringify(state.world.player); });
      await page.locator('[data-recipe-summary="steel"]').focus();
      await page.keyboard.press('Space');
      expect(await page.evaluate(() => { const n = window.__qaActs; window.tdInteractNow = window.__qaAct; return n; }), 'Space on the summary must not act in the world').toBe(0);
      expect(await page.evaluate(() => JSON.stringify(state.world.player))).toBe(player);
    }
    await expect(more).toHaveAttribute('open', '');
    await expect(page.locator('[data-sell="steel"]')).toBeVisible();
    await qa.audit('제작 카드 상세');
    await qa.press('[data-sell="steel"]');
    await expect.poll(() => page.evaluate(() => state.gold)).toBe(50);
    expect(await page.evaluate(() => state.products.steel)).toBe(0);
  });
  await qa.step('06-first-worker', '첫 가챠권으로 인부 모집·배치', async () => {
    await qa.tab('workers');
    await qa.press('#gachaTicketBtn');
    await expect(page.locator('[data-reassign]')).toHaveCount(1);
    const assigned = await page.locator('[data-reassign]').inputValue();
    const next = assigned === 'iron' ? 'coal' : 'iron';
    await page.locator('[data-reassign]').selectOption(next);
    expect(await page.evaluate(() => state.characters[0].resource)).toBe(next);
    // Issue #32 A: what the next autosave must carry, and the revision committed before it (read, never written)
    workerChange = await page.evaluate(async id => ({
      villageId: id, afterRevision: (await S2Runtime.engine.read(id)).revision,
      gold: state.gold, workers: state.characters.length, assignments: state.characters.map(w => w.resource),
    }), villageId);
    expect(workerChange).toMatchObject({ gold: 50, workers: 1, assignments: [next] });
    await qa.audit('인부 패널');
  });
  await qa.step('07-autosave', '실제 자동 저장 타이머의 IndexedDB 커밋 대기', async () => {
    // Issue #32 A: gold===50 alone also matched an OLDER autosave (before the worker), so the refresh could load 0
    // workers. Wait (bounded: the autosave runs every 10 s) for a commit of this village NEWER than the one before
    // the recruit that carries the gold, the worker and its assignment. On timeout the last committed state and
    // the missing parts are printed.
    await expect.poll(async () => commitReady(await page.evaluate(id => S2Runtime.engine.read(id), villageId), workerChange),
      { timeout: 25_000, message: '변경 이후 커밋된 자동 저장(인부·배치·골드)' }).toMatchObject({ ready: true, reasons: [] });
    autosave = await page.evaluate(id => S2Runtime.engine.read(id), villageId);
    qa.report.stages.at(-1).committed = commitReady(autosave, workerChange).committed;
    await expect(page.locator('#s2Status')).toContainText('마지막 자동 저장:');
  });
  await qa.step('08-manual-save', '수동 슬롯 1 저장과 자동/수동 구분', async () => {
    await qa.press('#s2Open');
    const section = page.locator('[data-s2-manual-section]');
    if (!(await section.evaluate(el => el.open))) await qa.activate(section.locator('summary'));
    await qa.activate(page.locator('[data-s2-manuals] .s2-row').first().getByRole('button', { name: '여기에 저장', exact: true }));
    await expect(page.locator('[data-s2-manuals] .s2-row').first()).toContainText('자동 플레이');
    manual = await page.evaluate(async () => (await S2Runtime.engine.list()).manual.find(row => row.id === 1));
    expect(manual.snapshot.payload.run.gold).toBe(50);
    const layout = await qa.audit('저장 메뉴');
    expect(layout.scope, '모달 뒤 배경 버튼을 가림 결함으로 오인하지 않음').toBe('s2Menu');
    await qa.press('[data-s2-close]');
  });
  await qa.step('09-refresh', '새로고침 후 최근 마을 이어하기', async () => {
    await page.reload();
    await page.waitForFunction(() => GameBootstrap.state === 'ready');
    await expect(page.locator('[data-s2-recent-label]')).toContainText('자동 플레이');
    await qa.press('[data-s2-recent]');
    await page.waitForFunction(id => S2Runtime.session?.id === id && S2Runtime.canPlay(), villageId);
    expect(await page.evaluate(() => state.gold)).toBe(50);
    expect(await page.evaluate(() => state.characters.length)).toBe(1);
    expect(await page.evaluate(() => state.characters.map(w => w.resource))).toEqual(workerChange.assignments);
  });
  await qa.step('10-copy-restore', '수동 저장을 새 사본으로 복원·원본 두 종류 보존', async () => {
    await qa.press('#s2Open');
    const section = page.locator('[data-s2-manual-section]');
    if (!(await section.evaluate(el => el.open))) await qa.activate(section.locator('summary'));
    // Capture the committed original immediately before restore; transition flush may update its revision/time.
    const before = await page.evaluate(id => S2Runtime.engine.read(id), villageId);
    qa.confirm();
    await qa.activate(page.locator('[data-s2-manuals] .s2-row').first().getByRole('button', { name: '사본으로 이어하기', exact: true }));
    await page.waitForFunction(id => S2Runtime.session?.id !== id && S2Runtime.session?.name.includes('복원 사본') && S2Runtime.canPlay(), villageId);
    const preserved = await page.evaluate(async id => ({ original: await S2Runtime.engine.read(id), manual: (await S2Runtime.engine.list()).manual.find(row => row.id === 1), copy: S2Runtime.session.id, gold: state.gold }), villageId);
    expect(preserved.copy).not.toBe(villageId);
    expect(preserved.manual).toEqual(manual);
    expect(preserved.original.snapshot.payload.run.gold).toBe(before.snapshot.payload.run.gold);
    expect(preserved.original.snapshot.payload.run.characters).toEqual(before.snapshot.payload.run.characters);
    expect(preserved.original.revision).toBeGreaterThanOrEqual(autosave.revision);
    expect(preserved.gold).toBe(manual.snapshot.payload.run.gold);
  });
});
