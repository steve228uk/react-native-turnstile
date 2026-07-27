import type { SiteverifyResponse } from './siteverify-types';

export type { SiteverifyResponse } from './siteverify-types';

export async function verifyWithDevelopmentServer({
  endpoint,
  token,
}: {
  endpoint: string;
  token: string;
}): Promise<SiteverifyResponse> {
  if (!endpoint) {
    throw new Error(
      'Set EXPO_PUBLIC_SITEVERIFY_URL to the development Siteverify server.',
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  const result = (await response.json()) as SiteverifyResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      result.error ?? `Siteverify server returned ${response.status}`,
    );
  }

  return result;
}
