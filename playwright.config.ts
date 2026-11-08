import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './browser-tests', testMatch: '*.spec.ts', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4176', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite --config browser-tests/fixture/vite.config.ts', url: 'http://127.0.0.1:4176', reuseExistingServer: false },
  projects: [
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'edge', use: { browserName: 'chromium', channel: 'msedge' } },
    { name: 'firefox', use: { browserName: 'firefox', launchOptions: { firefoxUserPrefs: { 'accessibility.tabfocus': 7 } } } },
    { name: 'webkit-engine', use: { browserName: 'webkit' } },
  ], reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
});
