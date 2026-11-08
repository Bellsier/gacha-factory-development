# UX-01 POST-QA B/D: 목표 재고 입력 중 재렌더 (Issue #32)

- **B (불완전 숫자 소실):** 목표 재고 7에서 "1e"를 입력하는 중에 카드가 다시 그려지면(`renderAll()`, 예: 터널 공사 완료), 목표가 0(제한 없음)이 되어 자동 제작 제한이 풀림
- **D (조합 연속성):** 조합 중 다시 그리면 CDP 합성 조합이 `12→123`이 아니라 `12312`가 됨
- **근거:** Codex POST-QA #6716815177, 수정 지시 #6718864219

## 수정 (`js/ui.js` 제작 카드 rebuild·입력 change만)
- 같은 run의 목표 재고 칸이 편집 중(포커스가 있음)이면 `buildRecipes()`가 다시 그리기를 미룹니다. 포커스가 칸을 떠나면(그 칸의 change 뒤) 바로 다시 그립니다. 다른 run(새 마을·복원·재접속)은 기다리지 않습니다.
- 다시 그리는 도중 제거되는 칸에서 생긴 change와, 다른 run에서 만든 칸의 change는 목표를 바꾸지 않습니다.
- 불완전 숫자(`validity.badInput`)는 "지운 빈칸"과 구분합니다. 목표를 유지하고 칸에 현재 목표를 다시 표시합니다. 의도적으로 지운 빈칸은 기존대로 제한 없음(0)입니다.
- 바꾸지 않은 것: `systems.js`(`setCraftTarget` 정규화), 저장 엔진, saveVersion1, 밸런스, 월드, #30 HUD

## 증거
| 파일 | 내용 |
|---|---|
| `diag-before-after.jsonl` | 같은 Chromium 측정(`bd-diag.cjs`). 전 `c04e2cd`: 목표 7→**0**, 2초 뒤 강철 7→27(제한 풀림), 조합 `12312`. 후: 목표 **7**, 강철 7, 조합 `123`(대조군과 같음) |
| `before-fix/recipe-draft-spec.txt` | `tests/playthrough/recipe-draft.spec.cjs`를 수정 전 ui.js로 실행: PC·모바일 모두 03단계 실패 |
| `after-fix/` | 같은 spec을 수정본으로 실행: PC·모바일 9단계 모두 통과(`summary.json`, 주요 단계 화면) |

- 조합은 CDP `Input.imeSetComposition` 합성입니다. **실제 OS 한글 IME(Windows·macOS·Android·iOS)는 NOT VERIFIED입니다.**
- 재렌더는 게임의 `renderAll()`을 직접 호출했습니다. 터널 공사 완료가 부르는 함수와 같지만, 실제 공사 완료 흐름을 재현한 것은 아닙니다.
