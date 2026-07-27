import type { ComponentProps } from 'react';
import type { ViewProps } from 'react-native';
import type WebView from 'react-native-webview';

import type { TurnstileErrorCode } from './error-codes';
import type { TurnstileStatus } from './status';

export type {
  TurnstileErrorCode,
  TurnstileWidgetErrorCode,
} from './error-codes';
export type { TurnstileStatus } from './status';

export type TurnstileTheme = 'light' | 'dark' | 'auto';
export type TurnstileSize = 'normal' | 'flexible' | 'compact';
export type TurnstileWidgetMode = 'managed' | 'non-interactive' | 'invisible';
export type TurnstileAppearance = 'always' | 'execute' | 'interaction-only';
export type TurnstileExecution = 'render' | 'execute';
export type TurnstileRetry = 'auto' | 'never';
export type TurnstileRefreshExpired = 'auto' | 'manual' | 'never';
export type TurnstileRefreshTimeout = 'auto' | 'manual' | 'never';

/**
 * Options passed to `turnstile.render`.
 *
 * React-friendly camelCase names are converted to Cloudflare's documented
 * kebab-case names in the generated page.
 */
export interface TurnstileOptions {
  action?: string;
  cData?: string;
  theme?: TurnstileTheme;
  language?: string;
  tabIndex?: number;
  size?: TurnstileSize;
  appearance?: TurnstileAppearance;
  execution?: TurnstileExecution;
  retry?: TurnstileRetry;
  retryInterval?: number;
  refreshExpired?: TurnstileRefreshExpired;
  refreshTimeout?: TurnstileRefreshTimeout;
  responseField?: boolean;
  responseFieldName?: string;
  feedbackEnabled?: boolean;
}

export class TurnstileError extends Error {
  readonly code: TurnstileErrorCode;
  readonly cause?: unknown;

  constructor(
    code: TurnstileErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'TurnstileError';
    this.code = code;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, TurnstileError.prototype);
  }
}

type OwnedWebViewProp =
  | 'ref'
  | 'source'
  | 'style'
  | 'containerStyle'
  | 'originWhitelist'
  | 'onMessage'
  | 'onShouldStartLoadWithRequest'
  | 'onNavigationStateChange'
  | 'onOpenWindow'
  | 'injectedJavaScript'
  | 'injectedJavaScriptBeforeContentLoaded'
  | 'javaScriptEnabled'
  | 'domStorageEnabled'
  | 'scrollEnabled'
  | 'setSupportMultipleWindows'
  | 'allowFileAccess'
  | 'allowFileAccessFromFileURLs'
  | 'allowUniversalAccessFromFileURLs'
  | 'mixedContentMode'
  | 'incognito'
  | 'cacheEnabled'
  | 'cacheMode'
  | 'sharedCookiesEnabled'
  | 'thirdPartyCookiesEnabled'
  | 'userAgent'
  | 'applicationNameForUserAgent';

/**
 * Safe WebView customization surface. Security-, bridge-, source-, and sizing-
 * sensitive properties are owned by Turnstile.
 */
export type TurnstileWebViewProps = Omit<
  ComponentProps<typeof WebView>,
  OwnedWebViewProp
>;

export interface TurnstileRef {
  render(): Promise<string>;
  execute(): Promise<void>;
  reset(): Promise<void>;
  remove(): Promise<void>;
  getResponse(): Promise<string | null>;
  isExpired(): Promise<boolean>;
}

export interface TurnstileProps
  extends Omit<ViewProps, 'tabIndex'>, TurnstileOptions {
  /** The public key from the Cloudflare Turnstile widget configuration. */
  siteKey: string;
  /**
   * The absolute page origin registered for the widget, for example
   * `https://example.com`. It becomes the WebView's base URL.
   */
  baseUrl: string;
  /** The widget mode selected in the Cloudflare dashboard. */
  widgetMode: TurnstileWidgetMode;
  autoHeight?: boolean;
  minHeight?: number;
  maxHeight?: number;
  commandTimeout?: number;
  webViewProps?: TurnstileWebViewProps;
  onVerify?: (token: string) => void;
  onTokenChange?: (token: string | null) => void;
  onError?: (error: TurnstileError) => void;
  onExpire?: () => void;
  onTimeout?: () => void;
  onBeforeInteractive?: () => void;
  onAfterInteractive?: () => void;
  onInteractiveChange?: (interactive: boolean) => void;
  onUnsupported?: () => void;
  onReady?: (widgetId: string) => void;
  onStatusChange?: (status: TurnstileStatus) => void;
  onHeightChange?: (height: number) => void;
  onNavigationBlocked?: (url: string) => void;
}
