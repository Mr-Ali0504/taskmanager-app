// Runs publish jobs. Each destination of a post uploads independently, so one platform
// failing never blocks the others, and a failed destination can be retried on its own.
import path from 'node:path';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { hasErrors, validateFields } from '../shared/platforms';
import type { PostStatus, TargetStatus } from '../shared/types';
import { db, schema } from './db';
import type { TargetRow, VideoRow } from './db/schema';
import { env } from './env';
import { log } from './log';
import { adapterFor, PlatformError } from './platforms';

const { posts, targets, videos, accounts } = schema;
const running = new Set<string>();

const setTarget = (id: string, patch: Partial<TargetRow>) => db.update(targets).set(patch).where(eq(targets.id, id)).run();

export function videoMeta(v: VideoRow) {
  return { sizeBytes: v.sizeBytes, mime: v.mime, durationSec: v.durationSec, width: v.width, height: v.height };
}

async function publishTarget(target: TargetRow, video: VideoRow) {
  try {
    const account = db.select().from(accounts).where(eq(accounts.id, target.accountId)).get();
    if (!account) throw new PlatformError('This channel was disconnected.');
    const issues = validateFields(target.platform, target.fields, videoMeta(video));
    if (hasErrors(issues)) throw new PlatformError(issues.find((i) => i.level === 'error')!.message);

    setTarget(target.id, { status: 'uploading', progress: 0, error: null });
    log(`Uploading "${video.name}" to ${target.platform} / ${target.accountName}`);
    let lastWrite = 0;
    const result = await adapterFor(account).publish({
      account,
      filePath: path.join(env.uploadsDir, video.storedName),
      sizeBytes: video.sizeBytes,
      mime: video.mime,
      fields: target.fields,
      onProgress: (status, percent) => {
        // Progress fires per megabyte; write to the database at most twice a second.
        if (status === 'uploading' && Date.now() - lastWrite < 500) return;
        lastWrite = Date.now();
        setTarget(target.id, { status, progress: Math.round(percent) });
      },
    });
    setTarget(target.id, { status: 'published', progress: 100, externalId: result.externalId, url: result.url });
    log(`Published to ${target.platform} / ${target.accountName}${result.url ? `: ${result.url}` : ''}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    setTarget(target.id, { status: 'failed', error: message });
    log(`FAILED  ${target.platform} / ${target.accountName}: ${message}`);
    if (e instanceof PlatformError && e.needsReauth)
      db.update(accounts).set({ status: 'needs_reauth' }).where(eq(accounts.id, target.accountId)).run();
  }
}

function summarise(statuses: TargetStatus[]): PostStatus {
  if (statuses.every((s) => s === 'published')) return 'published';
  if (statuses.every((s) => s === 'failed')) return 'failed';
  if (statuses.some((s) => s === 'pending' || s === 'uploading' || s === 'processing')) return 'publishing';
  return 'partial';
}

/** Publishes every destination of a post that has not succeeded yet. Safe to call again to retry. */
export async function runPost(postId: string) {
  if (running.has(postId)) return;
  running.add(postId);
  try {
    const post = db.select().from(posts).where(eq(posts.id, postId)).get();
    if (!post) return;
    const todo = db.select().from(targets).where(and(eq(targets.postId, postId), inArray(targets.status, ['pending', 'failed']))).all();
    const video = post.videoId ? db.select().from(videos).where(eq(videos.id, post.videoId)).get() : undefined;
    db.update(posts).set({ status: 'publishing' }).where(eq(posts.id, postId)).run();
    if (!video) {
      for (const t of todo) setTarget(t.id, { status: 'failed', error: 'The video file was deleted from the library.' });
    } else {
      for (const t of todo) setTarget(t.id, { status: 'pending', error: null, progress: 0 });
      await Promise.all(todo.map((t) => publishTarget(t, video)));
    }
    const all = db.select({ status: targets.status }).from(targets).where(eq(targets.postId, postId)).all();
    db.update(posts).set({ status: summarise(all.map((t) => t.status)) }).where(eq(posts.id, postId)).run();
  } finally {
    running.delete(postId);
  }
}

/** Checks every 20 seconds for scheduled posts whose time has come. */
export function startScheduler(log: (msg: string) => void) {
  // Anything mid-upload when the server last stopped cannot be resumed; mark it failed so it can be retried.
  const stuck = db.select().from(targets).where(inArray(targets.status, ['uploading', 'processing', 'pending'])).all();
  const publishingPosts = new Set(db.select({ id: posts.id }).from(posts).where(eq(posts.status, 'publishing')).all().map((p) => p.id));
  for (const t of stuck) {
    if (!publishingPosts.has(t.postId)) continue;
    setTarget(t.id, { status: 'failed', error: 'Interrupted by a server restart. Retry to publish.' });
  }
  for (const id of publishingPosts) {
    const all = db.select({ status: targets.status }).from(targets).where(eq(targets.postId, id)).all();
    db.update(posts).set({ status: summarise(all.map((t) => t.status)) }).where(eq(posts.id, id)).run();
  }

  const tick = () => {
    const due = db.select({ id: posts.id }).from(posts).where(and(eq(posts.status, 'scheduled'), lte(posts.scheduledAt, Date.now()))).all();
    for (const { id } of due) {
      log('A scheduled post is due; publishing it now.');
      void runPost(id);
    }
  };
  tick();
  return setInterval(tick, 20_000);
}
