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
