'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = '224b3dad86614438ec28ad065bd71d3bbc4b0726';
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const hudHead = '055588bb3e979147bb3f723c1ee2b6e85b5ff5ad';
// Issue #32 E: both base commits are required. A shallow or partial checkout without one of them must FAIL
// with a clear message — before, a missing HUD head silently skipped the UX-01 scope check and the guard passed.
for (const [name, sha] of [['S2/playthrough base (#29 head)', base], ['pre-S4 HUD head (#30 head)', hudHead]]) {
  try { execFileSync('git', ['cat-file', '-e', sha + '^{commit}'], { cwd: root, stdio: 'ignore' }); }
  catch {
    console.error(`Guard cannot run: the required ${name} ${sha} is not in this checkout (a shallow clone?). ` +
      'Fetch the full history (actions/checkout fetch-depth: 0, or git fetch --unshallow) and run it again.');
    process.exit(1);
  }
}
const changed = git(['diff', '--name-only', base, '--', 'index.html', 'js', 'css']).split('\n').filter(Boolean);
for (const file of changed) assert(['css/style.css', 'js/save-runtime.js', 'js/ui.js', 'js/topdown/app.js'].includes(file), 'Protected game file changed: ' + file);
// UX-01 (Issue #32, approved 2026-11-07): stacked on the pre-S4 HUD head. Since that head only the recipe
// card UI (js/ui.js) and its card styles (css/style.css) may change; S2 runtime, engine, state, balance,
// world and every other game file stay as the HUD head left them.
const sinceHud = git(['diff', '--name-only', hudHead, '--', 'index.html', 'js', 'css']).split('\n').filter(Boolean);
for (const file of sinceHud) assert(['css/style.css', 'js/ui.js', 'js/topdown/app.js'].includes(file), 'UX-01 may only change js/ui.js, css/style.css and js/topdown/app.js after the HUD head: ' + file);
// PR #38: js/topdown/app.js is allowed ONLY for the phone action button's tap — the tdBindTap() function (with
// the comment block right above it) and the one line that binds #tdAction with it. Take those two back out
// (the binding line back to the HUD head's onclick line) and the file must equal the HUD head's byte for byte;
// any other change (movement, world, collision, saving, another button...) fails.
if (sinceHud.includes('js/topdown/app.js')) {
  const stripApprovedTap = (src) => {
    const start = src.indexOf('function tdBindTap(');
    assert(start >= 0, 'js/topdown/app.js changed but has no tdBindTap(): only the approved tap handling may change');
    let from = src.lastIndexOf('\n', start - 1) + 1; // the comment block right above the function
    for (;;) { const prev = src.lastIndexOf('\n', from - 2) + 1; if (from === 0 || !src.slice(prev, from).startsWith('//')) break; from = prev; }
    let depth = 0, end = src.indexOf('{', start);
    for (let i = end; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i + 1; break; } }
    while (src[end] === '\n') end++;
    const bind = /^  tdBindTap\(document\.getElementById\('tdAction'\), \(\) => \{ tdInteractNow\(\); \}\);.*$/m;
    assert(bind.test(src), 'js/topdown/app.js: the #tdAction tdBindTap binding line is missing or changed');
    return (src.slice(0, from) + src.slice(end)).replace(bind, "  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };");
  };
  const approvedOnly = stripApprovedTap(fs.readFileSync(path.join(root, 'js/topdown/app.js'), 'utf8'));
  assert.equal(approvedOnly, git(['show', hudHead + ':js/topdown/app.js']) + '\n', 'js/topdown/app.js changed outside the approved tdBindTap() / #tdAction binding');
}
const runtime = source => vm.runInNewContext(source + '\nS2Runtime;', {}, { timeout: 1000 });
const before = runtime(git(['show', base + ':js/save-runtime.js']));
const after = runtime(fs.readFileSync(path.join(root, 'js/save-runtime.js'), 'utf8'));
assert.deepEqual(Object.keys(after), Object.keys(before), 'S2 runtime fields/methods must stay unchanged');
for (const name of Object.keys(before)) {
  if (name === 'mount') continue; // UI-only DOM grouping and height measurement are reviewed in the diff.
  if (typeof before[name] === 'function') assert.equal(String(after[name]), String(before[name]), 'S2 behavior changed: ' + name);
  else assert.equal(JSON.stringify(after[name]), JSON.stringify(before[name]), 'S2 initial state changed: ' + name);
}
console.log('Protected game files and all S2 methods/fields except mount UI match ' + base + '; since ' + hudHead + ' only js/ui.js, css/style.css and the approved tdBindTap part of js/topdown/app.js changed');
