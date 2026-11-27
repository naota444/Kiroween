import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { coreAlias } from '../../vitest.shared';

// coreAlias はルートだけを指す(文字列の前方一致で /testing も巻き込む)。
// 契約テスト用の ./testing は、より具体的な別名を先に置いて src から解決する
const coreTestingEntry = fileURLToPath(
  new URL('../../packages/core/src/testing/index.ts', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@doodle-nearby\/core\/testing$/, replacement: coreTestingEntry },
      ...Object.entries(coreAlias).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  test: {
    name: 'lambdas',
    include: ['src/**/*.test.ts'],
  },
});
