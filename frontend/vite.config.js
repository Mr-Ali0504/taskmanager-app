import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// =============================================================================
// Vite Configuration
// Reference: https://vitejs.dev/config/
//
// Vite is a modern build tool and dev server for frontend projects.
// It's much faster than Create React App because it uses native ES modules.
// =============================================================================

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,

    // The proxy setting is KEY for local development:
    // When the frontend code calls '/api/tasks', Vite forwards it to the backend.
    // This means you don't need to hardcode 'http://localhost:5000' everywhere,
    // and it avoids CORS issues in development.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    // Where Vite puts the built files (used by the Nginx Docker container)
    outDir: 'dist',
  },
});
