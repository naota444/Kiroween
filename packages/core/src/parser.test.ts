import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GEOHASH_ALPHABET,
  MAX_PARTICIPANTS,
  PARTICIPANT_COLORS,
  PARTICIPANT_ICONS,
  type ClientMessage,
  type ServerMessage,
} from './messages.js';
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

// Feature: local-prototype, Property 1: 新メッセージのラウンドトリップ
// **Validates: Requirements 11.3, 11.7, 13.4**
describe('Property 1: 新メッセージのラウンドトリップ', () => {
  const NUM_RUNS = 100;

  const geohash = fc
    .array(fc.constantFrom(...GEOHASH_ALPHABET.split('')), { minLength: 6, maxLength: 6 })
    .map((cs) => cs.join(''));
  const roomCode = fc.integer({ min: 0, max: 9999 }).map((n) => String(n).padStart(4, '0'));
  const identity = fc.record({
    color: fc.constantFrom(...PARTICIPANT_COLORS),
    icon: fc.constantFrom(...PARTICIPANT_ICONS),
  });
  const id = fc.string({ minLength: 1, maxLength: 20 });
  const image = fc.oneof(
    fc.record({ imageData: fc.string({ maxLength: 200 }), imageKey: fc.constant(null) }),
    fc.record({ imageData: fc.constant(null), imageKey: fc.string({ maxLength: 50 }) }),
  );

  const clientCases: [string, fc.Arbitrary<ClientMessage>][] = [
    [
      'create_room',
      fc.record({
        type: fc.constant('create_room' as const),
        geohash: fc.oneof(geohash, fc.constant(null)),
      }),
    ],
    ['join_by_code', fc.record({ type: fc.constant('join_by_code' as const), roomCode })],
  ];

  const serverCases: [string, fc.Arbitrary<ServerMessage>][] = [
    [
      'room_created',
      fc.record({ type: fc.constant('room_created' as const), roomId: id, roomCode }),
    ],
    [
      'room_joined',
      fc.record({
        type: fc.constant('room_joined' as const),
        roomId: id,
        roomCode,
        you: identity,
        participants: fc.array(identity, { minLength: 1, maxLength: MAX_PARTICIPANTS }),
      }),
    ],
    ['room_left', fc.record({ type: fc.constant('room_left' as const), roomId: id })],
    [
      'participant_joined',
      fc.record({
        type: fc.constant('participant_joined' as const),
        roomId: id,
        participant: identity,
      }),
    ],
    [
      'participant_left',
      fc.record({
        type: fc.constant('participant_left' as const),
        roomId: id,
        participant: identity,
      }),
    ],
    [
      'drawing_added',
      fc
        .tuple(
          fc.record({
            type: fc.constant('drawing_added' as const),
            roomId: id,
            drawingId: id,
            seq: fc.integer({ min: 1, max: 1_000_000 }),
            sender: identity,
          }),
          image,
        )
        .map(([base, img]) => ({ ...base, ...img }) as ServerMessage),
    ],
  ];

  it.each(clientCases)('%s: クライアント向けにラウンドトリップする', (_name, arb) => {
    fc.assert(
      fc.property(arb, (msg) => {
        const r = parseClientMessage(JSON.stringify(msg));
        expect(r).toEqual({ ok: true, value: msg });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it.each(serverCases)('%s: サーバー向けにラウンドトリップする', (_name, arb) => {
    fc.assert(
      fc.property(arb, (msg) => {
        const r = parseServerMessage(JSON.stringify(msg));
        expect(r).toEqual({ ok: true, value: msg });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
