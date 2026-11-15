'use strict';
const fs = require('node:fs');
const path = require('node:path');

function finalize(output, setup) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'setup.json'), JSON.stringify(setup, null, 2) + '\n');
  const files = [];
  const scan = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'attachments' || entry.name.startsWith('.')) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else {
        const kind = entry.name.endsWith('.webm') ? 'video' : entry.name === 'trace.zip' ? 'trace' : entry.name.endsWith('.png') ? 'screenshot' : null;
        if (kind) files.push({ path: path.relative(output, file), kind, bytes: fs.statSync(file).size });
      }
    }
  };
  scan(path.join(output, 'evidence'));
  fs.writeFileSync(path.join(output, 'evidence-index.json'), JSON.stringify({
    sourceSha: setup.sourceSha,
    counts: Object.fromEntries(['screenshot', 'trace', 'video'].map(kind => [kind, files.filter(f => f.kind === kind && f.bytes > 0).length])),
    files,
  }, null, 2) + '\n');
  const complete = ['summary.json', 'summary.md'].every(name => fs.existsSync(path.join(output, name)));
  if (!complete) {
    for (const name of ['summary.json', 'summary.md']) {
      const file = path.join(output, name);
      if (fs.existsSync(file)) fs.renameSync(file, path.join(output, 'partial-' + name));
    }
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ success: false, runStatus: 'incomplete', reason: 'setup or runner did not produce a complete report', setup, scenarios: [] }, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'summary.md'), '# 채굴 공방 QA — 검증 미완료\n\n설치·환경 준비 또는 실행 과정에서 완전한 플레이 보고서가 생성되지 않았습니다. 테스트 성공으로 판단할 수 없습니다. setup.json 및 Actions 로그를 확인해 주세요.\n');
  }
  return complete;
}
module.exports = { finalize };
if (require.main === module) {
  const output = path.resolve('work/playthrough');
  const complete = finalize(output, {
    sourceSha: process.env.QA_SOURCE_SHA,
    install: process.env.QA_INSTALL_STATUS,
    browser: process.env.QA_BROWSER_STATUS,
    baseline: process.env.QA_BASELINE_STATUS,
    play: process.env.QA_PLAY_STATUS,
  });
  process.stdout.write(fs.readFileSync(path.join(output, 'summary.md'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(output, 'evidence-index.json'), 'utf8'));
  process.stdout.write(`\n증거 파일: 단계/실패 PNG ${index.counts.screenshot}개 · trace ${index.counts.trace}개 · 영상 ${index.counts.video}개. evidence-index.json에 실제 경로와 크기를 기록했습니다.\n`);
  if (!complete) process.exitCode = 1;
}
