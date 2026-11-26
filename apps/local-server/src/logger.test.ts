import { describe, expect, it, vi } from 'vitest';
import { createConsoleLogger, shortId, silentLogger } from './logger.js';

describe('logger', () => {
  it('接続 ID は先頭8文字だけにする', () => {
    expect(shortId('12345678-aaaa-bbbb-cccc-dddddddddddd')).toBe('12345678');
  });

  it('コンソールロガーは info を標準出力、error を標準エラーへ出す', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createConsoleLogger();
    logger.info('a');
    logger.error('b');
    expect(log).toHaveBeenCalledWith('a');
    expect(err).toHaveBeenCalledWith('b');
    log.mockRestore();
    err.mockRestore();
  });

  it('silentLogger は何も出さない', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    silentLogger.info('x');
    silentLogger.error('x');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
