import { defineConfig } from 'vitest/config';
import { coreAlias } from '../../vitest.shared';

export default defineConfig({
  resolve: { alias: coreAlias },
  test: {
    name: 'local-server',
    include: ['src/**/*.test.ts'],
  },
});
