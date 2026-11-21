// A month view of everything scheduled and published, for planning what goes out when.
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { PostDTO } from '../../shared/types';
import { usePosts } from '../api';
import type { Route } from '../App';
import { Button, Card, ErrorNote, PageHeader, PlatformIcon, Spinner } from '../components/ui';
import { emptyDraft, type Draft } from '../draft';
import { cx, toLocalInput } from '../lib';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const postTime = (p: PostDTO) => p.scheduledAt ?? p.createdAt;
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });

function statusMark(post: PostDTO) {
  if (post.status === 'scheduled') return { Icon: CalendarClock, cls: 'bg-accent-soft text-accent', label: 'Scheduled' };
  if (post.status === 'published' || post.status === 'publishing') return { Icon: CheckCircle2, cls: 'bg-good-soft text-good', label: 'Published' };
  return { Icon: AlertTriangle, cls: 'bg-warn-soft text-warn', label: 'Needs attention' };
}

export function Calendar({ go, setDraft }: { go: (r: Route) => void; setDraft: Dispatch<SetStateAction<Draft>> }) {
  const posts = usePosts();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const shift = (by: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));

  // Six weeks of days starting on the Monday on or before the 1st.
  const offset = (month.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  const weeks = days.slice(35).some((d) => d.getMonth() === month.getMonth()) ? days : days.slice(0, 35);

  const byDay = new Map<string, PostDTO[]>();
  for (const p of posts.data ?? []) {
    const key = dayKey(new Date(postTime(p)));
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  for (const list of byDay.values()) list.sort((a, b) => postTime(a) - postTime(b));

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const scheduleOn = (day: Date) => {
    // Default to 10:00 that day, or an hour from now if that has already passed.
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0);
    const when = at.getTime() > Date.now() + 5 * 60_000 ? at : new Date(Date.now() + 3600_000);
    setDraft((d) => ({ ...(d.videoId || d.title || d.text ? d : emptyDraft()), scheduleOn: true, scheduleAt: toLocalInput(when) }));
    go('compose');
  };

  const title = month.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const header = (
    <PageHeader
      title="Calendar"
      subtitle="Scheduled and published posts by day. Pick a day to schedule a post for it."
      actions={
        <>
          <Button onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</Button>
          <Button onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden /></Button>
          <Button onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="size-4" aria-hidden /></Button>
        </>
      }
    />
  );
  if (posts.isLoading) return <>{header}<Spinner /></>;
  if (posts.isError) return <>{header}<ErrorNote>Could not load posts. Reload to try again.</ErrorNote></>;

  const inMonth = (posts.data ?? []).filter((p) => { const d = new Date(postTime(p)); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(); }).sort((a, b) => postTime(a) - postTime(b));

  return (
    <>
      {header}
      <h2 className="mb-3 text-lg font-semibold" aria-live="polite">{title}</h2>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-sunken/60 text-center text-xs font-medium text-ink-3">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.map((day, i) => {
            const list = byDay.get(dayKey(day)) ?? [];
            const outside = day.getMonth() !== month.getMonth();
            const isToday = dayKey(day) === dayKey(today);
            const future = day.getTime() >= startOfToday;
            return (
              <div key={i} className={cx('group min-h-20 border-line p-1.5 md:min-h-28', i % 7 !== 6 && 'border-r', i < weeks.length - 7 && 'border-b', outside && 'bg-sunken/40')}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={cx('tabular flex size-6 items-center justify-center rounded-full text-xs', isToday ? 'bg-accent font-semibold text-on-accent' : outside ? 'text-ink-3' : 'text-ink-2')}>{day.getDate()}</span>
                  {future && (
                    <button type="button" onClick={() => scheduleOn(day)} aria-label={`Schedule a post on ${day.toLocaleDateString('en', { month: 'long', day: 'numeric' })}`} className="rounded p-0.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-accent-soft hover:text-accent focus-visible:opacity-100">
                      <Plus className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <ul className="space-y-1">
                  {list.slice(0, 3).map((p) => {
                    const { Icon, cls, label } = statusMark(p);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => go('posts')} title={`${label}: ${p.title}`} className={cx('flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs', cls)}>
                          <Icon className="size-3 shrink-0" aria-hidden />
                          <span className="tabular hidden shrink-0 lg:inline">{timeOf(postTime(p))}</span>
                          <span className="hidden min-w-0 truncate text-ink md:inline">{p.title}</span>
                          <span className="sr-only md:hidden">{label}: {p.title}</span>
                        </button>
                      </li>
                    );
                  })}
                  {list.length > 3 && <li className="px-1 text-xs text-ink-3">+{list.length - 3} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        <li className="flex items-center gap-1.5"><CalendarClock className="size-3.5 text-accent" aria-hidden /> Scheduled</li>
        <li className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-good" aria-hidden /> Published</li>
        <li className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 text-warn" aria-hidden /> Needs attention</li>
      </ul>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-ink-2 uppercase">This month</h2>
      {inMonth.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-ink-3">No posts in {title}.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {inMonth.map((p) => {
            const { Icon, cls, label } = statusMark(p);
            return (
              <button key={p.id} type="button" onClick={() => go('posts')} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-sunken/60">
                <span className="tabular w-40 shrink-0 text-sm whitespace-nowrap text-ink-2">{new Date(postTime(p)).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}, {timeOf(postTime(p))}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                <span className="hidden items-center gap-1 sm:flex">
                  {p.targets.slice(0, 7).map((t) => (
                    <PlatformIcon key={t.id} platform={t.platform} size={14} />
                  ))}
                </span>
                <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', cls)}><Icon className="size-3" aria-hidden /> {label}</span>
              </button>
            );
          })}
        </Card>
      )}
    </>
  );
}
