'use strict';
// Issue #32 E: the pre-S4/UX-01 scope guard must FAIL (non-zero, with a message) when a required base commit is
// missing from the checkout, and keep passing on a full checkout. Each case builds a real shallow clone of this
// repository (file://, --depth 1), adds exactly the commits the case needs, puts the guard under test into it and
// runs it. Needs the full history in the source checkout (CI: the playthrough job's fetch-depth 0).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const guardSource = fs.readFileSync(path.join(repo, 'tools/check-pre-s4-hud-scope.cjs'), 'utf8');
const S2_BASE = '224b3dad86614438ec28ad065bd71d3bbc4b0726', HUD_HEAD = '055588bb3e979147bb3f723c1ee2b6e85b5ff5ad';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const head = git(repo, 'rev-parse', 'HEAD');
const has = sha => { try { git(repo, 'cat-file', '-e', sha + '^{commit}'); return true; } catch { return false; } };
if (!has(S2_BASE) || !has(HUD_HEAD)) throw new Error('guard-scope.test needs the full history (fetch-depth 0): a base commit is missing here.');

// A shallow clone at HEAD plus the listed extra commits (each fetched at depth 1), with the working guard copied in.
function shallowCheckout(extra, guard = guardSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-scope-'));
  git(dir, 'init', '-q');
  git(dir, 'fetch', '-q', '--depth', '1', 'file://' + repo, head);
  git(dir, 'checkout', '-q', 'FETCH_HEAD');
  for (const sha of extra) git(dir, 'fetch', '-q', '--depth', '1', 'file://' + repo, sha);
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tools/check-pre-s4-hud-scope.cjs'), guard);
  return dir;
}
const runGuard = dir => spawnSync(process.execPath, ['tools/check-pre-s4-hud-scope.cjs'], { cwd: dir, encoding: 'utf8' });

test('both base commits present: the guard passes and runs the UX-01 scope check', () => {
  const r = runGuard(shallowCheckout([S2_BASE, HUD_HEAD]));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /since 055588b\w+ only js\/ui\.js and css\/style\.css changed/);
});
test('HUD head missing (the case that used to pass): non-zero exit with a clear message', () => {
  const r = runGuard(shallowCheckout([S2_BASE]));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /pre-S4 HUD head \(#30 head\) 055588b\w+ is not in this checkout/);
  assert.doesNotMatch(r.stdout, /match/);
});
test('S2 base missing: non-zero exit with a clear message', () => {
  const r = runGuard(shallowCheckout([HUD_HEAD]));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /S2\/playthrough base \(#29 head\) 224b3da\w+ is not in this checkout/);
});
test('control: the guard before the fix exited 0 without the HUD head (the reported F-02)', () => {
  const before = git(repo, 'show', 'cf65ab707249b9e973087e4177d48158f8bfdda6:tools/check-pre-s4-hud-scope.cjs');
  const r = runGuard(shallowCheckout([S2_BASE], before));
  assert.equal(r.status, 0, 'the old guard is expected to pass here — that is the defect being fixed');
});
