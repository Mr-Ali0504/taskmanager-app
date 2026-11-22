import { BarChart3, CalendarDays, Clapperboard, LayoutDashboard, ListChecks, Sparkles, LogOut, MessageSquare, Moon, Radio, Send, Sun } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { actions, useAccounts, usePosts, useSession } from './api';
import { Button, Card, ErrorNote, inputClass, Spinner, useToast } from './components/ui';
import { emptyDraft, type Draft } from './draft';
import { cx } from './lib';
import { Analytics } from './pages/Analytics';
import { Assistant, emptyChat, WEEKLY_REVIEW_PROMPT, type ChatState } from './pages/Assistant';
import { Calendar } from './pages/Calendar';
import { Channels } from './pages/Channels';
import { Comments } from './pages/Comments';
import { Compose } from './pages/Compose';
import { Dashboard } from './pages/Dashboard';
import { Library } from './pages/Library';
import { Posts } from './pages/Posts';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: '' },
  { id: 'assistant', label: 'Assistant', icon: Sparkles, section: '' },
  { id: 'compose', label: 'Publish', icon: Send, section: 'Content' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, section: 'Content' },
  { id: 'posts', label: 'Posts', icon: ListChecks, section: 'Content' },
  { id: 'library', label: 'Library', icon: Clapperboard, section: 'Content' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, section: 'Audience' },
  { id: 'comments', label: 'Comments', icon: MessageSquare, section: 'Audience' },
  { id: 'channels', label: 'Channels', icon: Radio, section: 'Setup' },
] as const;
export type Route = (typeof NAV)[number]['id'];

const currentRoute = (): Route => {
  const id = location.hash.replace(/^#\//, '');
  return NAV.some((n) => n.id === id) ? (id as Route) : 'dashboard';
};

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await actions.login(password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <Logo />
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
            <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!password}>
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  );
}

const Logo = () => (
  <div className="flex items-center gap-2.5">
    <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-on-accent">
      <Send className="size-4" aria-hidden />
    </span>
    <span className="text-base font-semibold tracking-tight">Relay Studio</span>
  </div>
);

export function App() {
  const session = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const [route, setRoute] = useState<Route>(currentRoute);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [chat, setChat] = useState<ChatState>(emptyChat);
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'light');

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    const onSignedOut = () => client.invalidateQueries({ queryKey: ['session'] });
    window.addEventListener('hashchange', onHash);
    window.addEventListener('relay:signed-out', onSignedOut);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('relay:signed-out', onSignedOut);
    };
  }, [client]);

  // Coming back from a Google or Facebook sign-in: show the result once, then clean the address bar.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connected = params.get('connected');
    const error = params.get('connect_error');
    if (!connected && !error) return;
    if (connected) toast('good', `Connected ${connected} ${connected === '1' ? 'channel' : 'channels'}.`);
    if (error) toast('bad', error);
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
  }, [toast]);

  const go = useCallback((next: Route) => {
    location.hash = `/${next}`;
    window.scrollTo(0, 0);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('relay-theme', next);
    } catch {
      /* storage unavailable */
    }
    setTheme(next);
  };

  const signedIn = Boolean(session.data && (!session.data.authRequired || session.data.authenticated));
  const scheduledCount = usePosts(signedIn).data?.filter((p) => p.status === 'scheduled').length;
  const channelCount = useAccounts(signedIn).data?.length;

  if (session.isLoading) return <Spinner />;
  if (session.isError)
    return (
      <main className="mx-auto max-w-md p-6 pt-24">
        <ErrorNote>Cannot reach the Relay Studio server. Make sure it is running, then reload.</ErrorNote>
      </main>
    );
  if (session.data?.authRequired && !session.data.authenticated) return <Login onDone={() => client.invalidateQueries()} />;

  /** Opens the assistant and has it produce the weekly review straight away. */
  const askWeeklyReview = () => {
    setChat((c) => ({ ...c, queued: WEEKLY_REVIEW_PROMPT }));
    go('assistant');
  };
  const review = session.data?.assistant ? askWeeklyReview : undefined;

  const badges: Partial<Record<Route, number>> = { posts: scheduledCount, channels: channelCount };

  const page = {
    dashboard: <Dashboard go={go} onReview={review} />,
    assistant: <Assistant session={session.data!} chat={chat} setChat={setChat} />,
    compose: <Compose draft={draft} setDraft={setDraft} go={go} />,
    calendar: <Calendar go={go} setDraft={setDraft} />,
    posts: <Posts go={go} setDraft={setDraft} />,
    library: <Library go={go} setDraft={setDraft} />,
    analytics: <Analytics go={go} onReview={review} />,
    comments: <Comments go={go} />,
    channels: <Channels session={session.data!} />,
  }[route];

  return (
    <div className="min-h-dvh md:pl-56">
      {/* Sidebar on desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-line bg-surface p-4 md:flex">
        <Logo />
        <nav className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main">
          {NAV.map(({ id, label, icon: Icon, section }, i) => (
            <Fragment key={id}>
              {section && section !== NAV[i - 1]?.section && <p className="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{section}</p>}
              <a
                href={`#/${id}`}
                aria-current={route === id ? 'page' : undefined}
                className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', route === id ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-sunken hover:text-ink')}
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{label}</span>
                {badges[id] ? <span className="tabular rounded-full bg-sunken px-1.5 py-0.5 text-xs text-ink-2" title={id === 'posts' ? 'Scheduled posts' : 'Connected channels'}>{badges[id]}</span> : null}
              </a>
            </Fragment>
          ))}
        </nav>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          {session.data?.authRequired && (
            <Button variant="ghost" size="sm" onClick={() => actions.logout().then(() => client.invalidateQueries())}>
              <LogOut className="size-4" aria-hidden /> Sign out
            </Button>
          )}
        </div>
      </aside>

      {/* Top bar and bottom tabs on phones */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <Logo />
        <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Switch theme">
          {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
        </Button>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-line bg-surface md:hidden" aria-label="Main">
        {NAV.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/${id}`} aria-current={route === id ? 'page' : undefined} className={cx('flex min-w-16 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium', route === id ? 'text-accent' : 'text-ink-2')}>
            <Icon className="size-5" aria-hidden /> {label}
          </a>
        ))}
      </nav>

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16">{page}</main>
    </div>
  );
}
