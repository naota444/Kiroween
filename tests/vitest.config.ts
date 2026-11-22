import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'repo',
    include: ['repo/**/*.test.ts'],
  },
});
