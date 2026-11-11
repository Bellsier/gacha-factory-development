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
// PR #38: js/topdown/app.js is allowed ONLY for the phone action button's tap: one function declaration
// tdBindTap() (with the // comment lines right above it) inserted at the top level, and the line that binds #tdAction
// with it in place of the HUD head's onclick line. Everything else must equal the HUD head byte for byte.
// Where tdBindTap() ends is decided by the JavaScript engine, not by counting braces, so braces in strings,
// comments, template literals or regular expressions are just text, and code can not hide past its end.
if (sinceHud.includes('js/topdown/app.js')) {
  const fail = msg => assert.fail('js/topdown/app.js: ' + msg);
  const lines = fs.readFileSync(path.join(root, 'js/topdown/app.js'), 'utf8').split('\n');
  const hudLines = execFileSync('git', ['show', hudHead + ':js/topdown/app.js'], { cwd: root, encoding: 'utf8' }).split('\n');
  // A line comment ends at any JavaScript line terminator, so after one of these the rest of the "comment" is code.
  const oneLineComment = text => /^\/\/[^\r\u2028\u2029]*$/.test(text);
  // 1. The binding line: exactly the approved statement, then nothing, or one // comment to the end of the line.
  const BIND = "  tdBindTap(document.getElementById('tdAction'), () => { tdInteractNow(); });";
  const HUD_BIND = "  document.getElementById('tdAction').onclick = () => { tdInteractNow(); };";
  const hudBinding = hudLines.indexOf(HUD_BIND);
  if (hudBinding < 0 || hudLines.lastIndexOf(HUD_BIND) !== hudBinding) fail('the required HUD head has no unique #tdAction binding');
  // One inserted helper can only leave the reference binding at its old offset or shift it by k lines.
  // Examples inside strings/comments/templates never select a slot by their text alone.
  const k = lines.length - hudLines.length;
  const bindings = [...new Set([hudBinding, hudBinding + k])].filter(b => {
    if (b < 0 || b >= lines.length || !lines[b].startsWith(BIND)) return false;
    const rest = lines[b].slice(BIND.length);
    return rest === '' || oneLineComment(rest.replace(/^[ \t]+/, ''));
  });
  if (!bindings.length)
    fail('the #tdAction tdBindTap binding line is missing or changed (only an end-of-line // comment may follow it)');
  // 2. With the HUD head's onclick line back, the only difference left must be one block of inserted lines.
  const matches = bindings.flatMap(b => {
    const normalized = lines.slice();
    normalized[b] = HUD_BIND;
    let p = 0;
    while (p < hudLines.length && normalized[p] === hudLines[p]) p++;
    // The candidate must map to the reference line OUTSIDE the insertion, not a copied suffix in a helper.
    if (k <= 0 || b !== hudBinding + (p <= hudBinding ? k : 0) ||
        normalized.slice(p + k).join('\n') !== hudLines.slice(p).join('\n')) return [];
    return [{ normalized, p }];
  });
  if (matches.length !== 1) fail('changed outside the approved tdBindTap() / #tdAction binding');
  const { normalized, p } = matches[0];
  const block = normalized.slice(p, p + k);
  // 3. That block: // comment lines, then the function, then blank lines. Nothing else.
  let c = 0;
  while (c < block.length && block[c].startsWith('//')) { if (!oneLineComment(block[c])) fail('changed outside the approved tdBindTap() / #tdAction binding (a line terminator inside a comment above tdBindTap)'); c++; }
  let e = block.length;
  while (e > c && block[e - 1].trim() === '') e--;
  const fn = block.slice(c, e).join('\n');
  if (!fn.startsWith('function tdBindTap(')) fail('changed outside the approved tdBindTap() / #tdAction binding (the inserted lines are not the tdBindTap() function)');
  // 4. The engine's view. The whole file runs as the body of a function that first returns tdBindTap: a top-level
  // function declaration is hoisted, so it is returned before any statement of the file runs (nothing of the game
  // runs). Function.prototype.toString gives the exact source of that declaration; it must be the whole inserted
  // function — if any other code followed it inside the block, or it sits inside a string, comment or another
  // function instead of the top level, the texts differ or tdBindTap is not there.
  let declared;
  try {
    declared = vm.runInNewContext('(function(){ return tdBindTap;\n' + normalized.join('\n') + '\n})()', {}, { timeout: 1000 });
  } catch (err) { fail('tdBindTap() is not a top-level function declaration (' + err.message + ')'); }
  if (typeof declared !== 'function' || Function.prototype.toString.call(declared) !== fn)
    fail('changed outside the approved tdBindTap() / #tdAction binding (the inserted block is not exactly one tdBindTap() function)');
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
