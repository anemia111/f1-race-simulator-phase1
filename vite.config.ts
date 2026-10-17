// vitest's defineConfig is vite's with the `test` block typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const builtAt = new Date().toISOString()
const buildId = `${process.env.VITE_APP_RELEASE_ID ?? 'local'}-${builtAt}`

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(buildId) },
  test: {
    // A Claude Code worktree lives at .claude/worktrees/<name> inside the
    // repository. Without this exclusion its copy of every suite is collected
    // as well, so `npm test` runs each file twice against two different
    // commits' sources and reports the other commit's failures as ours.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
  plugins: [
    {
      name: 'simulator-build-identity',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build-info.json',
          source: JSON.stringify({ buildId, builtAt }) })
      },
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          if (/\/(?:sw\.js|build-info\.json)(?:\?|$)/.test(request.url ?? '') ||
              request.headers.accept?.includes('text/html')) response.setHeader('Cache-Control', 'no-store')
          next()
        })
      },
    },
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
      // Activate assets immediately; reload only through the app's update action.
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{css,html,js,json}'],
        globIgnores: ['**/build-info.json'],
        maximumFileSizeToCacheInBytes: 2_500_000,
        runtimeCaching: [{
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'formula-simulator-pages', networkTimeoutSeconds: 4,
            precacheFallback: { fallbackURL: 'index.html' },
          },
        }],
      },
    }),
  ],
})
