# Approved G3 B implementation plan

Goal: apply the user's approved B house, improving mobile porch readability.
Spec: docs/design/graphics-g3-house/G3_REPORT.md and the resumption request.
Architecture: a shared art-only finishing function takes each style's own house.
Tech stack: existing JavaScript canvas sprite pipeline; no new dependencies.
Constraints: 84×73, anchor (42,70), original protected door/step/window/lantern/shadow pixels; preserve state, collision, interior, saveVersion 1, G2/G4. Keep the original proposal evidence unchanged.
Review focus: classic/v2 identity; DPR3 mobile day/dusk readability; high resolution path; actual production boot; home interaction and save roundtrip.

- [x] Add protected-pixel hash and porch visibility checks in tests/chunks/19.js; watch new visibility checks fail.
- [x] Implement tdHouseDomesticSprite(sprite) in sprites.js and use it at the end of classic/v2 generators. Retain B's original shapes; brighten seat rim, deepen leg silhouette and separate terracotta rim from leaves.
- [x] Run full regression, unchanged browser smoke and CI Biome checks. Verify production house and actual localStorage roundtrip in Chromium, classic/v2 and mobile/PC day/dusk; save only new final evidence.
- [ ] Review complete diff, update existing PR #27, push same branch, wait for every CI check. Merge only after passing tests, then inspect configured deployment and resulting revision without changing hosting settings.

Execution: continue inline in the existing requested branch; the user explicitly requests continuation of the approved design, no regenerated alternatives or approval loop.
