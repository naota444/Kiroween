import type { ClientMessage, ParticipantIdentity } from '@doodle-nearby/core';
import { MAX_PARTICIPANTS } from '@doodle-nearby/core';
import { LABELS } from '../labels.js';
import type { AppAction, BoardDrawing } from '../state/app-state.js';
import '../styles/room.css';
import { CanvasPad } from './canvas-pad.js';
import { SharedBoard } from './shared-board.js';

type Props = {
  roomId: string;
  roomCode: string;
  you: ParticipantIdentity | null;
  participants: ParticipantIdentity[];
  drawings: BoardDrawing[];
  sendStatus: 'idle' | 'sending' | 'failed';
  onAction: (action: AppAction) => void;
  onSendMessage: (msg: ClientMessage) => void;
};

export function RoomScreen({
  roomId,
  roomCode,
  you,
  participants,
  drawings,
  sendStatus,
  onAction,
  onSendMessage,
}: Props) {
  return (
    <div className="room-screen">
      {/* ヘッダー */}
      <header className="room-screen__header">
        <span className="room-screen__code">{roomCode}</span>
        <span className="room-screen__participants">
          {participants.length}/{MAX_PARTICIPANTS}
        </span>
        <button className="btn btn--secondary" onClick={() => onAction({ type: 'left_room' })}>
          {LABELS.leave}
        </button>
      </header>

      {/* 共有ボード（上半分） */}
      <div className="room-screen__board">
        <SharedBoard drawings={drawings} you={you} />
      </div>

      {/* キャンバス（下半分） */}
      <CanvasPad
        roomId={roomId}
        sendStatus={sendStatus}
        onAction={onAction}
        onSendMessage={onSendMessage}
      />
    </div>
  );
}
