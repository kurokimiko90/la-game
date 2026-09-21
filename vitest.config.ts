import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.{ts,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'scripts/lib/**/*.mjs'],
      exclude: ['src/lib/types.ts', 'src/lib/audio.ts'],
    },
  },
});
