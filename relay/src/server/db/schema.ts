import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type { AnyFields, Platform } from '../../shared/platforms';
import type { PostStatus, TargetStatus } from '../../shared/types';

/** A connected YouTube channel, Instagram account or Facebook Page. */
export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    platform: text('platform').$type<Platform>().notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    handle: text('handle'),
    avatarUrl: text('avatar_url'),
    /** Encrypted JSON: access/refresh tokens. Never sent to the browser. */
    tokens: text('tokens').notNull(),
    demo: integer('demo', { mode: 'boolean' }).notNull().default(false),
    status: text('status').$type<'connected' | 'needs_reauth'>().notNull().default('connected'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('accounts_platform_external').on(t.platform, t.externalId)],
);

/** An uploaded video file in the library. */
export const videos = sqliteTable('videos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  storedName: text('stored_name').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mime: text('mime').notNull(),
  durationSec: integer('duration_sec'),
  width: integer('width'),
  height: integer('height'),
  hasThumb: integer('has_thumb', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

/** One publish action: a video going to one or more accounts, now or later. */
export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id'),
    title: text('title').notNull(),
    status: text('status').$type<PostStatus>().notNull(),
    scheduledAt: integer('scheduled_at'),
    /** The composer state this post was made from, so it can be posted again later. */
    draft: text('draft', { mode: 'json' }).$type<unknown>(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('posts_status').on(t.status)],
);

/** One destination of a post, with the exact fields sent to that platform. */
export const targets = sqliteTable(
  'targets',
  {
    id: text('id').primaryKey(),
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    accountName: text('account_name').notNull(),
    platform: text('platform').$type<Platform>().notNull(),
    fields: text('fields', { mode: 'json' }).$type<AnyFields>().notNull(),
    status: text('status').$type<TargetStatus>().notNull().default('pending'),
    progress: integer('progress').notNull().default(0),
    externalId: text('external_id'),
    url: text('url'),
    error: text('error'),
  },
  (t) => [index('targets_post').on(t.postId)],
);

/** A named set of channels, e.g. every account of one brand, selectable in one click. */
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  accountIds: text('account_ids', { mode: 'json' }).$type<string[]>().notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Reusable text: a hashtag set or a caption template. */
export const snippets = sqliteTable('snippets', {
  id: text('id').primaryKey(),
  kind: text('kind').$type<'hashtags' | 'text'>().notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** An unfinished post saved from the composer. */
export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** One audience reading per channel per day. Platforms do not give follower history, so the app keeps its own. */
export const snapshots = sqliteTable(
  'snapshots',
  {
    accountId: text('account_id').notNull(),
    date: text('date').notNull(),
    followers: integer('followers'),
    totalViews: integer('total_views'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
);

/** A video the app is following hour by hour. Kept so it can still be compared after it leaves the "recent" list. */
export const trackedVideos = sqliteTable(
  'tracked_videos',
  {
    accountId: text('account_id').notNull(),
    videoId: text('video_id').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    thumbnailUrl: text('thumbnail_url'),
    publishedAt: integer('published_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.videoId] })],
);

/**
 * One reading of a video's totals at a moment in time. The platforms only report running totals,
 * so the hour-by-hour curve of a video is rebuilt from these readings.
 */
export const videoStats = sqliteTable(
  'video_stats',
  {
    accountId: text('account_id').notNull(),
    videoId: text('video_id').notNull(),
    at: integer('at').notNull(),
    views: integer('views'),
    likes: integer('likes'),
    comments: integer('comments'),
    shares: integer('shares'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.videoId, t.at] })],
);

export type AccountRow = typeof accounts.$inferSelect;
export type VideoRow = typeof videos.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type TargetRow = typeof targets.$inferSelect;
