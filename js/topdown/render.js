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
};

// Everything that stands in the world this frame, sorted back to front (by y).
// Plain data, so it can be checked without a canvas.
function tdDrawList(player){
  const list = [];
  const base = state.world.base;
  list.push({ kind: 'base', x: base.x, y: base.y, sortY: base.y });
  list.push({ kind: 'prop', prop: 'lamp', x: base.x + 0.62, y: base.y + 0.02, sortY: base.y + 0.02, light: true });
  state.world.workshops.forEach(w => { if(w) list.push({ kind: 'workshop', id: w.id, tier: workshopTier(w.level), x: w.x, y: w.y, sortY: w.y }); });
  state.world.mines.forEach(m => {
    if(!m) return;
    const look = !isMineDiscovered(m) ? 'undiscovered' : m.developmentState === 'secured' ? 'secured' : 'unsecured';
    list.push({ kind: 'ore', id: m.id, resource: m.resource, look, x: m.x, y: m.y, sortY: m.y });
  });
  if(terrainTunnelOpen()){
    const mines = state.world.mines.filter(m => m);
    terrainBeyondProps().forEach(pr => {
      if(mines.some(m => Math.hypot(m.x - pr.x, m.y - pr.y) < 0.9)) return;
      list.push({ kind: 'prop', prop: pr.kind, x: pr.x, y: pr.y, sortY: pr.kind === 'clearing' ? pr.y - 5 : pr.y });
    });
  } else {
    const t = terrainTunnel();
    list.push({ kind: 'gate', x: t.gateX, y: t.y + t.halfWidth, sortY: t.y + t.halfWidth - 0.01 });
  }
  if(player) list.push({ kind: 'player', dir: player.dir, frame: player.frame, x: player.x, y: player.y, sortY: player.y + 0.001 });
  return list.sort((a, b) => a.sortY - b.sortY);
}

// The ground image for the current terrain state (rebuilt only when the tunnel opens or the base moves).
function tdEnsureGround(){
  const base = state.world.base;
  const key = (terrainTunnelOpen() ? 'open' : 'closed') + '|' + base.x + ',' + base.y;
  if(TD.groundKey === key && TD.ground) return;
  const map = tdBuildTileMap(terrainTunnelOpen(), base);
  const img = tdPaintTileMap(map);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  if(!g) return;
  const id = g.createImageData(img.width, img.height);
  id.data.set(img.data);
  g.putImageData(id, 0, 0);
  TD.ground = c; TD.groundKey = key; TD.groundMap = map;
  // minimap base: one pixel per tile, mountain / ground / beyond colours
  const mc = document.createElement('canvas');
  mc.width = map.cols; mc.height = map.rows;
  const mg = mc.getContext('2d');
  const mid = mg.createImageData(map.cols, map.rows);
  const col = { [TD_TILE.GRASS]: [86, 128, 76], [TD_TILE.BEYOND]: [60, 98, 64], [TD_TILE.ROCK]: [120, 114, 106], [TD_TILE.TUNNEL]: [150, 120, 80], [TD_TILE.EDGE]: [34, 58, 40], [TD_TILE.PATH]: [160, 132, 92] };
  for(let k = 0; k < map.types.length; k++){ const c3 = col[map.types[k]]; mid.data.set([c3[0], c3[1], c3[2], 255], k * 4); }
  mg.putImageData(mid, 0, 0);
  TD.miniBase = mc;
}

function tdResize(){
  const c = TD.canvas;
  const w = Math.max(1, c.clientWidth || window.innerWidth), h = Math.max(1, c.clientHeight || window.innerHeight);
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  if(c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)){ c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  TD.view = { w, h, zoom: topdownZoom(w, h), dpr };
}

function tdDrawSprite(g, img, sx, sy, zoom, anchorY){
  if(!img) return;
  const w = img.width * zoom, h = img.height * zoom;
  g.drawImage(img, Math.round(sx - w / 2), Math.round(sy - h + (anchorY || 0) * zoom), w, h);
}

function tdAddFloat(text, wx, wy, color){
  TD.floats.push({ text, x: wx, y: wy, t0: performance.now(), color: color || '#fff3b0' });
}

function tdFrame(now){
  if(!TD.running) return;
  try { tdRender(now); } catch(e){ /* keep the loop alive; the game itself runs on its own tick */ }
  window.requestAnimationFrame(tdFrame);
}

function tdRender(now){
  const g = TD.ctx;
  if(!g) return;
  tdResize();
  tdEnsureGround();
  const { w, h, zoom, dpr } = TD.view;
  const p = state.world.player;
  const pos = topdownTrack(TD.tracker, p.x, p.y, now);
  const cam = TD.cam = topdownCamera(pos, w, h, zoom);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#1d2f22'; g.fillRect(0, 0, w, h);
  // ground: only the visible part of the cached image
  const map = TD.groundMap, s = topdownScale(zoom), tilePx = TOPDOWN.TILE, unitPx = TD_UNIT_PX;
  if(TD.ground && map){
    const vis = topdownVisibleRect(cam, w, h, zoom);
    const sx0 = Math.max(0, Math.floor((vis.minX - map.originX) * unitPx) - tilePx), sy0 = Math.max(0, Math.floor((vis.minY - map.originY) * unitPx) - tilePx);
    const sx1 = Math.min(TD.ground.width, Math.ceil((vis.maxX - map.originX) * unitPx) + tilePx), sy1 = Math.min(TD.ground.height, Math.ceil((vis.maxY - map.originY) * unitPx) + tilePx);
    const o = topdownToScreen(map.originX + sx0 / unitPx, map.originY + sy0 / unitPx, cam, w, h, zoom);
    if(sx1 > sx0 && sy1 > sy0) g.drawImage(TD.ground, sx0, sy0, sx1 - sx0, sy1 - sy0, o.x, o.y, (sx1 - sx0) * zoom, (sy1 - sy0) * zoom);
  }
  // objects, back to front
  const frame = topdownWalkFrame(pos.walked, p.pose);
  const items = tdDrawList({ dir: p.facing, frame, x: pos.x, y: pos.y });
  const sheet = TD.sheet;
  const lights = [];
  items.forEach(it => {
    const sp = topdownToScreen(it.x, it.y, cam, w, h, zoom);
    if(sp.x < -200 || sp.y < -200 || sp.x > w + 200 || sp.y > h + 260) return;
    if(it.kind === 'base') tdDrawSprite(g, sheet.base, sp.x, sp.y, zoom, 4);
    else if(it.kind === 'workshop') tdDrawSprite(g, sheet.workshop[it.tier], sp.x, sp.y, zoom, 3);
    else if(it.kind === 'ore') tdDrawSprite(g, it.look === 'undiscovered' ? sheet.ore.undiscovered : (sheet.ore[it.resource] || {})[it.look], sp.x, sp.y, zoom, 6);
    else if(it.kind === 'prop'){ tdDrawSprite(g, sheet.prop[it.prop], sp.x, sp.y, zoom, 2); if(it.light) lights.push({ x: sp.x, y: sp.y - 18 * zoom }); }
    else if(it.kind === 'gate'){
      const t = terrainTunnel(), top = topdownToScreen(it.x, t.y - t.halfWidth, cam, w, h, zoom);
      const x0 = top.x - 3 * zoom;
      g.fillStyle = '#5a3b28'; g.fillRect(x0, top.y, 6 * zoom, sp.y - top.y);
      g.fillStyle = '#8a6440'; for(let yy = top.y + 4 * zoom; yy < sp.y; yy += 10 * zoom) g.fillRect(x0 - 2 * zoom, yy, 10 * zoom, 3 * zoom);
      g.fillStyle = '#e2b23c'; g.fillRect(x0 + zoom, (top.y + sp.y) / 2 - 2 * zoom, 4 * zoom, 4 * zoom);
    } else if(it.kind === 'player') tdDrawSprite(g, sheet.player[it.dir] && sheet.player[it.dir][it.frame], sp.x, sp.y, zoom, 1);
  });
  // warm lamp light and a soft vignette (mood only)
  const flick = 0.85 + 0.15 * Math.sin(now / 140) * Math.sin(now / 53);
  lights.forEach(l => {
    const r = 70 * zoom * flick, gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    gr.addColorStop(0, 'rgba(255,214,120,0.28)'); gr.addColorStop(1, 'rgba(255,214,120,0)');
    g.fillStyle = gr; g.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  });
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(10,14,12,0)'); vg.addColorStop(1, 'rgba(10,14,12,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  // interaction bubble over the target
  TD.target = typeof tdInteractTarget === 'function' ? tdInteractTarget(p.x, p.y) : null;
  if(TD.target){
    const sp = topdownToScreen(TD.target.x, TD.target.y, cam, w, h, zoom);
    const label = (TD.touch ? '' : '[E] ') + TD.target.label;
    g.font = 'bold ' + (12 + zoom) + 'px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
    const tw = g.measureText(label).width + 14, bx = Math.round(sp.x - tw / 2), by = Math.round(sp.y - (TD.target.type === 'base' ? 64 : 34) * zoom);
    g.fillStyle = TD.target.action === 'locked' ? 'rgba(40,36,34,0.88)' : 'rgba(22,28,32,0.9)';
    g.fillRect(bx, by, tw, 22); g.fillStyle = TD.target.action === 'locked' ? '#8b98a1' : '#ffd27a';
    g.fillRect(bx, by + 21, tw, 2);
    g.fillStyle = TD.target.action === 'locked' ? '#b8c0c6' : '#fff6dc'; g.textBaseline = 'middle'; g.fillText(label, bx + 7, by + 11);
  }
  // floating texts (+1 철광석 ...)
  TD.floats = TD.floats.filter(f => now - f.t0 < 1200);
  TD.floats.forEach(f => {
    const k = (now - f.t0) / 1200, sp = topdownToScreen(f.x, f.y, cam, w, h, zoom);
    const fy = sp.y - 34 * zoom - 26 - k * 34; // starts above the interaction bubble and rises
    g.globalAlpha = 1 - k * k; g.font = 'bold ' + (13 + zoom) + 'px ' + getComputedStyle(document.body).getPropertyValue('--font-mono');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000'; g.fillText(f.text, sp.x + 1, fy + 1);
    g.fillStyle = f.color; g.fillText(f.text, sp.x, fy);
    g.globalAlpha = 1; g.textAlign = 'left';
  });
  tdRenderMinimap(cam);
  if(typeof tdUpdateActionButton === 'function') tdUpdateActionButton();
}

// Minimap (blueprint 3.5): ground, the workshop, DISCOVERED mines only, the player and the view.
function tdRenderMinimap(cam){
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
  const [bx, by] = at(state.world.base.x, state.world.base.y);
  g.fillStyle = '#d68b3d'; g.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);
  const p = state.world.player, [px, py] = at(p.x, p.y);
  g.fillStyle = '#fff'; g.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4);
  const v = topdownVisibleRect(cam, TD.view.w, TD.view.h, TD.view.zoom), [vx0, vy0] = at(v.minX, v.minY), [vx1, vy1] = at(v.maxX, v.maxY);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.strokeRect(Math.round(vx0) + 0.5, Math.round(vy0) + 0.5, Math.round(vx1 - vx0), Math.round(vy1 - vy0));
}
