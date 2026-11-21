// Top comments from recent videos on every channel, with replies sent from one place.
import { CornerDownRight, ExternalLink, Heart, MessageSquare, RefreshCw, Search, Send } from 'lucide-react';
import { useState } from 'react';
import type { RemoteComment } from '../../shared/types';
import { actions, useAccounts, useAction, useComments } from '../api';
import type { Route } from '../App';
import { Avatar, Button, Card, EmptyState, ErrorNote, inputClass, PageHeader, PlatformIcon, Segmented, Spinner, useToast } from '../components/ui';
import { cx, formatCount, PLATFORM_LABEL, timeAgo } from '../lib';

function CommentCard({ comment }: { comment: RemoteComment }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const reply = useAction(actions.reply);
  const send = () =>
    reply.mutate(
      { accountId: comment.accountId, commentId: comment.id, text },
      {
        onSuccess: () => {
          setSent(true);
          setOpen(false);
          setText('');
          toast('good', 'Reply posted.');
        },
        onError: (e) => toast('bad', (e as Error).message),
      },
    );

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar name={comment.author} url={comment.authorAvatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{comment.author}</span>
            <span className="text-xs text-ink-3">{timeAgo(comment.publishedAt)}</span>
          </p>
          <p className="mt-1 text-sm break-words whitespace-pre-wrap">{comment.text}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
            <PlatformIcon platform={comment.platform} size={14} />
            <span className="truncate">on “{comment.videoTitle}”</span>
            {comment.videoUrl && (
              <a href={comment.videoUrl} target="_blank" rel="noreferrer" aria-label="Open video" className="hover:text-ink"><ExternalLink className="size-3.5" aria-hidden /></a>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-ink-2">
            <span className="tabular flex items-center gap-1.5"><Heart className="size-4" aria-hidden /> {formatCount(comment.likes)}<span className="sr-only"> likes</span></span>
            <span className="tabular flex items-center gap-1.5"><MessageSquare className="size-4" aria-hidden /> {formatCount(comment.replies)}<span className="sr-only"> replies</span></span>
            {sent ? (
              <span className="text-good">Replied</span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}><CornerDownRight className="size-4" aria-hidden /> Reply</Button>
            )}
          </div>
          {open && (
            <div className="mt-3 flex gap-2">
              <input autoFocus className={inputClass} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && send()} placeholder={`Reply as your ${PLATFORM_LABEL[comment.platform]} channel`} aria-label="Your reply" />
              <Button variant="primary" loading={reply.isPending} disabled={!text.trim()} onClick={send} aria-label="Send reply"><Send className="size-4" aria-hidden /></Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function Comments({ go }: { go: (r: Route) => void }) {
  const comments = useComments();
  const accounts = useAccounts();
  const [channel, setChannel] = useState('all');
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [query, setQuery] = useState('');
  const refresh = useAction(() => actions.refresh('comments'), ['comments']);

  const header = (
    <PageHeader
      title="Comments"
      subtitle="Comments on the five latest videos of each channel. Reply without leaving the app."
      actions={
        <>
          <Segmented label="Sort" value={sort} onChange={setSort} options={[{ value: 'top', label: 'Most liked' }, { value: 'new', label: 'Newest' }]} />
          <Button onClick={() => refresh.mutate(undefined)} loading={refresh.isPending} aria-label="Refresh"><RefreshCw className="size-4" aria-hidden /></Button>
        </>
      }
    />
  );
  if (comments.isLoading || accounts.isLoading) return <>{header}<Spinner label="Loading comments from each platform" /></>;
  if (comments.isError) return <>{header}<ErrorNote>Could not load comments. Reload to try again.</ErrorNote></>;
  if (!accounts.data?.length)
    return (
      <>
        {header}
        <EmptyState icon={<MessageSquare className="size-5" aria-hidden />} title="No channels connected" body="Connect a channel to read and answer comments here." action={<Button variant="primary" onClick={() => go('channels')}>Connect channels</Button>} />
      </>
    );

  const q = query.trim().toLowerCase();
  const list = (comments.data?.comments ?? [])
    .filter((c) => channel === 'all' || c.accountId === channel)
    .filter((c) => !q || `${c.text} ${c.author} ${c.videoTitle}`.toLowerCase().includes(q))
    .sort((a, b) => (sort === 'new' ? b.publishedAt.localeCompare(a.publishedAt) : b.likes - a.likes || b.publishedAt.localeCompare(a.publishedAt)));
  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input className={cx(inputClass, 'pl-9')} placeholder="Search comments, authors or videos" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search comments" />
        </div>
        <select className={cx(inputClass, 'w-auto min-w-48')} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
          <option value="all">All channels</option>
          {accounts.data.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({PLATFORM_LABEL[a.platform]})</option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-ink-3">{list.length} {list.length === 1 ? 'comment' : 'comments'}</p>
      <div className="space-y-3">
        {comments.data?.errors.map((e) => (
          <ErrorNote key={e.accountId}>{accounts.data?.find((a) => a.id === e.accountId)?.name ?? 'A channel'}: {e.message}</ErrorNote>
        ))}
        {list.length === 0 ? (
          <EmptyState icon={<MessageSquare className="size-5" aria-hidden />} title="No comments yet" body={q || channel !== 'all' ? 'Nothing matches these filters.' : 'Comments on your recent videos will appear here.'} />
        ) : (
          list.slice(0, 60).map((c) => <CommentCard key={`${c.accountId}:${c.id}`} comment={c} />)
        )}
      </div>
    </>
  );
}
