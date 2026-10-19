# 공동 개발 작업 규칙 (Claude · Codex)

《채굴 공방》 개발 저장소 `Bellsier/gacha-factory-development`에서 Claude와 Codex가 함께 작업할 때 지키는 규칙입니다.
원본 저장소 `Bellsier/gacha-factory-prototype`은 이 저장소에서 건드리지 않습니다.

## 1. 브랜치 구성

| 브랜치 | 내용 | 규칙 |
| --- | --- | --- |
| `develop` (기본) | 원본 PR #48의 HEAD `d7fb835` 그대로. 커밋 188개 이력 보존 | 직접 push 금지. Draft PR로만 바뀌고, 병합은 사용자 승인 후에만 |
| `prototype-main` | 원본 `main`의 `d31da01` 그대로. 커밋 168개 이력 보존 | 보존용. 커밋·push·삭제 금지 |
| `claude/graphics-<주제>` | Claude의 그래픽 작업 | `develop`에서 분기, `develop`으로 Draft PR |
| `codex/worldgen-<주제>` | Codex의 월드 생성 작업 | `develop`에서 분기, `develop`으로 Draft PR |
| `chore/*`, `test/*`, `docs/*` | 개발 환경 정리·점검·문서 | 게임 코드 변경 없음. `develop`으로 Draft PR |

- 주제마다 브랜치를 하나씩 만들고, 작게 나눠 PR을 올립니다(예: `claude/graphics-house-1p5x`, `codex/worldgen-seeded-chunks`).
- 서로의 브랜치에는 push하지 않습니다.
- `develop`의 새 변경을 받을 때는 내 브랜치에 `develop`을 **merge**합니다. rebase나 force push로 공유된 이력을 고치지 않습니다.

## 2. Claude: 그래픽 브랜치 (`claude/graphics-*`)

**맡는 일:** 스프라이트, 스타일(v2), 해상도(1.5x), 바닥 타일의 그림, 조명의 표현, 스크린샷 비교 자료

**주로 고치는 파일**
- `js/topdown/sprites.js`
- `js/topdown/style.js`
- `js/topdown/hires.js`
- `js/topdown/tiles.js` 중 그리는 부분(`tdPaintTileMap`, `tdPaintVillageGround`, v2 잔디·돌길)
- `docs/screenshots/`

**하지 않는 일**
- 타일 종류를 정하는 규칙(`tdTileAt`)과 월드 생성
- `js/worldindex.js`
- 충돌 상자(`HOUSE_BOX`, `WORLD_OBSTACLE_BOXES`), 이동, 저장
  - 그림 크기에 맞춰 충돌을 바꿔야 하면 PR에 따로 적고 사용자 승인을 받습니다(PR #44 방식).

**지킬 것**
- 같은 위치·카메라·밝기로 찍은 전후 Chromium 스크린샷을 PR에 붙입니다.
- 1.5x 일괄 적용처럼 범위가 큰 변경은 사용자 승인 후에만 합니다.

## 3. Codex: 월드 생성 브랜치 (`codex/worldgen-*`)

**맡는 일:** 월드 확장 3단계 이후(`docs/WORLD_EXPANSION_2048.md` 8~9절)
- `(seed, 청크)` 결정적 생성기
- 스트리밍
- 숲길로 이어지는 새 지역
- 거점과 빠른 이동

**주로 고치는 파일**
- `js/topdown/tiles.js` 중 타일 종류 부분(`tdTileAt`, `tdBuildTileMap`의 `chunk`/`typeAt`)
- 월드·지형·광맥·풍경 생성 코드
- `js/worldindex.js`
- 새 생성기 파일

**하지 않는 일**
- 스프라이트·스타일·해상도 그림(`sprites.js`, `style.js`, `hires.js`)

**지킬 것: 그래픽과의 약속(인터페이스)**
- 청크 격자는 32 × 32 타일 = 8 × 8 단위(`TD_TILE_CHUNK = 32`, `TD_CHUNK.UNITS = 8`)이고 월드에 고정합니다.
- 그리는 쪽은 `tdTileType(map, i, j)` / `map.typeAt` / `map.chunk(cx, cy)`만 씁니다. 이 함수들의 모양과 타일 종류 번호를 바꾸지 않습니다.
  - 새 타일 종류는 번호를 추가만 합니다. 그 그림은 Claude 브랜치에 요청합니다.
- `worldObstacles`, `worldMinesNear`, `worldMinesInRect`, `worldSceneryInRect`의 결과와 순서는 예전 전체 훑기와 같아야 합니다(`tests/chunks/09.js`의 색인 동등성 테스트).

## 4. 함께 쓰는 파일 (충돌 주의)

다음 파일은 두 쪽이 모두 고칠 수 있습니다. 바꾼 이유를 PR에 적고, 필요한 만큼만 고칩니다.
- `js/topdown/render.js`
- `js/topdown/tiles.js`
- `index.html`의 스크립트 순서
  - `player.js → village.js → ui.js`는 붙어 있어야 합니다(Task113 테스트).
  - `worldindex.js`는 `ui.js`와 `main.js` 사이입니다.
- `tests/chunks/00.js`의 `MODULE_FILES`
- `docs/WORLD_EXPANSION_2048.md`

## 5. 테스트 파일

`npm test`(`tests/regression.test.js`)는 `tests/chunks/`의 두 자리 숫자 파일(`00.js` ~ `99.js`)을 **이름 순서로 이어 붙여 한 번에** 실행합니다. 앞 파일의 헬퍼(`check`, `tdDomAt`, `t103*` 등)를 뒤 파일에서 그대로 씁니다.

| 파일 | 주인 | 내용 |
| --- | --- | --- |
| `00.js` ~ `09.js` | 공동 (기존) | 기존 2,287개 테스트. 기존 테스트를 고칠 때만 손대고, 새 테스트는 넣지 않습니다 |
| `10.js` | Claude | 그래픽 브랜치의 새 테스트 |
| `20.js` | Codex | 월드 생성 브랜치의 새 테스트 |
| `99.js` | 공동 | 결과 출력(`// SUMMARY`)만. 테스트를 넣지 않고 항상 마지막 파일로 둡니다 |

- 새 테스트는 자기 파일의 끝에 이어서 넣습니다. 두 브랜치가 같은 파일을 고치지 않으므로 병합 충돌이 나지 않습니다.
- 파일이 너무 커지면 같은 구간 안에서 나눕니다(Claude `11.js`~`19.js`, Codex `21.js`~`29.js`).
- `99.js` 뒤에 둔 파일의 테스트는 결과 출력 뒤에 실행되어 집계되지 않습니다. 그래서 `99.js`보다 큰 번호는 쓸 수 없습니다(파일 이름이 두 자리 숫자여야 실행됩니다).
- 테스트를 건너뛰거나, 끄거나, 기대값을 약하게 바꾸지 않습니다.

## 6. 공통 규칙

- PR은 `develop`을 향한 **Draft PR**로 올립니다. 병합은 사용자 승인 후에만 합니다.
- GitHub Pages 설정과 `preview/pages`는 승인 없이 바꾸지 않습니다. 외부 서비스도 승인 없이 연결하지 않습니다.
- 저장은 **saveVersion 1**을 유지하고, 필드는 추가만 합니다(예: `waypoints`). 원본 `main`에서 만든 저장을 계속 불러올 수 있어야 합니다.
- 기존 기능을 지우거나 구조를 크게 바꾸지 않습니다.
- push 전에 다음을 확인합니다.
  - `npm test` 전부 통과
  - `node tests/browser-smoke.cjs` 통과
  - 바뀐 화면은 실제 Chromium에서 확인
  - 보고할 때는 테스트 결과와 브라우저 결과를 나눠 적고, 하지 않은 일은 했다고 쓰지 않습니다.
- 테스트를 건너뛰거나 끄지 않습니다.
- 커밋 메시지와 PR에 모델 이름을 적지 않습니다.
- 원본 저장소(`gacha-factory-prototype`)에는 push, PR, 설정 변경을 하지 않습니다.

## 7. CI

워크플로 두 개가 `develop`에 대한 push와 `develop`을 향한 PR에서 실행됩니다. 원본과 맞추기 위해 `main`에 대한 실행 조건도 그대로 남겨 두었습니다.

| 워크플로 | 하는 일 | 실행 시점 |
| --- | --- | --- |
| `Node.js CI` (`node.js.yml`) | `npm install`, `npm test` (전체 회귀 테스트) | `develop`·`main`에 대한 push와 PR |
| `Code quality and browser smoke` (`quality.yml`) | Biome 검사(3개 파일), Chromium 브라우저 smoke 테스트 | `develop`·`main`에 대한 push와 PR, 수동 실행 |

- `claude/graphics-*`, `codex/worldgen-*` 브랜치에 push만 해서는 CI가 돌지 않습니다. `develop`을 향한 Draft PR을 열면 그 PR의 커밋마다 돕니다.
- CI가 빨간색이면 병합 승인을 요청하지 않습니다. 원인을 고쳐서 다시 push합니다.
- CI와 별개로 push 전 로컬 검사(6장)는 계속 합니다.
