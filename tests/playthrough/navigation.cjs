'use strict';
// Observation plans a short route; all movement goes through trusted browser input.
// No player position, held-key state, game function, or simulation tick is written here.
async function holdDirection(page, direction, mobile, until) {
  const keys = { up: 'w', down: 's', left: 'a', right: 'd' };
  if (!mobile) {
    await page.keyboard.down(keys[direction]);
    try { await until(); } finally { await page.keyboard.up(keys[direction]); }
    return;
  }
  const box = await page.locator('#tdStick').boundingBox();
  if (!box) throw new Error('모바일 조이스틱이 표시되지 않습니다.');
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + dx * 40, y: center.y + dy * 40, id: 1 }] });
    await until();
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
}

async function walkToMine(page, mineId, mobile) {
  const route = await page.evaluate(id => {
    const start = state.world.player, step = 0.3, queue = [{ ix: 0, iy: 0, prev: -1 }], seen = new Set(['0,0']);
    let found = -1;
    for (let i = 0; i < queue.length && i < 20_000; i++) {
      const at = queue[i], x = start.x + at.ix * step, y = start.y + at.iy * step;
      if (tdInteractTarget(x, y)?.id === id) { found = i; break; }
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const ix = at.ix + dx, iy = at.iy + dy, key = ix + ',' + iy;
        if (seen.has(key)) continue;
        seen.add(key);
        const nx = start.x + ix * step, ny = start.y + iy * step;
        if (Math.abs(nx) > 10 || Math.abs(ny) > 10 || !playerCanStand(nx, ny)) continue;
        queue.push({ ix, iy, prev: i });
      }
    }
    if (found < 0) throw new Error('입력 이동으로 광맥에 도달하는 경로를 찾지 못함: ' + id);
    const points = [];
    while (queue[found].prev >= 0) {
      const p = queue[found]; points.push({ x: start.x + p.ix * step, y: start.y + p.iy * step }); found = p.prev;
    }
    return points.reverse().filter((point, i, all) => i === all.length - 1 || i === 0 ||
      Math.abs((all[i + 1].x - point.x) - (point.x - all[i - 1].x)) > 0.01 ||
      Math.abs((all[i + 1].y - point.y) - (point.y - all[i - 1].y)) > 0.01);
  }, mineId);
  for (const target of route) {
    const current = await page.evaluate(() => ({ ...state.world.player }));
    const axis = Math.abs(target.x - current.x) > Math.abs(target.y - current.y) ? 'x' : 'y';
    const diff = target[axis] - current[axis];
    if (Math.abs(diff) < 0.16) continue;
    const direction = axis === 'x' ? (diff > 0 ? 'right' : 'left') : (diff > 0 ? 'down' : 'up');
    await holdDirection(page, direction, mobile, () => page.waitForFunction(({ axis, goal, sign }) =>
      (state.world.player[axis] - goal) * sign >= -0.12,
    { axis, goal: target[axis], sign: Math.sign(diff) }, { timeout: 6000 }));
  }
  await page.waitForFunction(id => tdInteractTarget(state.world.player.x, state.world.player.y)?.id === id, mineId);
  return route;
}
module.exports = { holdDirection, walkToMine };
