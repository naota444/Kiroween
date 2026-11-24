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
} satisfies Record<ClientMessage['type'] | ServerMessage['type'], MessageSpec>;

export const MESSAGE_SPECS: readonly MessageSpec[] = Object.values(SPEC_BY_WIRE_TYPE);
