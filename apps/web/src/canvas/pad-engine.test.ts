import { describe, expect, it, vi } from 'vitest';
import { PadEngine } from './pad-engine.js';
import type { Renderer } from './pad-engine.js';

/** 偽の Renderer — 呼び出しを記録するだけ */
function makeRenderer(): Renderer {
  return {
    drawDot: vi.fn(),
    drawLine: vi.fn(),
    clear: vi.fn(),
  };
}

const W = 512;
const H = 512;

describe('PadEngine', () => {
  it('タップ（Down→Up）で drawDot が1回呼ばれる', () => {
    const r = makeRenderer();
    const engine = new PadEngine(r, W, H);

    engine.pointerDown(100, 100);
    engine.pointerUp();

    expect(r.drawDot).toHaveBeenCalledOnce();
    expect(r.drawLine).not.toHaveBeenCalled();
  });

  it('ドラッグ（Down→Move→Up）で drawLine が呼ばれる', () => {
    const r = makeRenderer();
    const engine = new PadEngine(r, W, H);

    engine.pointerDown(50, 50);
    engine.pointerMove(100, 100);
    engine.pointerUp();

    expect(r.drawLine).toHaveBeenCalledOnce();
  });

  it('clearAll で hasContent が false になり設定が変わらない', () => {
    const r = makeRenderer();
    const engine = new PadEngine(r, W, H);

    engine.set('pen', 1, 1);
    engine.pointerDown(100, 100);
    engine.pointerUp();
    expect(engine.hasContent).toBe(true);

    engine.clearAll();

    expect(engine.hasContent).toBe(false);
    expect(r.clear).toHaveBeenCalledOnce();

    // 設定が変わっていないことを確認：再描画で同じ色・太さが使われる
    engine.pointerDown(50, 50);
    const [, , color, width] = (r.drawDot as ReturnType<typeof vi.fn>).mock.calls[1]!;
    expect(color).not.toBe('#000000'); // index 1 = red
    expect(width).toBe(10); // index 1 = thick
  });

  it('消しゴムは白色で描画される', () => {
    const r = makeRenderer();
    const engine = new PadEngine(r, W, H);

    engine.set('eraser', 0, 0);
    engine.pointerDown(100, 100);

    const [, , color] = (r.drawDot as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(color).toMatch(/^rgb\(255,255,255\)$/);
  });

  it('消しゴムで描いても hasContent は true にならない', () => {
    const r = makeRenderer();
    const engine = new PadEngine(r, W, H);

    engine.set('eraser', 0, 0);
    engine.pointerDown(100, 100);
    engine.pointerUp();

    expect(engine.hasContent).toBe(false);
  });

  it('境界外に出た後の pointerMove は描画されない', () => {
    const r = makeRenderer();
    const engine = new PadEngine(r, W, H);

    engine.pointerDown(100, 100);
    engine.pointerMove(600, 300); // 境界外 → 境界点まで線を引いて以降は無視
    const callsAfterOutOfBounds = (r.drawLine as ReturnType<typeof vi.fn>).mock.calls.length;

    engine.pointerMove(400, 300); // まだ無視
    expect(r.drawLine).toHaveBeenCalledTimes(callsAfterOutOfBounds); // 増えない
  });

  it('pointerUp 後に境界外フラグがリセットされ次の Down を受け付ける', () => {
    const r = makeRenderer();
    const engine = new PadEngine(r, W, H);

    engine.pointerDown(100, 100);
    engine.pointerMove(600, 300); // 境界外へ
    engine.pointerUp();

    // 次のタップは正常に受け付ける
    engine.pointerDown(200, 200);
    expect(r.drawDot).toHaveBeenCalledTimes(2);
  });
});
