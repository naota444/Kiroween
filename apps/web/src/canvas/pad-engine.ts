import { PEN_COLOR_CSS, PALETTE, PEN_COLORS, WIDTHS } from './palette.js';
import type { PenColor, PenWidth } from './palette.js';

// ---------------------------------------------------------------------------
// Renderer interface
// ---------------------------------------------------------------------------

/**
 * Renderer — 描画命令を受け取るインターフェース。
 * PadEngine はこれを通じて描画を指示するだけで canvas API を直接呼ばない。
 * テストでは偽物を差し込み、本番では canvas の CanvasRenderingContext2D ラッパーを渡す。
 */
export interface Renderer {
  drawDot(x: number, y: number, color: string, width: number): void;
  drawLine(x1: number, y1: number, x2: number, y2: number, color: string, width: number): void;
  clear(): void;
}

// ---------------------------------------------------------------------------
// Tool type
// ---------------------------------------------------------------------------

/** ツールの種類。pen = ペン、eraser = 消しゴム（白で塗る） */
export type Tool = 'pen' | 'eraser';

// ---------------------------------------------------------------------------
// PadEngine
// ---------------------------------------------------------------------------

/**
 * PadEngine — DOM・canvas に依存しない描画ロジック層。
 * ポインターイベントを受け取り、Renderer に描画命令を発行する。
 * hasContent でペンで描いた内容があるかを追跡する。
 */
export class PadEngine {
  private tool: Tool = 'pen';
  private colorIndex: number = 0;
  private widthIndex: number = 0;

  /** ポインターが現在押下中かどうか */
  private pressing: boolean = false;
  /** 境界外に出てポインターアップまで無視するフラグ */
  private outOfBounds: boolean = false;
  /** 直前のポインター座標 */
  private prevX: number = 0;
  private prevY: number = 0;

  private _hasContent: boolean = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly width: number,
    private readonly height: number,
  ) {}

  // ---- Public state ----

  get hasContent(): boolean {
    return this._hasContent;
  }

  // ---- Tool settings ----

  set(tool: Tool, colorIndex: number, widthIndex: number): void {
    this.tool = tool;
    this.colorIndex = colorIndex;
    this.widthIndex = widthIndex;
  }

  // ---- Pointer events ----

  pointerDown(x: number, y: number): void {
    this.pressing = true;
    this.outOfBounds = false;

    if (!this.isInBounds(x, y)) {
      this.outOfBounds = true;
      return;
    }

    this.prevX = x;
    this.prevY = y;
    this.renderer.drawDot(x, y, this.currentColor(), this.currentWidth());
    if (this.tool === 'pen') this._hasContent = true;
  }

  pointerMove(x: number, y: number): void {
    if (!this.pressing || this.outOfBounds) return;

    if (!this.isInBounds(x, y)) {
      // クランプした境界点まで線を引いてから以降を無視する
      const { x: cx, y: cy } = this.clamp(x, y);
      this.renderer.drawLine(
        this.prevX,
        this.prevY,
        cx,
        cy,
        this.currentColor(),
        this.currentWidth(),
      );
      if (this.tool === 'pen') this._hasContent = true;
      this.outOfBounds = true;
      return;
    }

    this.renderer.drawLine(this.prevX, this.prevY, x, y, this.currentColor(), this.currentWidth());
    if (this.tool === 'pen') this._hasContent = true;
    this.prevX = x;
    this.prevY = y;
  }

  pointerUp(): void {
    this.pressing = false;
    this.outOfBounds = false;
  }

  // ---- Clear ----

  clearAll(): void {
    this.renderer.clear();
    this._hasContent = false;
    // ツール・色・太さは変えない
  }

  // ---- Private helpers ----

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x <= this.width && y >= 0 && y <= this.height;
  }

  private clamp(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(this.width, x)),
      y: Math.max(0, Math.min(this.height, y)),
    };
  }

  private currentColor(): string {
    // 消しゴムは白（パレットの index 0）
    if (this.tool === 'eraser') {
      return `rgb(${PALETTE[0]![0]},${PALETTE[0]![1]},${PALETTE[0]![2]})`;
    }
    const name = PEN_COLORS[this.colorIndex] as PenColor;
    return PEN_COLOR_CSS[name];
  }

  private currentWidth(): number {
    return WIDTHS[this.widthIndex] as PenWidth;
  }
}
