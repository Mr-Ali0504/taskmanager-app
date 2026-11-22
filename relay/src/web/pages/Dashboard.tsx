// The home page: where things stand, what is coming up, and what needs attention.
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Radio, Send, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AccountAnalytics, PostDTO } from '../../shared/types';
import { useAccounts, useAnalytics, usePosts } from '../api';
import type { Route } from '../App';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, PlatformIcon, SectionTitle, Spinner } from '../components/ui';
import { formatCount, formatDateTime, PLATFORM_LABEL, timeAgo } from '../lib';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Change in total followers over the last `days`, using this app's own daily readings. Null until there is history. */
export function audienceChange(data: AccountAnalytics[], days: number): number | null {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  let change = 0;
  let known = false;
  for (const a of data) {
    const readings = a.history.filter((h) => h.followers != null);
    const before = readings.filter((h) => h.date <= cutoff).at(-1) ?? readings[0];
    const latest = readings.at(-1);
    if (!before || !latest || before.date === latest.date) continue;
    change += (latest.followers ?? 0) - (before.followers ?? 0);
    known = true;
  }
  return known ? change : null;
}

export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCount(Math.abs(n))}`;

const Stat = ({ label, value, note }: { label: string; value: string; note?: ReactNode }) => (
  <Card className="p-5">
    <p className="text-sm text-ink-2">{label}</p>
    <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{value}</p>
    {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
  </Card>
);

const PostLine = ({ post, right, onClick }: { post: PostDTO; right: ReactNode; onClick: () => void }) => (
  <li>
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-sunken/60">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{post.title}</span>
        <span className="mt-1 flex items-center gap-1">
          {post.targets.slice(0, 8).map((t) => (
            <PlatformIcon key={t.id} platform={t.platform} size={14} />
          ))}
          <span className="ml-1 text-xs text-ink-3">{post.targets.length} {post.targets.length === 1 ? 'channel' : 'channels'}</span>
        </span>
      </span>
      {right}
    </button>
  </li>
);

export function Dashboard({ go, onReview }: { go: (r: Route) => void; onReview?: () => void }) {
  const accounts = useAccounts();
  const posts = usePosts();
  const analytics = useAnalytics(28);

  const header = <PageHeader title="Dashboard" subtitle="Your channels at a glance." actions={<>{onReview && <Button onClick={onReview}><Sparkles className="size-4" aria-hidden /> Weekly review</Button>}<Button variant="primary" onClick={() => go('compose')}><Send className="size-4" aria-hidden /> New post</Button></>} />;
  if (accounts.isLoading || posts.isLoading) return <>{header}<Spinner /></>;
  if (!accounts.data?.length)
    return (
      <>
        {header}
        <EmptyState icon={<Radio className="size-5" aria-hidden />} title="Connect a channel to start" body="Link your YouTube channel, Instagram accounts and Facebook Pages once. Then publish to all of them from one place." action={<Button variant="primary" onClick={() => go('channels')}>Connect channels</Button>} />
      </>
    );

  const all = posts.data ?? [];
  const data = analytics.data ?? [];
  const scheduled = all.filter((p) => p.status === 'scheduled').sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
  const failed = all.filter((p) => p.status === 'failed' || p.status === 'partial');
  const reconnect = accounts.data.filter((a) => a.status !== 'connected');
  const weekAgo = Date.now() - 7 * 86_400_000;
  const publishedThisWeek = all.filter((p) => p.createdAt > weekAgo && p.targets.some((t) => t.status === 'published'));
  const change = audienceChange(data, 7);
  const loadingStats = analytics.isLoading;
  const ranked = [...data].sort((a, b) => (b.profile?.followers ?? -1) - (a.profile?.followers ?? -1));

  return (
    <>
      {header}
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total audience" value={loadingStats ? '…' : formatCount(sum(data.map((a) => a.profile?.followers ?? 0)))} note={change == null ? `Across ${accounts.data.length} channels` : `${signed(change)} in the last 7 days`} />
          <Stat label="Views and reach, 28 days" value={loadingStats ? '…' : formatCount(sum(data.flatMap((a) => a.series.map((p) => p.value))))} note="All channels combined" />
          <Stat label="Scheduled" value={String(scheduled.length)} note={scheduled[0] ? `Next: ${formatDateTime(scheduled[0].scheduledAt!)}` : 'Nothing queued'} />
          <Stat label="Published, last 7 days" value={String(publishedThisWeek.length)} note={`${sum(publishedThisWeek.map((p) => p.targets.filter((t) => t.status === 'published').length))} channel uploads`} />
        </div>

        {(failed.length > 0 || reconnect.length > 0) && (
          <Card className="border-warn/40 p-5">
            <SectionTitle>Needs attention</SectionTitle>
            <ul className="space-y-2 text-sm">
              {reconnect.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
                  <span><strong className="font-medium">{a.name}</strong> ({PLATFORM_LABEL[a.platform]}) lost its connection.</span>
                  <Button size="sm" onClick={() => go('channels')}>Reconnect</Button>
                </li>
              ))}
              {failed.slice(0, 5).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
                  <span><strong className="font-medium">{p.title}</strong> failed on {p.targets.filter((t) => t.status === 'failed').length} of {p.targets.length} channels.</span>
                  <Button size="sm" onClick={() => go('posts')}>Review</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="px-5 pt-5">
                <SectionTitle aside={<Button size="sm" variant="ghost" onClick={() => go('calendar')}>Calendar <ArrowRight className="size-4" aria-hidden /></Button>}>Up next</SectionTitle>
              </div>
              {scheduled.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-ink-3">Nothing scheduled. Use “Schedule for later” on the Publish page to queue a video.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {scheduled.slice(0, 5).map((p) => (
                    <PostLine key={p.id} post={p} onClick={() => go('posts')} right={<Badge tone="accent"><CalendarClock className="size-3" aria-hidden /> {formatDateTime(p.scheduledAt!)}</Badge>} />
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="px-5 pt-5">
                <SectionTitle aside={<Button size="sm" variant="ghost" onClick={() => go('posts')}>All posts <ArrowRight className="size-4" aria-hidden /></Button>}>Recent posts</SectionTitle>
              </div>
              {all.filter((p) => p.status !== 'scheduled').length === 0 ? (
                <p className="px-5 pb-5 text-sm text-ink-3">Nothing published from here yet.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {all.filter((p) => p.status !== 'scheduled').slice(0, 5).map((p) => {
                    const ok = p.targets.filter((t) => t.status === 'published').length;
                    return (
                      <PostLine
                        key={p.id}
                        post={p}
                        onClick={() => go('posts')}
                        right={
                          <span className="flex flex-col items-end gap-1">
                            {p.status === 'published' ? <Badge tone="good"><CheckCircle2 className="size-3" aria-hidden /> Published</Badge> : p.status === 'publishing' ? <Badge tone="accent">Publishing</Badge> : <Badge tone="warn"><AlertTriangle className="size-3" aria-hidden /> {ok} of {p.targets.length} live</Badge>}
                            <span className="text-xs text-ink-3">{timeAgo(p.createdAt)}</span>
                          </span>
                        }
                      />
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-5 pt-5">
              <SectionTitle aside={<Button size="sm" variant="ghost" onClick={() => go('analytics')}>Analytics <ArrowRight className="size-4" aria-hidden /></Button>}>Channels</SectionTitle>
            </div>
            {loadingStats ? (
              <Spinner label="Loading statistics" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs text-ink-3">
                    <th className="px-5 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 text-right font-medium">Audience</th>
                    <th className="px-5 py-2 text-right font-medium">28 days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ranked.map((a) => (
                    <tr key={a.account.id}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={a.account.name} url={a.account.avatarUrl} size={28} />
                          <div className="min-w-0">
                            <span className="block truncate font-medium">{a.account.name}</span>
                            <span className="flex items-center gap-1 text-xs text-ink-3"><PlatformIcon platform={a.account.platform} size={12} /> {PLATFORM_LABEL[a.account.platform]}</span>
                          </div>
                        </div>
                      </td>
                      <td className="tabular px-3 py-2.5 text-right font-medium">{a.error ? <span className="font-normal text-bad">Unavailable</span> : formatCount(a.profile?.followers)}</td>
                      <td className="tabular px-5 py-2.5 text-right text-ink-2">{a.series.length ? `${formatCount(sum(a.series.map((p) => p.value)))} ${a.seriesMetric.toLowerCase()}` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
