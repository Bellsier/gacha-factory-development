// =============================================================================
// Building design pass (PR #12): the workshop cabin, the craft hut tiers and
// the village facilities by restoration stage. Same sprite sizes, anchors and
// collision boxes as before (05.js, 10.js); what is checked here is what the
// pictures have to say. (12.js: Claude-owned tests, see docs/COLLABORATION.md.)
// =============================================================================
(function test_buildingDesign() {
  const win = newDom(makeMemoryStorage()).window;
  const PLAYER_H = 21; // hair to boots (tdPlayerSprite: 22 rows with the shadow)
  const DOOR = '#4a3626'; // the door frame colour every building shares (sprites.js)
  const raster = (sp) => win.tdRaster(sp);
  const hex = (p) => '#' + p.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  const at = (r, x, y) => { const p = r.px[y * r.w + x]; return p && p[3] >= 1 ? hex(p) : null; };
  const has = (sp, c) => { const r = raster(sp); return r.px.some((p) => p && p[3] >= 1 && hex(p) === c); };
  const hue = (c) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if(d === 0) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };
  // the tallest unbroken run of the door frame colour in the middle of the picture
  const doorRun = (sp) => {
    const r = raster(sp), F = DOOR;
    let best = 0;
    for(let x = Math.floor(r.w * 0.3); x < Math.ceil(r.w * 0.7); x++){
      let run = 0;
      for(let y = 0; y < r.h; y++){ run = at(r, x, y) === F ? run + 1 : 0; best = Math.max(best, run); }
    }
    return best;
  };
  // the first solid row in the centre column (the ridge; chimneys stand off-centre)
  const ridgeRow = (sp) => { const r = raster(sp), x = Math.floor(r.w / 2); for(let y = 0; y < r.h; y++) if(at(r, x, y)) return y; return r.h; };
  const glowCount = (sp) => raster(sp).px.filter((p) => p && p[3] >= 1 && win.tdFinishKeeps(p)).length;

  const base = win.tdBaseSprite(), huts = [1, 2, 3].map((t) => win.tdWorkshopSprite(t));
  const ap = [0, 1, 2].map((s) => win.tdVillageSprite('appraiser', s, 0, [], 0));
  const mu = [0, 1, 2].map((s) => win.tdVillageSprite('museum', s, 6, [], 0));

  // proportions: doors are sized to the player, not drawn as tiny slots
  check('Buildings: the workshop cabin door is about the player\'s height (>= 20 px of 21)', doorRun(base) >= 20, 'door ' + doorRun(base));
  huts.forEach((h, i) => check('Buildings: the tier ' + (i + 1) + ' craft hut door is at least three quarters of the player (>= 15 px)', doorRun(h) >= 15, 'door ' + doorRun(h)));
  check('Buildings: the open appraiser\'s door is at least three quarters of the player', doorRun(ap[2]) >= 15, 'door ' + doorRun(ap[2]));
  check('Buildings: the open museum\'s door is at least three quarters of the player', doorRun(mu[2]) >= 15, 'door ' + doorRun(mu[2]));
  check('Buildings: no door is taller than the house door (1.2 x the player)', [base, ...huts, ap[2], mu[2]].every((s) => doorRun(s) <= Math.round(PLAYER_H * 1.2)));

  // the craft hut grows with its tier: a higher roof and more lit windows
  const ridges = huts.map(ridgeRow), glows = huts.map(glowCount);
  check('Buildings: each craft hut tier stands taller (the ridge rises tier by tier)', ridges[0] > ridges[1] && ridges[1] > ridges[2], ridges.join());
  check('Buildings: each craft hut tier has more warm light (forge, windows)', glows[0] < glows[1] && glows[1] < glows[2], glows.join());

  // identity: the tier 3 hut no longer wears the appraiser's blue roof
  const roofOf = (sp) => { const r = raster(sp), x = Math.floor(r.w / 2); return at(r, x, ridgeRow(sp) + 3); };
  check('Buildings: the tier 3 craft hut roof and the appraiser roof are clearly different colours (hue 40 degrees apart)',
    hueGap(roofOf(huts[2]), roofOf(ap[2])) >= 40, roofOf(huts[2]) + ' vs ' + roofOf(ap[2]));

  // restoration: every stage shows its own trade
  check('Buildings: the appraiser ruin keeps its blue lens sign, the museum ruin its white columns', has(ap[0], '#3f7aa8') && has(mu[0], '#e6e1d8'));
  check('Buildings: the appraiser building site shows its blue roof tiles, not columns', has(ap[1], '#3f7aa8') && !has(ap[1], '#e6e1d8'));
  check('Buildings: the museum building site shows its white columns, not blue tiles', has(mu[1], '#e6e1d8') && !has(mu[1], '#3f7aa8'));
  check('Buildings: the two building sites are not the same scaffold at two widths',
    JSON.stringify(ap[1].rects.map((q) => q[4]).sort()) !== JSON.stringify(mu[1].rects.map((q) => q[4]).sort()));

  // the museum's six lit niches stand clear of its door
  const r = raster(mu[2]), F = DOOR, doorCols = new Set(), nicheCols = new Set();
  for(let x = 0; x < r.w; x++) for(let y = 0; y < r.h; y++){ const c = at(r, x, y); if(c === F) doorCols.add(x); if(c === '#ffd27a') nicheCols.add(x); }
  check('Buildings: the museum\'s display niches never cover its door', doorCols.size > 0 && nicheCols.size > 0 && [...nicheCols].every((x) => !doorCols.has(x)));

  // nothing moved: sizes and the light anchors' windows
  check('Buildings: sizes are unchanged (cabin 64x58, huts 44x40, appraiser 44x40, museum 60x48)',
    base.w === 64 && base.h === 58 && huts.every((h) => h.w === 44 && h.h === 40) && ap.every((s) => s.w === 44 && s.h === 40) && mu.every((s) => s.w === 60 && s.h === 48));
  const rb = raster(base);
  check('Buildings: the cabin windows still glow where their lights are (x 17 and 49, row 35)', [[17, 35], [49, 35]].every(([x, y]) => { const p = rb.px[y * rb.w + x]; return p && win.tdFinishKeeps(p); }));
  check('Buildings: every craft hut\'s forge window still glows where its light is (x 11, row 25)', huts.every((h) => { const q = raster(h).px[25 * 44 + 11]; return q && win.tdFinishKeeps(q); }));
})();

// The building gallery (tools/building-gallery.html) draws with the game's tdDrawSprite at the
// anchors tdRender uses; its table must follow render.js when either changes.
(function test_buildingGalleryAnchors() {
  const render = fs.readFileSync(path.join(JS_DIR, 'topdown', 'render.js'), 'utf8');
  const gallery = fs.readFileSync(path.join(__dirname, '..', 'tools', 'building-gallery.html'), 'utf8');
  const inGame = (kind) => { const m = render.match(new RegExp("it\\.kind === '" + kind + "'\\)\\{? ?tdDrawSprite\\([^;]*?, zoom, (\\d+)\\)")); return m ? Number(m[1]) : null; };
  const table = gallery.match(/GALLERY_ANCHOR = (\{[^}]*\})/);
  const anchors = table ? Function('return ' + table[1])() : {};
  ['house', 'base', 'workshop', 'village', 'player'].forEach((kind) => {
    check('Gallery: the ' + kind + ' stands ' + inGame(kind) + ' px into the ground as in the game (render.js)', inGame(kind) !== null && anchors[kind] === inGame(kind), 'gallery ' + anchors[kind] + ', game ' + inGame(kind));
  });
  check('Gallery: it draws with the game\'s own tdDrawSprite, sprite sheet and village images', /tdDrawSprite\(g, img,/.test(gallery) && /tdBuildSpriteSheet\(\)/.test(gallery) && /tdVillageImage\(/.test(gallery));
  check('Gallery: it never loads the game itself or touches storage', !/<iframe|index\.html|localStorage|main\.js|state\.js/.test(gallery));
})();
