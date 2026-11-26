import { parseServerMessage } from '@doodle-nearby/core';
import type { ClientMessage, ServerMessage } from '@doodle-nearby/core';

export type ConnectionHandlers = {
  onMessage: (msg: ServerMessage) => void;
  onClose: () => void;
};

export type Connection = {
  send: (msg: ClientMessage) => void;
  close: () => void;
};

/**
 * Opens a WebSocket connection to `url`.
 * - Only messages that parse successfully are forwarded to `onMessage`.
 * - Both `close` and `error` events trigger `onClose` (once).
 * - No automatic reconnection.
 */
export function openConnection(url: string, handlers: ConnectionHandlers): Connection {
  const ws = new WebSocket(url);
  let closed = false;

  function handleClose() {
    if (!closed) {
      closed = true;
      handlers.onClose();
    }
  }

  ws.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'string') return;
    const result = parseServerMessage(event.data);
    if (result.ok) {
      handlers.onMessage(result.value);
    }
  });

  ws.addEventListener('close', handleClose);
  ws.addEventListener('error', handleClose);

  return {
    send(msg: ClientMessage) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close() {
      ws.close();
    },
  };
}
