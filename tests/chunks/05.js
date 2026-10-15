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

(function test_T104_drawList() {
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  const s = win.state;
  win.secureMine('mine_start_iron');
  win.addWorkshop({ x: s.world.base.x + 1, y: s.world.base.y + 1, level: 4 });
  const list = win.tdDrawList({ dir: 'left', frame: 2, x: 3, y: 1 });
  const kinds = (k) => list.filter((it) => it.kind === k);
  check('Task104: draw list — the workshop, its lamp, every mine once, the workshop huts and the player',
    kinds('base').length === 1 && list.some((it) => it.prop === 'lamp') && kinds('ore').length === s.world.mines.length && kinds('workshop').length === 1 && kinds('player').length === 1);
  check('Task104: draw list — mine looks follow discovery and securing', list.find((it) => it.id === 'mine_start_iron').look === 'secured' &&
    list.find((it) => it.id === 'mine_start_coal').look === 'unsecured' && kinds('ore').filter((it) => it.look === 'undiscovered').length === s.world.hiddenMineIds.length && s.world.hiddenMineIds.length > 0);
  check('Task104: draw list — the craft hut look follows its level tier', kinds('workshop')[0].tier === 2);
  check('Task104: draw list — sorted back to front by y', list.every((it, k) => k === 0 || list[k - 1].sortY <= it.sortY));
  check('Task104: draw list — the closed gate is drawn and no land-beyond scenery yet', kinds('gate').length === 1 && !list.some((it) => it.kind === 'prop' && it.prop !== 'lamp'));
  s.world.tunnelUnlocked = true;
  const open = win.tdDrawList(null);
  check('Task104: draw list — once open, the gate is gone and the scenery beyond appears', !open.some((it) => it.kind === 'gate') && open.filter((it) => it.kind === 'prop' && it.prop !== 'lamp').length > 20 && !open.some((it) => it.kind === 'player'));
  let ok = true;
  try { win.tdRender(1000); win.tdRenderMinimap({ x: 0, y: 0 }); } catch (e) { ok = false; }
  check('Task104: without a 2D canvas (jsdom) the renderer draws nothing and does not fail', ok && win.TD.ctx === null && win.TD.running === false);
})();

// -----------------------------------------------------------------------------
// Task 105: the pixel art (as data)
// -----------------------------------------------------------------------------
(function test_T105_sprites() {
  const win = newDom(makeMemoryStorage()).window;
  const inside = (sp) => sp.rects.length > 0 && sp.rects.every(([x, y, w, h]) => x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= sp.w && y + h <= sp.h);
  const key = (sp) => JSON.stringify(sp.rects);
  const dirs = ['down', 'up', 'left', 'right'];
  const all = dirs.map((d) => [0, 1, 2, 3].map((f) => win.tdPlayerSprite(d, f)));
  check('Task105: the player has 4 directions x 4 walk frames, 16 x 22, all inside', all.every((row) => row.every((sp) => sp.w === 16 && sp.h === 22 && inside(sp))));
  check('Task105: walking frames differ from standing (legs and arms move)', dirs.every((d, k) => key(all[k][1]) !== key(all[k][0]) && key(all[k][3]) !== key(all[k][0]) && key(all[k][1]) !== key(all[k][3])));
  check('Task105: the four directions look different', new Set(all.map((row) => key(row[0]))).size === 4);
  const r0 = win.tdPlayerSprite('right', 0), l0 = win.tdPlayerSprite('left', 0);
  check('Task105: facing left is the mirror of facing right', l0.rects.every(([x, y, w, h, c], k) => x === 16 - r0.rects[k][0] - r0.rects[k][2] && y === r0.rects[k][1] && c === r0.rects[k][4]));
  check('Task105: the miner wears a helmet with a lamp facing down and to the side, not from behind',
    key(win.tdPlayerSprite('down', 0)).includes(win.TD_PLAYER_COLORS.lamp) && key(r0).includes(win.TD_PLAYER_COLORS.lamp) && !key(win.tdPlayerSprite('up', 0)).includes(win.TD_PLAYER_COLORS.lamp));
  const resKeys = win.RESOURCES.map((r) => r.key);
  check('Task105: every resource has its own ore colour', resKeys.every((k) => win.TD_RES_COLORS[k]) && new Set(resKeys.map((k) => win.TD_RES_COLORS[k][0])).size === resKeys.length);
  check('Task105: an ore boulder shows its resource colour; an undiscovered one shows none', resKeys.every((k) => key(win.tdOreSprite(k, 'unsecured')).includes(win.TD_RES_COLORS[k][0]) && inside(win.tdOreSprite(k, 'secured'))) &&
    resKeys.every((k) => !key(win.tdOreSprite(null, 'undiscovered')).includes(win.TD_RES_COLORS[k][0])));
  check('Task105: a secured vein carries the teal flag, an unsecured one does not', key(win.tdOreSprite('iron', 'secured')).includes('#3fc9b0') && !key(win.tdOreSprite('iron', 'unsecured')).includes('#3fc9b0'));
  check('Task105: the workshop cabin and the three craft hut tiers', inside(win.tdBaseSprite()) && win.tdBaseSprite().w === 64 && [1, 2, 3].every((t) => inside(win.tdWorkshopSprite(t))) &&
    new Set([1, 2, 3].map((t) => key(win.tdWorkshopSprite(t)))).size === 3);
  const propKinds = new Set();
  ['deepForest', 'rockyGround', 'halfDugMine', 'rareDeep'].forEach((z) => win.WORLD_TERRAIN.BEYOND.PROPS[z].forEach((row) => propKinds.add(row.kind)));
  win.terrainBeyondProps().forEach((pr) => propKinds.add(pr.kind));
  const pebble = key(win.tdPropSprite('no-such-kind'));
  check('Task105: every kind of scenery beyond the mountain has its own sprite', [...propKinds].every((k) => inside(win.tdPropSprite(k)) && key(win.tdPropSprite(k)) !== pebble) && propKinds.size >= 9);
  const tdSrc = fs.readdirSync(path.join(__dirname, '..', 'js', 'topdown')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', 'topdown', f), 'utf8')).join('\n');
  check('Task105: the art is drawn in code — no image files or image URLs in the top-down code', !/\.(png|jpe?g|gif|webp)\b|url\(|new Image\(|https?:\/\//i.test(tdSrc));
  check('Task105: without a canvas, baking a sprite returns nothing and does not fail', win.tdSpriteImage(win.tdPlayerSprite('down', 0)) === null);
})();

// -----------------------------------------------------------------------------
// Task 106: the world-first screen, proximity interaction, phone controls
// -----------------------------------------------------------------------------
(function test_T106_screen() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const doc = win.document, body = doc.body;
  check('Task106: the top-down view is the default — world canvas, HUD, minimap, dock', body.classList.contains('view-topdown') &&
    !!doc.getElementById('tdCanvas') && body.firstElementChild.id === 'tdCanvas' && !!doc.getElementById('tdMinimap') && !!doc.querySelector('.tabbar .td-log-btn'));
  check('Task106: the five tabs stay in the dock with their content', doc.querySelectorAll('.tabbar .tab-btn').length === 5 && !!doc.querySelector('#tab-research #researchList'));
  check('Task106: no panel is open at the start (the world is the screen)', !body.classList.contains('td-panel-open') && !body.classList.contains('td-log-open'));
  const devBtn = doc.querySelector('.tab-btn[data-tab="dev"]');
  devBtn.click();
  check('Task106: a dock button opens its panel', body.classList.contains('td-panel-open') && devBtn.classList.contains('active') && doc.getElementById('tab-dev').classList.contains('active'));
  devBtn.click();
  check('Task106: pressing the open tab again closes it', !body.classList.contains('td-panel-open'));
  doc.querySelector('.tab-btn[data-tab="research"]').click();
  tdKey(win, doc.body, 'Escape');
  check('Task106: Escape closes a panel', !body.classList.contains('td-panel-open'));
  doc.querySelector('.td-log-btn').click();
  check('Task106: the log opens as its own panel', body.classList.contains('td-log-open') && !body.classList.contains('td-panel-open'));
  doc.getElementById('tdClose').click();
  check('Task106: the close button closes it', !body.classList.contains('td-log-open'));
  doc.querySelector('.tab-btn[data-tab="workers"]').click();
  doc.querySelector('.td-log-btn').click();
  check('Task106: only one panel at a time', body.classList.contains('td-log-open') && !body.classList.contains('td-panel-open'));
  // the classic page is still there with ?view=classic, remembered apart from the save
  const store2 = makeMemoryStorage();
  const classic = tdDomAt('https://example.test/?view=classic', store2);
  check('Task106: ?view=classic keeps the old page (no world canvas, 2.5D stage in place)', !classic.document.body.classList.contains('view-topdown') &&
    !classic.document.getElementById('tdCanvas') && !!classic.document.getElementById('worldStage'));
  check('Task106: the view choice is kept in its own key, not in the game save', store2.getItem('gachaFactoryView') === 'classic' &&
    (classic.saveGame(), !/classic|topdown|view/.test(store2.getItem('gachaFactorySave'))));
  const again = tdDomAt('https://example.test/', store2);
  check('Task106: the remembered choice applies on the next visit; ?view=topdown switches back', !again.document.body.classList.contains('view-topdown') &&
    tdDomAt('https://example.test/?view=topdown', store2).document.body.classList.contains('view-topdown') && store2.getItem('gachaFactoryView') === 'topdown');
})();

(function test_T106_interaction() {
  const win = newDom(makeMemoryStorage()).window;
  const doc = win.document, s = win.state, p = s.world.player;
  const iron = win.mineById('mine_start_iron');
  const stand = (x, y) => { p.x = x; p.y = y; };
  stand(iron.x + 3, iron.y + 3);
  const far = win.tdInteractTarget(p.x, p.y);
  check('Task106: far from everything there is nothing to act on', far === null || (far.type !== 'mine'));
  stand(iron.x + 1.1, iron.y);
  check('Task106: within reach (1.1) of an unsecured vein the action is "secure"', win.tdInteractTarget(p.x, p.y).action === 'secure' && win.tdInteractTarget(p.x, p.y).id === iron.id);
  stand(iron.x + 1.3, iron.y);
  const t13 = win.tdInteractTarget(p.x, p.y);
  check('Task106: just out of reach (1.3) it is not offered', !t13 || t13.id !== iron.id);
  stand(iron.x + 0.4, iron.y);
  tdKey(win, doc.body, 'e');
  check('Task106: E secures the vein through the game\'s own secureMine', iron.developmentState === 'secured' && doc.querySelector('[data-secure-mine="' + iron.id + '"]').disabled === true);
  check('Task106: next the action is "mine" with the amount', win.tdInteractTarget(p.x, p.y).action === 'mine' && /\+1/.test(win.tdInteractTarget(p.x, p.y).label));
  const i0 = s.resources.iron;
  tdKey(win, doc.body, 'e'); tdKey(win, doc.body, ' ');
  check('Task106: E and Space mine it (miningPower x multiplier each)', Math.abs(s.resources.iron - i0 - 2 * iron.miningPower * win.mult()) < 1e-9);
  const field = doc.querySelector('[data-craft-target="steel"]');
  const i1 = s.resources.iron;
  tdKey(win, field, 'e');
  const btn = doc.querySelector('.tab-btn');
  tdKey(win, btn, ' ');
  check('Task106: E typed in a field and Space on a button do not act', s.resources.iron === i1);
  doc.querySelector('[data-mine-mine="' + iron.id + '"]').click();
  check('Task106: the remote panel buttons still work (kept by decision)', s.resources.iron > i1);
  // a vein whose site is still locked
  const mana = win.addMine({ id: 'mine_t106_mana', x: s.world.base.x + 4, y: s.world.base.y - 4, resource: 'mana', grade: 2, miningPower: 1, developmentState: 'unsecured' });
  stand(mana.x - 0.5, mana.y);
  const lk = win.tdInteractTarget(p.x, p.y);
  tdKey(win, doc.body, 'e');
  check('Task106: a vein of a locked site says what is needed and stays unsecured', lk.action === 'locked' && /해금 필요/.test(lk.label) && mana.developmentState === 'unsecured');
  // hidden veins are never a target
  const hid = win.addMine({ id: 'mine_t106_hidden', x: s.world.base.x - 2, y: s.world.base.y + 4, resource: 'coal', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  s.world.hiddenMineIds.push(hid.id);
  check('Task106: an undiscovered vein is not offered (walking near discovers it instead)', win.tdInteractTarget(hid.x + 0.3, hid.y) === null || win.tdInteractTarget(hid.x + 0.3, hid.y).id !== hid.id);
  // the workshop and a craft hut open the craft panel
  stand(s.world.base.x, s.world.base.y + 0.3);
  tdKey(win, doc.body, 'e');
  check('Task106: E at the workshop door opens the craft (개발) panel', doc.body.classList.contains('td-panel-open') && doc.querySelector('.tab-btn.active').dataset.tab === 'dev');
  tdKey(win, doc.body, 'Escape');
  const hut = win.addWorkshop({ x: s.world.base.x + 3, y: s.world.base.y + 3, level: 1 });
  stand(hut.x + 0.3, hut.y);
  check('Task106: a craft hut is a target too', win.tdInteractTarget(p.x, p.y).type === 'workshop' && win.tdInteract(win.tdInteractTarget(p.x, p.y)).open === 'dev');
  // the action button (phone) does the same
  stand(iron.x + 0.4, iron.y);
  win.TD.target = win.tdInteractTarget(p.x, p.y);
  win.tdUpdateActionButton();
  const action = doc.getElementById('tdAction');
  const i2 = s.resources.iron;
  action.click();
  check('Task106: the action button shows the action and does it', action.textContent === '캐기' && !action.classList.contains('is-idle') && s.resources.iron > i2);
  win.TD.target = null; win.tdUpdateActionButton();
  check('Task106: with nothing in reach the button is idle', action.classList.contains('is-idle'));
})();

(function test_T106_joystickAndSave() {
  const storage = makeMemoryStorage(T103_FIXTURE_RAW);
  storage.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const win = newDom(storage).window;
  const s = win.state, p = s.world.player;
  const D = (dx, dy) => win.tdStickDirs(dx, dy, 60).sort().join();
  check('Task106: joystick — inside the dead zone nothing is held', D(5, 5) === '' && D(0, 0) === '');
  check('Task106: joystick — 8 directions', D(50, 0) === 'right' && D(-50, 0) === 'left' && D(0, -50) === 'up' && D(0, 50) === 'down' &&
    D(40, 40) === 'down,right' && D(-40, -40) === 'left,up' && D(40, -40) === 'right,up' && D(-40, 40) === 'down,left');
  check('Task106: joystick — a mostly-sideways push is one direction', D(55, 15) === 'right');
  const x0 = p.x;
  win.tdSetStickDirs(['right']);
  for (let i = 0; i < 4; i++) win.tickPlayer();
  win.tdSetStickDirs([]);
  win.tickPlayer();
  check('Task106: joystick directions walk the player and letting go stops', p.x > x0 && p.pose === 'idle' && win.isWorldPointWalkable(p.x, p.y));
  check('Task106: the stick and the action button exist for touch screens', !!win.document.querySelector('#tdStick .td-knob') && !!win.document.getElementById('tdAction'));
  // nothing of the new screen reaches the save
  win.document.querySelector('.tab-btn[data-tab="delivery"]').click();
  win.tdInteractNow();
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task106: after using the new screen the save has exactly the fixture\'s structure (saveVersion 1)', sv.saveVersion === 1 && JSON.stringify(t103Shape(sv)) === JSON.stringify(t103Shape(T103_FIXTURE)));
  check('Task106: no camera, zoom, panel or joystick state in the save', !/camera|zoom|panel|stick|tdView|topdown/i.test(JSON.stringify(sv)));
})();
