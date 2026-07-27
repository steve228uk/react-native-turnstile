# React Native Turnstile

[![npm version](https://img.shields.io/npm/v/%40steve228uk%2Freact-native-turnstile)](https://www.npmjs.com/package/@steve228uk/react-native-turnstile)
[![CI](https://github.com/steve228uk/react-native-turnstile/actions/workflows/ci.yml/badge.svg)](https://github.com/steve228uk/react-native-turnstile/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A typed Cloudflare Turnstile component for React Native and Expo, powered by
`react-native-webview`.

- Inline HTML: no hosted intermediary page to deploy or trust
- Automatic widget height updates
- Managed Turnstile lifecycle callbacks
- Imperative render, execute, reset, remove, and response APIs
- Flat, typed widget configuration, status, and errors
- iOS and Android support through `react-native-webview`

## Installation

Install the package and its WebView peer dependency:

```sh
npm install @steve228uk/react-native-turnstile react-native-webview
```

With Expo, let Expo select the compatible WebView version:

```sh
npm install @steve228uk/react-native-turnstile
npx expo install react-native-webview
```

For a bare React Native iOS application, install pods after adding the
dependency:

```sh
npx pod-install
```

The package requires React 18 or later, React Native 0.76 or later, and
`react-native-webview` 13.12 or later.

## Quick start

Create a Turnstile widget in the
[Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile),
add your application's chosen hostname to its allowlist, and use the public
site key in the app.

```tsx
import { useRef } from 'react';
import { Button, View } from 'react-native';
import {
  Turnstile,
  type TurnstileError,
  type TurnstileRef,
} from '@steve228uk/react-native-turnstile';

export function SignInChallenge() {
  const turnstile = useRef<TurnstileRef>(null);

  const verifyOnBackend = async (token: string) => {
    const response = await fetch('https://api.example.com/auth/turnstile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      await turnstile.current?.reset();
    }
  };

  const handleError = (error: TurnstileError) => {
    console.warn('Turnstile failed', error.code);
  };

  return (
    <View>
      <Turnstile
        ref={turnstile}
        siteKey="0x4AAAAAAA..."
        baseUrl="https://app.example.com"
        widgetMode="managed"
        action="sign_in"
        theme="auto"
        onVerify={verifyOnBackend}
        onError={handleError}
      />

      <Button title="Try again" onPress={() => turnstile.current?.reset()} />
    </View>
  );
}
```

`siteKey` is safe to include in the application. A Turnstile **secret key is
not**: keep it on your backend.

### Why `baseUrl` is required

The component generates its HTML in memory and passes `baseUrl` to the WebView
as the document's origin. It does not fetch a page from that URL.

Use a stable HTTPS URL in production whose hostname is allowed for the widget
in Cloudflare, for example `https://app.example.com`. HTTP is useful only for a
local development origin such as `http://localhost`. The origin is part of
Turnstile's security context, so do not use an unrelated third-party hostname.

## Explicit execution

Turnstile can defer visible interaction until your application asks it to
execute:

```tsx
function CheckoutChallenge() {
  const turnstile = useRef<TurnstileRef>(null);
  const [ready, setReady] = useState(false);

  return (
    <>
      <Turnstile
        ref={turnstile}
        siteKey="0x4AAAAAAA..."
        baseUrl="https://app.example.com"
        widgetMode="managed"
        action="checkout"
        appearance="interaction-only"
        execution="execute"
        onReady={() => setReady(true)}
        onVerify={(token) => submitOrder(token)}
      />
      <Button
        title="Continue"
        disabled={!ready}
        onPress={() => turnstile.current?.execute()}
      />
    </>
  );
}
```

Enable the action after `onReady` provides the widget ID. Imperative calls made
before the component is ready reject with a `bridge-not-ready` error.

The component renders the widget when its inline document is ready. `render()`
is available when you need to re-create a widget after calling `remove()`:

```ts
const widgetId = await turnstile.current?.render();
```

## Gate protected actions with a fresh token

Keep the action disabled until a current token exists, lock it while the
request is in flight, and reset after every attempt because Turnstile tokens
are single-use:

```tsx
const turnstile = useRef<TurnstileRef>(null);
const [token, setToken] = useState<string | null>(null);
const [submitting, setSubmitting] = useState(false);

const submit = async () => {
  if (!token || submitting) return;
  setSubmitting(true);

  try {
    await fetch('https://api.example.com/protected-action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ turnstileToken: token }),
    });
  } finally {
    await turnstile.current?.reset();
    setSubmitting(false);
  }
};

<Turnstile
  ref={turnstile}
  siteKey="0x4AAAAAAA..."
  baseUrl="https://app.example.com"
  widgetMode="managed"
  onTokenChange={setToken}
/>;

<Button disabled={!token || submitting} title="Submit" onPress={submit} />;
```

## API

### `Turnstile`

`Turnstile` is available as both the named and default export.

| Prop                  | Type                                            | Description                                                         |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `siteKey`             | `string`                                        | Public site key from the Cloudflare widget.                         |
| `baseUrl`             | `string`                                        | HTTP(S) document origin with a hostname allowed by the widget.      |
| `widgetMode`          | `'managed' \| 'invisible' \| 'non-interactive'` | Mode configured for this site key in the Cloudflare dashboard.      |
| `theme`               | `'light' \| 'dark' \| 'auto'`                   | Widget color theme.                                                 |
| `size`                | `'normal' \| 'flexible' \| 'compact'`           | Widget layout size.                                                 |
| `appearance`          | `'always' \| 'execute' \| 'interaction-only'`   | When a managed widget is visible.                                   |
| `execution`           | `'render' \| 'execute'`                         | Whether verification starts on render or an imperative `execute()`. |
| `language`            | `string`                                        | Cloudflare language code, or `auto`.                                |
| `action`              | `string`                                        | Server-validated action name included in Siteverify results.        |
| `cData`               | `string`                                        | Custom data included in Siteverify results.                         |
| `tabIndex`            | `number`                                        | Widget iframe tab index.                                            |
| `retry`               | `'auto' \| 'never'`                             | Whether Turnstile retries after an error.                           |
| `retryInterval`       | `number`                                        | Delay in milliseconds before an automatic retry.                    |
| `refreshExpired`      | `'auto' \| 'manual' \| 'never'`                 | Token-expiry refresh behavior.                                      |
| `refreshTimeout`      | `'auto' \| 'manual' \| 'never'`                 | Interactive-timeout refresh behavior.                               |
| `feedbackEnabled`     | `boolean`                                       | Whether Cloudflare's feedback flow is available.                    |
| `responseField`       | `boolean`                                       | Create Turnstile's hidden response input; defaults to `false`.      |
| `autoHeight`          | `boolean`                                       | Apply measured document height; defaults to `true`.                 |
| `minHeight`           | `number`                                        | Lower height bound; defaults to `0`.                                |
| `maxHeight`           | `number`                                        | Upper height bound; defaults to `10000`.                            |
| `commandTimeout`      | `number`                                        | Imperative-command timeout; defaults to `10000` ms.                 |
| `webViewProps`        | `TurnstileWebViewProps`                         | Additional supported `react-native-webview` props.                  |
| `onVerify`            | `(token: string) => void`                       | Receive a token to send to your backend.                            |
| `onTokenChange`       | `(token: string \| null) => void`               | Observe the current token, including invalidation.                  |
| `onError`             | `(error: TurnstileError) => void`               | Receive a typed widget or bridge error.                             |
| `onExpire`            | `() => void`                                    | Called when the current token expires.                              |
| `onTimeout`           | `() => void`                                    | Called when an interactive challenge times out.                     |
| `onBeforeInteractive` | `() => void`                                    | Called before an interactive challenge appears.                     |
| `onAfterInteractive`  | `() => void`                                    | Called after an interactive challenge finishes.                     |
| `onInteractiveChange` | `(interactive: boolean) => void`                | Observe whether an interactive challenge is active.                 |
| `onUnsupported`       | `() => void`                                    | Called when Turnstile does not support the client.                  |
| `onReady`             | `(widgetId: string) => void`                    | Called when the rendered widget can accept commands.                |
| `onStatusChange`      | `(status: TurnstileStatus) => void`             | Observe lifecycle status changes.                                   |
| `onHeightChange`      | `(height: number) => void`                      | Observe clamped document-height updates.                            |
| `onNavigationBlocked` | `(url: string) => void`                         | Observe navigation rejected by the component.                       |

The component also accepts React Native `ViewProps`. `webViewProps` is typed to
exclude WebView fields owned by the component's bridge and security boundary.

### `TurnstileRef`

| Method          | Result                    | Description                                           |
| --------------- | ------------------------- | ----------------------------------------------------- |
| `render()`      | `Promise<string>`         | Render the widget and resolve with its widget ID.     |
| `execute()`     | `Promise<void>`           | Execute an explicitly rendered widget.                |
| `reset()`       | `Promise<void>`           | Reset the widget and invalidate its current response. |
| `remove()`      | `Promise<void>`           | Remove the current widget instance.                   |
| `getResponse()` | `Promise<string \| null>` | Read the current response, if one exists.             |
| `isExpired()`   | `Promise<boolean>`        | Check whether the current response has expired.       |

Imperative calls wait for a response from the inline bridge and reject on
errors or after `commandTimeout`. Treat a value from `getResponse()` the same
as a value from `onVerify`: it still requires backend verification.

### Widget modes

`widgetMode` must match the mode configured for the site key in Cloudflare:

- `managed` lets Cloudflare decide whether interaction is needed;
- `non-interactive` shows the non-interactive widget without asking the user
  to solve a challenge;
- `invisible` is a true invisible widget intended for imperative execution.

A managed widget with `appearance="interaction-only"` is not an invisible
widget. It stays out of view when no interaction is needed, but Cloudflare can
show it when interaction is required. Use `widgetMode="invisible"` only with a
site key configured as Invisible in the dashboard.

Cloudflare requires applications using Invisible mode to reference the
[Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/)
in their own privacy policy.

```tsx
function InvisibleChallenge() {
  const turnstile = useRef<TurnstileRef>(null);

  return (
    <>
      <Turnstile
        ref={turnstile}
        siteKey="0x4AAAAAAA..."
        baseUrl="https://app.example.com"
        widgetMode="invisible"
        action="background_check"
        execution="execute"
        onVerify={(token) => continueWith(token)}
      />
      <Button title="Continue" onPress={() => turnstile.current?.execute()} />
    </>
  );
}
```

## Verify every token on your backend

Client-side completion is not authorization. Send the token to your backend
and call
[Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
before performing the protected action.

```ts
type SiteverifyResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
};

export async function verifyTurnstileToken(token: string, remoteIp?: string) {
  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
    response: token,
  });

  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    },
  );

  if (!response.ok) {
    throw new Error('Turnstile verification request failed');
  }

  const result = (await response.json()) as SiteverifyResponse;

  if (
    !result.success ||
    result.action !== 'sign_in' ||
    result.hostname !== 'app.example.com'
  ) {
    throw new Error('Turnstile verification was rejected');
  }

  return result;
}
```

Tokens are short-lived and single-use. Do not cache them, share them between
submissions, or accept the same token for concurrent requests. Fail closed when
Siteverify is unavailable or rejects the response.

## Security boundaries

This package is a token acquisition UI. It intentionally does not provide:

- client-side token verification;
- a hosted HTML page;
- Cloudflare pre-clearance;
- clearance-cookie creation or sharing with the system browser;
- delivery of a secret key to the app.

The WebView loads Cloudflare's Turnstile script from
`challenges.cloudflare.com`. Review Cloudflare's privacy and data-processing
terms for your application and users.

## Troubleshooting

**The widget is blank or reports an invalid domain**

Check that `baseUrl` is an HTTPS URL (or an HTTP local-development URL) and that
its hostname is allowed in the Cloudflare widget configuration. Confirm the
device can reach `challenges.cloudflare.com`.

**The backend rejects a token**

Use the secret for the same widget as the public site key, consume the token
only once, and submit it promptly. If you set `action`, validate the same value
on the backend.

**The component is the wrong height**

Leave `autoHeight` enabled for dynamic sizing. If you disable it, provide an
explicit height through the component's `style`.

**I need `cf_clearance` or pre-clearance**

This component does not support pre-clearance or browser-cookie workflows. Use
Turnstile as a challenge token and authorize the protected action only after
Siteverify succeeds on your backend.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).

## License

MIT © 2026 Stephen Radford
