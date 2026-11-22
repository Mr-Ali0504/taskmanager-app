import fs from 'node:fs';
import { Readable } from 'node:stream';
import { PlatformError } from './types';

/**
 * Pulls a readable message out of an error response. Google and Meta use several shapes
 * ({error:{message}}, {error:"...", error_description}, and Meta's upload hosts use {debug_info:{message}}),
 * so anything unrecognised falls back to the raw response text rather than a bare status code.
 */
function describeError(status: number, body: unknown, raw: string): { message: string; needsReauth: boolean } {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  const e = o.error;
  let message = '';
  let code: unknown;
  if (typeof e === 'string') {
    message = o.error_description ?? e;
    code = e;
  } else if (e && typeof e === 'object') {
    message = [e.error_user_title, e.error_user_msg || e.message].filter(Boolean).join(': ');
    code = e.code;
    // Meta's numeric codes are what its documentation and support pages are indexed by.
    const codes = [e.code != null && `code ${e.code}`, e.error_subcode != null && `subcode ${e.error_subcode}`].filter(Boolean).join(', ');
    if (codes) message += ` (${codes})`;
    const reasons = Array.isArray(e.errors) ? e.errors.map((x: any) => x?.reason).filter(Boolean).join(', ') : '';
    if (reasons) message += ` [${reasons}]`;
  } else if (o.debug_info && typeof o.debug_info === 'object') {
    message = [o.debug_info.type, o.debug_info.message].filter(Boolean).join(': ');
  }
  if (!message.trim()) {
    const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    message = text ? `HTTP ${status}: ${text.slice(0, 400)}` : `HTTP ${status} with an empty response`;
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
    body = null;
  }
  const failed = !res.ok || Boolean(body && typeof body === 'object' && ((body as any).error || ((body as any).debug_info && (body as any).success === false)));
  if (failed) {
    const { message, needsReauth } = describeError(res.status, body, text);
    throw new PlatformError(message, needsReauth);
  }
  return body as T;
}

/** Names the step that failed, so an error says where in a multi-step upload things went wrong. */
export async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof PlatformError) throw new PlatformError(`${label}: ${e.message}`, e.needsReauth);
    throw new PlatformError(`${label}: ${e instanceof Error ? ((e.cause as Error | undefined)?.message ?? e.message) : 'unknown error'}`);
  }
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
