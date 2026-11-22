import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountAnalytics, AccountDTO, CommentsResponse, CreatePostBody, DraftDTO, GroupDTO, PostDTO, SessionInfo, SnippetDTO, VideoDTO, WrittenCopy } from '../shared/types';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init.body && typeof init.body === 'string' ? { 'content-type': 'application/json', ...init.headers } : init.headers,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') window.dispatchEvent(new Event('relay:signed-out'));
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const useSession = () => useQuery({ queryKey: ['session'], queryFn: () => api<SessionInfo>('/session') });
export const useAccounts = (enabled = true) => useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountDTO[]>('/accounts'), enabled });
export const useVideos = () => useQuery({ queryKey: ['videos'], queryFn: () => api<VideoDTO[]>('/videos') });

export const useGroups = () => useQuery({ queryKey: ['groups'], queryFn: () => api<GroupDTO[]>('/groups') });
export const useSnippets = () => useQuery({ queryKey: ['snippets'], queryFn: () => api<SnippetDTO[]>('/snippets') });
export const useDrafts = () => useQuery({ queryKey: ['drafts'], queryFn: () => api<DraftDTO[]>('/drafts') });

const isActive = (p: PostDTO) => p.status === 'publishing';
/** Polls quickly while anything is uploading, slowly otherwise (to pick up scheduled posts going out). */
export const usePosts = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: ['posts'],
    queryFn: () => api<PostDTO[]>('/posts'),
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 1000 : 20_000),
  });

export const useAnalytics = (days: number) =>
  useQuery({ queryKey: ['analytics', days], queryFn: () => api<AccountAnalytics[]>(`/analytics?days=${days}`), staleTime: 60_000 });

export const useComments = () => useQuery({ queryKey: ['comments'], queryFn: () => api<CommentsResponse>('/comments'), staleTime: 60_000 });

/** A mutation that refreshes the given cached lists when it succeeds. */
export function useAction<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, invalidate: string[] = []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(invalidate.map((key) => client.invalidateQueries({ queryKey: [key] }))),
  });
}

export const actions = {
  login: (password: string) => api('/login', post({ password })),
  logout: () => api('/logout', post()),
  addDemo: () => api('/accounts/demo', post()),
  removeDemo: () => api('/accounts/demo', { method: 'DELETE' }),
  disconnect: (id: string) => api(`/accounts/${id}`, { method: 'DELETE' }),
  startOAuth: (provider: 'google' | 'meta') => api<{ url: string }>(`/oauth/${provider}/start`),
  deleteVideo: (id: string) => api(`/videos/${id}`, { method: 'DELETE' }),
  createPost: (body: CreatePostBody) => api<PostDTO>('/posts', post(body)),
  publishPost: (id: string) => api<PostDTO>(`/posts/${id}/publish`, post()),
  deletePost: (id: string) => api(`/posts/${id}`, { method: 'DELETE' }),
  writeCopy: (body: { videoId: string; brief: string; accountIds: string[] }) => api<WrittenCopy>('/assistant/write', post(body)),
  saveGroup: (body: { name: string; accountIds: string[] }) => api<GroupDTO>('/groups', post(body)),
  deleteGroup: (id: string) => api(`/groups/${id}`, { method: 'DELETE' }),
  saveSnippet: (body: Omit<SnippetDTO, 'id'>) => api<SnippetDTO>('/snippets', post(body)),
  deleteSnippet: (id: string) => api(`/snippets/${id}`, { method: 'DELETE' }),
  saveDraft: (body: { id: string | null; name: string; data: unknown }) => api<DraftDTO>('/drafts', post(body)),
  deleteDraft: (id: string) => api(`/drafts/${id}`, { method: 'DELETE' }),
  reply: (body: { accountId: string; commentId: string; text: string }) => api('/comments/reply', post(body)),
  refresh: (what: 'analytics' | 'comments') => api(`/${what}?refresh=1${what === 'analytics' ? '&days=28' : ''}`),
};

/** Reads duration and dimensions in the browser, as a fallback for servers without ffprobe. */
function readMetadata(file: File): Promise<{ duration?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (meta: { duration?: number; width?: number; height?: number }) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done({ duration: el.duration, width: el.videoWidth, height: el.videoHeight });
    el.onerror = () => done({});
    setTimeout(() => done({}), 5000);
    el.src = url;
  });
}

/** Uploads with XMLHttpRequest because fetch cannot report upload progress. */
export async function uploadVideo(file: File, onProgress: (percent: number) => void): Promise<VideoDTO> {
  const meta = await readMetadata(file);
  const params = new URLSearchParams();
  if (meta.duration && Number.isFinite(meta.duration)) params.set('duration', String(Math.round(meta.duration)));
  if (meta.width) params.set('width', String(meta.width));
  if (meta.height) params.set('height', String(meta.height));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/videos?${params}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || 'null');
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error ?? `Upload failed (${xhr.status})`));
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
