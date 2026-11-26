import type { WebSocket } from 'ws';

/** 状態に必要な最小の形。実際には core の `ConnectionState` を渡す。 */
export type HasConnectionId = { connectionId: string };

export type ConnectionEntry<S extends HasConnectionId> = {
  state: S;
  socket: WebSocket;
};

/** 接続ごとの状態(`ConnectionState`)と WebSocket の表。 */
export class ConnectionRegistry<S extends HasConnectionId> {
  private readonly entries = new Map<string, ConnectionEntry<S>>();

  add(state: S, socket: WebSocket): void {
    this.entries.set(state.connectionId, { state, socket });
  }

  get(connectionId: string): ConnectionEntry<S> | undefined {
    return this.entries.get(connectionId);
  }

  /** 登録のない接続には何もしない。 */
  updateState(connectionId: string, state: S): void {
    const entry = this.entries.get(connectionId);
    if (entry) entry.state = state;
  }

  remove(connectionId: string): boolean {
    return this.entries.delete(connectionId);
  }

  all(): ConnectionEntry<S>[] {
    return [...this.entries.values()];
  }

  get size(): number {
    return this.entries.size;
  }
}
