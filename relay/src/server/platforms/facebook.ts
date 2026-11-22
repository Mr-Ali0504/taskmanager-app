// Facebook Pages: Video API, Reels Publishing API, Page insights and comments.
// Docs: https://developers.facebook.com/docs/video-api/guides/publishing
//       https://developers.facebook.com/docs/video-api/guides/reels-publishing
import fs from 'node:fs';
import type { FacebookFields } from '../../shared/platforms';
import { env } from '../env';
import { requestJson, step, toInt } from './http';
import { graphGet, graphPost, insightPoints, pageToken, rupload, sinceUntil } from './meta';
import type { PlatformAdapter } from './types';

export const facebook: PlatformAdapter<FacebookFields> = {
  async publish({ account, filePath, sizeBytes, mime, fields, onProgress }) {
    const token = pageToken(account);
    const page = account.externalId;

    if (fields.format === 'reel') {
      const start = await step('Facebook Reel, starting (step 1 of 3)', () => graphPost<{ video_id: string; upload_url: string }>(token, `${page}/video_reels`, { upload_phase: 'start' }));
      await step('Facebook Reel, sending the video file (step 2 of 3)', () => rupload(start.upload_url, token, filePath, sizeBytes, (p) => onProgress('uploading', p)));
      onProgress('processing', 100);
      await step('Facebook Reel, publishing (step 3 of 3)', () =>
        graphPost(token, `${page}/video_reels`, {
          upload_phase: 'finish',
          video_id: start.video_id,
          video_state: 'PUBLISHED',
          description: fields.description,
        }),
      );
      return { externalId: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}` };
    }

    // Regular Page video: one multipart request. The file is read from disk lazily, not loaded into memory.
    const form = new FormData();
    form.set('access_token', token);
    if (fields.title) form.set('title', fields.title);
    form.set('description', fields.description);
    form.set('source', await fs.openAsBlob(filePath, { type: mime }), 'video');
    onProgress('uploading', 50); // multipart uploads give no byte-level progress
    const video = await step('Facebook video upload', () => requestJson<{ id: string }>(`https://graph-video.facebook.com/${env.meta.graphVersion}/${page}/videos`, { method: 'POST', body: form }));
    return { externalId: video.id, url: `https://www.facebook.com/${page}/videos/${video.id}` };
  },

  async getProfile(account) {
    const p = await graphGet(pageToken(account), account.externalId, { fields: 'followers_count,fan_count,link' });
    return { followers: toInt(p.followers_count ?? p.fan_count), totalViews: null, videoCount: null, url: p.link ?? null };
  },

  async listVideos(account, limit) {
    const data = await graphGet(pageToken(account), `${account.externalId}/videos`, {
      fields: 'id,title,description,created_time,permalink_url,picture,views,likes.limit(0).summary(true),comments.limit(0).summary(true)',
      limit: Math.min(limit, 50),
    });
    return (data.data ?? []).map((v: any) => ({
      id: v.id,
      title: v.title || (v.description ?? '').split('\n')[0].slice(0, 120) || 'Untitled video',
      url: v.permalink_url ? new URL(v.permalink_url, 'https://www.facebook.com').toString() : null,
      thumbnailUrl: v.picture ?? null,
      publishedAt: v.created_time,
      views: toInt(v.views),
      likes: toInt(v.likes?.summary?.total_count),
      comments: toInt(v.comments?.summary?.total_count),
      shares: null,
    }));
  },

  async getSeries(account, days) {
    // Meta replaced "impressions" with "views" (page_media_view) in November 2025.
    const data = await graphGet(pageToken(account), `${account.externalId}/insights`, { metric: 'page_media_view', period: 'day', ...sinceUntil(Math.min(days, 90)) });
    return { metric: 'Views', points: insightPoints(data) };
  },

  async listComments(account, videoId, limit) {
    const data = await graphGet(pageToken(account), `${videoId}/comments`, {
      fields: 'id,message,from{name,picture},like_count,comment_count,created_time',
      filter: 'toplevel',
      limit,
    });
    return (data.data ?? []).map((c: any) => ({
      id: c.id,
      author: c.from?.name ?? 'Facebook user',
      authorAvatarUrl: c.from?.picture?.data?.url ?? null,
      text: c.message ?? '',
      likes: c.like_count ?? 0,
      replies: c.comment_count ?? 0,
      publishedAt: c.created_time,
    }));
  },

  async reply(account, commentId, text) {
    await graphPost(pageToken(account), `${commentId}/comments`, { message: text });
  },
};
