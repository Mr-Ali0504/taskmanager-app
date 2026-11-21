// YouTube Data API v3 + YouTube Analytics API.
// Docs: https://developers.google.com/youtube/v3/docs  |  https://developers.google.com/youtube/analytics
import { eq } from 'drizzle-orm';
import type { YouTubeFields } from '../../shared/platforms';
import { decrypt, encrypt } from '../crypto';
import { db, schema } from '../db';
import type { AccountRow } from '../db/schema';
import { env } from '../env';
import { fileBody, isoDay, qs, requestJson, toInt } from './http';
import { PlatformError, type PlatformAdapter } from './types';

const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Google access tokens last about an hour, so refresh shortly before they expire. */
async function accessToken(account: AccountRow): Promise<string> {
  const tokens = JSON.parse(decrypt(account.tokens)) as GoogleTokens;
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new PlatformError('YouTube access expired. Reconnect this channel.', true);
  const fresh = await requestJson<{ access_token: string; expires_in: number }>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: qs({
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const next: GoogleTokens = { ...tokens, accessToken: fresh.access_token, expiresAt: Date.now() + fresh.expires_in * 1000 };
  db.update(schema.accounts).set({ tokens: encrypt(JSON.stringify(next)) }).where(eq(schema.accounts.id, account.id)).run();
  account.tokens = encrypt(JSON.stringify(next));
  return next.accessToken;
}

async function get<T = any>(account: AccountRow, url: string): Promise<T> {
  return requestJson<T>(url, { headers: { authorization: `Bearer ${await accessToken(account)}` } });
}

export const youtube: PlatformAdapter<YouTubeFields> = {
  async publish({ account, filePath, sizeBytes, mime, fields, onProgress }) {
    const token = await accessToken(account);
    // Step 1: open a resumable upload session, sending the metadata.
    const init = await fetch(`${UPLOAD}?${qs({ uploadType: 'resumable', part: 'snippet,status', notifySubscribers: fields.notifySubscribers })}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(sizeBytes),
        'x-upload-content-type': mime,
      },
      body: JSON.stringify({
        snippet: { title: fields.title, description: fields.description, tags: fields.tags, categoryId: fields.categoryId },
        status: { privacyStatus: fields.privacy, selfDeclaredMadeForKids: fields.madeForKids },
      }),
    });
    const sessionUrl = init.headers.get('location');
    if (!init.ok || !sessionUrl) {
      const body = await init.json().catch(() => null);
      throw new PlatformError(body?.error?.message ?? `YouTube refused the upload (HTTP ${init.status}).`, init.status === 401);
    }
    // Step 2: send the file bytes to the session URL.
    const video = await requestJson<{ id: string }>(sessionUrl, {
      method: 'PUT',
      headers: { 'content-type': mime, 'content-length': String(sizeBytes) },
      ...fileBody(filePath, sizeBytes, (p) => onProgress('uploading', p)),
    });
    return { externalId: video.id, url: `https://www.youtube.com/watch?v=${video.id}` };
  },

  async getProfile(account) {
    const data = await get(account, `${API}/channels?${qs({ part: 'snippet,statistics', mine: true })}`);
    const ch = data.items?.[0];
    return {
      followers: ch?.statistics?.hiddenSubscriberCount ? null : toInt(ch?.statistics?.subscriberCount),
      totalViews: toInt(ch?.statistics?.viewCount),
      videoCount: toInt(ch?.statistics?.videoCount),
      url: `https://www.youtube.com/channel/${account.externalId}`,
    };
  },

  async listVideos(account, limit) {
    // A channel's uploads live in a playlist whose id is the channel id with "UU" in place of "UC".
    const uploads = account.externalId.replace(/^UC/, 'UU');
    const list = await get(account, `${API}/playlistItems?${qs({ part: 'contentDetails', playlistId: uploads, maxResults: Math.min(limit, 50) })}`);
    const ids: string[] = (list.items ?? []).map((i: any) => i.contentDetails.videoId);
    if (!ids.length) return [];
    const details = await get(account, `${API}/videos?${qs({ part: 'snippet,statistics', id: ids.join(',') })}`);
    return (details.items ?? []).map((v: any) => ({
      id: v.id,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
      publishedAt: v.snippet.publishedAt,
      views: toInt(v.statistics?.viewCount),
      likes: toInt(v.statistics?.likeCount),
      comments: toInt(v.statistics?.commentCount),
      shares: null,
    }));
  },

  async getSeries(account, days) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    const data = await get(
      account,
      `${ANALYTICS}?${qs({ ids: 'channel==MINE', startDate: isoDay(start), endDate: isoDay(end), metrics: 'views', dimensions: 'day', sort: 'day' })}`,
    );
    return { metric: 'Views', points: (data.rows ?? []).map(([date, value]: [string, number]) => ({ date, value })) };
  },

  async listComments(account, videoId, limit) {
    const data = await get(
      account,
      `${API}/commentThreads?${qs({ part: 'snippet', videoId, order: 'relevance', maxResults: Math.min(limit, 100), textFormat: 'plainText' })}`,
    );
    return (data.items ?? []).map((t: any) => {
      const c = t.snippet.topLevelComment;
      return {
        id: c.id,
        author: c.snippet.authorDisplayName,
        authorAvatarUrl: c.snippet.authorProfileImageUrl ?? null,
        text: c.snippet.textDisplay,
        likes: c.snippet.likeCount ?? 0,
        replies: t.snippet.totalReplyCount ?? 0,
        publishedAt: c.snippet.publishedAt,
      };
    });
  },

  async reply(account, commentId, text) {
    await requestJson(`${API}/comments?part=snippet`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken(account)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }),
    });
  },
};
