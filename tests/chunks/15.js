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
