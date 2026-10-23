import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json "paths": "@/..." is "src/...".
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Server-only modules are tested directly in Node; the guard package only matters in client bundles.
      'server-only': fileURLToPath(new URL('./tests/unit/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/contract/**/*.test.ts'],
  },
});
