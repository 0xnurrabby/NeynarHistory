import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as httpsImportsNS from 'vite-plugin-https-imports';

const httpsImports: any = (httpsImportsNS as any).default ?? (httpsImportsNS as any);

export default defineConfig({
  plugins: [
    // Bundles https://esm.sh/* imports at build time (but leaves them as-is in dev)
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
