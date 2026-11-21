import fs from 'node:fs';
import { Readable } from 'node:stream';
import { PlatformError } from './types';

/** Pulls the human-readable message out of a Google or Meta error body. */
function describeError(status: number, body: unknown): { message: string; needsReauth: boolean } {
  const e = (body as { error?: unknown })?.error;
  let message = `Request failed (HTTP ${status})`;
  let code: unknown;
  if (typeof e === 'string') {
    message = (body as { error_description?: string }).error_description ?? e;
    code = e;
  } else if (e && typeof e === 'object') {
    const o = e as { message?: string; error_user_msg?: string; code?: unknown; status?: string };
    message = o.error_user_msg || o.message || message;
    code = o.code;
  }
  // 401 from Google, OAuthException 190 from Meta, or a revoked refresh token.
  const needsReauth = status === 401 || code === 190 || code === 'invalid_grant';
  return { message, needsReauth };
}

export async function requestJson<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: { message: text.slice(0, 300) } };
  }
  if (!res.ok || (body && typeof body === 'object' && 'error' in body && (body as any).error)) {
    const { message, needsReauth } = describeError(res.status, body);
    throw new PlatformError(message, needsReauth);
  }
  return body as T;
}

export const qs = (params: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();

/** Streams a file from disk as a request body, reporting how much has been sent. */
export function fileBody(filePath: string, sizeBytes: number, onPercent: (p: number) => void): RequestInit {
  let sent = 0;
  let last = -1;
  const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  stream.on('data', (chunk) => {
    sent += chunk.length;
    const pct = Math.min(99, Math.floor((sent / Math.max(1, sizeBytes)) * 100));
    if (pct !== last) onPercent((last = pct));
  });
  return { body: Readable.toWeb(stream) as unknown as BodyInit, duplex: 'half' } as RequestInit;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const toInt = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
