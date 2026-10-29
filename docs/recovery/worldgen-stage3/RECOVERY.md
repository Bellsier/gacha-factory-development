# 월드 생성 3단계 복구 기록

범위: `?worldgen=256`에서만 256×256 타일. 청크는 32×32 타일(8×8 월드 단위). 2048 월드는 활성화하지 않는다.

## 원본 보존과 이전

- 원본 작업 공간: `/workspace/work/stage3`, 브랜치 `codex/worldgen-stage3-256`, HEAD `f809f5724313682dd7cae70e9724deefb39bb128`.
- Git bundle: `/workspace/work/recovery-backup/stage3.bundle` (전체 refs/이력, `git bundle verify` 성공).
- 미추적 화면 및 로그: `/workspace/work/recovery-backup/stage3-evidence.tar.gz`.
- SHA256: bundle `88f47148407f171af2383006393649d945ff786c004df8c58697e6781c8bc551`; evidence `a03452e28e2b3772be18fe5b05e2bdecc36de397cf75668fdd06f8309695d422`.
- 새 기준: `Bellsier/gacha-factory-development` develop `f95d9accbd146046e8cc46dd6e168769e2c619b8`.
- 처음에는 Git CLI의 proxy:8080 연결이 실패해 공식 GitHub API로 기준 파일을 읽고 별도 스냅샷에서 작업했다. 환경 재시작 후 Git 연결이 회복되어 실제 새 저장소를 `/workspace/work/publish`에 복제하고, 실제 develop 위에 7개 원본 기능 커밋과 복구 수정 커밋을 순서대로 cherry-pick했다. 원본 작성자·작성일·메시지·순서는 보존되고 부모가 달라 커밋 SHA는 변경됐다. 스냅샷 root는 원격 이력에 포함하지 않았다. 기존 과거 스크린샷도 그대로 보존된다.
- 원본 저장소와 기존 작업 공간/브랜치는 수정·삭제하지 않는다.

| 원본 커밋 | 새 develop 위 이식 커밋 | 내용 |
|---|---|---|
| 3377469 | f0baadd | 결정적 생성기 |
| 36aa672 | 1839a27 | 시험 저장 격리 및 광맥 변경 기록 |
| 960c205 | 0c770e8 | 기존 월드와 생성 지형 합성 |
| 48c91f6 | 6640f2f | 저장·일꾼·브라우저·성능 테스트 |
| 7ea2502 | 8c5ad9b | v1 결과 유지 생성 최적화 |
| d63fc9d | 2a5e891 | 렌더링 전 미방문 청크 충돌 |
| f809f57 | e95f27c | 캐시 제거 후 진행 상태 보존 테스트 |

## 호환성 및 책임 분리

- saveVersion은 1. 생성기 버전과 변경 기록 버전은 별도 필드로 관리한다.
- 일반 실행의 저장 키 선택은 최신 develop의 `saveKeyFor`를 유지한다.
- 시험 모드는 일반 키를 읽기만 하고 별도 키에 저장한다. 개발 Pages 경로에서는 `gachaFactorySave.dev` → `gachaFactorySave.dev.worldgen256.v1`, 로컬 등에서는 `gachaFactorySave` → `gachaFactorySave.worldgen256.v1`이다. 원본 키를 삭제하거나 덮어쓰지 않는다.
- 생성 광맥의 발견/확보는 청크별 ID 기록으로 복원한다. 채굴 자원과 캐릭터 진행은 기존 필드에 보존하며, 일꾼 배치는 복원된 광맥 ID를 참조한다.
- 순수 생성기 v1의 기존 전체 월드 SHA256 기준값을 유지한다. 청크 생성 순서에 의존하지 않는다.
- 데이터 캐시와 화면 캔버스 캐시는 독립적이다. 256 시험 범위의 데이터 보관 상한은 64청크이며, 대규모 월드용 완전한 스트리밍/퇴출 정책은 이번 범위가 아니다.
- 기존 플레이 영역 내부의 마을/광산/캐릭터 좌표를 옮기지 않는다. 시험용 보행 연결은 동쪽 경계 x=10..14.25, y=-0.5..0.5의 기존 비보행 영역을 지나 생성 지형과 한 타일 겹치게 추가한다. 기존 터널 해금 상태는 바꾸지 않는다.
- 그림의 팔레트·스프라이트·스타일·해상도 파일은 변경하지 않는다. `worldtileview.js`에서 기존 (-12,-12) 텍스처 좌표계를 보존하는 입력 좌표 변환을 담당한다. 공유 painter에는 음수 영역 순회를 위한 최소 인덱스 기본값(기본 0)을 받는 한 줄만 추가했다. 기존 그림 수식은 동일하다.
- 새 기능 테스트는 `tests/chunks/20.js`에 모았다. `99.js` 집계 순서를 유지한다. `npm run test:stage3`도 같은 20.js를 실행한다.

## 검증 명령

```
NODE_OPTIONS=--max-old-space-size=5120 npm test
npm run test:stage3
node tests/browser-smoke.cjs
npm run test:stage3:browser
npm run bench:stage3
```

이 실행 환경에서는 localhost listen에 네트워크 권한이 필요했다. 브라우저 smoke는 Playwright 기본 실행 경로 대신 설치된 `/usr/bin/chromium`을 지정하는 임시 preload로 실행했다. 게임이나 smoke 검증 내용은 변경하지 않았다.

## 측정 해석

실제 Linux Chromium에서 PC 1280×800 DPR1, Chromebook 1366×768 DPR1, 모바일 390×844 DPR3를 에뮬레이션한다. 각 프로필은 CPU 감속 없음(1×)과 4× 감속을 별도로 측정한다. 실제 모바일/Chromebook 기기 측정이 아니다.

각 프로필: 새 컨텍스트 초기화/재로드 각10회, 생성64청크×30회와 준비 실행, 왕복 입력30초. 시작 시간은 groundMap 준비 시점이며 모든 화면 타일의 렌더 완료 시점이 아니다. 캔버스 메모리는 폭×높이×4의 추정이며 GPU/브라우저 전체 메모리를 뜻하지 않는다. GC 전후 JS 힙 차이가 음수이면 생성 객체의 실메모리 판정에 사용할 수 없다.

## 최종 검증 결과

- 전체 회귀: `NODE_OPTIONS=--max-old-space-size=5120 npm test` — **2343/2343, 실패 0**. 최신 develop의 기존 테스트와 20.js 신규 테스트 모두 포함한다.
- Chromium smoke: 통과. PC/모바일 실제 키보드·터치 경계 보행, 광맥 발견·확보·채굴, 저장/재로드, 일반 저장 불변성, Node/Chromium 결정성 비교: 통과, 페이지 오류 0.
- classic/v2 기존 마을 픽셀 보존, 청크 경계 합성, 서쪽/북쪽 불투명 픽셀과 경계 합성, 미방문 충돌, 캐시 제거 후 광맥 진행, 일꾼 참조: 전체 회귀에 포함되어 통과.
- 수정 전 실패 기록은 숨기지 않았다. 최초 전체 실행은 리뷰 수정으로 중단했고, 두 번째 실행은 경계 발 폭 수정으로 중단했다. 최종 실행만 완전 통과로 집계했다.
- 독립 리뷰의 세 발견(음수 지형 투명, 전체 타입 배열 조기 생성, 연결부 순간이동 후 저장 거부)을 재현 테스트로 확인하고 수정했다. 추가 경로 탐색 테스트에서 발견한 x=14 발 충돌 틈도 수정했다.
- 스프라이트·스타일·해상도 파일, 워크플로, 99.js 변경 없음. 원본 저장소 변경·병합·Pages 설정 변경 없음.

## 성능 및 남은 문제

아래 수치는 복구 후 최종 코드의 측정값이다. 단위 ms, 프레임 열은 FPS가 아닌 프레임 사이 시간이다.

| 프로필 | CPU 감속 | 청크 생성 p95 | 프레임 p95 | 최장 프레임 | 캐시 캔버스 추정 MiB |
|---|---:|---:|---:|---:|---:|

| pc | 1× | 0.5 | 16.8 | 116.6 | 24 |
| pc | 4× | 2.3 | 150.0 | 366.6 | 19 |
| chromebook | 1× | 0.5 | 16.8 | 150.1 | 24 |
| chromebook | 4× | 2.8 | 116.6 | 299.9 | 18 |
| mobile | 1× | 0.5 | 33.4 | 150.1 | 24 |
| mobile | 4× | 2.6 | 233.3 | 583.4 | 13 |

64청크의 순수 타일 버퍼는 65,536바이트(64 KiB)다. 광맥·소품 객체, 색인, 캔버스 및 브라우저 메모리는 별도다. GC 힙 차이는 프로필별로 음수도 나와 객체 메모리의 신뢰할 만한 단독 측정치로 간주하지 않는다.

**남은 문제:** CPU 4× 감속에서는 PC/Chromebook/모바일 모두 프레임 지연이 남는다. 모바일 일반 환경도 p95 33.4ms로 60fps를 보장하지 않는다. 기존 캐시 반복 재생성과 조기 전체 생성은 수정했지만, 남은 지연의 원인을 개별 렌더링/게임 루프 비용으로 분리하는 프로파일링은 후속 작업이다. 실제 기기 성능 검증은 하지 않았다.

재현: `npm run bench:stage3` — 고정 시드123456789, 중간 진행 fixture, 각 화면/DPR에서 CPU rate1 또는4, 외곽 x20/y-20부터 아래15초/위15초 키보드 또는 터치 입력. 실행 중 다른 테스트를 병행하지 않았다.

생성 v1은 보존했으며 지형 종류는 기존 grass/rock/edge를 사용한다. 대규모 스트리밍, 새로운 아트, 전체2048 활성화는 후속 범위다. 시험 제어 패널은 모바일 상단 일부 HUD를 가리는 개발용 UI다.

## 증거

원본 로그·원시 측정·스크린샷은 저장소 크기를 줄이려고 develop에 옮기지 않았습니다(PR #16). 아래 링크는 PR #5의 마지막 커밋 `9e4875f`에 있는 원본을 가리킵니다.

- [전체 회귀 로그](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/recovery/worldgen-stage3/regression-final.log.gz)
- [Chromium smoke 로그](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/recovery/worldgen-stage3/smoke-final.log)
- [브라우저 결과](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/screenshots/worldgen-stage3/browser-results.json)
- [성능 원시 자료](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/screenshots/worldgen-stage3/performance.json)
- [PC 경계 연결](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/screenshots/worldgen-stage3/pc-connector.png)
- [모바일 경계 연결](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/screenshots/worldgen-stage3/mobile-connector.png)
- [PC 서북쪽 생성 지형](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/screenshots/worldgen-stage3/pc-northwest.png)
- [모바일 서북쪽 생성 지형](https://github.com/Bellsier/gacha-factory-development/blob/9e4875fe13cea2efaeee63e0719fcd16fc02b5e9/docs/screenshots/worldgen-stage3/mobile-northwest.png)

복구 수정 커밋: `9167e0d`. 실제 develop에 이식한 뒤 실행 소스·테스트·도구 53개 파일을 검증 당시 파일과 비교했다. 차이는 기존 develop 파일 끝의 빈 줄뿐이며 실행 코드 차이는 없다. 보호 파일과 99.js는 실제 develop과 동일하다.

큰 전체 회귀 로그는 원본 바이트를 유지한 `.gz`로 압축했습니다. 내려받아 `gzip -dk regression-final.log.gz`로 읽을 수 있습니다. 측정을 다시 실행한 것은 아닙니다.
