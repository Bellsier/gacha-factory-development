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
