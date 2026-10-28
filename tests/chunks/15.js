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
