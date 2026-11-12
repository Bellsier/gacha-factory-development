---
name: mining-workshop-qa
description: Use when checking a change to 《채굴 공방》 (gacha-factory) before a push or a report — running npm test, the browser tests, the scope guard or Biome, reading a red CI run on a PR, checking save (saveVersion 1) compatibility, answering a QA or review result, or writing the Korean QA/completion report. Also use when a test fails only in this container, or when a guard or guard-scope test rejects a change.
---

# 채굴 공방 QA

## Overview

The rules live in `docs/COLLABORATION.md` (§5 test files, §6 common rules, §7 CI). This skill is the procedure that
follows them: what to run here, how to read the results, and how to report them. Reports are in Korean.

**Core principle:** a check counts only if it ran on the current code and you read its result. Anything else is
reported as **NOT VERIFIED**, never as passed.

## First: what is on this branch

`develop` and the stacked PRs (#28 → #38, `docs/COLLABORATION.md` §1) have different test sets. Look before you plan:

```bash
git log --oneline -1; git status --short
ls tests/playthrough tools/check-pre-s4-hud-scope.cjs tests/guard-scope.test.cjs .github/workflows 2>/dev/null
```

| Exists on | Tests |
|---|---|
| `develop` | `npm test` (chunks), `tests/browser-smoke.cjs`, `tests/worldgen-stage3-browser.cjs`, Biome (3 files) |
| stack from #28 | + S2 save tests `tests/save-s2-browser.cjs`, `tests/bootstrap-browser.cjs` |
| stack from #29 | + `tests/playthrough/` (Playwright) and the `Playthrough QA` workflow |
| stack from #30 | + scope guard `tools/check-pre-s4-hud-scope.cjs` |
| #38 | + `tests/guard-scope.test.cjs` |

## Running the checks in this container

The pre-installed Chromium (`/opt/pw-browsers/chromium`, revision 1243) is not the revision the project's
Playwright 1.56.1 expects (1194). Point the tests at it; never run `playwright install`.

| Check | Command (repository root) | Pass looks like |
|---|---|---|
| Regression | `NODE_OPTIONS=--max-old-space-size=5120 npm test` (~5 min, ~3.2 GB) | `Total: N  Pass: N  Fail: 0` |
| Smoke | `node -r ./.claude/skills/mining-workshop-qa/scripts/pw-chromium.cjs tests/browser-smoke.cjs` | `Browser smoke test passed` |
| S2 saves | `CHROMIUM=/opt/pw-browsers/chromium npm run test:saves` | 38 `PASS` lines, `S2 browser tests passed` |
| Bootstrap | `CHROMIUM=/opt/pw-browsers/chromium npm run test:bootstrap` | 9 `PASS` lines |
| World stage 3 | `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:stage3:browser` | only when world generation changed |
| Reporter units | `npm run test:playthrough:reporter` | `# fail 0` twice |
| Scope guard | `node tools/check-pre-s4-hud-scope.cjs` | exit 0, one `Protected game files … match` line |
| Guard tests | `node tests/guard-scope.test.cjs` | `# fail 0`; needs the full history (`git fetch --unshallow` if shallow) |
| Biome (CI) | `npx --yes @biomejs/biome@2.2.5 check --formatter-enabled=false --assist-enabled=false biome.json renovate.json tests/browser-smoke.cjs` | `0 errors`; add changed `.cjs` files to see new problems |
| Playthrough | see **REQUIRED SUB-SKILL** `mining-workshop-playthrough` | |

Run the narrow checks for what changed first, the full set before a push. Long runs go in the background with output
to a file in the scratchpad; read the summary line, not just the exit code.

## Scope guard and protected areas

- The guard fails a PR that changes protected game files (save runtime, world, movement…) or anything in
  `js/topdown/app.js` beyond the approved `tdBindTap()` part. A guard failure means the change is out of scope:
  stop and report it. Never loosen the guard or a guard test to get green; changing either needs the user's approval.
- The guard needs two base commits (`224b3da`, `055588b`). If a parent PR is squash/rebase merged they can vanish and
  the guard fails on purpose; the SHA update steps are in the PR #38 body.
- Each guard-scope clone of the history is ~0.6 GB. A test that leaves clones behind fills the container disk
  (`No space left on device` in unrelated tests). Check `df -h /` when tests fail for no code reason.

## Save compatibility

- `saveVersion` stays **1**. Fields are only added. Saves from the original `main` must still load. Do not change the
  save structure, balance or world generation without the user's approval (`docs/COLLABORATION.md` §6).
- A change near saving needs the S2 save tests (38 groups) and `npm test` (it loads `tests/fixtures/save_v1_*.json`).
- Never weaken an expected value or skip a test to make a save test pass.

## CI on a PR

- Which workflows run depends on the PR's base branch (`docs/COLLABORATION.md` §7). A PR into a stack branch gets only
  `Playthrough QA` (4 jobs: regression, existing-browser, playthrough pc, playthrough mobile).
- Read the run whose head SHA is the commit you pushed. A green run of an older commit proves nothing.
- On red: get the failing job's log (GitHub MCP `get_job_logs`), find the first failing step and assertion, and
  reproduce it locally before changing anything (`superpowers:systematic-debugging`). "Flaky" is not a cause.
  Re-run a job at most once, and only to confirm the failure is not this PR's.

## Report (Korean)

Use this order. Keep test results and browser results apart.

```markdown
**결론** 한두 문장 (무엇을 고쳤고, 지금 상태: 예 `FIX_READY / QA_PENDING`)
- 기준·새 HEAD SHA, 변경 파일, 하지 않은 것(다른 PR·병합·배포)
## 결과
| 로컬 테스트 | 결과 |   ← npm test, reporter, guard, guard-scope, Biome
| 로컬 브라우저 | 결과 | ← smoke, S2, bootstrap, playthrough
- CI: run 링크, 작업별 결과, 첫 실행인지
- 실행하지 않은 것: **NOT VERIFIED**와 이유
## 첫 실패와 재실행 이력   ← 처음 실패한 것, 원인, 조치. 숨기지 않음
## 남은 위험
## 스킬과 Context7 사용     ← 실제 호출한 것, 안 썼으면 한 줄 이유
```

Never write a model name in commits, PR text or code. Never claim a run that did not happen.

## Common mistakes (seen in this project)

| Mistake | Fix |
|---|---|
| Smoke or S2 fails with `Executable doesn't exist … chromium_headless_shell-1194` | Use the preload or `CHROMIUM=` above; S2 also needs `launchPersistentContext` covered |
| Python heredoc wrote a raw U+2028 into a JS regex → `SyntaxError` | Write ` ` escapes; grep the file for non-ASCII after generating it |
| Test helper `git()` trims output, so a file built from `git show` lost its final newline | Add `'\n'` back; compare line counts |
| Negative guard test "passed" because the input was broken, not because of the rule | Assert the rejection reason (stderr), not only a non-zero exit |
| Reported a run on the previous commit | Compare the run's head SHA with `git rev-parse HEAD` |
