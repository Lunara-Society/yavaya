import { SERVER_URL } from '../core/env';

/**
 * The business layer's only door to the server. Every request carries the
 * app's session (business/auth.tsx) as `Authorization: Bearer`, the same
 * session the website keeps in its cookie, so the server applies exactly the
 * rules it applies to the website: who may see what, limits, credits.
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null;

/** Set by the auth provider when a session starts or ends. */
export function setSessionToken(value: string | null): void {
  token = value;
}

export function sessionToken(): string | null {
  return token;
}

const DEFAULT_TIMEOUT_MS = 8000;

function headers(json: boolean): Record<string, string> {
  return {
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

const absolute = (path: string) => (path.startsWith('http') ? path : `${SERVER_URL}${path}`);

/** A request that never throws: what the tools and screens need to decide what to say. */
export async function apiRequest(
  path: string,
  options: { method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'; body?: unknown; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(absolute(path), {
      method: options.method ?? 'GET',
      headers: headers(options.body !== undefined),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

/** A GET that throws on failure, for screens that show a loading state and an error. */
export async function getJson<T = unknown>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const result = await apiRequest(url, { timeoutMs });
  if (!result.ok) throw new ApiError(result.status, `HTTP ${result.status}`);
  return result.body as T;
}
