export const TURNSTILE_STATUSES = [
  'loading',
  'ready',
  'executing',
  'interactive',
  'verified',
  'expired',
  'timed-out',
  'error',
  'unsupported',
  'removed',
] as const;

export type TurnstileStatus = (typeof TURNSTILE_STATUSES)[number];
