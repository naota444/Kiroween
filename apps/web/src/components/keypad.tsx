import '../styles/entry.css';
import { LABELS } from '../labels.js';

type Props = {
  digits: string;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onJoin: () => void;
};

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export function Keypad({ digits, onDigit, onBackspace, onJoin }: Props) {
  const canJoin = digits.length === 4;

  return (
    <div className="keypad">
      {/* 4つの桁表示枠 */}
      <div className="keypad__digits">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`keypad__digit-box${digits[i] !== undefined ? ' keypad__digit-box--filled' : ''}`}
          >
            {digits[i] ?? ''}
          </div>
        ))}
      </div>

      {/* 数字グリッド */}
      <div className="keypad__grid">
        {DIGIT_KEYS.map((key, i) => {
          if (key === '') {
            return <div key={i} />;
          }
          if (key === '⌫') {
            return (
              <button key={i} className="keypad__key" onClick={onBackspace}>
                {key}
              </button>
            );
          }
          return (
            <button key={i} className="keypad__key" onClick={() => onDigit(key)}>
              {key}
            </button>
          );
        })}
      </div>

      {/* Join ボタン */}
      <button className="btn btn--primary" disabled={!canJoin} onClick={onJoin}>
        {LABELS.join}
      </button>
    </div>
  );
}
