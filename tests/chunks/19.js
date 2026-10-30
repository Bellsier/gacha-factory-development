// =============================================================================
// Task 22: the drawing resolution on slow screens (render.js tdRenderScaleStep) and the corner slip
// round rock (player.js worldStepFoot). (19.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
(function test_renderDivisors() {
  const win = newDom(makeMemoryStorage()).window;
  const d = (native, zoom) => JSON.stringify(win.tdRenderDivisors(native, zoom));
  check('Task22: a ratio-3 phone at zoom 2 can draw at 3, 1.5 or 1 (an art pixel stays 6, 3 or 2 canvas pixels)', d(3, 2) === '[1,2,3]');
  check('Task22: at zoom 1 only the whole divisor 3 keeps art pixels whole (1.5 would not)', d(3, 1) === '[1,3]');
  check('Task22: a ratio-2 screen can halve; a ratio-1 screen (most PCs) never changes', d(2, 3) === '[1,2]' && d(1, 3) === '[1]');
  check('Task22: an uneven ratio (2.625) is left as it is', d(2.625, 2) === '[1]');
})();

(function test_renderScaleSteps() {
  const win = newDom(makeMemoryStorage()).window, TD = win.TD;
  Object.defineProperty(win, 'devicePixelRatio', { value: 3, configurable: true });
  TD.view = { w: 390, h: 844, zoom: 2, dpr: 3 };
  TD.frames = 100;
  const step = (now, ms) => { const changed = win.tdRenderScaleStep(now, ms); TD.frames += 100; return changed; };
  const k = () => TD.resStep.k;
  step(0, 30);
  check('Task22: fast enough frames (30 ms) keep the full resolution', k() === 1);
  check('Task22: slow frames (130 ms) step down one divisor', step(1000, 130) && k() === 2);
  check('Task22: no other change for a while after one (no flicker back and forth)', !step(2000, 130) && k() === 2);
  check('Task22: still slow after the hold: one more step down', step(6000, 130) && k() === 3);
  check('Task22: fast at the small size is not enough to go back if the finer size would be slow again (pixels x 2.25)', !step(11000, 15) && k() === 3);
  check('Task22: very fast at the small size goes back up one step', step(16000, 8) && k() === 2);
  check('Task22: at most 3 changes in a session', !step(21000, 130) && k() === 2 && TD.resStep.changes === 3);
})();

(function test_renderScaleResize() {
  // the canvas is drawn at ratio / k, the view keeps its CSS size
  const win = newDom(makeMemoryStorage()).window, TD = win.TD;
  Object.defineProperty(win, 'devicePixelRatio', { value: 3, configurable: true });
  const c = win.document.createElement('canvas');
  Object.defineProperty(c, 'clientWidth', { value: 390 }); Object.defineProperty(c, 'clientHeight', { value: 844 });
  const real = TD.canvas; TD.canvas = c;
  try {
    TD.resStep = { k: 1, at: 0, frame: 0, changes: 0 }; win.tdResize();
    const full = [c.width, c.height, TD.view.dpr, TD.view.div];
    TD.resStep.k = 2; win.tdResize();
    const half = [c.width, c.height, TD.view.dpr, TD.view.div, TD.view.w, TD.view.h, TD.view.zoom];
    check('Task22: full resolution: 1170 x 2532 canvas pixels at ratio 3', JSON.stringify(full) === '[1170,2532,3,1]', JSON.stringify(full));
    check('Task22: divisor 2: 585 x 1266 canvas pixels drawn at ratio 1.5, the view still 390 x 844 at zoom 2', JSON.stringify(half) === '[585,1266,1.5,2,390,844,2]', JSON.stringify(half));
  } finally { TD.canvas = real; }
})();

// The 256 test world, seed 1682025673 / generator v2: a gap in the rock one cell wide north of
// (-19.23, 21.56). Task 20's walk got stuck here: 0.1 off the gap's centre, walking north stopped dead.
function slipWorld() {
  const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v1_midgame.json'), 'utf8'));
  Object.assign(p.run.world, { seed: 1682025673, size: 256, generatorVersion: 2, chunkEditsVersion: 1, chunkEdits: {} });
  const s = makeMemoryStorage(); s.setItem('gachaFactorySave.worldgen256.v1', JSON.stringify(p));
  const win = newDom(s, { url: 'https://example.test/?worldgen=256', saveKey: 'gachaFactorySave.worldgen256.v1', fullWorld: true }).window;
  win.worldEnsureRect({ minX: -24, maxX: -14, minY: 16, maxY: 26 });
  return win;
}
(function test_rockCornerSlip() {
  const win = slipWorld(), p = win.state.world.player;
  Object.assign(p, { x: -19.23, y: 21.56 });
  const startOk = win.playerCanStand(p.x, p.y);
  let bad = 0, maxSide = 0;
  win.setPlayerHeld('up', true);
  for (let i = 0; i < 12; i++) { const x0 = p.x; win.tickPlayer(); if (!win.playerCanStand(p.x, p.y)) bad++; maxSide = Math.max(maxSide, Math.abs(p.x - x0)); }
  win.clearPlayerHeld();
  check('Task22: walking north 0.1 off a one-cell gap in the rock, the player slips into it and walks through', startOk && p.y < 20.2, JSON.stringify({ x: p.x, y: p.y }));
  check('Task22: ...on standable ground all the way, side steps no larger than CORNER_SLIP (0.18)', bad === 0 && maxSide <= 0.18 + 1e-9, JSON.stringify({ bad, maxSide }));
})();

(function test_rockSlipNeverThrough() {
  // random walking round the gap and the rock next to it: never off standable ground, never a jump
  const win = slipWorld(), p = win.state.world.player;
  let r = 22; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const dirs = [['up'], ['down'], ['left'], ['right'], ['up', 'left'], ['up', 'right'], ['down', 'left'], ['down', 'right']];
  Object.assign(p, { x: -19.23, y: 21.56 });
  let bad = 0, jumps = 0;
  for (let i = 0; i < 3000; i++) {
    if (i % 8 === 0) { win.clearPlayerHeld(); dirs[Math.floor(rnd() * 8)].forEach((d) => win.setPlayerHeld(d, true)); }
    const x0 = p.x, y0 = p.y; win.tickPlayer();
    if (!win.playerCanStand(p.x, p.y)) bad++;
    if (Math.hypot(p.x - x0, p.y - y0) > 0.3 * Math.SQRT2 + 0.18 + 1e-9) jumps++;
  }
  win.clearPlayerHeld();
  check('Task22: 3000 random steps round the rock gap: never on rock, never more than a step (plus the slip)', bad === 0 && jumps === 0, JSON.stringify({ bad, jumps }));
})();
