import {
  generateTurnstileHtml,
  getFallbackSize,
  TURNSTILE_API_URL,
  validateBaseUrl,
  validateSiteKey,
} from '../../src/html';
import { TurnstileError } from '../../src/types';

function expectTurnstileError(
  operation: () => unknown,
  code: TurnstileError['code'],
) {
  try {
    operation();
    throw new Error('Expected operation to throw.');
  } catch (error) {
    expect(error).toBeInstanceOf(TurnstileError);
    expect((error as TurnstileError).code).toBe(code);
  }
}

describe('base URL validation', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['https://example.com/path?q=1#fragment', 'https://example.com'],
    ['https://example.com:8443/path', 'https://example.com:8443'],
    ['http://localhost:3000/path', 'http://localhost:3000'],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
    ['http://[::1]:3000/example', 'http://[::1]:3000'],
  ])('normalizes %s to its origin', (input, expected) => {
    expect(validateBaseUrl(input)).toBe(expected);
  });

  it.each([
    '',
    'example.com',
    'http://example.com',
    'ftp://example.com',
    'https://user:password@example.com',
  ])('rejects unsafe base URL %p', (input) => {
    expectTurnstileError(() => validateBaseUrl(input), 'invalid-base-url');
  });

  it('trims a valid site key and rejects an empty one', () => {
    expect(validateSiteKey('  site-key  ')).toBe('site-key');
    expectTurnstileError(() => validateSiteKey(' '), 'invalid-site-key');
  });
});

describe('fallback sizing', () => {
  it('uses documented widget dimensions', () => {
    expect(getFallbackSize('managed')).toEqual({
      width: 300,
      height: 65,
      collapsed: false,
    });
    expect(getFallbackSize('non-interactive', { size: 'compact' })).toEqual({
      width: 150,
      height: 140,
      collapsed: false,
    });
    expect(getFallbackSize('managed', { size: 'flexible' })).toEqual({
      width: '100%',
      height: 65,
      collapsed: false,
    });
  });

  it('starts invisible and transient appearances collapsed', () => {
    expect(getFallbackSize('invisible').collapsed).toBe(true);
    expect(
      getFallbackSize('managed', { appearance: 'interaction-only' }).collapsed,
    ).toBe(true);
    expect(
      getFallbackSize('managed', { appearance: 'execute' }).collapsed,
    ).toBe(true);
  });
});

describe('generated Turnstile page', () => {
  const page = () =>
    generateTurnstileHtml({
      siteKey: 'site-key',
      instanceId: 'instance-1',
      nonce: 'nonce-1',
      widgetMode: 'managed',
      options: {
        action: 'sign-in',
        cData: 'opaque-data',
        tabIndex: 3,
        retryInterval: 2_500,
        refreshExpired: 'manual',
        refreshTimeout: 'never',
        feedbackEnabled: false,
        responseFieldName: 'turnstile-token',
      },
    });

  it('loads the fixed explicit API under a nonce-bound CSP', () => {
    const html = page();

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'nonce-nonce-1' 'strict-dynamic'");
    expect(html).toContain(`script.src = ${JSON.stringify(TURNSTILE_API_URL)}`);
    expect(TURNSTILE_API_URL).toContain('render=explicit');
    expect(html).not.toMatch(/pre[-_]?clearance/i);
  });

  it('maps flat React props to Cloudflare render parameters', () => {
    const html = page();

    expect(html).toContain('"action":"sign-in"');
    expect(html).toContain('"cData":"opaque-data"');
    expect(html).toContain('"tabindex":3');
    expect(html).toContain('"retry-interval":2500');
    expect(html).toContain('"refresh-expired":"manual"');
    expect(html).toContain('"refresh-timeout":"never"');
    expect(html).toContain('"feedback-enabled":false');
    expect(html).toContain('"response-field-name":"turnstile-token"');
    expect(html).toContain('"response-field":false');
  });

  it('escapes configuration values out of HTML/script contexts', () => {
    const html = generateTurnstileHtml({
      siteKey: '</script><script>alert(1)</script>',
      instanceId: 'instance',
      nonce: 'nonce',
      widgetMode: 'managed',
      options: { action: '</script>' },
    });

    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c/script>');
  });

  it('uses an instance-scoped, acknowledged command bridge', () => {
    const html = page();

    expect(html).toContain('version: config.version');
    expect(html).toContain('instanceId: config.instanceId');
    expect(html).toContain("post('command-result'");
    expect(html).toContain("case 'getResponse'");
    expect(html).toContain("case 'isExpired'");
    expect(html).toContain("post('ready', { widgetId: readyWidgetId })");
    expect(html).toContain("normalizeErrorCode(code, 'command-failed')");
  });

  it('measures dynamic challenges with observer and polling fallbacks', () => {
    const html = page();

    expect(html).toContain('new ResizeObserver(queueMeasure)');
    expect(html).toContain('resizeObserver.observe(document.documentElement)');
    expect(html).toContain("root.querySelector('iframe')");
    expect(html).toContain('new MutationObserver(function ()');
    expect(html).toContain('fallbackTimer = setInterval(measure, 500)');
    expect(html).toContain('Math.abs(height - lastHeight) >= 0.5');
    expect(html).toContain('if (measureFrame !== null) return');
  });

  it('implements transient and invisible collapse rules', () => {
    const html = page();

    expect(html).toContain("config.widgetMode === 'invisible' ? true");
    expect(html).toContain("config.options.appearance === 'interaction-only'");
    expect(html).toContain("config.options.appearance === 'execute'");
    expect(html).toContain("status('interactive')");
    expect(html).toContain("status('timed-out')");

    const afterInteractive = html.slice(
      html.indexOf("'after-interactive-callback'"),
      html.indexOf("'unsupported-callback'"),
    );
    expect(afterInteractive).not.toContain('setCollapsed(true)');
  });

  it('expands execute-appearance widgets when automatic execution starts', () => {
    const html = generateTurnstileHtml({
      siteKey: 'site-key',
      instanceId: 'instance',
      nonce: 'nonce',
      widgetMode: 'non-interactive',
      options: { appearance: 'execute', execution: 'render' },
    });
    const automaticExecution = html.slice(
      html.indexOf("if (config.options.execution !== 'execute')"),
      html.indexOf('widgetId = window.turnstile.render'),
    );

    expect(automaticExecution).toContain('expandForExecution()');
  });
});
