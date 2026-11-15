'use strict';

// Reads rendered boxes/text. Does not inspect or modify game/save state.
async function hudGeometry(page, panelSelector = null) {
  return page.evaluate(selector => {
    const rect = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const visible = el => el && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const intersect = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const hud = ['s2Open', 's2Status'].map(id => {
      const el = document.getElementById(id);
      return { id, visible: !!visible(el), rect: rect(el.getBoundingClientRect()), text: el.textContent, clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1 };
    });
    const blockers = [...document.querySelectorAll('.tabbar,#tdStick,#tdAction,#tdTorch,#tdDecor')].filter(visible).map(el => ({ id: el.id || 'tabbar', rect: rect(el.getBoundingClientRect()) }));
    const panel = selector ? document.querySelector(selector) : null;
    const panelBox = panel ? rect(panel.getBoundingClientRect()) : null;
    const overlaps = [], textOverlaps = [], controlOverlaps = [];
    for (const h of hud) {
      if (panelBox && intersect(h.rect, panelBox) > 1) overlaps.push({ hud: h.id, target: selector, area: intersect(h.rect, panelBox) });
      for (const b of blockers) if (intersect(h.rect, b.rect) > 1) overlaps.push({ hud: h.id, target: b.id, area: intersect(h.rect, b.rect) });
    }
    if (panel) {
      const clip = r => ({ left: Math.max(r.left, panelBox.left, 0), top: Math.max(r.top, panelBox.top, 0), right: Math.min(r.right, panelBox.right, innerWidth), bottom: Math.min(r.bottom, panelBox.bottom, innerHeight) });
      for (const el of panel.querySelectorAll('button,input,select')) {
        if (!visible(el)) continue;
        const r = clip(el.getBoundingClientRect());
        if (r.right <= r.left || r.bottom <= r.top) continue;
        for (const h of hud) if (intersect(h.rect, r) > 1) controlOverlaps.push({ hud: h.id, text: (el.textContent || el.tagName).trim().slice(0, 80) });
      }
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim() || !visible(node.parentElement)) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          const r = clip(box);
          if (r.right <= r.left || r.bottom <= r.top) continue;
          for (const h of hud) if (intersect(h.rect, r) > 1) textOverlaps.push({ hud: h.id, text: node.textContent.trim().slice(0, 100) });
        }
      }
    }
    const button = document.querySelector('#s2Open'), b = button.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return { viewport, hud, panel: panelBox, blockers, overlaps, textOverlaps, controlOverlaps,
      buttonHit: !!hit && (hit === button || button.contains(hit)),
      outside: hud.filter(h => h.rect.left < -1 || h.rect.top < -1 || h.rect.right > innerWidth + 1 || h.rect.bottom > innerHeight + 1).map(h => h.id) };
  }, panelSelector);
}
module.exports = { hudGeometry };
