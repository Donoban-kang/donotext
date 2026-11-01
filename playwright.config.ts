import { defineConfig } from '@playwright/test'

// Browser-mode E2E: the renderer runs on the Vite dev server with a mocked window.api.
// Set PW_CHROMIUM_PATH to use a pre-installed Chromium binary.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
  },
  webServer: {
    command: 'npm run dev:web',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000
  }
})
