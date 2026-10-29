'use strict';
// Runs self-contained test chunks on their own, without the rest of the suite. Such a chunk only
// needs `require`, `__dirname` and `check` (tests/chunks/20.js and 21.js open their own pages with
// tests/stage3-harness.cjs); `npm test` runs them too, with everything else.
//   node tests/run-chunks.cjs        -> 20 and 21
//   node tests/run-chunks.cjs 21     -> the H2 connector checks only
const fs = require('node:fs');
const path = require('node:path');

const chunks = process.argv.slice(2);
if (chunks.length === 0) chunks.push('20', '21');
let total = 0, failed = 0;
function check(name, ok, detail) {
  total++;
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '\n' + detail : ''));
}
for (const n of chunks) {
  const file = path.join(__dirname, 'chunks', n + '.js');
  new Function('require', '__dirname', 'check', fs.readFileSync(file, 'utf8'))(require, __dirname, check);
}
console.log({ chunks, total, failed });
process.exitCode = failed ? 1 : 0;
