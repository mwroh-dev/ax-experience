import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../cs-ops-core/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3100',
      '/admin': 'http://localhost:3100',
      '/commerce': 'http://localhost:3100',
    },
  },
});
