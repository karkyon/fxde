import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:       './e2e',
  fullyParallel: false,
  retries:       process.env.CI ? 2 : 0,
  workers:       1,

  use: {
    baseURL:    'http://localhost:5173',
    screenshot: 'only-on-failure',
    video:      'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});