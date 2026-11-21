// The video library: upload once, publish anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { VideoDTO } from '../../shared/types';
import { newId } from '../crypto';
import { db, schema } from '../db';
import type { VideoRow } from '../db/schema';
import { env } from '../env';
import { makeThumbnail, probe } from '../media';

const { videos } = schema;

export const toVideoDTO = (v: VideoRow): VideoDTO => ({
  id: v.id,
  name: v.name,
  sizeBytes: v.sizeBytes,
  mime: v.mime,
  durationSec: v.durationSec,
  width: v.width,
  height: v.height,
  hasThumb: v.hasThumb,
  createdAt: v.createdAt,
});

const positiveInt = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);

export function registerVideos(app: FastifyInstance) {
  app.get('/api/videos', async () => db.select().from(videos).orderBy(desc(videos.createdAt)).all().map(toVideoDTO));

  // The browser sends what it measured (duration, size) as query parameters; ffprobe overrides it when available.
  app.post<{ Querystring: { duration?: string; width?: string; height?: string } }>('/api/videos', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file was uploaded.' });
    if (!file.mimetype.startsWith('video/')) {
      file.file.resume();
      return reply.code(400).send({ error: 'That file is not a video.' });
    }
    const id = newId();
    const ext = path.extname(file.filename).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8) || '.mp4';
    const storedName = `${id}${ext}`;
    const filePath = path.join(env.uploadsDir, storedName);
    await pipeline(file.file, fs.createWriteStream(filePath));
    if (file.file.truncated) {
      fs.rmSync(filePath, { force: true });
      return reply.code(413).send({ error: `File is larger than the ${Math.round(env.maxUploadBytes / 1024 ** 3)} GB upload limit.` });
    }

    const probed = await probe(filePath);
    const durationSec = probed?.durationSec ?? positiveInt(req.query.duration);
    const hasThumb = await makeThumbnail(filePath, path.join(env.thumbsDir, `${id}.jpg`), Math.min(1, (durationSec ?? 2) / 2));
    const row: VideoRow = {
      id,
      name: path.basename(file.filename).slice(0, 200),
      storedName,
      sizeBytes: fs.statSync(filePath).size,
      mime: file.mimetype,
      durationSec,
      width: probed?.width ?? positiveInt(req.query.width),
      height: probed?.height ?? positiveInt(req.query.height),
      hasThumb,
      createdAt: Date.now(),
    };
    db.insert(videos).values(row).run();
    return toVideoDTO(row);
  });

  app.get<{ Params: { id: string } }>('/api/videos/:id/file', async (req, reply) => {
    const video = db.select().from(videos).where(eq(videos.id, req.params.id)).get();
    if (!video) return reply.code(404).send({ error: 'Video not found.' });
    return reply.type(video.mime).sendFile(video.storedName, env.uploadsDir);
  });

  app.get<{ Params: { id: string } }>('/api/videos/:id/thumb', async (req, reply) => {
    const video = db.select().from(videos).where(eq(videos.id, req.params.id)).get();
    if (!video?.hasThumb) return reply.code(404).send({ error: 'No thumbnail.' });
    return reply.header('cache-control', 'private, max-age=86400').sendFile(`${video.id}.jpg`, env.thumbsDir);
  });

  app.delete<{ Params: { id: string } }>('/api/videos/:id', async (req, reply) => {
    const video = db.select().from(videos).where(eq(videos.id, req.params.id)).get();
    if (!video) return reply.code(404).send({ error: 'Video not found.' });
    const waiting = db.select().from(schema.posts).where(eq(schema.posts.videoId, video.id)).all().filter((p) => p.status === 'scheduled' || p.status === 'publishing');
    if (waiting.length) return reply.code(409).send({ error: 'This video has a post that is scheduled or publishing. Cancel that first.' });
    fs.rmSync(path.join(env.uploadsDir, video.storedName), { force: true });
    fs.rmSync(path.join(env.thumbsDir, `${video.id}.jpg`), { force: true });
    db.delete(videos).where(eq(videos.id, video.id)).run();
    return { ok: true };
  });
}
