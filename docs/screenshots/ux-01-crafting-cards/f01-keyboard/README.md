# UX-01 F-01: 제작 카드 체크박스 Space (Issue #32)

- **결함:** 자동 제작·자동 판매 체크박스에서 Space를 누르면 체크가 바뀌지 않고 월드 행동(`tdInteractNow`)이 1회 일어남.
  - Codex 보고 #6707681302, 원인 분석 #6707960528
  - 원인: 전역 Space 처리가 `preventDefault()`로 체크박스의 기본 토글을 취소함
- **수정:** `js/ui.js`의 `recipeSummaryKeydown()`이 summary와 함께, 활성화된 `[data-autocraft]`·`[data-autoselltoggle]` 체크박스의 Space 전파만 멈춤(`stopPropagation()`).
  - `preventDefault()`, 인위적인 click, checked·state 직접 변경은 없습니다.
  - 체크·해제는 브라우저 기본 동작과 기존 change 핸들러가 합니다.
- **검사:** `tests/playthrough/recipe-keyboard.spec.cjs`. 실제 Chromium 키보드 입력만 씁니다(`page.keyboard.press`). 합성 keydown, `check()`, `setChecked()`는 쓰지 않습니다.

| 폴더 | 내용 |
|---|---|
| `before-fix/` | 같은 spec을 수정 전 `js/ui.js`(PR head `159aaa5`)로 실행한 결과. PC·모바일 모두 3단계(자동 제작 Space)에서 실패(`result.txt`, 실패 화면) |
| `after-fix/` | 수정본으로 실행한 결과. PC·모바일 모두 8단계 통과(`summary.json`, 주요 단계 화면) |

단계: `01-setup` → `02-summary-keys`(Enter 열기, Space 닫기·열기) → `03-autocraft-space`(Tab 진입, Space OFF→ON→OFF, click/change/input 각 1회, 월드 0) → `04-autocraft-works`(켠 자동 제작이 실제로 생산) → `05-autosell-space`(실제 구매, 새 토글 포커스, Space ON→OFF→ON→OFF) → `06-closed-details-tab`(닫힌 상세는 Tab 제외) → `07-movement-contract`(체크박스 포커스에서 d·ArrowLeft 이동, keyup에서 정지) → `08-pointer`(마우스 또는 터치 체크·해제)
