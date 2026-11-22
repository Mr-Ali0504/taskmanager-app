import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the UI runs on :5173 and proxies API calls to the server on :8787.
// In production the server serves the built UI itself, so there is one process and one port.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
  // Test files share one data folder (database and encryption key), so they run one after another.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', fileParallelism: false, env: { DATA_DIR: './.test-data', META_GRAPH_VERSION: 'v26.0' } },
});
