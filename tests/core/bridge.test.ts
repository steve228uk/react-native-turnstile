import {
  createCommandScript,
  parseBridgeMessage,
  TURNSTILE_BRIDGE_VERSION,
  type TurnstileCommand,
} from '../../src/bridge';

describe('Turnstile bridge parsing', () => {
  const message = (
    type: string,
    payload?: unknown,
    overrides?: Record<string, unknown>,
  ) =>
    JSON.stringify({
      version: TURNSTILE_BRIDGE_VERSION,
      instanceId: 'current',
      type,
      payload,
      ...overrides,
    });

  it('accepts typed current-instance messages', () => {
    expect(
      parseBridgeMessage(
        message('ready', { widgetId: 'widget-id' }),
        'current',
      ),
    ).toMatchObject({
      type: 'ready',
      payload: { widgetId: 'widget-id' },
    });
    expect(
      parseBridgeMessage(
        message('height', { height: 65.25, collapsed: false }),
        'current',
      ),
    ).toMatchObject({ type: 'height' });
    expect(
      parseBridgeMessage(
        message('command-result', {
          commandId: 'command',
          ok: true,
          value: false,
        }),
        'current',
      ),
    ).toMatchObject({ type: 'command-result' });
  });

  it('ignores stale, future, unknown, and malformed messages', () => {
    expect(parseBridgeMessage('{', 'current')).toBeNull();
    expect(
      parseBridgeMessage(message('ready', { widgetId: 'id' }), 'stale'),
    ).toBeNull();
    expect(
      parseBridgeMessage(
        message(
          'ready',
          { widgetId: 'id' },
          { version: TURNSTILE_BRIDGE_VERSION + 1 },
        ),
        'current',
      ),
    ).toBeNull();
    expect(parseBridgeMessage(message('unknown'), 'current')).toBeNull();
    expect(
      parseBridgeMessage(message('ready', { widgetId: 123 }), 'current'),
    ).toBeNull();
    expect(
      parseBridgeMessage(message('status', { status: 'rendered' }), 'current'),
    ).toBeNull();
    expect(
      parseBridgeMessage(message('height', { height: -1 }), 'current'),
    ).toBeNull();
    expect(
      parseBridgeMessage(
        message('error', { code: 'made-up-code', message: 'invalid' }),
        'current',
      ),
    ).toBeNull();
    expect(
      parseBridgeMessage(
        message('command-result', {
          commandId: 'command',
          ok: false,
          error: { code: 'made-up-code', message: 'invalid' },
        }),
        'current',
      ),
    ).toBeNull();
  });

  it('accepts documented widget and internal error codes', () => {
    expect(
      parseBridgeMessage(
        message('error', { code: '110200', message: 'Unknown domain' }),
        'current',
      ),
    ).toMatchObject({ type: 'error', payload: { code: '110200' } });
    expect(
      parseBridgeMessage(
        message('error', {
          code: 'script-load-error',
          message: 'Could not load script',
        }),
        'current',
      ),
    ).toMatchObject({
      type: 'error',
      payload: { code: 'script-load-error' },
    });
  });

  it('serializes commands without allowing script termination', () => {
    const command: TurnstileCommand = {
      version: TURNSTILE_BRIDGE_VERSION,
      instanceId: '</script>',
      commandId: 'command-1',
      command: 'execute',
    };
    const script = createCommandScript(command);

    expect(script).toContain('window.__RN_TURNSTILE_COMMAND__');
    expect(script).toContain('\\\\u003c/script>');
    expect(script.endsWith('true;')).toBe(true);
  });
});
