// Creating posts (publish now or schedule), listing them with live progress, retrying failures.
import { desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateFields, type AnyFields, type Platform } from '../../shared/platforms';
import type { PostDTO } from '../../shared/types';
import { newId } from '../crypto';
import { db, schema } from '../db';
import { runPost, videoMeta } from '../publisher';
import { toVideoDTO } from './videos';

const { posts, targets, videos, accounts } = schema;

const fieldSchemas: Record<Platform, z.ZodType<AnyFields>> = {
  youtube: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()).max(100),
    categoryId: z.string().regex(/^\d+$/),
    privacy: z.enum(['public', 'unlisted', 'private']),
    madeForKids: z.boolean(),
    notifySubscribers: z.boolean(),
  }),
  instagram: z.object({ caption: z.string(), shareToFeed: z.boolean() }),
  facebook: z.object({ format: z.enum(['video', 'reel']), title: z.string(), description: z.string() }),
};

const createSchema = z.object({
  videoId: z.string(),
  title: z.string().max(300),
  scheduledAt: z.number().nullable(),
  targets: z.array(z.object({ accountId: z.string(), fields: z.unknown() })).min(1, 'Choose at least one channel.'),
  draft: z.unknown().optional(),
  draftId: z.string().nullish(),
});

function loadPosts(ids?: string[]): PostDTO[] {
  const rows = ids
    ? db.select().from(posts).where(inArray(posts.id, ids)).all()
    : db.select().from(posts).orderBy(desc(posts.createdAt)).limit(300).all();
  if (!rows.length) return [];
  const allTargets = db.select().from(targets).where(inArray(targets.postId, rows.map((p) => p.id))).all();
  const videoIds = [...new Set(rows.map((p) => p.videoId).filter((v): v is string => Boolean(v)))];
  const videoRows = videoIds.length ? db.select().from(videos).where(inArray(videos.id, videoIds)).all() : [];
  return rows.map((p) => {
    const video = videoRows.find((v) => v.id === p.videoId);
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      scheduledAt: p.scheduledAt,
      createdAt: p.createdAt,
      draft: p.draft ?? null,
      video: video ? toVideoDTO(video) : null,
      targets: allTargets
        .filter((t) => t.postId === p.id)
        .map((t) => ({ id: t.id, accountId: t.accountId, accountName: t.accountName, platform: t.platform, fields: t.fields, status: t.status, progress: t.progress, url: t.url, error: t.error })),
    };
  });
}

/** A problem with the request that the user can fix (as opposed to a server fault). */
export class PostError extends Error {}

/** Validates and stores a post, then starts publishing unless it is scheduled. Used by the API and by the assistant. */
export function createPost(input: unknown): PostDTO {
  const body = createSchema.parse(input);
  const video = db.select().from(videos).where(eq(videos.id, body.videoId)).get();
  if (!video) throw new PostError('That video is no longer in the library.');

  const prepared: { account: typeof accounts.$inferSelect; fields: AnyFields }[] = [];
  for (const t of body.targets) {
    const account = db.select().from(accounts).where(eq(accounts.id, t.accountId)).get();
    if (!account) throw new PostError('One of the selected channels was disconnected.');
    if (account.status !== 'connected') throw new PostError(`${account.name} needs to be reconnected first.`);
    const fields = fieldSchemas[account.platform].parse(t.fields);
    const blocking = validateFields(account.platform, fields, videoMeta(video)).find((i) => i.level === 'error');
    if (blocking) throw new PostError(`${account.name}: ${blocking.message}`);
    prepared.push({ account, fields });
  }

  const scheduled = body.scheduledAt != null && body.scheduledAt > Date.now() + 30_000;
  const postId = newId();
  db.transaction((tx) => {
    tx.insert(posts)
      .values({ id: postId, videoId: video.id, title: body.title || video.name, status: scheduled ? 'scheduled' : 'publishing', scheduledAt: scheduled ? body.scheduledAt : null, draft: body.draft ?? null, createdAt: Date.now() })
      .run();
    for (const { account, fields } of prepared)
      tx.insert(targets).values({ id: newId(), postId, accountId: account.id, accountName: account.name, platform: account.platform, fields }).run();
    if (body.draftId) tx.delete(schema.drafts).where(eq(schema.drafts.id, body.draftId)).run();
  });
  if (!scheduled) void runPost(postId);
  return loadPosts([postId])[0];
}

export { loadPosts };

export function registerPosts(app: FastifyInstance) {
  app.get('/api/posts', async () => loadPosts());

  app.post('/api/posts', async (req, reply) => {
    try {
      return createPost(req.body);
    } catch (e) {
      if (e instanceof PostError) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  // Retry failed destinations, or publish a scheduled post right away.
  app.post<{ Params: { id: string } }>('/api/posts/:id/publish', async (req, reply) => {
    const post = db.select().from(posts).where(eq(posts.id, req.params.id)).get();
    if (!post) return reply.code(404).send({ error: 'Post not found.' });
    if (post.status === 'publishing') return reply.code(409).send({ error: 'This post is already publishing.' });
    db.update(posts).set({ status: 'publishing', scheduledAt: null }).where(eq(posts.id, post.id)).run();
    void runPost(post.id);
    return loadPosts([post.id])[0];
  });

  // Removes the post from this app (cancelling it if scheduled). Videos already live on a platform stay there.
  app.delete<{ Params: { id: string } }>('/api/posts/:id', async (req, reply) => {
    const post = db.select().from(posts).where(eq(posts.id, req.params.id)).get();
    if (post?.status === 'publishing') return reply.code(409).send({ error: 'Wait for publishing to finish first.' });
    db.delete(posts).where(eq(posts.id, req.params.id)).run();
    return { ok: true };
  });
}
