// =============================================================================
// Task 21: the game clock (main.js tickClock) and the workers' walk on slow frames.
// Game time moves in fixed TICK_MS ticks; a late interval call runs the ticks that are due (at most
// TICK_CLOCK.MAX_PER_CALL a call, the screen updated once), time owed past TICK_CLOCK.MAX_BACKLOG_MS
// is dropped, and a hidden tab stays at one tick a call with no catch-up when it comes back.
// (18.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
// a window whose game clock is driven by hand: its own interval stopped, the tab visible
function clockWin(seed) {
  const storage = makeMemoryStorage();
  if (seed) storage.setItem('gachaFactorySave', seed);
  let r = 0.37;
  const win = newDom(storage, { random: () => { r = (r * 9301 + 49297) % 233280 / 233280; return r; } }).window;
  win.clearInterval(win.__expose.tickTimer());
  let hidden = false;
  Object.defineProperty(win.document, 'hidden', { get: () => hidden, configurable: true });
  const counts = { steps: 0, screens: 0 };
  const step = win.tickStep, nums = win.updateNumbers;
  win.tickStep = function () { counts.steps++; return step.apply(this, arguments); };
  win.updateNumbers = function () { counts.screens++; return nums.apply(this, arguments); };
  return { win, counts, setHidden: (h) => { hidden = h; } };
}
const CLOCK_MID = fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v1_midgame.json'), 'utf8');

(function test_clock_ticksDueByRealTime() {
  const { win, counts } = clockWin(CLOCK_MID);
  const C = win.__expose.TICK_CLOCK();
  const ran = [win.tickClock(1000), win.tickClock(1100), win.tickClock(1199), win.tickClock(1201), win.tickClock(1450), win.tickClock(1500)];
  check('Task21: on time (every 100 ms) the clock runs one tick a call; a call a little early waits', JSON.stringify(ran) === JSON.stringify([1, 1, 0, 1, 2, 1]), JSON.stringify(ran));
  check('Task21: the same number of game ticks as real time allows (6 ticks for 500 ms after the first)', counts.steps === 6, String(counts.steps));
  const before = counts.screens;
  const late = win.tickClock(1500 + 3 * win.TICK_MS);
  check('Task21: a call 300 ms late runs the 3 ticks that are due and updates the screen once', late === 3 && counts.screens - before === 1, JSON.stringify({ late, screens: counts.screens - before }));
  check('Task21: at most MAX_PER_CALL ticks in one call (4)', C.MAX_PER_CALL === 4 && win.tickClock(1800 + 900) === 4);
})();

(function test_clock_stallIsNotReplayed() {
  const { win, counts } = clockWin(CLOCK_MID);
  win.tickClock(0);
  counts.steps = 0;
  // a 30 s stall, then calls at the same moment until nothing is due: only 1 s (10 ticks) is made up
  const runs = [win.tickClock(30000)];
  for (let i = 0; i < 6; i++) runs.push(win.tickClock(30000));
  check('Task21: after a 30 s stall at most 1 s of game time is made up (10 ticks, 4 a call)', counts.steps === 10 && JSON.stringify(runs.slice(0, 4)) === JSON.stringify([4, 4, 2, 0]), JSON.stringify({ steps: counts.steps, runs }));
})();

(function test_clock_hiddenTab() {
  const { win, counts, setHidden } = clockWin(CLOCK_MID);
  win.tickClock(0);
  setHidden(true);
  counts.steps = 0;
  const hiddenRuns = [win.tickClock(1000), win.tickClock(2000), win.tickClock(60000)];
  check('Task21: while the tab is hidden each call is one tick, however long since the last (as before)', JSON.stringify(hiddenRuns) === '[1,1,1]' && counts.steps === 3, JSON.stringify(hiddenRuns));
  setHidden(false);
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  counts.steps = 0;
  const back = [win.tickClock(120000), win.tickClock(120100)];
  check('Task21: back in the tab after a long time away nothing is fast-forwarded (1 tick, then on time)', JSON.stringify(back) === '[1,1]' && counts.steps === 2, JSON.stringify(back));
})();

(function test_clock_sameGameAsSingleTicks() {
  // 12 ticks made up in late calls give the same game as 12 single ticks
  const a = clockWin(CLOCK_MID), b = clockWin(CLOCK_MID);
  for (let i = 0; i < 12; i++) a.win.tickLoop();
  b.win.tickClock(0); // the first call is one tick; then 11 more in three late calls (4 + 4 + 3)
  b.win.tickClock(400); b.win.tickClock(800); b.win.tickClock(1100);
  const pick = (w) => JSON.stringify({ r: w.state.resources, p: w.state.products, g: w.state.gold, q: w.state.craftQueue, ws: w.state.world.workshops, pos: [w.state.world.player.x, w.state.world.player.y], orders: w.state.orders });
  check('Task21: catch-up ticks give exactly the game single ticks give (resources, products, gold, crafts, huts, orders)', b.counts.steps === 12 && pick(a.win) === pick(b.win), String(b.counts.steps));
  // the screen shows the state after the last tick
  const el = b.win.document.querySelector('[data-shared-amt="iron"]');
  check('Task21: after a catch-up call the screen shows the latest amounts', !!el && el.textContent === b.win.fmt(b.win.state.resources.iron));
})();

(function test_clock_playerWalksAtRealSpeed() {
  // holding a key for 1 s of late calls moves the player as far as 10 single ticks
  const a = clockWin(CLOCK_MID), b = clockWin(CLOCK_MID);
  [a.win, b.win].forEach((w) => { Object.assign(w.state.world.player, { x: 2, y: 3 }); w.onPlayerKey({ key: 'ArrowDown', preventDefault() {}, target: w.document.body }, true); });
  for (let i = 0; i < 10; i++) a.win.tickLoop();
  b.win.tickClock(0); // one tick, then 9 more in three late calls
  for (const t of [300, 600, 900]) b.win.tickClock(t);
  const pa = a.win.state.world.player, pb = b.win.state.world.player;
  check('Task21: the player walks the same distance in game time whether the ticks come one by one or caught up', b.counts.steps === 10 && Math.abs(pa.y - pb.y) < 1e-9 && pa.y > 3.5, JSON.stringify({ steps: b.counts.steps, a: pa.y, b: pb.y }));
})();

(function test_workersSlowFrames() {
  // the normal world: one 200 ms frame walks the workers as far as two 100 ms frames; past 250 ms it is capped
  const mk = () => { const w = clockWin(CLOCK_MID).win; w.tdWorkerSimReset(); for (let i = 0; i < 20; i++) w.tdWorkerSimStep(100, i * 100); return w; };
  const a = mk(), b = mk(), c = mk(), d = mk();
  a.tdWorkerSimStep(100, 2100); a.tdWorkerSimStep(100, 2200);
  b.tdWorkerSimStep(200, 2200);
  c.tdWorkerSimStep(250, 2250);
  d.tdWorkerSimStep(5000, 7000);
  const at = (w) => JSON.stringify(Object.values(w.TD.workerSim.byId).map((s) => [s.id, +s.x.toFixed(9), +s.y.toFixed(9), s.mode]));
  check('Task21: a 200 ms frame walks the workers like two 100 ms frames', at(a) === at(b));
  check('Task21: a 5 s stall walks them only 250 ms (as a 250 ms frame), never a jump', at(d) === at(c));
  check('Task21: the walking speed is unchanged (1.6 units a second)', a.TD_WORKER.WALK_SPEED === 1.6 && a.TD_WORKER.FRAME_MAX_MS === 250);
})();
