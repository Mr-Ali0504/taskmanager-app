// Shapes that cross the HTTP boundary. Imported by both the server and the UI.
import type { AnyFields, Platform } from './platforms';

export interface SessionInfo {
  authRequired: boolean;
  authenticated: boolean;
  providers: { google: boolean; meta: boolean };
}

export interface AccountDTO {
  id: string;
  platform: Platform;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  demo: boolean;
  status: 'connected' | 'needs_reauth';
  createdAt: number;
}

export interface VideoDTO {
  id: string;
  name: string;
  sizeBytes: number;
  mime: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
  createdAt: number;
}

export type TargetStatus = 'pending' | 'uploading' | 'processing' | 'published' | 'failed';
export type PostStatus = 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed';

export interface TargetDTO {
  id: string;
  accountId: string;
  accountName: string;
  platform: Platform;
  fields: AnyFields;
  status: TargetStatus;
  progress: number;
  url: string | null;
  error: string | null;
}

export interface PostDTO {
  id: string;
  video: VideoDTO | null;
  title: string;
  status: PostStatus;
  scheduledAt: number | null;
  createdAt: number;
  targets: TargetDTO[];
  /** Composer state the post was made from; null for posts made before this was recorded. */
  draft: unknown | null;
}

export interface CreatePostBody {
  videoId: string;
  title: string;
  scheduledAt: number | null;
  targets: { accountId: string; fields: AnyFields }[];
  /** Composer state, stored so the post can be reused. */
  draft?: unknown;
  /** Saved draft this post came from; it is removed once the post is created. */
  draftId?: string | null;
}

export interface GroupDTO {
  id: string;
  name: string;
  accountIds: string[];
}

export interface SnippetDTO {
  id: string;
  kind: 'hashtags' | 'text';
  name: string;
  content: string;
}

export interface DraftDTO {
  id: string;
  name: string;
  data: unknown;
  updatedAt: number;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface ChannelProfile {
  followers: number | null;
  totalViews: number | null;
  videoCount: number | null;
  url: string | null;
}

export interface RemoteVideo {
  id: string;
  title: string;
  url: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface AccountAnalytics {
  account: AccountDTO;
  profile: ChannelProfile | null;
  /** What `series` measures on this platform, e.g. "Views" or "Reach". */
  seriesMetric: string;
  series: SeriesPoint[];
  videos: RemoteVideo[];
  /** Daily audience readings recorded by this app (oldest first). Starts the day the channel is connected. */
  history: { date: string; followers: number | null }[];
  /** Set when the platform call failed; the other accounts still load. */
  error: string | null;
}

export interface RemoteComment {
  id: string;
  accountId: string;
  platform: Platform;
  videoId: string;
  videoTitle: string;
  videoUrl: string | null;
  author: string;
  authorAvatarUrl: string | null;
  text: string;
  likes: number;
  replies: number;
  publishedAt: string;
}

export interface CommentsResponse {
  comments: RemoteComment[];
  errors: { accountId: string; message: string }[];
}
