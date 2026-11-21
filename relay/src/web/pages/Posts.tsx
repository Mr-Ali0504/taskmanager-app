// Everything sent or scheduled, with live progress per channel and retry for anything that failed.
import { AlertTriangle, CalendarClock, CheckCircle2, Copy, ExternalLink, Film, FilePen, ListChecks, Loader2, RotateCw, Search, Send, Trash2, XCircle } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { PostDTO, TargetDTO } from '../../shared/types';
import { actions, useAction, useDrafts, usePosts } from '../api';
import type { Route } from '../App';
import { Badge, Button, Card, EmptyState, ErrorNote, inputClass, PageHeader, PlatformIcon, Spinner, Tabs, useToast } from '../components/ui';
import { restoreDraft, type Draft } from '../draft';
import { cx, formatDateTime, timeAgo } from '../lib';

type Tab = 'all' | 'scheduled' | 'published' | 'attention' | 'drafts';
const inTab = (p: PostDTO, tab: Tab) =>
  tab === 'all' || (tab === 'scheduled' && p.status === 'scheduled') || (tab === 'published' && p.status === 'published') || (tab === 'attention' && (p.status === 'failed' || p.status === 'partial'));

function PostBadge({ post }: { post: PostDTO }) {
  switch (post.status) {
    case 'scheduled':
      return <Badge tone="accent"><CalendarClock className="size-3" aria-hidden /> Scheduled for {formatDateTime(post.scheduledAt!)}</Badge>;
    case 'publishing':
      return <Badge tone="accent"><Loader2 className="size-3 animate-spin" aria-hidden /> Publishing</Badge>;
    case 'published':
      return <Badge tone="good"><CheckCircle2 className="size-3" aria-hidden /> Published</Badge>;
    case 'partial':
      return <Badge tone="warn"><AlertTriangle className="size-3" aria-hidden /> Some channels failed</Badge>;
    case 'failed':
      return <Badge tone="bad"><XCircle className="size-3" aria-hidden /> Failed</Badge>;
  }
}

function TargetRow({ target, scheduled }: { target: TargetDTO; scheduled: boolean }) {
  const active = target.status === 'uploading' || target.status === 'processing';
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2.5 text-sm">
        <PlatformIcon platform={target.platform} />
        <span className="min-w-0 flex-1 truncate font-medium">{target.accountName}</span>
        {target.status === 'pending' && <span className="text-ink-3">{scheduled ? 'Waiting' : 'Starting…'}</span>}
        {target.status === 'uploading' && <span className="tabular text-ink-2">Uploading {target.progress}%</span>}
        {target.status === 'processing' && <span className="text-ink-2">Processing on platform…</span>}
        {target.status === 'failed' && <span className="flex items-center gap-1 text-bad"><XCircle className="size-4" aria-hidden /> Failed</span>}
        {target.status === 'published' &&
          (target.url ? (
            <a href={target.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-accent hover:underline">
              View <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : (
            <span className="flex items-center gap-1 text-good"><CheckCircle2 className="size-4" aria-hidden /> Published</span>
          ))}
      </div>
      {active && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={target.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${target.accountName} upload`}>
          <div className={target.status === 'processing' ? 'h-full animate-pulse rounded-full bg-accent' : 'h-full rounded-full bg-accent transition-all duration-500'} style={{ width: `${target.status === 'processing' ? 100 : target.progress}%` }} />
        </div>
      )}
      {target.error && <p className="mt-1.5 pl-7 text-sm text-bad">{target.error}</p>}
    </li>
  );
}

export function Posts({ go, setDraft }: { go: (r: Route) => void; setDraft: Dispatch<SetStateAction<Draft>> }) {
  const posts = usePosts();
  const drafts = useDrafts();
  const toast = useToast();
  const onError = (e: unknown) => toast('bad', (e as Error).message);
  const publish = useAction(actions.publishPost, ['posts']);
  const remove = useAction(actions.deletePost, ['posts']);
  const removeDraft = useAction(actions.deleteDraft, ['drafts']);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const open = (data: unknown, keep: Partial<Draft>) => {
    setDraft(restoreDraft(data, keep));
    go('compose');
  };

  const header = <PageHeader title="Posts" subtitle="What you have sent, what is queued, and drafts in progress." actions={<Button variant="primary" onClick={() => go('compose')}><Send className="size-4" aria-hidden /> New post</Button>} />;
  if (posts.isLoading) return <>{header}<Spinner /></>;
  if (posts.isError) return <>{header}<ErrorNote>Could not load posts. Reload to try again.</ErrorNote></>;
  const all = posts.data ?? [];
  const draftList = drafts.data ?? [];
  if (!all.length && !draftList.length)
    return (
      <>
        {header}
        <EmptyState icon={<ListChecks className="size-5" aria-hidden />} title="No posts yet" body="When you publish or schedule a video, its progress on each channel shows up here. Saved drafts appear here too." />
      </>
    );

  const count = (t: Tab) => all.filter((p) => inTab(p, t)).length;
  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const visible = all.filter((p) => inTab(p, tab) && (matches(p.title) || p.targets.some((t) => matches(t.accountName))));
  const visibleDrafts = draftList.filter((d) => matches(d.name));

  return (
    <>
      {header}
      <Tabs
        label="Filter posts"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: 'All', count: all.length },
          { value: 'scheduled', label: 'Scheduled', count: count('scheduled') },
          { value: 'published', label: 'Published', count: count('published') },
          { value: 'attention', label: 'Needs attention', count: count('attention') },
          { value: 'drafts', label: 'Drafts', count: draftList.length },
        ]}
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input className={cx(inputClass, 'pl-9')} placeholder="Search by title or channel" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search posts" />
      </div>

      {tab === 'drafts' ? (
        visibleDrafts.length === 0 ? (
          <Card className="px-5 py-10 text-center text-sm text-ink-3">{draftList.length ? 'No drafts match your search.' : 'No drafts. Use “Save as draft” on the Publish page to keep an unfinished post.'}</Card>
        ) : (
          <Card className="divide-y divide-line">
            {visibleDrafts.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <FilePen className="size-4 shrink-0 text-ink-3" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="text-xs text-ink-3">Edited {timeAgo(d.updatedAt)}</p>
                </div>
                <Button size="sm" variant="primary" onClick={() => open(d.data, { draftId: d.id })}>Continue</Button>
                <Button size="sm" variant="ghost" aria-label={`Delete draft ${d.name}`} onClick={() => confirm(`Delete the draft “${d.name}”?`) && removeDraft.mutate(d.id, { onError })}><Trash2 className="size-4" aria-hidden /></Button>
              </div>
            ))}
          </Card>
        )
      ) : visible.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-ink-3">{q ? 'No posts match your search.' : 'Nothing here yet.'}</Card>
      ) : (
        <div className="space-y-4">
          {visible.map((post) => {
            const failed = post.targets.some((t) => t.status === 'failed');
            return (
              <Card key={post.id} className="p-5">
                <div className="flex gap-4">
                  <span className="hidden aspect-video w-28 shrink-0 items-center justify-center self-start overflow-hidden rounded-lg bg-sunken sm:flex">
                    {post.video?.hasThumb ? <img src={`/api/videos/${post.video.id}/thumb`} alt="" className="size-full object-cover" /> : <Film className="size-5 text-ink-3" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{post.title}</h2>
                        <p className="mt-0.5 text-xs text-ink-3">Created {timeAgo(post.createdAt)}</p>
                      </div>
                      <PostBadge post={post} />
                    </div>
                    <ul className="mt-2 divide-y divide-line">
                      {post.targets.map((t) => (
                        <TargetRow key={t.id} target={t} scheduled={post.status === 'scheduled'} />
                      ))}
                    </ul>
                    {post.status !== 'publishing' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {post.status === 'scheduled' && (
                          <Button size="sm" onClick={() => publish.mutate(post.id, { onError })}><Send className="size-4" aria-hidden /> Publish now</Button>
                        )}
                        {failed && (
                          <Button size="sm" onClick={() => publish.mutate(post.id, { onError })}><RotateCw className="size-4" aria-hidden /> Retry failed</Button>
                        )}
                        {post.draft != null && (
                          <Button size="sm" variant="ghost" onClick={() => open(post.draft, { draftId: null, videoId: post.video?.id ?? null })}><Copy className="size-4" aria-hidden /> Post again</Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const scheduled = post.status === 'scheduled';
                            if (confirm(scheduled ? 'Cancel this scheduled post?' : 'Remove this post from the list? Videos already published stay on each platform.')) remove.mutate(post.id, { onError });
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden /> {post.status === 'scheduled' ? 'Cancel' : 'Remove'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
