import type { RoomSummary } from '@doodle-nearby/core';
import { MAX_PARTICIPANTS } from '@doodle-nearby/core';
import '../styles/entry.css';
import { LABELS } from '../labels.js';

type Props = {
  rooms: RoomSummary[];
  onJoin: (room: RoomSummary) => void;
  onCreateRoom: () => void;
};

export function RoomListView({ rooms, onJoin, onCreateRoom }: Props) {
  const isFull = (room: RoomSummary) => room.participantCount >= MAX_PARTICIPANTS;

  return (
    <div className="room-list">
      {rooms.length === 0 ? (
        <p className="room-list__empty">{LABELS.noRoomsNearby}</p>
      ) : (
        rooms.map((room) => (
          <button
            key={room.roomId}
            className="room-card"
            disabled={isFull(room)}
            onClick={() => onJoin(room)}
          >
            <span className="room-card__code">{room.roomCode}</span>
            <span className="room-card__meta">
              <span>
                {room.participantCount}/{MAX_PARTICIPANTS}
              </span>
              <span className={`room-card__tag${isFull(room) ? ' room-card__tag--full' : ''}`}>
                {isFull(room) ? LABELS.full : room.sameHash ? LABELS.sameSpot : LABELS.nearby}
              </span>
            </span>
          </button>
        ))
      )}

      <button className="btn btn--secondary" onClick={onCreateRoom}>
        {LABELS.createNewRoom}
      </button>
    </div>
  );
}
