// =============================================================================
// Save isolation between the normal game and the 256 test world (?worldgen=256),
// and the C1 backup of a damaged save in both. The normal game saves under
// gachaFactorySave; the test world under gachaFactorySave.worldgen256.v1, and it
// only reads the normal key when it has no save of its own. A damaged save is
// backed up under the key it was read from (+ '.corrupt-backup.<hash>'), and the
// notice names the key that really holds the copy. Neither mode ever writes the
// other's save, and a damaged or unread original is never changed.
// (16.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
const ISO_N = 'gachaFactorySave';
const ISO_T = 'gachaFactorySave.worldgen256.v1';
const ISO_TRIAL = { url: 'https://example.test/?worldgen=256', saveKey: ISO_T };
const isoBackups = (storage, key) => Object.keys(storage._raw()).filter((k) => k.startsWith(key + '.corrupt-backup.'));
const isoAllBackups = (storage) => Object.keys(storage._raw()).filter((k) => k.includes('.corrupt-backup.'));
const isoNotice = (win) => { const n = win.document.getElementById('saveNotice'); return n && !n.hidden ? n.textContent : ''; };
// the backup key the notice names, e.g. "백업(gachaFactorySave.corrupt-backup.1a2b3c4d)"
const isoNoticeKey = (win) => { const m = /백업\(([^)]+)\)/.exec(isoNotice(win)); return m ? m[1] : null; };
const isoGood = (gold) => JSON.stringify({ saveVersion: 1, savedAt: 1, permanent: { totalPrestige: 0, runCount: 1, tickets: 2, firstGachaGranted: true }, run: { gold } });
const isoTrialSave = (gold) => {
  const s = makeMemoryStorage();
  const w = newDom(s, ISO_TRIAL).window;
  w.state.gold = gold;
  w.saveGame();
  return s._raw()[ISO_T];
};
// a storage whose every write throws (full) until free() is called; reads work
function isoFullStorage() {
  const inner = makeMemoryStorage();
  let full = true;
  return Object.assign({}, inner, { setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); inner.setItem(k, v); }, free: () => { full = false; } });
}
// a storage that refuses only the backup keys
function isoNoBackupStorage() {
  const inner = makeMemoryStorage();
  return Object.assign({}, inner, { setItem: (k, v) => { if (String(k).includes('corrupt-backup')) throw new Error('QuotaExceededError'); inner.setItem(k, v); } });
}
const isoSnapshot = (storage) => JSON.stringify(storage._raw());

(function test_iso_goodNormalSave() {
  const s = makeMemoryStorage();
  s._setRaw(ISO_N, isoGood(321));
  const w = newDom(s).window;
  check('Save isolation: a good normal save loads in the normal game', w.state.gold === 321 && !w.saveProtection().corrupt && !w.saveBlocked);
  w.state.gold = 400;
  check('Save isolation: the normal game saves under its own key only', w.saveGame() === true && JSON.parse(s._raw()[ISO_N]).run.gold === 400 && !(ISO_T in s._raw()) && isoAllBackups(s).length === 0);
})();

(function test_iso_goodTrialSave() {
  const s = makeMemoryStorage();
  s._setRaw(ISO_N, isoGood(5));
  s._setRaw(ISO_T, isoTrialSave(777));
  const normalBefore = s._raw()[ISO_N];
  const w = newDom(s, ISO_TRIAL).window;
  check('Save isolation: a good trial save loads in the test world (its own progress, a 256 world)', w.state.gold === 777 && w.state.world.size === 256 && !w.saveProtection().corrupt && !w.saveBlocked);
  w.state.gold = 778;
  check('Save isolation: the test world saves under its own key; the normal save is unchanged', w.saveGame() === true && JSON.parse(s._raw()[ISO_T]).run.gold === 778 && s._raw()[ISO_N] === normalBefore && isoAllBackups(s).length === 0);
  check('Save isolation: the trial save keeps saveVersion 1 and the usual shape', JSON.parse(s._raw()[ISO_T]).saveVersion === 1 && Object.keys(JSON.parse(s._raw()[ISO_T])).sort().join() === 'permanent,run,saveVersion,savedAt');
})();

(function test_iso_damagedNormalSave() {
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  const s = makeMemoryStorage();
  s._setRaw(ISO_N, raw);
  const w = newDom(s).window;
  const keys = isoBackups(s, ISO_N), p = w.saveProtection();
  check('Save isolation: a damaged normal save is kept and backed up under the normal key', s._raw()[ISO_N] === raw && keys.length === 1 && s._raw()[keys[0]] === raw && isoAllBackups(s).length === 1);
  check('Save isolation: the notice names the key that holds the copy (normal)', p.backupOk && p.backupKey === keys[0] && isoNoticeKey(w) === keys[0]);
  check('Save isolation: the normal game does not touch the trial key', !(ISO_T in s._raw()) && w.saveGame() === false && s._raw()[ISO_N] === raw);
})();

(function test_iso_damagedTrialSave() {
  const raw = '{"saveVersion":1,"run":{"gold":5000,"world":{"size":256';
  const s = makeMemoryStorage();
  s._setRaw(ISO_N, isoGood(42));
  s._setRaw(ISO_T, raw);
  const normalBefore = s._raw()[ISO_N];
  const w = newDom(s, ISO_TRIAL).window;
  const keys = isoBackups(s, ISO_T), p = w.saveProtection();
  check('Save isolation: a damaged trial save is kept and backed up under the trial key', s._raw()[ISO_T] === raw && keys.length === 1 && s._raw()[keys[0]] === raw && isoAllBackups(s).length === 1);
  check('Save isolation: the notice names the key that holds the copy (trial)', p.backupOk && p.backupKey === keys[0] && isoNoticeKey(w) === keys[0]);
  check('Save isolation: the normal save is not read in its place, and stays unchanged', w.state.gold === 0 && s._raw()[ISO_N] === normalBefore);
  check('Save isolation: saving stays off in the test world (blocked, no start-over button)', w.saveBlocked === true && w.saveGame() === false && w.saveStartOver() === false && !w.document.querySelector('[data-save-start-over]') && s._raw()[ISO_T] === raw && s._raw()[ISO_N] === normalBefore);
})();

// The case the review reported: no trial save yet, so the test world reads the normal
// key, and that save is damaged. The copy belongs to the normal save.
(function test_iso_damagedNormalSaveOpenedInTrialMode() {
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  const s = makeMemoryStorage();
  s._setRaw(ISO_N, raw);
  const w = newDom(s, ISO_TRIAL).window;
  const p = w.saveProtection(), shown = isoNoticeKey(w);
  check('Trial mode, damaged normal save: the original normal save is kept, no trial save is written', s._raw()[ISO_N] === raw && !(ISO_T in s._raw()));
  check('Trial mode, damaged normal save: the backup is named after the normal key it was read from', isoBackups(s, ISO_N).length === 1 && isoBackups(s, ISO_T).length === 0, isoAllBackups(s).join());
  check('Trial mode, damaged normal save: the key in the notice holds an exact copy of the normal save', p.backupOk && shown === p.backupKey && s._raw()[shown] === raw, String(shown));
  check('Trial mode, damaged normal save: saving stays off (blocked, no start-over button)', w.saveBlocked === true && w.saveGame() === false && w.saveStartOver() === false && !w.document.querySelector('[data-save-start-over]') && s._raw()[ISO_N] === raw && !(ISO_T in s._raw()));
  // a storage event for the trial key says nothing about the normal save this tab is keeping
  w.dispatchEvent(new w.StorageEvent('storage', { key: ISO_T, newValue: null }));
  check('Trial mode, damaged normal save: the protection checks the normal key it read (not "changed in another tab")', w.saveProtection().changed === false && !/다른 탭/.test(isoNotice(w)) && w.saveCheckUnchanged() === true);
  // the normal game opened afterwards finds the same damaged save and the same backup
  const n = newDom(s).window;
  check('Trial mode, damaged normal save: the normal game then reuses that backup (one copy, same key)', isoAllBackups(s).length === 1 && n.saveProtection().backupKey === p.backupKey && s._raw()[ISO_N] === raw);
  // another tab replacing the normal save is noticed by the trial tab
  s._setRaw(ISO_N, isoGood(9));
  w.dispatchEvent(new w.StorageEvent('storage', { key: ISO_N, newValue: s._raw()[ISO_N] }));
  check('Trial mode, damaged normal save: a change to the normal save in another tab is noticed', w.saveProtection().changed === true && /다른 탭/.test(isoNotice(w)) && !(ISO_T in s._raw()));
})();

(function test_iso_backupFails() {
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  // normal game
  const a = isoNoBackupStorage(); a._setRaw(ISO_N, raw);
  const wa = newDom(a).window;
  check('Backup fails (normal): reported as failed, no key named, original kept', wa.saveProtection().backupOk === false && wa.saveProtection().backupKey === null && isoNoticeKey(wa) === null && /백업을 만들지 못/.test(isoNotice(wa)) && a._raw()[ISO_N] === raw && isoAllBackups(a).length === 0);
  // test world reading the damaged normal save
  const b = isoNoBackupStorage(); b._setRaw(ISO_N, raw);
  const wb = newDom(b, ISO_TRIAL).window;
  check('Backup fails (trial mode, damaged normal save): reported as failed, original kept, nothing written', wb.saveProtection().backupOk === false && isoNoticeKey(wb) === null && /백업을 만들지 못/.test(isoNotice(wb)) && b._raw()[ISO_N] === raw && !(ISO_T in b._raw()) && isoAllBackups(b).length === 0 && wb.saveGame() === false);
  // test world with its own damaged save
  const c = isoNoBackupStorage(); c._setRaw(ISO_N, isoGood(1)); c._setRaw(ISO_T, raw);
  const before = isoSnapshot(c);
  const wc = newDom(c, ISO_TRIAL).window;
  check('Backup fails (damaged trial save): reported as failed, both saves unchanged', wc.saveProtection().backupOk === false && /백업을 만들지 못/.test(isoNotice(wc)) && isoSnapshot(c) === before && wc.saveGame() === false && isoSnapshot(c) === before);
})();

(function test_iso_storageReadFails() {
  const unreadable = (seed) => {
    const inner = makeMemoryStorage();
    Object.entries(seed).forEach(([k, v]) => inner._setRaw(k, v));
    let broken = true;
    return Object.assign({}, inner, {
      getItem: (k) => { if (broken) throw new Error('SecurityError'); return inner.getItem(k); },
      setItem: (k, v) => { if (broken) throw new Error('SecurityError'); inner.setItem(k, v); },
      fix: () => { broken = false; },
    });
  };
  const s = unreadable({ [ISO_N]: isoGood(11), [ISO_T]: isoTrialSave(22) });
  const before = isoSnapshot(s);
  const w = newDom(s, ISO_TRIAL).window;
  s.fix();
  check('Storage read fails (trial mode): nothing is written once storage works again', w.saveProtection().unverified === true && w.saveGame() === false && w.saveStartOver() === false && isoSnapshot(s) === before);
  const n = unreadable({ [ISO_N]: isoGood(11) });
  const nb = isoSnapshot(n);
  const wn = newDom(n).window;
  n.fix();
  check('Storage read fails (normal): nothing is written once storage works again', wn.saveProtection().unverified === true && wn.saveGame() === false && isoSnapshot(n) === nb);
})();

(function test_iso_storageWriteFails() {
  const s = isoFullStorage();
  s._setRaw(ISO_N, isoGood(64));
  const normalBefore = s._raw()[ISO_N];
  const w = newDom(s, ISO_TRIAL).window;
  check('Storage write fails (trial mode): the game progress still loads, saving reports failure', w.state.gold === 64 && w.saveGame() === false && w.document.getElementById('saveStatus').textContent === '저장 안 됨' && !(ISO_T in s._raw()) && s._raw()[ISO_N] === normalBefore);
  s.free();
  check('Storage write fails (trial mode): once space frees up it saves the trial key only', w.saveGame() === true && JSON.parse(s._raw()[ISO_T]).run.gold === 64 && s._raw()[ISO_N] === normalBefore);
  const n = isoFullStorage();
  n._setRaw(ISO_N, isoGood(65));
  const nraw = n._raw()[ISO_N];
  const wn = newDom(n).window;
  check('Storage write fails (normal): saving reports failure and the save is unchanged', wn.saveGame() === false && n._raw()[ISO_N] === nraw && !(ISO_T in n._raw()));
})();

(function test_iso_futureVersion() {
  const future = JSON.stringify({ saveVersion: 2, run: { gold: 9 }, permanent: {} });
  const a = makeMemoryStorage(); a._setRaw(ISO_N, isoGood(3)); a._setRaw(ISO_T, future);
  const ab = isoSnapshot(a);
  const wa = newDom(a, ISO_TRIAL).window;
  check('Future version (trial save): blocked, not backed up, both saves unchanged', wa.saveBlocked === true && wa.saveGame() === false && isoAllBackups(a).length === 0 && isoSnapshot(a) === ab);
  const b = makeMemoryStorage(); b._setRaw(ISO_N, future);
  const bb = isoSnapshot(b);
  const wb = newDom(b, ISO_TRIAL).window;
  check('Future version (normal save read by the test world): blocked, nothing written', wb.saveBlocked === true && wb.saveGame() === false && isoSnapshot(b) === bb);
  const c = makeMemoryStorage(); c._setRaw(ISO_N, future); c._setRaw(ISO_T, isoTrialSave(4));
  const cb = isoSnapshot(c);
  const wc = newDom(c).window;
  check('Future version (normal save, normal game): blocked; the trial save is untouched', wc.saveBlocked === true && wc.saveGame() === false && isoSnapshot(c) === cb);
})();

(function test_iso_blockedStaysBlocked() {
  const raw = '{"saveVersion":1,"run":{"gold":5000';
  const s = makeMemoryStorage(); s._setRaw(ISO_N, raw);
  const w = newDom(s, ISO_TRIAL).window;
  const before = isoSnapshot(s); // the original and its backup, as the boot left them
  w.state.gold = 50;
  advanceTicks(w, 20);
  w.renderAll();
  w.dispatchEvent(new w.Event('beforeunload'));
  const results = [w.saveGame(), w.saveStartOver(), w.saveGame()];
  check('Blocked session: ticks, redraws, closing the tab and start-over never unblock it', w.saveBlocked === true && results.every((r) => r === false) && w.saveIsBlocked() === true && isoSnapshot(s) === before);
  check('Blocked session: the test world buttons stay disabled', (w.document.getElementById('worldgen-teleport') || { disabled: true }).disabled === true);
})();

(function test_iso_switchModes() {
  const s = makeMemoryStorage();
  const n1 = newDom(s).window;
  n1.state.gold = 4321;
  n1.saveGame();
  const normal = s._raw()[ISO_N];
  const t1 = newDom(s, ISO_TRIAL).window;
  check('Mode switch: the test world starts from the normal progress', t1.state.gold === 4321 && t1.state.world.size === 256 && !(ISO_T in s._raw()));
  t1.state.gold = 999;
  t1.saveGame();
  const seed = t1.state.world.seed;
  check('Mode switch: the test world saves its own key; the normal save is byte for byte the same', JSON.parse(s._raw()[ISO_T]).run.gold === 999 && s._raw()[ISO_N] === normal);
  const trial = s._raw()[ISO_T];
  const n2 = newDom(s).window;
  check('Mode switch: back in the normal game, the normal progress and no 256 world', n2.state.gold === 4321 && !n2.state.world.size);
  n2.state.gold = 4322;
  n2.saveGame();
  check('Mode switch: the normal game saves its own key; the trial save is byte for byte the same', JSON.parse(s._raw()[ISO_N]).run.gold === 4322 && s._raw()[ISO_T] === trial && !/"size":256/.test(s._raw()[ISO_N]));
  const t2 = newDom(s, ISO_TRIAL).window;
  check('Mode switch: the test world comes back with its own progress and seed', t2.state.gold === 999 && t2.state.world.seed === seed && isoAllBackups(s).length === 0);
})();
