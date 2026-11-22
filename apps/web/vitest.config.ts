import { defineConfig } from 'vitest/config';
import { coreAlias } from '../../vitest.shared';

export default defineConfig({
  resolve: { alias: coreAlias },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
