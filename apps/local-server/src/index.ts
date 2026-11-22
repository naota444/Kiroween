// ローカル開発用 WebSocket サーバーの入口(サーバー本体は別 Spec で実装する)
export const DEFAULT_PORT = 8787;

export function startupMessage(port: number = DEFAULT_PORT): string {
  return `local-server: not implemented yet (port ${port})`;
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:///').href) {
  console.log(startupMessage());
}
