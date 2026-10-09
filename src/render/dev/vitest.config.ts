/** Renderer checks (WP-D). Run: npx vitest run --config src/render/dev/vitest.config.ts */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/render/dev/*.check.ts'], environment: 'node', watch: false },
});
