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
});
