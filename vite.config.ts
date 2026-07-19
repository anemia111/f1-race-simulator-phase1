import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
