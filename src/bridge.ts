import {
  TurnstileError,
  type TurnstileErrorCode,
  type TurnstileStatus,
} from './types';
import { isTurnstileErrorCode } from './error-codes';
import { TURNSTILE_STATUSES } from './status';

export const TURNSTILE_BRIDGE_VERSION = 1 as const;

export type TurnstileCommandName =
  'render' | 'execute' | 'reset' | 'remove' | 'getResponse' | 'isExpired';

export interface TurnstileCommand {
  version: typeof TURNSTILE_BRIDGE_VERSION;
  instanceId: string;
  commandId: string;
  command: TurnstileCommandName;
}

export type TurnstileBridgeMessage =
  | {
      version: typeof TURNSTILE_BRIDGE_VERSION;
      instanceId: string;
      type: 'ready';
      payload: { widgetId: string };
    }
  | {
      version: typeof TURNSTILE_BRIDGE_VERSION;
      instanceId: string;
      type: 'status';
      payload: { status: TurnstileStatus };
    }
  | {
      version: typeof TURNSTILE_BRIDGE_VERSION;
      instanceId: string;
      type: 'verify';
      payload: { token: string };
    }
  | {
      version: typeof TURNSTILE_BRIDGE_VERSION;
      instanceId: string;
      type: 'error';
      payload: { code: TurnstileErrorCode; message?: string };
    }
  | {
      version: typeof TURNSTILE_BRIDGE_VERSION;
      instanceId: string;
      type:
        | 'expired'
        | 'timeout'
        | 'before-interactive'
        | 'after-interactive'
        | 'unsupported';
    }
  | {
      version: typeof TURNSTILE_BRIDGE_VERSION;
      instanceId: string;
      type: 'height';
      payload: { height: number; collapsed?: boolean };
    }
  | {
      version: typeof TURNSTILE_BRIDGE_VERSION;
      instanceId: string;
      type: 'command-result';
      payload:
        | { commandId: string; ok: true; value?: unknown }
        | {
            commandId: string;
            ok: false;
            error: { code: TurnstileErrorCode; message: string };
          };
    };

const statuses = new Set<TurnstileStatus>(TURNSTILE_STATUSES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses only messages produced by this component instance. Unknown, stale,
 * malformed, or future-version messages are ignored.
 */
export function parseBridgeMessage(
  raw: string,
  instanceId: string,
): TurnstileBridgeMessage | null {
  let candidate: unknown;

  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !isRecord(candidate) ||
    candidate.version !== TURNSTILE_BRIDGE_VERSION ||
    candidate.instanceId !== instanceId ||
    typeof candidate.type !== 'string'
  ) {
    return null;
  }

  const payload = candidate.payload;
  switch (candidate.type) {
    case 'expired':
    case 'timeout':
    case 'before-interactive':
    case 'after-interactive':
    case 'unsupported':
      return candidate as TurnstileBridgeMessage;
    case 'ready':
      return isRecord(payload) && typeof payload.widgetId === 'string'
        ? (candidate as TurnstileBridgeMessage)
        : null;
    case 'status':
      return isRecord(payload) &&
        typeof payload.status === 'string' &&
        statuses.has(payload.status as TurnstileStatus)
        ? (candidate as TurnstileBridgeMessage)
        : null;
    case 'verify':
      return isRecord(payload) && typeof payload.token === 'string'
        ? (candidate as TurnstileBridgeMessage)
        : null;
    case 'error':
      return isRecord(payload) &&
        isTurnstileErrorCode(payload.code) &&
        (payload.message === undefined || typeof payload.message === 'string')
        ? (candidate as TurnstileBridgeMessage)
        : null;
    case 'height':
      return isRecord(payload) &&
        typeof payload.height === 'number' &&
        Number.isFinite(payload.height) &&
        payload.height >= 0 &&
        (payload.collapsed === undefined ||
          typeof payload.collapsed === 'boolean')
        ? (candidate as TurnstileBridgeMessage)
        : null;
    case 'command-result':
      if (
        !isRecord(payload) ||
        typeof payload.commandId !== 'string' ||
        typeof payload.ok !== 'boolean'
      ) {
        return null;
      }
      if (payload.ok) {
        return candidate as TurnstileBridgeMessage;
      }
      return isRecord(payload.error) &&
        isTurnstileErrorCode(payload.error.code) &&
        typeof payload.error.message === 'string'
        ? (candidate as TurnstileBridgeMessage)
        : null;
    default:
      return null;
  }
}

export function createCommandScript(command: TurnstileCommand): string {
  const serialized = JSON.stringify(command).replace(/</g, '\\u003c');
  return `window.__RN_TURNSTILE_COMMAND__(${JSON.stringify(serialized)});true;`;
}

export function errorFromCommandResult(error: {
  code: TurnstileErrorCode;
  message: string;
}): TurnstileError {
  return new TurnstileError(error.code, error.message);
}
