(function test_T27_freshWorldDefaults() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task27: fresh run has world state', !!win.state.world);
  // Task 62: the base now starts at (2,0) in the base-centred world, not at the origin.
  check('Task27: base starts at the new-game base position (2,0)', win.state.world.base.x === 2 && win.state.world.base.y === 0);
  check('Task27: base starts at level 1', win.state.world.base.level === 1);
  check('Task27: fresh world has the seeded starting mines', Array.isArray(win.state.world.mines) && win.state.world.mines.length === 2);
})();

(function test_T27_sanitizeValidMineAndIds() {
  const win = newDom(makeMemoryStorage()).window;
  const world = win.sanitizeWorldState({
    base: { x: 4, y: 7, level: 3 },
    mines: [
      { id: 'mine_iron_1', x: 8, y: 2, resource: 'iron', grade: 2, miningPower: 4, developmentState: 'secured' },
      { x: 12, y: 5, resource: 'coal', grade: 1, miningPower: 2, developmentState: 'unsecured' },
      { id: 'mine_iron_1', x: 14, y: 6, resource: 'iron', grade: 3, miningPower: 6, developmentState: 'secured' },
    ],
  });
  check('Task27: valid base fields survive sanitization', world.base.x === 4 && world.base.y === 7 && world.base.level === 3);
  check('Task27: valid mine data survives sanitization', world.mines[0].resource === 'iron' && world.mines[0].grade === 2 && world.mines[0].miningPower === 4 && world.mines[0].developmentState === 'secured');
  check('Task27: mine without an id receives an id', typeof world.mines[1].id === 'string' && world.mines[1].id.length > 0);
  check('Task27: duplicate mine ids are replaced', world.mines[2].id !== 'mine_iron_1');
  check('Task27: sanitized mine ids are unique', new Set(world.mines.map(m => m.id)).size === 3);
})();

(function test_T27_invalidMineFieldsFallbackIndependently() {
  const win = newDom(makeMemoryStorage()).window;
  const world = win.sanitizeWorldState({
    base: { x: -1, y: 1.5, level: 0 },
    mines: [{
      id: 'mine_bad',
      x: -3,
      y: 2.5,
      resource: 'missing_resource',
      grade: 0,
      miningPower: -5,
      developmentState: 'mining',
    }],
  });
  const mine = world.mines[0];
  // Task 62: negative world coords are valid now (x:-1 / x:-3 are kept); non-integers still fall back.
  check('Task27: invalid base fields fall back independently', world.base.x === -1 && world.base.y === 0 && world.base.level === 1);
  check('Task27: invalid mine position falls back independently', mine.x === -3 && mine.y === 0);
  check('Task27: invalid mine resource falls back to a real resource', win.RESOURCES.some(r => r.key === mine.resource));
  check('Task27: invalid mine grade falls back to 1', mine.grade === 1);
  check('Task27: invalid mine power falls back to 1', mine.miningPower === 1);
  check('Task27: invalid development state falls back to unsecured', mine.developmentState === 'unsecured');
})();

(function test_T27_legacySaveAndRoundTrip() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const legacyPayload = {
    saveVersion: 1,
    savedAt: Date.now(),
    permanent: { totalPrestige: 0, runCount: 1, tickets: 0, firstGachaGranted: false },
    run: { resources: { iron: 7 } },
  };
  storage._setRaw('gachaFactorySave', JSON.stringify(legacyPayload));
  const legacy = win.loadGame();
  check('Task27: legacy save without world still loads', legacy.ok === true);
  check('Task27: legacy save receives fresh world defaults', legacy.ok === true && legacy.run.world.base.level === 1 && legacy.run.world.mines.length === 14 /* Task 64: starters + distance rings (5+4+3+2) */ && legacy.run.world.mines.some(m => m.id === 'mine_start_iron') && legacy.run.world.mines.some(m => m.id === 'mine_start_coal'));

  win.state.world = {
    base: { x: 6, y: 9, level: 2 },
    mines: [{ id: 'mine_roundtrip', x: 10, y: 11, resource: 'iron', grade: 3, miningPower: 8, developmentState: 'secured' }],
  };
  check('Task27: save still uses saveVersion 1', (() => { win.saveGame(); return JSON.parse(storage.getItem('gachaFactorySave')).saveVersion === 1; })());

  const loaded = win.loadGame();
  check('Task27: world survives save/load', loaded.ok === true && loaded.run.world.base.level === 2 && loaded.run.world.mines[0].id === 'mine_roundtrip');
  check('Task27: mine values survive save/load', loaded.ok === true && loaded.run.world.mines[0].resource === 'iron' && loaded.run.world.mines[0].grade === 3 && loaded.run.world.mines[0].miningPower === 8 && loaded.run.world.mines[0].developmentState === 'secured');
})();

(function test_T28_addMineValidAndIdGeneration() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({
    x: 3, y: 5, resource: 'iron', grade: 2, miningPower: 4, developmentState: 'unsecured'
  });
  check('Task28: valid mine is added', !!mine && win.state.world.mines.includes(mine) && win.state.world.mines.length === 3);
  check('Task28: mine keeps its gameplay data', mine.x === 3 && mine.y === 5 && mine.resource === 'iron' && mine.grade === 2 && mine.miningPower === 4 && mine.developmentState === 'unsecured');
  check('Task28: mine receives generated id', typeof mine.id === 'string' && mine.id.startsWith('mine_'));
})();

(function test_T28_addMineKeepsUniqueProvidedId() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({
    id: 'mine_custom', x: -5, y: 5, resource: 'coal', grade: 1, miningPower: 2, developmentState: 'secured' // Task 64: away from the random starter cells (2..3 from the base)
  });
  check('Task28: valid provided mine id is preserved', mine && mine.id === 'mine_custom');
})();

(function test_T28_addMineRejectsInvalidAndDuplicateCoordinates() {
  const win = newDom(makeMemoryStorage()).window;
  const original = {
    id: 'mine_first', x: 4, y: 4, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured'
  };
  check('Task28: first mine is accepted', !!win.addMine(original));

  const before = JSON.stringify(win.state.world.mines);
  check('Task28: duplicate coordinates are rejected', win.addMine({
    x: 4, y: 4, resource: 'coal', grade: 2, miningPower: 2, developmentState: 'secured'
  }) === null);
  check('Task28: duplicate coordinate rejection does not mutate state', JSON.stringify(win.state.world.mines) === before);

  const invalidCases = [
    { x: Number.NaN, y: 1, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' }, // Task 62: negative coords are valid now; NaN is not
    { x: 1.5, y: 2, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { x: 2, y: 2, resource: 'missing', grade: 1, miningPower: 1, developmentState: 'unsecured' },
    { x: 2, y: 3, resource: 'iron', grade: 0, miningPower: 1, developmentState: 'unsecured' },
    { x: 2, y: 4, resource: 'iron', grade: 1, miningPower: 0, developmentState: 'unsecured' },
    { x: 2, y: 5, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unknown' },
  ];
  invalidCases.forEach((raw, index) => {
    const beforeInvalid = JSON.stringify(win.state.world.mines);
    check('Task28: invalid mine is rejected #' + (index + 1), win.addMine(raw) === null);
    check('Task28: invalid mine leaves state unchanged #' + (index + 1), JSON.stringify(win.state.world.mines) === beforeInvalid);
  });
})();

(function test_T28_addMineHandlesIdCollisionWithoutReplacingMine() {
  const win = newDom(makeMemoryStorage()).window;
  const first = win.addMine({
    id: 'mine_same', x: 6, y: 6, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured'
  });
  const second = win.addMine({
    id: 'mine_same', x: 7, y: 6, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'secured'
  });
  check('Task28: first mine keeps requested id', first && first.id === 'mine_same');
  check('Task28: second mine is added despite id collision', !!second && win.state.world.mines.length === 4);
  check('Task28: colliding id is replaced with a generated id', second && second.id !== 'mine_same' && second.id.startsWith('mine_'));
})();

(function test_T30_secureMine() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({ id:'mine_secure', x:5, y:5, resource:'iron', grade:1, miningPower:1, developmentState:'unsecured' });
  check('Task30: unsecured mine is created', !!mine && mine.developmentState === 'unsecured');
  check('Task30: secureMine transitions mine to secured', win.secureMine('mine_secure') === true && win.state.world.mines.find(m => m.id === 'mine_secure').developmentState === 'secured');
  check('Task30: securing an already secured mine is rejected', win.secureMine('mine_secure') === false);
  check('Task30: invalid mine id is rejected', win.secureMine('missing') === false && win.secureMine('') === false);
  check('Task30: failed securing leaves mine state unchanged', win.state.world.mines.find(m => m.id === 'mine_secure').developmentState === 'secured');
})();
// =============================================================================
// TASK 31 — Manual mining.
// =============================================================================
(function test_T31_mineMine() {
  const win = newDom(makeMemoryStorage()).window;
  const mine = win.addMine({ id:'mine_manual', x:3, y:3, resource:'iron', grade:4, miningPower:2.5, developmentState:'unsecured' });
  check('Task31: unsecured mine cannot be mined', win.mineMine('mine_manual') === false && win.state.resources.iron === 0);
  check('Task31: mine is secured before mining', win.secureMine('mine_manual') === true);
  check('Task31: secured mine can be mined manually', win.mineMine('mine_manual') === true);
  check('Task31: mining adds miningPower to shared resource storage', win.state.resources.iron === 2.5);
  check('Task31: repeated mining accumulates in shared storage', win.mineMine('mine_manual') === true && win.state.resources.iron === 5);
  check('Task31: invalid mine id does not mutate storage', win.mineMine('missing') === false && win.state.resources.iron === 5);
})();
// =============================================================================
// TASK 32 — World mine UI.
// =============================================================================
(function test_T32_buildMinesUI() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.world.mines.push({ id:'mine_ui', x:8, y:4, resource:'iron', grade:2, miningPower:3, developmentState:'unsecured' });
  win.buildMines();
  const wrap = win.document.getElementById('worldMines');
  check('Task32: world mine panel renders a registered mine', !!wrap.querySelector('[data-secure-mine="mine_ui"]') && wrap.children.length === win.state.world.mines.length);
  check('Task32: unsecured mine shows secure action', !!wrap.querySelector('[data-secure-mine="mine_ui"]'));
  check('Task32: unsecured mine disables mining action', wrap.querySelector('[data-mine-mine="mine_ui"]').disabled === true);
  win.secureMine('mine_ui'); win.buildMines();
  check('Task32: secured mine enables mining action', wrap.querySelector('[data-mine-mine="mine_ui"]').disabled === false);
})();
// =============================================================================
// TASK 33 — Base UI.
// =============================================================================
(function test_T33_renderBaseInfo() {
  const win = newDom(makeMemoryStorage()).window;
  win.state.world.base = { x:12, y:7, level:3 };
  win.renderBaseInfo();
  const wrap = win.document.getElementById('baseInfo');
  check('Task33: base panel renders', wrap.children.length === 1);
  check('Task33: base level is rendered', wrap.textContent.includes('거점 Lv.3'));
  check('Task33: base coordinates are rendered', wrap.textContent.includes('위치 (12, 7)'));
})();


// =============================================================================
// TASK 34 — Starting world mine seed.
// A brand-new run starts with a small, visible pair of unsecured mines so the
// world loop is playable without an external addMine() call.
// =============================================================================
