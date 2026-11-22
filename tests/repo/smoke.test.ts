import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repo smoke', () => {
  it('ルートの workspaces に 5 パッケージがある', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { workspaces: string[] };
    expect(pkg.workspaces).toHaveLength(5);
  });
});
