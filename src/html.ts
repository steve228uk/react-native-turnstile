import { TURNSTILE_BRIDGE_VERSION } from './bridge';
import {
  TurnstileError,
  type TurnstileOptions,
  type TurnstileSize,
  type TurnstileWidgetMode,
} from './types';

export const TURNSTILE_API_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstilePageConfiguration {
  siteKey: string;
  instanceId: string;
  nonce: string;
  options: TurnstileOptions;
  widgetMode: TurnstileWidgetMode;
}

export interface TurnstileFallbackSize {
  width: number | '100%';
  height: number;
  collapsed: boolean;
}

function serializedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function htmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function validateBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new TurnstileError(
      'invalid-base-url',
      'baseUrl must be a non-empty absolute HTTP(S) URL.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch (cause) {
    throw new TurnstileError(
      'invalid-base-url',
      'baseUrl must be a valid absolute HTTP(S) URL.',
      { cause },
    );
  }

  const localHostname =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]';
  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    (parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && localHostname))
  ) {
    throw new TurnstileError(
      'invalid-base-url',
      'baseUrl must use HTTPS (HTTP is allowed only for localhost) and contain no credentials.',
    );
  }

  return parsed.origin;
}

export function validateSiteKey(siteKey: string): string {
  if (typeof siteKey !== 'string' || siteKey.trim() === '') {
    throw new TurnstileError(
      'invalid-site-key',
      'siteKey must be a non-empty string.',
    );
  }
  return siteKey.trim();
}

export function getFallbackSize(
  widgetMode: TurnstileWidgetMode,
  options?: Pick<TurnstileOptions, 'size' | 'appearance'>,
): TurnstileFallbackSize {
  const size: TurnstileSize = options?.size ?? 'normal';
  const collapsed =
    widgetMode === 'invisible' ||
    options?.appearance === 'interaction-only' ||
    options?.appearance === 'execute';

  switch (size) {
    case 'compact':
      return { width: 150, height: 140, collapsed };
    case 'flexible':
      return { width: '100%', height: 65, collapsed };
    case 'normal':
    default:
      return { width: 300, height: 65, collapsed };
  }
}

function toWidgetOptions(options: TurnstileOptions) {
  return {
    ...(options.action !== undefined && { action: options.action }),
    ...(options.cData !== undefined && { cData: options.cData }),
    ...(options.theme !== undefined && { theme: options.theme }),
    ...(options.language !== undefined && { language: options.language }),
    ...(options.tabIndex !== undefined && { tabindex: options.tabIndex }),
    ...(options.size !== undefined && { size: options.size }),
    ...(options.appearance !== undefined && {
      appearance: options.appearance,
    }),
    ...(options.execution !== undefined && { execution: options.execution }),
    ...(options.retry !== undefined && { retry: options.retry }),
    ...(options.retryInterval !== undefined && {
      'retry-interval': options.retryInterval,
    }),
    ...(options.refreshExpired !== undefined && {
      'refresh-expired': options.refreshExpired,
    }),
    ...(options.refreshTimeout !== undefined && {
      'refresh-timeout': options.refreshTimeout,
    }),
    'response-field': options.responseField ?? false,
    ...(options.responseFieldName !== undefined && {
      'response-field-name': options.responseFieldName,
    }),
    ...(options.feedbackEnabled !== undefined && {
      'feedback-enabled': options.feedbackEnabled,
    }),
  };
}

export function generateTurnstileHtml({
  siteKey,
  instanceId,
  nonce,
  options,
  widgetMode,
}: TurnstilePageConfiguration): string {
  const normalizedSiteKey = validateSiteKey(siteKey);
  const fallback = getFallbackSize(widgetMode, options);
  const widgetOptions = toWidgetOptions(options);
  const initialCollapsed = fallback.collapsed;
  const fallbackWidth =
    typeof fallback.width === 'number' ? `${fallback.width}px` : fallback.width;

  const configuration = serializedJson({
    version: TURNSTILE_BRIDGE_VERSION,
    instanceId,
    siteKey: normalizedSiteKey,
    options: widgetOptions,
    fallbackHeight: fallback.height,
    initialCollapsed,
    widgetMode,
  });
  const safeNonce = htmlAttribute(nonce);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'nonce-${safeNonce}' 'strict-dynamic' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; img-src data: https://challenges.cloudflare.com; style-src 'unsafe-inline'">
  <style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    #turnstile-root{width:${fallbackWidth};min-height:${fallback.height}px}
    body[data-collapsed="true"] #turnstile-root{width:0;min-height:0;height:0;overflow:hidden}
  </style>
</head>
<body data-collapsed="${initialCollapsed}">
  <div id="turnstile-root"></div>
  <script nonce="${safeNonce}">
  (function () {
    'use strict';
    var config = ${configuration};
    var root = document.getElementById('turnstile-root');
    var widgetId = null;
    var collapsed = config.initialCollapsed;
    var lastHeight = -1;
    var measureFrame = null;
    var resizeObserver = null;
    var mutationObserver = null;
    var fallbackTimer = null;

    function post(type, payload) {
      var bridge = window.ReactNativeWebView;
      if (!bridge || typeof bridge.postMessage !== 'function') return;
      bridge.postMessage(JSON.stringify({
        version: config.version,
        instanceId: config.instanceId,
        type: type,
        payload: payload
      }));
    }

    function setCollapsed(next) {
      var nextCollapsed =
        config.widgetMode === 'invisible' ? true : !!next;
      if (collapsed === nextCollapsed) {
        queueMeasure();
        return;
      }
      collapsed = nextCollapsed;
      document.body.setAttribute('data-collapsed', String(collapsed));
      lastHeight = collapsed ? 0 : config.fallbackHeight;
      post('height', {
        height: lastHeight,
        collapsed: collapsed
      });
      queueMeasure();
    }

    function collapseTransientWidget() {
      if (
        config.widgetMode === 'invisible' ||
        config.options.appearance === 'interaction-only' ||
        config.options.appearance === 'execute'
      ) {
        setCollapsed(true);
      }
    }

    function measuredHeight() {
      if (collapsed) return 0;
      var rect = root.getBoundingClientRect();
      var measured = Math.max(
        rect.height || 0,
        root.scrollHeight || 0,
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0
      );
      return measured || config.fallbackHeight;
    }

    function measure() {
      var height = measuredHeight();
      measureFrame = null;
      if (Math.abs(height - lastHeight) >= 0.5) {
        lastHeight = height;
        post('height', { height: height, collapsed: collapsed });
      }
    }

    function queueMeasure() {
      if (measureFrame !== null) return;
      if (typeof window.requestAnimationFrame === 'function') {
        measureFrame = window.requestAnimationFrame(measure);
      } else {
        measureFrame = setTimeout(measure, 0);
      }
    }

    function startMeasuring() {
      if (typeof window.ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(queueMeasure);
        resizeObserver.observe(root);
        resizeObserver.observe(document.body);
        resizeObserver.observe(document.documentElement);
      }
      if (typeof window.MutationObserver === 'function') {
        mutationObserver = new MutationObserver(function () {
          observeChallengeFrame();
          queueMeasure();
        });
        mutationObserver.observe(root, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true
        });
      }
      window.addEventListener('resize', queueMeasure);
      fallbackTimer = setInterval(measure, 500);
      queueMeasure();
    }

    function observeChallengeFrame() {
      if (!resizeObserver) return;
      var frame = root.querySelector('iframe');
      if (frame) resizeObserver.observe(frame);
    }

    function status(value) {
      post('status', { status: value });
    }

    function normalizeErrorCode(value, fallback) {
      var code = String(value || fallback);
      var internalCodes = {
        'bridge-error': true,
        'bridge-not-ready': true,
        'command-failed': true,
        'invalid-command': true,
        'script-load-error': true,
        'widget-not-rendered': true
      };
      return /^\\d{1,6}$/.test(code) || internalCodes[code] ? code : fallback;
    }

    function requireWidget() {
      if (widgetId === null) {
        var error = new Error('The Turnstile widget has not been rendered.');
        error.code = 'widget-not-rendered';
        throw error;
      }
      return widgetId;
    }

    function expandForExecution() {
      if (
        config.widgetMode !== 'invisible' &&
        config.options.appearance === 'execute'
      ) {
        setCollapsed(false);
      }
    }

    function renderWidget() {
      if (widgetId !== null) return widgetId;
      if (!window.turnstile || typeof window.turnstile.render !== 'function') {
        var unavailable = new Error('The Turnstile API is not ready.');
        unavailable.code = 'bridge-not-ready';
        throw unavailable;
      }

      var callbacks = {
        callback: function (token) {
          collapseTransientWidget();
          status('verified');
          post('verify', { token: token });
          queueMeasure();
        },
        'error-callback': function (code) {
          status('error');
          post('error', {
            code: normalizeErrorCode(code, 'command-failed'),
            message: 'Turnstile reported an error.'
          });
          queueMeasure();
        },
        'expired-callback': function () {
          collapseTransientWidget();
          status('expired');
          post('expired');
          queueMeasure();
        },
        'timeout-callback': function () {
          collapseTransientWidget();
          status('timed-out');
          post('timeout');
          queueMeasure();
        },
        'before-interactive-callback': function () {
          if (config.widgetMode !== 'invisible') setCollapsed(false);
          status('interactive');
          post('before-interactive');
        },
        'after-interactive-callback': function () {
          post('after-interactive');
        },
        'unsupported-callback': function () {
          status('unsupported');
          post('unsupported');
        }
      };

      if (config.options.execution !== 'execute') {
        expandForExecution();
      }
      widgetId = window.turnstile.render(
        root,
        Object.assign({}, config.options, callbacks, { sitekey: config.siteKey })
      );
      status('ready');
      setTimeout(observeChallengeFrame, 0);
      queueMeasure();
      return widgetId;
    }

    function runCommand(command) {
      if (
        !command ||
        command.version !== config.version ||
        command.instanceId !== config.instanceId ||
        typeof command.commandId !== 'string'
      ) {
        return;
      }

      var result;
      try {
        switch (command.command) {
          case 'render':
            result = renderWidget();
            break;
          case 'execute':
            expandForExecution();
            status('executing');
            window.turnstile.execute(requireWidget());
            break;
          case 'reset':
            window.turnstile.reset(requireWidget());
            collapseTransientWidget();
            status('ready');
            break;
          case 'remove':
            window.turnstile.remove(requireWidget());
            widgetId = null;
            setCollapsed(true);
            status('removed');
            break;
          case 'getResponse':
            result = window.turnstile.getResponse(requireWidget()) || null;
            break;
          case 'isExpired':
            result = !!window.turnstile.isExpired(requireWidget());
            break;
          default:
            var invalid = new Error('Unknown Turnstile command.');
            invalid.code = 'invalid-command';
            throw invalid;
        }
        post('command-result', {
          commandId: command.commandId,
          ok: true,
          value: result
        });
      } catch (error) {
        post('command-result', {
          commandId: command.commandId,
          ok: false,
          error: {
            code: normalizeErrorCode(
              error && error.code,
              'command-failed'
            ),
            message: String(error && error.message || 'Turnstile command failed.')
          }
        });
      }
    }

    window.__RN_TURNSTILE_COMMAND__ = function (serializedCommand) {
      try {
        runCommand(JSON.parse(serializedCommand));
      } catch (error) {
        post('error', {
          code: 'bridge-error',
          message: String(error && error.message || 'Invalid bridge command.')
        });
      }
    };

    window.__RN_TURNSTILE_API_READY__ = function () {
      try {
        var readyWidgetId = renderWidget();
        post('ready', { widgetId: readyWidgetId });
      } catch (error) {
        status('error');
        post('error', {
          code: normalizeErrorCode(error && error.code, 'command-failed'),
          message: String(error && error.message || 'Could not render Turnstile.')
        });
      }
    };

    startMeasuring();
    var script = document.createElement('script');
    script.src = ${serializedJson(TURNSTILE_API_URL)};
    script.async = true;
    script.defer = true;
    script.nonce = ${serializedJson(nonce)};
    script.onload = window.__RN_TURNSTILE_API_READY__;
    script.onerror = function () {
      status('error');
      post('error', {
        code: 'script-load-error',
        message: 'Could not load the Cloudflare Turnstile API.'
      });
    };
    document.head.appendChild(script);

    window.addEventListener('unload', function () {
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      if (fallbackTimer) clearInterval(fallbackTimer);
    });
  }());
  </script>
</body>
</html>`;
}
