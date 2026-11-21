// Audience, daily views and the best-performing videos across every connected channel.
import { BarChart3, ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountAnalytics } from '../../shared/types';
import { actions, useAction, useAnalytics } from '../api';
import type { Route } from '../App';
import { Avatar, Button, Card, EmptyState, ErrorNote, PageHeader, PlatformIcon, Segmented, Spinner } from '../components/ui';
import { formatCount, formatDate, PLATFORM_LABEL } from '../lib';

/** Chart colours are assigned by connection order and stay with the channel, whatever is filtered. */
const seriesColor = (index: number) => `var(--s${(index % 8) + 1})`;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const engagement = (v: { views: number | null; likes: number | null; comments: number | null; shares: number | null }) =>
  v.views ? ((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0)) / v.views : null;
const percent = (n: number | null) => (n == null ? '–' : `${(n * 100).toFixed(1)}%`);

const Tile = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <Card className="p-5">
    <p className="text-sm text-ink-2">{label}</p>
    <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{value}</p>
    {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
  </Card>
);

function TrendChart({ data, days }: { data: AccountAnalytics[]; days: number }) {
  const withSeries = data.map((a, index) => ({ ...a, index })).filter((a) => a.series.length);
  if (!withSeries.length) return <p className="py-10 text-center text-sm text-ink-3">No daily data is available for these channels yet.</p>;
  const dates = [...new Set(withSeries.flatMap((a) => a.series.map((p) => p.date)))].sort();
  const rows = dates.map((date) => ({ date, ...Object.fromEntries(withSeries.map((a) => [a.account.id, a.series.find((p) => p.date === date)?.value ?? null])) }));
  const labelFor = (a: AccountAnalytics) => `${a.account.name} · ${a.seriesMetric.toLowerCase()}`;

  return (
    <>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {withSeries.map((a) => (
          <li key={a.account.id} className="flex items-center gap-2 text-sm text-ink-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: seriesColor(a.index) }} aria-hidden />
            {labelFor(a)}
          </li>
        ))}
      </ul>
      <div className="h-72" role="img" aria-label={`Daily views and reach per channel over the last ${days} days. The same numbers are in the table below.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={40} />
            <YAxis tickFormatter={(v: number) => formatCount(v)} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
                    <p className="mb-1 font-medium">{formatDate(String(label))}</p>
                    {payload.map((p) => (
                      <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
                        <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} aria-hidden />
                        {p.name}
                        <span className="tabular ml-auto pl-4 font-medium text-ink">{formatCount(Number(p.value))}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            {withSeries.map((a) => (
              <Line key={a.account.id} type="monotone" dataKey={a.account.id} name={labelFor(a)} stroke={seriesColor(a.index)} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function Analytics({ go }: { go: (r: Route) => void }) {
  const [days, setDays] = useState(28);
  const analytics = useAnalytics(days);
  const refresh = useAction(() => actions.refresh('analytics'), ['analytics']);

  const header = (
    <PageHeader
      title="Analytics"
      subtitle="How your channels and recent videos are doing."
      actions={
        <>
          <Segmented label="Time range" value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 28, label: '28 days' }]} />
          <Button onClick={() => refresh.mutate(undefined)} loading={refresh.isPending} aria-label="Refresh"><RefreshCw className="size-4" aria-hidden /></Button>
        </>
      }
    />
  );
  if (analytics.isLoading) return <>{header}<Spinner label="Loading statistics from each platform" /></>;
  if (analytics.isError) return <>{header}<ErrorNote>Could not load analytics. Reload to try again.</ErrorNote></>;
  const data = analytics.data ?? [];
  if (!data.length)
    return (
      <>
        {header}
        <EmptyState icon={<BarChart3 className="size-5" aria-hidden />} title="No channels connected" body="Connect a channel to see followers, daily views and your top videos here." action={<Button variant="primary" onClick={() => go('channels')}>Connect channels</Button>} />
      </>
    );

  const followers = sum(data.map((a) => a.profile?.followers ?? 0));
  const periodTotal = sum(data.flatMap((a) => a.series.map((p) => p.value)));
  const videos = data.flatMap((a) => a.videos.map((v) => ({ ...v, account: a.account }))).sort((x, y) => (y.views ?? -1) - (x.views ?? -1));
  const counted = videos.filter((v) => v.views);
  const overallEngagement = counted.length ? sum(counted.map((v) => (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0))) / sum(counted.map((v) => v.views ?? 0)) : null;
  const hasDemo = data.some((a) => a.account.demo);

  return (
    <>
      {header}
      {hasDemo && <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Demo channels show made-up sample numbers, not real statistics.</p>}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile label="Total audience" value={formatCount(followers)} note="Subscribers and followers across all channels" />
          <Tile label={`Views and reach, ${days} days`} value={formatCount(periodTotal)} note="YouTube and Facebook views plus Instagram reach" />
          <Tile label="Engagement rate" value={percent(overallEngagement)} note="Likes, comments and shares per view on recent videos" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((a) => (
            <Card key={a.account.id} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar name={a.account.name} url={a.account.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.account.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-ink-3"><PlatformIcon platform={a.account.platform} size={14} /> {PLATFORM_LABEL[a.account.platform]}</p>
                </div>
                {a.profile?.url && (
                  <a href={a.profile.url} target="_blank" rel="noreferrer" aria-label={`Open ${a.account.name}`} className="text-ink-3 hover:text-ink"><ExternalLink className="size-4" aria-hidden /></a>
                )}
              </div>
              {a.error ? (
                <p className="mt-3 text-sm text-bad">{a.error}</p>
              ) : (
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-ink-3">{a.account.platform === 'youtube' ? 'Subscribers' : 'Followers'}</dt>
                    <dd className="tabular text-lg font-semibold">{formatCount(a.profile?.followers)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-3">{a.seriesMetric}, {days} days</dt>
                    <dd className="tabular text-lg font-semibold">{a.series.length ? formatCount(sum(a.series.map((p) => p.value))) : '–'}</dd>
                  </div>
                </dl>
              )}
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <h2 className="text-base font-semibold">Daily views and reach</h2>
          <p className="mb-4 text-sm text-ink-2">Last {days} days, one line per channel. Instagram reports reach (accounts that saw your content) instead of views.</p>
          <TrendChart data={data} days={days} />
        </Card>

        <Card className="overflow-hidden">
          <div className="p-5 pb-3">
            <h2 className="text-base font-semibold">Top videos</h2>
            <p className="text-sm text-ink-2">Recent uploads from every channel, most-viewed first.</p>
          </div>
          {videos.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-ink-3">No videos found on these channels yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs text-ink-3">
                    <th className="px-5 py-2 font-medium">Video</th>
                    <th className="px-3 py-2 font-medium">Published</th>
                    <th className="px-3 py-2 text-right font-medium">Views</th>
                    <th className="px-3 py-2 text-right font-medium">Likes</th>
                    <th className="px-3 py-2 text-right font-medium">Comments</th>
                    <th className="px-5 py-2 text-right font-medium">Engagement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {videos.slice(0, 15).map((v) => (
                    <tr key={`${v.account.id}:${v.id}`}>
                      <td className="max-w-xs px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <PlatformIcon platform={v.account.platform} />
                          <div className="min-w-0">
                            {v.url ? (
                              <a href={v.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{v.title}</a>
                            ) : (
                              <span className="block truncate font-medium">{v.title}</span>
                            )}
                            <span className="block truncate text-xs text-ink-3">{v.account.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{formatDate(v.publishedAt)}</td>
                      <td className="tabular px-3 py-2.5 text-right font-medium">{formatCount(v.views)}</td>
                      <td className="tabular px-3 py-2.5 text-right text-ink-2">{formatCount(v.likes)}</td>
                      <td className="tabular px-3 py-2.5 text-right text-ink-2">{formatCount(v.comments)}</td>
                      <td className="tabular px-5 py-2.5 text-right text-ink-2">{percent(engagement(v))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
