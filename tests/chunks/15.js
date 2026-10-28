// =============================================================================
// Game performance pass (PR B): faster code paths must give exactly what the
// code they replace gave. (15.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================

// fmt keeps one number formatter instead of looking one up on every call.
(function test_perf_fmtSameText() {
  const win = newDom(makeMemoryStorage()).window;
  const old = (n) => { if (n <= 0) return '0'; if (n < 10 && n % 1 !== 0) return n.toFixed(1); return Math.floor(n).toLocaleString(); };
  const values = [-5, 0, 0.04, 0.5, 1, 2.25, 9.99, 10, 10.5, 999, 1000, 1234.9, 99999, 123456, 1e6, 987654321, 2 ** 31, 2 ** 53, 1e21, 1e25, Infinity];
  const bad = values.filter((v) => win.fmt(v) !== old(v));
  check('Perf: fmt gives the same text as before for small, large, fractional and huge numbers', bad.length === 0, bad.map((v) => v + ' -> ' + win.fmt(v) + ' / ' + old(v)).join(', '));
  check('Perf: fmt of a non-number still gives what it gave (NaN)', win.fmt(NaN) === old(NaN), win.fmt(NaN));
  check('Perf: the shown numbers still read as before (a resource count with thousands separators)', (() => {
    win.state.resources.iron = 12345; win.updateNumbers();
    const el = win.document.querySelector('[data-amt="iron"]');
    return el && el.textContent === (12345).toLocaleString();
  })());
})();

// The village reach check fills its grid of standable points with the obstacle index read once.
function perfLcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function perfStandBySteps(win, x0, y0, nx, ny, st) {
  const can = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) can[j * nx + i] = win.playerCanStand(x0 + i * st, y0 + j * st) ? 1 : 0;
  return can;
}
(function test_perf_standGridSameAsPlayerCanStand() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const b = win.state.world.base, same = (x0, y0, nx, ny, st) => {
    const a = win.villageStandGrid(x0, y0, nx, ny, st), e = perfStandBySteps(win, x0, y0, nx, ny, st);
    let diff = 0; for (let c = 0; c < a.length; c++) if (a[c] !== e[c]) diff++;
    return { diff, stand: e.reduce((s, v) => s + v, 0), n: e.length };
  };
  const near = same(b.x - 7, b.y - 7, 141, 141, 0.1);
  check('Perf: the stand grid round the workshop matches playerCanStand at every point (new game)', near.diff === 0 && near.stand > 0 && near.stand < near.n, JSON.stringify(near));
  win.unlockTunnel({ random: perfLcg(3) });
  const wide = same(b.x - 20, b.y - 11, 201, 111, 0.2);
  check('Perf: ...and over a wide area with the tunnel open (scenery, the land beyond)', wide.diff === 0 && wide.stand > 0, JSON.stringify(wide));
})();

(function test_perf_villageSitesUnchanged() {
  // the sites and the plaza found with the grid as it was filled before (playerCanStand per point)
  // and as it is filled now, for the same worlds
  let bad = 0, firstDetail = '', checked = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const win = newDom(makeMemoryStorage(), { fullWorld: true, random: perfLcg(seed * 7477) }).window;
    const v = win.state.village, place = () => {
      v.sites = { appraiser: null, museum: null }; v.district = null;
      win.villageEnsureSites();
      return JSON.stringify([v.sites, v.district]);
    };
    const now = place();
    const realGrid = win.villageStandGrid;
    win.villageStandGrid = (x0, y0, nx, ny, st) => perfStandBySteps(win, x0, y0, nx, ny, st);
    const before = place();
    win.villageStandGrid = realGrid;
    checked++;
    if (now !== before || !v.sites.appraiser || !v.district) { bad++; if (!firstDetail) firstDetail = 'seed ' + seed + ': ' + now + ' vs ' + before; }
    win.close();
  }
  check('Perf: the village sites and plaza are placed exactly where they were before (6 worlds)', checked === 6 && bad === 0, firstDetail);
})();

// updateNumbers finds its elements with one pass per attribute (uiFirstByAttr) instead of
// one document.querySelector per key: the same elements, found afresh on every tick.
(function test_perf_updateNumbersFindsTheSameElements() {
  const storage = makeMemoryStorage();
  storage.setItem('gachaFactorySave', fs.readFileSync(path.join(__dirname, 'fixtures', 'save_v1_midgame.json'), 'utf8'));
  const win = newDom(storage).window, doc = win.document, s = win.state;
  const attrs = ['data-shared-amt', 'data-amt', 'data-rate', 'data-train', 'data-fac', 'data-unlocksite', 'data-stock', 'data-craft', 'data-sell', 'data-buyautosell', 'data-research', 'data-research-cost'];
  const same = attrs.every((a) => {
    const map = win.uiFirstByAttr(a), values = new Set([...doc.querySelectorAll('[' + a + ']')].map((e) => e.getAttribute(a)));
    return map.size === values.size && [...values].every((v) => map.get(v) === doc.querySelector('[' + a + '="' + v + '"]'));
  });
  check('Perf: for every attribute the tick reads, each value maps to the element querySelector finds', same);
  // the numbers on screen follow the state, tick after tick
  const shown = () => win.RESOURCES.every((r) => { const el = doc.querySelector('[data-shared-amt="' + r.key + '"]'); return !el || el.textContent === win.fmt(s.resources[r.key]); }) &&
    win.RECIPES.every((r) => { const el = doc.querySelector('[data-stock="' + r.key + '"]'); return !el || el.textContent === win.fmt(s.products[r.key]) + '개 보유'; });
  win.RESOURCES.forEach((r, i) => { s.resources[r.key] = 1000 + i * 37; });
  win.RECIPES.forEach((r, i) => { s.products[r.key] = 5 + i; });
  win.updateNumbers();
  check('Perf: after a change, every shared amount and product stock on screen shows the new value', shown() && doc.querySelectorAll('[data-shared-amt]').length >= 8);
  // a rebuilt panel: the tick writes to the new elements, not to the ones that were replaced
  const oldStock = doc.querySelector('[data-stock]');
  win.buildRecipes();
  const newStock = doc.querySelector('[data-stock]');
  win.RECIPES.forEach((r) => { s.products[r.key] += 3; });
  win.updateNumbers();
  check('Perf: after the recipe cards are rebuilt the new cards get the numbers (nothing stale)', newStock && newStock !== oldStock && !oldStock.isConnected && shown());
  // two elements with the same key: only the first one is written to, as with querySelector
  const first = doc.querySelector('[data-shared-amt]'), key = first.getAttribute('data-shared-amt');
  const decoy = doc.createElement('span'); decoy.setAttribute('data-shared-amt', key); decoy.textContent = 'decoy';
  first.parentNode.insertBefore(decoy, first.nextSibling);
  s.resources[key] = 4242; win.updateNumbers();
  check('Perf: with two elements for one key only the first in the page is updated (as before)', first.textContent === win.fmt(4242) && decoy.textContent === 'decoy');
  decoy.remove();
})();

// PR #5's test world loads generated chunks as worldObstacles is asked about a spot; the stand
// grid loads the whole rectangle first and must still match playerCanStand point by point,
// also over ground whose chunks were not loaded yet. The second window loads the first one's
// save, so both stand in the same generated world.
(function test_perf_standGridInTheTestWorld() {
  const url = 'https://example.test/?worldgen=256';
  const sa = makeMemoryStorage();
  const a = newDom(sa, { url, fullWorld: true }).window;
  a.saveGame();
  const sb = makeMemoryStorage();
  Object.entries(sa._raw()).forEach(([k, v]) => sb.setItem(k, v));
  const b = newDom(sb, { url, fullWorld: true }).window;
  const inTestWorld = typeof a.currentWorldContext === 'function' && !!a.currentWorldContext() && !!b.currentWorldContext();
  const sameWorld = inTestWorld && a.state.world.seed === b.state.world.seed;
  const areas = [[a.state.world.base.x - 7, a.state.world.base.y - 7, 141, 141, 0.1], [14, 10, 81, 61, 0.2], [-30, -30, 61, 41, 0.25]];
  let diff = 0, stand = 0, n = 0;
  areas.forEach(([x0, y0, nx, ny, st]) => {
    const g = a.villageStandGrid(x0, y0, nx, ny, st), e = perfStandBySteps(b, x0, y0, nx, ny, st);
    for (let c = 0; c < g.length; c++) { if (g[c] !== e[c]) diff++; stand += e[c]; n++; }
  });
  check('Perf: in the 256 test world the stand grid matches playerCanStand, also where no chunk was loaded yet', sameWorld && diff === 0 && stand > 0 && stand < n, JSON.stringify({ inTestWorld, sameWorld, diff, stand, n }));
  a.close(); b.close();
})();
