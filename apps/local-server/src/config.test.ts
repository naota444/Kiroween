import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, InvalidPortError, parsePort } from './config.js';
import { main } from './index.js';

describe('parsePort', () => {
  it('未設定なら既定ポート', () => {
    expect(parsePort({})).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(8787);
  });

  it('1〜65535 の10進整数を受け付ける', () => {
    expect(parsePort({ LOCAL_SERVER_PORT: '1' })).toBe(1);
    expect(parsePort({ LOCAL_SERVER_PORT: '8080' })).toBe(8080);
    expect(parsePort({ LOCAL_SERVER_PORT: '65535' })).toBe(65535);
  });

  it.each(['', ' 80', '80 ', '0', '65536', '-1', '80.5', '1e3', '0x50', 'abc'])(
    '不正な値 %j は InvalidPortError',
    (value) => {
      expect(() => parsePort({ LOCAL_SERVER_PORT: value })).toThrow(InvalidPortError);
    },
  );
});

describe('main', () => {
  it('不正なポートなら stderr に出して終了コード 1', async () => {
    const err: string[] = [];
    const out: string[] = [];
    const codes: number[] = [];
    await main(
      { LOCAL_SERVER_PORT: '0x50' },
      { stdout: (l) => out.push(l), stderr: (l) => err.push(l), exit: (c) => codes.push(c) },
    );
    expect(err).toEqual(['LOCAL_SERVER_PORT must be an integer from 1 to 65535 (got "0x50")']);
    expect(codes).toEqual([1]);
    expect(out).toEqual([]);
  });

  it('正しいポートなら起動して起動メッセージを出し、使用中のポートなら終了コード 1', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const codes: number[] = [];
    const io = {
      stdout: (l: string) => out.push(l),
      stderr: (l: string) => err.push(l),
      exit: (c: number) => codes.push(c),
    };
    const server = await main({ LOCAL_SERVER_PORT: '38787' }, io);
    try {
      expect(out[0]).toContain('38787');
      expect(codes).toEqual([]);

      const second = await main({ LOCAL_SERVER_PORT: '38787' }, io);
      expect(second).toBeUndefined();
      expect(codes).toEqual([1]);
      expect(err[0]).toContain('38787');
    } finally {
      await server?.close();
    }
  });
});
