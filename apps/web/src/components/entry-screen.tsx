import type { ClientMessage, RoomSummary } from '@doodle-nearby/core';
import '../styles/entry.css';
import { LABELS } from '../labels.js';
import type { AppAction, AppState } from '../state/app-state.js';
import { Keypad } from './keypad.js';
import { RoomListView } from './room-list-view.js';

type Props = {
  location: AppState['location'];
  rooms: RoomSummary[] | null;
  entry: AppState['entry'];
  onAction: (action: AppAction) => void;
  onSendMessage: (msg: ClientMessage) => void;
};

export function EntryScreen({ location, rooms, entry, onAction, onSendMessage }: Props) {
  const geohash = location.status === 'ready' ? location.geohash : null;

  function handleJoinRoom(room: RoomSummary) {
    onAction({ type: 'join_requested' });
    if (geohash !== null) {
      onSendMessage({
        type: 'join',
        roomId: room.roomId,
        geohash,
        roomCode: null,
      });
    } else {
      onSendMessage({ type: 'join_by_code', roomCode: room.roomCode });
    }
  }

  function handleJoinByCode() {
    onAction({ type: 'join_requested' });
    if (geohash !== null) {
      onSendMessage({
        type: 'join',
        roomId: null,
        geohash,
        roomCode: entry.codeDigits,
      });
    } else {
      onSendMessage({ type: 'join_by_code', roomCode: entry.codeDigits });
    }
  }

  function handleCreateRoom() {
    onAction({ type: 'create_requested' });
    onSendMessage({ type: 'create_room', geohash });
  }

  return (
    <div className="entry-screen">
      {/* 位置取得中 */}
      {location.status === 'pending' && (
        <p className="entry-screen__status">{LABELS.findingRooms}</p>
      )}

      {/* エラー文言 */}
      {entry.error !== null && <p className="entry-screen__error">{entry.error}</p>}

      {/* 位置あり: 部屋一覧 */}
      {location.status === 'ready' && rooms !== null && (
        <RoomListView rooms={rooms} onJoin={handleJoinRoom} onCreateRoom={handleCreateRoom} />
      )}

      {/* 位置なし: テンキーと作成ボタン */}
      {location.status === 'unavailable' && (
        <>
          <Keypad
            digits={entry.codeDigits}
            onDigit={(d) => onAction({ type: 'keypad_digit', digit: d })}
            onBackspace={() => onAction({ type: 'keypad_backspace' })}
            onJoin={handleJoinByCode}
          />
          <button className="btn btn--secondary" onClick={handleCreateRoom}>
            {LABELS.createNewRoom}
          </button>
        </>
      )}

      {/* 位置あり / 取得中: Join with room code トグルボタン */}
      {location.status !== 'unavailable' && (
        <>
          <button
            className="btn btn--secondary"
            onClick={() => onAction({ type: 'keypad_toggle' })}
          >
            {LABELS.joinWithCode}
          </button>

          {entry.showKeypad && (
            <Keypad
              digits={entry.codeDigits}
              onDigit={(d) => onAction({ type: 'keypad_digit', digit: d })}
              onBackspace={() => onAction({ type: 'keypad_backspace' })}
              onJoin={handleJoinByCode}
            />
          )}
        </>
      )}
    </div>
  );
}
