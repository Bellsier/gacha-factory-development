// =============================================================================
// The test runner (tests/regression.test.js): between two tests it closes the
// windows the first one opened and lets the event loop turn once, so Node can
// free them. Without that every window of the run stayed in memory to the end.
// (14.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
const runnerSeen = { closed: false, turned: false, opened: 0 };
(function test_runnerOpensAWindow() {
  const dom = newDom(makeMemoryStorage());
  const close = dom.window.close.bind(dom.window);
  dom.window.close = () => { runnerSeen.closed = true; return close(); };
  setImmediate(() => { runnerSeen.turned = true; });
  runnerSeen.opened = allDoms.length;
  check('Runner: a window opened by a test is tracked until the test ends', runnerSeen.opened >= 1 && allDoms.includes(dom));
})();

(function test_runnerFreedTheLastTestsWindows() {
  check('Runner: the windows of the previous test are closed before the next test starts', runnerSeen.closed === true);
  check('Runner: none of them is still tracked (nothing keeps them alive)', allDoms.length === 0, allDoms.length + ' still tracked');
  check('Runner: the event loop turned between the two tests (Node frees closed windows only then)', runnerSeen.turned === true);
})();
