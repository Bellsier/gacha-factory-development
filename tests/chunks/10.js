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
  check('UI1: the world-first view uses the Korean text face and a 13px floor', /body\.view-topdown\{--font-mono:var\(--font-body\); --fs-min:13px;/.test(css) && /--font-body:'Apple SD Gothic Neo'/.test(css));
  check('UI1: the classic page keeps its sizes (no floor outside the world-first view)', /:root\{[\s\S]*?--fs-min:0px;/.test(css));
  const bare = [...css.replace(/max\([^)]*\)/g, '').matchAll(/font-size:([0-9.]+)rem/g)].map((x) => +x[1]);
  check('UI1: no rem size under 14px is left without the floor', bare.length > 0 && bare.every((v) => v * 16 >= 14), bare.filter((v) => v * 16 < 14).join());
  check('UI1: phones get a 14px floor and the sheet ends on the dock', /--fs-min:14px; --td-dock-h:calc\(50px \+ env\(safe-area-inset-bottom, 0px\)\)/.test(css) && /height:calc\(72dvh - var\(--td-dock-h\)\)/.test(css));
  check('UI1: on PC the open panel stops above the dock', /--td-dock-h:74px;/.test(css) && /td-panel-open \.tab-panel\.active, body\.view-topdown\.td-log-open #logSection\{bottom:var\(--td-dock-h\)/.test(css));
})();
