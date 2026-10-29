// Test-world runtime. Data cache is independent of TD's disposable canvases.

// The 256 test world: 8 x 8 chunks of 8 units (32 x 32 quarter-unit tiles each), chunk keys -4..3 on
// both axes, so the ground runs from -32 to 32 and a foot stays within +-EDGE. The legacy -12..12 map
// (the village and the old world inside its border) sits in the middle at the same coordinates.
const WORLD256 = Object.freeze({ SIZE: 256, CHUNK_UNITS: 8, CHUNK_MIN: -4, CHUNK_MAX: 3, EDGE: 31.75, LEGACY_EDGE: 12 });
const WORLDGEN_TEST_KEY = saveKeyFor(typeof location !== 'undefined' ? location : null) + '.worldgen256.v1';
const WORLDGEN_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('worldgen') === '256';
let worldLoadingContext = null;
let worldChunkRuntime = null;
function worldTestMode() {
  return WORLDGEN_MODE;
}
function worldContext(raw) {
  if (!WORLDGEN_MODE) return null;
  const fields = ['seed', 'size', 'generatorVersion', 'chunkEditsVersion', 'chunkEdits'];
  if (!fields.some((k) => Object.prototype.hasOwnProperty.call(raw || {}, k))) return null;
  if (
    !fields.every((k) => Object.prototype.hasOwnProperty.call(raw, k)) ||
    raw.size !== WORLD256.SIZE ||
    raw.chunkEditsVersion !== 1
  )
    throw new Error('Unsupported test world');
  chunkValidate(raw, 0, 0);
  if (raw.testReturnPosition !== undefined) {
    const p = raw.testReturnPosition;
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      ((Math.abs(p.x) > 10 || Math.abs(p.y) > 10) && !worldConnector(p.x, p.y))
    )
      throw new Error('Invalid return position');
  }
  // A saved generated entity belongs in edits, never the legacy mine array.
  if (Array.isArray(raw.mines) && raw.mines.some((m) => m && typeof m.id === 'string' && /^gen:v[12]:mine:/.test(m.id)))
    throw new Error('Generated mine ID collision');
  const edits = raw.chunkEdits;
  if (!edits || typeof edits !== 'object' || Array.isArray(edits) || Object.keys(edits).length > 64)
    throw new Error('Invalid chunk edits');
  for (const [key, entry] of Object.entries(edits)) {
    const pair = key.split(',').map(Number),
      [cx, cy] = pair;
    if (pair.length !== 2 || !pair.every((v) => Number.isInteger(v) && v >= WORLD256.CHUNK_MIN && v <= WORLD256.CHUNK_MAX) || key !== cx + ',' + cy)
      throw new Error('Invalid chunk key');
    if (
      !entry ||
      Object.keys(entry).some((k) => k !== 'mines') ||
      !entry.mines ||
      Array.isArray(entry.mines) ||
      typeof entry.mines !== 'object' ||
      Object.keys(entry.mines).length > 16
    )
      throw new Error('Invalid edits');
    for (const [id, e] of Object.entries(entry.mines)) {
      const m = new RegExp('^gen:v' + raw.generatorVersion + ':mine:(-?\\d+):(-?\\d+)$').exec(id);
      const candidate = m && chunkMineCandidate(raw, Number(m[1]), Number(m[2]));
      if (!candidate || candidate.id !== id || Math.floor(candidate.x / WORLD256.CHUNK_UNITS) !== cx || Math.floor(candidate.y / WORLD256.CHUNK_UNITS) !== cy)
        throw new Error('Invalid mine id');
      if (
        !e ||
        Object.keys(e).some((k) => !['discovered', 'developmentState'].includes(k)) ||
        typeof e.discovered !== 'boolean' ||
        !['unsecured', 'secured'].includes(e.developmentState) ||
        (e.developmentState === 'secured' && !e.discovered)
      )
        throw new Error('Invalid mine edit');
    }
  }
  return {
    seed: raw.seed,
    size: WORLD256.SIZE,
    generatorVersion: raw.generatorVersion,
    chunkEditsVersion: 1,
    chunkEdits: JSON.parse(JSON.stringify(edits))
  };
}
function currentWorldContext() {
  if (!WORLDGEN_MODE) return null;
  if (worldLoadingContext) return worldLoadingContext;
  try {
    return state.world.size === WORLD256.SIZE ? state.world : null;
  } catch (_) {
    return null;
  }
}
function worldBounds(context = currentWorldContext()) {
  return context
    ? { minX: -WORLD256.EDGE, maxX: WORLD256.EDGE, minY: -WORLD256.EDGE, maxY: WORLD256.EDGE }
    : { minX: BALANCE.world.BOUNDS_MIN_X, maxX: BALANCE.world.BOUNDS_MAX_X, minY: BALANCE.world.BOUNDS_MIN_Y, maxY: BALANCE.world.BOUNDS_MAX_Y };
}
function worldTestInitialize(world) {
  if (!WORLDGEN_MODE) return;
  if (world.size !== WORLD256.SIZE) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    Object.assign(world, { seed, size: WORLD256.SIZE, generatorVersion: 2, chunkEditsVersion: 1, chunkEdits: {} });
  }
}
function worldRuntime(world = state.world) {
  if (!worldChunkRuntime || worldChunkRuntime.world !== world) {
    worldChunkRuntime = {
      world,
      data: new Map(),
      mines: new Map(),
      props: [],
      revision: 0,
      stats: { generated: 0, totalMs: 0, maxMs: 0 }
    };
  }
  return worldChunkRuntime;
}
function worldChunk(context, cx, cy) {
  if (cx < WORLD256.CHUNK_MIN || cx > WORLD256.CHUNK_MAX || cy < WORLD256.CHUNK_MIN || cy > WORLD256.CHUNK_MAX) return null;
  const rt = worldRuntime(context),
    key = cx + ',' + cy;
  if (rt.data.has(key)) return rt.data.get(key);
  const start = performance.now(),
    chunk = generateWorldChunk(context, cx, cy),
    ms = performance.now() - start;
  rt.data.set(key, chunk);
  rt.stats.generated++;
  rt.stats.totalMs += ms;
  rt.stats.maxMs = Math.max(ms, rt.stats.maxMs);
  return chunk;
}
function serializeRunForSave(run) {
  if (!WORLDGEN_MODE || run.world.size !== WORLD256.SIZE) return run;
  const rt = worldRuntime(run.world),
    world = { ...run.world };
  world.mines = world.mines.filter((m) => rt.mines.get(m.id) !== m);
  world.hiddenMineIds = world.hiddenMineIds.filter((id) => !rt.mines.has(id));
  worldContext(world);
  return { ...run, world };
}
// Trial-only connector occupies the old outer border, never the playable village.
const WORLD_CONNECTOR = { minX: 10, maxX: 14.25, minY: -0.5, maxY: 0.5, standHalfY: 0.44 };
function worldConnector(x, y) {
  const c = WORLD_CONNECTOR;
  return x >= c.minX && x < c.maxX && y >= c.minY && y < c.maxY;
}
function worldOutsideLegacy(x, y) {
  const e = WORLD256.LEGACY_EDGE;
  return x < -e || x >= e || y < -e || y >= e;
}
function worldGeneratedWalkable(context, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  for (const dx of [-0.09, 0.09])
    for (const dy of [-0.06, 0.06]) {
      if (sampleGeneratedTile(context, Math.floor((x + dx) * 4), Math.floor((y + dy) * 4)) !== 0) return false;
    }
  return true;
}
function materializeChunkEntities(context, chunk) {
  if (!chunk) return;
  const rt = worldRuntime(context);
  if (!rt.materialized) rt.materialized = new Set();
  const key = chunk.cx + ',' + chunk.cy;
  if (rt.materialized.has(key)) return;
  for (const candidate of chunk.mines) {
    if (context.mines.some((m) => m.id === candidate.id) && !rt.mines.has(candidate.id))
      throw new Error('Generated mine ID collision');
    const e = context.chunkEdits[key]?.mines[candidate.id];
    const mine = {
      ...candidate,
      grade: worldGenResourceGrade(candidate.resource),
      developmentState: e?.developmentState || 'unsecured'
    };
    rt.mines.set(mine.id, mine);
    context.mines.push(mine);
    if (!e?.discovered) context.hiddenMineIds.push(mine.id);
  }
  for (const p of chunk.props) {
    const b = SCENERY_BLOCK_BOXES[p.kind];
    rt.props.push({
      ...p,
      box: b ? { minX: p.x + b.minX, maxX: p.x + b.maxX, minY: p.y + b.minY, maxY: p.y + b.maxY } : null
    });
  }
  const generated = context.mines.filter((m) => rt.mines.get(m.id) === m).sort((a, b) => a.y - b.y || a.x - b.x);
  context.mines = context.mines.filter((m) => rt.mines.get(m.id) !== m).concat(generated);
  rt.props.sort((a, b) => a.y - b.y || a.x - b.x);
  rt.materialized.add(key);
  rt.revision++;
}
function worldEnsureRect(r) {
  const c = currentWorldContext();
  if (!c || worldLoadingContext) return;
  const { CHUNK_UNITS: U, CHUNK_MIN: lo, CHUNK_MAX: hi } = WORLD256;
  for (let cy = Math.max(lo, Math.floor(r.minY / U)); cy <= Math.min(hi, Math.floor(r.maxY / U)); cy++)
    for (let cx = Math.max(lo, Math.floor(r.minX / U)); cx <= Math.min(hi, Math.floor(r.maxX / U)); cx++)
      materializeChunkEntities(c, worldChunk(c, cx, cy));
}
function worldRestoreEdits() {
  const c = currentWorldContext();
  if (!c) return;
  for (const key of Object.keys(c.chunkEdits)) {
    const [x, y] = key.split(',').map(Number);
    materializeChunkEntities(c, worldChunk(c, x, y));
  }
  const p = c.player;
  worldEnsureRect({ minX: p.x - 2, maxX: p.x + 2, minY: p.y - 2, maxY: p.y + 2 });
}
function recordGeneratedMineEdit(id) {
  const c = currentWorldContext();
  if (!c) return;
  const m = worldRuntime(c).mines.get(id);
  if (!m) return;
  const rt = worldRuntime(c);
  rt.workerRevision = (rt.workerRevision || 0) + 1;
  const key = Math.floor(m.x / WORLD256.CHUNK_UNITS) + ',' + Math.floor(m.y / WORLD256.CHUNK_UNITS);
  if (!c.chunkEdits[key]) c.chunkEdits[key] = { mines: {} };
  c.chunkEdits[key].mines[id] = { discovered: !c.hiddenMineIds.includes(id), developmentState: m.developmentState };
}
function worldGeneratedScenery() {
  const c = currentWorldContext(),
    rt = worldRuntime(c);
  const legacy = terrainTunnelOpen()
    ? worldSceneryLegacy()
    : rt.emptyScenery || (rt.emptyScenery = { props: [], solid: [], grid: {} });
  const key =
    rt.revision +
    '|' +
    terrainTunnelOpen() +
    '|' +
    c.mines.length +
    '|' +
    c.workshops.map((w) => w.id + ':' + w.x + ':' + w.y).join(';');
  if (rt.scenery?.key === key && rt.scenery.legacy === legacy) return rt.scenery;
  const props = legacy.props.concat(
    rt.props.filter((p) => !c.workshops.some((w) => Math.hypot(w.x - p.x, w.y - p.y) < 0.8))
  );
  const grid = {};
  for (const p of props)
    if (p.box) {
      const k = Math.floor(p.x) + ',' + Math.floor(p.y);
      (grid[k] || (grid[k] = [])).push(p);
    }
  return (rt.scenery = { key, legacy, props, solid: props.filter((p) => p.box), grid });
}
function worldTestTeleport() {
  const c = currentWorldContext();
  if (!WORLDGEN_MODE || !c || saveBlocked) return false;
  const p = c.player;
  if (worldOutsideLegacy(p.x, p.y)) {
    if (!c.testReturnPosition) return false;
    Object.assign(p, c.testReturnPosition, { pose: 'idle' });
    delete c.testReturnPosition;
  } else {
    c.testReturnPosition = { x: p.x, y: p.y };
    worldEnsureRect({ minX: 14, maxX: 18, minY: -2, maxY: 2 });
    Object.assign(p, { x: 16, y: 0, pose: 'idle' });
  }
  clearPlayerHeld();
  worldTestControlUpdate();
  return true;
}
function worldTestControls() {
  if (!WORLDGEN_MODE) return;
  const panel = document.createElement('details');
  panel.id = 'worldgen-test-controls';
  panel.style.cssText =
    'position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:10000;padding:4px;background:#172b24;color:#fff;font:12px sans-serif;border-radius:6px;max-width:90vw';
  const summary = document.createElement('summary');
  summary.textContent = '시험 설정';
  summary.style.cursor = 'pointer';
  panel.append(summary);
  const label = document.createElement('span');
  label.textContent = '256×256 시험 월드 · 별도 저장 ';
  panel.append(label);
  const button = document.createElement('button');
  button.id = 'worldgen-teleport';
  button.textContent = '외곽 / 마을 왕복';
  button.disabled = saveBlocked;
  button.addEventListener('click', () => worldTestTeleport());
  panel.append(button);
  const backup = document.createElement('button');
  backup.textContent = '시험 저장 내보내기';
  backup.id = 'worldgen-export';
  backup.addEventListener('click', () => {
    let raw;
    try {
      raw = localStorage.getItem(WORLDGEN_TEST_KEY);
    } catch (_) {
      return;
    }
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = url;
    a.download = 'worldgen256-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  panel.append(backup);
  if (saveBlocked) {
    const reason = document.createElement('span');
    reason.textContent = ' 불러오기 실패: 저장 중지';
    panel.append(reason);
  }
  document.body.append(panel);
  worldTestControlUpdate();
}

// Generated veins never alter village road/tuft geometry. Cache by list identity.
function worldVillageMines() {
  const c = currentWorldContext();
  if (!c) return state.world.mines;
  const rt = worldRuntime(c);
  if (rt.villageSource !== c.mines || rt.villageLength !== c.mines.length) {
    rt.villageSource = c.mines;
    rt.villageLength = c.mines.length;
    rt.villageMines = c.mines.filter((m) => !rt.mines.has(m.id));
  }
  return rt.villageMines;
}

function worldTestControlUpdate() {
  if (!WORLDGEN_MODE) return;
  const button = document.getElementById('worldgen-teleport'),
    c = currentWorldContext();
  if (!button || !c) return;
  const noReturn = worldOutsideLegacy(c.player.x, c.player.y) && !c.testReturnPosition;
  button.disabled = saveBlocked || noReturn;
  button.title = noReturn ? '저장된 복귀 위치가 없습니다. 연결 통로로 돌아오세요.' : '';
}
function worldRememberReturn(x, y, nx, ny) {
  const c = currentWorldContext();
  if (!c) return;
  if (x <= 10 && worldConnector(nx, ny) && !c.testReturnPosition) c.testReturnPosition = { x, y };
  worldTestControlUpdate();
}
