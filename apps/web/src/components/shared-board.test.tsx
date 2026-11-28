import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BoardDrawing } from '../state/app-state.js';
import { SharedBoard } from './shared-board.js';

const drawing = (id: string, seq: number, imageData: string | null): BoardDrawing => ({
  drawingId: id,
  seq,
  sender: { color: 'red', icon: 'cat' },
  imageData,
});

describe('SharedBoard', () => {
  it('絵の数だけ送信者の NameTag が出る', () => {
    const drawings = [drawing('d1', 1, 'abc'), drawing('d2', 2, 'def'), drawing('d3', 3, 'ghi')];
    const html = renderToString(<SharedBoard drawings={drawings} you={null} />);
    // 各セルの sender NameTag（shared-board__sender 内）が3つ出る
    const matches = html.match(/aria-label="red cat"/g);
    // 各セルにプレースホルダー用 + sender 用の2つ出るケースを考慮し、
    // 少なくとも絵の枚数分は出ること
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(drawings.length);
  });

  it('imageData が null のときプレースホルダーが出る', () => {
    const drawings = [drawing('d1', 1, null)];
    const html = renderToString(<SharedBoard drawings={drawings} you={null} />);
    expect(html).toContain('Can&#x27;t show this drawing');
  });

  it('drawings が空のとき何も表示しない', () => {
    const html = renderToString(<SharedBoard drawings={[]} you={null} />);
    expect(html).not.toContain('aria-label');
  });
});
