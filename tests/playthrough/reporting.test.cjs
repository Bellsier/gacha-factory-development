'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { summarize } = require('./reporter.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { finalize } = require('./ci-summary.cjs');

test('a failed independent scenario cannot be hidden by a later passed scenario', () => {
  const result = summarize([
    { status: 'failed', project: 'pc', lastSuccessfulStage: 'mining' },
    { status: 'passed', project: 'mobile', lastSuccessfulStage: 'restored-copy' },
    { status: 'skipped', project: 'pc' },
  ]);
  assert.deepEqual(result.counts, { passed: 1, failed: 1, skipped: 1, interrupted: 0, timedOut: 0 });
  assert.equal(result.success, false);
  assert.equal(result.scenarios[0].lastSuccessfulStage, 'mining');
});

test('a runner-level failure cannot produce an overall success from passed tests', () => {
  assert.equal(summarize([{ status: 'passed', project: 'pc' }], 'failed').success, false);
});

test('setup failure still produces Korean summary and failed JSON evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playthrough-setup-'));
  try {
    assert.equal(finalize(dir, { install: 'failure', browser: 'skipped' }), false);
    assert.equal(fs.existsSync(path.join(dir, 'summary.md')), true);
    assert.match(fs.readFileSync(path.join(dir, 'summary.md'), 'utf8'), /검증 미완료/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'))).success, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'setup.json'))).install, 'failure');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('finalization preserves a complete play report and only adds setup diagnostics', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playthrough-complete-'));
  try {
    const report = JSON.stringify({ success: true, scenarios: [{ status: 'passed' }] });
    fs.writeFileSync(path.join(dir, 'summary.json'), report);
    fs.writeFileSync(path.join(dir, 'summary.md'), '실제 실행 결과');
    assert.equal(finalize(dir, { install: 'success' }), true);
    assert.equal(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'), report);
    assert.equal(fs.readFileSync(path.join(dir, 'summary.md'), 'utf8'), '실제 실행 결과');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
