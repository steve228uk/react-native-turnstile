export interface TokenMetadata {
  length: number;
  preview: string;
  receivedAt: string;
}

export type SubmitResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'missing-token' | 'expired' | 'in-flight' };

export function describeToken(
  token: string,
  receivedAt = new Date(),
): TokenMetadata {
  const head = token.slice(0, 8);
  const tail = token.length > 12 ? token.slice(-4) : '';

  return {
    length: token.length,
    preview: tail ? `${head}…${tail}` : head,
    receivedAt: receivedAt.toISOString(),
  };
}

export function normaliseHeight(
  measured: number,
  minimum: number,
  maximum: number,
): number {
  const lower = Math.max(0, Math.min(minimum, maximum));
  const upper = Math.max(lower, maximum);

  return Math.min(upper, Math.max(lower, measured));
}

/**
 * Owns the synchronous in-flight transition so rapid taps cannot submit the
 * same single-use token twice.
 */
export class SubmissionGate {
  private locked = false;

  get inFlight(): boolean {
    return this.locked;
  }

  async submit<T>({
    token,
    expired,
    verify,
    reset,
  }: {
    token: string | null;
    expired: boolean;
    verify: (token: string) => Promise<T>;
    reset: () => void | Promise<void>;
  }): Promise<SubmitResult<T>> {
    if (this.locked) {
      return { ok: false, reason: 'in-flight' };
    }

    if (!token) {
      return { ok: false, reason: 'missing-token' };
    }

    if (expired) {
      return { ok: false, reason: 'expired' };
    }

    this.locked = true;

    try {
      return { ok: true, value: await verify(token) };
    } finally {
      try {
        await reset();
      } finally {
        this.locked = false;
      }
    }
  }
}
