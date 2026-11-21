// Top comments from recent videos on every channel, with replies sent from one place.
import { CornerDownRight, ExternalLink, Heart, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';
import type { Platform } from '../../shared/platforms';
import type { RemoteComment } from '../../shared/types';
import { actions, useAccounts, useAction, useComments } from '../api';
import type { Route } from '../App';
import { Avatar, Button, Card, EmptyState, ErrorNote, inputClass, PageHeader, PlatformIcon, Segmented, Spinner, useToast } from '../components/ui';
import { formatCount, PLATFORM_LABEL, timeAgo } from '../lib';

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
  const [filter, setFilter] = useState<Platform | 'all'>('all');
  const refresh = useAction(() => actions.refresh('comments'), ['comments']);

  const platforms = [...new Set((accounts.data ?? []).map((a) => a.platform))];
  const header = (
    <PageHeader
      title="Comments"
      subtitle="The most-liked comments on your five latest videos per channel."
      actions={
        <>
          {platforms.length > 1 && (
            <Segmented label="Platform" value={filter} onChange={setFilter} options={[{ value: 'all' as const, label: 'All' }, ...platforms.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))]} />
          )}
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

  const list = (comments.data?.comments ?? []).filter((c) => filter === 'all' || c.platform === filter);
  return (
    <>
      {header}
      <div className="space-y-3">
        {comments.data?.errors.map((e) => (
          <ErrorNote key={e.accountId}>{accounts.data?.find((a) => a.id === e.accountId)?.name ?? 'A channel'}: {e.message}</ErrorNote>
        ))}
        {list.length === 0 ? (
          <EmptyState icon={<MessageSquare className="size-5" aria-hidden />} title="No comments yet" body="Comments on your recent videos will appear here, most-liked first." />
        ) : (
          list.slice(0, 60).map((c) => <CommentCard key={`${c.accountId}:${c.id}`} comment={c} />)
        )}
      </div>
    </>
  );
}
