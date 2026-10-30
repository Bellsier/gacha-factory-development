// ---------------------------------------------------------------------------
// Startup sequence: the save (if any) is loaded and applied to `state` BEFORE
// renderAll() and BEFORE the tick/ticket/autosave loops are created. This
// guarantees the very first tick ever operates on the restored state, never
// on freshRunState() defaults.
// ---------------------------------------------------------------------------
let tickTimer, ticketTimer, autoSaveTimer;

// ---------------------------------------------------------------------------
// Task 21: the game clock. Game time moves in fixed ticks of TICK_MS (everything is written per
// tick), driven by a TICK_MS interval. On a slow device that interval fires late — the page is
// busy drawing — and each late call used to be just one tick, so game time ran slower than real
// time (about 4 ticks a second instead of 10 on a slow phone). Now each call runs the ticks that
// real time says are due, at most TICK_CLOCK.MAX_PER_CALL of them, and updates the screen once.
// Time owed beyond TICK_CLOCK.MAX_BACKLOG_MS (a long stall) is dropped, never replayed. While the
// tab is hidden the browser slows the interval down and each call stays one tick, as before, and
// the clock starts afresh when the tab comes back: nothing is fast-forwarded. The top-down view's
// frames (render.js tdFrame) call the clock too (tickClockFrame), so the ticks that are due come
// with each frame rather than in bursts — but only while the interval is running: stopping
// tickTimer (as the tools and tests do) still stops the game.
// ---------------------------------------------------------------------------
const TICK_CLOCK = { MAX_PER_CALL: 4, MAX_BACKLOG_MS: 1000 };
let tickClockLast = null, tickClockOwed = 0, tickClockIntervalAt = -Infinity;
// While the clock makes up ticks: the moment (performance.now()) each one stands for; otherwise null.
let tickClockTickAt = null;
function tickClock(now){
  const t = now === undefined ? performance.now() : now;
  if(tickClockLast === null || (typeof document !== 'undefined' && document.hidden)){
    tickClockLast = t; tickClockOwed = 0;
    tickLoop();
    return 1;
  }
  tickClockOwed = Math.min(tickClockOwed + Math.max(0, t - tickClockLast), TICK_CLOCK.MAX_BACKLOG_MS);
  tickClockLast = t;
  const n = Math.min(TICK_CLOCK.MAX_PER_CALL, Math.floor(tickClockOwed / TICK_MS));
  if(n < 1) return 0; // called a little early: the tick waits for the next call
  tickClockOwed -= n * TICK_MS;
  // the ticks stand for the last n * TICK_MS of real time; the player's walk only counts from when
  // the key was pressed (player.js), so a short press on a slow device is not stretched over them
  try {
    for(let i = 1; i <= n; i++){
      tickClockTickAt = t - (n - i) * TICK_MS;
      if(i < n) tickStep(); else tickLoop();
    }
  } finally { tickClockTickAt = null; }
  return n;
}
// The interval's call: marks the clock as running, then ticks.
function tickClockInterval(){
  tickClockIntervalAt = performance.now();
  return tickClock();
}
// A frame's call: ticks only while the interval has run in the last second.
function tickClockFrame(){
  return performance.now() - tickClockIntervalAt < 1000 ? tickClock() : 0;
}

// Named (rather than an anonymous startup IIFE) purely so it reads like any
// other function in the file; the startup sequence itself is unchanged:
//   1. load save            5. tickTimer
//   2. apply loaded state   6. ticketTimer
//   3. renderAll()          7. autoSaveTimer
//   4. startup log          8. visibilitychange listener
//                           9. beforeunload listener
// Load must finish before the timers are created, so the very first tick
// ever operates on the restored state, never on freshRunState() defaults —
// that ordering guarantee is unchanged.
function boot(){
  const loaded = loadGame();
  if(loaded.ok){
    state = loaded.run;
    permanent = loaded.permanent;
  } else if(loaded.reason === 'corrupted'){
    protectCorruptSave(loaded.raw, loaded.key); // C1: keep (and back up, under the key it was read from) the damaged save; nothing is saved until the player starts over
  } else if(loaded.reason === 'future'){
    saveBlocked = true;
    log('더 최신 버전의 저장 데이터가 있어 이 게임에서는 불러올 수 없습니다. 이번 세션은 저장 없이 진행됩니다.');
  }
  if(worldTestMode()){
    if(['corrupted','worldgen','future'].includes(loaded.reason)){ saveBlocked=true; log('시험 저장을 불러올 수 없습니다. 원본을 보호하기 위해 저장을 중지합니다.'); }
    else { worldTestInitialize(state.world); worldRestoreEdits(); }
  }
  // 'none' (no save yet) is not announced here — it isn't an error. 'unavailable'
  // (the save could not be read) is not logged here either: loadGame() has set
  // saveUnverified, so nothing is saved this session (the status reads
  // '저장 보호 중') and renderAll() shows the notice that says why (C1).

  // Task 114: the village facilities get their sites (once; a save keeps them)
  if(typeof villageEnsureSites === 'function') villageEnsureSites();
  renderAll();
  worldTestControls();
  log(loaded.ok ? '이전 진행 상황을 불러왔습니다.' : '공방 가동을 시작합니다. 채굴장을 눌러 자원을 모으세요.');

  tickTimer = setInterval(tickClockInterval, TICK_MS);
  ticketTimer = setInterval(ticketTrickle, BALANCE.gacha.TICKET_TRICKLE_MS);
  autoSaveTimer = setInterval(saveGame, 10000);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden') saveGame();
    tickClockLast = null; // Task 21: hidden or back, the clock starts afresh (no catch-up for the time away)
  });
  window.addEventListener('beforeunload', ()=>{ saveGame(); });
}
boot();
