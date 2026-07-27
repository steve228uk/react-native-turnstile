export const TURNSTILE_INTERNAL_ERROR_CODES = [
  'invalid-base-url',
  'invalid-site-key',
  'script-load-error',
  'bridge-not-ready',
  'bridge-reloaded',
  'bridge-error',
  'command-timeout',
  'component-unmounted',
  'widget-not-rendered',
  'invalid-command',
  'command-failed',
] as const;

export type TurnstileInternalErrorCode =
  (typeof TURNSTILE_INTERNAL_ERROR_CODES)[number];

export type TurnstileWidgetErrorCode =
  | `${number}`
  | `${number}${number}`
  | `${number}${number}${number}`
  | `${number}${number}${number}${number}`
  | `${number}${number}${number}${number}${number}`
  | `${number}${number}${number}${number}${number}${number}`;

export type TurnstileErrorCode =
  TurnstileWidgetErrorCode | TurnstileInternalErrorCode;

const internalErrorCodes = new Set<string>(TURNSTILE_INTERNAL_ERROR_CODES);

export function isTurnstileErrorCode(
  value: unknown,
): value is TurnstileErrorCode {
  return (
    typeof value === 'string' &&
    (internalErrorCodes.has(value) || /^\d{1,6}$/.test(value))
  );
}
