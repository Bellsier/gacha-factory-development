'use strict';
const fs = require('node:fs');
const path = require('node:path');

function summarize(scenarios, runStatus = 'passed') {
  const counts = { passed: 0, failed: 0, skipped: 0, interrupted: 0, timedOut: 0 };
  for (const scenario of scenarios) counts[scenario.status] = (counts[scenario.status] || 0) + 1;
  return { success: runStatus === 'passed' && counts.failed + counts.timedOut + counts.interrupted === 0 && counts.passed > 0, counts, scenarios };
}
const cell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
class JourneyReporter {
  constructor(options = {}) { this.output = options.output || 'work/playthrough'; this.results = []; this.errors = []; }
  onError(error) { this.errors.push(error.message || String(error)); }
  onTestEnd(test, result) {
    const attachment = result.attachments.find(a => a.name === 'journey.json');
    let journey = {};
    try { if (attachment) journey = JSON.parse(attachment.body || fs.readFileSync(attachment.path)); }
    catch (error) { journey = { reportError: String(error) }; }
    this.results.push({
      project: test.parent.project().name, title: test.title, status: result.status,
      expectedStatus: test.expectedStatus, durationMs: result.duration,
      errors: result.errors.map(e => e.message), ...journey,
      attachments: result.attachments.filter(a => a.path).map(a => ({ name: a.name, path: path.relative(this.output, a.path) })),
    });
  }
  onEnd(result) {
    fs.mkdirSync(this.output, { recursive: true });
    const report = { sourceSha: process.env.QA_SOURCE_SHA || 'local-uncommitted-checkout', runStatus: result.status, runnerErrors: this.errors, ...summarize(this.results, result.status) };
    fs.writeFileSync(path.join(this.output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    const lines = ['# 채굴 공방 자동 플레이 QA', '', `실행: ${result.status} · 통과 ${report.counts.passed} · 실패 ${report.counts.failed + report.counts.timedOut} · 건너뜀 ${report.counts.skipped}`, '',
      '준비 자원 사용 여정은 무주입 전체 플레이 완료를 뜻하지 않습니다.', '', '| 환경 | 시나리오 | 결과 | 마지막 성공 단계 |', '| --- | --- | --- | --- |'];
    for (const scenario of this.results) lines.push(`| ${cell(scenario.project)} | ${cell(scenario.title)} | ${cell(scenario.status)} | ${cell(scenario.lastSuccessfulStage || '없음')} |`);
    for (const scenario of this.results) {
      lines.push('', `## ${scenario.project}: ${scenario.title}`, '', `준비: ${scenario.preparation || '없음'}`, '', '| 단계 | 구분 | 결과 |', '| --- | --- | --- |');
      for (const stage of scenario.stages || []) lines.push(`| ${cell(stage.title)} | ${cell(stage.mode)} | ${cell(stage.status)} |`);
      for (const finding of scenario.findings || []) lines.push('', `### ${finding.id}: ${finding.severity} — ${finding.location}`, '',
        `재현: ${finding.steps}`, '', `기대: ${finding.expected}`, '', `실제: ${finding.actual}`, '',
        `증거: ${finding.evidence}`, '', `추정 원인: ${finding.cause}`, '', `권장: ${finding.recommendation}`);
      if (scenario.errors.length) lines.push('', '```text', ...scenario.errors, '```');
    }
    fs.writeFileSync(path.join(this.output, 'summary.md'), lines.join('\n') + '\n');
  }
}
module.exports = JourneyReporter;
module.exports.summarize = summarize;
