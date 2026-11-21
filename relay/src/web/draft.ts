// The post being composed. Kept at the top of the app so switching pages never loses it.
import { deriveFields, parseHashtags, type AnyFields, type BaseContent, type FacebookFields, type InstagramFields, type Platform, type VideoMeta, type YouTubeFields } from '../shared/platforms';

export interface Draft {
  videoId: string | null;
  /** null until the user touches the selection; until then every connected channel is selected. */
  accountIds: string[] | null;
  title: string;
  text: string;
  hashtags: string;
  /** Platforms whose text the user chose to write separately. */
  custom: Partial<Record<Platform, boolean>>;
  overrides: {
    youtube: Pick<YouTubeFields, 'title' | 'description'> & { tags: string };
    instagram: Pick<InstagramFields, 'caption'>;
    facebook: Pick<FacebookFields, 'title' | 'description'>;
  };
  youtube: Pick<YouTubeFields, 'categoryId' | 'privacy' | 'madeForKids' | 'notifySubscribers'>;
  instagram: Pick<InstagramFields, 'shareToFeed'>;
  facebook: { format: 'auto' | 'video' | 'reel' };
  scheduleOn: boolean;
  scheduleAt: string;
}

export const emptyDraft = (): Draft => ({
  videoId: null,
  accountIds: null,
  title: '',
  text: '',
  hashtags: '',
  custom: {},
  overrides: { youtube: { title: '', description: '', tags: '' }, instagram: { caption: '' }, facebook: { title: '', description: '' } },
  youtube: { categoryId: '22', privacy: 'public', madeForKids: false, notifySubscribers: true },
  instagram: { shareToFeed: true },
  facebook: { format: 'auto' },
  scheduleOn: false,
  scheduleAt: '',
});

export const baseContent = (d: Draft): BaseContent => ({ title: d.title, text: d.text, hashtags: parseHashtags(d.hashtags) });

/** The exact fields that will be sent to one platform: shared text, platform options, then any custom text. */
export function fieldsFor<P extends Platform>(platform: P, d: Draft, video: VideoMeta | null): AnyFields {
  const base = baseContent(d);
  if (platform === 'youtube') {
    const derived = deriveFields('youtube', base, video);
    const o = d.overrides.youtube;
    return { ...derived, ...d.youtube, ...(d.custom.youtube ? { title: o.title, description: o.description, tags: parseHashtags(o.tags) } : {}) };
  }
  if (platform === 'instagram') {
    const derived = deriveFields('instagram', base, video);
    return { ...derived, ...d.instagram, ...(d.custom.instagram ? d.overrides.instagram : {}) };
  }
  const derived = deriveFields('facebook', base, video);
  return { ...derived, ...(d.facebook.format === 'auto' ? {} : { format: d.facebook.format }), ...(d.custom.facebook ? d.overrides.facebook : {}) };
}

/** Starting point for custom text: whatever the shared text currently produces. */
export function seedOverrides(platform: Platform, d: Draft, video: VideoMeta | null): Draft['overrides'] {
  const f = fieldsFor(platform, { ...d, custom: {} }, video);
  if (platform === 'youtube') {
    const y = f as YouTubeFields;
    return { ...d.overrides, youtube: { title: y.title, description: y.description, tags: y.tags.join(', ') } };
  }
  if (platform === 'instagram') return { ...d.overrides, instagram: { caption: (f as InstagramFields).caption } };
  const fb = f as FacebookFields;
  return { ...d.overrides, facebook: { title: fb.title, description: fb.description } };
}
