'use strict';
const { test, expect } = require('./fixtures.cjs');
const { prepareSupplies } = require('./checkpoint.cjs');

test('준비 자원: 모든 지역·연구·제품, 최대 시설, 박물관 최종 보상', async ({ page, qa }) => {
  test.setTimeout(240_000);
  qa.note('미구현: 전투·고대 지하 도시 B1~B4·스토리·집 가구/휴식·상점 등 최종 설계 콘텐츠(docs/HANDOFF.md §8)');
  qa.note('전 자원 시설·모든 제작소·인부 정원 전체의 반복 최대 강화, 모든 정기 거래·모든 고정 수주는 1차 검증 범위에서 미도달', '미도달');
  qa.note('나머지 고정 수주: 다음 수주 도착까지 5~25분의 게임 시간이 필요하여 1차 실행 예산 내 미도달', '미도달');
  await qa.step('01-preparation', '새 마을에 후반 검증용 재료만 준비', async () => {
    await page.clock.install();
    await qa.boot();
    const receipt = await prepareSupplies(page);
    qa.report.preparation = JSON.stringify(receipt) + ' — 자원·골드·미감정 유물만 1회 주입. 이후 진행 플래그와 저장은 실제 UI/게임 처리.';
    expect(await page.evaluate(() => Object.values(state.research).filter(Boolean).length)).toBe(0);
    expect(await page.evaluate(() => Object.values(state.unlockedSites).filter(Boolean).length)).toBe(1);
  }, '준비용 상태 주입');
  await qa.step('02-sites', '다음 지역 확장 버튼으로 우주 정거장까지 해금', async () => {
    await qa.tab('mining');
    for (const key of ['manaVein', 'ruins', 'spaceStation']) {
      const gold = await page.evaluate(() => state.gold);
      await qa.press('[data-expand-base]');
      expect(await page.evaluate(k => state.unlockedSites[k], key)).toBe(true);
      expect(await page.evaluate(() => state.gold)).toBeLessThan(gold);
    }
    await expect(page.locator('#baseInfo')).toContainText('모든 지역을 개척했습니다.');
  });
  await qa.step('03-research', '아홉 연구를 선행 순서대로 실제 구매', async () => {
    await qa.tab('research');
    const keys = await page.evaluate(() => RESEARCH.map(r => r.key));
    for (const key of keys) {
      await qa.press(`[data-research="${key}"]`);
      expect(await page.evaluate(k => state.research[k], key)).toBe(true);
      await expect(page.locator(`[data-research="${key}"]`)).toBeDisabled();
    }
    expect(keys).toHaveLength(9);
    await qa.audit('최종 연구 패널');
  });
  await qa.step('04-tunnel', '굴착 업체 의뢰와 600초 경과 후 터널 개통', async () => {
    await qa.press('[data-order-tunnel]');
    const job = await page.evaluate(() => ({ ...state.world.tunnelContract }));
    expect(job.durationSec).toBe(600);
    expect(await page.evaluate(() => state.world.tunnelUnlocked)).toBe(false);
    // Browser wall-clock advance; no game tick, job, balance, or unlock flag is written.
    await page.clock.setSystemTime(new Date(job.startedAt + 600_001));
    await page.waitForFunction(() => state.world.tunnelUnlocked && state.world.tunnelContract === null);
  }, '실제 의뢰 + 브라우저 시계 600초 경과');
  await qa.step('05-worker-upgrades', '인부 모집·상위 자원 배치·능력 강화', async () => {
    await qa.tab('workers');
    await qa.press('#gachaGoldBtn');
    await expect(page.locator('[data-reassign]')).toHaveCount(1);
    await page.locator('[data-reassign]').selectOption('cosmicShard');
    for (const stat of ['mining', 'carry', 'move']) {
      for (let i = 0; i < 3; i++) await qa.press(`[data-upstat="${stat}"]`);
      await expect(page.locator(`[data-upstat="${stat}"]`)).toBeDisabled();
    }
    expect(await page.evaluate(() => state.characters[0].resource)).toBe('cosmicShard');
  });
  await qa.step('06-mine-upgrades', '채굴·인력 시설의 구현된 최대 레벨', async () => {
    await qa.tab('mining');
    for (let i = 0; i < 12; i++) await qa.press('[data-fac="iron"]');
    for (let i = 0; i < 12; i++) await qa.press('[data-train="iron"]');
    expect(await page.evaluate(() => state.facility.iron)).toBe(12);
    expect(await page.evaluate(() => state.workforce.iron)).toBe(12);
    await expect(page.locator('[data-fac="iron"]')).toBeDisabled();
    await expect(page.locator('[data-train="iron"]')).toBeDisabled();
  });
  await qa.step('07-production-facilities', '투자·제작 시설 최대 강화와 제작소 8곳', async () => {
    await qa.tab('dev');
    for (let i = 0; i < 12; i++) await qa.press('#hqBtn');
    for (let i = 1; i < 15; i++) await qa.press('#craftFacilityBtn');
    await expect(page.locator('#hqBtn')).toBeDisabled();
    await expect(page.locator('#craftFacilityBtn')).toBeDisabled();
    for (let i = 0; i < 8; i++) await qa.press('[data-build-workshop]');
    expect(await page.evaluate(() => state.world.workshops.length)).toBe(8);
    await expect(page.locator('#workshopBuild')).toContainText('최대 8곳');
    for (let i = 1; i < 8; i++) await qa.press('[data-workshop-upgrade="' + await page.locator('[data-workshop-recipe]').first().getAttribute('data-workshop-recipe') + '"]');
    expect(await page.evaluate(() => state.world.workshops[0].level)).toBe(8);
  });
  const recipes = ['steel', 'coalBrick', 'alloy', 'crystalAlloy', 'specialAlloy', 'precisionPart', 'relicPart', 'quantumCore', 'plasmaCore', 'ironTool', 'manaLamp', 'crystalLens', 'steelGear', 'relicOrnament', 'manaEngine', 'starLens', 'plasmaCell', 'precisionMachine'];
  for (const key of recipes) {
    await qa.step('08-craft-' + key, '실제 제작 완료: ' + key, async () => {
      const previous = await page.evaluate(k => state.products[k], key);
      await page.locator('[data-workshop-recipe]').first().selectOption(key);
      const id = await page.locator('[data-workshop-recipe]').first().getAttribute('data-workshop-recipe');
      await qa.press(`[data-workshop-craft="${id}"]`);
      await expect.poll(() => page.evaluate(k => state.products[k], key), { timeout: 20_000 }).toBeGreaterThan(previous);
      expect(await page.evaluate(() => state.world.workshops[0].progress)).toBeNull();
    });
  }
  await qa.step('09-automation-sale', '자동 제작 토글과 상위 제품 판매', async () => {
    await qa.activate(page.locator('[data-workshop-auto]').first());
    expect(await page.evaluate(() => state.world.workshops[0].auto)).toBe(true);
    await qa.activate(page.locator('[data-workshop-auto]').first());
    await expect(page.locator('[data-workshop-auto]').first()).not.toBeChecked();
    const before = await page.evaluate(() => state.gold);
    await qa.press('[data-recipe-summary="plasmaCore"]'); // UX-01: the sale is in the card's details
    await expect(page.locator('[data-recipe-more="plasmaCore"]')).toHaveAttribute('open', '');
    await qa.press('[data-sell="plasmaCore"]');
    expect(await page.evaluate(() => state.gold)).toBeGreaterThan(before);
    expect(await page.evaluate(() => state.products.plasmaCore)).toBe(0);
  });
  await qa.step('10-delivery', '첫 회사 실제 수주 완료와 명성 획득', async () => {
    await qa.tab('delivery');
    await qa.press('[data-complete-order="forge"]');
    expect(await page.evaluate(() => permanent.totalPrestige)).toBeGreaterThan(0);
    await qa.audit('납품 패널');
  });
  await qa.step('11-village', '감정소·박물관 두 단계씩 복구', async () => {
    await qa.tab('village');
    for (const key of ['appraiser', 'museum']) {
      for (let i = 0; i < 2; i++) await qa.press(`[data-village-restore="${key}"]`);
      await expect(page.locator(`[data-village-stage="${key}"]`)).toHaveText('운영 중');
    }
  });
  await qa.step('12-museum', '실제 감정·기증으로 박물관 18종과 최종 보상', async () => {
    for (let i = 0; await page.evaluate(() => state.village.codex.length) < 12; i++) {
      expect(i, '100개 준비 유물의 감정 한도').toBeLessThan(100);
      await qa.press('[data-village-appraise]');
    }
    await qa.press('[data-village-donate-all]');
    const keys = await page.evaluate(() => VILLAGE_SPECIMENS.map(s => s.key));
    expect(keys).toHaveLength(6);
    for (const key of keys) await qa.press(`[data-village-donate-specimen="${key}"]`);
    expect(await page.evaluate(() => state.village.donated.length + state.village.specimens.length)).toBe(18);
    await expect(page.locator('#villagePanel')).toContainText('황금 곡괭이');
    await qa.audit('박물관 최종 전시');
  });
  await qa.step('13-garden', '최종 보상 장식 배치와 회수', async () => {
    await qa.press('[data-decor-select="goldenPick"]');
    const place = page.locator('[data-decor-put]:enabled').first();
    await place.scrollIntoViewIfNeeded();
    await qa.activate(place);
    expect(await page.evaluate(() => state.village.decor.some(d => d.kind === 'goldenPick'))).toBe(true);
    await qa.activate(page.locator('[data-decor-remove]').first());
    expect(await page.evaluate(() => state.village.decor.length)).toBe(0);
  });
});
