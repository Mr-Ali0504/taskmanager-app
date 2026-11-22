// Checks the sequence of calls each platform integration makes, against a fake network.
// These verify request shape and ordering; they cannot prove the live APIs accept them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { encrypt } from '../src/server/crypto';
import type { AccountRow } from '../src/server/db/schema';
import { facebook } from '../src/server/platforms/facebook';
import { instagram } from '../src/server/platforms/instagram';
import { youtube } from '../src/server/platforms/youtube';

const file = path.join(os.tmpdir(), `relay-test-${process.pid}.mp4`);
beforeAll(() => fs.writeFileSync(file, Buffer.alloc(2048, 1)));
afterEach(() => vi.unstubAllGlobals());

const account = (platform: AccountRow['platform'], externalId: string, tokens: object): AccountRow => ({
  id: 'a1', platform, externalId, name: 'Test', handle: null, avatarUrl: null, tokens: encrypt(JSON.stringify(tokens)), demo: false, status: 'connected', createdAt: 0,
});

type Call = { url: string; method: string; headers: Record<string, string>; body: string; bytes: number };
/** Replaces fetch with scripted replies and records what was requested. */
function fakeNetwork(replies: ((call: Call) => Response)[]) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    let body = '';
    let bytes = 0;
    if (typeof init.body === 'string') body = init.body;
    else if (init.body instanceof FormData) body = [...init.body.keys()].join(',');
    else if (init.body) for await (const chunk of init.body as unknown as AsyncIterable<Uint8Array>) bytes += chunk.length;
    const call = { url: String(url), method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers)), body, bytes };
    calls.push(call);
    return replies[calls.length - 1](call);
  });
  return calls;
}
const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), init);
const ctx = { filePath: file, sizeBytes: 2048, mime: 'video/mp4', onProgress: () => {} };

describe('YouTube publish', () => {
  it('opens a resumable session with the metadata, then sends the file', async () => {
    const calls = fakeNetwork([() => json({}, { headers: { location: 'https://upload.example/session-1' } }), () => json({ id: 'vid123' })]);
    const result = await youtube.publish({
      ...ctx,
      account: account('youtube', 'UCabc', { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 }),
      fields: { title: 'T', description: 'D', tags: ['a'], categoryId: '22', privacy: 'unlisted', madeForKids: false, notifySubscribers: false },
    });
    expect(result).toEqual({ externalId: 'vid123', url: 'https://www.youtube.com/watch?v=vid123' });
    expect(calls[0].url).toContain('uploadType=resumable');
    expect(calls[0].url).toContain('notifySubscribers=false');
    expect(calls[0].headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0].body)).toEqual({
      snippet: { title: 'T', description: 'D', tags: ['a'], categoryId: '22' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
    });
    expect(calls[1]).toMatchObject({ url: 'https://upload.example/session-1', method: 'PUT', bytes: 2048 });
  });

  it('surfaces the platform error message', async () => {
    fakeNetwork([() => json({ error: { message: 'The request cannot be completed because you have exceeded your quota.' } }, { status: 403 })]);
    await expect(
      youtube.publish({ ...ctx, account: account('youtube', 'UCabc', { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 }), fields: { title: 'T', description: '', tags: [], categoryId: '22', privacy: 'public', madeForKids: false, notifySubscribers: true } }),
    ).rejects.toThrow(/YouTube, starting the upload.*exceeded your quota/);
  });
});

describe('Instagram publish', () => {
  it('creates a Reel container, uploads, waits for processing, then publishes', async () => {
    const calls = fakeNetwork([
      () => json({ id: 'c1', uri: 'https://rupload.facebook.com/ig-api-upload/v26.0/c1' }),
      () => json({ success: true }),
      () => json({ status_code: 'FINISHED' }),
      () => json({ id: 'm1' }),
      () => json({ permalink: 'https://www.instagram.com/reel/abc/' }),
    ]);
    const result = await instagram.publish({ ...ctx, account: account('instagram', '1789', { pageToken: 'ptok' }), fields: { caption: 'Hello #world', shareToFeed: true } });
    expect(result).toEqual({ externalId: 'm1', url: 'https://www.instagram.com/reel/abc/' });
    expect(calls[0].url).toBe('https://graph.facebook.com/v26.0/1789/media');
    const params = new URLSearchParams(calls[0].body);
    expect(Object.fromEntries(params)).toMatchObject({ media_type: 'REELS', upload_type: 'resumable', caption: 'Hello #world', share_to_feed: 'true' });
    expect(calls[1]).toMatchObject({ url: 'https://rupload.facebook.com/ig-api-upload/v26.0/c1', bytes: 2048 });
    expect(calls[1].headers).toMatchObject({ authorization: 'OAuth ptok', offset: '0', file_size: '2048' });
    expect(calls[3].url).toBe('https://graph.facebook.com/v26.0/1789/media_publish');
    expect(new URLSearchParams(calls[3].body).get('creation_id')).toBe('c1');
  });

  it('fails clearly when Instagram cannot process the video', async () => {
    fakeNetwork([() => json({ id: 'c1', uri: 'https://rupload.facebook.com/x' }), () => json({ success: true }), () => json({ status_code: 'ERROR', status: 'Unsupported codec' })]);
    await expect(instagram.publish({ ...ctx, account: account('instagram', '1789', { pageToken: 'p' }), fields: { caption: '', shareToFeed: true } })).rejects.toThrow(/Unsupported codec/);
  });
});

describe('Facebook publish', () => {
  it('uses the three-phase Reels flow for reels', async () => {
    const calls = fakeNetwork([() => json({ video_id: 'v9', upload_url: 'https://rupload.facebook.com/video-upload/v26.0/v9' }), () => json({ success: true }), () => json({ success: true })]);
    const result = await facebook.publish({ ...ctx, account: account('facebook', '555', { pageToken: 'ptok' }), fields: { format: 'reel', title: '', description: 'Desc' } });
    expect(result.externalId).toBe('v9');
    expect(new URLSearchParams(calls[0].body).get('upload_phase')).toBe('start');
    expect(calls[1].bytes).toBe(2048);
    expect(Object.fromEntries(new URLSearchParams(calls[2].body))).toMatchObject({ upload_phase: 'finish', video_id: 'v9', video_state: 'PUBLISHED', description: 'Desc' });
  });

  it('posts a regular video as one multipart request with title and description', async () => {
    const calls = fakeNetwork([() => json({ id: 'v1' })]);
    await facebook.publish({ ...ctx, account: account('facebook', '555', { pageToken: 'ptok' }), fields: { format: 'video', title: 'Title', description: 'Desc' } });
    expect(calls[0].url).toBe('https://graph-video.facebook.com/v26.0/555/videos');
    expect(calls[0].body.split(',').sort()).toEqual(['access_token', 'description', 'source', 'title']);
  });
});

describe('error messages', () => {
  it('reads the error format of Meta\'s upload host and names the failed step', async () => {
    fakeNetwork([() => json({ id: 'c1', uri: 'https://rupload.facebook.com/x' }), () => json({ debug_info: { retriable: false, type: 'ProcessingFailedError', message: 'Request processing failed' } }, { status: 400 })]);
    await expect(instagram.publish({ ...ctx, account: account('instagram', '1', { pageToken: 'p' }), fields: { caption: '', shareToFeed: true } })).rejects.toThrow(
      'Instagram, sending the video file (step 2 of 4): ProcessingFailedError: Request processing failed',
    );
  });
  it('includes Meta error codes and falls back to the raw text for unknown formats', async () => {
    fakeNetwork([() => json({ error: { message: 'Unsupported post request.', code: 100, error_subcode: 33 } }, { status: 400 })]);
    await expect(instagram.publish({ ...ctx, account: account('instagram', '1', { pageToken: 'p' }), fields: { caption: '', shareToFeed: true } })).rejects.toThrow(/step 1 of 4\): Unsupported post request\. \(code 100, subcode 33\)/);
    fakeNetwork([() => new Response('<html><body>Bad Request: malformed</body></html>', { status: 400 })]);
    await expect(facebook.publish({ ...ctx, account: account('facebook', '5', { pageToken: 'p' }), fields: { format: 'video', title: '', description: '' } })).rejects.toThrow(/Facebook video upload: HTTP 400: Bad Request: malformed/);
  });
});
