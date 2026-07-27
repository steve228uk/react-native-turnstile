# Security policy

## Supported versions

Security fixes are provided for the latest published release.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| Older releases | No        |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** button in the Security tab to submit a
private report. If private vulnerability reporting is unavailable, contact the
maintainer privately using the contact details on
[Stephen Radford's GitHub profile](https://github.com/steve228uk).

Include:

- the affected package version and platforms;
- a minimal reproduction or proof of concept;
- the security impact and any known mitigations;
- whether the issue has been disclosed elsewhere.

You should receive an acknowledgement after the report is reviewed. The
maintainer will coordinate validation, remediation, release, and disclosure
with you. Please allow a reasonable remediation period before public
disclosure.

## Security model

This package renders Cloudflare Turnstile in an inline document inside
`react-native-webview` and returns a token to the React Native application. It
does not:

- verify tokens;
- accept or contain a Turnstile secret key;
- provide a hosted intermediary page;
- establish pre-clearance or manage Cloudflare clearance cookies;
- prove that a user, request, or device is trustworthy by itself.

Applications must send each token to their backend and verify it with
[Cloudflare Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
before performing the protected action. Tokens are short-lived and
single-use. Keep the secret key on the backend, reject verification failures,
and validate expected metadata such as the action or hostname where applicable.
