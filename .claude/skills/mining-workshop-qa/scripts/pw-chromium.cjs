'use strict';
// Preload for running this repository's browser tests in a container whose pre-installed Chromium is not the
// revision the project's Playwright expects (claude.ai cloud sessions: /opt/pw-browsers/chromium).
// Usage, from the repository root:  node -r ./.claude/skills/mining-workshop-qa/scripts/pw-chromium.cjs tests/browser-smoke.cjs
// It changes nothing in the repository: it only points chromium.launch and chromium.launchPersistentContext of the
// project's own Playwright at that browser (both are needed: tests/save-s2-browser.cjs restarts a persistent profile).
// Browser path: $CHROMIUM if set, else /opt/pw-browsers/chromium.
const executablePath = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const pw = require(require.resolve('playwright', { paths: [process.cwd()] }));
const withBrowser = (o = {}) => ({ ...o, executablePath, args: [...(o.args || []), '--no-sandbox'] });
const launch = pw.chromium.launch.bind(pw.chromium);
const persistent = pw.chromium.launchPersistentContext.bind(pw.chromium);
pw.chromium.launch = (o) => launch(withBrowser(o));
pw.chromium.launchPersistentContext = (dir, o) => persistent(dir, withBrowser(o));
