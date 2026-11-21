// Connect and disconnect channels, and see what each platform accepts.
import { AlertTriangle, CheckCircle2, FlaskConical, Plus, Unplug } from 'lucide-react';
import { PLATFORM_INFO, PLATFORMS } from '../../shared/platforms';
import type { SessionInfo } from '../../shared/types';
import { actions, useAccounts, useAction } from '../api';
import { Avatar, Badge, Button, Card, ErrorNote, PageHeader, PlatformIcon, Spinner, useToast } from '../components/ui';

export function Channels({ session }: { session: SessionInfo }) {
  const accounts = useAccounts();
  const toast = useToast();
  const onError = (e: unknown) => toast('bad', (e as Error).message);
  const everything = ['accounts', 'analytics', 'comments'];
  const disconnect = useAction(actions.disconnect, everything);
  const addDemo = useAction(actions.addDemo, everything);
  const removeDemo = useAction(actions.removeDemo, everything);
  const connect = useAction(async (provider: 'google' | 'meta') => {
    const { url } = await actions.startOAuth(provider);
    location.href = url;
  });

  const list = accounts.data ?? [];
  const hasDemo = list.some((a) => a.demo);
  const providers = [
    { id: 'google' as const, title: 'YouTube', body: 'Sign in with Google and choose the channel to publish to.', ready: session.providers.google, icons: ['youtube'] as const, keys: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' },
    { id: 'meta' as const, title: 'Instagram and Facebook', body: 'One Facebook sign-in connects your Pages and the Instagram accounts linked to them.', ready: session.providers.meta, icons: ['instagram', 'facebook'] as const, keys: 'META_APP_ID and META_APP_SECRET' },
  ];

  return (
    <>
      <PageHeader title="Channels" subtitle="Connect each account once. Access tokens are stored encrypted on your server." />
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-center gap-2">
                {p.icons.map((i) => (
                  <PlatformIcon key={i} platform={i} size={24} />
                ))}
                <h2 className="ml-1 font-semibold">{p.title}</h2>
              </div>
              <p className="mt-2 flex-1 text-sm text-ink-2">{p.body}</p>
              {p.ready ? (
                <Button variant="primary" className="mt-4 self-start" loading={connect.isPending && connect.variables === p.id} onClick={() => connect.mutate(p.id, { onError })}>
                  <Plus className="size-4" aria-hidden /> Connect {p.title}
                </Button>
              ) : (
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>Needs API keys first. Add <code className="font-mono text-xs">{p.keys}</code> to your <code className="font-mono text-xs">.env</code> file and restart. The README walks through getting them.</span>
                </p>
              )}
            </Card>
          ))}
        </div>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Connected</h2>
            {hasDemo ? (
              <Button size="sm" loading={removeDemo.isPending} onClick={() => removeDemo.mutate(undefined, { onError })}>Remove demo channels</Button>
            ) : (
              <Button size="sm" loading={addDemo.isPending} onClick={() => addDemo.mutate(undefined, { onError })}><FlaskConical className="size-4" aria-hidden /> Try with demo channels</Button>
            )}
          </div>
          {accounts.isLoading ? (
            <Spinner />
          ) : accounts.isError ? (
            <ErrorNote>Could not load channels. Reload to try again.</ErrorNote>
          ) : list.length === 0 ? (
            <Card className="px-5 py-8 text-center text-sm text-ink-2">Nothing connected yet. Connect an account above, or add demo channels to look around with sample data.</Card>
          ) : (
            <Card className="divide-y divide-line">
              {list.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Avatar name={a.name} url={a.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-ink-3"><PlatformIcon platform={a.platform} size={14} /> {PLATFORM_INFO[a.platform].label} {PLATFORM_INFO[a.platform].noun}{a.handle ? ` · ${a.handle}` : ''}</p>
                  </div>
                  {a.demo ? <Badge>Demo</Badge> : a.status === 'connected' ? <Badge tone="good"><CheckCircle2 className="size-3" aria-hidden /> Connected</Badge> : <Badge tone="warn"><AlertTriangle className="size-3" aria-hidden /> Reconnect needed</Badge>}
                  <Button size="sm" variant="ghost" aria-label={`Disconnect ${a.name}`} onClick={() => confirm(`Disconnect ${a.name}? Videos already published stay where they are.`) && disconnect.mutate(a.id, { onError })}>
                    <Unplug className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold">What each platform takes</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PLATFORMS.map((p) => (
              <Card key={p} className="p-5">
                <h3 className="flex items-center gap-2 font-semibold"><PlatformIcon platform={p} /> {PLATFORM_INFO[p].label}</h3>
                <p className="mt-2 text-sm text-ink-2">{PLATFORM_INFO[p].summary}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {PLATFORM_INFO[p].accepts.map((item) => (
                    <li key={item} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /> {item}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
