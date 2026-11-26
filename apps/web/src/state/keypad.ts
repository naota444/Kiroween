export type KeypadState = {
  digits: string; // 0–4 numeric characters
  canJoin: boolean; // true only when digits.length === 4
};

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'backspace';

export const INITIAL_KEYPAD: KeypadState = { digits: '', canJoin: false };

/**
 * Pure reducer for the room-code keypad.
 * - Accepts digits 0–9 (ignored when already 4 digits long).
 * - Backspace removes the last digit.
 * - `canJoin` is true only when exactly 4 digits are entered.
 */
export function keypadReduce(state: KeypadState, key: KeypadKey): KeypadState {
  let digits: string;

  if (key === 'backspace') {
    digits = state.digits.slice(0, -1);
  } else {
    // Ignore 5th digit and beyond
    if (state.digits.length >= 4) return state;
    digits = state.digits + key;
  }

  return { digits, canJoin: digits.length === 4 };
}
