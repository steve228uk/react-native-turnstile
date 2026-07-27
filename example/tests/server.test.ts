import { describe, expect, test } from 'bun:test';

import {
  handleRequest,
  readDevelopmentServerConfig,
  validateExpectedFields,
  validateVerifyRequest,
  type SiteverifyFetch,
} from '../server';

describe('development server configuration', () => {
  const valid = {
    TURNSTILE_SECRET_KEY: 'server-secret',
    TURNSTILE_EXPECTED_HOSTNAME: 'localhost',
    TURNSTILE_EXPECTED_ACTION: 'harness-submit',
  };

  test('requires server-owned hostname and action expectations', () => {
    expect(() =>
      readDevelopmentServerConfig({
        TURNSTILE_SECRET_KEY: valid.TURNSTILE_SECRET_KEY,
        TURNSTILE_EXPECTED_ACTION: valid.TURNSTILE_EXPECTED_ACTION,
      }),
    ).toThrow('TURNSTILE_EXPECTED_HOSTNAME');

    expect(() =>
      readDevelopmentServerConfig({
        TURNSTILE_SECRET_KEY: valid.TURNSTILE_SECRET_KEY,
        TURNSTILE_EXPECTED_HOSTNAME: valid.TURNSTILE_EXPECTED_HOSTNAME,
      }),
    ).toThrow('TURNSTILE_EXPECTED_ACTION');
  });

  test('cannot start in production', () => {
    expect(() =>
      readDevelopmentServerConfig({ ...valid, NODE_ENV: 'production' }),
    ).toThrow('must not run in production');
  });
});

describe('request validation', () => {
  test('accepts only a non-empty token from the device', () => {
    expect(validateVerifyRequest({ token: 'dummy-token' })).toEqual({
      ok: true,
      token: 'dummy-token',
    });
    expect(validateVerifyRequest({ token: '' })).toEqual({
      ok: false,
      error: 'token must be a non-empty string.',
    });
  });
});

describe('Siteverify response validation', () => {
  test('fails a successful response with the wrong hostname', () => {
    expect(
      validateExpectedFields(
        {
          success: true,
          hostname: 'attacker.example',
          action: 'harness-submit',
        },
        'localhost',
        'harness-submit',
      ),
    ).toMatchObject({
      success: false,
      'error-codes': ['hostname-mismatch'],
    });
  });

  test('fails a successful response with the wrong action', () => {
    expect(
      validateExpectedFields(
        {
          success: true,
          hostname: 'localhost',
          action: 'other-action',
        },
        'localhost',
        'harness-submit',
      ),
    ).toMatchObject({
      success: false,
      'error-codes': ['action-mismatch'],
    });
  });

  test('preserves Cloudflare duplicate-token rejection', () => {
    expect(
      validateExpectedFields(
        { success: false, 'error-codes': ['timeout-or-duplicate'] },
        'localhost',
        'harness-submit',
      ),
    ).toEqual({
      success: false,
      'error-codes': ['timeout-or-duplicate'],
    });
  });
});

describe('Siteverify proxy', () => {
  test('keeps the secret on the server and posts token as form data', async () => {
    let capturedBody: FormData | undefined;
    const mockFetch: SiteverifyFetch = (_input, init) => {
      capturedBody = init?.body as FormData;
      return Promise.resolve(
        Response.json({
          success: true,
          hostname: 'localhost',
          action: 'harness-submit',
        }),
      );
    };

    const response = await handleRequest(
      new Request('http://localhost:8787/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'dummy-token' }),
      }),
      {
        secret: 'server-secret',
        expectedHostname: 'localhost',
        expectedAction: 'harness-submit',
        fetchSiteverify: mockFetch,
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(capturedBody?.get('secret')).toBe('server-secret');
    expect(capturedBody?.get('response')).toBe('dummy-token');
    expect(capturedBody?.get('idempotency_key')).toBeTruthy();
  });
});
