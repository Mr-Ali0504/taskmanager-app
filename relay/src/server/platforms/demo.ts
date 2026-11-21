// A stand-in platform with made-up but stable numbers, so the whole app can be tried
// before any API keys exist. Demo accounts never talk to YouTube, Instagram or Facebook.
import type { AccountRow } from '../db/schema';
import { isoDay, sleep } from './http';
import type { PlatformAdapter } from './types';

/** Small deterministic random generator: the same account always shows the same numbers. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const TITLES = [
  'I tried editing a full video on my phone',
  'Studio tour: the desk setup after one year',
  '5 mistakes I made starting this channel',
  'Behind the scenes of last week\'s shoot',
  'Answering your most asked questions',
  'The lighting trick nobody told me about',
  'A slow morning routine, start to finish',
  'What I would buy again (and what I would skip)',
];
const COMMENTS = [
  'This is exactly what I needed today, thank you!',
  'The part at the end caught me off guard. Great edit.',
  'Can you do a longer version of this?',
  'Been following since the early days. So good to see this grow.',
  'What camera are you using for these?',
  'Saved this to come back to later.',
  'The audio is so much better in this one.',
  'Please make a part two!',
];
const NAMES = ['Maya R.', 'devon_makes', 'Priya S.', 'Lukas', 'the.daily.frame', 'Noor', 'Sam Okafor', 'jules.cuts'];
const scale = (a: AccountRow) => ({ youtube: 4, instagram: 2.2, facebook: 1 })[a.platform];

export const demo: PlatformAdapter<unknown> = {
  async publish({ account, onProgress }) {
    for (let p = 0; p <= 100; p += 10) {
      onProgress('uploading', p);
      await sleep(250);
    }
    onProgress('processing', 100);
    await sleep(1200);
    return { externalId: `demo-${Date.now()}`, url: null };
  },

  async getProfile(account) {
    const r = rng(account.id);
    const followers = Math.round((3000 + r() * 9000) * scale(account));
    return {
      followers,
      totalViews: account.platform === 'youtube' ? followers * Math.round(40 + r() * 60) : null,
      videoCount: account.platform === 'facebook' ? null : Math.round(40 + r() * 120),
      url: null,
    };
  },

  async listVideos(account, limit) {
    const r = rng(`${account.id}:videos`);
    return TITLES.slice(0, limit).map((title, i) => {
      const views = Math.round((800 + r() * 14000) * scale(account));
      return {
        id: `demo-${account.id}-${i}`,
        title,
        url: null,
        thumbnailUrl: null,
        publishedAt: new Date(Date.now() - (i * 4 + 1) * 86_400_000).toISOString(),
        views,
        likes: Math.round(views * (0.03 + r() * 0.05)),
        comments: Math.round(views * (0.003 + r() * 0.006)),
        shares: account.platform === 'instagram' ? Math.round(views * (0.004 + r() * 0.01)) : null,
      };
    });
  },

  async getSeries(account, days) {
    const r = rng(`${account.id}:series`);
    const base = 900 * scale(account);
    const points = Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86_400_000);
      const weekend = [0, 6].includes(d.getUTCDay()) ? 1.25 : 1;
      const trend = 1 + (i / days) * 0.35;
      return { date: isoDay(d), value: Math.round(base * weekend * trend * (0.75 + r() * 0.5)) };
    });
    return { metric: account.platform === 'instagram' ? 'Reach' : 'Views', points };
  },

  async listComments(account, videoId, limit) {
    const r = rng(`${account.id}:${videoId}`);
    return Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
      id: `${videoId}-c${i}`,
      author: NAMES[Math.floor(r() * NAMES.length)],
      authorAvatarUrl: null,
      text: COMMENTS[Math.floor(r() * COMMENTS.length)],
      likes: Math.round(r() * r() * 240),
      replies: Math.round(r() * 4),
      publishedAt: new Date(Date.now() - Math.round(r() * 20 * 86_400_000)).toISOString(),
    }));
  },

  async reply() {
    await sleep(300);
  },
};
