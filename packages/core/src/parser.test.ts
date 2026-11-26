import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage } from './parser.js';

describe('parser (examples)', () => {
  it('有効な join を受理し、余分なフィールドを除く', () => {
    const r = parseClientMessage(
      JSON.stringify({ type: 'join', roomId: null, geohash: 'xn774c', roomCode: '0427', extra: 1 }),
    );
    expect(r).toEqual({
      ok: true,
      value: { type: 'join', roomId: null, geohash: 'xn774c', roomCode: '0427' },
    });
  });

  it('不正な JSON は invalid_json', () => {
    const r = parseClientMessage('{');
    expect(r.ok === false && r.error.code).toBe('invalid_json');
  });

  it('反対方向の type は unknown_type', () => {
    const r = parseClientMessage(JSON.stringify({ type: 'room_list', rooms: [] }));
    expect(r.ok === false && r.error.code).toBe('unknown_type');
  });

  it('必須フィールドなしは missing_field', () => {
    const r = parseClientMessage(JSON.stringify({ type: 'leave' }));
    expect(r.ok === false && r.error.code).toBe('missing_field');
  });

  it('drawing_submit で両方 null は invalid_field', () => {
    const r = parseClientMessage(
      JSON.stringify({ type: 'drawing_submit', roomId: 'r1', imageData: null, imageKey: null }),
    );
    expect(r.ok === false && r.error.code).toBe('invalid_field');
  });

  it('32KB 超は message_too_large', () => {
    const r = parseClientMessage(
      JSON.stringify({
        type: 'drawing_submit',
        roomId: 'r1',
        imageData: 'A'.repeat(33_000),
        imageKey: null,
      }),
    );
    expect(r.ok === false && r.error.code).toBe('message_too_large');
  });

  it('ai_comment は 40 文字(コードポイント)まで', () => {
    const ok = parseServerMessage(
      JSON.stringify({ type: 'ai_comment', roomId: 'r1', text: '😀'.repeat(40) }),
    );
    const ng = parseServerMessage(
      JSON.stringify({ type: 'ai_comment', roomId: 'r1', text: '😀'.repeat(41) }),
    );
    expect(ok.ok).toBe(true);
    expect(ng.ok === false && ng.error.code).toBe('invalid_field');
  });

  describe('新メッセージ', () => {
    const you = { color: 'red', icon: 'cat' };
    const clientCases = [
      { type: 'create_room', geohash: 'xn774c' },
      { type: 'create_room', geohash: null },
      { type: 'join_by_code', roomCode: '0427' },
    ];
    const serverCases = [
      { type: 'room_created', roomId: 'r1', roomCode: '0427' },
      { type: 'room_joined', roomId: 'r1', roomCode: '0427', you, participants: [you] },
      { type: 'room_left', roomId: 'r1' },
      { type: 'participant_joined', roomId: 'r1', participant: you },
      { type: 'participant_left', roomId: 'r1', participant: you },
      {
        type: 'drawing_added',
        roomId: 'r1',
        drawingId: 'd1',
        seq: 1,
        sender: you,
        imageData: 'AAAA',
        imageKey: null,
      },
    ];

    it.each(clientCases)('クライアントの新メッセージを受理する: %j', (msg) => {
      expect(parseClientMessage(JSON.stringify({ ...msg, lat: 35.1, lng: 139.2 }))).toEqual({
        ok: true,
        value: msg,
      });
    });

    it.each(serverCases)('サーバーの新メッセージを受理する: %j', (msg) => {
      expect(parseServerMessage(JSON.stringify({ ...msg, extra: 1 }))).toEqual({
        ok: true,
        value: msg,
      });
    });

    it('必須フィールドなしは missing_field', () => {
      const a = parseClientMessage(JSON.stringify({ type: 'create_room' }));
      const b = parseServerMessage(JSON.stringify({ type: 'room_left' }));
      expect(a.ok === false && a.error.code).toBe('missing_field');
      expect(b.ok === false && b.error.code).toBe('missing_field');
    });

    it('不正な値は invalid_field', () => {
      const a = parseServerMessage(
        JSON.stringify({
          type: 'participant_left',
          roomId: 'r1',
          participant: { color: 'x', icon: 'cat' },
        }),
      );
      const b = parseServerMessage(JSON.stringify({ ...serverCases[5], imageKey: 'k' }));
      expect(a.ok === false && a.error.code).toBe('invalid_field');
      expect(b.ok === false && b.error.code).toBe('invalid_field');
    });

    it('反対方向の新メッセージは unknown_type', () => {
      const a = parseClientMessage(JSON.stringify(serverCases[0]));
      const b = parseServerMessage(JSON.stringify(clientCases[2]));
      expect(a.ok === false && a.error.code).toBe('unknown_type');
      expect(b.ok === false && b.error.code).toBe('unknown_type');
    });
  });
});
