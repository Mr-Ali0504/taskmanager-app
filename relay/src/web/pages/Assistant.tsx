// Chat with the assistant. It looks things up by itself; publishing and replying wait for your approval.
import { CalendarClock, Check, Film, MessageSquare, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AssistantTurn, PendingAction, SessionInfo } from '../../shared/types';
import { api } from '../api';
import { Button, Card, ErrorNote, PageHeader, PlatformIcon } from '../components/ui';
import { cx, formatDateTime } from '../lib';

export type ChatItem =
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'steps'; steps: string[] }
  | { type: 'actions'; actions: PendingAction[]; decided: Record<string, boolean> | null };

export interface ChatState {
  conversationId: string | null;
  items: ChatItem[];
  /** A message queued from another page (e.g. "Weekly review"); sent as soon as the assistant opens. */
  queued: string | null;
}
export const emptyChat = (): ChatState => ({ conversationId: null, items: [], queued: null });
export const WEEKLY_REVIEW_PROMPT = 'Give me my weekly review: what is working, what needs attention, and what I should do this week.';

/** Renders the small subset of Markdown the assistant uses: headings, bullet and numbered lists, and bold. */
function RichText({ text }: { text: string }) {
  const bold = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part));
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className={cx('space-y-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>
        {list.items.map((item, i) => (
          <li key={i}>{bold(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line) continue;
    blocks.push(heading ? <h3 key={blocks.length} className="pt-1 text-sm font-semibold">{bold(heading[1])}</h3> : <p key={blocks.length}>{bold(line)}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

const SUGGESTIONS = [
  WEEKLY_REVIEW_PROMPT,
  'Show me comments I should reply to, and draft replies.',
  'Post my newest video to all my Instagram accounts tomorrow at 6pm.',
  'What do I have scheduled this week?',
];

const post = (path: string, body: unknown) => api<AssistantTurn>(path, { method: 'POST', body: JSON.stringify(body) });

function ActionCard({ action, decision, choice, onChoose, selectable }: { action: PendingAction; decision: boolean | null; choice: boolean; onChoose: (approve: boolean) => void; selectable: boolean }) {
  const decided = decision != null;
  return (
    <div className={cx('rounded-xl border p-4', decided ? 'border-line opacity-80' : 'border-accent/50 bg-accent-soft/30')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {action.kind === 'post' ? <Film className="size-4" aria-hidden /> : <MessageSquare className="size-4" aria-hidden />}
          {action.kind === 'post' ? (action.scheduledAt ? 'Schedule a post' : 'Publish now') : 'Reply to a comment'}
        </p>
        {decided ? (
          <span className={cx('flex items-center gap-1 text-sm font-medium', decision ? 'text-good' : 'text-ink-3')}>
            {decision ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />} {decision ? 'Approved' : 'Declined'}
          </span>
        ) : !selectable ? null : (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-(--accent)" checked={choice} onChange={(e) => onChoose(e.target.checked)} /> Include
          </label>
        )}
      </div>
      {action.kind === 'post' ? (
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-ink-3">Video</dt>
            <dd className="font-medium">{action.videoName}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Channels</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {action.channels.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2.5 pl-1 text-xs font-medium">
                  <PlatformIcon platform={c.platform} size={16} /> {c.name}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Title</dt>
            <dd>{action.title || <span className="text-ink-3">None</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Description</dt>
            <dd className="whitespace-pre-wrap">{action.description || <span className="text-ink-3">None</span>}</dd>
            {action.hashtags.length > 0 && <dd className="mt-1 text-ink-2">{action.hashtags.map((h) => `#${h}`).join(' ')}</dd>}
          </div>
          <div>
            <dt className="text-xs text-ink-3">When</dt>
            <dd className="flex items-center gap-1.5">{action.scheduledAt ? <><CalendarClock className="size-4 text-accent" aria-hidden /> {formatDateTime(action.scheduledAt)}</> : 'As soon as you approve'}</dd>
          </div>
        </dl>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-1.5 text-xs text-ink-3"><PlatformIcon platform={action.channel.platform} size={14} /> {action.channel.name} · on “{action.videoTitle}”</p>
          <blockquote className="border-l-2 border-line pl-3 text-ink-2">
            <span className="font-medium text-ink">{action.commentAuthor}:</span> {action.commentText}
          </blockquote>
          <p><span className="text-xs text-ink-3">Your reply</span><br />{action.text}</p>
        </div>
      )}
    </div>
  );
}

export function Assistant({ session, chat, setChat }: { session: SessionInfo; chat: ChatState; setChat: Dispatch<SetStateAction<ChatState>> }) {
  const client = useQueryClient();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const bottom = useRef<HTMLDivElement>(null);

  const last = chat.items.at(-1);
  const awaiting = last?.type === 'actions' && last.decided == null ? last : null;
  useEffect(() => {
    // In braces on purpose: newer browsers return a promise from scrollIntoView, and an effect must not return one.
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.items.length, busy]);

  const apply = (turn: AssistantTurn, before: ChatItem[]) => {
    const items = [...before];
    if (turn.steps.length) items.push({ type: 'steps', steps: turn.steps });
    for (const text of turn.texts) items.push({ type: 'assistant', text });
    if (turn.pending.length) items.push({ type: 'actions', actions: turn.pending, decided: null });
    setChat({ conversationId: turn.conversationId, items, queued: null });
    setChoices(Object.fromEntries(turn.pending.map((a) => [a.id, true])));
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy || awaiting) return;
    const before: ChatItem[] = [...chat.items, { type: 'user', text: message }];
    setChat((c) => ({ ...c, items: before }));
    setInput('');
    setError('');
    setBusy(true);
    try {
      apply(await post('/assistant/message', { conversationId: chat.conversationId, message, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), before);
    } catch (e) {
      setError((e as Error).message);
      setChat((c) => ({ ...c, items: chat.items }));
      setInput(message);
    } finally {
      setBusy(false);
    }
  };

  // A prompt queued from the Dashboard or Analytics page is sent once, when this page opens.
  useEffect(() => {
    if (!chat.queued || busy || awaiting || !session.assistant) return;
    const message = chat.queued;
    setChat((c) => ({ ...c, queued: null }));
    void send(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.queued]);

  const decide = async (approveNone = false) => {
    if (!awaiting || !chat.conversationId || busy) return;
    const decided = Object.fromEntries(awaiting.actions.map((a) => [a.id, !approveNone && choices[a.id] !== false]));
    const before: ChatItem[] = [...chat.items.slice(0, -1), { ...awaiting, decided }];
    setChat((c) => ({ ...c, items: before }));
    setError('');
    setBusy(true);
    try {
      apply(await post('/assistant/decide', { conversationId: chat.conversationId, approved: Object.keys(decided).filter((id) => decided[id]) }), before);
      // Approved actions change posts and comments, so refresh what other pages show.
      for (const key of ['posts', 'comments', 'drafts']) void client.invalidateQueries({ queryKey: [key] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <PageHeader
      title="Assistant"
      subtitle="Tell it what to post, where and when, or ask about your comments and numbers. It asks before publishing or replying."
      actions={chat.items.length > 0 && <Button variant="ghost" onClick={() => (setChat(emptyChat()), setError(''))} disabled={busy}><RotateCcw className="size-4" aria-hidden /> New chat</Button>}
    />
  );

  if (!session.assistant)
    return (
      <>
        {header}
        <Card className="p-6">
          <h2 className="font-semibold">The assistant needs an Anthropic API key</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Create a key in the Claude Console (console.anthropic.com, under API keys).</li>
            <li>Open the <code className="font-mono text-xs">.env</code> file in the <code className="font-mono text-xs">relay</code> folder and add a line <code className="font-mono text-xs">ANTHROPIC_API_KEY=</code> followed by the key.</li>
            <li>Stop the app and start it again.</li>
          </ol>
          <p className="mt-3 text-sm text-ink-3">Usage is billed to your Anthropic account. The key stays on your machine.</p>
        </Card>
      </>
    );

  const approvedCount = awaiting ? awaiting.actions.filter((a) => choices[a.id] !== false).length : 0;

  return (
    <>
      {header}
      <div className="mx-auto max-w-3xl">
        {chat.items.length === 0 && (
          <Card className="mb-4 p-6">
            <p className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-accent" aria-hidden /> Try asking</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-lg border border-line px-3 py-2.5 text-left text-sm hover:border-accent hover:bg-accent-soft/40">
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="space-y-3" aria-live="polite">
          {chat.items.map((item, i) => {
            if (item.type === 'user') return <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-on-accent">{item.text}</div>;
            if (item.type === 'assistant') return <div key={i} className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-sm leading-relaxed"><RichText text={item.text} /></div>;
            if (item.type === 'steps') return <p key={i} className="px-1 text-xs text-ink-3">{item.steps.join(' · ')}</p>;
            return (
              <div key={i} className="space-y-3">
                {item.actions.map((a) => (
                  <ActionCard key={a.id} action={a} decision={item.decided ? item.decided[a.id] : null} selectable={item.actions.length > 1} choice={choices[a.id] !== false} onChoose={(v) => setChoices((c) => ({ ...c, [a.id]: v }))} />
                ))}
                {item.decided == null && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" loading={busy} disabled={approvedCount === 0} onClick={() => decide()}>
                      <Check className="size-4" aria-hidden /> Approve{item.actions.length > 1 ? ` ${approvedCount} of ${item.actions.length}` : ''}
                    </Button>
                    <Button disabled={busy} onClick={() => decide(true)}><X className="size-4" aria-hidden /> Decline{item.actions.length > 1 ? ' all' : ''}</Button>
                  </div>
                )}
              </div>
            );
          })}
          {busy && !awaiting && <p className="animate-pulse px-1 text-sm text-ink-3" role="status">Working…</p>}
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>

        <form
          className="sticky bottom-20 mt-6 flex gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lg md:bottom-6"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={Boolean(awaiting)}
            placeholder={awaiting ? 'Approve or decline above to continue' : 'Message the assistant'}
            aria-label="Message the assistant"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm placeholder:text-ink-3 focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={!input.trim() || busy || Boolean(awaiting)} aria-label="Send"><Send className="size-4" aria-hidden /></Button>
        </form>
        <div ref={bottom} />
      </div>
    </>
  );
}
