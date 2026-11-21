// Single-user password gate. Set APP_PASSWORD and every API call needs a signed session cookie.
// Without APP_PASSWORD the app is open, which is only appropriate on your own machine.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { safeEqual, sign } from './crypto';
import { agentConfigured, env, googleConfigured, metaConfigured } from './env';
import type { SessionInfo } from '../shared/types';

const COOKIE = 'relay_session';
const MAX_AGE_SEC = 30 * 24 * 3600;
const PUBLIC = [/^\/api\/session$/, /^\/api\/login$/, /^\/api\/health$/, /^\/api\/oauth\/\w+\/callback/];

function isAuthenticated(req: FastifyRequest): boolean {
  if (!env.appPassword) return true;
  const [expires, mac] = (req.cookies[COOKIE] ?? '').split('.');
  return Boolean(expires && mac && Number(expires) > Date.now() && safeEqual(mac, sign(`session:${expires}`)));
}

// Slow down password guessing: 10 attempts per address every 10 minutes.
const attempts = new Map<string, { count: number; resetAt: number }>();
function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  return ++entry.count > 10;
}

export function registerAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const pathname = req.url.split('?')[0];
    if (!pathname.startsWith('/api/') || PUBLIC.some((p) => p.test(pathname))) return;
    if (!isAuthenticated(req)) return reply.code(401).send({ error: 'Please sign in.' });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/session', async (req): Promise<SessionInfo> => ({
    authRequired: Boolean(env.appPassword),
    authenticated: isAuthenticated(req),
    providers: { google: googleConfigured(), meta: metaConfigured() },
    assistant: agentConfigured(),
  }));

  app.post('/api/login', async (req, reply: FastifyReply) => {
    if (tooManyAttempts(req.ip)) return reply.code(429).send({ error: 'Too many attempts. Try again in a few minutes.' });
    const { password } = z.object({ password: z.string() }).parse(req.body);
    if (!env.appPassword || !safeEqual(password, env.appPassword)) return reply.code(401).send({ error: 'Wrong password.' });
    const expires = Date.now() + MAX_AGE_SEC * 1000;
    reply.setCookie(COOKIE, `${expires}.${sign(`session:${expires}`)}`, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: env.publicUrl.startsWith('https://'),
      maxAge: MAX_AGE_SEC,
    });
    return { ok: true };
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
}
