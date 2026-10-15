// =============================================================================
// Task 104-106: the top-down world (js/topdown/*). jsdom has no 2D canvas, so
// these check everything except the pixels: view math, the tile map against
// the walking rules, the draw list, the sprites as data, the world-first
// screen, proximity interaction, the phone joystick, and that nothing of it
// reaches the save. The pixels themselves are checked in Chromium.
// =============================================================================

// A page opened with a given URL (to test ?view=classic).
function tdDomAt(url, storage) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const win = dom.window;
  Object.defineProperty(win, 'localStorage', { value: storage || makeMemoryStorage(), configurable: true });
  win.eval(moduleSource + ';window.__td = { state: () => state, TD: () => TD };');
  Object.defineProperty(win, 'state', { get: () => win.__td.state(), configurable: true });
  allDoms.push(dom);
  return win;
}
function tdKey(win, target, key) {
  const e = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

// -----------------------------------------------------------------------------
// Task 104: view math, tile map, draw list
// -----------------------------------------------------------------------------
(function test_T104_viewMath() {
  const win = newDom(makeMemoryStorage()).window;
  check('Task104: one world unit is 4 tiles of 16 px (64 px at zoom 1)', win.TOPDOWN.TILE === 16 && win.TOPDOWN.TILES_PER_UNIT === 4 && win.TD_UNIT_PX === 64);
  check('Task104: integer zoom — PC 1280x800 -> 3, phone 390x664 -> 2, 1920x1080 -> 4, tiny -> 1',
    win.topdownZoom(1280, 800) === 3 && win.topdownZoom(390, 664) === 2 && win.topdownZoom(1920, 1080) === 4 && win.topdownZoom(100, 100) === 1 && win.topdownZoom(5000, 5000) === win.TOPDOWN.MAX_ZOOM && win.topdownZoom(0, 0) === 1);
  const r = win.topdownWorldRect();
  check('Task104: the drawn world is the bounds plus a 2-unit forest edge', r.minX === -12 && r.maxX === 12 && r.minY === -12 && r.maxY === 12);
  const mid = win.topdownCamera({ x: 2, y: 0 }, 1280, 800, 3);
  check('Task104: the camera centres on the player away from the edges', mid.x === 2 && mid.y === 0);
  const s = win.topdownScale(3), halfW = 1280 / (2 * s), halfH = 800 / (2 * s);
  const corner = win.topdownCamera({ x: 10, y: 10 }, 1280, 800, 3);
  const corner2 = win.topdownCamera({ x: -10, y: -10 }, 1280, 800, 3);
  check('Task104: at a corner the camera stops so nothing past the drawn world shows',
    Math.abs(corner.x - (12 - halfW)) < 1e-9 && Math.abs(corner.y - (12 - halfH)) < 1e-9 && Math.abs(corner2.x - (-12 + halfW)) < 1e-9 && Math.abs(corner2.y - (-12 + halfH)) < 1e-9);
  const huge = win.topdownCamera({ x: 7, y: -3 }, 8000, 8000, 1);
  check('Task104: a view larger than the world is centred on it', huge.x === 0 && huge.y === 0);
  const sp = win.topdownToScreen(3.5, -1.25, mid, 1280, 800, 3), back = win.topdownToWorld(sp.x, sp.y, mid, 1280, 800, 3);
  check('Task104: world -> screen -> world round trip (whole pixels)', Math.abs(back.x - 3.5) < 1 / s && Math.abs(back.y + 1.25) < 1 / s && sp.x === Math.round(sp.x));
  const pc = win.topdownToScreen(2, 0, mid, 1280, 800, 3);
  check('Task104: the player is drawn at the screen centre', pc.x === 640 && pc.y === 400);
  // smoothing between ticks
  const t = {}, TICK = win.TICK_MS;
  win.topdownTrack(t, 0, 0, 1000);
  const a = win.topdownTrack(t, 0.3, 0, 1000), b = win.topdownTrack(t, 0.3, 0, 1000 + TICK / 2), c = win.topdownTrack(t, 0.3, 0, 1000 + TICK * 2);
  check('Task104: the drawn position glides from the last tick to the new one', a.x === 0 && Math.abs(b.x - 0.15) < 1e-9 && c.x === 0.3);
  check('Task104: walked distance follows the glide', Math.abs(b.walked - 0.15) < 1e-9 && Math.abs(c.walked - 0.3) < 1e-9);
  const j = win.topdownTrack(t, 9, 9, 1000 + TICK * 3);
  check('Task104: a big jump (load) snaps instead of sliding across the map', j.x === 9 && j.y === 9 && Math.abs(j.walked - 0.3) < 1e-9);
  check('Task104: walk frames cycle 0-3 while walking, 0 when standing',
    win.topdownWalkFrame(0, 'walk') === 0 && win.topdownWalkFrame(0.23, 'walk') === 1 && win.topdownWalkFrame(0.9, 'walk') === 0 && win.topdownWalkFrame(0.7, 'walk') === 3 && win.topdownWalkFrame(5, 'idle') === 0);
  check('Task104: nothing of the view is in the game state', !('camera' in win.state.world) && !('zoom' in win.state.world) && Object.keys(win.state.world.player).sort().join() === 'facing,pose,x,y');
})();

(function test_T104_tileMapMatchesWalking() {
  const win = newDom(makeMemoryStorage()).window;
  const T = win.TD_TILE, base = win.state.world.base;
  const walkTypes = [T.GRASS, T.BEYOND, T.TUNNEL, T.PATH];
  [false, true].forEach((open) => {
    const map = win.tdBuildTileMap(open, base);
    let bad = 0, rockWalk = 0, beyondShown = 0;
    for (let j = 0; j < map.rows; j++) for (let i = 0; i < map.cols; i++) {
      const x = map.originX + (i + 0.5) / 4, y = map.originY + (j + 0.5) / 4, type = map.types[j * map.cols + i];
      const walk = win.isWorldPointWalkable(x, y, open);
      if (walk && !walkTypes.includes(type)) bad++;          // walkable ground drawn as rock / forest
      if ((type === T.ROCK || type === T.EDGE) && walk) rockWalk++;
      if (type === T.BEYOND) beyondShown++;
    }
    const tag = open ? 'open' : 'closed';
    check('Task104: tunnel ' + tag + ' — 96 x 96 tiles over the drawn world', map.cols === 96 && map.rows === 96 && map.types.length === 96 * 96 && map.tunnelOpen === open);
    check('Task104: tunnel ' + tag + ' — every walkable spot is drawn as ground (never as rock or forest)', bad === 0);
    check('Task104: tunnel ' + tag + ' — nothing drawn as rock or forest edge can be walked on', rockWalk === 0);
    check('Task104: tunnel ' + tag + ' — the land beyond is drawn (fogged while closed)', beyondShown > 500);
  });
  const t = win.terrainTunnel();
  const closed = win.tdBuildTileMap(false, base), open = win.tdBuildTileMap(true, base);
  const at = (map, x, y) => map.types[Math.floor((y - map.originY) * 4) * map.cols + Math.floor((x - map.originX) * 4)];
  check('Task104: closed tunnel — the recess in front of the gate is floor, behind it is rock', at(closed, t.gateX + 0.2, t.y) === T.TUNNEL && at(closed, t.gateX - 0.5, t.y) === T.ROCK);
  check('Task104: open tunnel — the passage runs through the range', at(open, t.gateX - 0.5, t.y) === T.TUNNEL && at(open, win.terrainTunnelExit().x + 0.1, t.y) === T.TUNNEL);
  check('Task104: a dirt yard around the workshop and a road towards the tunnel', at(closed, base.x, base.y + 0.5) === T.PATH && at(closed, (base.x + t.mouthX) / 2, (base.y + t.y) / 2) === T.PATH);
  const img = win.tdPaintTileMap(closed), img2 = win.tdPaintTileMap(closed), imgOpen = win.tdPaintTileMap(open);
  let opaque = true; for (let k = 3; k < img.data.length; k += 4000) if (img.data[k] !== 255) opaque = false;
  check('Task104: the painted ground is 1536 x 1536 px, fully opaque', img.width === 1536 && img.height === 1536 && img.data.length === 1536 * 1536 * 4 && opaque);
  let same = true; for (let k = 0; k < img.data.length; k += 997) if (img.data[k] !== img2.data[k]) same = false;
  check('Task104: the ground looks the same every time (fixed pattern, nothing random)', same);
  const bright = (im, x, y) => { const o = (Math.round((y - closed.originY) * 64) * im.width + Math.round((x - closed.originX) * 64)) * 4; return im.data[o] + im.data[o + 1] + im.data[o + 2]; };
  let darker = 0; for (let k = 0; k < 20; k++) { const y = -8 + k * 0.8; if (bright(img, -9, y) < bright(imgOpen, -9, y)) darker++; }
  check('Task104: the land beyond is under fog until the tunnel opens', darker >= 18);
})();
