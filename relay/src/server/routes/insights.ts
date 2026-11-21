// Statistics and comments, read live from each platform and cached briefly to stay inside API quotas.
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AccountAnalytics, CommentsResponse, RemoteComment, RemoteVideo } from '../../shared/types';
import { db, schema } from '../db';
import type { AccountRow } from '../db/schema';
import { adapterFor, PlatformError } from '../platforms';
import { toAccountDTO } from './accounts';

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
export const clearCache = () => cache.clear();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { expires: Date.now() + TTL_MS, value });
  value.catch(() => cache.delete(key)); // never cache a failure
  return value;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Could not load data.');

function flagReauth(account: AccountRow, e: unknown) {
  if (e instanceof PlatformError && e.needsReauth)
    db.update(schema.accounts).set({ status: 'needs_reauth' }).where(eq(schema.accounts.id, account.id)).run();
}

const recentVideos = (account: AccountRow) => cached(`videos:${account.id}`, () => adapterFor(account).listVideos(account, 12));

async function analyticsFor(account: AccountRow, days: number): Promise<AccountAnalytics> {
  const adapter = adapterFor(account);
  const base = { account: toAccountDTO(account) };
  try {
    // The profile is essential; the chart and video list degrade to empty if their own call fails.
    const profile = await cached(`profile:${account.id}`, () => adapter.getProfile(account));
    const [series, videos] = await Promise.all([
      cached(`series:${account.id}:${days}`, () => adapter.getSeries(account, days)).catch(() => ({ metric: 'Views', points: [] })),
      recentVideos(account).catch((): RemoteVideo[] => []),
    ]);
    return { ...base, profile, seriesMetric: series.metric, series: series.points, videos, error: null };
  } catch (e) {
    flagReauth(account, e);
    return { ...base, profile: null, seriesMetric: 'Views', series: [], videos: [], error: message(e) };
  }
}

export function registerInsights(app: FastifyInstance) {
  app.get<{ Querystring: { days?: string; refresh?: string } }>('/api/analytics', async (req) => {
    if (req.query.refresh) clearCache();
    const days = [7, 28].includes(Number(req.query.days)) ? Number(req.query.days) : 28;
    const all = db.select().from(schema.accounts).orderBy(schema.accounts.createdAt).all();
    return Promise.all(all.map((a) => analyticsFor(a, days)));
  });

  // Top comments from each channel's five most recent videos, most-liked first.
  app.get<{ Querystring: { refresh?: string } }>('/api/comments', async (req): Promise<CommentsResponse> => {
    if (req.query.refresh) clearCache();
    const all = db.select().from(schema.accounts).all();
    const errors: CommentsResponse['errors'] = [];
    const perAccount = await Promise.all(
      all.map(async (account): Promise<RemoteComment[]> => {
        try {
          const videos = (await recentVideos(account)).slice(0, 5);
          const lists = await Promise.all(
            videos.map((video) =>
              cached(`comments:${account.id}:${video.id}`, () => adapterFor(account).listComments(account, video.id, 10))
                .then((comments) => comments.map((c) => ({ ...c, accountId: account.id, platform: account.platform, videoId: video.id, videoTitle: video.title, videoUrl: video.url })))
                .catch((): RemoteComment[] => []), // e.g. comments turned off on one video
            ),
          );
          return lists.flat();
        } catch (e) {
          flagReauth(account, e);
          errors.push({ accountId: account.id, message: message(e) });
          return [];
        }
      }),
    );
    const comments = perAccount.flat().sort((a, b) => b.likes - a.likes || b.publishedAt.localeCompare(a.publishedAt));
    return { comments, errors };
  });

  app.post('/api/comments/reply', async (req, reply) => {
    const body = z.object({ accountId: z.string(), commentId: z.string(), text: z.string().trim().min(1).max(2000) }).parse(req.body);
    const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, body.accountId)).get();
    if (!account) return reply.code(404).send({ error: 'Channel not found.' });
    try {
      await adapterFor(account).reply(account, body.commentId, body.text);
      return { ok: true };
    } catch (e) {
      flagReauth(account, e);
      return reply.code(502).send({ error: message(e) });
    }
  });
}
