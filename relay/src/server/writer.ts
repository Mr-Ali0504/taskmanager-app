// "Write with AI": drafts the title, description, hashtags and a tailored version for each platform,
// from a short note about the video, a few still frames (when ffmpeg is available) and the channel's recent titles.
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { LIMITS, parseHashtags } from '../shared/platforms';
import type { WrittenCopy } from '../shared/types';
import { AgentError } from './agent';
import { db, schema } from './db';
import { agentModel, env } from './env';
import { extractFrames } from './media';
import { recentVideos } from './routes/insights';

const Copy = z.object({
  title: z.string().describe('General title for the video.'),
  description: z.string().describe('General description, without hashtags.'),
  hashtags: z.array(z.string()).describe('General hashtags without the # sign.'),
  youtube: z.object({
    title: z.string().describe('At most 100 characters. Clear and searchable; no angle brackets.'),
    description: z.string().describe('Two or three short paragraphs. The first two lines must make sense on their own. End with three to five hashtags.'),
    tags: z.array(z.string()).describe('Eight to fifteen single-word search keywords, without #.'),
  }),
  instagram: z.object({ caption: z.string().describe('A hook as the first line, then one or two short lines, then five to ten hashtags. No links.') }),
  facebook: z.object({
    title: z.string().describe('Short, plain title.'),
    description: z.string().describe('Conversational, one short paragraph, ending with a question or invitation. At most three hashtags.'),
  }),
});

const SYSTEM = `You write the text that goes with a creator's video when it is published to YouTube, Instagram and Facebook.

You are given a short note from the creator about the video, sometimes still frames from it, and recent titles from their channels as a guide to their voice.

Write the way this creator writes: match the language, tone and vocabulary of their recent titles and of their note (if the note is in Hinglish or another language, write in that). Be specific to this video. Describe only what the note and the frames actually show; never invent facts, names, numbers, claims or promises. If you know little about the video, keep the text short and general rather than padding it.

Each platform wants something different:
- YouTube: a title people would search for or click, at most 100 characters. A description whose first two lines work alone, since the rest is hidden behind "more". Tags are search keywords.
- Instagram: there is no title. The first line of the caption is the hook; keep it short and human. Hashtags at the end. Links do not work in captions, so never include one.
- Facebook: a plain title and a conversational description that invites a reply.

Avoid clickbait that the video does not deliver, ALL CAPS words, and strings of emoji. One emoji is fine where it suits the creator's style.`;

let client: Anthropic | null = null;
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const tidyTags = (tags: string[]) => parseHashtags(tags.join(' '));

export async function writeCopy(input: { videoId: string; brief: string; accountIds: string[] }): Promise<WrittenCopy> {
  const video = db.select().from(schema.videos).where(eq(schema.videos.id, input.videoId)).get();
  if (!video) throw new AgentError('Choose a video first.');
  const accounts = input.accountIds.length ? db.select().from(schema.accounts).where(inArray(schema.accounts.id, input.accountIds)).all() : [];

  const [frames, styles] = await Promise.all([
    extractFrames(path.join(env.uploadsDir, video.storedName), video.durationSec),
    // Recent titles show the creator's voice. A channel that fails to load is simply left out.
    Promise.all(accounts.slice(0, 6).map(async (a) => ({ account: a, titles: (await recentVideos(a).catch(() => [])).slice(0, 5).map((v) => v.title) }))),
  ]);
  if (!input.brief && !frames.length) throw new AgentError('Add a few words about what the video shows, so there is something to write from.');

  const facts = [
    `File name: ${video.name}`,
    video.durationSec != null ? `Length: ${video.durationSec} seconds` : null,
    video.width && video.height ? `Shape: ${video.height > video.width ? 'vertical (a Short or Reel)' : 'landscape'}` : null,
    `Creator's note about the video: ${input.brief || '(none given; rely on the frames)'}`,
    ...styles.filter((s) => s.titles.length).map((s) => `Recent titles on ${s.account.name} (${s.account.platform}):\n${s.titles.map((t) => `- ${t}`).join('\n')}`),
  ].filter(Boolean);

  const response = await (client ??= new Anthropic()).messages.parse({
    model: agentModel(),
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: 'medium', format: zodOutputFormat(Copy) },
    messages: [
      {
        role: 'user',
        content: [
          ...frames.map((f) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.toString('base64') } })),
          { type: 'text', text: `${frames.length ? `The ${frames.length} images above are still frames from the video, in order.\n\n` : ''}${facts.join('\n\n')}` },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new AgentError('The AI declined to write for this video. Try describing it differently.');
  const out = response.parsed_output;
  if (!out) throw new AgentError('The AI returned something unusable. Please try again.');

  // Enforce the hard platform limits here, so a slightly long answer never blocks publishing.
  const noBrackets = (t: string) => t.replace(/[<>]/g, '');
  return {
    title: clip(noBrackets(out.title.trim()), LIMITS.youtube.title),
    description: out.description.trim(),
    hashtags: tidyTags(out.hashtags).slice(0, LIMITS.instagram.hashtags),
    youtube: { title: clip(noBrackets(out.youtube.title.trim()), LIMITS.youtube.title), description: noBrackets(out.youtube.description.trim()), tags: tidyTags(out.youtube.tags).slice(0, 20) },
    instagram: { caption: clip(out.instagram.caption.trim(), LIMITS.instagram.caption) },
    facebook: { title: clip(out.facebook.title.trim(), LIMITS.facebook.title), description: out.facebook.description.trim() },
    sawVideo: frames.length > 0,
  };
}
