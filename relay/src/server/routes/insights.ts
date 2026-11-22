// Statistics and comments, read live from each platform and cached briefly to stay inside API quotas.
import { and, asc, eq, gte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AccountAnalytics, CommentsResponse, RemoteComment, RemoteVideo } from '../../shared/types';
import { db, schema } from '../db';
import type { AccountRow } from '../db/schema';
import { adapterFor, PlatformError } from '../platforms';
import { isoDay } from '../platforms/http';
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

/** Saves today's audience reading for a channel (one row per channel per day, latest value wins). */
function recordSnapshot(account: AccountRow, profile: { followers: number | null; totalViews: number | null }) {
  const row = { accountId: account.id, date: isoDay(new Date()), followers: profile.followers, totalViews: profile.totalViews };
  db.insert(schema.snapshots).values(row).onConflictDoUpdate({ target: [schema.snapshots.accountId, schema.snapshots.date], set: row }).run();
}

function historyFor(account: AccountRow) {
  const since = isoDay(new Date(Date.now() - 180 * 86_400_000));
  return db
    .select({ date: schema.snapshots.date, followers: schema.snapshots.followers })
    .from(schema.snapshots)
    .where(and(eq(schema.snapshots.accountId, account.id), gte(schema.snapshots.date, since)))
    .orderBy(asc(schema.snapshots.date))
    .all();
}

/** Called on a timer so growth is tracked even on days nobody opens the Analytics page. */
export async function recordAllSnapshots() {
  for (const account of db.select().from(schema.accounts).all()) {
    try {
      recordSnapshot(account, await cached(`profile:${account.id}`, () => adapterFor(account).getProfile(account)));
    } catch (e) {
      flagReauth(account, e);
    }
  }
}

export const recentVideos = (account: AccountRow) => cached(`videos:${account.id}`, () => adapterFor(account).listVideos(account, 12));

async function analyticsFor(account: AccountRow, days: number): Promise<AccountAnalytics> {
  const adapter = adapterFor(account);
  const base = { account: toAccountDTO(account) };
  try {
    // The profile is essential; the chart and video list degrade to empty if their own call fails.
    const profile = await cached(`profile:${account.id}`, () => adapter.getProfile(account));
    recordSnapshot(account, profile);
    const [series, videos] = await Promise.all([
      cached(`series:${account.id}:${days}`, () => adapter.getSeries(account, days)).catch(() => ({ metric: 'Views', points: [] })),
      recentVideos(account).catch((): RemoteVideo[] => []),
    ]);
    return { ...base, profile, seriesMetric: series.metric, series: series.points, videos, history: historyFor(account), error: null };
  } catch (e) {
    flagReauth(account, e);
    return { ...base, profile: null, seriesMetric: 'Views', series: [], videos: [], history: historyFor(account), error: message(e) };
  }
}

export async function accountAnalytics(days: number): Promise<AccountAnalytics[]> {
  const all = db.select().from(schema.accounts).orderBy(schema.accounts.createdAt).all();
  return Promise.all(all.map((a) => analyticsFor(a, days)));
}

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/**
 * Last week's performance per channel, with every comparison already worked out.
 * The assistant writes its review from these figures, so the arithmetic is done here rather than by the model.
 */
export async function weeklyReport() {
  const data = await accountAnalytics(28);
  const day = (offset: number) => isoDay(new Date(Date.now() - offset * 86_400_000));
  const weekStart = day(6); // last 7 days including today
  const prevStart = day(13);
  const weekAgoMs = Date.now() - 7 * 86_400_000;

  const channels = data.map((a) => {
    const metric = a.seriesMetric.toLowerCase();
    const thisWeek = a.series.filter((p) => p.date >= weekStart);
    const lastWeek = a.series.filter((p) => p.date >= prevStart && p.date < weekStart);
    const total = (points: typeof thisWeek) => (points.length ? points.reduce((n, p) => n + p.value, 0) : null);
    const now = total(thisWeek);
    const before = total(lastWeek);
    const bestDay = thisWeek.length ? thisWeek.reduce((best, p) => (p.value > best.value ? p : best)) : null;

    const readings = a.history.filter((h) => h.followers != null);
    const first = readings.find((h) => h.date >= weekStart) ?? null;
    const baseline = readings.filter((h) => h.date < weekStart).at(-1) ?? first;
    const latest = readings.at(-1) ?? null;
    const tracked = baseline && latest && baseline.date !== latest.date;

    const stats = (v: (typeof a.videos)[number]) => ({
      title: v.title,
      published: v.publishedAt.slice(0, 10),
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      engagement_rate_percent: v.views ? Math.round((((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0)) / v.views) * 1000) / 10 : null,
    });
    const fresh = a.videos.filter((v) => new Date(v.publishedAt).getTime() >= weekAgoMs);
    const older = a.videos.filter((v) => new Date(v.publishedAt).getTime() < weekAgoMs);

    return {
      channel: a.account.name,
      platform: a.account.platform,
      account_id: a.account.id,
      sample_data: a.account.demo,
      error: a.error,
      audience: a.profile?.followers ?? null,
      audience_change: tracked ? { change: latest!.followers! - baseline!.followers!, since: baseline!.date } : null,
      daily_metric: metric,
      [`${metric}_last_7_days`]: now,
      [`${metric}_previous_7_days`]: before,
      change_percent: now != null && before != null ? pct(now, before) : null,
      best_day: bestDay ? { date: bestDay.date, [metric]: bestDay.value } : null,
      videos_published_last_7_days: fresh.map(stats),
      typical_views_of_earlier_videos: median(older.map((v) => v.views).filter((v): v is number => v != null)),
      best_earlier_video: older.length ? stats(older.reduce((best, v) => ((v.views ?? 0) > (best.views ?? 0) ? v : best))) : null,
    };
  });

  const appPosts = db.select().from(schema.posts).all().filter((p) => p.createdAt >= weekAgoMs);
  const sumOf = (key: string) => channels.reduce((n, c) => n + (((c as Record<string, unknown>)[key] as number | null) ?? 0), 0);
  return {
    period: { last_7_days: `${weekStart} to ${day(0)}`, previous_7_days: `${prevStart} to ${day(7)}` },
    total_audience: channels.reduce((n, c) => n + (c.audience ?? 0), 0),
    videos_published_last_7_days: channels.reduce((n, c) => n + c.videos_published_last_7_days.length, 0),
    posts_made_from_this_app: { total: appPosts.length, failed_or_partial: appPosts.filter((p) => p.status === 'failed' || p.status === 'partial').length, scheduled: appPosts.filter((p) => p.status === 'scheduled').length },
    channels,
    notes: [
      'Daily metric differs by platform: YouTube and Facebook report views, Instagram reports reach. Do not add them up as if they were the same thing.',
      'YouTube daily figures arrive two to three days late, so its most recent days are usually undercounted. A small drop on YouTube may only be that delay.',
      'audience_change is null until this app has recorded the audience on more than one day.',
      'Only the 12 most recent videos per channel are included.',
      ...(channels.some((c) => c.sample_data) ? ['Channels marked sample_data are demo channels with made-up numbers.'] : []),
      ...(sumOf('views_last_7_days') + sumOf('reach_last_7_days') === 0 ? ['No daily data came back for any channel this week.'] : []),
    ],
  };
}

/** Comments from each channel's five most recent videos, most-liked first. */
export async function topComments(): Promise<CommentsResponse> {
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
}

export function registerInsights(app: FastifyInstance) {
  app.get<{ Querystring: { days?: string; refresh?: string } }>('/api/analytics', async (req) => {
    if (req.query.refresh) clearCache();
    return accountAnalytics([7, 28].includes(Number(req.query.days)) ? Number(req.query.days) : 28);
  });

  app.get<{ Querystring: { refresh?: string } }>('/api/comments', async (req): Promise<CommentsResponse> => {
    if (req.query.refresh) clearCache();
    return topComments();
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
