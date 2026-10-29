// =============================================================================
// Task 19: the 256 test world's worker route search on slow machines. The step
// between two cells is checked once and shared by every search (dropped when the
// obstacle index is rebuilt), and the search's time each frame follows the frame
// time (2 ms at 60 fps, up to 6 ms when frames are slow). Routes, walking speed and
// arrival are unchanged. (17.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
const NAV_TRIAL = { url: 'https://example.test/?worldgen=256', saveKey: 'gachaFactorySave.worldgen256.v1', fullWorld: true };
// a test world from the mid-game save: seed 7, generator v1, the north iron vein secured
function navWorld(storage) {
  const s = storage || makeMemoryStorage();
  if (!storage) {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v1_midgame.json'), 'utf8'));
    Object.assign(p.run.world, { seed: 7, size: 256, generatorVersion: 1, chunkEditsVersion: 1, chunkEdits: {} });
    s.setItem(NAV_TRIAL.saveKey, JSON.stringify(p));
  }
  const win = newDom(s, NAV_TRIAL).window;
  win.worldEnsureRect({ minX: -32, maxX: 31, minY: -32, maxY: 31 });
  const mine = win.state.world.mines.find((m) => m.id.startsWith('gen:') && m.resource === 'iron' && m.y <= -19 && Math.abs(m.x) < 8);
  return { win, storage: s, mine };
}
// runs one search to the end, counting the step checks it makes
function navSearch(win, from, to) {
  const real = win.worldNavClear;
  let checks = 0;
  win.worldNavClear = (a, b) => { checks++; return real(a, b); };
  try {
    const job = win.worldNavStart(from, to);
    for (let i = 0; i < 100000 && !job.done; i++) win.worldNavAdvance(job, 256, Infinity);
    return { path: job.path, checks, done: job.done };
  } finally { win.worldNavClear = real; }
}

(function test_nav_sharedStepChecks() {
  const { win, mine } = navWorld();
  const from = { x: win.state.world.base.x, y: win.state.world.base.y + 0.08 }, to = { x: mine.x + 0.42, y: mine.y + 0.08 };
  const first = navSearch(win, from, to), again = navSearch(win, from, to);
  check('Task19: the long search to the north vein finds its route', !!first.path && first.path.length > 2 && first.checks > 1000, String(first.checks));
  // (the two checks left are the start and goal anchors, worldNavAnchor, which are not shared)
  check('Task19: the same search again finds the same route without checking a step twice', JSON.stringify(again.path) === JSON.stringify(first.path) && again.checks <= 2, String(again.checks));
  const other = navSearch(win, { x: from.x + 0.1, y: from.y }, { x: mine.x - 0.42, y: mine.y + 0.08 });
  check('Task19: a second worker to the same vein reuses most of the checks', !!other.path && other.checks < first.checks * 0.7, other.checks + ' vs ' + first.checks);
  check('Task19: every point of the route is standable ground', first.path.every((p) => win.playerCanStand(p.x, p.y)));
})();

(function test_nav_checksDroppedWhenTheWorldChanges() {
  const { win, mine } = navWorld();
  const from = { x: win.state.world.base.x, y: win.state.world.base.y + 0.08 }, to = { x: mine.x + 0.42, y: mine.y + 0.08 };
  const first = navSearch(win, from, to);
  // a craft hut put down on the route (as building one does): the index is rebuilt, the shared checks are dropped
  const mid = first.path[Math.floor(first.path.length / 2)];
  win.state.world.workshops.push({ id: 'nav-test-hut', x: Math.round(mid.x), y: Math.round(mid.y) });
  const after = navSearch(win, from, to);
  check('Task19: after the world changes the steps are checked again', after.checks > 1000, String(after.checks));
  check('Task19: the new route goes round the new hut (standable all along)', !!after.path && JSON.stringify(after.path) !== JSON.stringify(first.path) && after.path.every((p) => win.playerCanStand(p.x, p.y)));
  for (let i = 1; i < after.path.length; i++) if (!win.worldNavClear(after.path[i - 1], after.path[i])) { check('Task19: every leg of the new route is clear', false, JSON.stringify([after.path[i - 1], after.path[i]])); return; }
  check('Task19: every leg of the new route is clear', true);
})();

(function test_nav_budgetFollowsTheFrameTime() {
  const { win } = navWorld();
  // the clock held still for the frame, so the deadline is exactly the search time it was given
  const perf = win.performance, realNow = perf.now;
  const at = (dt) => { Object.defineProperty(perf, 'now', { value: () => 1000, configurable: true }); try { win.TD.navBudget = -1; win.tdWorkerSimStep(dt, 1000); return +(win.TD.navDeadline - 1000).toFixed(3); } finally { Object.defineProperty(perf, 'now', { value: realNow, configurable: true }); } };
  const first = at(0), fast = at(16.7), slow = at(133), stall = at(5000);
  check('Task19: the first frame and a 60 fps frame keep the 2 ms search time', first === 2 && Math.abs(fast - 2.004) < 1e-9, JSON.stringify({ first, fast }));
  check('Task19: a slow frame (133 ms) gets 12% of it, never more than 6 ms', Math.abs(slow - 6) < 1e-9 && stall === 6 && Math.abs(at(40) - 4.8) < 1e-9, JSON.stringify({ slow, stall }));
  check('Task19: the walking speed is unchanged (1.6 units a second, steps of at most 0.16 a frame)', win.TD_WORKER.WALK_SPEED === 1.6);
})();

(function test_nav_unreachableGoal() {
  const { win } = navWorld();
  // a goal in solid rock: no cell near it can be stood on
  let rock = null;
  for (let y = -30; y <= 30 && !rock; y += 0.5) for (let x = -30; x <= 30 && !rock; x += 0.5) {
    let open = false;
    for (let dy = -0.75; dy <= 0.75 && !open; dy += 0.25) for (let dx = -0.75; dx <= 0.75 && !open; dx += 0.25) if (win.playerCanStand(x + dx, y + dy)) open = true;
    if (!open) rock = { x, y };
  }
  const job = navSearch(win, { x: win.state.world.base.x, y: win.state.world.base.y + 0.08 }, rock);
  check('Task19: a goal in solid rock ends the search with no route (nothing to walk)', !!rock && job.done && job.path === null);
  // a worker sent there waits and asks again later; it is never moved through the rock
  const s = { id: 'nav-rock', x: win.state.world.base.x, y: win.state.world.base.y + 0.08, route: [], delay: 0, mode: 'walk', dir: 'right', walked: 0 };
  const startX = s.x, startY = s.y;
  let starts = 0;
  const realStart = win.worldNavStart;
  win.worldNavStart = (...a) => { starts++; return realStart(...a); };
  try {
    for (let i = 0; i < 40; i++) { win.TD.navBudget = 768; win.TD.navDeadline = win.performance.now() + 6; win.worldWorkerStep(s, { x: rock.x, y: rock.y, mineId: 'rock', dir: 'left' }, 100); }
  } finally { win.worldNavStart = realStart; }
  check('Task19: the worker stays where it can stand and retries about once a second', s.x === startX && s.y === startY && s.mode === 'walk' && starts >= 2 && starts <= 6, JSON.stringify({ starts, x: s.x, y: s.y }));
})();

(function test_nav_workersAfterReload() {
  const first = navWorld();
  first.win.state.world.mines.forEach((m) => { m.developmentState = 'unsecured'; });
  first.win.discoverMine(first.mine.id); first.mine.developmentState = 'secured'; first.win.recordGeneratedMineEdit(first.mine.id);
  const c0 = first.win.state.characters[0];
  first.win.state.characters = Array.from({ length: 5 }, (_, i) => ({ ...c0, id: 'nav-' + i, resource: 'iron' }));
  check('Task19: the test world saves the workers and the secured vein', first.win.saveGame() === true);
  const { win, mine } = navWorld(first.storage);
  Object.assign(win.state.world.player, { x: 2, y: 2 });
  win.tdWorkerSimReset();
  const placements = win.tdWorkerPlacements();
  let bad = 0, fast = 0, frame = 0;
  for (; frame < 3000; frame++) {
    const before = Object.values(win.TD.workerSim.byId).map((s) => ({ id: s.id, x: s.x, y: s.y }));
    win.tdWorkerSimStep(100, frame * 100);
    const states = Object.values(win.TD.workerSim.byId);
    states.forEach((s) => {
      if (!s.hidden && !win.playerCanStand(s.x, s.y)) bad++;
      const p = before.find((b) => b.id === s.id);
      if (p && Math.hypot(s.x - p.x, s.y - p.y) > 0.160001) fast++;
    });
    if (states.length === 5 && states.every((s) => s.mode === 'work')) break;
  }
  const states = Object.values(win.TD.workerSim.byId);
  check('Task19: after a reload all 5 workers walk to the secured vein and start work', placements.every((p) => p.mineId === mine.id) && states.length === 5 && states.every((s) => s.mode === 'work'), 'frames ' + frame);
  check('Task19: ...through open ground only, at walking speed, with no teleport', bad === 0 && fast === 0 && states.every((s) => s.snaps === 0), JSON.stringify({ bad, fast }));
  check('Task19: ...and each stands on its own spot by the vein', states.every((s) => { const p = placements.find((q) => q.id === s.id); return Math.hypot(s.x - p.x, s.y - p.y) < 0.02; }));
})();
