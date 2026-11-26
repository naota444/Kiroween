import { describe, expect, it } from 'vitest';
import { PARTICIPANT_COLORS, PARTICIPANT_ICONS, type ParticipantIdentity } from './messages.js';
import { pickIdentity } from './participant-identity.js';

describe('pickIdentity (smoke)', () => {
  it('使用済みでない識別を返す', () => {
    const taken: ParticipantIdentity[] = [{ color: 'red', icon: 'cat' }];
    const picked = pickIdentity(taken, () => 0);
    expect(picked).not.toBeNull();
    expect(picked).not.toEqual(taken[0]);
  });

  it('96 通りすべて使用済みなら null', () => {
    const all = PARTICIPANT_COLORS.flatMap((color) =>
      PARTICIPANT_ICONS.map((icon) => ({ color, icon })),
    );
    expect(all).toHaveLength(96);
    expect(pickIdentity(all, () => 0.5)).toBeNull();
  });
});
