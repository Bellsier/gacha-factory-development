// ---------------------------------------------------------------------------
// Task 109: the hired workers, shown in the top-down world (blueprint 14,
// 25 #9). Each worker stands by a vein of the resource it is assigned to and
// swings a pickaxe. This is drawing only: where a worker stands and how it
// moves is worked out from the game state every time and never saved, and the
// workers' output (autoRate) is exactly as before. No walking or path-finding
// yet — that is a later task.
// ---------------------------------------------------------------------------
const TD_WORKER = {
  SHIRT: { common: '#7d8a5c', rare: '#4d7fd0', epic: '#9a62d8', legend: '#e0a83c' },
  HELMET: ['#e2b23c', '#d0703a', '#c9ccd0', '#6aa0c8'],
  HAIR: ['#5a3b28', '#2b2b2b', '#8a5a2b', '#c9a26a'],
  SKIN: ['#f0c8a0', '#d9a982', '#b98a62'],
  // spots around a vein (world units from its point), tried in order
  SLOTS: [[0.42, 0.08], [-0.42, 0.08], [0.5, 0.48], [-0.5, 0.48], [0.5, -0.32], [-0.5, -0.32], [0, 0.5],
          [0.85, 0.2], [-0.85, 0.2], [0.85, -0.25], [-0.85, -0.25], [0.35, 0.85], [-0.35, 0.85]],
  // where workers without a vein of their resource wait: the workshop yard
  YARD: [[-0.6, 0.55], [0.6, 0.55], [-1.0, 0.3], [1.0, 0.3], [-0.25, 0.9], [0.25, 0.9], [-0.95, 0.85], [0.95, 0.85], [-1.35, 0.6], [1.35, 0.6], [0, 1.3], [-0.6, 1.3], [0.6, 1.3]],
  MIN_GAP: 0.34, // workers stand at least this far apart (a worker is about 0.31 wide)
};

function tdWorkerHash(id, salt){
  let h = 2166136261 ^ (salt || 0);
  const s = String(id);
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// The look of one worker: shirt by rarity, the rest varied by its id.
function tdWorkerLook(worker){
  const pick = (list, salt) => list[Math.floor(tdWorkerHash(worker.id, salt) * list.length) % list.length];
  return {
    shirt: TD_WORKER.SHIRT[worker.rarity] || TD_WORKER.SHIRT.common,
    helmet: pick(TD_WORKER.HELMET, 1), hair: pick(TD_WORKER.HAIR, 2), skin: pick(TD_WORKER.SKIN, 3),
    gold: worker.rarity === 'legend',
  };
}

// Where every worker stands right now (same input, same answer).
//   [{ id, x, y, dir: 'left' | 'right', mineId | null, resource, look, phase, cycleMs }]
function tdWorkerPlacements(){
  // cached: the answer only changes when the workers, veins, huts, base or tunnel change
  const w = state.world;
  const key = state.characters.map(c => c && c.id + ':' + c.resource + ':' + c.rarity).join(',') + '|' +
    w.mines.map(m => m && m.id + ':' + m.x + ':' + m.y + ':' + m.developmentState + ':' + (isMineDiscovered(m) ? 1 : 0)).join(',') + '|' +
    w.workshops.map(ws => ws && ws.x + ':' + ws.y).join(',') + '|' + w.base.x + ',' + w.base.y + '|' + (w.tunnelUnlocked ? 1 : 0);
  if(TD.workerKey === key && TD.workerPlacements) return TD.workerPlacements;
  const out = tdComputeWorkerPlacements();
  TD.workerKey = key; TD.workerPlacements = out;
  return out;
}

function tdComputeWorkerPlacements(){
  const out = [], taken = [];
  const base = state.world.base;
  const free = (x, y) => playerCanStand(x, y) && taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) >= TD_WORKER.MIN_GAP);
  const rarityRank = { common: 0, rare: 1, epic: 2, legend: 3 };
  const groups = {};
  state.characters.forEach(c => { if(c) (groups[c.resource] = groups[c.resource] || []).push(c); });
  Object.keys(groups).sort().forEach(res => {
    const discovered = state.world.mines.filter(m => m && m.resource === res && isMineDiscovered(m));
    const secured = discovered.filter(m => m.developmentState === 'secured');
    const byDistance = (a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y) || (a.id < b.id ? -1 : 1);
    const cands = (secured.length ? secured : discovered).slice().sort(byDistance);
    groups[res].forEach((c, k) => {
      let spot = null;
      if(cands.length){
        const mine = cands[k % cands.length], first = Math.floor(k / cands.length);
        for(let i = 0; i < TD_WORKER.SLOTS.length && !spot; i++){
          const [dx, dy] = TD_WORKER.SLOTS[(first + i) % TD_WORKER.SLOTS.length];
          if(free(mine.x + dx, mine.y + dy)) spot = { x: mine.x + dx, y: mine.y + dy, mine };
        }
      }
      if(!spot){
        for(let i = 0; i < TD_WORKER.YARD.length && !spot; i++){
          const [dx, dy] = TD_WORKER.YARD[i];
          if(free(base.x + dx, base.y + dy)) spot = { x: base.x + dx, y: base.y + dy, mine: null };
        }
      }
      if(!spot) spot = { x: base.x, y: base.y + 1.1 + out.length * 0.05, mine: null }; // never happens with the yard sizes above
      taken.push([spot.x, spot.y]);
      out.push({
        id: c.id, x: spot.x, y: spot.y, mineId: spot.mine ? spot.mine.id : null, resource: res,
        dir: spot.mine ? (spot.x > spot.mine.x ? 'left' : 'right') : (tdWorkerHash(c.id, 4) < 0.5 ? 'left' : 'right'),
        look: tdWorkerLook(c), phase: tdWorkerHash(c.id, 5), cycleMs: 1100 - 90 * (rarityRank[c.rarity] || 0),
      });
    });
  });
  return out;
}

// Swing frame (0 raise, 1 overhead, 2 strike, 3 recover); a waiting worker rests on its pickaxe (frame 2, still).
function tdWorkerFrame(placement, nowMs){
  if(!placement.mineId) return 2;
  return Math.floor(((nowMs / placement.cycleMs) + placement.phase) * 4) % 4;
}

// The worker sprite: a miner seen from the side with a pickaxe, 20 x 24, facing right (left is mirrored).
function tdWorkerSprite(dir, frame, look){
  const P = tdPainter(20, 24);
  const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for(let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1, c); };
  const metal = look.gold ? '#e8c050' : '#9aa0a8', metalDark = look.gold ? '#b8902a' : '#6e747c', wood = '#8a6440';
  const bend = frame === 2 ? 1 : 0; // leans into the strike
  P(5, 22, 10, 2, 'rgba(0,0,0,0.25)');
  // legs (a steady stance) and boots
  P(6, 17, 3, 4, '#4a4e58'); P(9, 17, 3, 4, '#3d4049'); P(6, 20, 3, 2, '#5a3b28'); P(9, 20, 4, 2, '#5a3b28');
  // body and head
  P(5, 10 + bend, 7, 7, look.shirt); P(5, 10 + bend, 1, 7, 'rgba(0,0,0,0.18)');
  P(5, 4 + bend, 7, 6, look.skin); P(5, 4 + bend, 4, 5, look.hair); P(10, 7 + bend, 1, 1, '#2a2a2a'); P(12, 7 + bend, 1, 1, look.skin);
  P(4, 2 + bend, 9, 3, look.helmet); P(5, 1 + bend, 7, 1, look.helmet); P(12, 2 + bend, 2, 2, '#fff3b0');
  // arms and pickaxe by frame
  const swing = [
    { hand: [8, 11], tip: [3, 3], head: [[1, 2, 5, 2], [1, 2, 1, 3]] },     // raised behind
    { hand: [10, 9], tip: [11, 0], head: [[8, 0, 6, 2]] },                  // overhead
    { hand: [13, 13], tip: [18, 17], head: [[17, 14, 2, 6]] },              // strike, head down
    { hand: [12, 12], tip: [17, 8], head: [[15, 7, 5, 2]] },                // recover
  ][frame % 4];
  line(swing.hand[0], swing.hand[1], swing.tip[0], swing.tip[1], wood);
  swing.head.forEach(([x, y, w, h]) => { P(x, y, w, h, metal); P(x, y + h - 1, w, 1, metalDark); });
  P(swing.hand[0] - 1, swing.hand[1], 2, 2, look.skin);
  P(7, 11 + bend, 2, 4, 'rgba(0,0,0,0.15)'); // the near arm's shade
  return P.done(dir === 'left');
}

// Baked worker images, cached by look, direction and frame (built on first use).
function tdWorkerImage(look, dir, frame){
  TD.workerImages = TD.workerImages || {};
  const key = [look.shirt, look.helmet, look.hair, look.skin, look.gold ? 1 : 0, dir, frame].join('|');
  if(!(key in TD.workerImages)) TD.workerImages[key] = tdSpriteImage(tdWorkerSprite(dir, frame, look));
  return TD.workerImages[key];
}

// Each worker's helmet lamp: a small soft light (Task 108 light list).
function tdWorkerLights(){
  return tdWorkerPlacements().map(p => ({ kind: 'worker', x: p.x, y: p.y - 0.3, r: 0.75, rgb: [255, 236, 190], strength: 0.45 }));
}
