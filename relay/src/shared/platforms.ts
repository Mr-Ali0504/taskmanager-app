// Single source of truth for what each platform accepts.
// The composer uses it for live counters and warnings; the server re-runs it before publishing,
// so a post can never reach a platform API with fields that platform would reject.

export const PLATFORMS = ['youtube', 'instagram', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface YouTubeFields {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacy: 'public' | 'unlisted' | 'private';
  madeForKids: boolean;
  notifySubscribers: boolean;
}

export interface InstagramFields {
  caption: string;
  shareToFeed: boolean;
}

export interface FacebookFields {
  format: 'video' | 'reel';
  title: string;
  description: string;
}

export interface FieldsByPlatform {
  youtube: YouTubeFields;
  instagram: InstagramFields;
  facebook: FacebookFields;
}
export type AnyFields = FieldsByPlatform[Platform];

/** What the user types once. Each platform's fields are derived from this unless overridden. */
export interface BaseContent {
  title: string;
  text: string;
  hashtags: string[];
}

export interface VideoMeta {
  sizeBytes: number;
  mime: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export interface Issue {
  level: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
}

export const LIMITS = {
  youtube: { title: 100, description: 5000, tagsTotal: 500, shortsMaxSec: 180 },
  instagram: { caption: 2200, hashtags: 30, mentions: 20, minSec: 3, maxSec: 15 * 60, softMaxBytes: 300 * 1024 ** 2 },
  facebook: { title: 255, reelMinSec: 3, reelMaxSec: 90, maxBytes: 10 * 1024 ** 3 },
} as const;

export const PLATFORM_INFO: Record<
  Platform,
  { label: string; noun: string; accepts: string[]; summary: string }
> = {
  youtube: {
    label: 'YouTube',
    noun: 'channel',
    accepts: ['Title (required, 100)', 'Description (5,000)', 'Tags', 'Category', 'Visibility', 'Made-for-kids declaration'],
    summary: 'Needs a title. Vertical or square videos up to 3 minutes become Shorts automatically.',
  },
  instagram: {
    label: 'Instagram',
    noun: 'account',
    accepts: ['Caption (2,200)', 'Up to 30 hashtags', 'Share to feed'],
    summary: 'No title field: everything goes in the caption. All videos publish as Reels. Needs a Business or Creator account.',
  },
  facebook: {
    label: 'Facebook',
    noun: 'Page',
    accepts: ['Title (video only)', 'Description', 'Video or Reel format'],
    summary: 'Publishes to Pages, not personal profiles. Reels take a description only.',
  },
};

export const YOUTUBE_CATEGORIES: { id: string; label: string }[] = [
  { id: '22', label: 'People & Blogs' },
  { id: '24', label: 'Entertainment' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' },
  { id: '26', label: 'Howto & Style' },
  { id: '10', label: 'Music' },
  { id: '20', label: 'Gaming' },
  { id: '23', label: 'Comedy' },
  { id: '17', label: 'Sports' },
  { id: '25', label: 'News & Politics' },
  { id: '19', label: 'Travel & Events' },
  { id: '1', label: 'Film & Animation' },
  { id: '2', label: 'Autos & Vehicles' },
  { id: '15', label: 'Pets & Animals' },
  { id: '29', label: 'Nonprofits & Activism' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "#Travel, vlog  #travel" -> ["travel", "vlog"] (no leading #, de-duplicated, order kept). */
export function parseHashtags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const tag = raw.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export const hashtagLine = (tags: string[]) => tags.map((t) => `#${t}`).join(' ');
export const countHashtags = (text: string) => (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
export const countMentions = (text: string) => (text.match(/(^|\s)@[\w.]+/g) ?? []).length;
export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/** YouTube counts commas between tags, and wraps tags containing spaces in quotes. */
export function youtubeTagsLength(tags: string[]): number {
  return tags.reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

const joinParts = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join('\n\n');

/** Vertical or square, and short enough: YouTube classifies it as a Short on its own. */
export function isYouTubeShort(video: VideoMeta | null): boolean | null {
  if (!video || video.durationSec == null || !video.width || !video.height) return null;
  return video.durationSec <= LIMITS.youtube.shortsMaxSec && video.width <= video.height;
}

export const isVertical = (v: VideoMeta | null) => (v && v.width && v.height ? v.height > v.width : null);

/** Turn what the user typed once into the fields each platform actually takes. */
export function deriveFields<P extends Platform>(platform: P, base: BaseContent, video: VideoMeta | null): FieldsByPlatform[P];
export function deriveFields(platform: Platform, base: BaseContent, video: VideoMeta | null): AnyFields {
  const tagsLine = hashtagLine(base.hashtags);
  switch (platform) {
    case 'youtube':
      return {
        title: base.title.trim(),
        description: joinParts(base.text, tagsLine),
        tags: base.hashtags,
        categoryId: '22',
        privacy: 'public',
        madeForKids: false,
        notifySubscribers: true,
      };
    case 'instagram':
      // Instagram has no title, so the title becomes the first line of the caption.
      return { caption: joinParts(base.title, base.text, tagsLine), shareToFeed: true };
    case 'facebook': {
      const short = video?.durationSec != null && video.durationSec <= LIMITS.facebook.reelMaxSec;
      const reel = Boolean(short && isVertical(video));
      return {
        format: reel ? 'reel' : 'video',
        title: base.title.trim(),
        description: joinParts(base.text, tagsLine),
      };
    }
  }
}

const fmtDuration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const hasUrl = (text: string) => /https?:\/\/\S+/i.test(text);

/** Errors block publishing. Warnings and info are advice the user can ignore. */
export function validateFields(platform: Platform, fields: AnyFields, video: VideoMeta | null): Issue[] {
  const issues: Issue[] = [];
  const err = (field: string, message: string) => issues.push({ level: 'error', field, message });
  const warn = (field: string | undefined, message: string) => issues.push({ level: 'warning', field, message });
  const info = (message: string) => issues.push({ level: 'info', message });
  const duration = video?.durationSec ?? null;

  if (platform === 'youtube') {
    const f = fields as YouTubeFields;
    const L = LIMITS.youtube;
    if (!f.title.trim()) err('title', 'YouTube requires a title.');
    if (f.title.length > L.title) err('title', `Title is ${f.title.length} characters; YouTube allows ${L.title}.`);
    if (/[<>]/.test(f.title)) err('title', 'YouTube titles cannot contain < or >.');
    if (utf8Bytes(f.description) > L.description)
      err('description', `Description is over YouTube's ${L.description.toLocaleString()}-byte limit.`);
    if (/[<>]/.test(f.description)) err('description', 'YouTube descriptions cannot contain < or >.');
    if (youtubeTagsLength(f.tags) > L.tagsTotal)
      err('tags', `Tags add up to ${youtubeTagsLength(f.tags)} characters; YouTube allows ${L.tagsTotal} in total.`);
    const short = isYouTubeShort(video);
    if (short) info('Vertical and under 3 minutes: YouTube will publish this as a Short.');
    if (short === false && duration != null && duration > 15 * 60)
      warn(undefined, 'Longer than 15 minutes: the channel must be phone-verified on YouTube to upload this.');
    if (f.madeForKids) info('Made for kids: comments and notifications are turned off by YouTube.');
  }

  if (platform === 'instagram') {
    const f = fields as InstagramFields;
    const L = LIMITS.instagram;
    if (f.caption.length > L.caption) err('caption', `Caption is ${f.caption.length.toLocaleString()} characters; Instagram allows ${L.caption.toLocaleString()}.`);
    const tags = countHashtags(f.caption);
    if (tags > L.hashtags) err('caption', `${tags} hashtags; Instagram allows ${L.hashtags} per post.`);
    const mentions = countMentions(f.caption);
    if (mentions > L.mentions) err('caption', `${mentions} @mentions; Instagram allows ${L.mentions} per post.`);
    if (hasUrl(f.caption)) warn('caption', 'Links in Instagram captions are not clickable.');
    if (duration != null && duration < L.minSec) err('video', `Reels must be at least ${L.minSec} seconds long.`);
    if (duration != null && duration > L.maxSec) err('video', `This video is ${fmtDuration(duration)}; Reels published through the API can be at most 15 minutes.`);
    if (video && !/mp4|quicktime/.test(video.mime)) warn('video', 'Instagram accepts MP4 or MOV. Other formats are likely to be rejected.');
    if (video && video.sizeBytes > L.softMaxBytes) warn('video', "File is over 300 MB, Instagram's documented Reels limit. It may be rejected.");
    if (isVertical(video) === false) warn('video', 'Not vertical: Reels look best at 9:16, and this one will show with bars or be cropped.');
  }

  if (platform === 'facebook') {
    const f = fields as FacebookFields;
    const L = LIMITS.facebook;
    if (f.title.length > L.title) err('title', `Title is ${f.title.length} characters; Facebook allows ${L.title}.`);
    if (video && video.sizeBytes > L.maxBytes) err('video', 'File is over 10 GB, the Facebook upload limit.');
    if (f.format === 'reel') {
      if (f.title.trim()) info('Facebook Reels have no title. Only the description is published.');
      if (isVertical(video) === false) warn('video', 'Facebook Reels need a vertical 9:16 video. Switch the format to Video to keep this one as-is.');
      if (duration != null && (duration < L.reelMinSec || duration > L.reelMaxSec))
        warn('video', `Facebook's Reels API documents ${L.reelMinSec}-${L.reelMaxSec} seconds; this video is ${fmtDuration(duration)}. Switch to Video if it is rejected.`);
    }
  }

  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error');
