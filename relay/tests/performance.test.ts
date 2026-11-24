import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVerdict, buildVideo, valueAt, type Reading, type TrackedInput } from '../src/server/performance';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 24, 12);

/** A video whose views grow by `perHour` each hour, read every half hour from `firstReadingAge`. */
function video(id: string, ageHours: number, perHour: number, opts: { firstReadingAge?: number; sharesPer1000?: number; upTo?: number } = {}): TrackedInput {
  const publishedAt = NOW - ageHours * HOUR;
  const readings: Reading[] = [];
  for (let age = opts.firstReadingAge ?? 0.5; age <= Math.min(ageHours, opts.upTo ?? 72); age += 0.5) {
    const views = Math.round(perHour * age);
    readings.push({ at: publishedAt + age * HOUR, views, likes: Math.round(views * 0.05), comments: null, shares: opts.sharesPer1000 == null ? null : Math.round((views * opts.sharesPer1000) / 1000) });
  }
  return { id, title: id, url: null, thumbnailUrl: null, publishedAt, readings };
}

describe('valueAt', () => {
  const points = [{ age: 0, value: 0 }, { age: 2, value: 100 }, { age: 4, value: 400 }];
  it('reads along the straight line between readings', () => {
    expect(valueAt(points, 1)).toBe(50);
    expect(valueAt(points, 3)).toBe(250);
    expect(valueAt(points, 4)).toBe(400);
  });
  it('never guesses outside what was recorded', () => {
    expect(valueAt(points, 4.5)).toBeNull();
    expect(valueAt([{ age: 30, value: 5 }], 10)).toBeNull();
    expect(valueAt([], 1)).toBeNull();
  });
});

describe('buildVideo', () => {
  it('gives a value for each whole hour up to the last reading, then blanks', () => {
    const v = buildVideo(video('a', 6, 100), 12, NOW);
    expect(v.hourly.views.slice(0, 7)).toEqual([0, 100, 200, 300, 400, 500, 600]);
    expect(v.hourly.views.slice(7)).toEqual([null, null, null, null, null, null]);
    expect(v.current.views).toBe(600);
    expect(v.ageHours).toBeCloseTo(6);
    expect(v.trackedFromHour).toBeCloseTo(0.5);
    expect(v.hourly.comments.every((c) => c === null)).toBe(true);
  });
  it('does not draw a line from zero for a video that was first read long after publishing', () => {
    const v = buildVideo(video('old', 60, 10, { firstReadingAge: 40 }), 48, NOW);
    expect(v.hourly.views[10]).toBeNull();
    expect(v.hourly.views[40]).toBe(400);
    expect(v.trackedFromHour).toBeCloseTo(40);
  });
});

describe('buildVerdict', () => {
  const usual = [video('p1', 80, 100), video('p2', 150, 120), video('p3', 220, 80)];

  it('compares at the same age and reports the multiple of the usual', () => {
    const verdict = buildVerdict(video('new', 6, 200), usual, 24);
    expect(verdict.comparedAtHour).toBe(6);
    expect(verdict.latestViews).toBe(1200);
    expect(verdict.usualViews).toBe(600); // median of 600, 720, 480
    expect(verdict.ratio).toBe(2);
    expect(verdict.level).toBe('ahead');
    expect(verdict.comparedWith).toBe(3);
    expect(verdict.projected24h).toBe(4800); // earlier videos grew 4x from hour 6 to hour 24
    expect(verdict.usual24h).toBe(2400);
    expect(verdict.reasons[0]).toContain('1,200 views');
  });

  it('calls a breakout only when far above usual and still gaining', () => {
    expect(buildVerdict(video('hit', 8, 400), usual, 24).level).toBe('breakout');
    expect(buildVerdict(video('ok', 8, 100), usual, 24).level).toBe('typical');
    expect(buildVerdict(video('slow', 8, 40), usual, 24).level).toBe('below');
    // Far above usual early on, then flat for the last hours: not a breakout.
    const faded = video('faded', 8, 500, { upTo: 4 });
    faded.readings.push(...[4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].map((age) => ({ at: faded.publishedAt + age * HOUR, views: 2000, likes: 100, comments: null, shares: null })));
    const verdict = buildVerdict(faded, usual, 24);
    expect(verdict.ratio).toBeGreaterThan(2);
    expect(verdict.trend).toBe('slowing');
    expect(verdict.level).not.toBe('breakout');
  });

  it('respects the chosen window: a 3 hour window compares at hour 3 even for an older video', () => {
    const verdict = buildVerdict(video('new', 10, 200), usual, 3);
    expect(verdict.comparedAtHour).toBe(3);
    expect(verdict.latestViews).toBe(600);
    expect(verdict.usualViews).toBe(300);
  });

  it('refuses to judge without enough history, and says why', () => {
    const untracked = [video('p1', 80, 100, { firstReadingAge: 50 }), video('p2', 150, 120, { firstReadingAge: 100 })];
    const verdict = buildVerdict(video('new', 6, 200), untracked, 24);
    expect(verdict.level).toBe('unknown');
    expect(verdict.ratio).toBeNull();
    expect(verdict.reasons[0]).toMatch(/Only 0 earlier videos have a reading at this age/);
    expect(buildVerdict(video('fresh', 0.6, 200), usual, 24).level).toBe('unknown');
  });

  it('notes when a video is shared more than usual', () => {
    const shared = [video('p1', 80, 100, { sharesPer1000: 5 }), video('p2', 150, 120, { sharesPer1000: 6 }), video('p3', 220, 80, { sharesPer1000: 4 })];
    const verdict = buildVerdict(video('new', 6, 200, { sharesPer1000: 12 }), shared, 24);
    // The fixture rounds shares to whole numbers, so the rates are close to, not exactly, 12 and 5.
    expect(verdict.sharesPer1000!.latest).toBeGreaterThan(11);
    expect(verdict.sharesPer1000!.usual).toBeCloseTo(5, 0);
    expect(verdict.reasons.join(' ')).toMatch(/shared more than usual/);
  });
});

describe('recording readings', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stores a reading per video each time, and builds the report from them', async () => {
    const { db, schema, runMigrations } = await import('../src/server/db');
    const { encrypt } = await import('../src/server/crypto');
    const { sampleAccount, performanceReport, forgetAccount } = await import('../src/server/performance');
    runMigrations();
    const account = { id: 'perf-fb', platform: 'facebook' as const, externalId: 'page-perf', name: 'Perf Page', handle: null, avatarUrl: null, tokens: encrypt(JSON.stringify({ pageToken: 't' })), demo: false, status: 'connected' as const, createdAt: 1 };
    db.delete(schema.accounts).run();
    db.insert(schema.accounts).values(account).run();
    forgetAccount(account.id);

    const published = NOW - 2 * HOUR;
    let views = 0;
    // The platform only ever reports the running total at the moment it is asked.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [
      { id: 'new', title: 'New reel', created_time: new Date(published).toISOString(), views, likes: { summary: { total_count: Math.round(views / 20) } }, comments: { summary: { total_count: 3 } } },
      { id: 'old', title: 'Old reel', created_time: new Date(NOW - 30 * 24 * HOUR).toISOString(), views: 9000, likes: { summary: { total_count: 400 } }, comments: { summary: { total_count: 40 } } },
    ] })));

    views = 300; await sampleAccount(account, published + 1 * HOUR);
    views = 500; await sampleAccount(account, published + 1.5 * HOUR);
    views = 800; await sampleAccount(account, NOW);

    const stats = db.select().from(schema.videoStats).all().filter((r) => r.accountId === account.id);
    expect(stats.filter((r) => r.videoId === 'new')).toHaveLength(3);
    // A month-old video is read once a day, not every time.
    expect(stats.filter((r) => r.videoId === 'old')).toHaveLength(1);

    const report = await performanceReport(account, 6, NOW);
    expect(report.latest!.title).toBe('New reel');
    expect(report.latest!.hourly.views.slice(0, 3)).toEqual([0, 300, 800]);
    expect(report.latest!.hourly.views[3]).toBeNull();
    expect(report.latest!.current.views).toBe(800);
    expect(report.previous.map((v) => v.title)).toEqual(['Old reel']);
    expect(report.previous[0].hourly.views.every((v) => v === null)).toBe(true); // its first hours were never recorded
    expect(report.verdict!.level).toBe('unknown');
    expect(report.error).toBeNull();
  });
});
