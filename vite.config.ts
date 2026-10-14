import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built site works at the root or under a
  // sub-folder such as GitHub Pages' /dicecaller/ without any other change.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
})
