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
          'PC-first Formula 1 race control, timing, strategy, and 3D simulation.',
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
        name: 'F1 Race Simulator',
        orientation: 'landscape',
        scope: './',
        short_name: 'F1 Simulator',
        start_url: './',
        theme_color: '#050607',
      },
      // Install updates in the background, then activate after the current
      // race tab closes so a deployment can never reload a live session.
      registerType: 'prompt',
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{css,html,js,json}'],
        maximumFileSizeToCacheInBytes: 2_500_000,
        navigateFallback: 'index.html',
      },
    }),
  ],
})
