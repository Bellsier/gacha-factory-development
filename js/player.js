// Task 56: one player avatar in the existing world coordinate space.
// No wandering AI, no collision with mines, no pathfinding.
// Task 66: the mountain range (js/terrain.js) blocks movement — see tickPlayer.
const playerHeld = { up: false, down: false, left: false, right: false };

function playerDirFromKey(key){
  if(key === 'w' || key === 'W' || key === 'ArrowUp') return 'up';
  if(key === 's' || key === 'S' || key === 'ArrowDown') return 'down';
  if(key === 'a' || key === 'A' || key === 'ArrowLeft') return 'left';
  if(key === 'd' || key === 'D' || key === 'ArrowRight') return 'right';
  return null;
}

function setPlayerHeld(dir, down){
  if(!Object.prototype.hasOwnProperty.call(playerHeld, dir)) return false;
  playerHeld[dir] = !!down;
  return true;
}

function clearPlayerHeld(){
  playerHeld.up = false;
  playerHeld.down = false;
  playerHeld.left = false;
  playerHeld.right = false;
}

function clampPlayerPosition(x, y){
  return {
    x: clampPlayerAxis(x, BALANCE.world.BOUNDS_MIN_X, BALANCE.world.BOUNDS_MAX_X),
    y: clampPlayerAxis(y, BALANCE.world.BOUNDS_MIN_Y, BALANCE.world.BOUNDS_MAX_Y),
  };
}

// ---------------------------------------------------------------------------
// Task 107: things standing in the world block the player's feet: mines, the
// workshop (공방) and the craft huts (제작소). Each has a small box on the
// ground (its base, not the whole picture) and the player has a small box at
// the feet, so walking feels tight around them without snagging on roofs or
// tree tops. Boxes are in world units relative to the object's point; y grows
// southwards. Nothing here is saved.
// ---------------------------------------------------------------------------
const PLAYER_FOOT = { HALF_W: 0.09, HALF_H: 0.06 };
const WORLD_OBSTACLE_BOXES = {
  mine:     { minX: -0.14, maxX: 0.14, minY: -0.10, maxY: 0.07 },  // the boulder's base
  base:     { minX: -0.39, maxX: 0.39, minY: -0.44, maxY: -0.10 }, // cabin walls; the door step (the base point) stays free
  workshop: { minX: -0.25, maxX: 0.25, minY: -0.30, maxY: -0.10 }, // hut walls; its point (the door) stays free
};
const CORNER_SLIP = 0.18; // a corner this close is slipped around instead of stopping dead (enough to glide round a vein head-on, not round the cabin)

// Obstacle boxes in world coordinates, optionally only those near (x, y).
function worldObstacles(nearX, nearY, radius){
  const out = [];
  const add = (kind, id, px, py) => {
    if(radius !== undefined && Math.hypot(px - nearX, py - nearY) > radius + 1) return; // boxes are under 1 unit across
    const b = WORLD_OBSTACLE_BOXES[kind];
    out.push({ kind, id, minX: px + b.minX, maxX: px + b.maxX, minY: py + b.minY, maxY: py + b.maxY });
  };
  const w = state.world;
  w.mines.forEach(m => { if(m) add('mine', m.id, m.x, m.y); });
  if(w.base) add('base', 'base', w.base.x, w.base.y);
  w.workshops.forEach(ws => { if(ws) add('workshop', ws.id, ws.x, ws.y); });
  return out;
}

function playerFootOverlaps(o, x, y){
  return x + PLAYER_FOOT.HALF_W > o.minX && x - PLAYER_FOOT.HALF_W < o.maxX && y + PLAYER_FOOT.HALF_H > o.minY && y - PLAYER_FOOT.HALF_H < o.maxY;
}

// Could the player stand here? Terrain (Task 66/68) and the obstacles.
function playerCanStand(x, y){
  return isWorldPointWalkable(x, y) && !worldObstacles(x, y, 1).some(o => playerFootOverlaps(o, x, y));
}

function tickPlayer(){
  const player = state.world.player;
  let dx = (playerHeld.right ? 1 : 0) - (playerHeld.left ? 1 : 0);
  let dy = (playerHeld.down ? 1 : 0) - (playerHeld.up ? 1 : 0);
  if(dx === 0 && dy === 0){
    player.pose = 'idle';
    return;
  }
  const len = Math.hypot(dx, dy);
  dx /= len;
  dy /= len;
  const step = BALANCE.world.PLAYER_SPEED / TICKS_PER_SECOND;
  const startX = player.x, startY = player.y;
  const moved = worldStepFoot(startX, startY, dx, dy, step);
  player.x = moved.x;
  player.y = moved.y;
  if(Math.abs(dx) >= Math.abs(dy)) player.facing = dx > 0 ? 'right' : 'left';
  else player.facing = dy > 0 ? 'down' : 'up';
  player.pose = (player.x !== startX || player.y !== startY) ? 'walk' : 'idle';
}

// One step of a pair of feet (the player's, or a worker's in the top-down
// view — Task 110) from (startX, startY) in the unit direction (dx, dy), as far
// as the terrain and the obstacles allow. Returns the new { x, y }.
//   opts.extra           more boxes that block (e.g. the player, for a worker)
//   opts.ignoreObstacles only the terrain blocks (a worker getting unstuck)
function worldStepFoot(startX, startY, dx, dy, step, opts){
  const o2 = opts || {};
  const next = clampPlayerPosition(startX + dx * step, startY + dy * step);
  // Task 66: terrain collision. X and Y are resolved separately, each moving
  // as far toward its target as the rock allows: pushing into the face stops
  // that axis flush against it while the other axis keeps going, so the
  // player slides along the mountain instead of bouncing or teleporting.
  // (If a position is somehow already inside rock, movement is not blocked,
  // so the player can always walk back out.)
  // Task 107: the same for obstacles. An obstacle the player already stands
  // in (an older save, a mine found under the feet) does not block, so the
  // player can always walk out of it.
  const near = o2.ignoreObstacles ? [] : worldObstacles(startX, startY, step + 1).concat(o2.extra || []);
  const blocking = near.filter(o => !playerFootOverlaps(o, startX, startY));
  const free = (x, y) => !blocking.some(o => playerFootOverlaps(o, x, y));
  const terrainOk = isWorldPointWalkable(startX, startY);
  const ok = (x, y) => (!terrainOk || isWorldPointWalkable(x, y)) && free(x, y);
  let x = terrainAdvance(startX, next.x, (tx) => ok(tx, startY));
  let y = terrainAdvance(startY, next.y, (ty) => ok(x, ty));
  // Task 107: corner slip. Walking straight into the very edge of a box stops
  // dead; if a small side step would clear it, take that side step instead,
  // so the player glides around corners.
  const slip = (along, across, alongNext) => {
    for(let d = 0.02; d <= CORNER_SLIP + 1e-9; d += 0.02){
      for(const sgn of [1, -1]){
        const c = across + sgn * d;
        const pt = along === 'x' ? [alongNext, c] : [c, alongNext];
        if(ok(pt[0], pt[1]) && (along === 'x' ? ok(startX, c) : ok(c, startY))) return sgn * Math.min(d, step);
      }
    }
    return 0;
  };
  // Only obstacles are slipped around; the mountain behaves exactly as before (Task 66).
  const terrainAllows = (tx, ty) => !terrainOk || isWorldPointWalkable(tx, ty);
  if(dy === 0 && Math.abs(x - next.x) > 1e-9 && Math.abs(x - startX) < step * 0.5 && terrainAllows(next.x, startY)){
    const s2 = slip('x', startY, next.x);
    if(s2 && ok(x, startY + s2)) y = startY + s2;
  } else if(dx === 0 && Math.abs(y - next.y) > 1e-9 && Math.abs(y - startY) < step * 0.5 && terrainAllows(startX, next.y)){
    const s2 = slip('y', startX, next.y);
    if(s2 && ok(startX + s2, y)) x = startX + s2;
  }
  return { x, y };
}
