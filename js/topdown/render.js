// ---------------------------------------------------------------------------
// Task 104/105: the top-down renderer. It only READS the game state (state,
// permanent, terrain) and draws it; every change goes through the game's own
// functions. Drawing runs on requestAnimationFrame, separate from the 100 ms
// game tick, and smooths the player between ticks. Renderer state (camera,
// caches, animation) lives in TD and is never saved.
// ---------------------------------------------------------------------------
const TD = {
  canvas: null, ctx: null, sheet: null,
  ground: null, groundKey: '', mini: null, miniBase: null,
  tracker: {}, floats: [], target: null,
  view: { w: 0, h: 0, zoom: 1, dpr: 1 }, cam: { x: 0, y: 0 },
  running: false,
  quality: 0, // Task 108: 0 full, 1 reduced, 2 low (see tdQualityFor)
};

// Everything that stands in the world this frame, sorted back to front (by y).
// Plain data, so it can be checked without a canvas.
// `view` (a world rectangle, optional): only veins and scenery props inside it are listed (by the chunk
// index) — the renderer passes the screen plus a margin wider than its own culling, so what is drawn is the same.
function tdDrawList(player, view){
  if(view && typeof worldEnsureRect === 'function') worldEnsureRect(view);
  const list = [];
  const base = state.world.base;
  // Task 107: buildings sort by the front edge of their footprint, so the player
  // standing against a wall (just above the door point) is drawn in front of it.
  const front = (kind) => (typeof WORLD_OBSTACLE_BOXES !== 'undefined' ? WORLD_OBSTACLE_BOXES[kind].maxY : 0);
  list.push({ kind: 'base', x: base.x, y: base.y, sortY: base.y + front('base') });
  list.push({ kind: 'prop', prop: 'lamp', x: base.x + 0.62, y: base.y + 0.02, sortY: base.y + 0.02, light: true });
  state.world.workshops.forEach(w => { if(w) list.push({ kind: 'workshop', id: w.id, tier: workshopTier(w.level), x: w.x, y: w.y, sortY: w.y + front('workshop') }); });
  // Task 114: the village facilities (sorted by the front of their walls, like the huts)
  if(typeof VILLAGE !== 'undefined' && state.village && state.village.sites){
    VILLAGE.ORDER.forEach(k => {
      const site = state.village.sites[k];
      if(!site) return;
      list.push({ kind: 'village', id: k, stage: Math.min(2, state.village.stage[k] || 0), exhibits: Math.ceil((state.village.donated || []).length / 2),
        specimens: k === 'museum' ? (state.village.specimens || []).map(sp => sp.key) : [], // Task 121
        hall: k === 'museum' && typeof villageHallLevel === 'function' ? villageHallLevel() : 0, // Task 122
        x: site.x, y: site.y, sortY: site.y + VILLAGE.FACILITIES[k].box.maxY });
    });
  }
  // Task 118: the plaza's notice board and its two lamp posts (thin: they block nothing)
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(vd){
    const pz = vd.plaza;
    list.push({ kind: 'plazaProp', prop: 'villageBoard', x: pz.x, y: pz.y - 0.15, sortY: pz.y - 0.15 });
    [-1, 1].forEach(sx => list.push({ kind: 'plazaProp', prop: 'lamp', x: pz.x + sx * 0.72, y: pz.y + 0.5, sortY: pz.y + 0.5 }));
    // Task 119: the player's house (sorted by the front of its walls)
    list.push({ kind: 'house', x: vd.house.x, y: vd.house.y, sortY: vd.house.y + VILLAGE.DISTRICT.HOUSE_BOX.maxY });
    // Task 120: the garden's decorations; the one being carried is held over the player's head
    const cells = villageGardenCells(), carry = VILLAGE_GARDEN_UI.carry;
    villageDecorList().forEach(d => {
      const c = cells[d.cell];
      if(!c) return;
      if(d.cell === carry && player) list.push({ kind: 'gardenDecor', key: d.kind, carried: true, x: player.x, y: player.y, sortY: player.y + 0.002 });
      else if(d.cell !== carry) list.push({ kind: 'gardenDecor', key: d.kind, x: c.x, y: c.y, sortY: c.y });
    });
  }
  (view ? worldMinesInRect(view) : state.world.mines).forEach(m => {
    if(!m) return;
    const look = !isMineDiscovered(m) ? 'undiscovered' : m.developmentState === 'secured' ? 'secured' : 'unsecured';
    list.push({ kind: 'ore', id: m.id, resource: m.resource, look, x: m.x, y: m.y, sortY: m.y });
  });
  tdOpenLandTufts().forEach(t => list.push({ kind: 'decor', prop: 'grass', x: t.x, y: t.y, sortY: t.y - 0.2 }));
  if(terrainTunnelOpen() || typeof currentWorldContext === 'function' && currentWorldContext()){
    // Task 111: the same pieces that block (worldScenery leaves out those on a mine or walling something in)
    (view ? worldSceneryInRect(view) : worldScenery().props).forEach(pr => {
      list.push({ kind: 'prop', prop: pr.kind, x: pr.x, y: pr.y, sortY: pr.kind === 'clearing' ? pr.y - 5 : pr.y });
    });
  }
  if(!terrainTunnelOpen()){
    const t = terrainTunnel();
    list.push({ kind: 'gate', x: t.gateX, y: t.y + t.halfWidth, sortY: t.y + t.halfWidth - 0.01 });
  }
  // Task 112: torches the player has set down
  (state.world.torches || []).forEach((t, i) => list.push({ kind: 'torch', x: t.x, y: t.y, sortY: t.y, seed: i * 1.7 + t.x * 3.1 }));
  if(typeof tdWorkerStates === 'function') tdWorkerStates().forEach(wk => { if(!wk.hidden) list.push(Object.assign({ kind: 'worker', sortY: wk.y }, wk)); });
  if(player) list.push({ kind: 'player', dir: player.dir, frame: player.frame, x: player.x, y: player.y, sortY: player.y + 0.001 });
  return list.sort((a, b) => a.sortY - b.sortY);
}

// Task 115: an open facility's windows glow warm (the museum's display niches too).
function tdVillageLights(now){
  const out = [], v = state.village;
  if(typeof VILLAGE === 'undefined' || !v || !v.sites) return out;
  VILLAGE.ORDER.forEach((k, i) => {
    const site = v.sites[k];
    if(!site || (v.stage[k] || 0) < 2) return;
    if(k === 'appraiser') out.push({ kind: 'village', x: site.x - 0.2, y: site.y - 0.2, r: 0.6, rgb: [255, 210, 130], strength: 0.5 * tdFlicker(now, 20 + i) });
    else out.push({ kind: 'village', x: site.x, y: site.y - 0.25, r: 0.9, rgb: [255, 220, 150], strength: 0.4 + 0.04 * Math.min(6, Math.ceil((v.donated || []).length / 2)) });
  });
  return out;
}

// Task 118: the plaza lamps glow like the workshop lamp.
function tdPlazaLights(now){
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(!vd) return [];
  return [-1, 1].map((sx, i) => ({ kind: 'plaza', x: vd.plaza.x + sx * 0.72, y: vd.plaza.y + 0.5 - 0.3, r: 0.85, rgb: [255, 214, 140], strength: 0.62 * tdFlicker(now, 40 + i) }));
}

// Task 119: the house's windows and door lantern glow warm.
function tdHouseLights(now){
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(!vd) return [];
  return [{ kind: 'house', x: vd.house.x + 0.23, y: vd.house.y - 0.31, r: 0.85, rgb: [255, 206, 128], strength: 0.5 * tdFlicker(now, 61) }];
}

// Task 120: stone lanterns in the garden glow at dusk.
function tdGardenLights(now){
  if(typeof villageGardenCells !== 'function') return [];
  const cells = villageGardenCells(), carry = VILLAGE_GARDEN_UI.carry;
  return villageDecorList().filter(d => d.cell !== carry && cells[d.cell] && (villageDecorDef(d.kind) || {}).light)
    .map((d, i) => ({ kind: 'garden', x: cells[d.cell].x, y: cells[d.cell].y - 0.2, r: 0.6, rgb: [255, 214, 140], strength: 0.45 * tdFlicker(now, 80 + d.cell + i) }));
}

function tdDecorImage(key){
  TD.decorImages = TD.decorImages || {};
  if(!(key in TD.decorImages)) TD.decorImages[key] = tdSpriteImage(tdStyleFinish(tdDecorSprite(key), 'prop')); // graphics pass 2: the v2 finish (v2 only)
  return TD.decorImages[key];
}

// Task 114: baked village facility images, cached by facility, stage and lit niches.
function tdVillageImage(key, stage, exhibits, specimens, hall){
  TD.villageImages = TD.villageImages || {};
  const open = key === 'museum' && stage >= 2;
  const id = key + '|' + stage + '|' + (open ? exhibits : 0) + '|' + (open ? (specimens || []).join(',') + '|' + (hall || 0) : ''); // Task 121/122: specimens, hall
  if(!(id in TD.villageImages)) TD.villageImages[id] = tdSpriteImage(tdStyleFinish(tdVillageSprite(key, stage, exhibits, specimens, hall), 'building')); // graphics pass 2 (v2 only)
  return TD.villageImages[id];
}

// Task 108: a sprinkle of grass tufts on the open land that sway in the wind
// (fixed pattern; kept clear of veins, huts and the workshop yard). Cached.
function tdOpenLandTufts(){
  const w = state.world, vs = (state.village && state.village.sites) || {};
  const sites = ['appraiser', 'museum'].map(k => vs[k]).filter(Boolean); // Task 114: none on a village site
  const vg = typeof villageGroundLayout === 'function' ? villageGroundLayout() : null; // Task 118: nor on the plaza, roads or lots
  const vparts = vg ? villageDistrict() : null;
  const key = w.base.x + ',' + w.base.y + '|' + (typeof worldVillageMines === 'function' ? worldVillageMines().length : w.mines.length) + '|' + w.workshops.length + '|' + sites.map(p => p.x + ',' + p.y).join(';') + '|' + (vg ? vg.key : '');
  if(TD.tuftKey === key && TD.tufts) return TD.tufts;
  const out = [], b = BALANCE.world;
  for(let y = b.BOUNDS_MIN_Y + 0.25; y <= b.BOUNDS_MAX_Y; y += 0.5){
    for(let x = b.BOUNDS_MIN_X + 0.25; x <= b.BOUNDS_MAX_X; x += 0.5){
      const h = tdHash(Math.round(x * 2), Math.round(y * 2), 21);
      if(h > 0.07) continue;
      const jx = x + (tdHash(Math.round(x * 2), Math.round(y * 2), 22) - 0.5) * 0.4, jy = y + (tdHash(Math.round(x * 2), Math.round(y * 2), 23) - 0.5) * 0.4;
      if(tdTileAt(jx, jy, false, w.base, vg) !== TD_TILE.GRASS) continue;
      if(vparts && vparts.rects.some(r => villageRectDist(r, jx, jy) < 0.2)) continue;
      if(Math.hypot(jx - w.base.x, jy - w.base.y) < 1.5) continue;
      if(w.mines.some(m => m && Math.hypot(m.x - jx, m.y - jy) < 0.6)) continue;
      if(w.workshops.some(ws => ws && Math.hypot(ws.x - jx, ws.y - jy) < 0.8)) continue;
      if(sites.some(p => Math.hypot(p.x - jx, p.y - jy) < 1.0)) continue;
      out.push({ x: jx, y: jy });
    }
  }
  TD.tuftKey = key; TD.tufts = out;
  return out;
}

// Task 108: draws a plant leaning by `k` (a skew around its base), so the top moves and the roots stay.
function tdDrawSway(g, img, sx, sy, zoom, anchorY, k){
  if(!img) return;
  const dpr = TD.view.dpr, baseY = sy + (anchorY || 0) * zoom;
  g.setTransform(dpr, 0, dpr * k, dpr, -dpr * k * baseY, 0);
  tdDrawSprite(g, img, sx, sy, zoom, anchorY);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// The ground image for the current terrain state (rebuilt only when the tunnel opens or the base moves).
function tdEnsureGround(){
  const base = state.world.base;
  const village = typeof villageGroundLayout === 'function' ? villageGroundLayout() : null; // Task 118: the plaza and roads are ground too
  const context=typeof currentWorldContext === 'function' ? currentWorldContext():null;
  const key = (context ? context.seed+':'+context.generatorVersion+':256|' : '') + (terrainTunnelOpen() ? 'open' : 'closed') + '|' + base.x + ',' + base.y + '|' + (village ? village.key + '|' + JSON.stringify(village.garden) : '');
  if(TD.groundKey === key && TD.groundMap) return;
  const map = tdBuildTileMap(terrainTunnelOpen(), base, village);
  // the picture is painted chunk by chunk as it comes into view (tdChunkCanvas); a new state drops the old chunks
  TD.groundKey = key; TD.groundMap = map; TD.chunks = new Map();
  // minimap base: one pixel per tile, mountain / ground / beyond colours
  const mc = document.createElement('canvas');
  mc.width = Math.min(256,map.cols); mc.height = Math.min(256,map.rows);
  const mg = mc.getContext('2d');
  TD.miniBase=mc;TD.miniPainted=new Set();
  if(mg){mg.fillStyle='#223a28';mg.fillRect(0,0,mc.width,mc.height);}

}

// ---------------------------------------------------------------------------
// Chunk rendering (WORLD_EXPANSION_2048.md step 1). The ground is cut into
// 32 x 32-tile chunks on a grid fixed to the world (chunk (cx, cy) covers world
// units [8cx, 8cx+8) x [8cy, 8cy+8)), so the same grid serves a 2048 x 2048
// world later. A chunk is painted the first time it is needed — at once when it
// is on screen, ahead of time (at most one a frame, within a time budget) when
// it is next to the screen — and at most TD_CHUNK.KEEP painted chunks are kept
// (the least recently drawn go first). Painting a chunk gives exactly the
// pixels the old one-picture ground had there. Renderer state only; nothing saved.
// ---------------------------------------------------------------------------
const TD_DRAW_MARGIN = 5; // world units round the screen whose veins and props the draw list takes
const TD_CHUNK = {
  UNITS: 8,        // a chunk's side in world units (32 tiles)
  KEEP: 25,        // painted (or known empty) chunks kept at most — unless more than that are on screen at once
  AHEAD: 1,        // rings of chunks round the screen painted ahead
  SLICE_ROWS: 4,   // a chunk is painted ahead in strips of this many tile rows, spread over frames
  FRAME_MS: 9,     // more strips in a frame only while the frame has used less than this
};

// The chunks (cx, cy) covering a world rectangle.
function tdChunkRange(r){
  const U = TD_CHUNK.UNITS;
  return { cx0: Math.floor(r.minX / U), cy0: Math.floor(r.minY / U), cx1: Math.floor(r.maxX / U), cy1: Math.floor(r.maxY / U) };
}
// The part of the tile map a chunk covers (tiles), or null when it lies outside the map.
function tdChunkArea(map, cx, cy){
  const n = TOPDOWN.TILES_PER_UNIT, U = TD_CHUNK.UNITS;
  const i0 = Math.max(0, Math.round((cx * U - map.originX) * n)), j0 = Math.max(0, Math.round((cy * U - map.originY) * n));
  const i1 = Math.min(map.cols, Math.round(((cx + 1) * U - map.originX) * n)), j1 = Math.min(map.rows, Math.round(((cy + 1) * U - map.originY) * n));
  return i1 > i0 && j1 > j0 ? { i0, j0, i1, j1 } : null;
}
function tdChunkStats(){ return TD.chunkStats || (TD.chunkStats = { painted: 0, paintMs: 0, maxMs: 0, sync: 0, syncMs: 0, slices: 0, maxSliceMs: 0, dropped: 0 }); }

// Starts (or continues) painting a chunk; `rows` tile rows more, or all when rows is Infinity.
// Returns the chunk's entry once it is finished, else null. Strips are painted with the same
// area painter, so the finished picture is exactly the whole chunk painted at once.
function tdChunkWork(cx, cy, rows, now){
  const map = TD.groundMap, key = cx + ',' + cy, st = tdChunkStats();
  let have = TD.chunks.get(key);
  if(have && !have.job) return have;
  if(!have){
    const area = tdChunkArea(map, cx, cy);
    if(!area){ have = { canvas: null, area: null, used: now, empty: true }; TD.chunks.set(key, have); return have; }
    const T = TOPDOWN.TILE, W = (area.i1 - area.i0) * T, H = (area.j1 - area.j0) * T;
    have = { canvas: null, area, used: now, job: { next: area.j0, data: new Uint8ClampedArray(W * H * 4), W, H, ms: 0 } };
    TD.chunks.set(key, have);
  }
  const job = have.job, area = have.area, T = TOPDOWN.TILE;
  const stop = rows === Infinity ? area.j1 : Math.min(area.j1, job.next + rows);
  while(job.next < stop){
    const j1 = Math.min(stop, job.next + TD_CHUNK.SLICE_ROWS), t0 = performance.now();
    const img = worldPaintTileMap(map, { i0: area.i0, i1: area.i1, j0: job.next, j1 });
    job.data.set(img.data, (job.next - area.j0) * T * job.W * 4);
    const ms = performance.now() - t0; job.ms += ms; st.slices++; st.maxSliceMs = Math.max(st.maxSliceMs, ms);
    job.next = j1;
  }
  if(job.next < area.j1) return null;
  const c = document.createElement('canvas'); c.width = job.W; c.height = job.H;
  const g = c.getContext('2d');
  if(g){ const id = g.createImageData(job.W, job.H); id.data.set(job.data); g.putImageData(id, 0, 0); }
  st.painted++; st.paintMs += job.ms; st.maxMs = Math.max(st.maxMs, job.ms);
  have.canvas = g ? c : null; delete have.job;
  return have;
}
// A chunk's finished picture, painting whatever is left of it now (it is on screen): { canvas, area, used } .
function tdChunkCanvas(cx, cy, now){
  const key = cx + ',' + cy, before = TD.chunks.get(key), st = tdChunkStats();
  if(before && !before.job){ before.used = now; return before; }
  const t0 = performance.now(), ch = tdChunkWork(cx, cy, Infinity, now);
  if(!ch.empty){ st.sync++; st.syncMs += performance.now() - t0; }
  ch.used = now;
  return ch;
}
// The chunks wanted this frame: those on screen, then the ring(s) round them nearest first, at most KEEP
// (all on-screen chunks are always in, even if they alone are more than KEEP).
function tdChunkWanted(R){
  const on = [], ring = [], A = TD_CHUNK.AHEAD, mx = (R.cx0 + R.cx1) / 2, my = (R.cy0 + R.cy1) / 2;
  for(let cy = R.cy0 - A; cy <= R.cy1 + A; cy++) for(let cx = R.cx0 - A; cx <= R.cx1 + A; cx++){
    (cx >= R.cx0 && cx <= R.cx1 && cy >= R.cy0 && cy <= R.cy1 ? on : ring).push([cx, cy]);
  }
  ring.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
  return { on, ahead: ring.slice(0, Math.max(0, TD_CHUNK.KEEP - on.length)) };
}
function tdDrawGroundChunks(g, cam, w, h, zoom, now){
  const map = TD.groundMap, T = TOPDOWN.TILE, vis = topdownVisibleRect(cam, w, h, zoom), R = tdChunkRange(vis), want = tdChunkWanted(R);
  // the map's corner on screen, once: every chunk is placed from it by whole pixels, so chunks meet without seams
  const o = topdownToScreen(map.originX, map.originY, cam, w, h, zoom);
  want.on.forEach(([cx, cy]) => {
    const ch = tdChunkCanvas(cx, cy, now);
    if(!ch.canvas) return;
    const x = o.x + ch.area.i0 * T * zoom, y = o.y + ch.area.j0 * T * zoom;
    g.drawImage(ch.canvas, x, y, ch.canvas.width * zoom, ch.canvas.height * zoom);
    if(TD_CHUNK_DEBUG){ g.strokeStyle = 'rgba(255,240,120,0.8)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, ch.canvas.width * zoom - 1, ch.canvas.height * zoom - 1); g.fillStyle = 'rgba(255,240,120,0.9)'; g.font = '12px monospace'; g.fillText(cx + ',' + cy, x + 6, y + 16); }
  });
  // ahead of time, in strips: at least one strip a frame, more while the frame still has time
  const keep = new Set(want.on.concat(want.ahead).map(([cx, cy]) => cx + ',' + cy));
  for(const [cx, cy] of want.ahead){
    const ch = TD.chunks.get(cx + ',' + cy);
    if(ch && !ch.job){ ch.used = Math.max(ch.used, now - 1); continue; }
    let first = true;
    while(first || performance.now() - now < TD_CHUNK.FRAME_MS){
      first = false;
      const done = tdChunkWork(cx, cy, TD_CHUNK.SLICE_ROWS, now - 1);
      if(done) break;
    }
    if(performance.now() - now >= TD_CHUNK.FRAME_MS) break;
  }
  // keep at most KEEP: drop what this frame does not want, least recently used first (empty markers too)
  if(TD.chunks.size > Math.max(TD_CHUNK.KEEP, want.on.length)){
    const drop = [...TD.chunks.entries()].filter(([k]) => !keep.has(k)).sort((a, b) => a[1].used - b[1].used);
    while(TD.chunks.size > Math.max(TD_CHUNK.KEEP, want.on.length) && drop.length){ TD.chunks.delete(drop.shift()[0]); tdChunkStats().dropped++; }
  }
}
const TD_CHUNK_DEBUG = (() => { try { return new URLSearchParams(window.location.search).get('chunks') === 'debug'; } catch(e){ return false; } })();

// ---------------------------------------------------------------------------
// Task 22: the drawing resolution on slow screens. A phone's canvas has device-ratio times
// (up to 3 x 3 = 9 times) the pixels of its CSS size, and filling them is most of a frame on a
// slow phone. When the frames stay slow, the canvas is drawn at 1/k of the device ratio, k a
// whole number, and the browser shows each canvas pixel as a k x k block (the canvas is
// image-rendering: pixelated), so the picture keeps its size and stays sharp. k is only used
// where an art pixel is still a whole number of canvas pixels (zoom x ratio / k whole), so the
// pixel art looks the same; text and soft light on the canvas get coarser. One step at a time,
// at most MAX_CHANGES a session, HOLD_MS apart; back up only when the frames would stay fast at
// the finer size (pixels grow with the square). PC screens at ratio 1 never change.
// ---------------------------------------------------------------------------
const TD_RES_STEP = { SLOW_MS: 45, BACK_MS: 20, HOLD_MS: 4000, MAX_CHANGES: 3 };
// The divisors usable now: k = 1 always; 2 and 3 where the canvas stays at least the CSS size and
// an art pixel stays whole.
function tdRenderDivisors(native, zoom){
  const out = [1];
  for(let k = 2; k <= 3; k++){ const s = native / k; if(s >= 1 && Math.abs(zoom * s - Math.round(zoom * s)) < 1e-9) out.push(k); }
  return out;
}
// Called once a second or so with the average frame time: steps the divisor down or up.
function tdRenderScaleStep(now, avgMs){
  if(!(avgMs > 0)) return false;
  const st = TD.resStep || (TD.resStep = { k: 1, at: -Infinity, frame: 0, changes: 0 });
  if(st.changes >= TD_RES_STEP.MAX_CHANGES || now - st.at < TD_RES_STEP.HOLD_MS || (TD.frames || 0) - st.frame < 60) return false;
  const native = Math.max(1, Math.min(3, window.devicePixelRatio || 1)), v = TD.view;
  const ks = tdRenderDivisors(native, v ? v.zoom : 1), i = Math.max(0, ks.indexOf(st.k));
  let next = st.k;
  if(avgMs > TD_RES_STEP.SLOW_MS && i < ks.length - 1) next = ks[i + 1];
  else if(i > 0 && avgMs * Math.pow(st.k / ks[i - 1], 2) < TD_RES_STEP.BACK_MS) next = ks[i - 1];
  if(next === st.k) return false;
  st.k = next; st.at = now; st.frame = TD.frames || 0; st.changes++;
  TD.frameAvg = undefined; // measure the new size afresh
  return true;
}

function tdResize(){
  const c = TD.canvas;
  const w = Math.max(1, c.clientWidth || window.innerWidth), h = Math.max(1, c.clientHeight || window.innerHeight);
  const native = Math.max(1, Math.min(3, window.devicePixelRatio || 1)), zoom = topdownZoom(w, h);
  const div = TD.resStep && tdRenderDivisors(native, zoom).includes(TD.resStep.k) ? TD.resStep.k : 1; // Task 22 (another zoom: back to 1 if it no longer fits)
  const dpr = native / div;
  if(c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)){ c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const k = typeof tdStyleRenderScale === 'function' ? tdStyleRenderScale(zoom, dpr) : dpr;
  // the style experiment snaps the drawing scale so an art pixel is whole device pixels; the view is then measured in those units
  TD.view = k === dpr ? { w, h, zoom, dpr } : { w: c.width / k, h: c.height / k, zoom, dpr: k };
  TD.view.div = div; // Task 22: the divisor in use (1 = full resolution)
  // the resolution experiment's auto mode: another zoom or device ratio may need the other sprite set
  if(typeof tdResOnResize === 'function' && tdResOnResize(zoom, dpr) && TD.sheet) TD.sheet = tdBuildSpriteSheet();
}

function tdDrawSprite(g, img, sx, sy, zoom, anchorY){
  if(!img) return;
  const s = zoom / (img.artRes || 1), w = img.width * s, h = img.height * s; // a finer-grid sprite (resolution experiment) keeps its size on screen
  g.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h + (anchorY || 0) * zoom), w, h);
}

const TD_FLOAT = { MS: 1200, MAX_PER_POINT: 3, LINE: 22 }; // UI pass 1: how long a float shows, how many stack at one point

// `sum` (optional, UI pass 1): { amount, unit } — a float of the same unit still showing at this
// point takes the amount in (+1 철광석 → +2 철광석) and starts over, instead of adding a line.
function tdAddFloat(text, wx, wy, color, lift, sum){
  // Task 117: floats still rising from the same point stack above each other
  const now = performance.now(), live = TD.floats.filter(f => f.x === wx && f.y === wy && now - f.t0 < TD_FLOAT.MS);
  const scene = typeof villageHomeInside === 'function' && villageHomeInside() ? 'home' : 'world'; // Task 119: drawn in the room or the world
  const same = sum && live.find(f => f.sum && f.sum.unit === sum.unit && f.scene === scene);
  if(same){
    same.sum.amount += sum.amount;
    same.text = '+' + fmt(same.sum.amount) + ' ' + sum.unit;
    same.t0 = now;
    return;
  }
  // UI pass 1: a fourth line at the same point pushes the oldest one out
  if(live.length >= TD_FLOAT.MAX_PER_POINT){ const old = live[0]; TD.floats = TD.floats.filter(f => f !== old); live.shift(); live.forEach((f, i) => { f.stack = i; }); }
  TD.floats.push({ text, x: wx, y: wy, t0: now, color: color || '#fff3b0', lift: lift || 34, stack: live.length, scene, sum: sum ? { amount: sum.amount, unit: sum.unit } : null });
}

// UI pass 1: where the player's picture is on screen (16 x 22 art pixels, drawn with anchor 1), so the
// interaction bubble can keep clear of it. Renderer state only, never saved.
function tdPlayerScreenRect(sp, zoom){
  return { x: sp.x - 8 * zoom, y: sp.y - 21 * zoom, w: 16 * zoom, h: 22 * zoom };
}
function tdRectsOverlap(a, b, gap){
  const m = gap || 0;
  return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
}

// How high (sprite pixels) the interaction bubble sits above a target's point: above its picture.
// Task 23: is a walking worker under the bubble (screen rects, the worker's 16 x 22 sprite)?
function tdBubbleCoversWorker(b, cam, w, h, zoom){
  const sim = TD.workerSim;
  if(!b || !sim || !sim.byId) return false;
  for(const id in sim.byId){
    const s = sim.byId[id], p = topdownToScreen(s.x, s.y, cam, w, h, zoom);
    if(tdRectsOverlap(b, { x: p.x - 8 * zoom, y: p.y - 22 * zoom, w: 16 * zoom, h: 22 * zoom }, 0)) return true;
  }
  return false;
}

// Task 23: while the canvas is drawn at a lowered resolution (TD.view.div > 1) the bubble is a
// page element at the same place and size, so its text stays sharp. null hides it.
function tdBubbleHtml(lines, r, locked, thin, font){
  let el = TD.bubbleEl;
  if(!lines){ if(el && !el.hidden) el.hidden = true; return; }
  if(!el){ el = TD.bubbleEl = document.createElement('div'); el.className = 'td-bubble'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  const key = lines.join('\n') + '|' + r.x + ',' + r.y + ',' + Math.round(r.w) + '|' + (locked ? 1 : 0) + (thin ? 1 : 0) + '|' + font;
  if(el.hidden) el.hidden = false;
  if(el.dataset.key === key) return;
  el.dataset.key = key;
  el.textContent = lines.join('\n');
  el.className = 'td-bubble' + (locked ? ' is-locked' : '') + (thin ? ' is-thin' : '');
  Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: Math.round(r.w) + 'px', height: r.h + 'px', font });
}

// Task 23: screen boxes of the buildings with a door (cabin, huts, village facilities, house), from
// their sprite sizes (the door is the bottom centre). Only those near the player are listed.
const TD_DOOR_SPRITES = { base: [64, 58], workshop: [44, 40], appraiser: [44, 40], museum: [60, 48], house: [84, 73] };
function tdDoorRects(cam, w, h, zoom){
  const p = state.world.player, out = [];
  const add = (x, y, size) => {
    if(Math.abs(x - p.x) > 8 || Math.abs(y - p.y) > 8) return;
    const sp = topdownToScreen(x, y, cam, w, h, zoom);
    out.push({ x: sp.x - size[0] * zoom / 2, y: sp.y - size[1] * zoom, w: size[0] * zoom, h: size[1] * zoom });
  };
  if(state.world.base) add(state.world.base.x, state.world.base.y, TD_DOOR_SPRITES.base);
  state.world.workshops.forEach(ws => { if(ws) add(ws.x, ws.y, TD_DOOR_SPRITES.workshop); });
  const v = state.village;
  if(v && v.sites) Object.keys(v.sites).forEach(k => { const st = v.sites[k]; if(st && TD_DOOR_SPRITES[k]) add(st.x, st.y, TD_DOOR_SPRITES[k]); });
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(vd) add(vd.house.x, vd.house.y, TD_DOOR_SPRITES.house);
  return out;
}

// Task 23: the next-step hint (top left) gets out of the way: almost clear while the interaction bubble
// or the player is under it, half clear while a building with a door is. Its box is read again twice a
// second at most.
function tdHintClear(bubble, doors){
  const now = performance.now(), hint = typeof document !== 'undefined' && document.getElementById('nextHint');
  if(!hint) return;
  if(!TD.hintBox || now - TD.hintBox.at > 500){ const b = hint.getBoundingClientRect(); TD.hintBox = { at: now, r: { x: b.left, y: b.top, w: b.width, h: b.height } }; }
  const r = TD.hintBox.r, pr = TD.playerRect, cl = document.body.classList;
  const under = r.w > 0 && !!((bubble && tdRectsOverlap(bubble, r, 4)) || (pr && tdRectsOverlap(pr, r, 4)));
  const near = !under && r.w > 0 && !!doors && doors.some(d => tdRectsOverlap(d, r, 0));
  if(cl.contains('td-hint-under') !== under) cl.toggle('td-hint-under', under);
  if(cl.contains('td-hint-near') !== near) cl.toggle('td-hint-near', near);
}

function tdBubbleLift(target){
  if(!target) return 34;
  if(target.type === 'base') return 64;
  if(target.type === 'village') return target.id === 'museum' ? 54 : 46;
  if(target.type === 'plaza') return 40;
  if(target.type === 'house') return 76;
  if(target.type === 'homeDoor') return 30;
  if(target.type === 'garden') return 32;
  return 34;
}

function tdFrame(now){
  if(!TD.running) return;
  // Task 108: average frame time decides the effect quality (phones start one step lower)
  TD.frames = (TD.frames || 0) + 1;
  if(TD.lastFrame && TD.frames > 20){ // the first frames (loading) do not count
    const dt = Math.min(100, now - TD.lastFrame);
    TD.frameAvg = TD.frameAvg === undefined ? dt : TD.frameAvg * 0.95 + dt * 0.05;
  }
  TD.lastFrame = now;
  if(TD.frameAvg !== undefined && (TD.qualityCheck = (TD.qualityCheck || 0) + 1) % 30 === 0){
    TD.quality = tdQualityFor(TD.frameAvg, TD.quality);
    tdRenderScaleStep(now, TD.frameAvg); // Task 22
  }
  // Task 21: the game clock also runs from the frames, so on a slow device the due ticks come a
  // frame at a time (and the frame shows them) instead of in bursts when the late interval fires
  if(typeof tickClockFrame === 'function'){ try { tickClockFrame(); } catch(e){ /* the interval keeps the clock going */ } }
  try { tdRender(now); } catch(e){ /* keep the loop alive; the game itself runs on its own tick */ }
  window.requestAnimationFrame(tdFrame);
}

function tdRender(now){
  const g = TD.ctx;
  if(!g) return;
  tdResize();
  // Task 119: inside the house the room is drawn instead of the world (the workers walk on)
  const inside = typeof villageHomeInside === 'function' && villageHomeInside();
  document.body.classList.toggle('td-inside', inside);
  if(inside){
    if(typeof tdWorkerSimStep === 'function'){ const ws = TD.workerSim; tdWorkerSimStep(ws && ws.last !== null ? now - ws.last : 0, now); }
    const cam = tdRenderHome(now);
    tdDrawOverlay(g, cam, TD.view.w, TD.view.h, TD.view.zoom, now, 'home');
    if(typeof tdUpdateActionButton === 'function') tdUpdateActionButton();
    return;
  }
  TD.homeTracker = null;
  tdEnsureGround();
  const { w, h, zoom, dpr } = TD.view;
  const p = state.world.player;
  const pos = topdownTrack(TD.tracker, p.x, p.y, now);
  const cam = TD.cam = topdownCamera(pos, w, h, zoom);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#1d2f22'; g.fillRect(0, 0, w, h);
  // ground: the visible chunks (painted on first sight; neighbours painted ahead within a small budget)
  if(TD.groundMap) tdDrawGroundChunks(g, cam, w, h, zoom, now);
  // Task 110: the workers walk on (renderer state only)
  if(typeof tdWorkerSimStep === 'function'){ const ws = TD.workerSim; tdWorkerSimStep(ws && ws.last !== null ? now - ws.last : 0, now); }
  // objects, back to front
  const frame = topdownWalkFrame(pos.walked, p.pose);
  const vr = topdownVisibleRect(cam, w, h, zoom), M = TD_DRAW_MARGIN; // the culling below reaches at most 260 px (4.1 units at zoom 1) past the screen
  const items = tdDrawList({ dir: p.facing, frame, x: pos.x, y: pos.y }, { minX: vr.minX - M, maxX: vr.maxX + M, minY: vr.minY - M, maxY: vr.maxY + M });
  const sheet = TD.sheet;
  items.forEach(it => {
    const sp = topdownToScreen(it.x, it.y, cam, w, h, zoom);
    if(sp.x < -200 || sp.y < -200 || sp.x > w + 200 || sp.y > h + 260) return;
    if(it.kind === 'base') tdDrawSprite(g, sheet.base, sp.x, sp.y, zoom, 4);
    else if(it.kind === 'workshop') tdDrawSprite(g, sheet.workshop[it.tier], sp.x, sp.y, zoom, 3);
    else if(it.kind === 'ore') tdDrawSprite(g, it.look === 'undiscovered' ? sheet.ore.undiscovered : (sheet.ore[it.resource] || {})[it.look], sp.x, sp.y, zoom, 6);
    else if(it.kind === 'prop' || it.kind === 'decor'){
      const swaying = it.kind === 'decor' || it.prop === 'bigTree' || it.prop === 'sparseTree' || it.prop === 'grass';
      if(swaying && TD.quality < 2) tdDrawSway(g, sheet.prop[it.prop], sp.x, sp.y, zoom, 2, tdSway(now, it.x, it.y, it.kind === 'decor' ? 'tuft' : it.prop));
      else tdDrawSprite(g, sheet.prop[it.prop], sp.x, sp.y, zoom, 2);
    }
    else if(it.kind === 'village') tdDrawSprite(g, tdVillageImage(it.id, it.stage, it.exhibits, it.specimens, it.hall), sp.x, sp.y, zoom, 3);
    else if(it.kind === 'plazaProp') tdDrawSprite(g, sheet.prop[it.prop], sp.x, sp.y, zoom, 2);
    else if(it.kind === 'house') tdDrawSprite(g, sheet.house, sp.x, sp.y, zoom, 3);
    else if(it.kind === 'gardenDecor') tdDrawSprite(g, tdDecorImage(it.key), sp.x, it.carried ? sp.y - 20 * zoom : sp.y, zoom, 2);
    else if(it.kind === 'torch') tdDrawSprite(g, sheet.torch && sheet.torch[Math.floor(now / 130 + it.seed) % 3], sp.x, sp.y, zoom, 2);
    else if(it.kind === 'gate'){
      const t = terrainTunnel(), top = topdownToScreen(it.x, t.y - t.halfWidth, cam, w, h, zoom);
      const x0 = top.x - 3 * zoom;
      g.fillStyle = '#5a3b28'; g.fillRect(x0, top.y, 6 * zoom, sp.y - top.y);
      g.fillStyle = '#8a6440'; for(let yy = top.y + 4 * zoom; yy < sp.y; yy += 10 * zoom) g.fillRect(x0 - 2 * zoom, yy, 10 * zoom, 3 * zoom);
      g.fillStyle = '#e2b23c'; g.fillRect(x0 + zoom, (top.y + sp.y) / 2 - 2 * zoom, 4 * zoom, 4 * zoom);
    } else if(it.kind === 'player'){ tdDrawSprite(g, sheet.player[it.dir] && sheet.player[it.dir][it.frame], sp.x, sp.y, zoom, 1); TD.playerRect = tdPlayerScreenRect(sp, zoom); }
    else if(it.kind === 'worker'){
      // Task 109: a worker swinging at its vein; ore chips fly on the strike. Task 110: or walking there.
      const wf = it.mode === 'walk' ? 'w' + it.walkFrame : tdWorkerFrame(it, now);
      tdDrawSprite(g, tdWorkerImage(it.look, it.dir, wf), sp.x, sp.y, zoom, 1);
      if(wf === 2 && it.mineId && it.mode === 'work'){
        const side = it.dir === 'right' ? 1 : -1, c = (TD_RES_COLORS[it.resource] || ['#ccc'])[1];
        const t = (now / it.cycleMs + it.phase) % 0.25 * 4;
        g.fillStyle = c;
        [[7, -6], [10, -11], [4, -13]].forEach(([dx, dy], i) => g.fillRect(Math.round(sp.x + side * (dx + t * 3 * (i + 1)) * zoom), Math.round(sp.y + (dy - t * 4) * zoom), zoom, zoom));
      }
    }
  });
  // Task 108: cloud shadows, then the dusk tint with its lights, then a light vignette (mood only)
  if(TD.quality < 2) tdRenderClouds(g, cam, w, h, zoom, now);
  const darkness = typeof TD.forceDarkness === 'number' ? TD.forceDarkness : tdAmbientDarkness(Date.now());
  TD.darkness = darkness;
  const extraLights = (typeof tdWorkerLights === 'function' ? tdWorkerLights(now) : []).concat(tdVillageLights(now), tdPlazaLights(now), tdHouseLights(now), tdGardenLights(now));
  tdRenderLighting(g, tdLightList({ x: pos.x, y: pos.y, dir: p.facing }, now, extraLights, darkness), darkness, cam, w, h, zoom, TD.quality, now);
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.78);
  vg.addColorStop(0, 'rgba(10,14,12,0)'); vg.addColorStop(1, 'rgba(10,14,12,0.32)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  tdDrawOverlay(g, cam, w, h, zoom, now, 'world');
  tdRenderMinimap(cam);
  if(typeof tdUpdateActionButton === 'function') tdUpdateActionButton();
}

// The interaction bubble and the floating texts, over the world or the room (Task 119: `scene`).
function tdDrawOverlay(g, cam, w, h, zoom, now, scene){
  const p = state.world.player;
  // interaction bubble over the target (Task 115: kept on screen; a label too wide splits after its name)
  TD.target = typeof tdInteractTarget === 'function' ? tdInteractTarget(p.x, p.y) : null; // inside the house: its door (Task 119)
  if(TD.target){
    const sp = topdownToScreen(TD.target.x, TD.target.y, cam, w, h, zoom);
    const label = (TD.touch ? '' : '[E] ') + TD.target.label;
    // Task 24: 14px and up on a PC, 16px on a phone
    g.font = 'bold ' + (TD.touch ? 16 : Math.max(14, 12 + zoom)) + 'px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
    let lines = [label];
    if(g.measureText(label).width + 14 > w - 12 && label.includes(' · ')){ const cut = label.indexOf(' · '); lines = [label.slice(0, cut), label.slice(cut + 3)]; }
    const tw = Math.min(w - 12, Math.max(...lines.map(l => g.measureText(l).width)) + 14), bh = 22 * lines.length;
    const bx = Math.round(Math.max(6, Math.min(w - tw - 6, sp.x - tw / 2)));
    let by = Math.round(sp.y - tdBubbleLift(TD.target) * zoom) - (lines.length - 1) * 22;
    // UI pass 1: a bubble that would cover the player (a small target right below them) goes over the
    // player's head instead, or under the feet when there is no room above
    const pr = TD.playerRect;
    if(pr && tdRectsOverlap({ x: bx, y: by, w: tw, h: bh }, pr, 4)){
      by = Math.round(pr.y - bh - 8);
      if(by < 6) by = Math.round(pr.y + pr.h + 8);
    }
    TD.bubbleRect = { x: bx, y: by, w: tw, h: bh };
    // Task 23: over a walking worker the bubble is see-through (it stays put: no jumping about)
    const thin = tdBubbleCoversWorker(TD.bubbleRect, cam, w, h, zoom);
    const locked = TD.target.action === 'locked';
    if(TD.view.div > 1) tdBubbleHtml(lines, TD.bubbleRect, locked, thin, g.font); // Task 23: sharp text on a lowered resolution
    else {
      tdBubbleHtml(null);
      // Task 24: the panels' wood and copper (style.css .td-bubble matches)
      g.fillStyle = locked ? (thin ? 'rgba(44,38,34,0.5)' : 'rgba(44,38,34,0.9)') : (thin ? 'rgba(29,22,17,0.55)' : 'rgba(29,22,17,0.92)');
      g.fillRect(bx, by, tw, bh); g.fillStyle = locked ? '#8b98a1' : '#cf8549';
      g.fillRect(bx, by + bh - 1, tw, 2);
      g.textBaseline = 'middle';
      if(thin){ g.fillStyle = '#000'; lines.forEach((l, i) => g.fillText(l, bx + 8, by + 12 + i * 22, tw - 14)); }
      g.fillStyle = locked ? '#c9c0b6' : '#fff3e2';
      lines.forEach((l, i) => g.fillText(l, bx + 7, by + 11 + i * 22, tw - 14));
    }
  } else { TD.bubbleRect = null; tdBubbleHtml(null); }
  tdHintClear(scene === 'world' ? TD.bubbleRect : null, scene === 'world' ? tdDoorRects(cam, w, h, zoom) : null);
  // floating texts (+1 철광석 ...)
  TD.floats = TD.floats.filter(f => now - f.t0 < TD_FLOAT.MS);
  const bubble = TD.bubbleRect, t = TD.target;
  TD.floats.filter(f => (f.scene || 'world') === scene).forEach(f => {
    const k = (now - f.t0) / TD_FLOAT.MS, sp = topdownToScreen(f.x, f.y, cam, w, h, zoom);
    // starts above the interaction bubble (UI pass 1: wherever the bubble was moved to) and rises;
    // the lowest line is kept low enough that the highest one, fully risen, stays on screen
    let base = sp.y - (f.lift || 34) * zoom - 26;
    if(bubble && t && t.x === f.x && t.y === f.y) base = Math.min(base, bubble.y - 14);
    base = Math.max(base, 14 + (TD_FLOAT.MAX_PER_POINT - 1) * TD_FLOAT.LINE + 34);
    const fy = base - (f.stack || 0) * TD_FLOAT.LINE - k * 34;
    g.globalAlpha = 1 - k * k; g.font = 'bold ' + (13 + zoom) + 'px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000'; g.fillText(f.text, sp.x + 1, fy + 1);
    g.fillStyle = f.color; g.fillText(f.text, sp.x, fy);
    g.globalAlpha = 1; g.textAlign = 'left';
  });
}

// Minimap (blueprint 3.5): ground, the workshop, DISCOVERED mines only, the player and the view.
function tdRenderMinimap(cam){
  tdUpdateMinimapChunks(1);
  const c = TD.mini;
  if(!c || !TD.miniBase) return;
  const g = c.getContext('2d');
  if(!g) return;
  const map = TD.groundMap, n = TOPDOWN.TILES_PER_UNIT;
  const sx = c.width / map.cols, sy = c.height / map.rows;
  const at = (x, y) => [(x - map.originX) * n * sx, (y - map.originY) * n * sy];
  g.imageSmoothingEnabled = false;
  g.drawImage(TD.miniBase, 0, 0, c.width, c.height);
  state.world.mines.forEach(m => {
    if(!m || !isMineDiscovered(m)) return;
    const [x, y] = at(m.x, m.y);
    g.fillStyle = (TD_RES_COLORS[m.resource] || ['#ccc'])[0]; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    if(m.developmentState === 'secured'){ g.fillStyle = '#3fc9b0'; g.fillRect(Math.round(x) - 2, Math.round(y) + 2, 4, 1); }
  });
  (state.world.torches || []).forEach(t => { const [x, y] = at(t.x, t.y); g.fillStyle = '#ffb04a'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); });
  // Task 114: village facilities: grey while ruined, coloured once open
  if(typeof VILLAGE !== 'undefined' && state.village && state.village.sites) VILLAGE.ORDER.forEach(k => {
    const site = state.village.sites[k];
    if(!site) return;
    const [x, y] = at(site.x, site.y), open = (state.village.stage[k] || 0) >= 2;
    g.fillStyle = open ? (k === 'museum' ? '#e6e1d8' : '#5fa0d8') : '#7a746c'; g.fillRect(Math.round(x) - 2, Math.round(y) - 3, 5, 4);
  });
  const hd = typeof villageHouseDoor === 'function' ? villageHouseDoor() : null; // Task 119: the house
  if(hd){ const [hx, hy] = at(hd.x, hd.y); g.fillStyle = '#4f8246'; g.fillRect(Math.round(hx) - 2, Math.round(hy) - 3, 5, 4); }
  const [bx, by] = at(state.world.base.x, state.world.base.y);
  g.fillStyle = '#d68b3d'; g.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);
  const p = state.world.player, [px, py] = at(p.x, p.y);
  g.fillStyle = '#fff'; g.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4);
  const v = topdownVisibleRect(cam, TD.view.w, TD.view.h, TD.view.zoom), [vx0, vy0] = at(v.minX, v.minY), [vx1, vy1] = at(v.maxX, v.maxY);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.strokeRect(Math.round(vx0) + 0.5, Math.round(vy0) + 0.5, Math.round(vx1 - vx0), Math.round(vy1 - vy0));
}

// Task 119: inside the house — the room, its furniture and the player, sorted back to front. Plain data.
function tdHomeDrawList(player){
  const list = VILLAGE.HOME.FURNITURE.map((f, i) => ({ kind: 'furniture', key: f.key, i, x: f.x, y: f.y, sortY: f.y }));
  if(player) list.push({ kind: 'player', dir: player.dir, frame: player.frame, x: player.x, y: player.y, sortY: player.y + 0.001 });
  return list.sort((a, b) => a.sortY - b.sortY);
}

// The camera inside: the room centred when it fits, else following the player and kept on the room.
function tdHomeCamera(target, viewW, viewH, zoom){
  const H = VILLAGE.HOME, s = topdownScale(zoom), halfW = viewW / (2 * s), halfH = viewH / (2 * s);
  const axis = (v, min, max, half) => (max - min <= half * 2) ? (min + max) / 2 : Math.min(max - half, Math.max(min + half, v));
  return { x: axis(target.x, -0.4, H.ROOM.w + 0.4, halfW), y: axis(target.y, -1.1, H.ROOM.h + 0.5, halfH) };
}

function tdFurnitureImage(key){
  TD.furnitureImages = TD.furnitureImages || {};
  if(!(key in TD.furnitureImages)) TD.furnitureImages[key] = tdSpriteImage(tdFurnitureSprite(key));
  return TD.furnitureImages[key];
}

function tdRenderHome(now){
  const g = TD.ctx, { w, h, zoom, dpr } = TD.view, S = villageHomeScene(), H = VILLAGE.HOME;
  if(!TD.homeTracker) TD.homeTracker = {};
  const pos = topdownTrack(TD.homeTracker, S.x, S.y, now);
  const cam = tdHomeCamera(pos, w, h, zoom);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#17120e'; g.fillRect(0, 0, w, h);
  if(!TD.homeRoom) TD.homeRoom = tdSpriteImage(tdHomeRoomSprite());
  const o = topdownToScreen(-H.SIDE_PX / TD_UNIT_PX, -H.BACK_PX / TD_UNIT_PX, cam, w, h, zoom);
  if(TD.homeRoom) g.drawImage(TD.homeRoom, o.x, o.y, TD.homeRoom.width * zoom, TD.homeRoom.height * zoom);
  const items = tdHomeDrawList({ dir: S.facing, frame: topdownWalkFrame(pos.walked, S.pose), x: pos.x, y: pos.y });
  items.forEach(it => {
    const sp = topdownToScreen(it.x, it.y, cam, w, h, zoom);
    if(it.kind === 'player'){ tdDrawSprite(g, TD.sheet.player[it.dir] && TD.sheet.player[it.dir][it.frame], sp.x, sp.y, zoom, 1); TD.playerRect = tdPlayerScreenRect(sp, zoom); }
    else tdDrawSprite(g, tdFurnitureImage(it.key), sp.x, sp.y, zoom, 0);
  });
  // warm light: the stove's glow and a soft dark edge
  const stove = H.FURNITURE.find(f => f.key === 'stove');
  if(stove){
    const sp = topdownToScreen(stove.x, stove.y - 0.25, cam, w, h, zoom), r = 1.6 * topdownScale(zoom) * (0.95 + 0.05 * tdFlicker(now, 7));
    const gl = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r);
    gl.addColorStop(0, 'rgba(255,170,90,0.22)'); gl.addColorStop(1, 'rgba(255,170,90,0)');
    g.globalCompositeOperation = 'lighter'; g.fillStyle = gl; g.fillRect(sp.x - r, sp.y - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
  }
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(20,12,6,0)'); vg.addColorStop(1, 'rgba(20,12,6,0.4)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return cam;
}

// Paint at most a few already-known chunks; unknown land stays dark.
// The overview backing store stays bounded, even if the world grows later.
function tdUpdateMinimapChunks(budget=1){
 const map=TD.groundMap,canvas=TD.miniBase;if(!map||!canvas)return;
 const g=canvas.getContext('2d');if(!g)return;
 const colors=['#56804c','#3c6240','#78726a','#967850','#223a28','#a0845c','#b0a28a','#cec2aa','#70a85c'];
 const sx=canvas.width/map.cols,sy=canvas.height/map.rows;
 for(const [key,types] of map.chunkTypes){
  if(TD.miniPainted.has(key))continue;
  const cy=((key%65536)+65536+32768)%65536-32768,cx=(key-cy)/65536;
  const i0=cx*32-map.originX*4,j0=cy*32-map.originY*4;
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
   const i=i0+x,j=j0+y;if(i<0||j<0||i>=map.cols||j>=map.rows)continue;
   g.fillStyle=colors[types[y*32+x]];g.fillRect(Math.floor(i*sx),Math.floor(j*sy),Math.max(1,Math.ceil(sx)),Math.max(1,Math.ceil(sy)));
  }
  TD.miniPainted.add(key);if(--budget<=0)break;
 }
}
