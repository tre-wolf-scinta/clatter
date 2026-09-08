import { defineConfig } from '@playwright/test'

// The e2e suite runs its own dev server on 5174, never the interactive one on 5173,
// so a stale or half-reloaded dev server can never make a test pass or fail.
const PORT = 5174

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
