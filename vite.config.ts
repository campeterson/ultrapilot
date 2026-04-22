import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { version } from './package.json'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Use the existing manifest.json from public/
      manifest: false,
      workbox: {
        cacheId: version,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        globIgnores: ['sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Protomaps hosted PMTiles archive (vector basemap). PMTiles serves
            // 206 Partial Content from HTTP range requests, so include 206.
            urlPattern: /^https:\/\/api\.protomaps\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ultrapilot-protomaps-v1',
              cacheableResponse: { statuses: [0, 200, 206] },
            },
          },
          {
            // Protomaps glyph fonts and sprites (served from GitHub Pages).
            urlPattern: /^https:\/\/protomaps\.github\.io\/basemaps-assets\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ultrapilot-protomaps-assets-v1',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
