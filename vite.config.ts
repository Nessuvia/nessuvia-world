import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Written out under the name index.html already links, replacing the hand-written
      // public/site.webmanifest that used to live there.
      manifestFilename: 'site.webmanifest',
      manifest: {
        name: 'Xenia Nessuvia',
        short_name: 'Xenia',
        display: 'standalone',
        // Baked in when the app is installed and not re-read on a palette swap, so these are the
        // Default palette's background rather than anything live. theme_color is the status bar
        // until the page loads and themeColor.ts takes over; background_color is the splash screen,
        // and is what Chrome seeds the Android navigation bar from at launch.
        theme_color: '#101014',
        background_color: '#101014',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // The tokenizer BPE table is ~2 MB; the default 2 MiB cap would drop it from precache.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // Dev half of the /aicc/ card download; src/index.js is the Worker half that serves a build.
    // aicharactercards.com sends no CORS header, so the browser can't fetch it directly.
    proxy: {
      '/aicc': {
        target: 'https://aicharactercards.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/aicc/, '/wp-json/pngapi/v1/image'),
      },
    },
  },
  build: {
    // Sized to clear the one chunk that is legitimately huge: the tokenizer's BPE table
    // (~2 MB, see core/prompt/budget.ts), which loads on demand and never blocks first paint.
    // Every other chunk is under 400 kB, so anything approaching this limit is a regression.
    chunkSizeWarningLimit: 2100,
    rollupOptions: {
      output: {
        // Framework in its own chunk so app edits don't re-hash it.
        manualChunks(id: string) {
          if (/node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler|dexie|zustand)[\/]/.test(id)) {
            return 'vendor'
          }
        },
      },
    },
  },
})
