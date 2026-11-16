# 그래픽 개선 G0·G1 자료 (2026-11-01)

G0 아트 디렉션과 G1 캐릭터 시안은 승인됐고, G1은 실제 게임에 적용됐습니다(`js/topdown/sprites.js` `tdPlayerSprite`; v2 `tdPlayerSpriteV2`는 이 그림에 마무리 과정을 더한 것이라 함께 바뀜). 기본 스타일(classic)은 그대로이고, 건물·지형·UI 그래픽은 바꾸지 않았습니다. 이 폴더는 게임(`index.html`)이 불러오지 않습니다.

- 구현은 `g1-proposal/proposal.js`와 픽셀 단위로 같습니다(4방향 × 4프레임, classic·v2 모두 사각형 목록 일치).
- 비교 화면과 스크린샷의 "현재"는 G1 적용 **전**(develop `26cee0b`) 그림입니다. `G1-character-compare.html`은 그때의 코드 사본을 담고 있어 지금도 전후 비교로 열립니다. `g1-proposal/compare.html`은 저장소의 현재 코드를 불러오므로, 적용 후에는 "현재"와 "시안" 줄이 같게 나옵니다.
- 적용 후 실제 게임 확인 자료: `screenshots/after/`

## 확정된 방향 (2026-11-01)

- v2를 그래픽 개선 기준으로 채택. 기본값은 아직 바꾸지 않음
- 캐릭터 16×22, 발 위치, 코발트블루 머리 유지. 충돌 영역·이동 속도는 고정
- 건물 개선 순서: 공방 → 집 → 박물관
- 건물 크기와 충돌 영역 변경은 별도 승인 필요
- 그래픽을 UI 전면 개편보다 먼저. 미니맵은 대체 지도 기능 완성까지 유지

## 파일

| 파일 | 내용 |
|---|---|
| `G0_ART_DIRECTION.md` | G0 아트 디렉션 규격서 초안(확정·제안 구분, D1~D8 상태) |
| `G1_REPORT.md` | G1 캐릭터 시안 보고(바꾼 점, 수치, 실제 게임 확인) |
| `G1-character-compare.html` | 하나로 열리는 비교 화면(develop `26cee0b`의 스프라이트 코드 사본 + 시안 포함): 4방향 × 4프레임 × 현재/시안 × classic/v2, 걷기 애니메이션, 수치표 |
| `g1-proposal/proposal.js` | 시안 코드(`tdPlayerSpriteG1`, `tdPlayerSpriteG1V2`). 게임에 연결되지 않음 |
| `g1-proposal/compare.html` | 위 비교 화면의 원본. 저장소의 `js/topdown/sprites.js`·`style.js`를 상대 경로로 불러옴(정적 서버로 저장소 루트를 열고 이 파일 주소로 접속) |
| `g1-proposal/*.cjs` | 캡처·실제 게임 비교·스타일 비교 스크립트(작업 당시 scratch의 도구 `t21/lib.cjs`의 `serve`를 씀. 기록용) |
| `g1-proposal/*.json` | 시안 수치, 스타일 비교 측정, 실제 게임 충돌·속도 기록 |
| `screenshots/` | 방향별 8배 시트(`sheet-*.png`), 실제 게임 장면 현재/시안(`compare-*.png`), 걷기 프레임(`frames-pc-v2.png`), classic·v2 비교(`classic-vs-v2.png`) |
| `GRAPHICS_PLAN.md` | 설계 정합성 검토·개선 계획서(D1~D8 원안) |
| `QA_REPORT_2026-11-01.md` | 종합 게임플레이·그래픽 검증 보고서(본문만. 139장 스크린샷은 크기 때문에 넣지 않음) |
