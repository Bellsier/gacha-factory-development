# World expansion stage3 implementation plan

> For agentic workers: execute sequentially with superpowers:executing-plans. User approved the eight tasks on 2026-10-19; no further approval needed for implementation, isolated branch or Draft PR.

Goal: deterministic 256×256 test world preserving legacy play.
Architecture: pure absolute-coordinate generator → runtime composition/data cache → existing rendering, collision and gameplay. Versioned edits are projected into a separate test save.
Tech stack: existing classic JavaScript, jsdom, Node tests, Playwright Chromium.
Spec: ../specs/2026-10-19-worldgen-stage3.md

## Global constraints
- 256 only; no 2048 activation, Pages changes, merges or graphics/character changes.
- Legacy save immutable in test mode. Test teleport only with ?worldgen=256.
- Verify each feature; whole regression last. Record failures and emulation limitations.

## Review focus
- Negative coordinates and partial legacy chunks: task2/4.
- Outer coordinates clamped by old loader: task3.
- ID collisions or unsupported generator versions deleting progress: task3/5.
- Worker reference or secured state lost on regeneration: task5.
- Save quota/failure and old-key overwrite: task3/6.

## Tasks
1. Baseline: exact SHA, isolated branch, instructions, existing regression/smoke, fixture baseline.
2. Generator: chunkHash, sampleGeneratedTile, generateWorldChunk. Test seed0/max, all64 chunks in100 seeds, order, ownership, golden hashes. RED→GREEN then commit.
3. Saves: worldContext, worldBounds, serializeRunForSave, separate key/version/edits validation, outer position. RED→GREEN then commit.
4. Composition: worldChunk, legacy adapter, bounds, texture anchoring, independent caches. Test legacy tiles/feet/pixels and four-chunk pixel composition. RED→GREEN then commit.
5. Gameplay: materializeChunkEntities, recordGeneratedMineEdit, scenery/collision/index; discovered/secured/resource persistence and derived worker references. RED→GREEN then commit.
6. Browser: trial controls, keyboard/touch movement, mining, reload, original storage immutability, console errors; actual screenshots.
7. Performance: repeatable cold/warm, per-chunk generation and data memory, frame/long-task/canvas capture in three profiles at1×/4×. Store rawJSON and screenshots.
8. Final: full regression, asset/workflow diff check, fresh whole-branch review, fixes with tests, official GitHub branch+DraftPR and report.

Commands: npm test; node --test tests/worldgen-stage3*.test.cjs; node tests/browser-smoke.cjs; node tests/worldgen-stage3-browser.cjs; node tools/measure-worldgen-stage3.cjs.
Environment adaptations: --test-isolation=none for sandboxed Node; --max-old-space-size=6144 for baseline regression retaining many jsdom windows; system Chromium via CHROMIUM_PATH or /usr/bin/chromium. These do not change game behavior.
