import type { ClientMessage } from '@doodle-nearby/core';
import { useEffect, useRef, useState } from 'react';
import { PadEngine } from '../canvas/pad-engine.js';
import type { Tool } from '../canvas/pad-engine.js';
import { PALETTE } from '../canvas/palette.js';
import { exportDrawing } from '../canvas/png/export-drawing.js';
import { LABELS } from '../labels.js';
import type { AppAction } from '../state/app-state.js';
import '../styles/room.css';
import { Toolbar } from './toolbar.js';

type Props = {
  roomId: string;
  sendStatus: 'idle' | 'sending' | 'failed';
  onAction: (action: AppAction) => void;
  onSendMessage: (msg: ClientMessage) => void;
};

type ToolSettings = {
  tool: Tool;
  colorIndex: number;
  widthIndex: number;
};

export function CanvasPad({ roomId, sendStatus, onAction, onSendMessage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PadEngine | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [settings, setSettings] = useState<ToolSettings>({
    tool: 'pen',
    colorIndex: 0,
    widthIndex: 0,
  });
  const [hasContent, setHasContent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // マウント時に1度だけ内部解像度を決める
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const renderer = {
      drawDot(x: number, y: number, color: string, width: number) {
        ctx.beginPath();
        ctx.arc(x, y, width / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      },
      drawLine(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.stroke();
      },
      clear() {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      },
    };

    engineRef.current = new PadEngine(renderer, w, h);
  }, []);

  function toCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = toCanvasCoords(e);
    engineRef.current?.pointerDown(x, y);
    setHasContent(engineRef.current?.hasContent ?? false);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.buttons === 0) return;
    const { x, y } = toCanvasCoords(e);
    engineRef.current?.pointerMove(x, y);
    setHasContent(engineRef.current?.hasContent ?? false);
  }

  function handlePointerUp() {
    engineRef.current?.pointerUp();
  }

  function handleSet(s: Partial<ToolSettings>) {
    const next = { ...settings, ...s };
    setSettings(next);
    engineRef.current?.set(next.tool, next.colorIndex, next.widthIndex);
  }

  function handleClearAll() {
    engineRef.current?.clearAll();
    setHasContent(false);
    setSendError(null);
  }

  function handleSend() {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = {
      data: imageData.data,
      width: canvas.width,
      height: canvas.height,
    };

    const result = exportDrawing(src, PALETTE);

    if (!result.ok) {
      if (result.reason === 'blank') {
        setSendError(LABELS.drawSomethingFirst);
      } else {
        setSendError(LABELS.drawingNotSent);
      }
      return;
    }

    setSendError(null);
    onAction({ type: 'send_started' });
    onSendMessage({
      type: 'drawing_submit',
      roomId,
      imageData: result.imageData,
      imageKey: null,
    });

    // 10秒タイムアウト
    timerRef.current = setTimeout(() => {
      onAction({ type: 'send_timeout' });
    }, 10_000);
  }

  // 受理（sendStatus が sending → idle に変わった）→ キャンバスを消去
  const prevSendStatus = useRef(sendStatus);
  useEffect(() => {
    if (prevSendStatus.current === 'sending' && sendStatus === 'idle') {
      setTimeout(() => {
        engineRef.current?.clearAll();
        setHasContent(false);
        setSendError(null);
      }, 500);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    prevSendStatus.current = sendStatus;
  }, [sendStatus]);

  // 送信失敗時もタイマーをクリア
  useEffect(() => {
    if (sendStatus === 'failed' && timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      setSendError(LABELS.drawingNotSent);
    }
  }, [sendStatus]);

  // アンマウント時にタイマーをクリア
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="room-screen__canvas-area">
      <canvas
        ref={canvasRef}
        className="canvas-pad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <Toolbar
        tool={settings.tool}
        colorIndex={settings.colorIndex}
        widthIndex={settings.widthIndex}
        hasContent={hasContent}
        sendStatus={sendStatus}
        sendError={sendError}
        onSet={handleSet}
        onClearAll={handleClearAll}
        onSend={handleSend}
      />
    </div>
  );
}
