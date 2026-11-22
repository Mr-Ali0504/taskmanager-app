// Audience, daily views and the best-performing videos across every connected channel.
import { ArrowDown, ArrowUp, BarChart3, Download, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AccountAnalytics } from '../../shared/types';
import { actions, useAction, useAnalytics } from '../api';
import type { Route } from '../App';
import { Avatar, Button, Card, EmptyState, ErrorNote, inputClass, PageHeader, PlatformIcon, Segmented, Spinner } from '../components/ui';
import { audienceChange, signed } from './Dashboard';
import { cx, formatCount, formatDate, PLATFORM_LABEL } from '../lib';

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

type Indexed = AccountAnalytics & { index: number };

function TrendChart({ data, days }: { data: Indexed[]; days: number }) {
  const withSeries = data.filter((a) => a.series.length);
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

/** Total followers per day, from the app's own daily readings. A channel's last known value carries forward. */
function GrowthChart({ data }: { data: Indexed[] }) {
  const dates = [...new Set(data.flatMap((a) => a.history.map((h) => h.date)))].sort();
  if (dates.length < 2)
    return <p className="py-8 text-center text-sm text-ink-3">Growth tracking has just started. The app records each channel’s audience daily, so this chart fills in over the coming days.</p>;
  const rows = dates.map((date) => ({
    date,
    total: data.reduce((n, a) => n + (a.history.filter((h) => h.date <= date && h.followers != null).at(-1)?.followers ?? 0), 0),
  }));
  return (
    <div className="h-56" role="img" aria-label="Total audience per day">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={40} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => formatCount(v)} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
                  <p className="font-medium">{formatDate(String(label))}</p>
                  <p className="tabular text-ink-2">{Number(payload[0].value).toLocaleString('en')} followers</p>
                </div>
              ) : null
            }
          />
          <Line type="monotone" dataKey="total" stroke="var(--s1)" strokeWidth={2} dot={rows.length < 15 ? { r: 3, fill: 'var(--s1)', strokeWidth: 0 } : false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type SortKey = 'publishedAt' | 'views' | 'likes' | 'comments' | 'engagement';

function downloadCsv(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `videos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function Analytics({ go, onReview }: { go: (r: Route) => void; onReview?: () => void }) {
  const [days, setDays] = useState(28);
  const [channel, setChannel] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [descending, setDescending] = useState(true);
  const analytics = useAnalytics(days);
  const refresh = useAction(() => actions.refresh('analytics'), ['analytics']);

  const header = (
    <PageHeader
      title="Analytics"
      subtitle="How your channels and recent videos are doing."
      actions={
        <>
          {onReview && <Button onClick={onReview}><Sparkles className="size-4" aria-hidden /> Weekly review</Button>}
          <select className={cx(inputClass, 'h-10 w-auto min-w-44')} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
            <option value="all">All channels</option>
            {(analytics.data ?? []).map((a) => (
              <option key={a.account.id} value={a.account.id}>{a.account.name} ({PLATFORM_LABEL[a.account.platform]})</option>
            ))}
          </select>
          <Segmented label="Time range" value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 28, label: '28 days' }]} />
          <Button onClick={() => refresh.mutate(undefined)} loading={refresh.isPending} aria-label="Refresh"><RefreshCw className="size-4" aria-hidden /></Button>
        </>
      }
    />
  );
  if (analytics.isLoading) return <>{header}<Spinner label="Loading statistics from each platform" /></>;
  if (analytics.isError) return <>{header}<ErrorNote>Could not load analytics. Reload to try again.</ErrorNote></>;
  const everything: Indexed[] = (analytics.data ?? []).map((a, index) => ({ ...a, index }));
  const data = everything.filter((a) => channel === 'all' || a.account.id === channel);
  if (!everything.length)
    return (
      <>
        {header}
        <EmptyState icon={<BarChart3 className="size-5" aria-hidden />} title="No channels connected" body="Connect a channel to see followers, daily views and your top videos here." action={<Button variant="primary" onClick={() => go('channels')}>Connect channels</Button>} />
      </>
    );

  const followers = sum(data.map((a) => a.profile?.followers ?? 0));
  const periodTotal = sum(data.flatMap((a) => a.series.map((p) => p.value)));
  const value = (v: (typeof unsorted)[number]) => (sortKey === 'publishedAt' ? new Date(v.publishedAt).getTime() : sortKey === 'engagement' ? engagement(v) ?? -1 : v[sortKey] ?? -1);
  const unsorted = data.flatMap((a) => a.videos.map((v) => ({ ...v, account: a.account })));
  const videos = [...unsorted].sort((x, y) => (descending ? value(y) - value(x) : value(x) - value(y)));
  const sortBy = (key: SortKey) => (key === sortKey ? setDescending((d) => !d) : (setSortKey(key), setDescending(true)));
  const change = audienceChange(data, days);
  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cx('py-2 font-medium', className)} aria-sort={sortKey === k ? (descending ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => sortBy(k)} className={cx('inline-flex items-center gap-1 hover:text-ink', sortKey === k && 'text-ink')}>
        {label}
        {sortKey === k && (descending ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />)}
      </button>
    </th>
  );
  const exportCsv = () =>
    downloadCsv([
      ['Video', 'Channel', 'Platform', 'Published', 'Views', 'Likes', 'Comments', 'Shares', 'Engagement rate', 'Link'],
      ...videos.map((v) => [v.title, v.account.name, PLATFORM_LABEL[v.account.platform], v.publishedAt.slice(0, 10), v.views, v.likes, v.comments, v.shares, engagement(v) == null ? null : Number((engagement(v)! * 100).toFixed(2)), v.url]),
    ]);
  const counted = videos.filter((v) => v.views);
  const overallEngagement = counted.length ? sum(counted.map((v) => (v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0))) / sum(counted.map((v) => v.views ?? 0)) : null;
  const hasDemo = data.some((a) => a.account.demo);

  return (
    <>
      {header}
      {hasDemo && <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Demo channels show made-up sample numbers, not real statistics.</p>}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile label="Total audience" value={formatCount(followers)} note={change == null ? 'Subscribers and followers' : `${signed(change)} in the last ${days} days`} />
          <Tile label={`Views and reach, ${days} days`} value={formatCount(periodTotal)} note="YouTube and Facebook views plus Instagram reach" />
          <Tile label="Engagement rate" value={percent(overallEngagement)} note="Likes, comments and shares per view on recent videos" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.length > 1 && data.map((a) => (
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

        <Card className="p-5">
          <h2 className="text-base font-semibold">Audience growth</h2>
          <p className="mb-4 text-sm text-ink-2">Total subscribers and followers, recorded daily by this app since each channel was connected.</p>
          <GrowthChart data={data} />
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
            <div>
              <h2 className="text-base font-semibold">Videos</h2>
              <p className="text-sm text-ink-2">Recent uploads. Click a column heading to sort.</p>
            </div>
            <Button size="sm" onClick={exportCsv} disabled={!videos.length}><Download className="size-4" aria-hidden /> Export CSV</Button>
          </div>
          {videos.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-ink-3">No videos found on these channels yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs text-ink-3">
                    <th className="px-5 py-2 font-medium">Video</th>
                    <Th k="publishedAt" label="Published" className="px-3" />
                    <Th k="views" label="Views" className="px-3 text-right" />
                    <Th k="likes" label="Likes" className="px-3 text-right" />
                    <Th k="comments" label="Comments" className="px-3 text-right" />
                    <Th k="engagement" label="Engagement" className="px-5 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {videos.slice(0, 40).map((v) => (
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
