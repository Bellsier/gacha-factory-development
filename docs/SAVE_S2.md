# S2: 마을별 자동 저장과 공용 수동 저장

S1 승인(2026-11-04)에 따른 구현이다. 자동 저장은 마을별 하나, 수동 저장은 같은 서비스 저장 영역 전체에서 다섯 슬롯이다. 수동 복원은 새 villageId의 사본을 만들고 원본 수동 저장과 기존 마을의 자동 저장을 보존한다. G4 변경은 없다.

## 구성과 실행 순서

1. `save-engine.js`: IndexedDB 트랜잭션, 원문 이전, 소유권/수정 번호, 자동·수동 저장과 삭제.
2. `save-runtime.js`: 기존 saveVersion1 codec 연결, 부팅/전환 대기열, 입력·시계 정지, 저장 UI.
3. `main.js`: 실제 브라우저는 S2 비동기 부팅 완료 후 타이머를 시작한다. 시험 월드는 기존 격리 경로를 유지한다. 독립적으로 스크립트를 평가하는 기존 동기식 codec 회귀 소비자는 기존 boot 계약을 유지한다. 실제 기본 페이지와 단일 HTML의 S2 부팅은 Chromium에서 별도 검증한다.
4. `tests/save-s2-browser.cjs`: 임시 localhost 서버와 새 브라우저 컨텍스트만 사용한다. 실제 사용자 브라우저나 배포 저장소에 연결하지 않는다. 삭제·변형·실패 주입은 이 격리 영역에서만 실행한다.

## 데이터와 보호 규칙

DB 이름은 기존 서비스 키 + `.s2`다. `gachaFactorySave`/`gachaFactorySave.dev` 분리 정책을 유지한다. `villages`, `autos`, `manual`, `migrations` 영역을 분리하며 트랜잭션 완료 이벤트를 기다린 뒤에만 성공한다. 게임 본문은 기존 `{ saveVersion:1, savedAt, run, permanent }`이고 S2 envelope의 format은 별도로1이다. 티켓·회사 진행 등 permanent도 마을별 snapshot에 포함한다.

villageId/snapshotId는 UUID다. 자동 저장의 소유자는 마을 ID와 탭 owner, writerEpoch이며, revision으로 오래된 요청을 거부한다. 마을 생성은 add만 사용하므로 ID 충돌이 기존 마을을 교체하지 않는다. 수동 슬롯 삭제도 revision을 가진 빈 레코드를 남겨 삭제/재생성 뒤 옛 확인창이 새 저장을 덮어쓰는 문제를 차단한다.

기존 localStorage 원문은 S2에서 수정하거나 지우지 않는다. 이전 시 원문·SHA256 fingerprint·마을 ID를 최초 자동 저장과 같은 트랜잭션에 기록한다. 해시뿐 아니라 원문도 비교한다. 실패 시 전체 취소되고 재시도 시 중복 마을이 생기지 않는다. 이전한 마을을 삭제해도 이전 기록을 남겨 자동 부활을 막는다. 이후 구버전 저장이 바뀌면 별도 가져오기를 안내하며 자동 재이전하지 않는다. 구버전 localStorage와 IndexedDB 사이의 원자적 잠금은 불가능하므로 S2의 양방향 동기화는 하지 않는다.

손상·미래 버전·알 수 없는 S2 envelope는 덮어쓰지 않는다. IndexedDB 불가 시 localStorage 쓰기로 되돌리지 않는다. 공간/권한 실패 시 이전 유효 자동·수동 저장을 유지하고 성공 시각을 갱신하지 않는다.

## 탭 인계와 전환

자동 저장은 상태 복사본과 현재 마을/세션 세대를 함께 캡처해 순서대로 처리한다. 전환은 즉시 입력·시계를 멈추고, 앞선 저장을 기다리고 현재 마을을 저장한 후 새 마을을 원자적으로 활성화한다. 대기 중 권한을 잃으면 전환을 취소한다. 수동 복원은 같은 트랜잭션 안에서 원본 슬롯 ID/revision과 현재 writerEpoch를 재검사한다.

재접속 또는 다른 탭에서는 마을 목록의 **권한 회복·인계 후 이어하기**로 명시적으로 권한을 회복한다. 저장되지 않은 다른 탭의 메모리는 합치지 않고 마지막 완료 저장을 다시 읽는다. 새 writerEpoch가 이전 탭의 자동·수동 저장을 거부한다. BroadcastChannel과 2초 권한 확인은 UI 갱신 수단이며 실제 쓰기 판정은 항상 DB 트랜잭션에서 수행한다. 타임아웃만으로 소유권을 몰래 가져오지 않는다.

현재 마을 삭제는 명시적인 데이터 삭제 확인 뒤 수행하며 대기 중 저장을 무효화하고 마을 선택 화면으로 돌아간다. 다른 마을의 자동 저장과 모든 수동 원본은 유지한다. 수동 삭제는 해당 슬롯만 비운다. 오래된 마을을 자동 정리하지 않는다.

## UI와 검증

저장 메뉴 상단과 플레이 화면에 현재 마을과 마지막 성공 자동 저장 시각을 표시한다. 자동 저장 목록과 수동5슬롯은 제목/설명/버튼으로 구분한다. 새 게임은 다른 저장을 보존하고, 수동 복원은 사본 생성임을 확인받는다. 덮어쓰기와 삭제는 표시한 저장의 revision을 재확인한다. 모바일은 세로 스크롤이며 모달 동안 게임 단축키·이동을 차단한다.

검증 명령:

```sh
NODE_OPTIONS=--max-old-space-size=5120 npm test
npm run test:saves
node tests/browser-smoke.cjs
npx --yes @biomejs/biome@2.2.5 check --formatter-enabled=false --assist-enabled=false biome.json renovate.json tests/browser-smoke.cjs
node tools/build-dist.js s2
```

시스템 Chromium을 쓰는 환경에서는 `CHROMIUM=/usr/bin/chromium npm run test:saves`를 사용한다. CI는 기존 Playwright Chromium을 사용하며 S2 검사를 기존 browser-smoke 뒤에 실행한다.

새 Chromium 검사에는 트랜잭션 request 성공 뒤 abort, 이전 중 실패/재시도, 탭 인계, 오래된 확인창, 복원 사본, 다섯 슬롯 가득 찬 상태의 새 게임, 권한 상실과 전환 경합, 실제 UI/재부팅, 손상/미래/DB 불가, 시험 월드, 생성된 단일 HTML의 채굴→제작→판매→saveVersion1 저장, 모바일 메뉴가 포함된다. 저장 공간 부족은 격리된 예외/트랜잭션 취소 주입으로 검증하며 브라우저 디스크를 실제로 가득 채우지 않는다.

기존 단일 HTML의 동기 localStorage 기대 검사는 S2의 비동기 계약과 맞지 않아 역할을 분리했다. jsdom에서는 DB 부재 시 저장 차단을 검사하고, 기존과 같은 핵심 루프와 gold5/그림/saveVersion1 기대값은 생성된 단일 HTML을 실제 Chromium에서 검사한다. 기존 나머지 회귀 기대값은 유지한다.

## 남는 운영상 한계

브라우저가 종료되는 순간의 비동기 저장 완료는 보장할 수 없다. UI의 마지막 성공 시각이 기준이다. 브라우저 데이터 직접 삭제·기기 변경·다른 origin 사이 저장 이동은 이 기능의 동기화 범위가 아니다. 모바일은 Chromium 에뮬레이션 검증이며 실기기 검증은 별도다.

## 이번 검증 결과

- 전체 회귀 2,781/2,781 통과, 실패0, 종료 코드0.
- S2 전용 Chromium 32개 검사 그룹 통과. 기존 browser-smoke 통과.
- CI와 같은 Biome 검사 종료 코드0(기존 경고3/정보2). ZIP/단일 HTML 생성 통과.
- 별도 검토에서 발견한 슬롯 삭제/재생성 경합, 실내 전환 위치 변경, 메뉴 중 이동키 잔류는 실패 재현 후 수정했다. 추가로 권한을 잃은 대기 저장 뒤 전환이 진행되는 경합도 재현 후 차단했다.
- [검증 로그와 PC/모바일 화면](screenshots/save-s2/). 모바일은 Chromium 에뮬레이션이다.
- 생성된 단일 HTML의 실제 게임·저장은 HTTP에서 검증했다. 이 실행 환경은 file:// 탐색을 `ERR_BLOCKED_BY_ADMINISTRATOR`로 차단하므로 로컬 파일 직접 열기 검증은 수행하지 못했다. 우회하거나 재시도하지 않았다.
