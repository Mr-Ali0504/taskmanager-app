// The newest video against the three before it, hour by hour since each was published.
import { ExternalLink, Flame, Minus, RefreshCw, TrendingDown, TrendingUp, HelpCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BreakoutLevel, PerformanceMetric, PerformanceReport, PerformanceVideo } from '../../shared/types';
import { api, useAccounts } from '../api';
import type { Route } from '../App';
import { Button, Card, EmptyState, ErrorNote, inputClass, PageHeader, PlatformIcon, Segmented, Spinner } from '../components/ui';
import { cx, formatCount, formatDateTime, PLATFORM_LABEL, timeAgo } from '../lib';

const METRIC_LABEL: Record<PerformanceMetric, string> = { views: 'Views', likes: 'Likes', comments: 'Comments', shares: 'Shares' };
const QUICK_HOURS = [6, 12, 24, 48, 72];
/** The newest video is always the first colour and drawn heavier; the earlier ones follow in fixed order. */
const color = (index: number) => `var(--s${index + 1})`;

const LEVELS: Record<BreakoutLevel, { title: string; chance: string; Icon: typeof Flame; tone: string }> = {
  breakout: { title: 'Breaking out', chance: 'High', Icon: Flame, tone: 'bg-good-soft text-good' },
  ahead: { title: 'Ahead of your usual', chance: 'Possible', Icon: TrendingUp, tone: 'bg-accent-soft text-accent' },
  typical: { title: 'About your usual', chance: 'Low', Icon: Minus, tone: 'bg-sunken text-ink-2' },
  below: { title: 'Below your usual', chance: 'Unlikely', Icon: TrendingDown, tone: 'bg-warn-soft text-warn' },
  unknown: { title: 'Not enough history yet', chance: 'Unknown', Icon: HelpCircle, tone: 'bg-sunken text-ink-2' },
};

const shortTitle = (v: PerformanceVideo, max = 34) => (v.title.length > max ? `${v.title.slice(0, max - 1)}…` : v.title);

function CurveChart({ videos, metric, hours }: { videos: PerformanceVideo[]; metric: PerformanceMetric; hours: number }) {
  const rows = Array.from({ length: hours + 1 }, (_, hour) => ({ hour, ...Object.fromEntries(videos.map((v) => [v.id, v.hourly[metric][hour] ?? null])) }));
  if (!videos.some((v) => v.hourly[metric].some((x) => x != null)))
    return <p className="py-12 text-center text-sm text-ink-3">No {METRIC_LABEL[metric].toLowerCase()} readings inside the first {hours} hours for these videos yet.</p>;
  return (
    <>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {videos.map((v, i) => (
          <li key={v.id} className="flex items-center gap-2 text-sm text-ink-2">
            <span className="w-4 rounded-full" style={{ background: color(i), height: i === 0 ? 3 : 2 }} aria-hidden />
            {i === 0 ? <strong className="font-semibold text-ink">Newest: {shortTitle(v)}</strong> : shortTitle(v)}
          </li>
        ))}
      </ul>
      <div className="h-80" role="img" aria-label={`${METRIC_LABEL[metric]} by hour since publishing, newest video against earlier ones. The table below has the same figures.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="hour" type="number" domain={[0, hours]} tickCount={Math.min(hours + 1, 13)} allowDecimals={false} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} label={{ value: 'Hours since publishing', position: 'insideBottom', offset: -10, fill: 'var(--ink-3)', fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => formatCount(v)} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
                    <p className="mb-1 font-medium">{label === 0 ? 'At publishing' : `${label} ${label === 1 ? 'hour' : 'hours'} in`}</p>
                    {payload.filter((p) => p.value != null).map((p) => (
                      <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
                        <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
                        {p.name}
                        <span className="tabular ml-auto pl-4 font-medium text-ink">{Number(p.value).toLocaleString('en')}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            {videos.map((v, i) => (
              <Line key={v.id} type="monotone" dataKey={v.id} name={i === 0 ? `Newest: ${shortTitle(v, 26)}` : shortTitle(v, 26)} stroke={color(i)} strokeWidth={i === 0 ? 3 : 2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function Performance({ go }: { go: (r: Route) => void }) {
  const accounts = useAccounts();
  const client = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [hours, setHours] = useState(24);
  const [metric, setMetric] = useState<PerformanceMetric>('views');

  const usable = (accounts.data ?? []).filter((a) => a.status === 'connected');
  useEffect(() => {
    if (!accountId && usable.length) setAccountId((usable.find((a) => a.platform === 'instagram') ?? usable[0]).id);
  }, [accountId, usable]);

  const report = useQuery({
    queryKey: ['performance', accountId, hours],
    queryFn: () => api<PerformanceReport>(`/performance?accountId=${accountId}&hours=${hours}`),
    enabled: Boolean(accountId),
    placeholderData: (previous) => previous,
    refetchInterval: 5 * 60_000,
  });

  const header = (
    <PageHeader
      title="Performance"
      subtitle="Your newest video against the three before it, hour by hour."
      actions={
        <div className="flex items-center gap-2">
          <select className={cx(inputClass, 'h-10 w-auto max-w-56')} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Channel">
            {usable.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({PLATFORM_LABEL[a.platform]})</option>
            ))}
          </select>
          <Button onClick={() => client.invalidateQueries({ queryKey: ['performance'] })} loading={report.isFetching} aria-label="Refresh"><RefreshCw className="size-4" aria-hidden /></Button>
        </div>
      }
    />
  );

  if (accounts.isLoading) return <>{header}<Spinner /></>;
  if (!usable.length)
    return (
      <>
        {header}
        <EmptyState icon={<TrendingUp className="size-5" aria-hidden />} title="No channels connected" body="Connect a channel to follow how each new video performs in its first hours." action={<Button variant="primary" onClick={() => go('channels')}>Connect channels</Button>} />
      </>
    );
  if (report.isLoading || !report.data) return <>{header}{report.isError ? <ErrorNote>Could not load performance data. Try refreshing.</ErrorNote> : <Spinner label="Reading the latest numbers" />}</>;

  const data = report.data;
  if (!data.latest)
    return (
      <>
        {header}
        {data.error && <div className="mb-4"><ErrorNote>{data.error}</ErrorNote></div>}
        <EmptyState icon={<TrendingUp className="size-5" aria-hidden />} title="No videos found on this channel yet" body="Once this channel has a video, the app reads its numbers every half hour and builds the comparison here." />
      </>
    );

  const videos = [data.latest, ...data.previous];
  const verdict = data.verdict!;
  const level = LEVELS[verdict.level];
  const atHour = Math.min(hours, Math.floor(verdict.comparedAtHour));
  const lateStart = data.previous.filter((v) => v.trackedFromHour == null || v.trackedFromHour > 3).length;

  return (
    <>
      {header}
      <div className="space-y-4">
        {data.account.demo && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">This is a demo channel. The curves below are made-up sample data.</p>}
        {data.error && <ErrorNote>The latest reading failed, so these figures may be out of date: {data.error}</ErrorNote>}

        {/* Verdict */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <span className={cx('flex size-12 shrink-0 items-center justify-center rounded-full', level.tone)}><level.Icon className="size-6" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">Newest video · published {timeAgo(data.latest.publishedAt)}</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold">
                {data.latest.url ? <a href={data.latest.url} target="_blank" rel="noreferrer" className="hover:underline">{data.latest.title} <ExternalLink className="inline size-4 text-ink-3" aria-hidden /></a> : data.latest.title}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold', level.tone)}>{level.title}</span>
                <span className="text-sm text-ink-2">Chance of breaking out: <strong className="font-semibold text-ink">{level.chance}</strong></span>
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-right">
              <div>
                <dt className="text-xs text-ink-3">Views at {verdict.comparedAtHour}h</dt>
                <dd className="tabular text-xl font-semibold">{formatCount(verdict.latestViews)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Your usual</dt>
                <dd className="tabular text-xl font-semibold">{formatCount(verdict.usualViews)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Compared</dt>
                <dd className="tabular text-xl font-semibold">{verdict.ratio == null ? '–' : `${verdict.ratio.toFixed(1)}×`}</dd>
              </div>
            </dl>
          </div>
          <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm text-ink-2">
            {verdict.reasons.map((reason, i) => (
              <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />{reason}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">
            This is an estimate from your own channel’s history: “breaking out” means far above what your videos usually do at the same age. It is not a prediction from the platform, and it cannot see why a video spreads.
          </p>
        </Card>

        {/* Curves */}
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{METRIC_LABEL[metric]} in the first {hours} {hours === 1 ? 'hour' : 'hours'}</h2>
            <Segmented label="Measure" value={metric} onChange={setMetric} options={(Object.keys(METRIC_LABEL) as PerformanceMetric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label htmlFor="hours" className="text-sm text-ink-2">Window</label>
            <input id="hours" type="range" min={1} max={72} value={Math.min(hours, 72)} onChange={(e) => setHours(Number(e.target.value))} className="w-48 accent-(--accent)" />
            <span className="tabular w-16 text-sm font-medium">{hours} {hours === 1 ? 'hour' : 'hours'}</span>
            <div className="flex flex-wrap gap-1">
              {QUICK_HOURS.map((h) => (
                <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)} className={cx('rounded-md border px-2 py-1 text-xs font-medium', hours === h ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-sunken')}>{h}h</button>
              ))}
            </div>
          </div>
          <CurveChart videos={videos} metric={metric} hours={hours} />
        </Card>

        {/* Same figures as a table */}
        <Card className="overflow-hidden">
          <div className="p-5 pb-3">
            <h2 className="text-base font-semibold">Side by side at {atHour} {atHour === 1 ? 'hour' : 'hours'}</h2>
            <p className="text-sm text-ink-2">Each video’s figures at the same age as the newest one, then where it stands now.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs text-ink-3">
                  <th className="px-5 py-2 font-medium">Video</th>
                  <th className="px-3 py-2 font-medium">Published</th>
                  {(Object.keys(METRIC_LABEL) as PerformanceMetric[]).map((m) => (
                    <th key={m} className="px-3 py-2 text-right font-medium">{METRIC_LABEL[m]} at {atHour}h</th>
                  ))}
                  <th className="px-5 py-2 text-right font-medium">Views now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {videos.map((v, i) => (
                  <tr key={v.id} className={i === 0 ? 'bg-accent-soft/30' : undefined}>
                    <td className="max-w-xs px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 shrink-0 rounded-full" style={{ background: color(i), height: i === 0 ? 3 : 2 }} aria-hidden />
                        <PlatformIcon platform={data.account.platform} size={16} />
                        <span className="min-w-0">
                          <span className={cx('block truncate', i === 0 && 'font-semibold')}>{v.title}</span>
                          {i === 0 && <span className="block text-xs text-ink-3">Newest</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{formatDateTime(v.publishedAt)}</td>
                    {(Object.keys(METRIC_LABEL) as PerformanceMetric[]).map((m) => {
                      const value = v.hourly[m][atHour];
                      return <td key={m} className="tabular px-3 py-2.5 text-right">{value == null ? <span className="text-ink-3" title="The app has no reading for this video at this age">not recorded</span> : value.toLocaleString('en')}</td>;
                    })}
                    <td className="tabular px-5 py-2.5 text-right text-ink-2">{formatCount(v.current.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-ink-3">
          {lateStart > 0 && `${lateStart} of the earlier videos ${lateStart === 1 ? 'was' : 'were'} published before the app started tracking, so ${lateStart === 1 ? 'its' : 'their'} first hours are not recorded. `}
          The platforms report only running totals, so the app reads each recent video every half hour while it is running and builds these curves from its own readings.
          {data.lastReadingAt && ` Last reading: ${timeAgo(data.lastReadingAt)}.`}
        </p>
      </div>
    </>
  );
}
