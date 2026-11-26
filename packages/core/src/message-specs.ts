import type { ClientMessage, ServerMessage } from './messages.js';

export type MessageSpec = {
  typeName: string; // 'Join'
  wireType: ClientMessage['type'] | ServerMessage['type']; // 'join'
  direction: 'Client→Server' | 'Server→Client';
  fields: string[]; // ['type', 'roomId', 'geohash', 'roomCode']
};

// wireType をキーにすることで、型を足してここを更新し忘れるとコンパイルエラーになる
const SPEC_BY_WIRE_TYPE = {
  join: {
    typeName: 'Join',
    wireType: 'join',
    direction: 'Client→Server',
    fields: ['type', 'roomId', 'geohash', 'roomCode'],
  },
  leave: {
    typeName: 'Leave',
    wireType: 'leave',
    direction: 'Client→Server',
    fields: ['type', 'roomId'],
  },
  drawing_submit: {
    typeName: 'DrawingSubmit',
    wireType: 'drawing_submit',
    direction: 'Client→Server',
    fields: ['type', 'roomId', 'imageData', 'imageKey'],
  },
  create_room: {
    typeName: 'CreateRoom',
    wireType: 'create_room',
    direction: 'Client→Server',
    fields: ['type', 'geohash'],
  },
  join_by_code: {
    typeName: 'JoinByCode',
    wireType: 'join_by_code',
    direction: 'Client→Server',
    fields: ['type', 'roomCode'],
  },
  room_list: {
    typeName: 'RoomList',
    wireType: 'room_list',
    direction: 'Server→Client',
    fields: ['type', 'rooms'],
  },
  ai_comment: {
    typeName: 'AiComment',
    wireType: 'ai_comment',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'text'],
  },
  ai_prompt: {
    typeName: 'AiPrompt',
    wireType: 'ai_prompt',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'text'],
  },
  ai_card: {
    typeName: 'AiCard',
    wireType: 'ai_card',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'text', 'imageKey'],
  },
  error: {
    typeName: 'ErrorMessage',
    wireType: 'error',
    direction: 'Server→Client',
    fields: ['type', 'code', 'message'],
  },
  room_created: {
    typeName: 'RoomCreated',
    wireType: 'room_created',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'roomCode'],
  },
  room_joined: {
    typeName: 'RoomJoined',
    wireType: 'room_joined',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'roomCode', 'you', 'participants'],
  },
  room_left: {
    typeName: 'RoomLeft',
    wireType: 'room_left',
    direction: 'Server→Client',
    fields: ['type', 'roomId'],
  },
  participant_joined: {
    typeName: 'ParticipantJoined',
    wireType: 'participant_joined',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'participant'],
  },
  participant_left: {
    typeName: 'ParticipantLeft',
    wireType: 'participant_left',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'participant'],
  },
  drawing_added: {
    typeName: 'DrawingAdded',
    wireType: 'drawing_added',
    direction: 'Server→Client',
    fields: ['type', 'roomId', 'drawingId', 'seq', 'sender', 'imageData', 'imageKey'],
  },
} satisfies Record<ClientMessage['type'] | ServerMessage['type'], MessageSpec>;

export const MESSAGE_SPECS: readonly MessageSpec[] = Object.values(SPEC_BY_WIRE_TYPE);
