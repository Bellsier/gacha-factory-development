// =============================================================================
// Development preview save key. On the dev repository's Pages preview
// (<owner>.github.io/gacha-factory-development/) the game saves under
// gachaFactorySave.dev and never reads, writes or removes gachaFactorySave,
// the original game's save on the same github.io origin. Everywhere else the
// key is unchanged. (10.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
const DEV_PREVIEW_URL = 'https://bellsier.github.io/gacha-factory-development/';
const DEV_SAVE_KEY = 'gachaFactorySave.dev';

(function test_devSaveKey_byAddress() {
  const win = newDom(makeMemoryStorage()).window;
  [
    [DEV_PREVIEW_URL, DEV_SAVE_KEY],
    ['https://bellsier.github.io/gacha-factory-development/index.html?style=v2&res=1.5', DEV_SAVE_KEY],
    ['https://bellsier.github.io/gacha-factory-development', DEV_SAVE_KEY],
    ['https://Bellsier.github.io/Gacha-Factory-Development/', DEV_SAVE_KEY],
    ['https://someone.github.io/gacha-factory-development/', DEV_SAVE_KEY],
    ['https://bellsier.github.io/gacha-factory-prototype/', 'gachaFactorySave'],
    ['https://bellsier.github.io/', 'gachaFactorySave'],
    ['https://bellsier.github.io/gacha-factory-development-old/', 'gachaFactorySave'],
    ['http://127.0.0.1:8000/gacha-factory-development/', 'gachaFactorySave'],
    ['http://localhost/gacha-factory-development/index.html', 'gachaFactorySave'],
    ['file:///home/user/gacha-factory-development/index.html', 'gachaFactorySave'],
    ['https://example.test/', 'gachaFactorySave'],
  ].forEach(([u, key]) => check('DevSaveKey: ' + u + ' saves under ' + key, win.saveKeyFor(new win.URL(u)) === key));
  check('DevSaveKey: without a location the key is gachaFactorySave', win.saveKeyFor(null) === 'gachaFactorySave' && win.saveKeyFor(undefined) === 'gachaFactorySave' && win.saveKeyFor({}) === 'gachaFactorySave');
})();

(function test_devSaveKey_saveReloadReconnect() {
  // a browser that already holds the original game's save (written at a non-preview address)
  const storage = makeMemoryStorage();
  const orig = newDom(storage).window;
  orig.state.gold = 777;
  orig.saveGame();
  const origRaw = storage.getItem('gachaFactorySave');
  const origPayload = JSON.parse(origRaw);
  // every storage access the dev preview game makes is recorded
  const log = [];
  const logged = {
    getItem: (k) => { log.push(['get', k]); return storage.getItem(k); },
    setItem: (k, v) => { log.push(['set', k]); storage.setItem(k, v); },
    removeItem: (k) => { log.push(['remove', k]); storage.removeItem(k); },
    clear: () => { log.push(['clear', '']); storage.clear(); },
  };
  const touchedOriginal = () => log.some(([op, k]) => k === 'gachaFactorySave' || op === 'clear');
  const devOpts = { url: DEV_PREVIEW_URL, saveKey: DEV_SAVE_KEY };

  const dev1 = newDom(logged, devOpts).window;
  check('DevSaveKey: the dev preview starts fresh beside an original save (does not load it)', dev1.state.gold === 0);
  dev1.state.gold = 4321;
  check('DevSaveKey: saving in the dev preview succeeds', dev1.saveGame() === true);
  const devRaw = storage.getItem(DEV_SAVE_KEY);
  const devPayload = devRaw ? JSON.parse(devRaw) : null;
  check('DevSaveKey: the dev save is written under gachaFactorySave.dev', !!devPayload && devPayload.run.gold === 4321);
  check('DevSaveKey: the dev save is saveVersion 1 with the same top-level fields as the original save',
    !!devPayload && devPayload.saveVersion === 1 && Object.keys(devPayload).sort().join() === Object.keys(origPayload).sort().join());
  check('DevSaveKey: ...and the same run and permanent fields',
    !!devPayload && Object.keys(devPayload.run).sort().join() === Object.keys(origPayload.run).sort().join() &&
    Object.keys(devPayload.permanent).sort().join() === Object.keys(origPayload.permanent).sort().join());
  check('DevSaveKey: the original save is byte-for-byte unchanged after a dev save', storage.getItem('gachaFactorySave') === origRaw);

  // reload / reconnect: a new dev preview window on the same browser storage
  const dev2 = newDom(logged, devOpts).window;
  check('DevSaveKey: reopening the dev preview loads the dev save', dev2.state.gold === 4321);
  dev2.state.gold = 5000;
  dev2.saveGame();
  const dev3 = newDom(logged, devOpts).window;
  check('DevSaveKey: a second save and reopen keep the newest dev progress', dev3.state.gold === 5000);
  check('DevSaveKey: the dev preview never read, wrote or removed gachaFactorySave', !touchedOriginal());
  check('DevSaveKey: ...and the original save is still byte-for-byte unchanged', storage.getItem('gachaFactorySave') === origRaw);

  // the original game at its own address still sees only its own save
  const orig2 = newDom(storage).window;
  check('DevSaveKey: the original game still loads its own save, not the dev one', orig2.state.gold === 777);

  // the same saveVersion 1 data loads the same under either key
  const moved = makeMemoryStorage();
  moved.setItem(DEV_SAVE_KEY, origRaw);
  const dev4 = newDom(moved, devOpts).window;
  check('DevSaveKey: a saveVersion 1 save loads the same under the dev key', dev4.state.gold === 777 && moved.getItem('gachaFactorySave') === null);
})();

// UI pass 1: readable text, the panel clear of the dock, the first goal in the world's own steps,
// the interaction bubble off the player, and mining amounts on one line.
(function test_UI1_firstPass() {
  const win = newDom(makeMemoryStorage()).window, body = win.document.body;
  const hint = () => { win.updateNextHint(); return win.document.getElementById('nextHint').textContent; };
  // 4. the first goal: walk to a vein, then the workshop (PC: E, phone: the buttons); the classic page keeps the tabs
  check('UI1: the world-first view is on in the test page', body.classList.contains('view-topdown'));
  body.classList.remove('td-touch');
  check('UI1: first goal on PC: E at a vein, iron and coal, the first-ticket progress', /광맥 앞에서 E를 눌러 철광석과 석탄을 캐세요/.test(hint()) && /첫 가챠권까지 0\/50G/.test(hint()) && !/탭/.test(hint()));
  win.state.resources.iron = 2; win.state.resources.coal = 1;
  check('UI1: with the steel materials the goal moves on to the workshop', /공방 앞에서 E를 눌러 강철을 만들어 파세요/.test(hint()));
  win.state.resources.iron = 0; win.state.resources.coal = 0; win.state.products.steel = 1;
  check('UI1: ...and stays there while steel is waiting to be sold', /공방 앞에서 E를/.test(hint()));
  body.classList.add('td-touch');
  check('UI1: on a phone the goal names the buttons, not E', /열기 버튼/.test(hint()) && !/E를/.test(hint()));
  win.state.products.steel = 0;
  check('UI1: ...and the action button at a vein', /행동 버튼으로 철광석과 석탄을 캐세요/.test(hint()));
  win.state.gold = 20;
  check('UI1: the progress follows the gold', /20\/50G/.test(hint()));
  body.classList.remove('view-topdown');
  check('UI1: the classic page keeps its original tab wording', /채굴 탭에서 광석을 캔 뒤, 개발 탭에서 강철을 만들어 파세요/.test(hint()) && /\(현재 20\/50G\)/.test(hint()));
  body.classList.add('view-topdown');
  win.permanent.firstGachaGranted = true;
  check('UI1: after the first ticket the hints carry on as before', /일꾼/.test(hint()) && /뽑/.test(hint()));

  // 5. mining floats: one line per kind that adds up, never more than three lines at one point
  const TD = win.TD;
  TD.floats = [];
  for (let i = 0; i < 10; i++) win.tdAddFloat('+1 철광석', 3, 4, '#fff3b0', 34, { amount: 1.5, unit: '철광석' });
  check('UI1: ten hauls of one kind in a row make one float', TD.floats.length === 1 && TD.floats[0].text === '+' + win.fmt(15) + ' 철광석' && TD.floats[0].sum.amount === 15);
  win.tdAddFloat('+1 석탄', 3, 4, '#fff3b0', 34, { amount: 1, unit: '석탄' });
  check('UI1: another kind at the same point gets its own line above', TD.floats.length === 2 && TD.floats[1].stack === 1);
  ['a', 'b', 'c', 'd'].forEach((t) => win.tdAddFloat(t, 3, 4));
  const here = TD.floats.filter((f) => f.x === 3 && f.y === 4);
  check('UI1: at most three lines stay at one point, the oldest leaves first', here.length === 3 && here.map((f) => f.text).join() === 'b,c,d');
  check('UI1: the lines left are renumbered with no gap', here.map((f) => f.stack).join() === '0,1,2');
  win.tdAddFloat('x', 9, 9);
  check('UI1: another point keeps its own stack', TD.floats.filter((f) => f.x === 9).length === 1 && TD.floats.find((f) => f.x === 9).stack === 0);
  win.tdAddFloat('note', 9, 9); win.tdAddFloat('note', 9, 9);
  check('UI1: notes without an amount are never merged', TD.floats.filter((f) => f.x === 9).length === 3);
  // the mining action reports what it adds up
  const m = win.state.world.mines.find((x) => win.isMineDiscovered(x) && win.isMineSiteUnlocked(x));
  win.secureMine(m.id);
  const r = win.tdInteract({ type: 'mine', id: m.id, x: m.x, y: m.y, action: 'mine' });
  check('UI1: a haul names its amount and kind for the float', r.ok && (r.sum === null || (r.sum.amount === m.miningPower * win.mult() && r.sum.unit === win.resourceByKey(m.resource).name)));

  // 3. the bubble and the player's picture
  const pr = win.tdPlayerScreenRect({ x: 100, y: 200 }, 3);
  check('UI1: the player rect is the 16 x 22 sprite at its anchor', pr.x === 76 && pr.y === 137 && pr.w === 48 && pr.h === 66);
  check('UI1: overlapping rects are found, separate ones are not', win.tdRectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }) && !win.tdRectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }, 4));

  // 1 + 2. the stylesheet: Korean text face, the size floor, the panel ending above the dock
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  // Task 24: the floor is 14px (was 13) and the Korean UI face comes first, the system Korean faces after it
  check('UI1: the world-first view uses the Korean text face and a 14px floor', /body\.view-topdown\{--font-mono:var\(--font-body\); --fs-min:14px;/.test(css) && /--font-body:'IBM Plex Sans KR','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR','Noto Sans CJK KR',system-ui,sans-serif;/.test(css));
  check('UI1: the classic page keeps its sizes (no floor outside the world-first view)', /:root\{[\s\S]*?--fs-min:0px;/.test(css));
  const bare = [...css.replace(/max\([^)]*\)/g, '').matchAll(/font-size:([0-9.]+)rem/g)].map((x) => +x[1]);
  check('UI1: no rem size under 14px is left without the floor', bare.length > 0 && bare.every((v) => v * 16 >= 14), bare.filter((v) => v * 16 < 14).join());
  check('UI1: phones get a 16px floor (Task 24, was 14) and the sheet ends on the dock (60px, Task 24)', /--fs-min:16px; --td-dock-h:calc\(60px \+ env\(safe-area-inset-bottom, 0px\)\)/.test(css) && /height:calc\(72dvh - var\(--td-dock-h\)\)/.test(css));
  check('UI1: on PC the open panel stops above the dock', /--td-dock-h:74px;/.test(css) && /td-panel-open \.tab-panel\.active, body\.view-topdown\.td-log-open #logSection\{bottom:var\(--td-dock-h\)/.test(css));
})();

// Graphics pass 2, step 1: with ?style=v2 the rest of the world gets the player's and the
// house's finish, the plaza gets v2 stones and the helmet cone becomes a round lantern.
// Sizes, anchors, collision and the classic look stay exactly as they were.
(function test_G2_v2Unify() {
  const storage = makeMemoryStorage();
  const classic = newDom(storage).window;
  classic.saveGame(); // the v2 window below loads the same village layout
  const v2 = newDom(storage, { url: 'https://example.test/?style=v2' }).window;
  const cone = newDom(storage, { url: 'https://example.test/?style=v2&light=cone' }).window;
  check('G2: the style switch reads the address', !classic.tdStyleV2() && v2.tdStyleV2());

  // the finish: same size for every kind it is used on, classic untouched
  const look = v2.tdWorkerLook({ id: 'w1', rarity: 'rare' });
  const samples = [
    ['base', v2.tdBaseSprite(), 'building'], ['workshop', v2.tdWorkshopSprite(3), 'building'], ['museum', v2.tdVillageSprite('museum', 2, 3, [], 1), 'building'],
    ['appraiser ruin', v2.tdVillageSprite('appraiser', 0, 0, [], 0), 'building'], ['vein', v2.tdOreSprite('iron', 'secured'), 'vein'], ['tree', v2.tdPropSprite('bigTree'), 'tree'],
    ['lamp', v2.tdPropSprite('lamp'), 'thin'], ['torch', v2.tdTorchSprite(1), 'thin'], ['bench', v2.tdDecorSprite('bench'), 'prop'],
    ['worker', v2.tdWorkerSprite('right', 2, look), 'worker'], ['walking worker', v2.tdWorkerWalkSprite('left', 1, look), 'worker'],
  ];
  samples.forEach(([name, sp, kind]) => {
    const out = v2.tdStyleFinish(sp, kind);
    check('G2: the v2 finish keeps the size of the ' + name, out !== sp && out.w === sp.w && out.h === sp.h && out.rects.length > 0);
  });
  const base = classic.tdBaseSprite();
  check('G2: the classic look is left as it is (no finish without ?style=v2)', classic.tdStyleFinish(base, 'building') === base);
  check('G2: ground patches and swaying tufts are never finished', [null, 'grass', 'clearing', 'diggingMarks'].every((k) => k === null || v2.tdFinishPropKind(k) === null) && v2.tdStyleFinish(base, null) === base);
  // glowing pixels keep their colour (window glass, the lamp glass, flames)
  const colours = (sp) => { const r = v2.tdRaster(sp); return r.px.filter(Boolean).map((p) => p.slice(0, 3).join()); };
  const glowCount = (sp) => colours(sp).filter((c) => v2.tdFinishKeeps(c.split(',').map(Number))).length;
  ['lamp', 'torch'].forEach((name) => {
    const sp = samples.find((s) => s[0] === name)[1];
    check('G2: the ' + name + "'s glow keeps every pixel", glowCount(sp) > 0 && glowCount(v2.tdStyleFinish(sp, 'thin')) === glowCount(sp));
  });
  const finished = colours(v2.tdStyleFinish(samples[0][1], 'building')), before = colours(samples[0][1]);
  check('G2: the finish adds the outline and light tones (new colours) to the workshop', finished.some((c) => !before.includes(c)));

  // collision and walking: the same boxes and the same steps in both looks
  check('G2: collision boxes are the same in v2', JSON.stringify(v2.WORLD_OBSTACLE_BOXES) === JSON.stringify(classic.WORLD_OBSTACLE_BOXES)
    && JSON.stringify(v2.VILLAGE.DISTRICT.HOUSE_BOX) === JSON.stringify(classic.VILLAGE.DISTRICT.HOUSE_BOX)
    && v2.VILLAGE.ORDER.every((k) => JSON.stringify(v2.VILLAGE.FACILITIES[k].box) === JSON.stringify(classic.VILLAGE.FACILITIES[k].box)));
  const walk = (w, x, y, dx, dy) => { let p = { x, y }; for (let i = 0; i < 40; i++) p = w.worldStepFoot(p.x, p.y, dx, dy, 0.1); return [+p.x.toFixed(4), +p.y.toFixed(4)]; };
  [[2, 1.4, 0, -1], [-0.5, -0.35, 1, 0], [0, 3, 1, 0], [9, 5, 1, 0]].forEach(([x, y, dx, dy]) => {
    check('G2: walking from (' + x + ', ' + y + ') ends in the same place in v2', JSON.stringify(walk(v2, x, y, dx, dy)) === JSON.stringify(walk(classic, x, y, dx, dy)));
  });
  const vd = classic.villageDistrict(), h = vd.house;
  check('G2: walking into the house wall stops the same in v2', JSON.stringify(walk(v2, h.x + 0.9, h.y - 0.4, -1, 0)) === JSON.stringify(walk(classic, h.x + 0.9, h.y - 0.4, -1, 0)));

  // the lantern (v2), the cone (classic, and v2 with ?light=cone)
  const first = (w, d) => w.tdLightList({ x: 0, y: 0, dir: 'down' }, 0, [], d)[0];
  check('G2: classic keeps the helmet cone', first(classic, 0.3).kind === 'headlamp' && !!first(classic, 0.3).cone);
  check('G2: ?light=cone keeps the old cone in v2 to compare', first(cone, 0.3).kind === 'headlamp' && !!first(cone, 0.3).cone);
  const day = first(v2, 0.10), mid = first(v2, 0.22), dusk = first(v2, 0.34);
  check('G2: v2 has a round lantern instead (no cone)', [day, mid, dusk].every((l) => l.kind === 'lantern' && !l.cone));
  check('G2: the lantern is next to nothing in full day', day.strength <= 0.15);
  check('G2: ...and grows warm and wide with the dusk', day.strength < mid.strength && mid.strength < dusk.strength && day.r < dusk.r && dusk.strength >= 0.75);
  check('G2: without a darkness it reads as full day', first(v2).strength === day.strength);
  check('G2: the day cycle itself is unchanged', [0, 60000, 240000].every((t) => v2.tdAmbientDarkness(t) === classic.tdAmbientDarkness(t)));

  // the v2 plaza stones
  const r = 60;
  check('G2: the plaza is opaque stone inside, a light shadow just outside, nothing beyond', v2.tdPlazaPixelV2(5, 7, Math.hypot(5, 7), r)[1] === 1
    && v2.tdPlazaPixelV2(60, 0.5, 60.5, r)[1] === 0.18 && v2.tdPlazaPixelV2(62, 0, 62, r) === null);
  const tones = new Set(); for (let y = -40; y < 40; y += 3) for (let x = -40; x < 40; x += 3) { const d = Math.hypot(x, y); if (d < r - 4) tones.add(v2.tdPlazaPixelV2(x, y, d, r)[0].slice(0, 3).join()); }
  check('G2: the plaza stones vary (slabs, joints, light and shade)', tones.size >= 8);
})();

// Graphics pass 2, step 1, review fixes: short hex colours survive the finish, only real
// glow colours are kept, the lantern does not re-read the address every frame, and every
// bake site passes its sprites through the v2 finish with the right kind.
(function test_G2_reviewFixes() {
  const v2 = newDom(makeMemoryStorage(), { url: 'https://example.test/?style=v2' }).window;
  // 3-digit hex (the fallback pebble of an unknown prop or decor key is '#888')
  check('G2R: #888 reads as grey 136', JSON.stringify(v2.tdParseColor('#888')) === '[136,136,136,1]');
  check('G2R: #fff and #aaa read as 255 and 170', v2.tdParseColor('#fff')[0] === 255 && v2.tdParseColor('#aaa')[2] === 170);
  const unknown = v2.tdStyleFinish(v2.tdDecorSprite('noSuchDecor'), 'prop');
  check('G2R: an unknown decor key still bakes to valid colours in v2', unknown.rects.length > 0 && unknown.rects.every((r) => /^#[0-9a-f]{6}$/.test(r[4]) || /^rgba\(\d+,\d+,\d+,[\d.]+\)$/.test(r[4])));
  // glow: windows, lamp glass, flames and the helmet lamp are kept; paper, petals and gold trim are finished
  [[255, 210, 122], [243, 210, 122], [255, 243, 176], [240, 160, 80], [240, 122, 48], [240, 160, 64], [255, 224, 138]].forEach((c) => {
    check('G2R: glow colour ' + c + ' is kept', v2.tdFinishKeeps([...c, 1]) === true);
  });
  [[232, 220, 192], [240, 208, 96], [242, 214, 140], [232, 192, 80]].forEach((c) => {
    check('G2R: non-glow colour ' + c + ' gets the finish', v2.tdFinishKeeps([...c, 1]) === false);
  });
  // the lantern switch is read once, not on every frame
  let reads = 0; const RealParams = v2.URLSearchParams;
  v2.URLSearchParams = function (q) { reads++; return new RealParams(q); };
  for (let i = 0; i < 50; i++) v2.tdLightList({ x: 0, y: 0, dir: 'down' }, i * 16, [], 0.3);
  v2.URLSearchParams = RealParams;
  check('G2R: 50 frames of lights read the address at most once', reads <= 1, 'reads=' + reads);
  // every bake site asks for the v2 finish, with the kind that fits it
  const asked = []; const realFinish = v2.tdStyleFinish;
  v2.tdStyleFinish = function (sp, kind) { asked.push(kind); return realFinish(sp, kind); };
  v2.tdBuildSpriteSheet();
  const sheetKinds = asked.splice(0);
  v2.TD.villageImages = {}; v2.TD.decorImages = {}; v2.TD.workerImages = {};
  v2.tdVillageImage('museum', 2, 3, [], 1); const village = asked.splice(0);
  v2.tdDecorImage('bench'); const decor = asked.splice(0);
  v2.tdWorkerImage(v2.tdWorkerLook({ id: 'w1', rarity: 'rare' }), 'right', 'w1'); const worker = asked.splice(0);
  v2.tdStyleFinish = realFinish;
  const count = (k) => sheetKinds.filter((x) => x === k).length;
  // 8 resources x 2 looks + undiscovered = 17 veins; base + 3 huts = 4 buildings; 3 torch frames + lamp, board, timber = 6 thin;
  // 2 trees; rock, 3 vein props, crystal, shaft entrance, mine cart = 7 props; grass, clearing, digging marks = 3 left alone
  check('G2R: the sprite sheet finishes 17 veins, 4 buildings, 2 trees, 6 thin pieces and 7 props', count('vein') === 17 && count('building') === 4 && count('tree') === 2 && count('thin') === 6 && count('prop') === 7, JSON.stringify(sheetKinds));
  check('G2R: ...and leaves the 3 ground pieces alone', count(null) === 3);
  check('G2R: village facilities, garden pieces and workers are finished as buildings, props and workers', village.join() === 'building' && decor.join() === 'prop' && worker.join() === 'worker');
})();
