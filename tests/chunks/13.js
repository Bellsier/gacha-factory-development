// =============================================================================
// C1: a damaged save is kept, never overwritten. When the save cannot be read
// the game starts fresh, but the original stays untouched under its key, a
// copy goes to a backup key, nothing is saved (autosave, closing the tab)
// until the player chooses to start the new game's save, and a notice says so.
// (13.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
const C1_KEY = 'gachaFactorySave';
const c1BackupKeys = (storage) => Object.keys(storage._raw()).filter((k) => k.startsWith(C1_KEY + '.corrupt-backup'));
const c1Notice = (win) => win.document.getElementById('saveNotice');
const c1Shown = (win) => { const n = c1Notice(win); return !!n && !n.hidden; };
const c1LogHas = (win, re) => [...win.document.querySelectorAll('#log div')].some((d) => re.test(d.textContent));
// a storage that refuses to write any backup key (full storage, private mode quirks)
function c1StorageNoBackup() {
  const inner = makeMemoryStorage();
  return Object.assign({}, inner, { setItem: (k, v) => { if (String(k).includes('corrupt-backup')) throw new Error('QuotaExceededError'); inner.setItem(k, v); } });
}
// a damaged save: the game must keep `raw` exactly, back it up, refuse to save and say so
function c1CheckDamaged(label, raw) {
  const storage = makeMemoryStorage();
  storage._setRaw(C1_KEY, raw);
  const win = newDom(storage).window;
  check('C1 ' + label + ': the game still starts (fresh state)', win.state.gold === 0 && win.permanent.tickets === 0);
  check('C1 ' + label + ': the original stays under its key', storage._raw()[C1_KEY] === raw);
  const keys = c1BackupKeys(storage);
  check('C1 ' + label + ': one backup holds an exact copy', keys.length === 1 && storage._raw()[keys[0]] === raw, keys.join());
  check('C1 ' + label + ': saving is refused (autosave, closing the tab)', win.saveGame() === false && storage._raw()[C1_KEY] === raw);
  check('C1 ' + label + ': the save status says the save is protected', win.document.getElementById('saveStatus').textContent === '저장 보호 중');
  check('C1 ' + label + ': a notice explains it and offers to start the new save', c1Shown(win) && /원래 저장/.test(c1Notice(win).textContent) && !!c1Notice(win).querySelector('[data-save-start-over]'));
  check('C1 ' + label + ': the log says it too', c1LogHas(win, /저장 데이터를 읽을 수 없/));
  return { storage, win };
}

(function test_C1_normalSave() {
  const storage = makeMemoryStorage();
  const first = newDom(storage).window;
  first.state.gold = 321;
  check('C1 normal: a new game saves', first.saveGame() === true);
  const raw = storage._raw()[C1_KEY];
  const win = newDom(storage).window;
  check('C1 normal: a good save loads as before', win.state.gold === 321);
  check('C1 normal: no backup and no notice', c1BackupKeys(storage).length === 0 && !c1Shown(win));
  win.state.gold = 400;
  check('C1 normal: saving keeps working (autosave path)', win.saveGame() === true && storage._raw()[C1_KEY] !== raw && JSON.parse(storage._raw()[C1_KEY]).run.gold === 400);
  check('C1 normal: the save shape is unchanged (saveVersion 1; saveVersion, savedAt, permanent, run)', Object.keys(JSON.parse(storage._raw()[C1_KEY])).sort().join() === 'permanent,run,saveVersion,savedAt' && JSON.parse(storage._raw()[C1_KEY]).saveVersion === 1);
  check('C1 normal: the protection reports nothing', win.saveProtection().corrupt === false);
})();

(function test_C1_damagedSaves() {
  c1CheckDamaged('bad JSON', '{not valid json!!!');
  c1CheckDamaged('cut-off JSON', '{"saveVersion":1,"run":{"gold":5000');
  c1CheckDamaged('no saveVersion', JSON.stringify({ run: { gold: 5000 }, permanent: {} }));
  c1CheckDamaged('saveVersion not a number', JSON.stringify({ saveVersion: 'one', run: { gold: 5000 }, permanent: {} }));
  c1CheckDamaged('missing run', JSON.stringify({ saveVersion: 1, permanent: { tickets: 7 } }));
  c1CheckDamaged('run not an object', JSON.stringify({ saveVersion: 1, run: [1, 2], permanent: {} }));
  c1CheckDamaged('not an object', '[1,2,3]');
})();

(function test_C1_futureVersionUnchanged() {
  const storage = makeMemoryStorage();
  const raw = JSON.stringify({ saveVersion: 2, run: { gold: 9 }, permanent: {} });
  storage._setRaw(C1_KEY, raw);
  const win = newDom(storage).window;
  check('C1 future version: still refused and kept as before (saveBlocked)', win.saveBlocked === true && win.saveGame() === false && storage._raw()[C1_KEY] === raw);
  check('C1 future version: it is not treated as damaged (no backup)', c1BackupKeys(storage).length === 0);
})();

(function test_C1_backupFails() {
  const storage = c1StorageNoBackup();
  const raw = '{"saveVersion":1,"run":{"gold":777';
  storage._setRaw(C1_KEY, raw);
  const win = newDom(storage).window;
  check('C1 backup fails: the original is still kept', storage._raw()[C1_KEY] === raw);
  check('C1 backup fails: no backup was written', c1BackupKeys(storage).length === 0 && win.saveProtection().backupOk === false);
  check('C1 backup fails: saving is still refused', win.saveGame() === false && storage._raw()[C1_KEY] === raw);
  check('C1 backup fails: the notice says there is no copy', c1Shown(win) && /백업을 만들지 못/.test(c1Notice(win).textContent));
  const btn = c1Notice(win).querySelector('[data-save-start-over]');
  btn.click();
  check('C1 backup fails: one press only asks again (the original would be gone)', storage._raw()[C1_KEY] === raw && /한 번 더/.test(btn.textContent));
  btn.click();
  check('C1 backup fails: the second press starts the new save', storage._raw()[C1_KEY] !== raw && JSON.parse(storage._raw()[C1_KEY]).saveVersion === 1 && !c1Shown(win));
})();

(function test_C1_startOverThenAutosave() {
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  const { storage, win } = c1CheckDamaged('start over', raw);
  const backup = c1BackupKeys(storage)[0];
  c1Notice(win).querySelector('[data-save-start-over]').click();
  check('C1 start over: one press (with a backup) saves the new game', JSON.parse(storage._raw()[C1_KEY]).run.gold === 0 && !c1Shown(win));
  check('C1 start over: the backup keeps the original', storage._raw()[backup] === raw);
  win.state.gold = 12;
  check('C1 start over: autosave works again', win.saveGame() === true && JSON.parse(storage._raw()[C1_KEY]).run.gold === 12);
  check('C1 start over: the status reads saved', win.document.getElementById('saveStatus').textContent === '저장됨');
  const again = newDom(storage).window;
  check('C1 start over: the next visit loads the new game, no new backup', again.state.gold === 12 && c1BackupKeys(storage).length === 1 && !c1Shown(again));
})();

(function test_C1_reloadKeepsEverything() {
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  const { storage, win } = c1CheckDamaged('reload', raw);
  win.saveGame(); // what autosave and closing the tab would do
  const second = newDom(storage).window;
  check('C1 reload: the original is still there after a reload', storage._raw()[C1_KEY] === raw);
  check('C1 reload: still one backup (the same save is not copied twice)', c1BackupKeys(storage).length === 1);
  check('C1 reload: still protected and still says so', second.saveGame() === false && c1Shown(second));
})();

(function test_C1_withEarlierBackups() {
  const storage = makeMemoryStorage();
  const older = '{"saveVersion":1,"run":{"gold":1';
  const raw = '{"saveVersion":1,"run":{"gold":2';
  storage._setRaw(C1_KEY, older);
  newDom(storage);
  const olderKey = c1BackupKeys(storage)[0];
  storage._setRaw(C1_KEY, raw); // a later, different damaged save
  const win = newDom(storage).window;
  const keys = c1BackupKeys(storage);
  check('C1 earlier backup: the earlier backup is untouched', storage._raw()[olderKey] === older);
  check('C1 earlier backup: the new damaged save gets its own backup', keys.length === 2 && keys.some((k) => k !== olderKey && storage._raw()[k] === raw));
  check('C1 earlier backup: the original is kept and saving refused', storage._raw()[C1_KEY] === raw && win.saveGame() === false);
  // a backup key already holding other text (a hash collision) is never overwritten
  const taken = makeMemoryStorage();
  taken._setRaw(C1_KEY, raw);
  const want = C1_KEY + '.corrupt-backup.' + win.saveBackupHash(raw);
  taken._setRaw(want, 'something else');
  newDom(taken);
  check('C1 earlier backup: a taken backup key is not overwritten, another is used', taken._raw()[want] === 'something else' && c1BackupKeys(taken).some((k) => k !== want && taken._raw()[k] === raw));
})();

// -----------------------------------------------------------------------------
// C1 review fixes (PR #13): full storage, other tabs, the notice going away, and
// a session whose saving is blocked for another reason (PR #5's trial mode).
// -----------------------------------------------------------------------------
const c1Text = (win) => { const n = c1Notice(win); return n ? n.textContent : ''; };
const c1Button = (win) => { const n = c1Notice(win); return n ? n.querySelector('[data-save-start-over]') : null; };
// A storage that is full: reads work, every write throws until free() is called.
function c1FullStorage() {
  const inner = makeMemoryStorage();
  let full = true;
  return Object.assign({}, inner, {
    setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); inner.setItem(k, v); },
    free: () => { full = false; },
  });
}
// A storage that cannot be read at boot (access refused), then works.
function c1UnreadableStorage() {
  const inner = makeMemoryStorage();
  let broken = true;
  return Object.assign({}, inner, {
    getItem: (k) => { if (broken) throw new Error('SecurityError'); return inner.getItem(k); },
    setItem: (k, v) => { if (broken) throw new Error('SecurityError'); inner.setItem(k, v); },
    fix: () => { broken = false; },
  });
}

(function test_C1R_fullStorage() {
  // a damaged save in a full storage: still found, kept, and not overwritten once space frees up
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  const a = c1FullStorage(); a._setRaw(C1_KEY, raw);
  const wa = newDom(a).window;
  check('C1R full storage: a damaged save is still recognised (read works when writes do not)', wa.saveProtection().corrupt === true && c1Shown(wa));
  check('C1R full storage: no backup could be written, the notice says so', c1BackupKeys(a).length === 0 && /백업을 만들지 못/.test(c1Text(wa)));
  a.free();
  check('C1R full storage: after space frees up, an autosave still leaves the damaged original', wa.saveGame() === false && a._raw()[C1_KEY] === raw);
  // a future-version save in a full storage: kept after space frees up
  const fraw = JSON.stringify({ saveVersion: 2, run: { gold: 9 }, permanent: {} });
  const f = c1FullStorage(); f._setRaw(C1_KEY, fraw);
  const wf = newDom(f).window;
  f.free();
  check('C1R full storage: a future-version save is kept after space frees up', wf.saveBlocked === true && wf.saveGame() === false && f._raw()[C1_KEY] === fraw);
  // a good save in a full storage: it loads, and once space frees up the loaded progress is saved (not a new game)
  const g = makeMemoryStorage();
  const first = newDom(g).window; first.state.gold = 4321; first.saveGame();
  const graw = g._raw()[C1_KEY];
  const gs = c1FullStorage(); gs._setRaw(C1_KEY, graw);
  const wg = newDom(gs).window;
  check('C1R full storage: a good save still loads', wg.state.gold === 4321 && !c1Shown(wg));
  check('C1R full storage: saving fails while full and the original stays', wg.saveGame() === false && gs._raw()[C1_KEY] === graw);
  gs.free();
  check('C1R full storage: after space frees up the loaded progress is saved', wg.saveGame() === true && JSON.parse(gs._raw()[C1_KEY]).run.gold === 4321);
})();

(function test_C1R_unreadableStorage() {
  const s = c1UnreadableStorage();
  const raw = JSON.stringify({ saveVersion: 1, run: { gold: 8888 }, permanent: {} });
  s._setRaw(C1_KEY, raw);
  const win = newDom(s).window;
  check('C1R unreadable: the game still starts', win.state.gold === 0);
  s.fix();
  check('C1R unreadable: a save that could not be read is never overwritten, even once storage works', win.saveGame() === false && s._raw()[C1_KEY] === raw);
  check('C1R unreadable: a notice says saving is off this session, with no start-over button', c1Shown(win) && /읽지 못/.test(c1Text(win)) && !c1Button(win));
  check('C1R unreadable: starting over is refused too', win.saveStartOver() === false && s._raw()[C1_KEY] === raw);
})();

(function test_C1R_otherTabChangedTheSave() {
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  const good = JSON.stringify({ saveVersion: 1, savedAt: 1, permanent: { totalPrestige: 0, runCount: 1, tickets: 3, firstGachaGranted: true }, run: { gold: 999 } });
  // A shows the notice; B (another tab) saves new progress; A presses its old button
  const { storage, win } = c1CheckDamaged('two tabs', raw);
  const btn = c1Button(win);
  storage._setRaw(C1_KEY, good); // tab B wrote its progress (no storage event reached A yet)
  btn.click();
  check('C1R two tabs: A\'s old confirmation does not overwrite B\'s new save', storage._raw()[C1_KEY] === good);
  check('C1R two tabs: A stays protected and its button is gone', win.saveGame() === false && storage._raw()[C1_KEY] === good && !c1Button(win));
  check('C1R two tabs: the notice tells A the save changed in another tab', c1Shown(win) && /다른 탭/.test(c1Text(win)));
  // with the storage event: the confirmation is withdrawn as soon as B saves
  const r2 = c1CheckDamaged('two tabs (event)', raw);
  r2.storage._setRaw(C1_KEY, good);
  r2.win.dispatchEvent(new r2.win.StorageEvent('storage', { key: C1_KEY, newValue: good }));
  check('C1R two tabs (event): the button goes away when another tab saves', !c1Button(r2.win) && /다른 탭/.test(c1Text(r2.win)));
  check('C1R two tabs (event): starting over is refused', r2.win.saveStartOver() === false && r2.storage._raw()[C1_KEY] === good);
  // the two-press confirmation (no backup) is withdrawn the same way
  const nb = c1StorageNoBackup(); nb._setRaw(C1_KEY, raw);
  const wn = newDom(nb).window;
  c1Button(wn).click(); // first press: asks again
  nb._setRaw(C1_KEY, good);
  const again = c1Button(wn);
  if (again) again.click(); // the old second press
  check('C1R two tabs (no backup): the armed second press does not overwrite the new save', nb._raw()[C1_KEY] === good);
})();

(function test_C1R_noticeHides() {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  check('C1R notice: a hidden notice is not shown (its display rule yields to [hidden])', /\.save-notice\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(css));
  const { win } = c1CheckDamaged('notice hides', '{"saveVersion":1,"run":{"gold":5000');
  c1Button(win).click();
  check('C1R notice: after starting over the notice is hidden', c1Notice(win).hidden === true);
})();

(function test_C1R_savingBlockedElsewhere() {
  // PR #5's trial mode sets saveBlocked after the damaged save was found; the notice is redrawn by renderAll()
  const { storage, win } = c1CheckDamaged('blocked', '{"saveVersion":1,"run":{"gold":5000');
  const raw = storage._raw()[C1_KEY];
  win.saveIsBlocked = () => true;
  win.worldTestMode = () => true;
  win.renderAll();
  check('C1R blocked: no start-over button when saving is blocked for this session', c1Shown(win) && !c1Button(win));
  check('C1R blocked: the notice says why (trial mode)', /시험 모드/.test(c1Text(win)));
  check('C1R blocked: starting over is refused and the original stays', win.saveStartOver() === false && storage._raw()[C1_KEY] === raw);
  win.worldTestMode = () => false;
  win.renderSaveNotice();
  check('C1R blocked: without trial mode it still says saving is off this session', /저장하지 않/.test(c1Text(win)) && !c1Button(win));
})();
