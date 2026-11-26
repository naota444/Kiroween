// ローカルサーバーの設定(環境変数の読み取り)
export const DEFAULT_PORT = 8787;

export class InvalidPortError extends Error {
  readonly value: string;

  constructor(value: string) {
    super(`LOCAL_SERVER_PORT must be an integer from 1 to 65535 (got "${value}")`);
    this.name = 'InvalidPortError';
    this.value = value;
  }
}

/** LOCAL_SERVER_PORT を読む。未設定なら既定値。10進整数 1〜65535 以外は InvalidPortError。 */
export function parsePort(env: Record<string, string | undefined>): number {
  const raw = env.LOCAL_SERVER_PORT;
  if (raw === undefined) return DEFAULT_PORT;
  if (!/^[0-9]+$/.test(raw)) throw new InvalidPortError(raw);
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new InvalidPortError(raw);
  return port;
}
