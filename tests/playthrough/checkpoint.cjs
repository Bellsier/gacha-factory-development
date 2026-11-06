'use strict';
// The only gameplay-state writes in this suite. Runs once, before play assertions.
// No unlock, research, worker, level, timer, ownership, or save-engine flag is granted.
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
module.exports = { prepareSupplies };
