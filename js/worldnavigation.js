// Trial navigation: bounded incremental A* on absolute quarter-unit cells.
// No saved navigation state, no teleports, and no changes to generator v1.
function worldNavFree(x, y) {
  return playerCanStand(x, y);
}
function worldNavClear(a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.08));
  for (let i = 1; i <= n; i++)
    if (!worldNavFree(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  // Connector ownership and standability change at different boundaries. Its
  // south shoulder is only .06 wide: uniform .08 samples can skip it entirely.
  // Split at the exact shared terrain boundaries and test both boundaries and
  // interval interiors, regardless of segment length, direction or alignment.
  const c = WORLD_CONNECTOR,
    cuts = [0, 1];
  for (const [axis, edges] of [
    ['x', [c.minX, c.maxX]],
    ['y', [c.minY, -c.standHalfY, c.standHalfY, c.maxY]]
  ]) {
    const d = b[axis] - a[axis];
    if (!d) continue;
    for (const edge of edges) {
      const t = (edge - a[axis]) / d;
      if (t > 0 && t < 1) cuts.push(t);
    }
  }
  cuts.sort((x, y) => x - y);
  const free = (t) => worldNavFree(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  for (let i = 0; i < cuts.length; i++) if (!free(cuts[i]) || (i && !free((cuts[i - 1] + cuts[i]) / 2))) return false;
  return true;
}
function worldNavAnchor(p) {
  const x = Math.floor(p.x * 4),
    y = Math.floor(p.y * 4),
    candidates = [];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const q = { x: (x + dx + 0.5) / 4, y: (y + dy + 0.5) / 4, gx: x + dx, gy: y + dy };
      q.d = Math.hypot(q.x - p.x, q.y - p.y);
      candidates.push(q);
    }
  candidates.sort((a, b) => a.d - b.d);
  return candidates.find((q) => worldNavFree(q.x, q.y) && worldNavClear(p, q));
}
function worldNavPush(job, node) {
  const h = job.heap;
  let i = h.length;
  h.push(node);
  while (i) {
    const p = (i - 1) >> 1;
    if (h[p].f <= node.f) break;
    h[i] = h[p];
    i = p;
  }
  h[i] = node;
}
function worldNavPop(job) {
  const h = job.heap,
    first = h[0],
    last = h.pop();
  if (!h.length) return first;
  let i = 0;
  while (i * 2 + 1 < h.length) {
    let c = i * 2 + 1;
    if (c + 1 < h.length && h[c + 1].f < h[c].f) c++;
    if (h[c].f >= last.f) break;
    h[i] = h[c];
    i = c;
  }
  h[i] = last;
  return first;
}
function worldNavStart(from, to) {
  const a = worldNavAnchor(from),
    b = worldNavAnchor(to),
    job = { from, to, heap: [], nodes: new Map(), closed: new Set(), done: false, path: null };
  if (!a || !b) {
    job.done = true;
    return job;
  }
  job.target = b;
  const n = { ...a, g: 0, f: Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy), parent: null };
  job.nodes.set(a.gx + ',' + a.gy, n);
  worldNavPush(job, n);
  return job;
}
function worldNavAdvance(job, limit = 128, deadline = performance.now() + 2) {
  let count = 0;
  while (!job.done && job.heap.length && count++ < limit) {
    if (performance.now() >= deadline) break;
    const n = worldNavPop(job),
      key = n.gx + ',' + n.gy;
    if (job.closed.has(key)) continue;
    job.closed.add(key);
    if (n.gx === job.target.gx && n.gy === job.target.gy) {
      const path = [job.to];
      for (let p = n; p; p = p.parent) path.push({ x: p.x, y: p.y });
      path.reverse();
      // Keep turns, remove collinear grid points only (never cut obstacle corners).
      job.path = path.filter(
        (p, i) =>
          !i ||
          i === path.length - 1 ||
          Math.abs((p.x - path[i - 1].x) * (path[i + 1].y - p.y) - (p.y - path[i - 1].y) * (path[i + 1].x - p.x)) > 1e-8
      );
      job.done = true;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1]
    ]) {
      const gx = n.gx + dx,
        gy = n.gy + dy,
        k = gx + ',' + gy;
      if (gx < -127 || gx > 126 || gy < -127 || gy > 126 || job.closed.has(k)) continue;
      const g = n.g + 1,
        old = job.nodes.get(k);
      if (old && old.g <= g) continue;
      const q = { gx, gy, x: (gx + 0.5) / 4, y: (gy + 0.5) / 4, g, parent: n };
      if (!worldNavClear(n, q)) continue;
      q.f = g + Math.abs(gx - job.target.gx) + Math.abs(gy - job.target.gy);
      job.nodes.set(k, q);
      worldNavPush(job, q);
    }
  }
  if (!job.heap.length) job.done = true;
  return count;
}
function worldWorkerStep(s, p, dt) {
  const key = p.x + ',' + p.y;
  if (s.goalKey !== key) {
    s.goalKey = key;
    s.route = [];
    s.nav = null;
    s.retry = 0;
    s.mode = 'walk';
    s.stuckMs = 0;
  }
  if (s.delay > 0) {
    s.delay -= dt;
    return;
  }
  s.hidden = false;
  if (s.mode === 'work' || s.mode === 'wait') return;
  if (!s.route.length) {
    if (Math.hypot(s.x - p.x, s.y - p.y) < 0.02) {
      s.mode = p.mineId ? 'work' : 'wait';
      s.dir = p.dir;
      return;
    }
    if (s.retry > 0) {
      s.retry -= dt;
      return;
    }
    if (TD.navBudget <= 0 || performance.now() >= TD.navDeadline) return;
    if (!s.nav) s.nav = worldNavStart(s, p);
    if (TD.navBudget > 0) {
      TD.navBudget -= worldNavAdvance(s.nav, Math.min(64, TD.navBudget), TD.navDeadline);
    }
    if (!s.nav.done) return;
    if (!s.nav.path) {
      s.nav = null;
      s.retry = 1000;
      return;
    }
    s.route = s.nav.path;
    s.nav = null;
  }
  let budget = (TD_WORKER.WALK_SPEED * dt) / 1000;
  while (budget > 1e-6 && s.route.length) {
    const wp = s.route[0],
      d = Math.hypot(wp.x - s.x, wp.y - s.y);
    if (d < 0.01) {
      s.route.shift();
      continue;
    }
    const len = Math.min(budget, TD_WORKER.SUB_STEP, d),
      ux = (wp.x - s.x) / d,
      uy = (wp.y - s.y) / d;
    const n = worldStepFoot(s.x, s.y, ux, uy, len, { extra: [tdWorkerPlayerBox()] });
    const moved = Math.hypot(n.x - s.x, n.y - s.y);
    s.x = n.x;
    s.y = n.y;
    s.walked += moved;
    budget -= len;
    if (Math.abs(ux) > 0.3) s.dir = ux > 0 ? 'right' : 'left';
    if (moved < len * 0.3) {
      s.stuckMs += dt;
      if (s.stuckMs > 900) {
        s.route = [];
        s.nav = null;
        s.retry = 300;
        s.stuckMs = 0;
      }
      break;
    }
    s.stuckMs = 0;
  }
}
