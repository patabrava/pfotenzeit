import { defineConfig } from 'vite';

// Relative base so the build also works under sub-directory hosting (see 16_ASSET_PRODUCTION).
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    // Vite manifest lets the service worker (src/sw.ts) precache the hashed shell atomically (D-031).
    manifest: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        sw: 'src/sw.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          return undefined;
        },
      },
    },
  },
});
