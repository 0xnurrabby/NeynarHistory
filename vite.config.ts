import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import httpsImports from 'vite-plugin-https-imports';

export default defineConfig({
  plugins: [
    httpsImports(),
    react()
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
