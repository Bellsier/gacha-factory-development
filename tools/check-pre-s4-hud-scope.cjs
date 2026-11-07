'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = '224b3dad86614438ec28ad065bd71d3bbc4b0726';
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const changed = git(['diff', '--name-only', base, '--', 'index.html', 'js', 'css']).split('\n').filter(Boolean);
for (const file of changed) assert(['css/style.css', 'js/save-runtime.js'].includes(file), 'Protected game file changed: ' + file);
const runtime = source => vm.runInNewContext(source + '\nS2Runtime;', {}, { timeout: 1000 });
const before = runtime(git(['show', base + ':js/save-runtime.js']));
const after = runtime(fs.readFileSync(path.join(root, 'js/save-runtime.js'), 'utf8'));
assert.deepEqual(Object.keys(after), Object.keys(before), 'S2 runtime fields/methods must stay unchanged');
for (const name of Object.keys(before)) {
  if (name === 'mount') continue; // UI-only DOM grouping and height measurement are reviewed in the diff.
  if (typeof before[name] === 'function') assert.equal(String(after[name]), String(before[name]), 'S2 behavior changed: ' + name);
  else assert.equal(JSON.stringify(after[name]), JSON.stringify(before[name]), 'S2 initial state changed: ' + name);
}
console.log('Protected game files and all S2 methods/fields except mount UI match ' + base);
