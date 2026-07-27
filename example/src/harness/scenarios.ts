import type { TurnstileWidgetMode } from '@steve228uk/react-native-turnstile';

export interface TestScenario {
  id:
    | 'configured'
    | 'visible-pass'
    | 'visible-fail'
    | 'invisible-pass'
    | 'invisible-fail'
    | 'interactive';
  label: string;
  siteKey: string;
  widgetMode: TurnstileWidgetMode;
  expected: string;
  serverHint: string;
}

/**
 * Official deterministic keys from Cloudflare's Turnstile testing guide.
 * They are deliberately kept in the example harness and must never be used in
 * a production app.
 */
export const TEST_SCENARIOS: readonly TestScenario[] = [
  {
    id: 'visible-pass',
    label: 'Visible · pass',
    siteKey: '1x00000000000000000000AA',
    widgetMode: 'managed',
    expected: 'Issues a deterministic dummy token.',
    serverHint: 'Pair with the always-pass test secret.',
  },
  {
    id: 'visible-fail',
    label: 'Visible · fail',
    siteKey: '2x00000000000000000000AB',
    widgetMode: 'managed',
    expected: 'Deterministically exercises client error handling.',
    serverHint:
      'Pair with the always-fail test secret when testing Siteverify.',
  },
  {
    id: 'invisible-pass',
    label: 'Invisible · pass',
    siteKey: '1x00000000000000000000BB',
    widgetMode: 'invisible',
    expected: 'Issues a dummy token without visible managed UI.',
    serverHint: 'Pair with the always-pass test secret.',
  },
  {
    id: 'invisible-fail',
    label: 'Invisible · fail',
    siteKey: '2x00000000000000000000BB',
    widgetMode: 'invisible',
    expected: 'Deterministically exercises invisible error handling.',
    serverHint:
      'Pair with the always-fail test secret when testing Siteverify.',
  },
  {
    id: 'interactive',
    label: 'Force interaction',
    siteKey: '3x00000000000000000000FF',
    widgetMode: 'managed',
    expected: 'Forces an interactive visible challenge.',
    serverHint: 'Use for manual interaction and accessibility checks.',
  },
] as const;

export function getScenario(
  id: TestScenario['id'],
  scenarios: readonly TestScenario[] = TEST_SCENARIOS,
): TestScenario {
  const scenario = scenarios.find((candidate) => candidate.id === id);

  if (!scenario) {
    throw new Error(`Unknown Turnstile test scenario: ${id}`);
  }

  return scenario;
}
