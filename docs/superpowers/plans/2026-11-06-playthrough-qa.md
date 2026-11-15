# Playthrough QA Implementation Plan

> Execute inline with superpowers:executing-plans. The user's Playwright QA 1차 request is the approved scope; no product implementation, merge, or deployment.

**Goal:** 실제 조작을 포함한 독립 PC·모바일 플레이를 CI에서 실행하고 도달 지점과 결함의 증거를 남긴다.
**Architecture:** 기존 Playwright 1.56.1/Chromium 방식을 재사용한다. @playwright/test의 독립 context, trace, video와 테스트 전용 localhost 서버를 사용한다. 무주입 여정과 준비 자원 기반 후반 여정을 분리한다.
**Tech Stack:** Node 22, @playwright/test 1.56.1, Chromium, GitHub Actions.
**Spec:** 사용자의 Playwright 자동 플레이 QA 1차 지시 및 `docs/PLAYTHROUGH_QA.md`.

## Global Constraints

- 기준 f5169308b1659913119f8b035e5998a0543c538d, 브랜치 test/playthrough-qa, 별도 Draft PR.
- 게임 코드·저장 엔진·밸런스·기존 2,781 회귀/S2 38/부트스트랩 9개 검사 변경 금지.
- develop/PR28/S3/사용자 origin 접근·병합·배포 금지.
- 상태 쓰기는 명시된 준비 단계에서만 허용. 실제 조작 단계는 입력과 읽기 전용 관찰만 사용.
- 실패는 숨기지 않으며 독립 테스트는 계속 실행한다. 미구현과 미도달을 구분한다.

## Review Focus

- 페이지 오류 또는 실패 뒤에도 결과 JSON/스크린샷이 남는가.
- 실제 플레이가 준비용 주입이나 게임 함수 직접 호출로 대체되지 않는가.
- 모바일 조이스틱이 진짜 touch 입력을 사용하는가.
- 마지막 성공 단계가 실패/미구현/후반 준비 여부와 함께 보고되는가.
- CI 실패 때도 artifact와 job summary가 업로드되는가.

### Task 1: Runner와 증거 수집

Files: package.json/lock, tests/playthrough.config.cjs, tests/playthrough/{server,fixtures,reporter}.cjs.
- [ ] 기존 회귀의 깨끗한 기준 실행 확인.
- [ ] 보고서 상태 집계의 실패 전파 검사를 먼저 작성하고 실패를 확인한다.
- [ ] 서버 localhost 제한, context 분리, PC/모바일, 모든 단계 스크린샷·콘솔·trace·video 구현.
- [ ] 집계 검사와 Playwright 목록 조회 통과.

### Task 2: 실제 플레이와 후반 콘텐츠

Files: tests/playthrough/*.spec.cjs, navigation.cjs, checkpoint.cjs, docs/PLAYTHROUGH_QA.md.
- [ ] 무주입 새 마을·충돌·이동·근접 채굴·제작·판매·첫 인부·저장·재접속·복원 사본 여정.
- [ ] 자원/화폐만 준비한 뒤 해금·연구·제작소·업그레이드·후반 제품·시설 이용을 UI로 확인.
- [ ] 독립 로딩/저장소 오류·재시도와 UI 감사. 구현 안 된 최종 설계는 별도 표기.
- [ ] PC·모바일 실행, 실패가 있으면 원인 조사 후 테스트 구현 오류와 게임 결함을 구분.

### Task 3: CI와 검토 제출

Files: .github/workflows/playthrough-qa.yml, docs/PLAYTHROUGH_QA_REPORT.md.
- [ ] 항상 업로드하는 artifacts와 한국어 단계 보고서, workflow_dispatch/PR 실행.
- [ ] 전체 회귀·기존 브라우저·신규 E2E 실행. 독립 코드 검토.
- [ ] 새 브랜치만 push, Draft PR 생성, GitHub Actions 실제 결과와 artifact 확인.
- [ ] 도달 지점·미검증·버그 재현·위험을 한국어로 보고하고 검토 대기.
