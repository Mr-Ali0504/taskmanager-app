// Connecting channels: Google OAuth for YouTube, Facebook Login for Pages and the Instagram accounts linked to them.
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Platform } from '../../shared/platforms';
import type { AccountDTO } from '../../shared/types';
import { encrypt, newId } from '../crypto';
import { db, schema } from '../db';
import type { AccountRow } from '../db/schema';
import { env, googleConfigured, metaConfigured } from '../env';
import { qs, requestJson } from '../platforms/http';
import { GRAPH } from '../platforms/meta';
import { log, logError } from '../log';
import { forgetAccount } from '../performance';
import { clearCache } from './insights';

const { accounts } = schema;

export const toAccountDTO = (a: AccountRow): AccountDTO => ({
  id: a.id,
  platform: a.platform,
  name: a.name,
  handle: a.handle,
  avatarUrl: a.avatarUrl,
  demo: a.demo,
  status: a.status,
  createdAt: a.createdAt,
});

function saveAccount(a: { platform: Platform; externalId: string; name: string; handle?: string | null; avatarUrl?: string | null; tokens: object; demo?: boolean }) {
  const values = {
    platform: a.platform,
    externalId: a.externalId,
    name: a.name,
    handle: a.handle ?? null,
    avatarUrl: a.avatarUrl ?? null,
    tokens: encrypt(JSON.stringify(a.tokens)),
    demo: a.demo ?? false,
    status: 'connected' as const,
  };
  db.insert(accounts)
    .values({ id: newId(), createdAt: Date.now(), ...values })
    .onConflictDoUpdate({ target: [accounts.platform, accounts.externalId], set: values })
    .run();
}

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl', // reply to comments
  'https://www.googleapis.com/auth/yt-analytics.readonly',
].join(' ');

const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_read_user_content', 'pages_manage_engagement', 'read_insights',
  'business_management', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments', 'instagram_manage_insights',
].join(',');

// The random `state` value ties the provider's redirect back to a sign-in that this app started.
const states = new Map<string, number>();
const redirectUri = (provider: string) => `${env.publicUrl}/api/oauth/${provider}/callback`;

async function connectGoogle(code: string): Promise<number> {
  const token = await requestJson<{ access_token: string; refresh_token?: string; expires_in: number }>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: qs({ code, client_id: env.google.clientId, client_secret: env.google.clientSecret, redirect_uri: redirectUri('google'), grant_type: 'authorization_code' }),
  });
  const channels = await requestJson(`https://www.googleapis.com/youtube/v3/channels?${qs({ part: 'snippet', mine: true })}`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  for (const ch of channels.items ?? []) {
    saveAccount({
      platform: 'youtube',
      externalId: ch.id,
      name: ch.snippet.title,
      handle: ch.snippet.customUrl ?? null,
      avatarUrl: ch.snippet.thumbnails?.default?.url ?? null,
      tokens: { accessToken: token.access_token, refreshToken: token.refresh_token ?? '', expiresAt: Date.now() + token.expires_in * 1000 },
    });
  }
  return channels.items?.length ?? 0;
}

async function connectMeta(code: string): Promise<number> {
  const app = { client_id: env.meta.appId, client_secret: env.meta.appSecret };
  const short = await requestJson<{ access_token: string }>(`${GRAPH()}/oauth/access_token?${qs({ ...app, redirect_uri: redirectUri('meta'), code })}`);
  // Swap for a long-lived user token: Page tokens derived from it do not expire.
  const long = await requestJson<{ access_token: string }>(
    `${GRAPH()}/oauth/access_token?${qs({ ...app, grant_type: 'fb_exchange_token', fb_exchange_token: short.access_token })}`,
  );
  const pages = await requestJson(
    `${GRAPH()}/me/accounts?${qs({ fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}', limit: 100, access_token: long.access_token })}`,
  );
  let count = 0;
  for (const page of pages.data ?? []) {
    const tokens = { pageToken: page.access_token };
    saveAccount({ platform: 'facebook', externalId: page.id, name: page.name, avatarUrl: page.picture?.data?.url ?? null, tokens });
    count++;
    const ig = page.instagram_business_account;
    if (ig) {
      saveAccount({ platform: 'instagram', externalId: ig.id, name: ig.name || ig.username, handle: ig.username ? `@${ig.username}` : null, avatarUrl: ig.profile_picture_url ?? null, tokens });
      count++;
    }
  }
  return count;
}

export function registerAccounts(app: FastifyInstance) {
  app.get('/api/accounts', async () => db.select().from(accounts).orderBy(accounts.createdAt).all().map(toAccountDTO));

  app.delete<{ Params: { id: string } }>('/api/accounts/:id', async (req) => {
    db.delete(accounts).where(eq(accounts.id, req.params.id)).run();
    db.delete(schema.snapshots).where(eq(schema.snapshots.accountId, req.params.id)).run();
    forgetAccount(req.params.id);
    clearCache();
    return { ok: true };
  });

  // Sample channels with made-up numbers, for trying the app before API keys are set up.
  app.post('/api/accounts/demo', async () => {
    saveAccount({ platform: 'youtube', externalId: 'demo-youtube', name: 'Demo Channel', handle: '@demochannel', tokens: {}, demo: true });
    saveAccount({ platform: 'instagram', externalId: 'demo-instagram', name: 'Demo Creator', handle: '@demo.creator', tokens: {}, demo: true });
    saveAccount({ platform: 'facebook', externalId: 'demo-facebook', name: 'Demo Page', tokens: {}, demo: true });
    clearCache();
    return { ok: true };
  });

  app.delete('/api/accounts/demo', async () => {
    db.delete(accounts).where(eq(accounts.demo, true)).run();
    clearCache();
    return { ok: true };
  });

  app.get<{ Params: { provider: string } }>('/api/oauth/:provider/start', async (req, reply) => {
    const { provider } = req.params;
    const state = crypto.randomBytes(24).toString('base64url');
    for (const [key, expires] of states) if (expires < Date.now()) states.delete(key);
    states.set(state, Date.now() + 10 * 60_000);

    if (provider === 'google' && googleConfigured()) {
      return {
        url: `https://accounts.google.com/o/oauth2/v2/auth?${qs({
          client_id: env.google.clientId, redirect_uri: redirectUri('google'), response_type: 'code', scope: GOOGLE_SCOPES,
          access_type: 'offline', prompt: 'consent', include_granted_scopes: true, state,
        })}`,
      };
    }
    if (provider === 'meta' && metaConfigured()) {
      return {
        url: `https://www.facebook.com/${env.meta.graphVersion}/dialog/oauth?${qs({
          client_id: env.meta.appId, redirect_uri: redirectUri('meta'), response_type: 'code', scope: META_SCOPES, state,
        })}`,
      };
    }
    return reply.code(400).send({ error: 'This provider is not configured. Add its keys to .env and restart.' });
  });

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    '/api/oauth/:provider/callback',
    async (req, reply) => {
      const back = (params: Record<string, string>) => reply.redirect(`${env.publicUrl}/?${qs(params)}#/channels`);
      const { code, state, error, error_description } = req.query;
      const expires = state ? states.get(state) : undefined;
      if (state) states.delete(state);
      if (!expires || expires < Date.now()) return back({ connect_error: 'The sign-in link expired. Please try again.' });
      if (error || !code) return back({ connect_error: error_description ?? error ?? 'Sign-in was cancelled.' });
      try {
        const count = req.params.provider === 'google' ? await connectGoogle(code) : await connectMeta(code);
        clearCache();
        log(`Connected ${count} channel(s) through ${req.params.provider}.`);
        if (!count)
          return back({
            connect_error: req.params.provider === 'google' ? 'That Google account has no YouTube channel.' : 'No Facebook Pages were shared. Select at least one Page during sign-in.',
          });
        return back({ connected: String(count) });
      } catch (e) {
        logError(`connecting ${req.params.provider}`, e);
        return back({ connect_error: e instanceof Error ? e.message : 'Could not connect the account.' });
      }
    },
  );
}
