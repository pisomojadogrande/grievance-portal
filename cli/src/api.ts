export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any = {}) {
    super(message);
  }
}

export interface ApiOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export async function request<T>(opts: ApiOptions, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const url = opts.baseUrl + path.replace(/^\//, '');
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new ApiError(0, timedOut ? 'Request timed out' : `Could not reach ${url}: ${err?.message ?? err}`);
  }
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON (e.g. API Gateway 504 page) */ }
  if (!res.ok) {
    const msg = json.message || (res.status === 504 ? 'Gateway timed out' : `HTTP ${res.status}`);
    throw new ApiError(res.status, msg, json);
  }
  return json as T;
}
