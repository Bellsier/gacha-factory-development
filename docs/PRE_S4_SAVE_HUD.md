# S4 이전 저장 HUD 안정화 — QA-UX-01

기준은 `224b3dad86614438ec28ad065bd71d3bbc4b0726`이다. `fix/pre-s4-save-hud`에서만 수정하고 Draft PR의 base를 `test/playthrough-qa`로 둔다. PR28/29, develop, 프리뷰를 수정하거나 병합·배포하지 않는다.

## 원인과 수정

저장 버튼은 화면 우측 top150px(모바일140px), 저장 상태는 하단78px(모바일88px)에 각각 고정돼 있었다. 패널 스크롤 영역은 이 공간을 예약하지 않아 버튼/상태가 설명·능력치·비용·보상을 덮었다.

기존 두 요소를 `#s2Hud`로 묶는다. 일반 월드에서는 기존 버튼 위치에 가까운 상단 우측에 놓는다. 게임/기록 패널을 열면 하단 탭 위의 공통 HUD로 이동하고, 패널 스크롤 영역이 HUD 위에서 끝나도록 한다. 긴 마을 이름과 저장 시각은 줄바꿈하며 잘라내지 않는다. 실제 HUD 높이는 ResizeObserver로 읽어 CSS 변수에만 반영하므로 화면 폭/문구 길이에 따른 높이 변화에도 여백이 맞는다. z-index를 내려 숨기는 방식이 아니다.

기존 버튼 핸들러·문구·저장 화면은 그대로다. PC1280×800과 모바일390×844 외에 320×568, 760×600, 844×390, 1024×640에서도 저장 버튼/상태와 탭·조이스틱·행동/횃불 버튼이 겹치지 않는지 검사한다. S2 HUD가 없는 시험 월드는 `:has(#s2Hud)` 조건으로 기존 패널 영역을 유지하고, classic view에서는 wrapper가 display:contents여서 기존 고정 배치를 유지한다.

## 변경 파일과 이유

| 파일 | 이유 |
| --- | --- |
| css/style.css | HUD의 월드/패널 배치와 실제 높이를 반영한 스크롤 영역 예약 |
| js/save-runtime.js의 mount UI 부분 | 기존 두 요소의 그룹과 읽기 전용 크기 관찰 추가 |
| tests/playthrough/hud-geometry.cjs | 실제 표시 영역·텍스트·조작 영역·버튼 hit test를 읽어 가림 측정 |
| tests/playthrough/hud-occlusion.spec.cjs | 전후 비교, 스크롤/반응형, 실제 저장 접근, 기준 저장 호환 검사 |
| tests/playthrough/fixtures.cjs | S2 가림을 경고가 아닌 실패로 처리. 스크롤 영역 밖 숨은 텍스트는 제외 |
| tests/playthrough/checkpoint.cjs | 후반 박물관 표시 전용 준비 함수 추가. 기존 플레이용 재료 준비 함수는 유지 |
| tools/check-pre-s4-hud-scope.cjs | 게임 파일과 S2 동작 메서드/초기 필드의 기준 버전 불변 검사 |
| .github/workflows/playthrough-qa.yml | 새 base 브랜치에서 실행하고, 변경 허용 범위를 mount UI/CSS로 제한 |

## 가림 검사와 전후 비교

새 검사2개(PC/모바일)는 기준 CSS와 runtime을 `git show 224b3da`로 제공해 **실제로 가림이 검출되는 것**부터 확인한다. 인부·연구·납품·박물관의 상/중/하단을 각각 촬영한다. 이후 같은 격리 프로필에서 현재 코드로 새로고침·최근 마을 이어하기를 하고, 같은 마을의 수정 후 화면을 촬영한다. 기준 관찰의 알려진 가림과 현재 코드의 회귀 실패는 구분한다.

현재 코드에서 저장 HUD가 패널/표시된 텍스트/버튼·입력/탭·게임 조작을 침범하거나, 버튼이 화면 밖·가려짐 상태면 실패한다. 기존10개 플레이 검사에서도 S2 HUD 본문 가림을 발견하면 실패한다. 가림 측정은 overflow 스크롤 영역으로 잘린 **보이는 부분만** 계산한다. 숨은 텍스트의 layout box가 공통 HUD 위치와 겹치는 것은 화면 가림이 아니다. 이 오탐은 실제 납품 검사 실패에서 재현한 뒤 수정했다.

스크롤 샘플 위치는 DOM scrollTop으로 맞추되, 별도로 실제 mouse wheel/Chromium touch 제스처가 스크롤을 움직이는지도 확인한다. 각 패널에서 저장 버튼을 실제 클릭/tap하고 기존 저장 화면이 열리는지 확인한다. 기록 패널과 일반 월드 접근도 검사한다. 화면 준비는 명시된 마을/박물관 fixture이며 신규 게임 완주로 세지 않는다.

`CHROMIUM=/usr/bin/chromium QA_VIDEO=off npm run test:playthrough -- hud-occlusion.spec.cjs`로 로컬 재현한다. CI는 공식 Playwright Chromium과 영상을 사용한다. 기존10개와 새2개는 `npm run test:playthrough`로 함께 실행한다. 브라우저 프로필/저장은 모두 새 context와 localhost만 사용한다.

로컬 최종 실행: 전체2781/2781, S2 38개 그룹, bootstrap9개 그룹, 기존10+새2=12개 브라우저 시나리오/170단계가 통과했다. 수정 코드 geometry36개 샘플과 텍스트/조작 측정에서 S2 가림0, 실제 wheel/touch 스크롤8회 확인, 보고서 자체 검사4개도 통과했다. 기준 코드에서는 PC 저장 버튼3394.6875px², 모바일 저장 상태15372px²의 패널 침범을 검출해 RED를 확인했다. 로컬 영상은 기존 환경 제한으로 끄고 원본 PNG/DOM trace를 수집했으며 CI 영상/실행 결과는 PR에서 확인한다.

## 저장 데이터 호환

- SaveEngine·IndexedDB 스키마·키·codec·밸런스·저장 주기·복원/삭제/권한 코드는 수정하지 않는다.
- scope guard는 index.html/js/css 중 style.css와 save-runtime.js만 허용한다. S2Runtime의 모든 초기 필드와 mount 이외 메서드는 기준 원문과 일치해야 한다. mount diff는 DOM 그룹/geometry 관찰만 포함한다.
- 기준 코드가 실제 자동·수동 저장한 같은 마을을 현재 코드로 정상 이어한다. 마을 식별자, 인부4명, 박물관18종이 유지되고, 원본 수동 저장 레코드 전체가 그대로임을 확인한다. saveVersion1 형식을 유지한다.
- 기존 전체2781, S2브라우저38개 그룹, bootstrap9개 그룹과 PR29의 기존10개 시나리오를 유지한다. 최종 실제 실행 결과와 SHA/CI/아티팩트 링크는 Draft PR 본문에 기록한다.

## 스크린샷과 남은 항목

[전후 비교 모음](screenshots/pre-s4-save-hud/README.md)에는 PC/모바일의 네 대상 패널 대표16장을 둔다. 모든 상/중/하단, 일반 월드, 저장 화면, 반응형 화면과 geometry는 CI 원본 아티팩트에도 포함한다. 모바일은 Chromium 터치·DPR1, 외부 웹폰트는 기존 QA와 동일한 대체 글꼴 기준이다.

이번 해결 범위는 **#s2Open/#s2Status가 게임 패널을 가리는 QA-UX-01**이다. [S4 대기 목록](S4_SAVE_UI_BACKLOG.md)의 작은 터치 영역과 기존 저장 문구 중복은 변경하지 않는다. S4 저장 화면 디자인/기능도 추가하지 않는다.
