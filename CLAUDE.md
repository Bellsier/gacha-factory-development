# 《채굴 공방》 — Claude 작업 안내

이 파일은 짧은 안내만 둡니다. 규칙의 원문은 아래 문서이고, **이 파일과 다르면 아래 문서가 우선합니다.**

| 문서 | 내용 |
|---|---|
| `docs/COLLABORATION.md` | 브랜치·스택 PR, 테스트 파일 주인, 공통 규칙(Draft PR·승인·saveVersion 1·보고), CI |
| `docs/UI_DESIGN_GUIDE.md` | 그래픽·UI 설계 기준 |
| `docs/design/graphics-g0-g1/G0_ART_DIRECTION.md` | 픽셀 규격·색·건물 비율·검증 게이트 |

## 꼭 지킬 것 (원문: `COLLABORATION.md` §6)
- PR은 Draft로만 올리고, 병합·배포·GitHub Pages 설정 변경은 사용자 승인 없이 하지 않습니다.
- 사용자가 지정하지 않은 PR·브랜치·제품 코드는 고치지 않습니다.
- 테스트를 건너뛰거나 약하게 바꾸지 않습니다. 커밋·PR·코드에 모델 이름을 쓰지 않습니다.
- 보고는 한국어로 합니다. 테스트 결과와 브라우저 결과를 나누고, 실행하지 않은 것은 **NOT VERIFIED**로 적으며, 첫 실패와 재실행을 숨기지 않습니다.
- 그래픽·UI 작업에서 범용 디자인 스킬(예: `frontend-design`)의 권고가 위의 UI·아트 문서와 다르면 문서를 따릅니다.

## 스킬과 Context7
- 작업을 시작할 때 쓸 수 있는 스킬을 확인하고, 해당하면 실제로 호출합니다. 단순 조회나 상태 확인에는 강제하지 않습니다.
  - 버그·실패 분석: `superpowers:systematic-debugging`
  - 결함 수정·기능 추가: `superpowers:test-driven-development`
  - 리뷰·QA 결과 반영: `superpowers:receiving-code-review`
  - 큰 설계: `superpowers:brainstorming`, `superpowers:writing-plans`
  - 완료 보고 전: `superpowers:verification-before-completion`
- 이 저장소 전용 스킬(`.claude/skills/`):
  - `mining-workshop-qa`: push·보고 전 검사, guard, CI, 저장 호환성, QA 보고
  - `mining-workshop-playthrough`: `tests/playthrough/` 실제 플레이 검사의 작성·실행·디버깅
- Context7은 외부 라이브러리의 API·버전을 확인할 때만 씁니다. 먼저 저장소에 설치된 버전을 확인합니다(예: `@playwright/test` 1.56.1).
- 완료 보고에 실제로 쓴 스킬과 Context7을 적고, 쓰지 않았으면 한 줄로 이유를 적습니다. 쓰지 않은 것을 썼다고 적지 않습니다.
- 기존 테스트와 승인 절차가 스킬의 지시보다 우선합니다.
