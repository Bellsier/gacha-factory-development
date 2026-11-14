'use strict';
// Gameplay-state writes are confined to these named, one-time preparations.
// The actual playthrough receives supplies only, never progress/authority flags.
async function prepareSupplies(page) {
  return page.evaluate(() => {
    if (state.gold !== 0 || state.characters.length || state.world.workshops.length || Object.values(state.research).some(Boolean)) {
      throw new Error('준비 fixture는 새로운 마을에만 적용할 수 있습니다.');
    }
    const receipt = { gold: 10_000_000, resourcesEach: 100_000, productsEach: 5_000, unidentifiedRelics: 100 };
    state.gold = receipt.gold;
    for (const key of Object.keys(state.resources)) state.resources[key] = receipt.resourcesEach;
    for (const key of Object.keys(state.products)) state.products[key] = receipt.productsEach;
    state.village.unidentified = receipt.unidentifiedRelics;
    renderAll();
    return receipt;
  });
}
// Layout-only checkpoint: a completed museum provides long descriptions/rewards.
// This is not used by, or counted as progress in, the production playthrough.
async function prepareHudVillage(page) {
  await prepareSupplies(page);
  await page.evaluate(() => {
    const v = state.village;
    v.stage.appraiser = 2; v.stage.museum = 2; v.codex = VILLAGE_RELICS.map(r => r.key);
    v.donated = [...v.codex]; v.owned = {}; v.appraised = v.codex.length;
    v.specimens = VILLAGE_SPECIMENS.map(s => ({ key: s.key, at: 0 }));
    renderAll();
  });
}
module.exports = { prepareSupplies, prepareHudVillage };
