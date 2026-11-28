import { describe, expect, it } from 'vitest';
import {
  CONNECTION_TTL_SECONDS as INFRA_CONNECTION_TTL_SECONDS,
  TTL_MARGIN_SECONDS as INFRA_TTL_MARGIN_SECONDS,
} from '../../infra/lib/constants.js';
import {
  CONNECTION_TTL_SECONDS,
  TTL_MARGIN_SECONDS,
} from '../../backend/lambdas/src/ttl-constants.js';

describe('ttl-constants', () => {
  it('backend/lambdas の TTL_MARGIN_SECONDS が infra/lib/constants.ts と一致する', () => {
    expect(TTL_MARGIN_SECONDS).toBe(INFRA_TTL_MARGIN_SECONDS);
  });

  it('backend/lambdas の CONNECTION_TTL_SECONDS が infra/lib/constants.ts と一致する', () => {
    expect(CONNECTION_TTL_SECONDS).toBe(INFRA_CONNECTION_TTL_SECONDS);
  });
});
