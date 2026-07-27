# Expo SDK 57 harness

This private app exercises the package's public React Native API on Expo SDK 57
and the New Architecture. It includes Cloudflare's official deterministic
Turnstile sitekeys, lifecycle instrumentation, sizing controls, forwarded
native/accessibility props, imperative ref commands, and a development-only
Siteverify boundary.

## Run the app

From the repository root:

```sh
bun install
cp example/.env.example example/.env
bun --cwd example start
```

`react-native-webview` is supported by Expo Go. For a physical device, set
`SITEVERIFY_HOST=0.0.0.0` and replace `127.0.0.1` in
`EXPO_PUBLIC_SITEVERIFY_URL` with the development computer's LAN IP. Keep this
server on a trusted development network. The widget `baseUrl` remains the
hostname Cloudflare returns during Siteverify and must match the server-only
expected hostname.

Set `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and
`EXPO_PUBLIC_TURNSTILE_BASE_URL` to make a real widget the default harness
scenario. The base URL is used as the inline document origin; the package does
not request a page from it.

## Run Siteverify locally

In another terminal:

```sh
bun --cwd example server
```

The server refuses to start in production or without all three required
server-only values:

- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_EXPECTED_HOSTNAME`
- `TURNSTILE_EXPECTED_ACTION`

Only `EXPO_PUBLIC_SITEVERIFY_URL` is bundled into the app. Never rename the
secret or expected-value variables with an `EXPO_PUBLIC_` prefix.

The example env uses Cloudflare's always-pass test secret. To demonstrate
duplicate-token rejection, switch `TURNSTILE_SECRET_KEY` to the documented
`3x0000000000000000000000000000000AA` test secret, restart the server, get a
token from a passing scenario, and verify it. The result remains
`timeout-or-duplicate`, and the harness resets immediately after the attempt.

## Checks

```sh
bun --cwd example test
bun --cwd example typecheck
```

Tests cover all five deterministic sitekeys, bounded token metadata, height
constraints, concurrent submit locking and reset, server configuration,
hostname/action mismatches, duplicate-token rejection, and the secret-bearing
form submitted to Cloudflare.
