import { describe, expect, test } from 'bun:test';

import { TEST_SCENARIOS, getScenario } from '../src/harness/scenarios';

describe('official deterministic scenarios', () => {
  test('contains every documented Cloudflare test sitekey', () => {
    expect(TEST_SCENARIOS.map((scenario) => scenario.siteKey)).toEqual([
      '1x00000000000000000000AA',
      '2x00000000000000000000AB',
      '1x00000000000000000000BB',
      '2x00000000000000000000BB',
      '3x00000000000000000000FF',
    ]);
  });

  test('maps invisible scenarios to the invisible display hint', () => {
    expect(getScenario('invisible-pass').widgetMode).toBe('invisible');
    expect(getScenario('invisible-fail').widgetMode).toBe('invisible');
  });

  test('rejects an unknown scenario instead of silently using a real key', () => {
    expect(() =>
      getScenario('production' as Parameters<typeof getScenario>[0]),
    ).toThrow('Unknown Turnstile test scenario');
  });
});
