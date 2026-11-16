// ---------------------------------------------------------------------------
// Task 106: proximity interaction. Walk up to a mine, the workshop (공방) or
// a craft workshop and press E / Space (PC) or the action button (phone).
// Every action goes through the existing game functions (secureMine,
// mineMine), so the rules are the same as the panel buttons, which stay
// (blueprint 24.4 #1). Nothing here is saved.
// ---------------------------------------------------------------------------

// Task 23: the cabin's and the huts' doors face south (their point is the door step). Standing in the
// strip in front of a door picks that door over a nearer point to the side; standing behind the
// building (north of its back wall) counts it farther; facing it breaks a near tie. Only the order of
// targets already in reach changes, never the reach itself.
const TD_DOOR = { FRONT_DEPTH: 0.9, FRONT: 0.3, BEHIND: 0.5, FACING: 0.15 };
function tdDoorBonus(px, py, fv){
  return (x, y, box) => { // box: the building's wall box (WORLD_OBSTACLE_BOXES)
    const dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
    let b = 0;
    if(dx >= box.minX - 0.1 && dx <= box.maxX + 0.1 && dy >= -0.05 && dy <= TD_DOOR.FRONT_DEPTH) b += TD_DOOR.FRONT;
    else if(dy < box.minY) b -= TD_DOOR.BEHIND; // past its back wall
    if(d > 1e-6) b += TD_DOOR.FACING * Math.max(0, -(fv[0] * dx + fv[1] * dy) / d);
    return b;
  };
}

// What the player could act on right now: the nearest target within reach, or null.
//   { type: 'mine', id, x, y, action: 'secure' | 'mine' | 'locked', label }
//   { type: 'base' | 'workshop', id, x, y, action: 'open', label }
function tdInteractTarget(px, py){
  if(typeof villageHomeInside === 'function' && villageHomeInside()) return villageHomeTarget(); // Task 119: inside the house only its door
  const range = TOPDOWN.INTERACT_RANGE;
  let best = null, bestD = Infinity;
  // reach is the plain distance; `bonus` only reorders what is in reach (Task 23: the doors below)
  const consider = (t, d, bonus) => { const s = d - (bonus || 0); if(d <= range && s < bestD){ best = t; bestD = s; } };
  (typeof worldMinesNear === 'function' ? worldMinesNear(px, py, range) : state.world.mines).forEach(m => { // the veins in reach (chunk index)
    if(!m || !isMineDiscovered(m)) return; // hidden mines are found by walking near them, not used
    const d = Math.hypot(m.x - px, m.y - py);
    if(d > range) return;
    const res = resourceByKey(m.resource);
    const name = res ? res.name : m.resource;
    if(m.developmentState === 'secured'){
      consider({ type: 'mine', id: m.id, x: m.x, y: m.y, action: 'mine', label: name + ' 캐기 +' + fmt(m.miningPower * mult()) }, d);
    } else if(isMineSiteUnlocked(m)){
      consider({ type: 'mine', id: m.id, x: m.x, y: m.y, action: 'secure', label: name + ' 광맥 확보' }, d);
    } else {
      const site = res ? SITES.find(s => s.key === res.site) : null;
      consider({ type: 'mine', id: m.id, x: m.x, y: m.y, action: 'locked', label: (site ? site.name : '지역') + ' 해금 필요' }, d);
    }
  });
  const base = state.world.base;
  const fv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[state.world.player && state.world.player.facing] || [0, 0];
  const door = tdDoorBonus(px, py, fv);
  consider({ type: 'base', id: 'base', x: base.x, y: base.y, action: 'open', label: '공방 들어가기' }, Math.hypot(base.x - px, base.y - py), door(base.x, base.y, WORLD_OBSTACLE_BOXES.base));
  state.world.workshops.forEach((w, i) => {
    if(!w) return;
    const rec = typeof recipeByKey === 'function' && w.recipeKey ? recipeByKey(w.recipeKey) : null;
    // Task 23: which hut it is (its number in the list and what it makes), so two side by side can be told apart
    const label = '제작소 ' + (i + 1) + ' Lv.' + w.level + ' · ' + (rec ? rec.name : '레시피 없음');
    consider({ type: 'workshop', id: w.id, x: w.x, y: w.y, action: 'open', label }, Math.hypot(w.x - px, w.y - py), door(w.x, w.y, WORLD_OBSTACLE_BOXES.workshop));
  });
  // Task 114: the village facilities (their door step is the site point)
  if(typeof villageTargetFor === 'function' && state.village && state.village.sites){
    VILLAGE.ORDER.forEach(k => {
      const site = state.village.sites[k];
      if(!site) return;
      const t = villageTargetFor(k);
      consider({ type: 'village', id: k, x: site.x, y: site.y, action: t.action, label: t.label }, Math.hypot(site.x - px, site.y - py));
    });
  }
  // Task 118: the plaza's notice board opens the 마을 panel
  const vd = typeof villageDistrict === 'function' ? villageDistrict() : null;
  if(vd) consider({ type: 'house', id: 'house', x: vd.house.x, y: vd.house.y, action: 'enter', label: '내 집 · 들어가기' }, Math.hypot(vd.house.x - px, vd.house.y - py)); // Task 119
  const gt = typeof villageGardenTarget === 'function' ? villageGardenTarget() : null; // Task 120: the garden cell in front
  if(gt) consider(gt, Math.hypot(gt.x - px, gt.y - py));
  if(vd) consider({ type: 'plaza', id: 'plaza', x: vd.plaza.x, y: vd.plaza.y - 0.15, action: 'open', label: '마을 광장 · 안내판' }, Math.hypot(vd.plaza.x - px, vd.plaza.y - 0.15 - py));
  return best;
}

// Does the target's action. Returns { ok, text, open } — `open` names the
// panel to show ('dev' for the workshop and craft workshops).
function tdInteract(target){
  if(!target) return { ok: false, text: '' };
  if(target.type === 'mine'){
    const mine = mineById(target.id);
    if(!mine) return { ok: false, text: '' };
    const res = resourceByKey(mine.resource);
    if(target.action === 'secure'){
      if(!secureMine(mine.id)) return { ok: false, text: '확보할 수 없어요' };
      tdRefreshAfterMineChange();
      log('광맥 확보: ' + (res ? res.name : mine.resource) + ' (' + mine.x + ', ' + mine.y + ')');
      return { ok: true, text: '확보!' };
    }
    if(target.action === 'mine'){
      const amount = mine.miningPower * mult(), relicsBefore = state.village ? state.village.unidentified : 0;
      if(!mineMine(mine.id)) return { ok: false, text: '' };
      if(typeof updateNumbers === 'function') updateNumbers();
      const relic = state.village && state.village.unidentified > relicsBefore; // Task 116
      if(relic && typeof renderVillage === 'function') renderVillage();
      // UI pass 1: a plain haul says how much of what, so presses in a row add up on one line
      return { ok: true, text: '+' + fmt(amount) + ' ' + (res ? res.name : '') + (relic ? ' · 미감정 유물!' : ''), sum: relic || !res ? null : { amount, unit: res.name } };
    }
    return { ok: false, text: target.label };
  }
  if(target.type === 'village') return tdVillageInteract(target);
  if(target.type === 'plaza') return { ok: true, text: '', open: 'village' };
  // Task 119: in and out of the house
  if(target.type === 'house'){ const why = villageHomeEnterBlocker(); return why ? { ok: false, text: why } : { ok: villageHomeEnter(), text: '' }; }
  if(target.type === 'homeDoor') return { ok: villageHomeExit(), text: '' };
  if(target.type === 'garden') return tdGardenInteract(target);
  return { ok: true, text: '', open: 'dev' };
}

function tdRefreshAfterMineChange(){
  if(typeof buildMines === 'function') buildMines();
  if(typeof renderWorldObjects === 'function') renderWorldObjects();
  if(typeof updateNumbers === 'function') updateNumbers();
}

// Task 115~117: a village facility. Restoring, appraising and donating go
// through the same game functions as the 마을 panel buttons (js/village.js).
function tdVillageInteract(target){
  const k = target.id;
  if(target.action === 'restore'){
    const why = villageRestoreBlocker(k);
    if(why || !villageRestore(k)) return { ok: false, text: why || '' };
    tdRefreshAfterVillageChange();
    return { ok: true, text: villageIsOpen(k) ? villageFacilityName(k) + ' 운영 시작!' : '잔해를 치웠어요' };
  }
  if(target.action === 'locked') return { ok: false, text: target.label };
  if(target.action === 'appraise' && typeof villageAppraise === 'function'){
    const r = villageAppraise();
    if(!r) return { ok: false, text: '' };
    tdRefreshAfterVillageChange();
    return { ok: true, text: (r.isNew ? '도감 등록! ' : '') + r.relic.name };
  }
  if(target.action === 'donate' && typeof villageDonateAll === 'function'){
    const rewards = villageRewardsEarned().length, n = villageDonateAll();
    if(!n) return { ok: false, text: '' };
    tdRefreshAfterVillageChange();
    return { ok: true, text: '유물 ' + n + '점 기증 · 전시' + (villageRewardsEarned().length > rewards ? ' · 박물관 보상!' : '') }; // Task 122
  }
  return { ok: true, text: '', open: 'village' };
}

// Task 120: set a decoration down, pick one up, or put the carried one down (same rules as the panel).
function tdGardenInteract(target){
  const UI = VILLAGE_GARDEN_UI, cell = target.id;
  if(target.action === 'decorPlace'){
    const kind = villageDecorSelected(), why = villageDecorPlaceProblem(kind, cell);
    if(why) return { ok: false, text: why };
    villageDecorPlace(kind, cell);
    tdRefreshAfterVillageChange();
    return { ok: true, text: villageDecorDef(kind).name + ' 놓기!' };
  }
  if(target.action === 'decorPick'){ UI.carry = cell; tdRefreshAfterVillageChange(); return { ok: true, text: '들었어요 · 옮길 칸에서 E' }; }
  if(target.action === 'decorDrop'){
    const from = UI.carry;
    if(from !== cell){
      const i = villageDecorAt(from), why = i < 0 ? '들고 있는 장식이 없어요' : villageDecorPlaceProblem(villageDecorList()[i].kind, cell, from);
      if(why || !villageDecorMove(from, cell)) return { ok: false, text: why || '' };
    }
    UI.carry = -1;
    tdRefreshAfterVillageChange();
    return { ok: true, text: from === cell ? '제자리에 두었어요' : '옮겼어요' };
  }
  return { ok: false, text: target.label };
}

// Task 120: takes back the carried decoration, or the one in front (R, or the phone's garden button).
function tdGardenTakeBack(){
  const UI = VILLAGE_GARDEN_UI, t = typeof villageGardenTarget === 'function' ? villageGardenTarget() : null;
  const cell = UI.carry >= 0 ? UI.carry : t && t.action === 'decorPick' ? t.id : -1;
  if(cell < 0) return { ok: false, text: '' };
  const at = villageGardenCells()[cell], kind = villageDecorRemove(cell);
  if(!kind) return { ok: false, text: '' };
  tdRefreshAfterVillageChange();
  return { ok: true, text: villageDecorDef(kind).name + ' 회수', x: at.x, y: at.y };
}

function tdRefreshAfterVillageChange(){
  if(typeof renderVillage === 'function') renderVillage();
  if(typeof renderCurrencies === 'function') renderCurrencies();
  if(typeof updateNumbers === 'function') updateNumbers();
}
