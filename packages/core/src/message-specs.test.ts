import { describe, expect, it } from 'vitest';
import { MESSAGE_SPECS } from './message-specs.js';

describe('MESSAGE_SPECS', () => {
  it('lists all 8 message types', () => {
    expect(MESSAGE_SPECS.map((s) => s.typeName).sort()).toEqual(
      [
        'AiCard',
        'AiComment',
        'AiPrompt',
        'DrawingSubmit',
        'ErrorMessage',
        'Join',
        'Leave',
        'RoomList',
      ].sort(),
    );
  });
});
