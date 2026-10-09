import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    // Full Chromium build (new headless), not chromium-headless-shell.
    channel: 'chromium',
    hasTouch: true,
    baseURL: 'http://localhost:8000',
    launchOptions: {
      args: [
        // Put the 127.0.0.1 iframe in its own renderer process (OOPIF).
        '--site-per-process',
        '--isolate-origins=http://127.0.0.1:8000,http://localhost:8000',
        // Give the input pipeline a touch device, so Input.dispatchTouchEvent is
        // delivered as touch (needed for --headed runs).
        '--touch-events=enabled',
      ],
    },
  },
  webServer: {
    command: 'node server.mjs',
    url: 'http://localhost:8000',
    reuseExistingServer: true,
  },
});
