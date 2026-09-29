import { sessionHint, sessionStore } from '../auth/session';
import type { AuthResponse, ProblemDetails } from './types';

/**
 * Empty by default, so every request goes to the same origin with a relative URL:
 * the Vite dev server proxies /api to the backend and in Docker the backend serves
 * the app. Set VITE_API_URL only to reach a backend on another origin.
 */
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

export const NETWORK_ERROR_MESSAGE =
  'Kunde inte ansluta till servern. Kontrollera din anslutning och försök igen.';

const STATUS_MESSAGES: Partial<Record<number, string>> = {
  400: 'Uppgifterna kunde inte godkännas. Kontrollera dem och försök igen.',
  401: 'Du behöver logga in igen.',
  403: 'Du har inte behörighet att utföra den här åtgärden.',
  404: 'Det du söker kunde inte hittas.',
  409: 'Uppgifterna har ändrats av någon annan. Ladda om sidan och försök igen.',
  413: 'Filen är för stor.',
  415: 'Filformatet stöds inte.',
  429: 'För många försök. Vänta en stund och försök igen.',
};

function defaultMessage(status: number): string {
  const known = STATUS_MESSAGES[status];
  if (known) return known;
  if (status >= 500) return 'Ett tekniskt fel uppstod. Försök igen om en stund.';
  return 'Något gick fel. Försök igen.';
}

/** An API error parsed from an RFC 7807 ProblemDetails body. `detail` is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly title: string | undefined;
  readonly extensions: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    detail: string,
    options: { title?: string; extensions?: Record<string, unknown> } = {},
  ) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.title = options.title;
    this.extensions = options.extensions ?? {};
  }
}

/** A user-facing Swedish message for any error thrown by the API layer. */
export function getErrorMessage(error: unknown, fallback = 'Något gick fel. Försök igen.'): string {
  if (error instanceof ApiError) return error.detail;
  return fallback;
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

const STANDARD_PROBLEM_KEYS = new Set(['type', 'title', 'status', 'detail', 'instance', 'errors', 'traceId']);

async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails | null = null;
  if ((response.headers.get('Content-Type') ?? '').includes('json')) {
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      problem = null;
    }
  }
  if (!problem || typeof problem !== 'object') {
    return new ApiError(response.status, defaultMessage(response.status));
  }

  let message = typeof problem.detail === 'string' && problem.detail.trim() ? problem.detail : undefined;
  // ASP.NET validation problems carry their messages in `errors` instead of `detail`.
  if (!message && problem.errors && typeof problem.errors === 'object') {
    message = Object.values(problem.errors)
      .flat()
      .find((value): value is string => typeof value === 'string' && value.trim() !== '');
  }

  const extensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(problem)) {
    if (!STANDARD_PROBLEM_KEYS.has(key)) extensions[key] = value;
  }

  return new ApiError(response.status, message ?? defaultMessage(response.status), {
    title: typeof problem.title === 'string' ? problem.title : undefined,
    extensions,
  });
}

// ---------------------------------------------------------------- Session refresh

let refreshPromise: Promise<AuthResponse | null> | null = null;

async function performRefresh(): Promise<AuthResponse | null> {
  try {
    const response = await fetch(buildUrl('/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      if (response.status === 401) sessionHint.set(false);
      return null;
    }
    const auth = (await response.json()) as AuthResponse;
    sessionStore.setFromAuth(auth);
    return auth;
  } catch {
    return null;
  }
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share
 * one request, since the backend rotates the cookie and a second parallel refresh would fail.
 * Resolves to null when there is no valid session.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

let authFailureHandler: (() => void) | null = null;

/** Called once when the session has expired and could not be refreshed. */
export function setAuthFailureHandler(handler: (() => void) | null) {
  authFailureHandler = handler;
}

function handleAuthFailure() {
  const hadSession = sessionStore.get() !== null;
  sessionStore.clear();
  // Concurrent requests can all end up here; only the first one had a session to lose.
  if (hadSession) authFailureHandler?.();
}

// ---------------------------------------------------------------- Requests

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  query?: QueryParams;
  /** Sent as JSON, unless it is FormData or a Blob. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Do not refresh the session and retry on 401 (the auth endpoints themselves). */
  skipAuthRefresh?: boolean;
  /** Do not send the Authorization header. */
  anonymous?: boolean;
}

type CallOptions = Omit<RequestOptions, 'method' | 'body'>;

export function buildUrl(path: string, query?: QueryParams): string {
  let url = `${API_BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
  }
  return url;
}

async function attempt(
  url: string,
  options: RequestOptions,
  accept: string,
): Promise<{ response: Response; token: string | null }> {
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', accept);

  let body: BodyInit | undefined;
  if (options.body instanceof FormData || options.body instanceof Blob) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const token = options.anonymous ? null : sessionStore.getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    });
    return { response, token };
  } catch (error) {
    // Let React Query see cancellations as cancellations.
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
}

async function ensureOk(response: Response): Promise<Response> {
  if (!response.ok) throw await toApiError(response);
  return response;
}

async function send(path: string, options: RequestOptions, accept: string): Promise<Response> {
  const url = buildUrl(path, options.query);
  const first = await attempt(url, options, accept);
  if (first.response.status !== 401 || options.skipAuthRefresh || options.anonymous) {
    return ensureOk(first.response);
  }

  // Another request may already have renewed the token while this one was in flight.
  const latestToken = sessionStore.getAccessToken();
  const renewed =
    latestToken !== null && latestToken !== first.token ? true : (await refreshSession()) !== null;
  if (!renewed) {
    handleAuthFailure();
    return ensureOk(first.response);
  }

  const second = await attempt(url, options, accept);
  if (second.response.status === 401) handleAuthFailure();
  return ensureOk(second.response);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options, 'application/json');
  if (response.status === 204 || response.status === 205) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, 'Servern skickade ett oväntat svar. Försök igen.');
  }
}

export interface DownloadedFile {
  blob: Blob;
  filename: string | null;
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // Fall back to the plain filename parameter.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Fetches a file with the Authorization header (a plain link could not send the token). */
export async function apiDownload(path: string, options: CallOptions = {}): Promise<DownloadedFile> {
  const response = await send(path, { ...options, method: 'GET' }, 'text/csv, */*;q=0.8');
  const blob = await response.blob();
  return { blob, filename: filenameFromContentDisposition(response.headers.get('Content-Disposition')) };
}

export const api = {
  get<T>(path: string, options?: CallOptions) {
    return apiRequest<T>(path, { ...options, method: 'GET' });
  },
  post<T>(path: string, body?: unknown, options?: CallOptions) {
    return apiRequest<T>(path, { ...options, method: 'POST', body });
  },
  put<T>(path: string, body?: unknown, options?: CallOptions) {
    return apiRequest<T>(path, { ...options, method: 'PUT', body });
  },
};
