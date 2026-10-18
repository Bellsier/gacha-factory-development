// =============================================================================
// Task 118~122: the village district (plaza and roads), the player's house,
// the garden, mineral and gem donations and the museum's rewards (blueprint 24.9).
// =============================================================================

// A new run in `win` with a generated world from a fixed seed (no Math.random: the same every run).
function t118World(win, seed, opts) {
  const o = opts || {};
  const rnd = t103Random(seed);
  const fresh = win.freshRunState(), s = win.state;
  Object.keys(fresh).forEach((k) => { s[k] = fresh[k]; });
  s.world.hiddenMineIds = [];
  s.world.mines = win.generateInitialWorldMines(s.world.base, { random: rnd });
  s.research.workshopBuild = true; s.research.workshopExpansion = true; s.gold = 1e12;
  Object.keys(s.products).forEach((k) => { s.products[k] = 1e6; });
  if (o.hutsFirst) for (let i = 0; i < 8; i++) win.buildWorkshop();
  win.villageEnsureSites();
  if (o.hutsAfter) for (let i = 0; i < 8; i++) win.buildWorkshop();
  if (o.full) {
    ['manaVein', 'ruins', 'spaceStation'].forEach((k) => { s.unlockedSites[k] = true; win.seedWorldMinesForSite(k); });
    win.unlockTunnel({ random: rnd }); win.surveyMines({ random: rnd });
  }
  return s;
}

// Every point along every road (0.05 apart) can be stood on.
function t118RoadsStandable(win) {
  return win.villageRoads().every((r) => r.points.every((p, i) => {
    if (i === 0) return true;
    const a = r.points[i - 1], n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / 0.05));
    for (let k = 0; k <= n; k++) if (!win.playerCanStand(a.x + (p.x - a.x) * k / n, a.y + (p.y - a.y) * k / n)) return false;
    return true;
  }));
}

// The district rules, checked from outside: inside the meadow, clear of veins, huts, the workshop yard,
// the facilities and the tunnel road, with roads to every door that lead round everything.
function t118Rules(win) {
  const s = win.state, v = s.village, D = win.VILLAGE.DISTRICT, w = s.world;
  if (!v.district) return 'no district';
  const parts = win.villageDistrictParts(v.district);
  const veins = w.mines.concat(win.worldGenExpansionSeedCells(w.base));
  for (const r of parts.rects) {
    for (let x = r.minX; x <= r.maxX + 1e-9; x += 0.25) for (let y = r.minY; y <= r.maxY + 1e-9; y += 0.25) if (win.terrainRegionAt(x, y) !== 'open') return 'not on the meadow';
    if (win.villageRectDist(r, w.base.x, w.base.y) < D.BASE_CLEAR - 1e-9) return 'workshop yard';
    if (veins.some((m) => win.villageRectDist(r, m.x, m.y) < D.MINE_CLEAR - 1e-9)) return 'vein';
    if (w.workshops.some((h) => win.villageRectDist(r, h.x, h.y) < Math.min(D.HUT_CLEAR, D.BUILD_CLEAR) - 1e-9)) return 'hut';
    if (win.VILLAGE.ORDER.some((k) => win.villageRectDist(r, v.sites[k].x, v.sites[k].y) < D.FACILITY_CLEAR - 1e-9)) return 'facility';
  }
  const d = Math.hypot(v.district.x - w.base.x, v.district.y - w.base.y);
  if (d < D.DIST[0] - 1e-9 || d > D.DIST_WIDE + 1e-9) return 'distance ' + d;
  const roads = win.villageRoads(), ends = win.villageRoadEnds();
  if (roads.length !== ends.length) return 'roads ' + roads.length + '/' + ends.length;
  // each road starts at its door step and ends on the plaza or on a road laid before it
  if (!roads.every((r, i) => { const e = r.points[r.points.length - 1];
    return r.to === ends[i].to && r.points[0].x === ends[i].x && r.points[0].y === ends[i].y &&
      (Math.hypot(e.x - v.district.x, e.y - v.district.y) <= D.PLAZA_R || roads.slice(0, i).some((q) => win.villageSegPolyDist(q.points, e.x, e.y) <= 0.25)); })) return 'road ends';
  if (!t118RoadsStandable(win)) return 'road blocked';
  return '';
}

(function test_T118_newGame() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, v = s.village, D = win.VILLAGE.DISTRICT;
  check('Task118: a new game gets a village plaza when it starts (after the facility sites)', !!v.district && Number.isInteger(v.district.layout) &&
    v.district.layout >= 0 && v.district.layout < D.LAYOUTS.length && !!v.sites.appraiser && !!v.sites.museum);
  check('Task118: the plaza is on free meadow away from the workshop, clear of veins, huts and the facilities, with roads that can be walked', t118Rules(win) === '', t118Rules(win));
  const r = t114Reach(win);
  check('Task118: the workshop, both facility doors and every vein are still reachable and nothing is cut off', r.doorsOk && r.minesOk && r.pockets === 0);
  const parts = win.villageDistrictParts(v.district);
  check('Task118: the plaza and the house door can be walked to from the workshop', win.playerCanStand(parts.plaza.x, parts.plaza.y) && win.playerCanStand(parts.house.x, parts.house.y + 0.1));
  const roads = win.villageRoads();
  check('Task118: roads lead from the plaza to the workshop, the appraiser and the museum (Task 119: and the house)', roads.map((x) => x.to).join() === 'workshop,appraiser,museum,house');
  check('Task118: the roads are worked out again the same way (cached, nothing random)', win.villageRoadsCompute().map((x) => JSON.stringify(x.points)).join() === roads.map((x) => JSON.stringify(x.points)).join());
  check('Task118: the plaza and the roads block nothing (no new obstacles)', !win.worldObstacles().some((o) => ['plaza', 'road'].includes(o.kind)) && win.playerCanStand(parts.plaza.x + 0.5, parts.plaza.y));
  // saved, and kept on load (not chosen again)
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task118: the plaza point is saved in run.village.district (saveVersion 1); roads are not saved', sv.saveVersion === 1 && t103Canon(sv.run.village.district) === t103Canon(v.district) &&
    !JSON.stringify(sv).includes('roads'));
  const moved = JSON.parse(JSON.stringify(sv)); moved.run.village.district = { x: v.district.x + 0.5, y: v.district.y, layout: v.district.layout };
  const st2 = makeMemoryStorage(); st2.setItem('gachaFactorySave', JSON.stringify(moved));
  const w2 = newDom(st2).window;
  check('Task118: a saved plaza is kept exactly where it was on load', w2.state.village.district.x === v.district.x + 0.5 && w2.state.village.district.y === v.district.y);
})();

(function test_T118_sanitize() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  const bad = [null, 'plaza', { x: 'a', y: 1, layout: 0 }, { x: 1, y: 1 }, { x: 1, y: 1, layout: 99 }, { x: 1, y: 1, layout: -1 }, { x: 1, y: 1, layout: 1.5 }, { x: 40, y: 1, layout: 0 }];
  const ok = bad.every((d) => win.sanitizeVillageDistrict(d) === null);
  check('Task118: an invalid saved plaza (not a point, no layout, unknown layout, outside the world) is dropped', ok);
  sv.run.village.district = { x: 'a' };
  const st2 = makeMemoryStorage(); st2.setItem('gachaFactorySave', JSON.stringify(sv));
  const w2 = newDom(st2).window;
  check('Task118: ...and the village simply gets a plaza again on load', !!w2.state.village.district && t118Rules(w2) === '');
})();

(function test_T118_oldSaveAndManyWorlds() {
  // the fixture (from before the village): its mines, huts and facility sites stay; the plaza is added round them
  const st = makeMemoryStorage(); st.setItem('gachaFactorySave', T103_FIXTURE_RAW);
  const fx = newDom(st).window;
  check('Task118: an older save gets a plaza when it loads; its mines and huts are not moved or removed', !!fx.state.village.district &&
    t103Canon(fx.state.world.mines) === t103Canon(T103_FIXTURE.run.world.mines) && t103Canon(fx.state.world.workshops) === t103Canon(T103_FIXTURE.run.world.workshops));
  const rf = t114Reach(fx);
  check('Task118: in the fixture the plaza follows the rules and everything stays reachable', t118Rules(fx) === '' && rf.doorsOk && rf.minesOk && rf.pockets === 0, t118Rules(fx));
  // generated worlds from fixed seeds, 8 huts before (an older save) or after (a new game), expansions, the tunnel open
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  let bad = 0, worlds = 0, why = '';
  for (let seed = 1; seed <= 14; seed++) {
    const hutsFirst = seed % 2 === 0;
    const s = t118World(win, seed * 9241, { hutsFirst, hutsAfter: !hutsFirst, full: true });
    const r = t114Reach(win), rule = t118Rules(win);
    worlds++;
    if (rule || !r.doorsOk || !r.minesOk || r.pockets || s.world.workshops.length !== 8) { bad++; why += seed + ':' + (rule || 'reach') + ' '; }
  }
  check('Task118: in 14 generated worlds (8 huts before or after, expansions, tunnel) the plaza follows the rules, roads lead to every door and everything stays reachable', worlds === 14 && bad === 0, why);
})();

(function test_T118_noRoom() {
  // a world without room for a village: the game goes on, the panel says so, and the search is not repeated every tick
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, b = s.world.base;
  s.village.district = null;
  const mines = [];
  for (let y = -9; y <= 9; y++) for (let x = -3; x <= 9; x++) if (Math.hypot(x - b.x, y - b.y) > 2.5) mines.push({ id: 'm' + x + '_' + y, x, y, resource: 'iron', grade: 1, miningPower: 1, developmentState: 'unsecured' });
  s.world.mines = mines;
  const t0 = Date.now();
  const first = win.villageEnsureDistrict();
  const t1 = Date.now();
  const again = win.villageEnsureDistrict();
  const t2 = Date.now();
  check('Task118: with no free meadow there is no plaza and nothing breaks', first === false && again === false && s.village.district === null && win.villageRoads().length === 0);
  check('Task118: a failed search is not repeated until the world changes', t2 - t1 <= Math.max(5, (t1 - t0) / 4));
  win.renderVillage();
  check('Task118: the panel says the plaza is still looking for a place', /자리를 찾는 중/.test(win.document.querySelector('[data-village="plaza"]').textContent));
})();

(function test_T118_hutsKeepOff() {
  // craft huts built after the plaza keep off the district and the roads
  const win = newDom(makeMemoryStorage(), { fullWorld: true }).window;
  let bad = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const s = t118World(win, seed * 31337, { hutsAfter: true });
    const D = win.VILLAGE.DISTRICT;
    s.world.workshops.forEach((h) => { if (win.villageGroundNear(h.x, h.y, D.BUILD_CLEAR - 1e-9)) bad++; });
    if (t118Rules(win)) bad++;
  }
  check('Task118: craft huts are never built on the plaza, the house or garden lots or a road', bad === 0);
})();

(function test_T118_groundAndBoard() {
  const win = newDom(makeMemoryStorage()).window;
  const s = win.state, T = win.TD_TILE;
  const g = win.villageGroundLayout(), d = s.village.district, base = s.world.base;
  check('Task118: the plaza is drawn as paving and the roads as cobbles', win.tdTileAt(d.x, d.y, false, base, g) === T.PLAZA &&
    g.roads.every((pts) => { const a = pts[1], b = pts[2] || pts[1]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const t = win.tdTileAt(mx, my, false, base, g); return t === T.ROAD || t === T.PLAZA || t === T.PATH; }));
  check('Task118: without the village the ground is drawn exactly as before', win.tdTileAt(d.x, d.y, false, base) === T.GRASS);
  const map = win.tdBuildTileMap(false, base, g), n = win.TOPDOWN.TILES_PER_UNIT;
  let roads = 0, plaza = 0, bad = 0;
  for (let j = 0; j < map.rows; j++) for (let i = 0; i < map.cols; i++) {
    const t = map.types[j * map.cols + i];
    if (t !== T.ROAD && t !== T.PLAZA) continue;
    if (t === T.ROAD) roads++; else plaza++;
    if (!win.isWorldPointWalkable(map.originX + (i + 0.5) / n, map.originY + (j + 0.5) / n)) bad++;
  }
  check('Task118: the tile map has road and plaza tiles, all on walkable ground', roads > 10 && plaza > 30 && bad === 0);
  // the notice board: E opens the 마을 panel
  const p = s.world.player;
  p.x = d.x; p.y = d.y + 0.3;
  const t = win.tdInteractTarget(p.x, p.y);
  check('Task118: at the plaza the notice board is the nearest thing to act on', !!t && t.type === 'plaza' && t.action === 'open');
  const r = win.tdInteract(t);
  check('Task118: acting on it opens the 마을 panel', r.ok && r.open === 'village');
  const list = win.tdDrawList(null);
  check('Task118: the board and two lamp posts stand on the plaza (drawn, not blocking)', list.filter((it) => it.kind === 'plazaProp').length === 3 && win.tdPlazaLights(0).length === 2 &&
    !win.worldObstacles().some((o) => o.kind === 'plazaProp'));
  win.renderVillage();
  const card = win.document.querySelector('[data-village="plaza"]');
  check('Task118: the 마을 panel has a plaza card listing its roads', !!card && /공방/.test(card.querySelector('[data-village-roads]').textContent) && /감정소/.test(card.textContent));
})();

(function test_T118_classic() {
  const win = tdDomAt('https://example.test/?view=classic', makeMemoryStorage());
  check('Task118: the classic screen has the plaza card too', !win.document.body.classList.contains('view-topdown') && !!win.document.querySelector('#villagePanel [data-village="plaza"]') &&
    !!win.state.village.district);
})();

// -----------------------------------------------------------------------------
// Task 119: the player's house and the room inside
// -----------------------------------------------------------------------------
function t119Hold(win, dirs, ticks) {
  dirs.forEach((d) => win.setPlayerHeld(d, true));
  for (let i = 0; i < ticks; i++) win.tickPlayer();
  win.clearPlayerHeld(); win.tickPlayer();
}

(function test_T119_house() {
  const storage = makeMemoryStorage();
  const win = newDom(storage).window;
  const s = win.state, H = win.VILLAGE.HOME, door = win.villageHouseDoor(), p = s.world.player;
  win.villageHomeExit();
  check('Task119: a new game has the player\'s house on its lot by the plaza (owned from the start, nothing to restore)', !!door &&
    door.x === s.village.district.x + win.VILLAGE.DISTRICT.LAYOUTS[s.village.district.layout].house.x);
  const walls = win.worldObstacles().filter((o) => o.kind === 'house');
  check('Task119: its walls block like the other buildings and its door step stays free', walls.length === 1 && !win.playerCanStand(door.x, door.y - 0.25) && win.playerCanStand(door.x, door.y + 0.15));
  const r = t114Reach(win);
  check('Task119: with the house standing, every door and vein is reachable and nothing is cut off', r.doorsOk && r.minesOk && r.pockets === 0);
  check('Task119: the house is drawn once, sorted by the front of its walls', win.tdDrawList(null).filter((it) => it.kind === 'house').length === 1);
  // going in
  p.x = door.x + 3; p.y = door.y + 2;
  check('Task119: far from the door the player cannot go in', win.villageHomeEnter() === false && !win.villageHomeInside() && /문 앞/.test(win.villageHomeEnterBlocker()));
  p.x = door.x; p.y = door.y + 0.5; p.facing = 'up';
  const t = win.tdInteractTarget(p.x, p.y);
  check('Task119: at the door the house is the thing to act on (E or the phone button: 들어가기)', !!t && t.type === 'house' && t.action === 'enter');
  const res = win.tdInteract(t);
  check('Task119: acting on it goes in; the world position waits on the door step', res.ok && win.villageHomeInside() && p.x === door.x && Math.abs(p.y - (door.y + 0.2)) < 1e-9);
  const sc = win.villageHomeScene();
  check('Task119: inside, the player stands just inside the door', sc.x === H.START.x && sc.y === H.START.y);
  // walking inside: the world position does not move, the room's walls and furniture block
  const wx = p.x, wy = p.y;
  t119Hold(win, ['up'], 3);
  check('Task119: walking inside moves the player in the room only', sc.y < H.START.y && p.x === wx && p.y === wy);
  let maxJump = 0, inWall = false;
  const before = { x: sc.x, y: sc.y };
  win.setPlayerHeld('left', true);
  for (let i = 0; i < 40; i++) { const bx = sc.x, by = sc.y; win.tickPlayer(); maxJump = Math.max(maxJump, Math.hypot(sc.x - bx, sc.y - by)); if (!win.villageHomeCanStand(sc.x, sc.y)) inWall = true; }
  win.clearPlayerHeld(); win.tickPlayer();
  check('Task119: the side wall stops the player flush, at the same speed as outside, never inside a wall', sc.x < before.x && !inWall && maxJump <= win.BALANCE.world.PLAYER_SPEED / win.TICKS_PER_SECOND + 1e-9 &&
    sc.x - win.PLAYER_FOOT.HALF_W >= 0.04 - 1e-9 && sc.x - win.PLAYER_FOOT.HALF_W < 0.1);
  const bed = H.FURNITURE.find((f) => f.key === 'bed');
  sc.x = bed.x; sc.y = bed.y + 0.4;
  t119Hold(win, ['up'], 20);
  check('Task119: the bed blocks (the player stops at its foot)', Math.abs(sc.y - (bed.y + win.PLAYER_FOOT.HALF_H)) < 0.02 && win.villageHomeInside());
  sc.x = 1.0; sc.y = 2.5;
  t119Hold(win, ['down'], 20);
  check('Task119: the bottom wall holds away from the door gap', win.villageHomeInside() && sc.y < H.ROOM.h);
  // every spot of the floor can be walked to from the door
  const st = 0.05, nx = Math.round(H.ROOM.w / st) + 1, ny = Math.round((H.EXIT_Y + 0.2) / st) + 1, can = (i, j) => win.villageHomeCanStand(i * st, j * st);
  const seen = new Set(), q = [[Math.round(H.START.x / st), Math.round(H.START.y / st)]]; seen.add(q[0].join());
  while (q.length) { const [i, j] = q.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const k = (i + a) + ',' + (j + b); if (seen.has(k) || i + a < 0 || j + b < 0 || i + a >= nx || j + b >= ny || !can(i + a, j + b)) return; seen.add(k); q.push([i + a, j + b]); }); }
  let standable = 0; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (can(i, j)) standable++;
  check('Task119: the whole floor is one open room (no spot walled in by the furniture), and the door gap leads out', standable > 1500 && seen.size === standable &&
    [...seen].some((k) => +k.split(',')[1] * st >= H.EXIT_Y));
  // the torch stays outside
  const torches = s.world.torches.length;
  check('Task119: no torch is set down inside', win.torchAct().ok === false && s.world.torches.length === torches);
  // saved inside: the save keeps the world position (the door step); nothing about the room is saved
  win.saveGame();
  const sv = JSON.parse(storage.getItem('gachaFactorySave'));
  check('Task119: a game saved inside keeps the player on the house\'s door step (no inside state in the save)', sv.run.world.player.x === door.x && Math.abs(sv.run.world.player.y - (door.y + 0.2)) < 1e-9 &&
    !/inside|homeScene/.test(JSON.stringify(sv)));
  const w2 = newDom(storage).window;
  check('Task119: ...and loads outside the door', !w2.villageHomeInside() && w2.state.world.player.x === door.x && w2.playerCanStand(w2.state.world.player.x, w2.state.world.player.y));
  // leaving by the door: E at the door, or walking out through the gap
  sc.x = H.DOOR.x; sc.y = H.ROOM.h - 0.25;
  const out = win.tdInteractTarget(0, 0);
  check('Task119: at the door inside, the door is the thing to act on (나가기)', !!out && out.type === 'homeDoor' && out.action === 'exit');
  check('Task119: acting on it goes out onto the door step', win.tdInteract(out).ok && !win.villageHomeInside() && p.x === door.x && Math.abs(p.y - (door.y + 0.25)) < 1e-9 && p.facing === 'down');
  p.x = door.x; p.y = door.y + 0.3; win.villageHomeEnter();
  sc.x = H.DOOR.x; sc.y = H.START.y;
  t119Hold(win, ['down'], 2); // 2.9 -> 3.2 -> out (the next tick would walk on outside)
  check('Task119: walking down through the door gap also comes out (onto the door step)', !win.villageHomeInside() && Math.abs(p.y - (door.y + 0.25)) < 1e-9);
  check('Task119: outside again the world moves as before', (() => { const y0 = p.y; t119Hold(win, ['down'], 2); return p.y > y0; })());
})();

(function test_T119_drawing() {
  const win = newDom(makeMemoryStorage()).window;
  const H = win.VILLAGE.HOME;
  const list = win.tdHomeDrawList({ dir: 'up', frame: 0, x: 2, y: 2 });
  check('Task119: the room\'s draw list is its furniture and the player, sorted back to front', list.filter((it) => it.kind === 'furniture').length === H.FURNITURE.length &&
    list.filter((it) => it.kind === 'player').length === 1 && list.every((it, k) => k === 0 || list[k - 1].sortY <= it.sortY));
  const cam = win.tdHomeCamera({ x: 0.3, y: 0.3 }, 2000, 1400, 2);
  check('Task119: on a big screen the room is centred; on a small one the camera follows the player within the room',
    Math.abs(cam.x - H.ROOM.w / 2) < 1e-9 && win.tdHomeCamera({ x: 0.3, y: 2 }, 390, 700, 2).x > 0.3);
  const room = win.tdHomeRoomSprite();
  check('Task119: the room picture matches the floor size (64 px a unit plus the drawn walls)', room.w === Math.round(H.ROOM.w * 64) + 2 * H.SIDE_PX && room.h === H.BACK_PX + Math.round(H.ROOM.h * 64) + H.BOTTOM_PX);
  check('Task119: every piece of furniture has its own picture', H.FURNITURE.every((f) => win.tdFurnitureSprite(f.key).rects.length >= 5) && win.tdHouseSprite().rects.length > 20);
  win.renderVillage();
  const card = win.document.querySelector('#villagePanel [data-village="house"]');
  check('Task119: the 마을 panel has a card for the house', !!card && /내 집/.test(card.textContent));
})();

// SUMMARY
// =============================================================================

allDoms.forEach((d) => { try { d.window.close(); } catch (e) { /* ignore */ } });

console.log('');
console.log(`Total: ${passCount + failCount}  Pass: ${passCount}  Fail: ${failCount}`);
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(' - ' + f));
}
process.exit(failCount === 0 ? 0 : 1);
