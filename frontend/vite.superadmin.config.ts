import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { buildSecurityHeaders } from './src/security-headers';

/**
 * Serves the platform portal from the root of its own dev server so it has a
 * genuinely different URL from the tenant workspace (port 3000).
 */
function servePortalAtRoot(): Plugin {
  return {
    name: 'voogyo-serve-platform-portal-at-root',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          req.url = '/superadmin.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), servePortalAtRoot()],
  // The tenant app's dev server pre-bundles dependencies into node_modules/.vite.
  // Sharing that folder, whichever server starts second overwrites the other's
  // bundles, and the first then answers 504 (Outdated Optimize Dep).
  cacheDir: 'node_modules/.vite-superadmin',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-superadmin',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'superadmin.html'),
    },
  },
  server: {
    port: 3100,
    host: true,
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
    port: 3100,
    // Preview serves the real build, so use the production policy.
    headers: buildSecurityHeaders({ allowViteDevServer: false }),
  },
});
