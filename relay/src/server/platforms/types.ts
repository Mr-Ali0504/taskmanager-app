import type { AccountRow } from '../db/schema';
import type { ChannelProfile, RemoteComment, RemoteVideo, SeriesPoint } from '../../shared/types';

export interface PublishContext<F> {
  account: AccountRow;
  filePath: string;
  sizeBytes: number;
  mime: string;
  fields: F;
  /** Reports upload progress (0-100) and the move from uploading to platform-side processing. */
  onProgress: (status: 'uploading' | 'processing', percent: number) => void;
}

export interface PublishResult {
  externalId: string;
  url: string | null;
}

export type AdapterComment = Pick<RemoteComment, 'id' | 'author' | 'authorAvatarUrl' | 'text' | 'likes' | 'replies' | 'publishedAt'>;

/** Everything the app needs from a platform. One implementation per platform, plus a demo one. */
export interface PlatformAdapter<F> {
  publish(ctx: PublishContext<F>): Promise<PublishResult>;
  getProfile(account: AccountRow): Promise<ChannelProfile>;
  listVideos(account: AccountRow, limit: number): Promise<RemoteVideo[]>;
  getSeries(account: AccountRow, days: number): Promise<{ metric: string; points: SeriesPoint[] }>;
  listComments(account: AccountRow, videoId: string, limit: number): Promise<AdapterComment[]>;
  reply(account: AccountRow, commentId: string, text: string): Promise<void>;
}

/** An error whose message is safe and useful to show to the user. */
export class PlatformError extends Error {
  constructor(message: string, readonly needsReauth = false) {
    super(message);
  }
}
