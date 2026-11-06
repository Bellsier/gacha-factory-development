'use strict';
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');
const output = path.resolve(__dirname, '../work/playthrough');
module.exports = defineConfig({
  testDir: path.join(__dirname, 'playthrough'),
  testMatch: '**/*.spec.cjs',
  outputDir: path.join(output, 'evidence'),
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(output, 'html'), open: 'never' }],
    ['json', { outputFile: path.join(output, 'playwright.json') }],
    [path.join(__dirname, 'playthrough/reporter.cjs'), { output }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    browserName: 'chromium',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'on',
    video: process.env.QA_VIDEO === 'off' ? 'off' : 'on',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    launchOptions: process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] } : {},
  },
  projects: [
    { name: 'pc', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node tests/playthrough/server.cjs',
    url: 'http://127.0.0.1:4177/__qa_source',
    reuseExistingServer: false,
    timeout: 15_000,
    cwd: path.resolve(__dirname, '..'),
  },
});
