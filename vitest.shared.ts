import { fileURLToPath } from 'node:url';

// ビルド前でも core を src から解決する
export const coreAlias = {
  '@doodle-nearby/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
};
