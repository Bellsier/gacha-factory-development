# Pre-S4 Save HUD Plan

**Goal:** QA-UX-01만 수정한다. 기준224b3da, 브랜치fix/pre-s4-save-hud, Draft PR base=test/playthrough-qa. 병합·배포하지 않는다.

**Approach:** 저장 버튼/상태를 공통 HUD로 묶는다. 월드에서는 상단 우측, 게임 패널이 열리면 하단 탭 위에 놓는다. HUD의 실제 높이만 측정해 패널 스크롤 영역 하단을 HUD 위에서 끝낸다. z-index를 내려 숨기거나 본문 위에 sticky 요소를 덮는 방법은 사용하지 않는다. 기존 모바일 28dvh 상단과 닫기 버튼, 탭/조이스틱의 위치를 유지한다.

**Constraints:** SaveEngine, 저장 키/스키마, 모든 S2Runtime 메서드 중 mount 이외, 자동 저장 주기/권한/복원/삭제, 밸런스, S4 저장 메뉴는 변경하지 않는다. mount의 변경은 DOM 그룹과 읽기 전용 높이 측정에 한정한다. 44px 미만 선택/입력 및 기존 저장 문구 중복은 S4에 남긴다.

1. 같은 격리 프로필에서 기준 CSS/runtime의 가림을 재현하고 PC/모바일 인부·연구·납품·박물관의 상/중/하단 스크린샷을 남긴다.
2. 현재 소스에서 텍스트·조작/패널과 HUD가 겹치면 실패하는 브라우저 검사를 먼저 실행해 RED를 확인한다.
3. CSS와 mount UI만 수정한다. ResizeObserver의 입력은 HUD 크기이며 저장 데이터/게임 상태를 읽거나 쓰지 않는다.
4. 같은 프로필의 기준 코드 저장을 수정 코드에서 정상 이어하고 원본 수동 저장 불변을 확인한다. 실제 저장 버튼 클릭, 긴 이름/반응형/스크롤과 조이스틱/탭 여유를 검사한다.
5. 2781 회귀, S2 38, bootstrap9, PR29 기존10 플레이 시나리오와 추가 HUD 검사를 실행한다. 코드 검토 후 별도 Draft PR/CI 결과를 보고한다.

Artifacts: before/after 단계 PNG, DOM trace/video/콘솔, geometry 수치와 데이터 호환 관찰은 기존 QA 보고서 형식으로 남긴다. 후반 표시용 fixture와 실제 플레이는 구분한다.
