import React, { createRef } from 'react';
import type * as ReactTypes from 'react';
import type * as ReactNativeTypes from 'react-native';
import { act, render } from '@testing-library/react-native';

import { Turnstile, type TurnstileProps, type TurnstileRef } from '../../src';

const mockInjectJavaScript = jest.fn<void, [string]>();
const mockStopLoading = jest.fn<void, []>();

interface MockWebViewHandle {
  injectJavaScript(script: string): void;
  stopLoading(): void;
}

jest.mock('react-native-webview', () => {
  const ReactModule = jest.requireActual<typeof ReactTypes>('react');
  const ReactNativeModule =
    jest.requireActual<typeof ReactNativeTypes>('react-native');

  const MockWebView = ReactModule.forwardRef<
    MockWebViewHandle,
    Record<string, unknown>
  >((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({
      injectJavaScript: mockInjectJavaScript,
      stopLoading: mockStopLoading,
    }));
    return ReactModule.createElement(ReactNativeModule.View, {
      ...(props as React.ComponentProps<typeof ReactNativeModule.View>),
      testID: 'mock-webview',
    });
  });

  return {
    __esModule: true,
    default: MockWebView,
    WebView: MockWebView,
  };
});

const defaultProps: TurnstileProps = {
  siteKey: 'site-key',
  baseUrl: 'https://example.com/path',
  widgetMode: 'managed',
};

type TestScreen = Awaited<ReturnType<typeof render>>;
type TestNode = ReturnType<TestScreen['getByTestId']>;

interface MockWebViewProps {
  source: { html: string; baseUrl: string };
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  onShouldStartLoadWithRequest: (request: {
    url: string;
    isTopFrame: boolean;
  }) => boolean;
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  cacheEnabled: boolean;
  incognito: boolean;
  sharedCookiesEnabled: boolean;
  thirdPartyCookiesEnabled: boolean;
}

function getWebViewProps(webView: TestNode): MockWebViewProps {
  return webView.props as unknown as MockWebViewProps;
}

function getInjectedCommandId(callIndex: number): string {
  const script = mockInjectJavaScript.mock.calls.at(callIndex)?.[0];
  const commandId = script?.match(/\\"commandId\\":\\"([^\\"]+)/)?.[1];
  if (!commandId) {
    throw new Error(`No command id in injected script ${callIndex}.`);
  }
  return commandId;
}

async function bridgeMessage(
  webView: TestNode,
  type: string,
  payload?: unknown,
  instanceId?: string,
) {
  const props = getWebViewProps(webView);
  const html = props.source.html;
  const currentInstance =
    instanceId ?? html.match(/"instanceId":"([^"]+)"/)?.[1];
  await act(() => {
    props.onMessage({
      nativeEvent: {
        data: JSON.stringify({
          version: 1,
          instanceId: currentInstance,
          type,
          payload,
        }),
      },
    });
  });
}

describe('Turnstile', () => {
  beforeEach(() => {
    mockInjectJavaScript.mockReset();
    mockStopLoading.mockReset();
  });

  it('forwards View props and owns security-sensitive WebView props', async () => {
    const onLoad = jest.fn();
    const screen = await render(
      <Turnstile
        {...defaultProps}
        testID="outer"
        nativeID="turnstile-native"
        style={{ height: 999, opacity: 0.5 }}
        webViewProps={{ onLoad }}
      />,
    );

    expect(screen.getByTestId('outer')).toHaveProp(
      'nativeID',
      'turnstile-native',
    );
    expect(screen.getByTestId('outer')).toHaveStyle({
      height: 65,
      opacity: 0.5,
    });
    const props = getWebViewProps(screen.getByTestId('mock-webview'));
    expect(props.originWhitelist).toEqual(['*']);
    expect(props.javaScriptEnabled).toBe(true);
    expect(props.domStorageEnabled).toBe(true);
    expect(props.cacheEnabled).toBe(true);
    expect(props.incognito).toBe(false);
    expect(props.sharedCookiesEnabled).toBe(true);
    expect(props.thirdPartyCookiesEnabled).toBe(true);
    expect(props.source.baseUrl).toBe('https://example.com');
  });

  it('allows only initial/same-origin and subframe navigation', async () => {
    const onNavigationBlocked = jest.fn();
    const screen = await render(
      <Turnstile {...defaultProps} onNavigationBlocked={onNavigationBlocked} />,
    );
    const guard = getWebViewProps(
      screen.getByTestId('mock-webview'),
    ).onShouldStartLoadWithRequest;

    expect(guard({ url: 'about:blank', isTopFrame: true })).toBe(true);
    expect(guard({ url: 'about:srcdoc', isTopFrame: true })).toBe(true);
    expect(
      guard({ url: 'https://example.com/allowed', isTopFrame: true }),
    ).toBe(true);
    expect(
      guard({
        url: 'https://challenges.cloudflare.com/frame',
        isTopFrame: false,
      }),
    ).toBe(true);
    expect(guard({ url: 'https://attacker.example', isTopFrame: true })).toBe(
      false,
    );
    expect(onNavigationBlocked).toHaveBeenCalledWith(
      'https://attacker.example',
    );
  });

  it('routes lifecycle, token, status, and interaction messages', async () => {
    const callbacks = {
      onReady: jest.fn(),
      onVerify: jest.fn(),
      onTokenChange: jest.fn(),
      onStatusChange: jest.fn(),
      onInteractiveChange: jest.fn(),
      onBeforeInteractive: jest.fn(),
      onAfterInteractive: jest.fn(),
      onExpire: jest.fn(),
    };
    const screen = await render(<Turnstile {...defaultProps} {...callbacks} />);
    const webView = screen.getByTestId('mock-webview');

    await bridgeMessage(webView, 'ready', { widgetId: 'widget-1' });
    await bridgeMessage(webView, 'before-interactive');
    await bridgeMessage(webView, 'after-interactive');
    await bridgeMessage(webView, 'verify', { token: 'token-1' });
    await bridgeMessage(webView, 'status', { status: 'verified' });
    await bridgeMessage(webView, 'expired');

    expect(callbacks.onReady).toHaveBeenCalledWith('widget-1');
    expect(callbacks.onVerify).toHaveBeenCalledWith('token-1');
    expect(callbacks.onTokenChange.mock.calls).toEqual([['token-1'], [null]]);
    expect(callbacks.onInteractiveChange.mock.calls).toEqual([[true], [false]]);
    expect(callbacks.onBeforeInteractive).toHaveBeenCalledTimes(1);
    expect(callbacks.onAfterInteractive).toHaveBeenCalledTimes(1);
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('verified');
    expect(callbacks.onExpire).toHaveBeenCalledTimes(1);
  });

  it('reports typed widget errors and clears a current token', async () => {
    const onError = jest.fn();
    const onTokenChange = jest.fn();
    const screen = await render(
      <Turnstile
        {...defaultProps}
        onError={onError}
        onTokenChange={onTokenChange}
      />,
    );
    const webView = screen.getByTestId('mock-webview');

    await bridgeMessage(webView, 'verify', { token: 'token' });
    await bridgeMessage(webView, 'error', {
      code: '110200',
      message: 'Unknown domain',
    });

    expect(onTokenChange.mock.calls).toEqual([['token'], [null]]);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TurnstileError',
        code: '110200',
        message: 'Unknown domain',
      }),
    );
  });

  it('clamps measured height and retains a 1x1 execution surface collapsed', async () => {
    const onHeightChange = jest.fn();
    const screen = await render(
      <Turnstile
        {...defaultProps}
        minHeight={50}
        maxHeight={100}
        onHeightChange={onHeightChange}
        testID="outer"
      />,
    );
    const webView = screen.getByTestId('mock-webview');

    await bridgeMessage(webView, 'height', {
      height: 200,
      collapsed: false,
    });
    expect(screen.getByTestId('outer')).toHaveStyle({ height: 100 });
    expect(onHeightChange).toHaveBeenLastCalledWith(100);

    await bridgeMessage(webView, 'height', {
      height: 65,
      collapsed: true,
    });
    expect(screen.getByTestId('outer')).toHaveStyle({ height: 0 });
    expect(screen.getByTestId('mock-webview')).toHaveStyle({
      height: 1,
      width: 1,
    });
    expect(onHeightChange).toHaveBeenLastCalledWith(0);
  });

  it('applies measurements received while automatic height is disabled', async () => {
    const onHeightChange = jest.fn();
    const screen = await render(
      <Turnstile
        {...defaultProps}
        autoHeight={false}
        onHeightChange={onHeightChange}
        style={{ height: 90 }}
        testID="outer"
      />,
    );
    const webView = screen.getByTestId('mock-webview');

    await bridgeMessage(webView, 'height', {
      height: 140,
      collapsed: false,
    });
    expect(screen.getByTestId('outer')).toHaveStyle({ height: 90 });
    expect(onHeightChange).not.toHaveBeenCalled();

    await screen.rerender(
      <Turnstile
        {...defaultProps}
        autoHeight
        onHeightChange={onHeightChange}
        style={{ height: 90 }}
        testID="outer"
      />,
    );
    expect(screen.getByTestId('outer')).toHaveStyle({ height: 140 });
    expect(onHeightChange).toHaveBeenCalledWith(140);
  });

  it('rejects commands before ready with a typed error', async () => {
    const ref = createRef<TurnstileRef>();
    await render(<Turnstile {...defaultProps} ref={ref} />);

    await expect(ref.current?.execute()).rejects.toEqual(
      expect.objectContaining({
        code: 'bridge-not-ready',
      }),
    );
  });

  it('resolves imperative commands only after their acknowledgement', async () => {
    const ref = createRef<TurnstileRef>();
    const onReady = jest.fn();
    const screen = await render(
      <Turnstile {...defaultProps} ref={ref} onReady={onReady} />,
    );
    const webView = screen.getByTestId('mock-webview');
    await bridgeMessage(webView, 'ready', { widgetId: 'widget-1' });

    const response = ref.current!.getResponse();
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    const commandId = getInjectedCommandId(0);

    await bridgeMessage(webView, 'command-result', {
      commandId,
      ok: true,
      value: 'token',
    });
    await expect(response).resolves.toBe('token');

    const renderPromise = ref.current!.render();
    const renderCommandId = getInjectedCommandId(1);
    await bridgeMessage(webView, 'command-result', {
      commandId: renderCommandId,
      ok: true,
      value: 'widget-2',
    });
    await expect(renderPromise).resolves.toBe('widget-2');
    expect(onReady).toHaveBeenLastCalledWith('widget-2');
  });

  it('rejects outstanding commands and ignores stale events on config reload', async () => {
    const ref = createRef<TurnstileRef>();
    const onVerify = jest.fn();
    const screen = await render(
      <Turnstile {...defaultProps} ref={ref} onVerify={onVerify} />,
    );
    const firstWebView = screen.getByTestId('mock-webview');
    const firstInstance = getWebViewProps(firstWebView).source.html.match(
      /"instanceId":"([^"]+)"/,
    )?.[1];
    await bridgeMessage(firstWebView, 'ready', { widgetId: 'widget-1' });
    const pending = ref.current!.execute();
    const reloadRejection = expect(pending).rejects.toEqual(
      expect.objectContaining({ code: 'bridge-reloaded' }),
    );

    await screen.rerender(
      <Turnstile
        {...defaultProps}
        siteKey="new-site-key"
        ref={ref}
        onVerify={onVerify}
      />,
    );

    await reloadRejection;
    const secondWebView = screen.getByTestId('mock-webview');
    await bridgeMessage(
      secondWebView,
      'verify',
      { token: 'stale-token' },
      firstInstance,
    );
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('does not reload the bridge for layout or callback-only changes', async () => {
    const ref = createRef<TurnstileRef>();
    const firstStatus = jest.fn();
    const secondStatus = jest.fn();
    const screen = await render(
      <Turnstile
        {...defaultProps}
        ref={ref}
        maxHeight={100}
        onStatusChange={firstStatus}
      />,
    );
    const firstWebView = screen.getByTestId('mock-webview');
    const firstHtml = getWebViewProps(firstWebView).source.html;
    await bridgeMessage(firstWebView, 'ready', { widgetId: 'widget' });

    await screen.rerender(
      <Turnstile
        {...defaultProps}
        ref={ref}
        maxHeight={200}
        onStatusChange={secondStatus}
      />,
    );
    const secondWebView = screen.getByTestId('mock-webview');
    expect(getWebViewProps(secondWebView).source.html).toBe(firstHtml);

    const pending = ref.current!.isExpired();
    const commandId = getInjectedCommandId(0);
    await bridgeMessage(secondWebView, 'command-result', {
      commandId,
      ok: true,
      value: false,
    });
    await expect(pending).resolves.toBe(false);
  });

  it('times out an unacknowledged command', async () => {
    jest.useFakeTimers();
    const ref = createRef<TurnstileRef>();
    const screen = await render(
      <Turnstile {...defaultProps} ref={ref} commandTimeout={25} />,
    );
    await bridgeMessage(screen.getByTestId('mock-webview'), 'ready', {
      widgetId: 'widget',
    });
    const pending = ref.current!.execute();
    const timeoutRejection = expect(pending).rejects.toEqual(
      expect.objectContaining({ code: 'command-timeout' }),
    );

    await act(() => {
      jest.advanceTimersByTime(25);
    });

    await timeoutRejection;
    jest.useRealTimers();
  });
});
