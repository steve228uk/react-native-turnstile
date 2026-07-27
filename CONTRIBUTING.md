# Contributing

Thanks for helping improve `@steve228uk/react-native-turnstile`.

## Before you start

- Search existing issues and pull requests before opening a new one.
- Use a discussion or feature request for substantial API changes before
  investing in an implementation.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

This repository uses [Bun](https://bun.sh/) for dependency management and
scripts.

```sh
git clone https://github.com/steve228uk/react-native-turnstile.git
cd react-native-turnstile
bun install --frozen-lockfile
```

Run the full local checks before opening a pull request:

```sh
bun run lint
bun run typecheck
bun run test
bun run build
```

Use the example application for changes that affect native rendering or user
interaction. Check both iOS and Android when the change is not
platform-specific.

## Implementation guidelines

- Keep the package API small and typed.
- Preserve compatibility with React Native and `react-native-webview`.
- Keep the Turnstile document inline. The package must not depend on a hosted
  intermediary page.
- Treat messages from the WebView as untrusted input and validate their shape.
- Preserve automatic height updates without introducing layout loops.
- Never add a Turnstile secret key to the client package or example app.
- Do not imply that a client token is valid until a backend has verified it
  with Cloudflare Siteverify.
- Avoid pre-clearance, cookie, or browser-session assumptions; the component is
  a token acquisition UI.

Add or update tests for behavior changes. Documentation-only changes do not
need new tests, but should still pass formatting and link checks where
available.

## Commits and releases

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add an execution option
fix: ignore stale WebView messages
docs: explain server-side verification
```

Use `feat!:` or a `BREAKING CHANGE:` footer only for an intentionally breaking
public API change. Releases follow Semantic Versioning and are prepared by
Release Please from the commit history.

### Maintainer release setup

The `0.1.0` package must be bootstrapped manually because npm cannot attach a
trusted publisher to a package that does not exist yet:

1. Sign in to npm locally with the package owner's account and complete 2FA.
2. Check out the intended `0.1.0` release commit, run
   `bun install --frozen-lockfile`, then run `bun run verify`.
3. Publish once with
   `npm publish --access public --provenance=false`. Disabling provenance is
   limited to this local bootstrap because npm provenance is generated in CI.
4. Create the `v0.1.0` tag and GitHub release from that same commit.
5. In the npm package settings, add a GitHub Actions trusted publisher for
   `steve228uk/react-native-turnstile` using the workflow filename
   `release.yml`. Do not set an npm token or an npm environment unless the
   workflow is updated to match it.

After the bootstrap, merging a Release Please pull request creates the GitHub
release and `.github/workflows/release.yml` publishes it using npm OIDC with
Node.js 24. Do not add a long-lived `NPM_TOKEN`.

## Pull requests

Keep pull requests focused. In the description:

- explain the problem and the chosen approach;
- link related issues;
- list the checks you ran;
- call out public API, platform, accessibility, or security effects;
- include screenshots or recordings for visible changes.

By contributing, you agree that your contributions are licensed under the
project's MIT License.
