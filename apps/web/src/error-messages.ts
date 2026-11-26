import type { ErrorCode } from '@doodle-nearby/core';

/**
 * Maps every ErrorCode to an English display string.
 * Adding a new ErrorCode without updating this object is a compile error.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  invalid_json: 'Something went wrong. Please try again.',
  unknown_type: 'Something went wrong. Please try again.',
  missing_field: 'Something went wrong. Please try again.',
  invalid_field: 'Something went wrong. Please try again.',
  message_too_large: 'That drawing is too big to send.',
  room_not_found: "We couldn't find that room. Check the code and try again.",
  room_full: 'This room is full (8 people).',
  internal_error: 'The server had a problem. Please try again.',
};
