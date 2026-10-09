import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // PFZ_NO_DOM=1 skips DOM-environment tests (needed inside the Claude sandbox, see docs/DECISIONS.md D-027).
    exclude: ['tests/e2e/**', 'node_modules/**', ...(process.env.PFZ_NO_DOM ? ['tests/**/*.dom.test.ts'] : [])],
    environment: 'node',
    watch: false,
    restoreMocks: true,
  },
});
