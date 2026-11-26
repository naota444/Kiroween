/**
 * Builds the WebSocket URL from the current page location.
 * - https: → wss://<host>/ws
 * - http:  → ws://<host>/ws
 * Never embeds a hardcoded hostname or IP.
 */
export function buildWsUrl(location: { protocol: string; host: string }): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
