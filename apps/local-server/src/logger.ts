/** ログの出力先。位置・geohash・部屋番号・画像は渡さない(要件 14.3)。 */
export type Logger = {
  info(line: string): void;
  error(line: string): void;
};

/** 何も出さないロガー(テスト用の既定)。 */
export const silentLogger: Logger = {
  info() {},
  error() {},
};

/** 標準出力/標準エラーへ出すロガー。 */
export function createConsoleLogger(): Logger {
  return {
    info: (line) => console.log(line),
    error: (line) => console.error(line),
  };
}

/** 接続 ID は先頭8文字だけをログに出す。 */
export function shortId(connectionId: string): string {
  return connectionId.slice(0, 8);
}
