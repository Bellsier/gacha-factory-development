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

// PR #38 review: js/topdown/app.js may change only in the approved tdBindTap() part. Each case edits one file of a
// full (both bases) shallow checkout, runs the guard and puts the file back. The cases share ONE checkout (a clone
// costs ~0.6 GB and ~10 s); the last test checks that it is back to the committed state.
let sharedClone = null;
const guardIn = dir => spawnSync(process.execPath, ['tools/check-pre-s4-hud-scope.cjs'], { cwd: dir, encoding: 'utf8' });
const edited = (file, edit) => {
  sharedClone = sharedClone || shallowCheckout([S2_BASE, HUD_HEAD]);
  const f = path.join(sharedClone, file), original = fs.readFileSync(f, 'utf8');
  try { fs.writeFileSync(f, edit(original)); return guardIn(sharedClone); } finally { fs.writeFileSync(f, original); }
};
const replaceOnce = (src, from, to) => { assert.ok(src.includes(from), 'test setup: text not found: ' + from); assert.equal(src.split(from).length, 2, 'test setup: text found more than once: ' + from); return src.replace(from, to); };
// A rejection counts only with the reason this case is about (a broken test input is rejected too, for another reason).
const OUTSIDE = /changed outside the approved tdBindTap\(\) and its #tdAction, #tdTorch, #tdDecor bindings/;
const NOT_ONE_FUNCTION = /the inserted block is not exactly one tdBindTap\(\) function/;
const BINDING = /an approved tdBindTap binding line \(#tdAction, #tdTorch, #tdDecor\) is missing or changed/;
// an extra line near the bindings moves them off their places: reported as a binding out of place, or as code outside
const BINDING_OR_OUTSIDE = new RegExp(BINDING.source + '|' + OUTSIDE.source);
const rejects = (r, reason) => { assert.notEqual(r.status, 0, 'the guard passed: ' + r.stdout); assert.equal(r.status, 1, 'the guard did not end by itself: ' + r.stderr); assert.match(r.stderr, reason); };
const passes = r => assert.equal(r.status, 0, r.stderr);
const ACTION = "tdBindTap(document.getElementById('tdAction'), () => { tdInteractNow(); });";
const TORCH = "tdBindTap(document.getElementById('tdTorch'), () => { tdTorchNow(); });";
const DECOR = "tdBindTap(document.getElementById('tdDecor'), () => { tdGardenButtonNow(); });";
const HELPER_TOP = '// Issue #32: the phone buttons act on'; // first comment line above tdBindTap()
// replaces the whole line that starts with this binding (its end-of-line comment included)
const bindingEdit = (bind, to) => src => { const found = src.split('\n').filter(l => l.startsWith('  ' + bind)); assert.equal(found.length, 1, 'test setup: binding line ' + bind); return src.replace(found[0], to); };
const insideTap = add => src => replaceOnce(src, '  let pressed = null, handled = null;\n', '  let pressed = null, handled = null;\n' + add + '\n');

test('negative: an unrelated change in js/topdown/app.js (the world action) fails', () => {
  rejects(edited('js/topdown/app.js', src => replaceOnce(src, 'const target = tdInteractTarget(p.x, p.y);', 'const target = tdInteractTarget(p.x + 1, p.y);')), OUTSIDE);
});
test('negative: a movement change (js/player.js) fails', () => {
  rejects(edited('js/player.js', src => src + '\n// unrelated\n'), /Protected game file changed: js\/player\.js/);
});
test('positive: a change inside the approved tdBindTap() passes', () => {
  passes(edited('js/topdown/app.js', src => replaceOnce(src, 'let pressed = null, handled = null;', 'let pressed = null, handled = null; // reviewed')));
});
test('control: the file-wide guard before this review (24ad345) let the unrelated app.js change through', () => {
  const old = git(repo, 'show', '24ad345360f97f5a266783e08559b1fcac542de3:tools/check-pre-s4-hud-scope.cjs');
  const dir = shallowCheckout([S2_BASE, HUD_HEAD], old);
  const f = path.join(dir, 'js/topdown/app.js');
  fs.writeFileSync(f, replaceOnce(fs.readFileSync(f, 'utf8'), 'const target = tdInteractTarget(p.x, p.y);', 'const target = tdInteractTarget(p.x + 1, p.y);'));
  assert.equal(runGuard(dir).status, 0, 'the old guard is expected to pass here — that is the gap being closed');
});

// Deep review P2-2: #tdTorch and #tdDecor are bound with tdBindTap too. Only these three buttons, each with its own
// action, in place of its own onclick line.
test('negative: binding a button that is not approved (the close button) with tdBindTap fails', () => {
  rejects(edited('js/topdown/app.js', src => replaceOnce(src, "document.getElementById('tdClose').onclick = tdClosePanels;", "tdBindTap(document.getElementById('tdClose'), tdClosePanels);")), OUTSIDE);
});
for (const [name, bind, to] of [
  ['changing the #tdAction action', ACTION, "  tdBindTap(document.getElementById('tdAction'), () => { tdInteractNow(); tdTorchNow(); });"],
  ['changing the #tdTorch action', TORCH, "  tdBindTap(document.getElementById('tdTorch'), () => { tdTorchNow(); tdInteractNow(); });"],
  ['binding #tdTorch to the garden action', TORCH, "  tdBindTap(document.getElementById('tdTorch'), () => { tdGardenButtonNow(); });"],
  ['binding #tdDecor to another action', DECOR, "  tdBindTap(document.getElementById('tdDecor'), () => { tdInteractNow(); }); // Task 120"],
  ['leaving #tdTorch on its old onclick', TORCH, "  document.getElementById('tdTorch').onclick = () => { tdTorchNow(); };"],
  ['leaving #tdDecor on its old onclick', DECOR, "  document.getElementById('tdDecor').onclick = () => { tdGardenButtonNow(); }; // Task 120"],
  ['removing the #tdTorch binding', TORCH, '  // no torch'],
]) test('negative: ' + name + ' fails', () => {
  rejects(edited('js/topdown/app.js', bindingEdit(bind, to)), BINDING);
});
test('negative: swapping the #tdTorch and #tdDecor binding lines fails', () => {
  rejects(edited('js/topdown/app.js', src => {
    const lines = src.split('\n'), t = lines.findIndex(l => l.startsWith('  ' + TORCH)), d = lines.findIndex(l => l.startsWith('  ' + DECOR));
    assert.ok(t >= 0 && d >= 0, 'test setup: torch and decor bindings');
    [lines[t], lines[d]] = [lines[d], lines[t]];
    return lines.join('\n');
  }), BINDING);
});

// PR #38 QA (Codex): the guard must tell the approved change from any other code exactly — not by braces or a
// loose line pattern. Code is code wherever it hides; braces inside strings, comments, templates and regular
// expressions are not code.
for (const [button, bind] of [['#tdAction', ACTION], ['#tdTorch', TORCH], ['#tdDecor', DECOR]]) {
  for (const [name, line] of [
    ['another statement after the binding', '  ' + bind + ' tdClosePanels();'],
    ['another statement and then a comment after the binding', '  ' + bind + ' tdClosePanels(); // Issue #32'],
    ['a statement after a line separator (U+2028) inside the binding comment', '  ' + bind + ' // Issue #32\u2028tdClosePanels();'],
    ['a statement after a paragraph separator (U+2029) inside the binding comment', '  ' + bind + ' // Issue #32\u2029tdClosePanels();'],
    ['a statement after a carriage return inside the binding comment', '  ' + bind + ' // Issue #32\rtdClosePanels();'],
  ]) test('negative: ' + button + ': ' + name + ' fails', () => {
    rejects(edited('js/topdown/app.js', bindingEdit(bind, line)), BINDING);
  });
  test('positive: ' + button + ': the binding line without a comment, or with another comment, passes', () => {
    passes(edited('js/topdown/app.js', bindingEdit(bind, '  ' + bind)));
    passes(edited('js/topdown/app.js', bindingEdit(bind, '  ' + bind + '\t// reviewed { } `')));
  });
  test('negative: ' + button + ': a duplicate real binding fails', () => {
    rejects(edited('js/topdown/app.js', bindingEdit(bind, '  ' + bind + '\n  ' + bind)), BINDING_OR_OUTSIDE);
  });
  test('negative: ' + button + ': an executable line after the binding fails', () => {
    rejects(edited('js/topdown/app.js', bindingEdit(bind, '  ' + bind + '\n  tdClosePanels();')), BINDING_OR_OUTSIDE);
  });
}
for (const [name, add] of [
  ['a string', "  const open = '{', close = \"}}\";"],
  ['a line comment', '  // a { brace } in a comment {'],
  ['a block comment', '  /* { */'],
  ['a template literal', '  const t = `{ ${pressed} {`;'],
  ['a regular expression', '  const re = /\\{/;'],
]) test('positive: a brace in ' + name + ' inside the approved tdBindTap() passes', () => {
  passes(edited('js/topdown/app.js', insideTap(add)));
});
test('negative: code after tdBindTap() hidden by unbalanced braces in strings fails', () => {
  rejects(edited('js/topdown/app.js', src => replaceOnce(insideTap("  const s = '{';")(src),
    '\n// --- set-up', "\ntdTorchNow(); const t = '}';\n\n// --- set-up")), OUTSIDE);
});
test('negative: a second function next to tdBindTap() fails', () => {
  rejects(edited('js/topdown/app.js', src => replaceOnce(src, '\n// --- set-up', '\nfunction tdExtra(){ tdTorchNow(); }\n\n// --- set-up')), NOT_ONE_FUNCTION);
});
test('negative: a statement after tdBindTap() on its closing line fails', () => {
  rejects(edited('js/topdown/app.js', src => replaceOnce(src, '\n}\n\n// --- set-up', '\n} tdTorchNow();\n\n// --- set-up')), NOT_ONE_FUNCTION);
});
test('negative: a statement after a line separator (U+2028) in the comment above tdBindTap() fails', () => {
  rejects(edited('js/topdown/app.js', src => replaceOnce(src, HELPER_TOP, '// Issue #32\u2028tdTorchNow(); the phone buttons act on')), /a line terminator inside a comment above tdBindTap/);
});
test('negative: tdBindTap() moved inside another function fails', () => {
  rejects(edited('js/topdown/app.js', src => {
    const begin = src.indexOf('function tdBindTap('), end = src.indexOf('\n// --- set-up', begin);
    const fn = src.slice(begin, end).replace(/\n+$/, '');
    return src.slice(0, begin) + 'function tdWrap(){\n' + fn + '\n}\n' + src.slice(end);
  }), /the inserted lines are not the tdBindTap\(\) function/);
});

// Codex QA: these are examples inside the approved function, not extra bindings.
for (const [name, add] of [
  ['a string', "  const example = \"tdBindTap(document.getElementById('tdAction'), () => { });\";"],
  ['a line comment', "  // Example: tdBindTap(document.getElementById('tdTorch'), () => { });"],
  ['a template literal', "  const example = `tdBindTap(document.getElementById('tdDecor'), () => { });`;"],
]) test('positive: a binding example in ' + name + ' is not another binding', () => {
  passes(edited('js/topdown/app.js', insideTap(add)));
});
for (const [name, edit] of [
  ['a multiline template', insideTap('  const example = `\n  ' + ACTION + '\n  ' + TORCH + '\n`;')],
  ['a multiline block comment', insideTap('  /* Example:\n  ' + ACTION + '\n  ' + DECOR + '\n  */')],
  ['a regular expression', insideTap("  const example = /tdBindTap(document.getElementById('tdAction'), () => { });/;")],
  ['the comment above tdBindTap', src => replaceOnce(src, 'function tdBindTap(', '// Example: ' + ACTION + '\nfunction tdBindTap(')],
]) test('positive: an adjacent binding example in ' + name + ' stays in the approved region', () => {
  passes(edited('js/topdown/app.js', edit));
});

test('positive: the approved helper may also be declared after the actual bindings', () => {
  passes(edited('js/topdown/app.js', src => {
    const begin = src.indexOf(HELPER_TOP), end = src.indexOf('// --- set-up', begin);
    assert.ok(begin >= 0 && end > begin, 'test setup: helper block');
    const helper = src.slice(begin, end), without = src.slice(0, begin) + src.slice(end);
    return replaceOnce(without, '\ntdInit();', '\n' + helper + 'tdInit();');
  }));
});
test('negative: bindings inside a late helper cannot substitute for the real bindings', () => {
  rejects(edited('js/topdown/app.js', () => {
    const hud = git(repo, 'show', HUD_HEAD + ':js/topdown/app.js').split('\n');
    const binding = hud.indexOf("  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };"), call = hud.indexOf('tdInit();');
    assert.ok(binding >= 0 && call > binding, 'test setup: original binding and init call');
    // Keep the original onclick lines untouched. A copied reference suffix inside an unused helper must not
    // trick the guard into treating these fake bindings as the real ones in tdInit().
    const fake = ['function tdBindTap(btn, act){', '  ' + ACTION, '  ' + TORCH, '  ' + DECOR + ' // Task 120', ...hud.slice(binding + 3, call)];
    return [...hud.slice(0, call), ...fake, ...hud.slice(call)].join('\n') + '\n';
  }), OUTSIDE);
});

// Codex QA G-04: the approved helper declared after tdInit(), whose body ends, after a `return`, with a copy of the
// three bindings and the rest of the init code. More lines then look like bindings at structurally possible places;
// only the real ones in tdInit() make the inserted block exactly one tdBindTap() declaration.
// Built from the file under test: `real` rewrites the real binding lines, `after` adds lines behind the helper.
const g04 = ({ real = line => line, after = [] } = {}) => src => {
  const cur = src.split('\n');
  const s = cur.findIndex(l => l.startsWith('function tdBindTap(')), e = cur.indexOf('}', s);
  assert.ok(s >= 0 && e > s, 'test setup: approved helper');
  let top = s, bottom = e + 1;
  while (cur[top - 1].startsWith('//')) top--;
  while (cur[bottom] === '') bottom++;
  const bound = [...cur.slice(0, top), ...cur.slice(bottom)]; // the file without the helper
  const b = bound.findIndex(l => l.startsWith('  ' + ACTION)), call = bound.indexOf('tdInit();');
  assert.ok(b >= 0 && call > b && bound[b + 1].startsWith('  ' + TORCH) && bound[b + 2].startsWith('  ' + DECOR), 'test setup: the three bindings and the init call');
  const helper = [...cur.slice(s, e), '  return;', ...bound.slice(b, call)]; // tdInit's own `}` closes it
  const out = bound.slice();
  for (let i = b; i < b + 3; i++) out[i] = real(out[i]);
  return [...out.slice(0, call), ...helper, ...after, ...out.slice(call)].join('\n');
};
test('positive (G-04): binding examples and the init tail after return in a late helper pass, the same way every run', () => {
  let again;
  const first = edited('js/topdown/app.js', src => { const out = g04()(src); again = () => guardIn(sharedClone); return out; });
  passes(first);
  // the same input twice more (written again, as edited() has put the file back)
  for (let i = 0; i < 2; i++) { const r = edited('js/topdown/app.js', g04()); assert.deepEqual([r.status, r.stdout, r.stderr], [first.status, first.stdout, first.stderr]); }
  passes(again()); // and the restored file passes
});
test('negative (G-04 shape): a real binding with another statement after it fails', () => {
  rejects(edited('js/topdown/app.js', g04({ real: line => line.startsWith('  ' + TORCH) ? '  ' + TORCH + ' tdClosePanels();' : line })), OUTSIDE);
});
test('negative (G-04 shape): the real bindings left as the HUD onclick lines (only the examples bind) fails', () => {
  const hudLine = { [ACTION]: "  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };", [TORCH]: "  document.getElementById('tdTorch').onclick = () => { tdTorchNow(); };", [DECOR]: "  document.getElementById('tdDecor').onclick = () => { tdGardenButtonNow(); }; // Task 120" };
  rejects(edited('js/topdown/app.js', g04({ real: line => hudLine[Object.keys(hudLine).find(k => line.startsWith('  ' + k))] })), OUTSIDE);
});
test('negative (G-04 shape): an executable line right after the late helper fails', () => {
  rejects(edited('js/topdown/app.js', g04({ after: ['tdTorchNow();'] })), OUTSIDE);
});

test('the shared checkout is back to the committed files and passes', () => {
  assert.ok(sharedClone, 'test setup: no shared checkout was used');
  assert.equal(git(sharedClone, 'status', '--porcelain', '--', 'js', 'css', 'index.html'), '');
  passes(guardIn(sharedClone));
});
