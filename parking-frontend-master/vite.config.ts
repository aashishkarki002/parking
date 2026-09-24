import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' instead of 'autoUpdate': this app is full of data-entry forms
      // (sessions, billing, tenants), so we ask before reloading rather than
      // refreshing out from under someone mid-form. See src/components/pwa/ReloadPrompt.tsx.
      registerType: 'prompt',
      injectRegister: null, // registration happens in src/main.tsx via useRegisterSW
      manifest: {
        name: 'Parking App - Sallyan House',
        short_name: 'Parking',
        description: 'Manage parking properties, sessions, tenants and billing for Sallyan House.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#3d1112',
        background_color: '#edeae5',
        lang: 'en',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Dashboard', url: '/dashboard' },
          { name: 'Sessions', url: '/sessions' },
          { name: 'Properties', url: '/properties' },
        ],
      },
      workbox: {
        // App shell, fonts and UI images (the login logo, print logo, table
        // placeholders) so the whole thing renders offline. The webmanifest and
        // its icons are added by the plugin automatically.
        globPatterns: [
          '**/*.{js,css,html,ico,woff,woff2}',
          'apple-touch-icon.png',
          'images/**/*.{png,svg}',
        ],
        // 500 KB of cookie-banner art nobody needs on first load; the runtime
        // image cache below picks it up if it's ever shown.
        globIgnores: ['**/cookieImage.png'],
        // MUI + recharts + xlsx produce chunks bigger than the 2 MiB default.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        // /admin and /static are served by Django (see the dev proxy below), and
        // API calls must never resolve to the SPA shell.
        navigateFallbackDenylist: [/^\/admin/, /^\/static/, /^\/api/, /^\/media/],
        runtimeCaching: [
          {
            // Images from /public that aren't precached (logos, placeholders).
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'parking-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
        // API responses are user-scoped and time-sensitive (live sessions,
        // balances) - deliberately not cached.
      },
      devOptions: {
        // Flip to true to exercise the service worker with `npm run dev`.
        // Off by default so dev reloads never serve stale assets.
        enabled: false,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // Mirror the deployed reverse proxy: /admin and /static (Django admin
    // assets) are served by the Django backend, not the SPA.
    proxy: {
      '/admin': 'http://localhost:8000',
      '/static': 'http://localhost:8000',
    },
  },
});
