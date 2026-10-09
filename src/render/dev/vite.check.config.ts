/**
 * Builds the renderer checks as a Node bundle (fallback when vitest cannot start in the sandbox).
 *   npx vite build --config src/render/dev/vite.check.config.ts && node node_modules/.cache/render-check/check.entry.js
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('../../..', import.meta.url));
/** CHECK_ENTRY=snapshots builds the PNG snapshot script instead of the checks. */
const entry = process.env.CHECK_ENTRY === 'snapshots' ? 'snapshots.entry' : 'check.entry';

export default defineConfig({
  root,
  logLevel: 'warn',
  resolve: { alias: { vitest: fileURLToPath(new URL('./miniTest.ts', import.meta.url)) } },
  define: { 'import.meta.env.BASE_URL': JSON.stringify('./') },
  build: {
    ssr: `src/render/dev/${entry}.ts`,
    outDir: 'node_modules/.cache/render-check',
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    rollupOptions: { output: { entryFileNames: `${entry}.js` } },
  },
  ssr: { noExternal: ['three'] },
});
