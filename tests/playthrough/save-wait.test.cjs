'use strict';
// Issue #32 A: the autosave wait must not accept an older committed snapshot that happens to match on gold.
const assert = require('node:assert/strict');
const test = require('node:test');
const { commitReady } = require('./save-wait.cjs');

const record = (revision, gold, workers, id = 'v1') => ({
  id, revision, snapshot: { payload: { saveVersion: 1, run: { gold, characters: workers.map((resource, i) => ({ id: 'w' + i, resource })) } } },
});
const want = { villageId: 'v1', afterRevision: 3, gold: 50, workers: 1, assignments: ['coal'] };

test('the stale snapshot that fooled gold===50 (revision 3, gold 50, no worker) is not ready', () => {
  const r = commitReady(record(3, 50, []), want);
  assert.equal(r.ready, false);
  assert.ok(r.reasons.some(x => x.includes('revision 3')) && r.reasons.some(x => x.includes('인부 0')));
});
test('a newer revision without the recruited worker is not ready', () => {
  assert.equal(commitReady(record(4, 50, []), want).ready, false);
});
test('the worker committed with the old assignment is not ready', () => {
  const r = commitReady(record(4, 50, ['iron']), want);
  assert.equal(r.ready, false);
  assert.ok(r.reasons.some(x => x.includes('배치')));
});
test('the right content in an older or equal revision is not ready', () => {
  assert.equal(commitReady(record(3, 50, ['coal']), want).ready, false);
});
test('another village is not ready', () => {
  assert.equal(commitReady(record(4, 50, ['coal'], 'v2'), want).ready, false);
});
test('no record is not ready', () => {
  assert.deepEqual(commitReady(null, want).ready, false);
  assert.deepEqual(commitReady({ id: 'v1', revision: 4 }, want).ready, false);
});
test('a newer commit of this village with gold, the worker and its assignment is ready', () => {
  const r = commitReady(record(4, 50, ['coal']), want);
  assert.equal(r.ready, true);
  assert.deepEqual(r.reasons, []);
  assert.deepEqual(r.committed, { villageId: 'v1', revision: 4, saveVersion: 1, gold: 50, workers: 1, assignments: ['coal'] });
});
