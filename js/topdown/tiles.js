// ---------------------------------------------------------------------------
// Task 104: the ground as a tile map, built from the same terrain data the
// movement code uses (js/terrain.js), so what is drawn as rock is exactly
// what blocks the player. Painted once per terrain state into a pixel buffer
// (no canvas needed, so it is testable) and then drawn as one image.
// Nothing here is saved.
// ---------------------------------------------------------------------------
const TD_TILE = { GRASS: 0, BEYOND: 1, ROCK: 2, TUNNEL: 3, EDGE: 4, PATH: 5 };

// Integer hash of a cell and a salt -> [0, 1). Fixed, so the ground looks the same every time.
function tdHash(a, b, salt){
  let h = (a * 374761393 + b * 668265263 + (salt || 0) * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Distance from point p to segment a-b.
function tdSegDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Tile type at a world point (the tile's centre).
function tdTileAt(x, y, tunnelOpen, base){
  if(!terrainInBounds(x, y)) return TD_TILE.EDGE;
  const region = terrainRegionAt(x, y);
  if(region === 'mountain') return TD_TILE.ROCK;
  if(region === 'tunnel'){
    if(tunnelOpen) return TD_TILE.TUNNEL;
    return x >= terrainTunnel().gateX ? TD_TILE.TUNNEL : TD_TILE.ROCK; // closed: only the recess in front of the gate
  }
  if(region === 'beyond') return TD_TILE.BEYOND;
  // open ground: a small yard around the workshop and a dirt road to the tunnel mouth
  if(base){
    const t = terrainTunnel();
    if(Math.hypot(x - base.x, y - base.y) <= 1.05) return TD_TILE.PATH;
    if(x >= t.mouthX && tdSegDist(x, y, base.x, base.y, t.mouthX, t.y) <= 0.3) return TD_TILE.PATH;
  }
  return TD_TILE.GRASS;
}

// The whole map: one entry per tile over the drawn world (bounds + forest edge).
function tdBuildTileMap(tunnelOpen, base){
  const r = topdownWorldRect(), n = TOPDOWN.TILES_PER_UNIT;
  const cols = Math.round((r.maxX - r.minX) * n), rows = Math.round((r.maxY - r.minY) * n);
  const types = new Uint8Array(cols * rows);
  for(let j = 0; j < rows; j++){
    for(let i = 0; i < cols; i++){
      types[j * cols + i] = tdTileAt(r.minX + (i + 0.5) / n, r.minY + (j + 0.5) / n, tunnelOpen, base);
    }
  }
  return { cols, rows, originX: r.minX, originY: r.minY, types, tunnelOpen: tunnelOpen === true };
}

function tdTileType(map, i, j){
  if(i < 0 || j < 0 || i >= map.cols || j >= map.rows) return TD_TILE.EDGE;
  return map.types[j * map.cols + i];
}

// Palette (r, g, b). Soft, slightly muted colours for a calm mood.
const TD_COLORS = {
  grass: [[78, 122, 70], [84, 130, 74], [72, 114, 66], [92, 140, 80]],
  tuft: [107, 155, 85], flower: [[232, 211, 138], [217, 138, 160], [168, 196, 232], [240, 240, 228]],
  beyond: [[58, 96, 62], [63, 103, 66], [53, 89, 58], [70, 110, 70]], leaf: [[150, 110, 60], [120, 140, 70]],
  rock: [[110, 105, 98], [102, 97, 91], [118, 113, 106], [95, 90, 85]], crack: [80, 76, 72], rim: [140, 134, 126], face: [66, 62, 58],
  tunnel: [[86, 72, 58], [80, 67, 54], [92, 78, 62]], plank: [120, 92, 60], beam: [96, 70, 44],
  path: [[150, 122, 86], [143, 116, 81], [158, 129, 92]], pebble: [176, 152, 116],
  edge: [[38, 66, 44], [44, 74, 48], [33, 58, 39]], canopy: [56, 92, 58], trunk: [60, 44, 32],
};

const TD_WALKABLE_TYPES = [TD_TILE.GRASS, TD_TILE.BEYOND, TD_TILE.TUNNEL, TD_TILE.PATH];

// Paints the map into an RGBA buffer (TILE x TILE pixels per tile). Returns
// { width, height, data } — the renderer puts it on a canvas once.
function tdPaintTileMap(map){
  const T = TOPDOWN.TILE, W = map.cols * T, H = map.rows * T;
  const data = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, c, a) => {
    if(x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4, al = a === undefined ? 1 : a;
    data[o] = data[o] * (1 - al) + c[0] * al; data[o + 1] = data[o + 1] * (1 - al) + c[1] * al; data[o + 2] = data[o + 2] * (1 - al) + c[2] * al; data[o + 3] = 255;
  };
  const pick = (list, h) => list[Math.floor(h * list.length) % list.length];
  for(let j = 0; j < map.rows; j++){
    for(let i = 0; i < map.cols; i++){
      const type = map.types[j * map.cols + i];
      const x0 = i * T, y0 = j * T;
      // base texture: small noise on 2x2 pixel blocks, so it reads as pixel art when zoomed
      const pal = type === TD_TILE.GRASS ? TD_COLORS.grass : type === TD_TILE.BEYOND ? TD_COLORS.beyond : type === TD_TILE.ROCK ? TD_COLORS.rock :
        type === TD_TILE.TUNNEL ? TD_COLORS.tunnel : type === TD_TILE.PATH ? TD_COLORS.path : TD_COLORS.edge;
      for(let y = 0; y < T; y += 2){
        for(let x = 0; x < T; x += 2){
          const h = tdHash(x0 + x, y0 + y, 7);
          const c = h < 0.8 ? pal[0] : pick(pal, (h - 0.8) * 5);
          put(x0 + x, y0 + y, c); put(x0 + x + 1, y0 + y, c); put(x0 + x, y0 + y + 1, c); put(x0 + x + 1, y0 + y + 1, c);
        }
      }
      const h1 = tdHash(i, j, 1), h2 = tdHash(i, j, 2), h3 = tdHash(i, j, 3);
      if(type === TD_TILE.GRASS){
        if(h1 < 0.22){ const tx = x0 + 3 + Math.floor(h2 * 9), ty = y0 + 4 + Math.floor(h3 * 8); put(tx, ty, TD_COLORS.tuft); put(tx + 2, ty, TD_COLORS.tuft); put(tx + 1, ty - 1, TD_COLORS.tuft); put(tx + 1, ty, TD_COLORS.tuft); }
        if(h1 > 0.955){ const fx = x0 + 4 + Math.floor(h2 * 8), fy = y0 + 4 + Math.floor(h3 * 8), fc = pick(TD_COLORS.flower, h3); put(fx, fy, fc); put(fx + 1, fy, fc); put(fx, fy + 1, fc); put(fx + 1, fy + 1, [244, 226, 120]); }
      } else if(type === TD_TILE.BEYOND){
        if(h1 < 0.18){ const lx = x0 + 2 + Math.floor(h2 * 11), ly = y0 + 2 + Math.floor(h3 * 11), lc = pick(TD_COLORS.leaf, h2); put(lx, ly, lc); put(lx + 1, ly, lc); }
        if(h1 > 0.8){ const tx = x0 + 5 + Math.floor(h2 * 6), ty = y0 + 6 + Math.floor(h3 * 6); put(tx, ty, TD_COLORS.tuft); put(tx + 1, ty - 1, TD_COLORS.tuft); put(tx + 2, ty, TD_COLORS.tuft); }
      } else if(type === TD_TILE.ROCK){
        // boulders give the range some relief: lit top-left, shadowed bottom-right
        if(h3 < 0.42){
          const bx = x0 + 4 + Math.floor(h1 * 8), by = y0 + 4 + Math.floor(h2 * 8), br = 3 + Math.floor(h3 * 8);
          for(let y = -br; y <= br; y++) for(let x = -br; x <= br; x++){
            const d = x * x + y * y; if(d > br * br) continue;
            put(bx + x, by + y, (x + y) < -br * 0.5 ? TD_COLORS.rim : (x + y) > br * 0.7 ? TD_COLORS.face : TD_COLORS.rock[2], 0.85);
          }
        }
        if(h1 < 0.35){ const cx = x0 + 2 + Math.floor(h2 * 10), cy = y0 + 2 + Math.floor(h3 * 10); for(let k = 0; k < 4; k++) put(cx + k, cy + (k > 1 ? 1 : 0), TD_COLORS.crack); }
        if(h1 > 0.7){ const rx = x0 + 3 + Math.floor(h3 * 8), ry = y0 + 3 + Math.floor(h2 * 8); put(rx, ry, TD_COLORS.rim); put(rx + 1, ry, TD_COLORS.rim); }
      } else if(type === TD_TILE.TUNNEL){
        if(j % 2 === 0) for(let x = 0; x < T; x++) put(x0 + x, y0 + 8, TD_COLORS.plank, 0.35);
      } else if(type === TD_TILE.PATH){
        if(h1 < 0.4){ const px = x0 + 2 + Math.floor(h2 * 12), py = y0 + 2 + Math.floor(h3 * 12); put(px, py, TD_COLORS.pebble); }
        // ragged edge where the dirt meets grass, so the yard and the road are not hard squares
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
          if(tdTileType(map, i + di, j + dj) !== TD_TILE.GRASS) return;
          for(let k = 0; k < T; k += 2){
            const depth = 1 + Math.floor(tdHash(x0 + k, y0 + k, 11 + di * 3 + dj) * 5);
            for(let d = 0; d < depth; d += 2){
              const ex = di === 1 ? x0 + T - 2 - d : di === -1 ? x0 + d : x0 + k, ey = dj === 1 ? y0 + T - 2 - d : dj === -1 ? y0 + d : y0 + k;
              const g = TD_COLORS.grass[0]; put(ex, ey, g); put(ex + 1, ey, g); put(ex, ey + 1, g); put(ex + 1, ey + 1, g);
            }
          }
        });
      } else if(type === TD_TILE.EDGE){
        // dense forest canopy around the world
        if(h1 < 0.7){ const cx = x0 + 8 + Math.floor((h2 - 0.5) * 8), cy = y0 + 8 + Math.floor((h3 - 0.5) * 8), rr = 5 + Math.floor(h1 * 5);
          for(let y = -rr; y <= rr; y++) for(let x = -rr; x <= rr; x++) if(x * x + y * y <= rr * rr) put(cx + x, cy + y, (x + y < -rr / 2) ? [70, 108, 70] : TD_COLORS.canopy, 0.9); }
      }
      // edges between rock and walkable ground: a lit rim on the rock and a shadow on the ground
      if(type === TD_TILE.ROCK){
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        nb.forEach(([di, dj]) => {
          const n = tdTileType(map, i + di, j + dj);
          if(!TD_WALKABLE_TYPES.includes(n)) return;
          for(let k = 0; k < T; k++){
            const ex = di === 1 ? x0 + T - 1 : di === -1 ? x0 : x0 + k, ey = dj === 1 ? y0 + T - 1 : dj === -1 ? y0 : y0 + k;
            if(dj === 1){ put(ex, ey, TD_COLORS.face); put(ex, ey - 1, TD_COLORS.face); put(ex, ey - 2, TD_COLORS.face, 0.6); }
            else if(di !== 0){ put(ex, ey, TD_COLORS.face); put(ex - di, ey, TD_COLORS.rim, 0.6); }
            else put(ex, ey, TD_COLORS.rim);
          }
        });
      } else if(TD_WALKABLE_TYPES.includes(type)){
        if(tdTileType(map, i - 1, j) === TD_TILE.ROCK) for(let y = 0; y < T; y++) for(let x = 0; x < 4; x++) put(x0 + x, y0 + y, [0, 0, 0], 0.22 - x * 0.05);
        if(tdTileType(map, i + 1, j) === TD_TILE.ROCK) for(let y = 0; y < T; y++) for(let x = 0; x < 3; x++) put(x0 + T - 1 - x, y0 + y, [0, 0, 0], 0.16 - x * 0.05);
        if(tdTileType(map, i, j - 1) === TD_TILE.ROCK) for(let x = 0; x < T; x++) for(let y = 0; y < 4; y++) put(x0 + x, y0 + y, [0, 0, 0], 0.24 - y * 0.06);
        if(type === TD_TILE.TUNNEL && (tdTileType(map, i, j - 1) === TD_TILE.ROCK || tdTileType(map, i, j + 1) === TD_TILE.ROCK) && i % 3 === 0){
          for(let y = 0; y < T; y++){ put(x0 + 6, y0 + y, TD_COLORS.beam); put(x0 + 7, y0 + y, TD_COLORS.beam); }
        }
      }
    }
  }
  if(!map.tunnelOpen){
    for(let j = 0; j < map.rows; j++) for(let i = 0; i < map.cols; i++){
      if(map.types[j * map.cols + i] !== TD_TILE.BEYOND) continue;
      for(let y = 0; y < T; y++) for(let x = 0; x < T; x++) put(i * T + x, j * T + y, [14, 20, 18], 0.62);
    }
  }
  return { width: W, height: H, data };
}
