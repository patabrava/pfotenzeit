import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const assetVersion = createHash('sha256').update(readFileSync(new URL('./public/assets/manifest.json', import.meta.url))).digest('hex').slice(0,16);

// Relative base so the build also works under sub-directory hosting (see 16_ASSET_PRODUCTION).
export default defineConfig({
  base: './',
  define: { __PZ_ASSET_VERSION__: JSON.stringify(assetVersion) },
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
