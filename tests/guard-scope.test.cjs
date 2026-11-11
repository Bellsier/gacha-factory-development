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

// Every clone of this run lives under one temporary folder; each clone is removed right after its guard run and
// the folder when the file's tests end, pass or fail (also a clone whose setup failed half way).
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-scope-'));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
// A shallow clone at HEAD plus the listed extra commits (each fetched at depth 1), with the working guard copied in.
function shallowCheckout(extra, guard = guardSource, at = head) {
  const dir = fs.mkdtempSync(path.join(scratch, 'clone-'));
  git(dir, 'init', '-q');
  git(dir, 'fetch', '-q', '--depth', '1', 'file://' + repo, at);
  git(dir, 'checkout', '-q', 'FETCH_HEAD');
  for (const sha of extra) git(dir, 'fetch', '-q', '--depth', '1', 'file://' + repo, sha);
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tools/check-pre-s4-hud-scope.cjs'), guard);
  return dir;
}
// runs the guard in the clone, then removes the clone (each is ~0.6 GB: the history's docs images)
const runGuard = dir => { try { return spawnSync(process.execPath, ['tools/check-pre-s4-hud-scope.cjs'], { cwd: dir, encoding: 'utf8' }); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };

test('both base commits present: the guard passes and runs the UX-01 scope check', () => {
  const r = runGuard(shallowCheckout([S2_BASE, HUD_HEAD]));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /since 055588b\w+ only js\/ui\.js, css\/style\.css and the approved tdBindTap part of js\/topdown\/app\.js changed/);
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
  // the commit that guard belonged to (#36 head), so it judges the code it was written for
  const old = 'cf65ab707249b9e973087e4177d48158f8bfdda6', before = git(repo, 'show', old + ':tools/check-pre-s4-hud-scope.cjs');
  const r = runGuard(shallowCheckout([S2_BASE], before, old));
  assert.equal(r.status, 0, 'the old guard is expected to pass here — that is the defect being fixed');
});

// PR #38 review: js/topdown/app.js may change only in the approved tdBindTap() part. Each case edits one file in a
// full (both bases) shallow checkout and runs the guard.
const edited = (file, edit) => {
  const dir = shallowCheckout([S2_BASE, HUD_HEAD]), f = path.join(dir, file);
  try { fs.writeFileSync(f, edit(fs.readFileSync(f, 'utf8'))); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  return runGuard(dir);
};
const replaceOnce = (src, from, to) => { assert.ok(src.includes(from), 'test setup: text not found: ' + from); return src.replace(from, to); };
test('negative: an unrelated change in js/topdown/app.js (the world action) fails', () => {
  const r = edited('js/topdown/app.js', src => replaceOnce(src, 'const target = tdInteractTarget(p.x, p.y);', 'const target = tdInteractTarget(p.x + 1, p.y);'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /changed outside the approved tdBindTap\(\) \/ #tdAction binding/);
});
test('negative: binding another button (the torch) with tdBindTap fails', () => {
  const r = edited('js/topdown/app.js', src => replaceOnce(src, "document.getElementById('tdTorch').onclick = () => { tdTorchNow(); };", "tdBindTap(document.getElementById('tdTorch'), () => { tdTorchNow(); });"));
  assert.notEqual(r.status, 0);
});
test('negative: changing the #tdAction binding line fails', () => {
  const r = edited('js/topdown/app.js', src => replaceOnce(src, "tdBindTap(document.getElementById('tdAction'), () => { tdInteractNow(); });", "tdBindTap(document.getElementById('tdAction'), () => { tdInteractNow(); tdTorchNow(); });"));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /binding line is missing or changed/);
});
test('negative: a movement change (js/player.js) fails', () => {
  const r = edited('js/player.js', src => src + '\n// unrelated\n');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Protected game file changed: js\/player\.js/);
});
test('positive: a change inside the approved tdBindTap() passes', () => {
  const r = edited('js/topdown/app.js', src => replaceOnce(src, 'let pressed = null, handled = null;', 'let pressed = null, handled = null; // reviewed'));
  assert.equal(r.status, 0, r.stderr);
});
test('control: the file-wide guard before this review (24ad345) let the unrelated app.js change through', () => {
  const old = git(repo, 'show', '24ad345360f97f5a266783e08559b1fcac542de3:tools/check-pre-s4-hud-scope.cjs');
  const dir = shallowCheckout([S2_BASE, HUD_HEAD], old);
  const f = path.join(dir, 'js/topdown/app.js');
  fs.writeFileSync(f, replaceOnce(fs.readFileSync(f, 'utf8'), 'const target = tdInteractTarget(p.x, p.y);', 'const target = tdInteractTarget(p.x + 1, p.y);'));
  assert.equal(runGuard(dir).status, 0, 'the old guard is expected to pass here — that is the gap being closed');
});

// PR #38 QA (Codex): the guard must tell the approved change from any other code exactly — not by braces or a
// loose line pattern. Code is code wherever it hides; braces inside strings, comments, templates and regular
// expressions are not code.
const BIND = "tdBindTap(document.getElementById('tdAction'), () => { tdInteractNow(); });";
const bindingEdit = to => src => { const line = src.split('\n').find(l => l.startsWith('  ' + BIND)); assert.ok(line, 'test setup: binding line'); return src.replace(line, to); };
for (const [name, line] of [
  ['another statement after the binding', '  ' + BIND + ' tdTorchNow();'],
  ['another statement and then a comment after the binding', '  ' + BIND + ' tdTorchNow(); // Issue #32'],
  ['a statement after a line separator (U+2028) inside the binding comment', '  ' + BIND + ' // Issue #32\u2028tdTorchNow();'],
  ['a statement after a paragraph separator (U+2029) inside the binding comment', '  ' + BIND + ' // Issue #32\u2029tdTorchNow();'],
  ['a statement after a carriage return inside the binding comment', '  ' + BIND + ' // Issue #32\rtdTorchNow();'],
]) test('negative: ' + name + ' fails', () => {
  const r = edited('js/topdown/app.js', bindingEdit(line));
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
  assert.match(r.stderr, /binding line is missing or changed/);
});
test('positive: the binding line without its comment passes', () => {
  const r = edited('js/topdown/app.js', bindingEdit('  ' + BIND));
  assert.equal(r.status, 0, r.stderr);
});
const insideTap = add => src => replaceOnce(src, '  let pressed = null, handled = null;\n', '  let pressed = null, handled = null;\n' + add + '\n');
for (const [name, add] of [
  ['a string', "  const open = '{', close = \"}}\";"],
  ['a line comment', '  // a { brace } in a comment {'],
  ['a block comment', '  /* { */'],
  ['a template literal', '  const t = `{ ${pressed} {`;'],
  ['a regular expression', '  const re = /\\{/;'],
]) test('positive: a brace in ' + name + ' inside the approved tdBindTap() passes', () => {
  const r = edited('js/topdown/app.js', insideTap(add));
  assert.equal(r.status, 0, r.stderr);
});
test('negative: code after tdBindTap() hidden by unbalanced braces in strings fails', () => {
  const r = edited('js/topdown/app.js', src => replaceOnce(insideTap("  const s = '{';")(src),
    '\n// --- set-up', "\ntdTorchNow(); const t = '}';\n\n// --- set-up"));
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
});
test('negative: a second function next to tdBindTap() fails', () => {
  const r = edited('js/topdown/app.js', src => replaceOnce(src, '\n// --- set-up', '\nfunction tdExtra(){ tdTorchNow(); }\n\n// --- set-up'));
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
});
test('negative: a statement after a line separator (U+2028) in the comment above tdBindTap() fails', () => {
  const r = edited('js/topdown/app.js', src => replaceOnce(src, '// Issue #32: right after', '// Issue #32\u2028tdTorchNow(); right after'));
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
});

// Codex QA: these are examples inside the approved function, not extra bindings.
for (const [name, add] of [
  ['a string', "  const example = \"tdBindTap(document.getElementById('tdAction'), () => { });\";"],
  ['a line comment', "  // Example: tdBindTap(document.getElementById('tdAction'), () => { });"],
  ['a template literal', "  const example = `tdBindTap(document.getElementById('tdAction'), () => { });`;"],
]) test('positive: a binding example in ' + name + ' is not another #tdAction binding', () => {
  const r = edited('js/topdown/app.js', insideTap(add));
  assert.equal(r.status, 0, r.stderr);
});

for (const [name, edit] of [
  ['a multiline template', insideTap('  const example = `\n  ' + BIND + '\n`;')],
  ['a multiline block comment', insideTap('  /* Example:\n  ' + BIND + '\n  */')],
  ['a regular expression', insideTap("  const example = /tdBindTap(document.getElementById('tdAction'), () => { });/;")],
  ['the comment above tdBindTap', src => replaceOnce(src, 'function tdBindTap(', '// Example: ' + BIND + '\nfunction tdBindTap(')],
]) test('positive: an adjacent binding example in ' + name + ' stays in the approved region', () => {
  const r = edited('js/topdown/app.js', edit);
  assert.equal(r.status, 0, r.stderr);
});

test('negative: a duplicate real #tdAction binding fails', () => {
  const r = edited('js/topdown/app.js', bindingEdit('  ' + BIND + '\n  ' + BIND));
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
});
test('negative: an executable line after the #tdAction binding fails', () => {
  const r = edited('js/topdown/app.js', bindingEdit('  ' + BIND + '\n  tdTorchNow();'));
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
});

test('positive: the approved helper may also be declared after the actual binding', () => {
  const r = edited('js/topdown/app.js', src => {
    const begin = src.indexOf('// Issue #32: right after'), end = src.indexOf('// --- set-up', begin);
    assert.ok(begin >= 0 && end > begin, 'test setup: helper block');
    const helper = src.slice(begin, end), without = src.slice(0, begin) + src.slice(end);
    return replaceOnce(without, '\ntdInit();', '\n' + helper + 'tdInit();');
  });
  assert.equal(r.status, 0, r.stderr);
});

test('negative: a binding inside a late helper cannot substitute for the real binding', () => {
  const r = edited('js/topdown/app.js', () => {
    const hud = git(repo, 'show', HUD_HEAD + ':js/topdown/app.js').split('\n');
    const binding = hud.indexOf("  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };"), call = hud.indexOf('tdInit();');
    assert.ok(binding >= 0 && call > binding, 'test setup: original binding and init call');
    // Keep the original onclick untouched. A copied reference suffix inside an unused helper must not
    // trick the guard into treating this fake binding as the real one in tdInit().
    const fake = ['function tdBindTap(btn, act){', '  ' + BIND, ...hud.slice(binding + 1, call)];
    return [...hud.slice(0, call), ...fake, ...hud.slice(call)].join('\n') + '\n';
  });
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
});

// Codex QA G-04: the approved helper declared after tdInit(), whose body ends, after a `return`, with a copy of the
// #tdAction binding and the rest of the HUD head's init code. Two lines then look like the binding at a structurally
// possible place; only the real one in tdInit() makes the inserted block exactly one tdBindTap() declaration.
const g04 = ({ realBinding = '  ' + BIND, after = [] } = {}) => () => {
  const hud = git(repo, 'show', HUD_HEAD + ':js/topdown/app.js').split('\n');
  const b = hud.indexOf("  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };"), call = hud.indexOf('tdInit();');
  assert.ok(b >= 0 && call > b, 'test setup: original binding and init call');
  const cur = fs.readFileSync(path.join(repo, 'js/topdown/app.js'), 'utf8').split('\n');
  const s = cur.findIndex(l => l.startsWith('function tdBindTap(')), e = cur.indexOf('}', s);
  assert.ok(s >= 0 && e > s, 'test setup: approved helper');
  const helper = [...cur.slice(s, e), '  return;', '  ' + BIND, ...hud.slice(b + 1, call)]; // tdInit's own `}` closes it
  return [...hud.slice(0, b), realBinding, ...hud.slice(b + 1, call), ...helper, ...after, ...hud.slice(call)].join('\n') + '\n'; // git() trims the final newline
};
test('positive (G-04): a binding example and the HUD init tail after return in a late helper pass, the same way every run', () => {
  const dir = shallowCheckout([S2_BASE, HUD_HEAD]), f = path.join(dir, 'js/topdown/app.js');
  try { fs.writeFileSync(f, g04()()); } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  const run = () => spawnSync(process.execPath, ['tools/check-pre-s4-hud-scope.cjs'], { cwd: dir, encoding: 'utf8' });
  const first = run(), second = run(), third = runGuard(dir);
  assert.equal(first.status, 0, first.stderr);
  for (const r of [second, third]) assert.deepEqual([r.status, r.stdout, r.stderr], [first.status, first.stdout, first.stderr]);
});
for (const [name, opts] of [
  ['the real binding with another statement after it', { realBinding: '  ' + BIND + ' tdTorchNow();' }],
  ['the real binding left as the HUD onclick (only the example binds)', { realBinding: "  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };" }],
  ['an executable line right after the late helper', { after: ['tdTorchNow();'] }],
]) test('negative (G-04 shape): ' + name + ' fails', () => {
  const r = edited('js/topdown/app.js', g04(opts));
  assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout);
});
