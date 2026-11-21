import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerAuth } from './auth';
import { runMigrations } from './db';
import { env } from './env';
import { startScheduler } from './publisher';
import { registerAccounts } from './routes/accounts';
import { recordAllSnapshots, registerInsights } from './routes/insights';
import { registerSaved } from './routes/saved';
import { registerPosts } from './routes/posts';
import { registerVideos } from './routes/videos';

runMigrations();

const app = Fastify({ logger: { level: env.isProd ? 'info' : 'warn' }, trustProxy: true });

await app.register(cookie);
await app.register(multipart, { limits: { fileSize: env.maxUploadBytes, files: 1 } });
// Gives routes reply.sendFile(), which handles HTTP range requests so videos can be scrubbed in the browser.
await app.register(fastifyStatic, { root: env.uploadsDir, serve: false });

app.setErrorHandler((error: Error & { statusCode?: number }, req, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ error: error.issues[0]?.message ?? 'Invalid request.' });
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  if (status >= 500) req.log.error(error);
  return reply.code(status).send({ error: status >= 500 ? 'Something went wrong on the server.' : error.message });
});

registerAuth(app);
registerAccounts(app);
registerVideos(app);
registerPosts(app);
registerInsights(app);
registerSaved(app);

// In production this same server also serves the built UI.
const webDir = path.resolve('dist/web');
if (fs.existsSync(webDir)) {
  await app.register(fastifyStatic, { root: webDir, decorateReply: false, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found.' });
    return reply.type('text/html').send(fs.readFileSync(path.join(webDir, 'index.html')));
  });
}

startScheduler((msg) => app.log.info(msg));
// Record each channel's audience shortly after start and then every six hours.
setTimeout(() => void recordAllSnapshots(), 30_000);
setInterval(() => void recordAllSnapshots(), 6 * 3600_000);
await app.listen({ port: env.port, host: env.host });
console.log(`Relay Studio API listening on http://${env.host}:${env.port}`);
if (!env.appPassword) console.warn('APP_PASSWORD is not set: anyone who can reach this address can publish to your channels. Set it before exposing the app.');
