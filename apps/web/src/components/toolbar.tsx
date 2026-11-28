import { PALETTE, PEN_COLORS, WIDTHS } from '../canvas/palette.js';
import type { Tool } from '../canvas/pad-engine.js';
import { LABELS } from '../labels.js';
import '../styles/room.css';

type ToolSettings = {
  tool: Tool;
  colorIndex: number;
  widthIndex: number;
};

type Props = {
  tool: Tool;
  colorIndex: number;
  widthIndex: number;
  hasContent: boolean;
  sendStatus: 'idle' | 'sending' | 'failed';
  sendError: string | null;
  onSet: (s: Partial<ToolSettings>) => void;
  onClearAll: () => void;
  onSend: () => void;
};

export function Toolbar({
  tool,
  colorIndex,
  widthIndex,
  hasContent,
  sendStatus,
  sendError,
  onSet,
  onClearAll,
  onSend,
}: Props) {
  const sendDisabled = !hasContent || sendStatus === 'sending';

  return (
    <div className="toolbar">
      {/* ペン3色 */}
      {PEN_COLORS.map((_, i) => {
        const [r, g, b] = PALETTE[i + 1]!;
        return (
          <button
            key={i}
            className={`toolbar__color${tool === 'pen' && colorIndex === i ? ' toolbar__color--active' : ''}`}
            style={{ backgroundColor: `rgb(${r},${g},${b})` }}
            onClick={() => onSet({ tool: 'pen', colorIndex: i })}
            aria-label={PEN_COLORS[i]}
          />
        );
      })}

      {/* 太さ2種類 */}
      {WIDTHS.map((w, i) => (
        <button
          key={i}
          className={`toolbar__width${tool === 'pen' && widthIndex === i ? ' toolbar__width--active' : ''}`}
          onClick={() => onSet({ tool: 'pen', widthIndex: i })}
          aria-label={`width ${w}`}
        >
          <span
            style={{
              display: 'block',
              width: w / 2,
              height: w / 2,
              borderRadius: '50%',
              background: '#111',
            }}
          />
        </button>
      ))}

      {/* 消しゴム */}
      <button
        className={`toolbar__eraser${tool === 'eraser' ? ' toolbar__eraser--active' : ''}`}
        onClick={() => onSet({ tool: 'eraser' })}
      >
        ✕
      </button>

      {/* 全消し */}
      <button className="toolbar__clear" onClick={onClearAll}>
        🗑
      </button>

      {/* 送信 */}
      <button className="toolbar__send" disabled={sendDisabled} onClick={onSend}>
        {LABELS.send}
      </button>

      {/* エラー文言 */}
      {sendError !== null && <span className="toolbar__error">{sendError}</span>}
    </div>
  );
}
