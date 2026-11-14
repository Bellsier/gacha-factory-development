'use strict';
const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  qa: async ({ page, context, baseURL }, use, testInfo) => {
    const report = { preparation: '없음', stages: [], findings: [], lastSuccessfulStage: null, console: [], pageErrors: [], dialogs: [] };
    const confirmations = [];
    const observe = tab => {
      tab.on('console', msg => { if (['error', 'warning'].includes(msg.type())) report.console.push({ type: msg.type(), text: msg.text(), location: msg.location() }); });
      tab.on('pageerror', error => report.pageErrors.push({ message: error.message, stack: error.stack }));
      tab.on('dialog', async dialog => {
        const decision = confirmations.shift();
        report.dialogs.push({ message: dialog.message(), type: dialog.type(), expected: !!decision });
        if (decision === 'accept') await dialog.accept(); else await dialog.dismiss();
      });
    };
    observe(page); context.on('page', observe);
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const qa = {
      report, confirm: () => confirmations.push('accept'),
      async snapshot() {
        return page.evaluate(() => ({
          bootstrap: typeof GameBootstrap === 'undefined' ? null : GameBootstrap.state,
          village: typeof S2Runtime === 'undefined' ? null : { id: S2Runtime.session?.id, name: S2Runtime.displayName, savedAt: S2Runtime.lastTime },
          progress: typeof state === 'undefined' ? null : {
            gold: state.gold, resources: { ...state.resources }, products: { ...state.products },
            player: { ...state.world.player }, sites: { ...state.unlockedSites }, research: { ...state.research },
            workers: state.characters.length, workshops: state.world.workshops.map(w => ({ id: w.id, level: w.level, recipe: w.recipeKey, progress: w.progress })),
            tunnel: state.world.tunnelUnlocked, hq: state.hqLevel, craftFacility: state.craftFacility,
            facilities: { ...state.village.stage }, museum: state.village.donated.length + state.village.specimens.length,
            reputation: permanent.totalPrestige,
          },
        }));
      },
      async step(id, title, action, mode = '실제 조작') {
        return test.step(title, async () => {
          const stage = { id, title, mode, status: '진행 중', startedAt: new Date().toISOString() };
          report.stages.push(stage);
          try {
            const value = await action();
            stage.status = '통과'; stage.observed = await qa.snapshot();
            return value;
          } catch (error) {
            stage.status = '실패'; stage.error = String(error.stack || error);
            stage.observed = await qa.snapshot().catch(() => null);
            qa.finding({ id: 'FAIL-' + id, severity: '주요', location: title,
              steps: report.stages.map(s => s.title).join(' → '), expected: '단계의 입력과 검증 조건을 만족하고 다음 단계로 진행',
              actual: error.message || String(error), evidence: id + '-failed.png, trace.zip, browser-errors.json',
              cause: '미분류 실패 후보: 게임·테스트·환경 원인을 trace에서 구분해야 함', recommendation: '실패 지점의 입력/기대값과 실제 관찰을 비교해 원인 분류. 이 PR에서 게임 코드는 수정하지 않음' });
            throw error;
          }
          finally {
            stage.endedAt = new Date().toISOString();
            stage.screenshot = `${id}-${stage.status === '실패' ? 'failed' : 'passed'}.png`;
            try { await page.screenshot({ path: testInfo.outputPath(stage.screenshot) }); await testInfo.attach(stage.screenshot, { path: testInfo.outputPath(stage.screenshot), contentType: 'image/png' }); }
            catch (error) {
              stage.screenshotError = String(error);
              if (stage.status === '통과') { stage.status = '실패'; stage.error = '필수 단계 스크린샷 수집 실패: ' + error; throw error; }
            }
            if (stage.status === '통과') report.lastSuccessfulStage = title;
          }
        });
      },
      note(title, status = '미구현') { report.stages.push({ title, mode: '범위 기록', status }); },
      finding(data) { report.findings.push(data); },
      async boot() {
        expect(new URL(baseURL).hostname).toBe('127.0.0.1');
        await page.goto('/');
        await page.waitForFunction(() => typeof GameBootstrap !== 'undefined' && GameBootstrap.state === 'ready');
        await expect(page.locator('#tdCanvas')).toBeVisible();
      },
      async activate(element) {
        await expect(element).toBeEnabled();
        if (testInfo.project.name === 'mobile') await element.tap(); else await element.click();
      },
      async press(selector) { await qa.activate(page.locator(selector)); },
      async tab(name) {
        await qa.press(`.tab-btn[data-tab="${name}"]`);
        await expect(page.locator(`#tab-${name}`)).toBeVisible();
      },
      async audit(label) {
        const result = await page.evaluate(() => {
          // Issue #32 C: an open panel has a sticky top band (its ::before); content scrolled under it is out of sight
          const band = panel => { const b = getComputedStyle(panel, '::before'); return b.position === 'sticky' ? parseFloat(b.height) || 0 : 0; };
          const visible = el => {
            const closed = el.closest('details:not([open])');
            if (closed && !closed.querySelector(':scope > summary')?.contains(el)) return false;
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            const panel = document.body.classList.contains('td-panel-open') && el.closest('.tab-panel.active');
            if (panel) {
              const p = panel.getBoundingClientRect();
              if (r.bottom <= p.top + band(panel) || r.top >= p.bottom || r.right <= p.left || r.left >= p.right) return false;
            }
            return r.width > 0 && r.height > 0 && s.visibility === 'visible' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight;
          };
          const small = [], occluded = [], clipped = [], coveredText = [], statusCoveredText = [];
          const boot = document.querySelector('#gameBootstrap'), menu = document.querySelector('#s2Menu');
          // Covered background controls are intentionally inert under a modal.
          const scope = boot && !boot.hidden && visible(boot) ? boot : menu && !menu.hidden && visible(menu) ? menu : document;
          for (const el of scope.querySelectorAll('button,summary,input,select')) {
            if (!visible(el)) continue;
            const r = el.getBoundingClientRect(), text = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 80);
            if (r.height < 44 || r.width < 44) small.push({ text, width: +r.width.toFixed(1), height: +r.height.toFixed(1) });
            const scrollPanel = document.body.classList.contains('td-panel-open') && el.closest('.tab-panel.active');
            const p = scrollPanel && scrollPanel.getBoundingClientRect();
            const centerInside = !p || (r.y + r.height / 2 >= p.top + band(scrollPanel) && r.y + r.height / 2 <= p.bottom);
            if (centerInside && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight) {
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              if (hit && !el.contains(hit) && hit !== el && !el.disabled) occluded.push({ text, coveredBy: hit.id || hit.className || hit.tagName });
            }
            if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden') clipped.push(text);
          }
          const panel = document.querySelector('.tab-panel.active');
          if (scope === document && document.body.classList.contains('td-panel-open') && panel) {
            for (const overlay of document.querySelectorAll('#s2Open,#s2Status')) {
              if (!visible(overlay)) continue;
              const b = overlay.getBoundingClientRect(), panelBox = panel.getBoundingClientRect(), walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
              const abovePanel = +getComputedStyle(overlay).zIndex > +getComputedStyle(panel).zIndex;
              let textNode;
              while ((textNode = walker.nextNode())) {
                if (!textNode.textContent.trim() || !visible(textNode.parentElement)) continue;
                const range = document.createRange(); range.selectNodeContents(textNode);
                for (const r of range.getClientRects()) {
                  // Scrolled-out text has layout boxes but is not painted outside the scrollport.
                  const left = Math.max(b.left, r.left, panelBox.left, 0), right = Math.min(b.right, r.right, panelBox.right, innerWidth), top = Math.max(b.top, r.top, panelBox.top, 0), bottom = Math.min(b.bottom, r.bottom, panelBox.bottom, innerHeight);
                  const onTop = overlay.id === 's2Status' ? abovePanel : overlay.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
                  if (right - left > 6 && bottom - top > 4 && onTop) {
                    (overlay.id === 's2Status' ? statusCoveredText : coveredText).push(textNode.textContent.trim().slice(0, 100)); break;
                  }
                }
              }
            }
          }
          return { scope: scope.id || 'game', viewport: { width: innerWidth, height: innerHeight }, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, small, occluded, clipped, coveredText, statusCoveredText };
        });
        report.stages.at(-1).layout = result;
        const add = (id, severity, actual, recommendation) => qa.finding({ id, severity, location: label, steps: `${testInfo.project.name} 환경에서 ${label} 열기`, expected: '주요 조작을 읽고 누를 수 있어야 한다.', actual,
          evidence: report.stages.at(-1).id + '-passed.png 및 journey.json의 layout', cause: '측정 기반 후보이며 스크린샷과 함께 검토 필요', recommendation });
        if (testInfo.project.name === 'mobile' && result.small.length) add('UX-touch-size', 'UX 개선', `44px 미만 조작 ${result.small.length}개: ${JSON.stringify(result.small.slice(0, 6))}`, '모바일 주요 버튼과 탭의 최소 터치 영역 44px 확보');
        if (result.occluded.length) add('UX-covered-control', 'UX 개선', JSON.stringify(result.occluded), '겹치는 고정 HUD/모달과 조작 영역을 확인');
        if (result.horizontalOverflow || result.clipped.length) add('UX-text-overflow', '경미', JSON.stringify({ horizontalOverflow: result.horizontalOverflow, clipped: result.clipped }), '폭과 줄바꿈을 검토');
        if (result.coveredText.length) add('UX-save-overlay', 'UX 개선', `고정 저장 버튼이 패널 텍스트를 덮음: ${JSON.stringify(result.coveredText)}`, '저장 버튼을 공통 HUD의 예약 영역 또는 패널 외부로 배치');
        if (result.statusCoveredText.length) add('UX-status-overlay', 'UX 개선', `고정 저장 상태가 패널 텍스트를 덮음: ${JSON.stringify(result.statusCoveredText)}`, '모바일 패널/본문의 하단 여백 또는 저장 상태 배치를 조정');
        expect([...result.coveredText, ...result.statusCoveredText], label + ': 저장 HUD의 본문 가림').toEqual([]);
        expect(result.occluded.filter(item => ['s2Open', 's2Status', 's2Hud'].includes(item.coveredBy)), label + ': 저장 HUD의 조작 가림').toEqual([]);
        return result;
      },
    };
    try { await use(qa); }
    finally {
      if (testInfo.status !== testInfo.expectedStatus && !report.stages.some(s => s.status === '실패')) report.stages.push({ title: '시나리오 종료', mode: '검증', status: '실패', error: testInfo.error?.message });
      await testInfo.attach('journey.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      await testInfo.attach('browser-errors.json', { body: JSON.stringify({ console: report.console, pageErrors: report.pageErrors, dialogs: report.dialogs }, null, 2), contentType: 'application/json' });
      expect(report.pageErrors, '브라우저 pageerror').toEqual([]);
      expect(report.console.filter(m => m.type === 'error'), '브라우저 console.error').toEqual([]);
      expect(report.dialogs.filter(d => !d.expected), '예고하지 않은 확인창').toEqual([]);
      expect(confirmations, '예상 확인창이 실제 표시되어야 함').toEqual([]);
    }
  },
});
module.exports = { test, expect };
