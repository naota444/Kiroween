import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RoomScreen } from './room-screen.js';

const noop = vi.fn();

const baseProps = {
  roomId: 'r1',
  roomCode: '1234',
  you: { color: 'red' as const, icon: 'cat' as const },
  participants: [{ color: 'red' as const, icon: 'cat' as const }],
  drawings: [],
  sendStatus: 'idle' as const,
  onAction: noop,
  onSendMessage: noop,
};

describe('RoomScreen', () => {
  it('ヘッダーに部屋番号が表示される', () => {
    const html = renderToString(<RoomScreen {...baseProps} />);
    expect(html).toContain('1234');
  });

  it('送信ボタンが hasContent:false のとき disabled になる', () => {
    const html = renderToString(<RoomScreen {...baseProps} />);
    // CanvasPad は canvas を使うため SSR では hasContent=false → disabled
    expect(html).toContain('disabled=""');
  });

  it('HTML に input / textarea / contenteditable が含まれない', () => {
    const html = renderToString(<RoomScreen {...baseProps} />);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('contenteditable');
  });

  it('Leave ボタンが表示される', () => {
    const html = renderToString(<RoomScreen {...baseProps} />);
    expect(html).toContain('Leave');
  });

  it('参加者数が表示される', () => {
    const html = renderToString(<RoomScreen {...baseProps} />);
    // SSR では数値と文字列の間に <!-- --> が入るので別々に確認する
    expect(html).toContain('room-screen__participants');
    expect(html).toContain('1');
    expect(html).toContain('/');
    expect(html).toContain('8');
  });
});
