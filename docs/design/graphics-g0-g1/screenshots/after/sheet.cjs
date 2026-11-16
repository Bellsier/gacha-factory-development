const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out');
(async () => {
  const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const img = (f) => fs.existsSync(path.join(OUT, f)) ? `<img src="data:image/png;base64,${fs.readFileSync(path.join(OUT, f)).toString("base64")}">` : '<i>없음</i>';
  const css = '<style>body{background:#20261f;color:#eee;font:13px sans-serif;margin:8px}img{image-rendering:pixelated;display:block}td{padding:3px;vertical-align:top}.f img{height:150px}.s img{width:640px}.m img{width:300px}</style>';
  for (const dev of ['pc', 'mobile']) {
    // frames: rows = style x build, cols = direction x frame
    let h = css + '<table class="f">';
    for (const st of ['classic', 'v2']) for (const bd of ['before', 'after']) { h += `<tr><td>${st}<br>${bd === 'before' ? '전' : '후'}</td>`; for (const k of ['s', 'd', 'w', 'a']) for (const f of [0, 1, 2, 3]) h += `<td>${img(`${dev}-${st}-${bd}-walk-${k}-f${f}.png`)}</td>`; h += '</tr>'; }
    h += '</table>';
    await page.setContent(h); await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `frames-${dev}.png`), fullPage: true });
    for (const sc of ['house', 'workshop', 'inside']) {
      let t = css + `<table class="${dev === 'pc' ? 's' : 'm'}"><tr><td></td><td>전 (develop)</td><td>후 (G1)</td></tr>`;
      for (const st of ['classic', 'v2']) t += `<tr><td>${st}</td><td>${img(`${dev}-${st}-before-${sc}.png`)}</td><td>${img(`${dev}-${st}-after-${sc}.png`)}</td></tr>`;
      await page.setContent(t + '</table>'); await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `cmp-${dev}-${sc}.png`), fullPage: true });
    }
  }
  await b.close();
})();
