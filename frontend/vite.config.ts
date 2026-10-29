import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { buildSecurityHeaders } from './src/security-headers';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    // Match production so a policy violation shows up locally, not in prod.
    headers: buildSecurityHeaders({ allowViteDevServer: true }),
    proxy: {
      '/api': {
        // Override with API_PROXY_TARGET when the backend runs on another port.
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: true,
    headers: buildSecurityHeaders({ allowViteDevServer: false }),
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
