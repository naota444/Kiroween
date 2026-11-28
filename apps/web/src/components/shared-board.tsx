import type { ParticipantIdentity } from '@doodle-nearby/core';
import { useEffect, useRef, useState } from 'react';
import type { BoardDrawing } from '../state/app-state.js';
import '../styles/board.css';
import { LABELS } from '../labels.js';
import { NameTag } from './name-tag.js';

type Props = {
  drawings: BoardDrawing[];
  you: ParticipantIdentity | null;
};

type DrawingCellProps = {
  drawing: BoardDrawing;
};

function DrawingCell({ drawing }: DrawingCellProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = drawing.imageData !== null && !imgError;

  return (
    <div className="shared-board__cell">
      {showImage ? (
        <img
          className="shared-board__img"
          src={`data:image/png;base64,${drawing.imageData}`}
          alt=""
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="shared-board__placeholder">
          <NameTag identity={drawing.sender} size={40} />
          <span>{LABELS.cantShowDrawing}</span>
        </div>
      )}
      <div className="shared-board__sender">
        <NameTag identity={drawing.sender} size={24} />
      </div>
    </div>
  );
}

export function SharedBoard({ drawings }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(drawings.length);

  // 新しい絵が追加されたら末尾へスクロール
  useEffect(() => {
    if (drawings.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = drawings.length;
  }, [drawings.length]);

  return (
    <div className="shared-board">
      {drawings.map((d) => (
        <DrawingCell key={d.drawingId} drawing={d} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
