// Focused H2 runner: avoid repeating the stage-3 graphics/performance reviews.
const fs = require('node:fs');
let total = 0, failed = 0;
function check(name, ok, detail) {
  total++; if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '\n' + detail : ''));
}
new Function('require', '__dirname', 'check', fs.readFileSync(__dirname + '/chunks/21.js', 'utf8'))(require, __dirname, check);
console.log({ total, failed });
process.exitCode = failed ? 1 : 0;
