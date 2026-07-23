import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
