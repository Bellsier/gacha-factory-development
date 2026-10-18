# PR #41 + PR #43 통합 실행 화면

통합 검증 브랜치 `claude/integration-village-character`(main + PR #41 마을 + PR #43 새 주인공)를
Chromium(Playwright)에서 새 게임으로 실행해 찍은 실제 화면입니다. 이동은 PC는 실제 키 입력, 모바일은 터치 조이스틱,
상호작용은 E 키 / 행동 버튼입니다. `*_closeup` 은 같은 스크린샷에서 주인공 주변만 잘라낸 것입니다.

- PC: 1280×800, 확대 3배 / 모바일: iPhone 13 에뮬레이션(390×844), 확대 2배

| 파일 | 장면 |
| --- | --- |
| `*_01_start_workshop` | 새 게임 직후, 공방 앞의 주인공 |
| `*_02_walk_<방향>`, `*_02_idle_<방향>_closeup` | 4방향 걷기(걸음 도중) · 멈춘 모습 |
| `*_03_workshop_village` | 공방 · 감정소 · 박물관 터 사이의 주인공 |
| `*_04_plaza` | 마을 광장 |
| `*_05_house_door` | 내 집 문 앞 (집과 주인공 한 화면) |
| `*_06_house_inside`, `*_06b_house_walk` | 집 안 (E로 들어가 걸어 다님) |
| `*_07_mining` | 철광석 광맥 확보 후 E로 채굴 |
| `*_08_village_panel` | 마을 탭 |
| `*_09_after_reload` | 저장 후 새로고침 (같은 자리 · 같은 방향) |
