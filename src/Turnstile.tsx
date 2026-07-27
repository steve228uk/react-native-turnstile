import React, {
  forwardRef,
  type ComponentProps,
  type ComponentType,
  type RefAttributes,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import {
  createCommandScript,
  errorFromCommandResult,
  parseBridgeMessage,
  TURNSTILE_BRIDGE_VERSION,
  type TurnstileCommand,
  type TurnstileCommandName,
} from './bridge';
import {
  generateTurnstileHtml,
  getFallbackSize,
  validateBaseUrl,
  validateSiteKey,
} from './html';
import {
  TurnstileError,
  type TurnstileErrorCode,
  type TurnstileProps,
  type TurnstileRef,
  type TurnstileStatus,
} from './types';

const DEFAULT_COMMAND_TIMEOUT = 10_000;
const MAX_WEBVIEW_HEIGHT = 10_000;
let nextInstance = 0;

interface PendingCommand {
  command: TurnstileCommandName;
  resolve: (value: unknown) => void;
  reject: (error: TurnstileError) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface LatestLayout {
  instanceId: string;
  height: number;
  collapsed: boolean;
}

interface WebViewHandle {
  injectJavaScript(script: string): void;
  stopLoading(): void;
}

type NativeWebViewProps = ComponentProps<typeof WebView>;
type WebViewMessageEvent = Parameters<
  NonNullable<NativeWebViewProps['onMessage']>
>[0];
type ShouldStartRequest = Parameters<
  NonNullable<NativeWebViewProps['onShouldStartLoadWithRequest']>
>[0];
type WebViewNavigation = Parameters<
  NonNullable<NativeWebViewProps['onNavigationStateChange']>
>[0];

const ControlledWebView = WebView as unknown as ComponentType<
  NativeWebViewProps & RefAttributes<WebViewHandle>
>;

function createIdentifier(prefix: string): string {
  nextInstance += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextInstance.toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function sameOrigin(url: string, baseUrl: string): boolean {
  if (url === 'about:blank' || url === 'about:srcdoc') {
    return true;
  }

  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function errorMessageForCode(code: TurnstileErrorCode): string {
  switch (code) {
    case 'script-load-error':
      return 'Could not load the Cloudflare Turnstile API.';
    case 'bridge-error':
      return 'The Turnstile bridge reported an error.';
    default:
      return `Turnstile reported error ${code}.`;
  }
}

function resolveHeight(
  measuredHeight: number,
  collapsed: boolean,
  minimum: number,
  maximum: number,
): number {
  return collapsed ? 0 : Math.min(maximum, Math.max(minimum, measuredHeight));
}

export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(
  function Turnstile(
    {
      siteKey,
      baseUrl,
      widgetMode,
      theme,
      size,
      appearance,
      execution,
      language,
      action,
      cData,
      tabIndex,
      retry,
      retryInterval,
      refreshExpired,
      refreshTimeout,
      feedbackEnabled,
      responseField = false,
      responseFieldName,
      autoHeight = true,
      minHeight = 0,
      maxHeight,
      commandTimeout = DEFAULT_COMMAND_TIMEOUT,
      webViewProps,
      onVerify,
      onTokenChange,
      onError,
      onExpire,
      onTimeout,
      onBeforeInteractive,
      onAfterInteractive,
      onInteractiveChange,
      onUnsupported,
      onReady,
      onStatusChange,
      onHeightChange,
      onNavigationBlocked,
      ...viewProps
    },
    forwardedRef,
  ) {
    const normalizedBaseUrl = useMemo(
      () => validateBaseUrl(baseUrl),
      [baseUrl],
    );
    const normalizedSiteKey = useMemo(
      () => validateSiteKey(siteKey),
      [siteKey],
    );
    const webViewRef = useRef<WebViewHandle>(null);
    const pendingCommands = useRef(new Map<string, PendingCommand>());
    const ready = useRef(false);
    const mounted = useRef(true);
    const token = useRef<string | null>(null);
    const interactive = useRef(false);
    const latestLayout = useRef<LatestLayout | null>(null);
    const previousAutoHeight = useRef(autoHeight);
    const currentStatus = useRef<TurnstileStatus | null>(null);
    const onTokenChangeRef = useRef(onTokenChange);
    onTokenChangeRef.current = onTokenChange;
    const onInteractiveChangeRef = useRef(onInteractiveChange);
    onInteractiveChangeRef.current = onInteractiveChange;
    const onStatusChangeRef = useRef(onStatusChange);
    onStatusChangeRef.current = onStatusChange;
    const options = useMemo(
      () => ({
        theme,
        size,
        appearance,
        execution,
        language,
        action,
        cData,
        tabIndex,
        retry,
        retryInterval,
        refreshExpired,
        refreshTimeout,
        feedbackEnabled,
        responseField,
        responseFieldName,
      }),
      [
        action,
        appearance,
        cData,
        execution,
        feedbackEnabled,
        language,
        refreshExpired,
        refreshTimeout,
        responseField,
        responseFieldName,
        retry,
        retryInterval,
        size,
        tabIndex,
        theme,
      ],
    );
    const configurationKey = useMemo(
      () =>
        JSON.stringify([
          normalizedBaseUrl,
          normalizedSiteKey,
          widgetMode,
          options,
        ]),
      [normalizedBaseUrl, normalizedSiteKey, options, widgetMode],
    );
    const instanceId = useMemo(
      () => createIdentifier(`turnstile-${configurationKey.length}`),
      [configurationKey],
    );
    const nonce = useMemo(
      () => createIdentifier(`nonce-${configurationKey.length}`),
      [configurationKey],
    );
    const safeMinHeight = Number.isFinite(minHeight)
      ? Math.max(0, minHeight)
      : 0;
    const safeMaxHeight =
      maxHeight !== undefined && Number.isFinite(maxHeight)
        ? Math.max(safeMinHeight, maxHeight)
        : MAX_WEBVIEW_HEIGHT;
    const fallback = getFallbackSize(widgetMode, options);
    const fallbackHeight = resolveHeight(
      fallback.height,
      fallback.collapsed,
      safeMinHeight,
      safeMaxHeight,
    );
    const [height, setHeight] = useState(fallbackHeight);

    const updateToken = useCallback((nextToken: string | null) => {
      if (token.current === nextToken) {
        return;
      }
      token.current = nextToken;
      onTokenChangeRef.current?.(nextToken);
    }, []);
    const updateInteractive = useCallback((nextInteractive: boolean) => {
      if (interactive.current === nextInteractive) {
        return;
      }
      interactive.current = nextInteractive;
      onInteractiveChangeRef.current?.(nextInteractive);
    }, []);

    const updateStatus = useCallback((status: TurnstileStatus) => {
      if (currentStatus.current === status) {
        return;
      }
      currentStatus.current = status;
      onStatusChangeRef.current?.(status);
    }, []);

    const clearChallengeState = useCallback(() => {
      updateInteractive(false);
      updateToken(null);
    }, [updateInteractive, updateToken]);

    const rejectPending = useCallback(
      (code: TurnstileErrorCode, message: string) => {
        for (const pending of pendingCommands.current.values()) {
          clearTimeout(pending.timer);
          pending.reject(new TurnstileError(code, message));
        }
        pendingCommands.current.clear();
      },
      [],
    );

    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        ready.current = false;
        clearChallengeState();
        rejectPending(
          'component-unmounted',
          'The Turnstile component was unmounted before the command completed.',
        );
      };
    }, [clearChallengeState, rejectPending]);

    useEffect(() => {
      ready.current = false;
      clearChallengeState();
      rejectPending(
        'bridge-reloaded',
        'The Turnstile page changed before the command completed.',
      );
      currentStatus.current = null;
      updateStatus('loading');
    }, [instanceId, clearChallengeState, rejectPending, updateStatus]);

    useLayoutEffect(() => {
      const wasAutoHeightEnabled = previousAutoHeight.current;
      previousAutoHeight.current = autoHeight;
      if (!autoHeight) {
        return;
      }

      const latest = latestLayout.current;
      const nextHeight =
        latest?.instanceId === instanceId
          ? resolveHeight(
              latest.height,
              latest.collapsed,
              safeMinHeight,
              safeMaxHeight,
            )
          : fallbackHeight;
      setHeight(nextHeight);
      if (!wasAutoHeightEnabled && latest?.instanceId === instanceId) {
        onHeightChange?.(nextHeight);
      }
    }, [
      autoHeight,
      fallbackHeight,
      instanceId,
      onHeightChange,
      safeMaxHeight,
      safeMinHeight,
    ]);

    const html = useMemo(
      () =>
        generateTurnstileHtml({
          siteKey: normalizedSiteKey,
          instanceId,
          nonce,
          options,
          widgetMode,
        }),
      [instanceId, nonce, normalizedSiteKey, options, widgetMode],
    );

    const runCommand = useCallback(
      <Result,>(command: TurnstileCommandName): Promise<Result> => {
        if (!mounted.current) {
          return Promise.reject(
            new TurnstileError(
              'component-unmounted',
              'The Turnstile component is not mounted.',
            ),
          );
        }
        if (!ready.current || !webViewRef.current) {
          return Promise.reject(
            new TurnstileError(
              'bridge-not-ready',
              'Wait for onReady before calling Turnstile commands.',
            ),
          );
        }

        const commandId = createIdentifier('command');
        const bridgeCommand: TurnstileCommand = {
          version: TURNSTILE_BRIDGE_VERSION,
          instanceId,
          commandId,
          command,
        };

        return new Promise<Result>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingCommands.current.delete(commandId);
            reject(
              new TurnstileError(
                'command-timeout',
                `The Turnstile ${command} command was not acknowledged within ${commandTimeout}ms.`,
              ),
            );
          }, commandTimeout);

          pendingCommands.current.set(commandId, {
            command,
            resolve: resolve as (value: unknown) => void,
            reject,
            timer,
          });

          try {
            webViewRef.current?.injectJavaScript(
              createCommandScript(bridgeCommand),
            );
          } catch (cause) {
            clearTimeout(timer);
            pendingCommands.current.delete(commandId);
            reject(
              new TurnstileError(
                'bridge-error',
                `Could not send the Turnstile ${command} command.`,
                { cause },
              ),
            );
          }
        });
      },
      [commandTimeout, instanceId],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        render: () => runCommand<string>('render'),
        execute: () => runCommand<void>('execute'),
        reset: async () => {
          await runCommand<void>('reset');
          updateToken(null);
        },
        remove: async () => {
          await runCommand<void>('remove');
          updateToken(null);
        },
        getResponse: () => runCommand<string | null>('getResponse'),
        isExpired: () => runCommand<boolean>('isExpired'),
      }),
      [runCommand, updateToken],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const message = parseBridgeMessage(event.nativeEvent.data, instanceId);
        if (!message) {
          return;
        }

        switch (message.type) {
          case 'ready':
            ready.current = true;
            onReady?.(message.payload.widgetId);
            return;
          case 'status':
            updateStatus(message.payload.status);
            return;
          case 'verify':
            updateInteractive(false);
            updateToken(message.payload.token);
            onVerify?.(message.payload.token);
            return;
          case 'error': {
            clearChallengeState();
            const error = new TurnstileError(
              message.payload.code,
              message.payload.message ??
                errorMessageForCode(message.payload.code),
            );
            updateStatus('error');
            onError?.(error);
            return;
          }
          case 'expired':
            clearChallengeState();
            updateStatus('expired');
            onExpire?.();
            return;
          case 'timeout':
            clearChallengeState();
            updateStatus('timed-out');
            onTimeout?.();
            return;
          case 'before-interactive':
            updateInteractive(true);
            onBeforeInteractive?.();
            return;
          case 'after-interactive':
            updateInteractive(false);
            onAfterInteractive?.();
            return;
          case 'unsupported':
            clearChallengeState();
            updateStatus('unsupported');
            onUnsupported?.();
            return;
          case 'height': {
            const measuredHeight = Math.ceil(message.payload.height);
            const collapsedHeight = message.payload.collapsed ?? false;
            latestLayout.current = {
              instanceId,
              height: measuredHeight,
              collapsed: collapsedHeight,
            };
            if (!autoHeight) {
              return;
            }
            const nextHeight = resolveHeight(
              measuredHeight,
              collapsedHeight,
              safeMinHeight,
              safeMaxHeight,
            );
            setHeight(nextHeight);
            onHeightChange?.(nextHeight);
            return;
          }
          case 'command-result': {
            const pending = pendingCommands.current.get(
              message.payload.commandId,
            );
            if (!pending) {
              return;
            }
            clearTimeout(pending.timer);
            pendingCommands.current.delete(message.payload.commandId);
            if (message.payload.ok) {
              if (
                pending.command === 'render' &&
                typeof message.payload.value === 'string'
              ) {
                ready.current = true;
                onReady?.(message.payload.value);
              }
              pending.resolve(message.payload.value);
            } else {
              pending.reject(errorFromCommandResult(message.payload.error));
            }
          }
        }
      },
      [
        autoHeight,
        clearChallengeState,
        instanceId,
        onAfterInteractive,
        onBeforeInteractive,
        onError,
        onExpire,
        onHeightChange,
        onReady,
        onTimeout,
        onUnsupported,
        onVerify,
        safeMaxHeight,
        safeMinHeight,
        updateStatus,
        updateInteractive,
        updateToken,
      ],
    );

    const shouldStartNavigation = useCallback(
      (request: ShouldStartRequest) => {
        if (request.isTopFrame === false) {
          return true;
        }
        const allowed = sameOrigin(request.url, normalizedBaseUrl);
        if (!allowed) {
          onNavigationBlocked?.(request.url);
        }
        return allowed;
      },
      [normalizedBaseUrl, onNavigationBlocked],
    );

    const handleNavigationStateChange = useCallback(
      (navigation: WebViewNavigation) => {
        if (!sameOrigin(navigation.url, normalizedBaseUrl)) {
          onNavigationBlocked?.(navigation.url);
          webViewRef.current?.stopLoading();
        }
      },
      [normalizedBaseUrl, onNavigationBlocked],
    );

    const source = useMemo(
      () => ({ html, baseUrl: normalizedBaseUrl }),
      [html, normalizedBaseUrl],
    );
    const collapsed = autoHeight && height === 0;
    const webViewDimensions = autoHeight
      ? {
          height: collapsed ? 1 : height,
          width: collapsed ? 1 : ('100%' as const),
        }
      : { flex: 1, width: '100%' as const };
    const webViewContainerStyle = autoHeight
      ? { ...webViewDimensions, overflow: 'hidden' as const }
      : { flex: 1, overflow: 'hidden' as const };

    return (
      <View
        {...viewProps}
        style={[
          viewProps.style,
          autoHeight ? { height, overflow: 'hidden' } : undefined,
        ]}
      >
        <ControlledWebView
          {...webViewProps}
          ref={webViewRef}
          key={instanceId}
          source={source}
          originWhitelist={['*']}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={shouldStartNavigation}
          onNavigationStateChange={handleNavigationStateChange}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          incognito={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          style={[{ backgroundColor: 'transparent' }, webViewDimensions]}
          containerStyle={webViewContainerStyle}
        />
      </View>
    );
  },
);

Turnstile.displayName = 'Turnstile';
