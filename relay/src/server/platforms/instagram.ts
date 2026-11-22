// Instagram API with Facebook Login: content publishing, insights and comments.
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
import type { InstagramFields } from '../../shared/platforms';
import { sleep, step, toInt } from './http';
import { GRAPH, graphGet, graphPost, insightPoints, pageToken, rupload, sinceUntil } from './meta';
import { PlatformError, type PlatformAdapter } from './types';

export const instagram: PlatformAdapter<InstagramFields> = {
  async publish({ account, filePath, sizeBytes, fields, onProgress }) {
    const token = pageToken(account);
    const ig = account.externalId;

    // Step 1: create a Reel "container" that expects a direct (resumable) upload.
    const container = await step('Instagram, creating the Reel (step 1 of 4)', () =>
      graphPost<{ id: string; uri?: string }>(token, `${ig}/media`, {
        media_type: 'REELS',
        upload_type: 'resumable',
        caption: fields.caption,
        share_to_feed: fields.shareToFeed,
      }),
    );

    // Step 2: send the file to Meta's upload host.
    const uploadUrl = container.uri ?? `${GRAPH().replace('graph.facebook.com', 'rupload.facebook.com/ig-api-upload')}/${container.id}`;
    await step('Instagram, sending the video file (step 2 of 4)', () => rupload(uploadUrl, token, filePath, sizeBytes, (p) => onProgress('uploading', p)));

    // Step 3: Instagram transcodes the video; wait until the container is ready.
    onProgress('processing', 100);
    const deadline = Date.now() + 15 * 60_000;
    for (;;) {
      const state = await step('Instagram, checking processing (step 3 of 4)', () => graphGet<{ status_code: string; status?: string }>(token, container.id, { fields: 'status_code,status' }));
      if (state.status_code === 'FINISHED') break;
      if (state.status_code === 'ERROR' || state.status_code === 'EXPIRED')
        throw new PlatformError(`Instagram could not process the video${state.status ? `: ${state.status}` : '.'}`);
      if (Date.now() > deadline) throw new PlatformError('Instagram is still processing the video after 15 minutes. Check the account before retrying.');
      await sleep(5000);
    }

    // Step 4: publish the container.
    const media = await step('Instagram, publishing (step 4 of 4)', () => graphPost<{ id: string }>(token, `${ig}/media_publish`, { creation_id: container.id }));
    const info = await graphGet<{ permalink?: string }>(token, media.id, { fields: 'permalink' }).catch(() => ({ permalink: undefined }));
    return { externalId: media.id, url: info.permalink ?? null };
  },

  async getProfile(account) {
    const p = await graphGet(pageToken(account), account.externalId, { fields: 'username,followers_count,media_count' });
    return {
      followers: toInt(p.followers_count),
      totalViews: null, // Instagram has no lifetime view total for an account.
      videoCount: toInt(p.media_count),
      url: p.username ? `https://www.instagram.com/${p.username}/` : null,
    };
  },

  async listVideos(account, limit) {
    const token = pageToken(account);
    const data = await graphGet(token, `${account.externalId}/media`, {
      fields: 'id,caption,media_type,permalink,thumbnail_url,timestamp,like_count,comments_count',
      limit: Math.min(limit * 2, 50),
    });
    const reels: any[] = (data.data ?? []).filter((m: any) => m.media_type === 'VIDEO').slice(0, limit);
    return Promise.all(
      reels.map(async (m) => {
        // Views and shares are insights, fetched per reel. A reel too old or too new for insights just shows blanks.
        const insights = await graphGet(token, `${m.id}/insights`, { metric: 'views,shares' }).catch(() => null);
        const metric = (name: string) => toInt(insights?.data?.find((d: any) => d.name === name)?.values?.[0]?.value);
        return {
          id: m.id,
          title: (m.caption ?? '').split('\n')[0].slice(0, 120) || 'Untitled reel',
          url: m.permalink ?? null,
          thumbnailUrl: m.thumbnail_url ?? null,
          publishedAt: m.timestamp,
          views: metric('views'),
          likes: toInt(m.like_count),
          comments: toInt(m.comments_count),
          shares: metric('shares'),
        };
      }),
    );
  },

  async getSeries(account, days) {
    // Instagram reports daily reach (accounts that saw your content); daily views are only available as a total.
    const data = await graphGet(pageToken(account), `${account.externalId}/insights`, { metric: 'reach', period: 'day', ...sinceUntil(Math.min(days, 30)) });
    return { metric: 'Reach', points: insightPoints(data) };
  },

  async listComments(account, videoId, limit) {
    const data = await graphGet(pageToken(account), `${videoId}/comments`, { fields: 'id,text,username,like_count,timestamp,replies.limit(0).summary(true)', limit });
    return (data.data ?? []).map((c: any) => ({
      id: c.id,
      author: c.username ? `@${c.username}` : 'Instagram user',
      authorAvatarUrl: null,
      text: c.text ?? '',
      likes: c.like_count ?? 0,
      replies: c.replies?.summary?.total_count ?? c.replies?.data?.length ?? 0,
      publishedAt: c.timestamp,
    }));
  },

  async reply(account, commentId, text) {
    await graphPost(pageToken(account), `${commentId}/replies`, { message: text });
  },
};
