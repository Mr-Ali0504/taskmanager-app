// Shared plumbing for the two Meta platforms (Instagram and Facebook Pages), which use the same Graph API.
import { decrypt } from '../crypto';
import type { AccountRow } from '../db/schema';
import { env } from '../env';
import { fileBody, qs, requestJson } from './http';

export interface MetaTokens {
  /** A Page access token. Instagram accounts are reached through the Page they are linked to. */
  pageToken: string;
}

export const GRAPH = () => `https://graph.facebook.com/${env.meta.graphVersion}`;
export const pageToken = (account: AccountRow) => (JSON.parse(decrypt(account.tokens)) as MetaTokens).pageToken;

type Params = Record<string, string | number | boolean | undefined>;

export const graphGet = <T = any>(token: string, path: string, params: Params = {}) =>
  requestJson<T>(`${GRAPH()}/${path}?${qs({ ...params, access_token: token })}`);

export const graphPost = <T = any>(token: string, path: string, params: Params = {}, base = GRAPH()) =>
  requestJson<T>(`${base}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: qs({ ...params, access_token: token }),
  });

/** Meta's "rupload" endpoints take the whole file as the request body, with the size in headers. */
export const rupload = (url: string, token: string, filePath: string, sizeBytes: number, onPercent: (p: number) => void) =>
  requestJson(url, {
    method: 'POST',
    headers: { authorization: `OAuth ${token}`, offset: '0', file_size: String(sizeBytes), 'content-length': String(sizeBytes) },
    ...fileBody(filePath, sizeBytes, onPercent),
  });

/** Insights come back as [{ values: [{ value, end_time }] }]; flatten that to daily points. */
export function insightPoints(data: any): { date: string; value: number }[] {
  const values: { value: unknown; end_time: string }[] = data?.data?.[0]?.values ?? [];
  return values
    .filter((v) => typeof v.value === 'number')
    .map((v) => ({ date: v.end_time.slice(0, 10), value: v.value as number }));
}

export const sinceUntil = (days: number) => {
  const until = Math.floor(Date.now() / 1000);
  return { since: until - days * 86_400, until };
};
