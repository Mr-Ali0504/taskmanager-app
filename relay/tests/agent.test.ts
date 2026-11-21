// Drives the assistant against a fake Messages API to check the approval gate:
// lookups run on their own, but nothing is published or replied to until the user approves.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
const script: Block[][] = [];
const requests: any[] = [];
let server: http.Server;
let agent: typeof import('../src/server/agent');
let dbm: typeof import('../src/server/db');
const ids = { youtube: '', instagram: '', video: 'vid-1' };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push(JSON.parse(body));
      const content = script.shift() ?? [{ type: 'text', text: 'Done.' }];
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  dbm = await import('../src/server/db');
  dbm.runMigrations();
  const { accounts, videos, posts, snapshots } = dbm.schema;
  for (const table of [posts, accounts, videos, snapshots]) dbm.db.delete(table).run();
  const { encrypt } = await import('../src/server/crypto');
  const row = (platform: 'youtube' | 'instagram', name: string) => ({ id: `acc-${platform}`, platform, externalId: `demo-${platform}`, name, handle: null, avatarUrl: null, tokens: encrypt('{}'), demo: true, status: 'connected' as const, createdAt: 1 });
  dbm.db.insert(accounts).values([row('youtube', 'Demo Channel'), row('instagram', 'Demo Creator')]).run();
  dbm.db.insert(videos).values({ id: ids.video, name: 'clip.mp4', storedName: 'clip.mp4', sizeBytes: 1000, mime: 'video/mp4', durationSec: 20, width: 1080, height: 1920, hasThumb: false, createdAt: 1 }).run();
  ids.youtube = 'acc-youtube';
  ids.instagram = 'acc-instagram';
  agent = await import('../src/server/agent');
});
afterAll(() => server.close());

const postCount = () => dbm.db.select().from(dbm.schema.posts).all().length;
const lastToolResults = () => requests.at(-1).messages.at(-1).content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[];
const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
const proposal = (id: string) => ({ type: 'tool_use' as const, id, name: 'propose_post', input: { video_id: ids.video, account_ids: [ids.youtube, ids.instagram], title: 'Hello', description: 'World', hashtags: ['#one', 'two'], scheduled_at: tomorrow, youtube_visibility: 'private' } });

describe('assistant', () => {
  it('runs lookups itself, then pauses on a proposed post without publishing', async () => {
    script.push([{ type: 'tool_use', id: 't1', name: 'list_channels', input: {} }, { type: 'tool_use', id: 't2', name: 'list_videos', input: {} }], [{ type: 'text', text: 'Here is my plan.' }, proposal('t3')]);
    const turn = await agent.sendMessage(null, 'Post my clip everywhere tomorrow', 'Asia/Kolkata');

    expect(turn.steps).toEqual(['Looked up your channels', 'Looked at your library']);
    expect(turn.texts).toEqual(['Here is my plan.']);
    expect(turn.pending).toHaveLength(1);
    expect(turn.pending[0]).toMatchObject({ id: 't3', kind: 'post', videoName: 'clip.mp4', hashtags: ['one', 'two'], channels: [{ name: 'Demo Channel', platform: 'youtube' }, { name: 'Demo Creator', platform: 'instagram' }] });
    expect(postCount()).toBe(0);
    // Both lookups went back in one message, and the request carried the documented options.
    expect(requests[1].messages.at(-1).content.map((b: any) => b.tool_use_id).sort()).toEqual(['t1', 't2']);
    expect(requests[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' } });
    expect(requests[0].tools.every((t: any) => t.strict && t.input_schema.additionalProperties === false)).toBe(true);
    expect(requests[0].messages[0].content).toContain('time zone Asia/Kolkata');

    await expect(agent.sendMessage(turn.conversationId, 'and another thing', 'UTC')).rejects.toThrow(/Approve or decline/);

    script.push([{ type: 'text', text: 'Scheduled it.' }]);
    const after = await agent.decide(turn.conversationId, ['t3']);
    expect(after.steps).toEqual(['Scheduled the post']);
    expect(after.texts).toEqual(['Scheduled it.']);
    const posts = dbm.db.select().from(dbm.schema.posts).all();
    expect(posts).toHaveLength(1);
    expect(posts[0].status).toBe('scheduled');
    const targets = dbm.db.select().from(dbm.schema.targets).all();
    expect(targets.find((t) => t.platform === 'youtube')!.fields).toMatchObject({ title: 'Hello', privacy: 'private', tags: ['one', 'two'] });
    expect(targets.find((t) => t.platform === 'instagram')!.fields).toMatchObject({ caption: 'Hello\n\nWorld\n\n#one #two' });
    expect(lastToolResults()[0].content).toMatch(/^Approved\. Scheduled/);

    // A decision cannot be replayed to publish twice.
    await expect(agent.decide(turn.conversationId, ['t3'])).rejects.toThrow(/nothing waiting/);
    expect(postCount()).toBe(1);
  });

  it('does nothing when the user declines', async () => {
    const before = postCount();
    script.push([proposal('d1')]);
    const turn = await agent.sendMessage(null, 'post it', 'UTC');
    script.push([{ type: 'text', text: 'Okay, I left it.' }]);
    await agent.decide(turn.conversationId, []);
    expect(postCount()).toBe(before);
    expect(lastToolResults()[0].content).toMatch(/declined/);
  });

  it('refuses to reply to a comment it was never shown, and to post with a made-up channel', async () => {
    script.push([{ type: 'tool_use', id: 'r1', name: 'propose_reply', input: { comment_id: 'invented', text: 'Thanks!' } }, { type: 'tool_use', id: 'r2', name: 'propose_post', input: { ...(proposal('x').input as object), account_ids: ['nope'] } }], [{ type: 'text', text: 'I need to look those up first.' }]);
    const turn = await agent.sendMessage(null, 'reply to that comment', 'UTC');
    expect(turn.pending).toEqual([]);
    const results = lastToolResults();
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(results.find((r) => r.tool_use_id === 'r1')!.content).toMatch(/list_comments/);
  });

  it('proposes a reply only for a listed comment and posts it on approval', async () => {
    script.push([{ type: 'tool_use', id: 'c1', name: 'list_comments', input: { account_id: null } }]);
    script.push([{ type: 'text', text: 'ok' }]);
    const first = await agent.sendMessage(null, 'show comments', 'UTC');
    const listed = JSON.parse(lastToolResults()[0].content).comments;
    expect(listed.length).toBeGreaterThan(0);

    script.push([{ type: 'tool_use', id: 'c2', name: 'propose_reply', input: { comment_id: listed[0].comment_id, text: 'Thank you!' } }]);
    const turn = await agent.sendMessage(first.conversationId, 'reply to the first one', 'UTC');
    expect(turn.pending[0]).toMatchObject({ kind: 'reply', text: 'Thank you!', commentText: listed[0].text });
    script.push([{ type: 'text', text: 'Replied.' }]);
    const after = await agent.decide(turn.conversationId, ['c2']);
    expect(after.steps).toEqual(['Posted the reply']);
  });
});
