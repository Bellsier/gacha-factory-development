// Task71 stabilisation (reuses PR #5 c14ac28: the loader's `random` option, Task71's seed 1 and the
// blocked-ring fixture). The first workshop's spot depends on the random start veins through the
// village sites, so these checks fix the layout and say what each fixed layout stands for.
const T71_LCG = (seed) => { let s = seed; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
// A lot next to the base the first workshop may take: open ground, not the base or a vein, and clear of
// the facility sites and the district ground by the same distances the build rule uses.
const t71FreeLots = (win, ring) => {
  const base = win.state.world.base, out = [];
  for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
    const x = base.x + dx, y = base.y + dy;
    if (!win.isCellOpenForMines(x, y) || win.state.world.mines.some((m) => m.x === x && m.y === y)) continue;
    if (win.villageSiteNear(x, y, win.VILLAGE.SITE.WORKSHOP_CLEAR) || win.villageGroundNear(x, y, win.VILLAGE.DISTRICT.BUILD_CLEAR)) continue;
    out.push(x + ',' + y);
  }
  return out;
};
const t71FirstWorkshop = (win) => { win.state.gold = 1e6; win.state.products.steel = 50; win.doResearch('workshopBuild'); return win.buildWorkshop(); };

(function test_T71_fixedLayoutsMeanWhatTheySay() {
  // seed 1 (Task71's layout): a real start — both facilities and the start veins are placed — that leaves a free lot next to the base
  const open = newDom(makeMemoryStorage(), { random: T71_LCG(1) }).window, ob = open.state.world.base;
  check('T71F: the seed-1 layout is reproducible (same facility sites on every load)', JSON.stringify(open.state.village.sites) === JSON.stringify(newDom(makeMemoryStorage(), { random: T71_LCG(1) }).window.state.village.sites));
  check('T71F: the seed-1 layout is a full start (both facilities, start veins)', !!open.state.village.sites.appraiser && !!open.state.village.sites.museum && open.state.world.mines.length >= 2);
  check('T71F: the seed-1 layout leaves a free lot next to the base (the precondition Task71 relies on)', t71FreeLots(open, 1).length > 0, JSON.stringify(t71FreeLots(open, 1)));
  const lots1 = t71FreeLots(open, 1), w1 = t71FirstWorkshop(open);
  check('T71F: with a free lot next to the base the first workshop takes one of those lots', !!w1 && lots1.includes(w1.x + ',' + w1.y) && Math.max(Math.abs(w1.x - ob.x), Math.abs(w1.y - ob.y)) === 1);
  // seed 0: the random start can really block the whole ring (the case that made Task71 flaky)
  const blocked = newDom(makeMemoryStorage(), { random: T71_LCG(0) }).window, bb = blocked.state.world.base;
  check('T71F: the seed-0 layout leaves no free lot next to the base', t71FreeLots(blocked, 1).length === 0);
  const lots2 = t71FreeLots(blocked, 2), w0 = t71FirstWorkshop(blocked);
  check('T71F: ...so the first workshop goes to the next ring, on a free lot there', !!w0 && Math.max(Math.abs(w0.x - bb.x), Math.abs(w0.y - bb.y)) === 2 && lots2.includes(w0.x + ',' + w0.y));
})();

(function test_T71_blockedRingFixture() {
  // ported from PR #5's 20.js check onto develop's loader; the same fixture and the same literals
  const storage = makeMemoryStorage();
  storage.setItem('gachaFactorySave', fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v1_workshop_blocked_ring.json'), 'utf8'));
  const win = newDom(storage).window, s = win.state, base = s.world.base;
  check('T71B: the fixture loads the blocked layout (base 2,0, appraiser 2,2, museum 0,-1)', base.x === 2 && base.y === 0
    && JSON.stringify(s.village.sites) === JSON.stringify({ appraiser: { x: 2, y: 2 }, museum: { x: 0, y: -1 } }));
  const spot = win.workshopBuildSpot();
  check('T71B: a blocked adjacent ring moves the spot to the next ring, at 4,-2', JSON.stringify(spot) === JSON.stringify({ x: 4, y: -2 }) && Math.max(Math.abs(spot.x - base.x), Math.abs(spot.y - base.y)) === 2);
  check('T71B: the spot is open ground and keeps clear of the facilities', win.isCellOpenForMines(4, -2) && win.villageSiteNear(4, -2, 1.6) === false);
  s.research.workshopBuild = true; s.gold = 1000;
  const built = win.buildWorkshop();
  check('T71B: building there really builds at 4,-2', !!built && built.x === 4 && built.y === -2);
  check('T71B: the facilities are untouched by the build', JSON.stringify(s.village.sites) === JSON.stringify({ appraiser: { x: 2, y: 2 }, museum: { x: 0, y: -1 } }));
})();
