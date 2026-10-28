#!/usr/bin/env node
'use strict';
/**
 * Regression test suite for 채굴 공방 (gacha-factory-prototype).
 *
 * The suite lives in tests/chunks/*.js (00.js, 01.js, …) and this file is
 * the npm test entry. Chunks are concatenated in filename order and run
 * with __dirname set to tests/.
 *
 * Between tests the runner closes the test windows the finished test opened
 * and lets the event loop turn once. Node frees a closed jsdom window's
 * context only after such a turn, so without it every window of the run
 * stayed in memory until the end (about 4 GB for the whole suite). The tests
 * themselves still run one after another, each in its own windows.
 *
 * Run: npm test   (or)   node tests/regression.test.js
 */
const fs = require('fs');
const path = require('path');

const chunkDir = path.join(__dirname, 'chunks');
const files = fs.readdirSync(chunkDir).filter((f) => /^\d{2}\.js$/.test(f)).sort();
if (files.length === 0) {
  console.error('tests/chunks is empty');
  process.exit(2);
}
// A test is a top-level `(function test_…() { … })();` (see 00.js): its last
// line is `})();` at the start of a line. The end of a chunk is a boundary too.
const TEST_START = /^\(function\b/;
const TEST_END = /^\}\)\(\);[ \t]*$/;
const BETWEEN = ' await __betweenTests(allDoms);';
// Every start must be closed by one end before the next start, so an end is
// never put inside a test (an unindented nested IIFE, or the text of a string)
// and no test is skipped. Anything else stops the run with the line to look at.
function markTestEnds(f, text) {
  let open = 0;
  const lines = text.split('\n').map((line, i) => {
    if (TEST_START.test(line)) {
      if (open) throw new Error(`tests/chunks/${f}:${i + 1}: a test starts before the test at line ${open} ends with "})();"`);
      open = i + 1;
    } else if (TEST_END.test(line)) {
      if (!open) throw new Error(`tests/chunks/${f}:${i + 1}: "})();" at the start of a line outside a test`);
      open = 0;
      return line + BETWEEN;
    }
    return line;
  });
  if (open) throw new Error(`tests/chunks/${f}:${open}: this test never ends with "})();" at the start of a line`);
  return lines.join('\n');
}
let src;
try {
  src = files.map((f) => {
    const text = fs.readFileSync(path.join(chunkDir, f), 'utf8');
    return f === '99.js' ? text : markTestEnds(f, text) + '\n;' + BETWEEN + '\n';
  }).join('');
} catch (e) {
  console.error('tests/regression.test.js: ' + e.message);
  process.exit(2);
}
const code = src.replace(/^#![^\n]*\n/, '');

// Closes the windows a finished test opened (allDoms, 00.js) and yields once.
async function betweenTests(doms) {
  doms.splice(0).forEach((d) => { try { d.window.close(); } catch (e) { /* ignore */ } });
  await new Promise((resolve) => setImmediate(resolve));
}

const AsyncFunction = (async () => {}).constructor;
new AsyncFunction(
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'process',
  'console',
  '__betweenTests',
  code
)(require, module, exports, __dirname, __filename, process, console, betweenTests).catch((e) => {
  console.error(e);
  process.exit(1);
});
