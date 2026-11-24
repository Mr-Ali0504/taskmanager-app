// Hour-by-hour performance of a channel's newest video against the ones before it.
//
// The platforms report only running totals, never history. So the app takes a reading of each recent
// video every half hour and rebuilds each video's curve from its readings. Comparisons are always made
// at the same age (e.g. "6 hours after publishing"), which is the only fair way to compare videos.
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { BreakoutLevel, PerformanceMetric, PerformanceReport, PerformanceVerdict, PerformanceVideo } from '../shared/types';
import { db, schema } from './db';
import type { AccountRow } from './db/schema';
import { log } from './log';
import { adapterFor, PlatformError } from './platforms';
import { toAccountDTO } from './routes/accounts';

const HOUR = 3_600_000;
export const MAX_HOURS = 168;
/** A video is read every half hour for its first week, then once a day. */
const CLOSE_TRACKING_HOURS = 168;
/** If the first reading came this soon after publishing, the curve may start from zero at hour 0. */
const START_FROM_ZERO_WITHIN_HOURS = 3;
const METRICS: PerformanceMetric[] = ['views', 'likes', 'comments', 'shares'];

export interface Reading {
  at: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}
export interface TrackedInput {
  id: string;
  title: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: number;
  /** Oldest first. */
  readings: Reading[];
}

// ── Pure calculations (covered by tests) ─────────────────────────────────────

type Point = { age: number; value: number };

/** A video's readings for one metric as (age in hours, value) points. */
function curve(video: TrackedInput, metric: PerformanceMetric): Point[] {
  const points = video.readings
    .filter((r) => r[metric] != null && r.at >= video.publishedAt)
    .map((r) => ({ age: (r.at - video.publishedAt) / HOUR, value: r[metric] as number }));
  // Every video has zero of everything at the moment it is published. Use that fact as the starting
  // point, but only when tracking began early; otherwise a straight line from zero would hide the real shape.
  if (points.length && points[0].age > 0 && points[0].age <= START_FROM_ZERO_WITHIN_HOURS) points.unshift({ age: 0, value: 0 });
  return points;
}

/** Value at an exact age, on the straight line between the two nearest readings. null outside what was recorded. */
export function valueAt(points: Point[], age: number): number | null {
  if (!points.length || age < points[0].age - 1e-9 || age > points[points.length - 1].age + 1e-9) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (age <= b.age) return b.age === a.age ? b.value : a.value + ((b.value - a.value) * (age - a.age)) / (b.age - a.age);
  }
  return points[points.length - 1].value;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const n = (value: number) => Math.round(value).toLocaleString('en');
const times = (ratio: number) => `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×`;
const hoursLabel = (h: number) => (h < 1.5 ? 'the first hour' : `${Math.round(h)} hours`);

export function buildVideo(video: TrackedInput, hours: number, now: number): PerformanceVideo {
  const last = video.readings[video.readings.length - 1];
  const first = video.readings.find((r) => r.at >= video.publishedAt);
  const hourly = {} as PerformanceVideo['hourly'];
  for (const metric of METRICS) {
    const points = curve(video, metric);
    hourly[metric] = Array.from({ length: hours + 1 }, (_, h) => {
      const v = valueAt(points, h);
      return v == null ? null : Math.round(v);
    });
  }
  return {
    id: video.id,
    title: video.title,
    url: video.url,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt,
    ageHours: Math.max(0, (now - video.publishedAt) / HOUR),
    current: { views: last?.views ?? null, likes: last?.likes ?? null, comments: last?.comments ?? null, shares: last?.shares ?? null },
    hourly,
    trackedFromHour: first ? Math.max(0, (first.at - video.publishedAt) / HOUR) : null,
  };
}

/**
 * How the newest video is doing against the earlier ones at the same age, and whether it looks like a breakout.
 * "Breakout" here means far above this channel's own usual, which is the only yardstick the app has.
 * It is an estimate from the channel's history, not a prediction by the platform.
 */
export function buildVerdict(latest: TrackedInput, previous: TrackedInput[], hours: number): PerformanceVerdict {
  const latestViews = curve(latest, 'views');
  const lastAge = latestViews.length ? latestViews[latestViews.length - 1].age : 0;
  const at = Math.min(lastAge, hours);
  const views = valueAt(latestViews, at);
  const prevCurves = previous.map((v) => curve(v, 'views'));
  const prevAtAge = prevCurves.map((c) => valueAt(c, at)).filter((v): v is number => v != null);
  const usual = median(prevAtAge);
  const ratio = views != null && usual != null && usual > 0 ? views / usual : null;
  const reasons: string[] = [];

  // Pace: views gained in the last two hours, against what the earlier videos gained over the same two hours of their lives.
  let trend: PerformanceVerdict['trend'] = null;
  if (at >= 3) {
    const gain = (c: Point[]) => {
      const now = valueAt(c, at);
      const before = valueAt(c, at - 2);
      return now != null && before != null ? now - before : null;
    };
    const mine = gain(latestViews);
    const theirs = median(prevCurves.map(gain).filter((g): g is number => g != null));
    if (mine != null && theirs != null && theirs > 0) {
      const pace = mine / theirs;
      trend = pace >= 1.5 ? 'accelerating' : pace <= 0.6 ? 'slowing' : 'steady';
      reasons.push(`In the last 2 hours it gained ${n(mine)} views; your earlier videos gained about ${n(theirs)} over the same stretch (${times(pace)}).`);
    }
  }

  // Projection: scale the current figure by how much the earlier videos grew from this age to 24 hours.
  let projected24h: number | null = null;
  const prev24 = prevCurves.map((c) => valueAt(c, 24)).filter((v): v is number => v != null);
  const usual24h = median(prev24);
  if (views != null && at < 24) {
    const growth = prevCurves
      .map((c) => {
        const then = valueAt(c, at);
        const day = valueAt(c, 24);
        return then != null && day != null && then > 0 ? day / then : null;
      })
      .filter((g): g is number => g != null);
    const factor = median(growth);
    if (factor != null && at >= 1) projected24h = Math.round(views * factor);
  }

  // Shares per 1,000 views: people passing a video on is what carries it beyond the existing audience.
  let sharesPer1000: PerformanceVerdict['sharesPer1000'] = null;
  const rate = (v: TrackedInput) => {
    const s = valueAt(curve(v, 'shares'), at);
    const w = valueAt(curve(v, 'views'), at);
    return s != null && w != null && w > 0 ? (s / w) * 1000 : null;
  };
  const myRate = rate(latest);
  const usualRate = median(previous.map(rate).filter((r): r is number => r != null));
  if (myRate != null && usualRate != null) {
    sharesPer1000 = { latest: Math.round(myRate * 10) / 10, usual: Math.round(usualRate * 10) / 10 };
    if (usualRate > 0 && myRate >= usualRate * 1.5) reasons.push(`It is being shared more than usual: ${sharesPer1000.latest} shares per 1,000 views against your usual ${sharesPer1000.usual}.`);
    else if (usualRate > 0 && myRate <= usualRate * 0.6) reasons.push(`It is being shared less than usual: ${sharesPer1000.latest} shares per 1,000 views against your usual ${sharesPer1000.usual}.`);
  }

  let level: BreakoutLevel = 'unknown';
  if (views == null) reasons.unshift('There is no reading for this video yet. The first one is taken within half an hour.');
  else if (at < 1) reasons.unshift('It has been out for under an hour, which is too early to compare.');
  else if (prevAtAge.length < 2 || ratio == null)
    reasons.unshift(
      `Only ${prevAtAge.length} earlier ${prevAtAge.length === 1 ? 'video has' : 'videos have'} a reading at this age. The app can only compare videos it was already tracking when they were published, so this fills in as you post more.`,
    );
  else {
    level = ratio >= 3 && trend !== 'slowing' ? 'breakout' : ratio >= 1.5 ? 'ahead' : ratio >= 0.75 ? 'typical' : 'below';
    reasons.unshift(`After ${hoursLabel(at)} it has ${n(views)} views. Your earlier videos had about ${n(usual!)} at the same age (${times(ratio)}).`);
    if (ratio >= 3 && trend === 'slowing') reasons.push('It started far above your usual, but its pace has dropped below normal, so the early surge may be fading.');
  }
  if (projected24h != null && usual24h != null) reasons.push(`If it keeps the shape of your earlier videos, it reaches about ${n(projected24h)} views at 24 hours. They averaged ${n(usual24h)}.`);

  return { level, comparedAtHour: Math.round(at * 10) / 10, latestViews: views == null ? null : Math.round(views), usualViews: usual == null ? null : Math.round(usual), ratio: ratio == null ? null : Math.round(ratio * 100) / 100, comparedWith: prevAtAge.length, trend, projected24h, usual24h: usual24h == null ? null : Math.round(usual24h), sharesPer1000, reasons };
}

// ── Recording readings ───────────────────────────────────────────────────────

const lastSample = new Map<string, number>();

/** Takes one reading of every recent video on a channel. */
export async function sampleAccount(account: AccountRow, now = Date.now()): Promise<void> {
  const videos = await adapterFor(account).listVideos(account, 12);
  lastSample.set(account.id, now);
  for (const v of videos) {
    const publishedAt = Date.parse(v.publishedAt);
    if (!Number.isFinite(publishedAt)) continue;
    const meta = { accountId: account.id, videoId: v.id, title: v.title, url: v.url, thumbnailUrl: v.thumbnailUrl, publishedAt };
    db.insert(schema.trackedVideos).values(meta).onConflictDoUpdate({ target: [schema.trackedVideos.accountId, schema.trackedVideos.videoId], set: meta }).run();
    // Older videos barely move, so one reading a day is enough for them.
    if (now - publishedAt > CLOSE_TRACKING_HOURS * HOUR) {
      const recent = db.select({ at: schema.videoStats.at }).from(schema.videoStats)
        .where(and(eq(schema.videoStats.accountId, account.id), eq(schema.videoStats.videoId, v.id), gte(schema.videoStats.at, now - 23 * HOUR))).limit(1).get();
      if (recent) continue;
    }
    db.insert(schema.videoStats).values({ accountId: account.id, videoId: v.id, at: now, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares }).onConflictDoNothing().run();
  }
}

/** Runs on a timer. Demo channels are skipped: their numbers are made up on the spot. */
export async function sampleAllAccounts(): Promise<void> {
  db.delete(schema.videoStats).where(lt(schema.videoStats.at, Date.now() - 120 * 24 * HOUR)).run();
  for (const account of db.select().from(schema.accounts).all()) {
    if (account.demo || account.status !== 'connected') continue;
    try {
      await sampleAccount(account);
    } catch (e) {
      if (e instanceof PlatformError && e.needsReauth) db.update(schema.accounts).set({ status: 'needs_reauth' }).where(eq(schema.accounts.id, account.id)).run();
      log(`Could not read video numbers for ${account.platform} / ${account.name}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }
}

export function forgetAccount(accountId: string) {
  db.delete(schema.videoStats).where(eq(schema.videoStats.accountId, accountId)).run();
  db.delete(schema.trackedVideos).where(eq(schema.trackedVideos.accountId, accountId)).run();
  lastSample.delete(accountId);
}

// ── Building the report ──────────────────────────────────────────────────────

function loadTracked(account: AccountRow): TrackedInput[] {
  const videos = db.select().from(schema.trackedVideos).where(eq(schema.trackedVideos.accountId, account.id)).orderBy(desc(schema.trackedVideos.publishedAt)).limit(4).all();
  return videos.map((v) => ({
    id: v.videoId,
    title: v.title,
    url: v.url,
    thumbnailUrl: v.thumbnailUrl,
    publishedAt: v.publishedAt,
    readings: db.select().from(schema.videoStats).where(and(eq(schema.videoStats.accountId, account.id), eq(schema.videoStats.videoId, v.videoId))).orderBy(schema.videoStats.at).all(),
  }));
}

/** Made-up curves for demo channels, so the page can be tried without real accounts. */
function demoTracked(account: AccountRow, now: number): TrackedInput[] {
  let seed = [...account.id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const size = { youtube: 9000, instagram: 6000, facebook: 2500 }[account.platform];
  const specs = [
    { title: 'I tried editing a full video on my phone', ageHours: 9.4, boost: 2.4 },
    { title: 'Studio tour: the desk setup after one year', ageHours: 3 * 24 + 5, boost: 1 },
    { title: '5 mistakes I made starting this channel', ageHours: 6 * 24 + 2, boost: 0.8 },
    { title: "Behind the scenes of last week's shoot", ageHours: 10 * 24 + 7, boost: 1.25 },
  ];
  return specs.map((spec, i) => {
    const total = size * spec.boost * (0.85 + rand() * 0.3);
    const speed = 14 + rand() * 10; // hours for most of the early growth
    const likeRate = 0.04 + rand() * 0.03;
    const shareRate = (0.004 + rand() * 0.004) * (i === 0 ? 1.8 : 1);
    const publishedAt = now - spec.ageHours * HOUR;
    const readings: Reading[] = [];
    for (let age = 0.5; age <= Math.min(spec.ageHours, MAX_HOURS); age += 0.5) {
      const views = Math.round(total * (1 - Math.exp(-age / speed)));
      readings.push({ at: publishedAt + age * HOUR, views, likes: Math.round(views * likeRate), comments: Math.round(views * likeRate * 0.09), shares: account.platform === 'youtube' ? null : Math.round(views * shareRate) });
    }
    return { id: `demo-${account.id}-${i}`, title: spec.title, url: null, thumbnailUrl: null, publishedAt, readings };
  });
}

export async function performanceReport(account: AccountRow, hours: number, now = Date.now()): Promise<PerformanceReport> {
  const base = { account: toAccountDTO(account), hours };
  let error: string | null = null;
  let tracked: TrackedInput[];
  if (account.demo) tracked = demoTracked(account, now);
  else {
    // Opening the page takes a fresh reading if the last one is more than ten minutes old.
    if (now - (lastSample.get(account.id) ?? 0) > 10 * 60_000) {
      try {
        await sampleAccount(account, now);
      } catch (e) {
        error = e instanceof Error ? e.message : 'Could not read this channel.';
      }
    }
    tracked = loadTracked(account);
  }
  const [latest, ...previous] = tracked;
  if (!latest) return { ...base, latest: null, previous: [], verdict: null, lastReadingAt: null, error };
  const lastReadingAt = Math.max(...tracked.flatMap((v) => v.readings.map((r) => r.at)), 0) || null;
  return { ...base, latest: buildVideo(latest, hours, now), previous: previous.map((v) => buildVideo(v, hours, now)), verdict: buildVerdict(latest, previous, hours), lastReadingAt, error };
}
