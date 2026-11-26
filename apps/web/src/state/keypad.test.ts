import { describe, expect, it } from 'vitest';
import { INITIAL_KEYPAD, keypadReduce } from './keypad.js';
import type { KeypadKey, KeypadState } from './keypad.js';

/** Apply a sequence of keys starting from the initial state */
function applyKeys(keys: KeypadKey[]): KeypadState {
  return keys.reduce(keypadReduce, INITIAL_KEYPAD);
}

describe('keypadReduce', () => {
  it('adds a digit', () => {
    const state = keypadReduce(INITIAL_KEYPAD, '1');
    expect(state.digits).toBe('1');
    expect(state.canJoin).toBe(false);
  });

  it('enables canJoin when exactly 4 digits are entered', () => {
    const state = applyKeys(['1', '2', '3', '4']);
    expect(state.digits).toBe('1234');
    expect(state.canJoin).toBe(true);
  });

  it('ignores the 5th digit', () => {
    const state = applyKeys(['1', '2', '3', '4', '5']);
    expect(state.digits).toBe('1234');
    expect(state.canJoin).toBe(true);
  });

  it('backspace removes the last digit', () => {
    const state = applyKeys(['1', '2', '3', 'backspace']);
    expect(state.digits).toBe('12');
    expect(state.canJoin).toBe(false);
  });

  it('backspace on empty state stays empty', () => {
    const state = keypadReduce(INITIAL_KEYPAD, 'backspace');
    expect(state.digits).toBe('');
    expect(state.canJoin).toBe(false);
  });

  it('canJoin becomes false again after backspace from 4 digits', () => {
    const state = applyKeys(['1', '2', '3', '4', 'backspace']);
    expect(state.digits).toBe('123');
    expect(state.canJoin).toBe(false);
  });
});
