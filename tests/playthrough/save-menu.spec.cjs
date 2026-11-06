'use strict';
const { test, expect } = require('./fixtures.cjs');

test('독립 시나리오: 수동 5슬롯 탐색·덮어쓰기·삭제', async ({ page, qa }, testInfo) => {
  qa.report.preparation = '없음. 새 격리 프로필에서 이 테스트가 생성한 수동 저장만 UI로 삭제한다.';
  const activate = async locator => testInfo.project.name === 'mobile' ? locator.tap() : locator.click();
  const row = n => page.locator('[data-s2-manuals] .s2-row').nth(n - 1);
  let villageId;
  await qa.step('01-menu', '별도 새 프로필에서 자동·수동 영역 탐색', async () => {
    await qa.boot(); villageId = await page.evaluate(() => S2Runtime.session.id);
    await qa.press('#s2Open');
    if (testInfo.project.name === 'mobile') {
      await expect(page.locator('[data-s2-manual-section]')).not.toHaveAttribute('open');
      await activate(page.locator('[data-s2-auto-section] summary'));
      await expect(page.locator('[data-s2-auto-section]')).not.toHaveAttribute('open');
    }
    if (!(await page.locator('[data-s2-manual-section]').evaluate(el => el.open))) await activate(page.locator('[data-s2-manual-section] summary'));
    await expect(page.locator('[data-s2-manuals] .s2-row')).toHaveCount(5);
  });
  for (let n = 1; n <= 5; n++) {
    await qa.step('02-slot-' + n, '수동 슬롯 ' + n + ' 실제 저장', async () => {
      await activate(row(n).getByRole('button', { name: '여기에 저장', exact: true }));
      await expect(row(n)).toContainText('첫 마을');
      const stored = await page.evaluate(async slot => (await S2Runtime.engine.list()).manual.find(r => r.id === slot), n);
      expect(stored.snapshot.payload.run.gold).toBe(0);
    });
  }
  await qa.step('03-overwrite', '슬롯 5 확인창을 거쳐 덮어쓰기', async () => {
    const before = await page.evaluate(async () => (await S2Runtime.engine.list()).manual.find(r => r.id === 5));
    qa.confirm(); await activate(row(5).getByRole('button', { name: '이 슬롯 덮어쓰기', exact: true }));
    await expect.poll(() => page.evaluate(async () => (await S2Runtime.engine.list()).manual.find(r => r.id === 5).revision)).toBeGreaterThan(before.revision);
    const layout = await qa.audit('수동 저장 5슬롯 하단');
    if (testInfo.project.name === 'mobile') expect(layout.occluded.filter(item => ['이어하기', '마을 삭제'].includes(item.text)), '접힌 자동 저장 영역은 가림 결함 검사 대상이 아님').toEqual([]);
  });
  await qa.step('04-delete', '자신이 만든 수동 저장만 삭제·마을 자동 저장 보존', async () => {
    for (let n = 5; n >= 1; n--) {
      qa.confirm(); await activate(row(n).getByRole('button', { name: '수동 저장 삭제', exact: true }));
      await expect(row(n)).toContainText('비어 있음');
    }
    expect(await page.evaluate(async () => (await S2Runtime.engine.list()).manual.filter(r => r.snapshot).length)).toBe(0);
    expect(await page.evaluate(id => S2Runtime.engine.read(id).then(s => s.id), villageId)).toBe(villageId);
    await qa.press('[data-s2-close]');
    expect(await page.evaluate(() => S2Runtime.canPlay())).toBe(true);
  });
});
