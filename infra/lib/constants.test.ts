import { describe, expect, it } from 'vitest';
import { GITHUB_BRANCH, GITHUB_REPO, WEB_BUCKET_PREFIX } from './constants.js';

describe('constants', () => {
  it('規約どおりの値を持つ', () => {
    expect(GITHUB_REPO).toBe('naota444/Kiroween');
    expect(GITHUB_BRANCH).toBe('main');
    expect(WEB_BUCKET_PREFIX).toBe('doodle-nearby-web-');
  });
});
