// vitest's defineConfig is vite's with the `test` block typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    // A Claude Code worktree lives at .claude/worktrees/<name> inside the
    // repository. Without this exclusion its copy of every suite is collected
    // as well, so `npm test` runs each file twice against two different
    // commits' sources and reports the other commit's failures as ours.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
  plugins: [
    react(),
    VitePWA({
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        background_color: '#050607',
        description:
          'PC-first F1, F2, F3, and SUPER FORMULA race control, timing, strategy, and 3D simulation.',
        display: 'standalone',
        icons: [
          {
            purpose: 'any',
            sizes: 'any',
            src: 'favicon.svg',
            type: 'image/svg+xml',
          },
        ],
        id: './',
        lang: 'ja',
        name: 'Formula Race Simulator',
        orientation: 'landscape',
        scope: './',
        short_name: 'Formula Simulator',
        start_url: './',
        theme_color: '#050607',
      },
      // Activate new caches immediately. registerAppUpdater suppresses the
      // automatic page reload, so an active race keeps running while the next
      // desktop launch or navigation receives the latest published build.
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{css,html,js,json}'],
        maximumFileSizeToCacheInBytes: 2_500_000,
        navigateFallback: 'index.html',
      },
    }),
  ],
})
