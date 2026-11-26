import { describe, expect, it } from 'vitest';
import { MESSAGE_SPECS } from './message-specs.js';

describe('MESSAGE_SPECS', () => {
  it('lists all 16 message types', () => {
    expect(MESSAGE_SPECS.map((s) => s.typeName).sort()).toEqual(
      [
        'AiCard',
        'AiComment',
        'AiPrompt',
        'CreateRoom',
        'DrawingAdded',
        'DrawingSubmit',
        'ErrorMessage',
        'Join',
        'JoinByCode',
        'Leave',
        'ParticipantJoined',
        'ParticipantLeft',
        'RoomCreated',
        'RoomJoined',
        'RoomLeft',
        'RoomList',
      ].sort(),
    );
  });
});
