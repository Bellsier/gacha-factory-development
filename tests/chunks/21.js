// H2 south-connector regression. Uses real terrain, A*, placements and movement.
{
const assert = require('node:assert/strict');
const { open } = require('./stage3-harness.cjs');
const fixture = require('./fixtures/save_v1_midgame.json');
const test = (name, fn) => {
  try { fn(); check('H2 connector: ' + name, true); }
  catch (e) { check('H2 connector: ' + name, false, e.stack); }
};
function seeded(seed) {
  const payload = JSON.parse(JSON.stringify(fixture));
  Object.assign(payload.run.world, { seed, size: 256, generatorVersion: 2, chunkEditsVersion: 1, chunkEdits: {} });
  const h = open(true, { 'gachaFactorySave.worldgen256.v1': JSON.stringify(payload) });
  // Deterministic expansion quotas rather than host speed / wall-clock deadlines.
  h.w.performance.now = () => 0;
  return h;
}
test('rejects the 0.06 south shoulder in both directions', () => {
  const h = seeded(7);
  try {
    const w = h.w;
    assert.equal(w.playerCanStand(14.125, .4375), true);
    assert.equal(w.playerCanStand(14.125, .47), false);
    assert.equal(w.playerCanStand(14.125, .5), true);
    for (const [a, b] of [
      [{ x: 14.125, y: .375 }, { x: 14.125, y: .625 }],
      [{ x: 14.125, y: .625 }, { x: 14.125, y: .375 }],
      [{ x: 14.125, y: .439 }, { x: 14.125, y: .501 }],
    ]) assert.equal(w.worldNavClear(a, b), false, JSON.stringify([a, b]));
    assert.ok(w.worldNavClear({ x: 14.375, y: .375 }, { x: 14.375, y: .625 }), 'route outside the connector remains clear');
    const stopped = w.worldStepFoot(14.125, .4375, 0, 1, .02);
    assert.ok(stopped.y <= .440001, 'real movement stops at the same shoulder');
  } finally { h.close(); }
});
for (const seed of [0, 7, 42]) for (const direction of ['east', 'south', 'west', 'north']) {
  test('seed ' + seed + ' ' + direction + ': six workers arrive without retries, walls or snaps', () => {
    const h = seeded(seed);
    try {
      const w = h.w, state = w.getState(), c = state.world;
      w.worldEnsureRect({ minX: -32, maxX: 31, minY: -32, maxY: 31 });
      const inDirection = m => direction === 'east' ? m.x >= 19 && Math.abs(m.y) < 8
        : direction === 'south' ? m.y >= 19 && Math.abs(m.x) < 8
        : direction === 'west' ? m.x <= -19 && Math.abs(m.y) < 8
        : m.y <= -19 && Math.abs(m.x) < 8;
      const mines = c.mines.filter(m => m.id.startsWith('gen:') && inDirection(m));
      assert.ok(mines.length >= 2, 'two distinct generated destinations');
      // Extremes include routes omitted by the original first-mine-only test.
      for (const mine of [mines[0], mines.at(-1)]) {
        for (const m of c.mines) m.developmentState = 'unsecured';
        w.discoverMine(mine.id); w.secureMine(mine.id);
        state.characters = Array.from({ length: 3 }, (_, i) => ({ ...fixture.run.characters[0], id: 'h2-' + i, resource: mine.resource }));
        Object.assign(c.player, { x: 2, y: 2 });
        w.tdWorkerSimReset();
        const placements = w.tdWorkerPlacements();
        assert.ok(placements.every(p => p.mineId === mine.id));
        let starts = 0;
        const start = w.worldNavStart, step = w.worldStepFoot;
        w.worldStepFoot = (x, y, dx, dy, distance, options) => {
          const next = step(x, y, dx, dy, distance, options);
          // The mover resolves X then Y; inspect each actual substep, not a
          // frame-to-frame chord which may cut across a legitimate A* turn.
          for (const [a, b] of [[{ x, y }, { x: next.x, y }], [{ x: next.x, y }, next]]) {
            const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / .005);
            for (let i = 1; i <= n; i++) assert.ok(w.playerCanStand(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n), mine.id + ': substep crosses a wall ' + JSON.stringify([a, b]));
          }
          return next;
        };
        w.worldNavStart = (...args) => { starts++; return start(...args); };
        try {
          for (let frame = 0; frame < 6000; frame++) {
            const before = Object.values(w.getTD().workerSim.byId).map(s => ({ ...s }));
            w.tdWorkerSimStep(100, frame * 100);
            const states = Object.values(w.getTD().workerSim.byId);
            for (const s of states) {
              const prev = before.find(p => p.id === s.id);
              assert.equal(s.snaps, 0, mine.id + ': no teleport');
              assert.ok(w.playerCanStand(s.x, s.y), mine.id + ': no terrain/obstacle penetration');
              if (prev) {
                const dist = Math.hypot(s.x - prev.x, s.y - prev.y);
                assert.ok(dist <= .160001, mine.id + ': bounded walking speed');

              }
            }
            if (states.length === 3 && states.every(s => s.mode === 'work')) break;
          }
          const states = Object.values(w.getTD().workerSim.byId);
          assert.ok(states.every(s => s.mode === 'work'), mine.id + ': all arrive within 600 simulated seconds: ' + JSON.stringify(states));
          assert.equal(starts, 3, mine.id + ': one finite search per worker, no replan loop');
          for (const s of states) {
            const p = placements.find(p => p.id === s.id);
            assert.ok(Math.hypot(s.x - p.x, s.y - p.y) < .02);
            assert.equal(s.dir, p.dir);
          }
        } finally { w.worldNavStart = start; w.worldStepFoot = step; }
      }
    } finally { h.close(); }
  });
}
}
