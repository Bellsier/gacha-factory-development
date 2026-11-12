---
name: mining-workshop-playthrough
description: Use when writing, running or debugging a real-play browser test of 《채굴 공방》 (tests/playthrough/*.spec.cjs, Playwright) — proving a gameplay, touch, joystick, button, panel, keyboard or save behaviour in Chromium on PC and phone viewports, reproducing a bug only seen on mobile, or when a playthrough spec fails, is flaky, or passes on code that should fail.
---

# 채굴 공방 실제 플레이 검사

## Overview

`tests/playthrough/` (stacked PRs from #29; not on `develop` yet — `ls tests/playthrough` first) drives the real game
in Chromium with real input and writes a Korean stage report. **Core principle:** a check proves a behaviour only if it
asserts the game's resulting state and where the input landed, and it fails on the code before the fix.

**REQUIRED SUB-SKILL:** `mining-workshop-qa` for the other checks and the report format.

## The harness

| File | Use |
|---|---|
| `tests/playthrough.config.cjs` | projects `pc` (1280×800) and `mobile` (Pixel 7 at 390×844, touch); local server `127.0.0.1:4177` (`server.cjs`); 1 worker, no retries; output `work/playthrough/` |
| `fixtures.cjs` | `test`, `expect` and the `qa` fixture (below). Fails the test on any `pageerror`, `console.error` or unannounced dialog |
| `navigation.cjs` | `holdDirection(page, dir, mobile, until)`, `walkToMine(page, mineId, mobile)`: real keys on PC, CDP touch on the stick on mobile |
| `checkpoint.cjs` | `prepareSupplies(page)`: the one allowed supply preparation for long journeys |
| `save-wait.cjs` | `commitReady(record, want)`: when the autosave really committed (revision, not just gold) |
| `hud-geometry.cjs` | rendered HUD boxes, read-only |

`qa` fixture: `boot()` (opens the game, waits for `GameBootstrap.state === 'ready'`), `step(id, 한국어 제목, fn)` (one
report stage + PNG), `press(selector)` / `activate(locator)` (tap on mobile, click on PC), `tab(name)`,
`audit(label)` (occlusion and 44px touch-size findings), `confirm()` (the next dialog is expected and accepted),
`report.preparation` (say exactly what a fixture set up), `note()`, `finding()`.

New spec: copy the shape of `action-button-panel.spec.cjs` (`'use strict'`, `require('./fixtures.cjs')`, one `test`
with `qa.step`s). Phone-only checks: `test.skip(testInfo.project.name !== 'mobile', '이유')`.

## Real input recipes

- **Tap / click / keys:** `locator.tap()` (mobile), `locator.click()`, `page.keyboard.press('Enter')`.
- **Touch with fingers you control** (stick + button, two fingers, cancel, slide off):
  ```js
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [stick]);                 // stick = { x, y, id: 1 }
  await touch('touchStart', [stick, button]);         // a second finger
  await touch('touchEnd', [button]);                  // lifts only the listed finger; stick stays down
  await touch('touchEnd', [stick]);
  ```
  `touchMove` with a changed point moves a finger; `touchCancel` cancels. Record `touchend` events if the order matters.
- **Pen:** `cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed' | 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'pen' })`.
- Game functions may be **wrapped to count calls** (observe only). Never replace game logic to make a step pass; if a
  fixture forces a mode or state, write it in `report.preparation` and keep at least one step without it.

## What makes a check trustworthy

1. **Assert outcomes, not calls.** Compare game state before/after (gold, products, checkboxes, open cards, torches…)
   and record every `click` in the document (capture listener) to see where input landed. Leave out values that change
   by themselves every tick (raw resources).
2. **Exactly once:** wait ~350 ms after the input for a late click or a duplicate run, then count.
3. **Positions depend on the village.** The world differs per new village, so find a spot with the game's own
   predicates (`playerCanStand`, `tdInteractTarget`, `torchPlaceProblem`, …), assert one was found, then act. A fixed
   offset that worked once fails on CI.
4. **Prove it fails without the fix:** run the spec on the parent commit (a `git worktree` of `fix^`, with a
   `node_modules` symlink), and/or undo one part of the fix at a time; each must fail at the step that covers it.
5. **Repeat:** `--repeat-each=5` (or more) for anything touching timing or input.
6. Run both projects; a phone-only spec that shows `skipped` on mobile checked nothing.

## Running it here

```bash
CHROMIUM=/opt/pw-browsers/chromium QA_VIDEO=off npx playwright test -c tests/playthrough.config.cjs \
  --project=mobile action-button-panel            # one spec, one project; drop both filters for the full run
```

- `CHROMIUM` is required in this container (pre-installed Chromium 1243, Playwright expects 1194; never `playwright
  install`). `QA_VIDEO=off` only saves time and disk; CI records video.
- Port 4177 must be free (`reuseExistingServer: false`). The full run takes ~8 min (pc + mobile).
- Results: `work/playthrough/summary.md` (Korean stages), `evidence/<test>/` (stage PNGs, `trace.zip`,
  `browser-errors.json`). Each run overwrites them — copy what you need first.
  Trace: `npx playwright show-trace work/playthrough/evidence/<test>/trace.zip`.

## Common mistakes (seen in this project)

| Symptom | Cause / fix |
|---|---|
| Passes before the fix too | Asserted call counts or a default context; check state and event targets, and force the failing condition (a plain touch context reproduced the lost click) |
| CI fails at a step that passes locally (`탭 1회(놓기)` 0) | Spot chosen by offset was not valid in that village: search with the game's predicates |
| State comparison fails at random | A self-growing value (raw resources) is in the snapshot |
| Panel check measured the wrong element | The log panel is `body.td-log-open #logSection`, tab panels `.tab-panel.active` |
| Long sweep times out (180 s) | Coarser step (below the 44 px control size) and `test.setTimeout` for that test only |
| `waitForFunction` with an async predicate never waits | It is always truthy; poll from Node with `expect.poll` |
