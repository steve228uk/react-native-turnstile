import type { SiteverifyResponse } from '../src/harness/siteverify-types';

interface VerifyRequest {
  token?: unknown;
}

export type SiteverifyFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const CLOUDFLARE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface DevelopmentServerConfig {
  secret: string;
  expectedHostname: string;
  expectedAction: string;
  hostname: string;
  port: number;
}

export interface SiteverifyHandlerOptions {
  secret: string;
  expectedHostname: string;
  expectedAction: string;
  fetchSiteverify?: SiteverifyFetch;
}

export function readDevelopmentServerConfig(
  env: Record<string, string | undefined>,
): DevelopmentServerConfig {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'The example Siteverify server must not run in production.',
    );
  }

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      'Missing TURNSTILE_SECRET_KEY. Copy example/.env.example to example/.env.',
    );
  }

  const expectedHostname = env.TURNSTILE_EXPECTED_HOSTNAME;
  if (!expectedHostname) {
    throw new Error(
      'Missing TURNSTILE_EXPECTED_HOSTNAME. This check must be server-owned.',
    );
  }

  const expectedAction = env.TURNSTILE_EXPECTED_ACTION;
  if (!expectedAction) {
    throw new Error(
      'Missing TURNSTILE_EXPECTED_ACTION. This check must be server-owned.',
    );
  }

  const port = Number(env.SITEVERIFY_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SITEVERIFY_PORT must be an integer from 1 to 65535.');
  }

  return {
    secret,
    expectedHostname,
    expectedAction,
    hostname: env.SITEVERIFY_HOST ?? '127.0.0.1',
    port,
  };
}

function corsHeaders(): HeadersInit {
  const configuredOrigin: unknown = process.env.TURNSTILE_ALLOWED_ORIGIN;

  return {
    'access-control-allow-origin':
      typeof configuredOrigin === 'string'
        ? configuredOrigin
        : 'http://localhost:8081',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');

  for (const [name, value] of Object.entries(corsHeaders())) {
    headers.set(name, String(value));
  }

  return Response.json(body, { ...init, headers });
}

export function validateVerifyRequest(
  value: unknown,
): { ok: true; token: string } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'Expected a JSON object.' };
  }

  const body = value as VerifyRequest;

  if (typeof body.token !== 'string' || body.token.length === 0) {
    return { ok: false, error: 'token must be a non-empty string.' };
  }

  return { ok: true, token: body.token };
}

export function validateExpectedFields(
  response: SiteverifyResponse,
  expectedHostname: string,
  expectedAction: string,
): SiteverifyResponse {
  const errors = [...(response['error-codes'] ?? [])];

  if (response.success && response.hostname !== expectedHostname) {
    errors.push('hostname-mismatch');
  }

  if (response.success && response.action !== expectedAction) {
    errors.push('action-mismatch');
  }

  if (errors.length === 0) {
    return response;
  }

  return {
    ...response,
    success: false,
    'error-codes': errors,
  };
}

export async function handleRequest(
  request: Request,
  {
    secret,
    expectedHostname,
    expectedAction,
    fetchSiteverify = fetch,
  }: SiteverifyHandlerOptions,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === '/health' && request.method === 'GET') {
    return json({ ok: true, service: 'turnstile-siteverify-development' });
  }

  if (url.pathname !== '/siteverify' || request.method !== 'POST') {
    return json({ error: 'Not found.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = validateVerifyRequest(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  const form = new FormData();
  form.set('secret', secret);
  form.set('response', parsed.token);
  form.set('idempotency_key', crypto.randomUUID());

  const connectingIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (connectingIp) {
    form.set('remoteip', connectingIp);
  }

  let cloudflareResponse: Response;
  try {
    cloudflareResponse = await fetchSiteverify(CLOUDFLARE_SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return json(
      {
        error: 'Cloudflare Siteverify request failed.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  if (!cloudflareResponse.ok) {
    return json(
      { error: `Cloudflare Siteverify returned ${cloudflareResponse.status}.` },
      { status: 502 },
    );
  }

  const result = (await cloudflareResponse.json()) as SiteverifyResponse;

  return json(validateExpectedFields(result, expectedHostname, expectedAction));
}

export function startDevelopmentServer(): ReturnType<typeof Bun.serve> {
  const { secret, expectedHostname, expectedAction, hostname, port } =
    readDevelopmentServerConfig(process.env);

  const server = Bun.serve({
    hostname,
    port,
    fetch: (request) =>
      handleRequest(request, { secret, expectedHostname, expectedAction }),
  });

  console.info(
    `Development Siteverify server listening on http://${hostname}:${server.port}`,
  );

  return server;
}

if (import.meta.main) {
  startDevelopmentServer();
}
