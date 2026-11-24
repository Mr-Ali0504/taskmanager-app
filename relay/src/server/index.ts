import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerAuth } from './auth';
import { runMigrations } from './db';
import { agentConfigured, agentModel, env, googleConfigured, metaConfigured } from './env';
import { log, logError } from './log';
import { sampleAllAccounts } from './performance';
import { startScheduler } from './publisher';
import { registerAccounts } from './routes/accounts';
import { recordAllSnapshots, registerInsights } from './routes/insights';
import { registerSaved } from './routes/saved';
import { registerPosts } from './routes/posts';
import { registerVideos } from './routes/videos';

// On a public address the app holds the keys to the owner's channels, so it must not start without a password.
const local = ['127.0.0.1', 'localhost', '::1'].includes(env.host) && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.publicUrl);
if (!env.appPassword && !local) {
  console.error('Refusing to start: APP_PASSWORD is not set, and this server is reachable from outside this machine.\nSet APP_PASSWORD (a long, unique password) in the environment or .env and start again.');
  process.exit(1);
}

runMigrations();

const app = Fastify({ logger: false, trustProxy: true });

await app.register(cookie);
await app.register(multipart, { limits: { fileSize: env.maxUploadBytes, files: 1 } });
// Gives routes reply.sendFile(), which handles HTTP range requests so videos can be scrubbed in the browser.
await app.register(fastifyStatic, { root: env.uploadsDir, serve: false });

app.addHook('onSend', async (_req, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('x-frame-options', 'DENY');
  reply.header('referrer-policy', 'same-origin');
  if (env.publicUrl.startsWith('https://')) reply.header('strict-transport-security', 'max-age=15552000');
});

app.setErrorHandler((error: Error & { statusCode?: number }, req, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ error: error.issues[0]?.message ?? 'Invalid request.' });
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  if (status >= 500) logError(`${req.method} ${req.url.split('?')[0]}`, error);
  return reply.code(status).send({ error: status >= 500 ? 'Something went wrong on the server.' : error.message });
});

registerAuth(app);
registerAccounts(app);
registerVideos(app);
registerPosts(app);
registerInsights(app);
registerSaved(app);

// How much room is left for videos, shown in the Library.
app.get('/api/storage', async () => {
  const stat = fs.statfsSync(env.uploadsDir);
  const used = fs.readdirSync(env.uploadsDir).reduce((n, f) => n + fs.statSync(path.join(env.uploadsDir, f)).size, 0);
  return { usedBytes: used, freeBytes: Number(stat.bavail) * Number(stat.bsize) };
});

// In production this same server also serves the built UI.
const webDir = path.resolve('dist/web');
if (fs.existsSync(webDir)) {
  await app.register(fastifyStatic, { root: webDir, decorateReply: false, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found.' });
    return reply.type('text/html').send(fs.readFileSync(path.join(webDir, 'index.html')));
  });
}

startScheduler(log);
// Record each channel's audience shortly after start and then every six hours.
setTimeout(() => void recordAllSnapshots(), 30_000);
setInterval(() => void recordAllSnapshots(), 6 * 3600_000);
// Read every recent video's numbers each half hour, to build its hour-by-hour curve.
setTimeout(() => void sampleAllAccounts(), 60_000);
setInterval(() => void sampleAllAccounts(), 30 * 60_000);
await app.listen({ port: env.port, host: env.host });
console.log(`Relay Studio API listening on http://${env.host}:${env.port}`);
log(`Started. Open ${env.publicUrl}  |  YouTube keys: ${googleConfigured() ? 'yes' : 'no'}, Meta keys: ${metaConfigured() ? 'yes' : 'no'}, assistant: ${agentConfigured() ? agentModel() : 'off'}  |  data folder: ${env.dataDir}`);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    log('Stopping.');
    process.exit(0);
  });
if (!env.appPassword) log('No password is set. That is fine here: only this computer can reach the app.');
