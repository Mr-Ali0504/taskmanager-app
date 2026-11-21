import { describe, expect, it } from 'vitest';
import { deriveFields, hasErrors, isYouTubeShort, parseHashtags, validateFields, youtubeTagsLength, type VideoMeta } from '../src/shared/platforms';

const vertical: VideoMeta = { sizeBytes: 5e6, mime: 'video/mp4', durationSec: 40, width: 1080, height: 1920 };
const longWide: VideoMeta = { sizeBytes: 9e8, mime: 'video/mp4', durationSec: 1200, width: 1920, height: 1080 };
const base = { title: 'Studio tour', text: 'A look around.', hashtags: ['studio', 'bts'] };

describe('hashtags', () => {
  it('strips #, punctuation and duplicates', () => {
    expect(parseHashtags('#Studio, bts  #studio  day-one!')).toEqual(['Studio', 'bts', 'dayone']);
  });
  it('counts YouTube tag length with separators and quoted spaces', () => {
    expect(youtubeTagsLength(['ab', 'c d'])).toBe(2 + 5 + 1);
  });
});

describe('deriveFields', () => {
  it('puts the title on the first caption line for Instagram, which has no title field', () => {
    expect(deriveFields('instagram', base, vertical).caption).toBe('Studio tour\n\nA look around.\n\n#studio #bts');
  });
  it('gives YouTube a title, description and plain tags', () => {
    const f = deriveFields('youtube', base, vertical);
    expect(f.title).toBe('Studio tour');
    expect(f.description).toBe('A look around.\n\n#studio #bts');
    expect(f.tags).toEqual(['studio', 'bts']);
  });
  it('chooses Facebook Reel for short vertical video and Video otherwise', () => {
    expect(deriveFields('facebook', base, vertical).format).toBe('reel');
    expect(deriveFields('facebook', base, longWide).format).toBe('video');
    expect(deriveFields('facebook', base, null).format).toBe('video');
  });
});

describe('validateFields', () => {
  it('requires a YouTube title and enforces 100 characters', () => {
    const f = deriveFields('youtube', { ...base, title: '' }, vertical);
    expect(hasErrors(validateFields('youtube', f, vertical))).toBe(true);
    expect(hasErrors(validateFields('youtube', { ...f, title: 'x'.repeat(101) }, vertical))).toBe(true);
    expect(hasErrors(validateFields('youtube', { ...f, title: 'ok' }, vertical))).toBe(false);
  });
  it('rejects angle brackets on YouTube', () => {
    const f = deriveFields('youtube', { ...base, title: 'a <b>' }, vertical);
    expect(validateFields('youtube', f, vertical).some((i) => i.level === 'error' && i.field === 'title')).toBe(true);
  });
  it('enforces Instagram caption length, 30 hashtags and the 15 minute limit', () => {
    expect(hasErrors(validateFields('instagram', { caption: 'x'.repeat(2201), shareToFeed: true }, vertical))).toBe(true);
    const many = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ');
    expect(hasErrors(validateFields('instagram', { caption: many, shareToFeed: true }, vertical))).toBe(true);
    expect(hasErrors(validateFields('instagram', { caption: 'hi', shareToFeed: true }, longWide))).toBe(true);
    expect(hasErrors(validateFields('instagram', { caption: 'hi', shareToFeed: true }, vertical))).toBe(false);
  });
  it('warns, without blocking, about links on Instagram and landscape Reels', () => {
    const wide = { ...vertical, width: 1920, height: 1080 };
    const issues = validateFields('instagram', { caption: 'see https://example.com', shareToFeed: true }, wide);
    expect(hasErrors(issues)).toBe(false);
    expect(issues.filter((i) => i.level === 'warning')).toHaveLength(2);
  });
  it('still validates text when nothing is known about the video', () => {
    expect(hasErrors(validateFields('facebook', { format: 'video', title: 'x'.repeat(256), description: '' }, null))).toBe(true);
  });
  it('detects Shorts only for short, non-landscape video', () => {
    expect(isYouTubeShort(vertical)).toBe(true);
    expect(isYouTubeShort(longWide)).toBe(false);
    expect(isYouTubeShort(null)).toBeNull();
  });
});
