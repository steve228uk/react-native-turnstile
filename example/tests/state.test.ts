import { describe, expect, test } from 'bun:test';

import {
  SubmissionGate,
  describeToken,
  normaliseHeight,
} from '../src/harness/state';

describe('token metadata', () => {
  test('shows only a bounded preview rather than the full token', () => {
    const token = 'abcdefgh-should-not-be-displayed-xyz1';
    const metadata = describeToken(token, new Date('2026-07-27T12:00:00.000Z'));

    expect(metadata).toEqual({
      length: token.length,
      preview: 'abcdefgh…xyz1',
      receivedAt: '2026-07-27T12:00:00.000Z',
    });
    expect(metadata.preview).not.toContain('should-not-be-displayed');
  });
});

describe('height constraints', () => {
  test('clamps measured values to min and max', () => {
    expect(normaliseHeight(20, 65, 500)).toBe(65);
    expect(normaliseHeight(120, 65, 500)).toBe(120);
    expect(normaliseHeight(900, 65, 500)).toBe(500);
  });

  test('normalises reversed constraints', () => {
    expect(normaliseHeight(200, 500, 65)).toBe(65);
  });
});

describe('SubmissionGate', () => {
  test('rejects missing and expired tokens before verification', async () => {
    const gate = new SubmissionGate();
    const verify = () => Promise.resolve('unused');
    const reset = () => {};

    expect(
      await gate.submit({ token: null, expired: false, verify, reset }),
    ).toEqual({ ok: false, reason: 'missing-token' });
    expect(
      await gate.submit({ token: 'token', expired: true, verify, reset }),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  test('locks synchronously and resets exactly once after verification', async () => {
    const gate = new SubmissionGate();
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    let resets = 0;

    const first = gate.submit({
      token: 'single-use-token',
      expired: false,
      verify: () => pending,
      reset: () => {
        resets += 1;
      },
    });
    const duplicate = await gate.submit({
      token: 'single-use-token',
      expired: false,
      verify: () => Promise.resolve('duplicate'),
      reset: () => {
        resets += 1;
      },
    });

    expect(duplicate).toEqual({ ok: false, reason: 'in-flight' });
    expect(gate.inFlight).toBe(true);

    release('accepted');
    expect(await first).toEqual({ ok: true, value: 'accepted' });
    expect(gate.inFlight).toBe(false);
    expect(resets).toBe(1);
  });

  test('resets and releases the lock when verification throws', async () => {
    const gate = new SubmissionGate();
    let resets = 0;

    let thrown: unknown;
    try {
      await gate.submit({
        token: 'single-use-token',
        expired: false,
        verify: () => Promise.reject(new Error('network failed')),
        reset: () => {
          resets += 1;
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(new Error('network failed'));
    expect(resets).toBe(1);
    expect(gate.inFlight).toBe(false);
  });
});
