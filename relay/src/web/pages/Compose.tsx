// The publish screen: pick a video, write once, check what each platform will receive, send everywhere.
import { CalendarClock, Check, CheckCircle2, Film, Radio, Send, Upload, X } from 'lucide-react';
import { useRef, useState, type Dispatch, type DragEvent, type ReactNode, type SetStateAction } from 'react';
import {
  countHashtags, hasErrors, isYouTubeShort, LIMITS, PLATFORM_INFO, PLATFORMS, validateFields, youtubeTagsLength, YOUTUBE_CATEGORIES,
  parseHashtags, type FacebookFields, type InstagramFields, type Issue, type Platform, type VideoMeta, type YouTubeFields,
} from '../../shared/platforms';
import type { AccountDTO, VideoDTO } from '../../shared/types';
import { actions, uploadVideo, useAccounts, useAction, useVideos } from '../api';
import type { Route } from '../App';
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Field, inputClass, IssueList, PageHeader, PlatformIcon, Segmented, Spinner, Switch, useToast } from '../components/ui';
import { emptyDraft, fieldsFor, seedOverrides, type Draft } from '../draft';
import { cx, formatBytes, formatDuration, orientation, toLocalInput } from '../lib';

type SetDraft = Dispatch<SetStateAction<Draft>>;

const meta = (v: VideoDTO | null): VideoMeta | null => (v ? { sizeBytes: v.sizeBytes, mime: v.mime, durationSec: v.durationSec, width: v.width, height: v.height } : null);

const Step = ({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) => (
  <Card className="p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2.5 text-base font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-sunken text-xs font-semibold text-ink-2">{n}</span>
        {title}
      </h2>
      {aside}
    </div>
    {children}
  </Card>
);

// ── Step 1: the video ────────────────────────────────────────────────────────

function VideoPicker({ video, videos, onPick }: { video: VideoDTO | null; videos: VideoDTO[]; onPick: (id: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useAction((file: File) => uploadVideo(file, setProgress), ['videos']);

  const start = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) return toast('bad', 'That file is not a video.');
    setProgress(0);
    upload.mutate(file, {
      onSuccess: (v) => onPick(v.id),
      onError: (e) => toast('bad', (e as Error).message),
      onSettled: () => setProgress(null),
    });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    start(e.dataTransfer.files[0]);
  };

  if (video) {
    const chips = [formatDuration(video.durationSec), video.width && `${video.width}×${video.height}`, orientation(video.width, video.height), formatBytes(video.sizeBytes)].filter(Boolean);
    return (
      <div className="flex flex-col gap-4 sm:flex-row">
        <video key={video.id} src={`/api/videos/${video.id}/file`} poster={video.hasThumb ? `/api/videos/${video.id}/thumb` : undefined} controls preload="metadata" className="max-h-64 w-full rounded-lg bg-black sm:w-56" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={video.name}>{video.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Badge key={String(c)}>{c}</Badge>
            ))}
          </div>
          <Button size="sm" className="mt-4" onClick={() => onPick(null)}>
            <X className="size-4" aria-hidden /> Choose a different video
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx('flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors', dragging ? 'border-accent bg-accent-soft' : 'border-line')}
      >
        {progress != null ? (
          <div className="w-full max-w-xs" role="status">
            <p className="mb-2 text-sm font-medium">Uploading… {progress}%</p>
            <div className="h-2 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <Upload className="mb-3 size-7 text-ink-3" aria-hidden />
            <p className="text-sm font-medium">Drop a video here</p>
            <p className="mt-1 text-xs text-ink-3">MP4 or MOV works on every platform</p>
            <Button variant="primary" className="mt-4" onClick={() => input.current?.click()}>
              Choose file
            </Button>
          </>
        )}
        <input ref={input} type="file" accept="video/*" hidden onChange={(e) => (start(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
      {videos.length > 0 && progress == null && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-3">Or pick from your library</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {videos.slice(0, 8).map((v) => (
              <button key={v.id} type="button" onClick={() => onPick(v.id)} className="w-28 shrink-0 rounded-lg border border-line p-1.5 text-left hover:border-accent">
                <span className="flex aspect-video items-center justify-center overflow-hidden rounded bg-sunken">
                  {v.hasThumb ? <img src={`/api/videos/${v.id}/thumb`} alt="" className="size-full object-cover" /> : <Film className="size-5 text-ink-3" aria-hidden />}
                </span>
                <span className="mt-1 block truncate text-xs">{v.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: what each platform receives ──────────────────────────────────────

const ReadOnly = ({ label, value, count, max }: { label: string; value: string; count?: number; max?: number }) => (
  <Field label={label} count={count} max={max}>
    <div className="max-h-32 min-h-9 overflow-y-auto rounded-lg bg-sunken px-3 py-2 text-sm whitespace-pre-wrap text-ink-2">{value || <span className="text-ink-3">Empty</span>}</div>
  </Field>
);

function PlatformCard({ platform, accounts, draft, setDraft, video, issues }: { platform: Platform; accounts: AccountDTO[]; draft: Draft; setDraft: SetDraft; video: VideoMeta | null; issues: Issue[] }) {
  const custom = Boolean(draft.custom[platform]);
  const fields = fieldsFor(platform, draft, video);
  const setCustom = (on: boolean) => setDraft((d) => ({ ...d, custom: { ...d.custom, [platform]: on }, overrides: on ? seedOverrides(platform, d, video) : d.overrides }));
  const setOverride = (patch: object) => setDraft((d) => ({ ...d, overrides: { ...d.overrides, [platform]: { ...d.overrides[platform], ...patch } } }));
  const setOption = (patch: object) => setDraft((d) => ({ ...d, [platform]: { ...d[platform], ...patch } }));

  let body: ReactNode;
  if (platform === 'youtube') {
    const f = fields as YouTubeFields;
    const o = draft.overrides.youtube;
    body = (
      <>
        {custom ? (
          <>
            <Field label="Title" count={o.title.length} max={LIMITS.youtube.title}>
              <input className={inputClass} value={o.title} onChange={(e) => setOverride({ title: e.target.value })} />
            </Field>
            <Field label="Description" count={o.description.length} max={LIMITS.youtube.description}>
              <textarea className={inputClass} rows={4} value={o.description} onChange={(e) => setOverride({ description: e.target.value })} />
            </Field>
            <Field label="Tags" hint="Separate with commas or spaces" count={youtubeTagsLength(parseHashtags(o.tags))} max={LIMITS.youtube.tagsTotal}>
              <input className={inputClass} value={o.tags} onChange={(e) => setOverride({ tags: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <ReadOnly label="Title" value={f.title} count={f.title.length} max={LIMITS.youtube.title} />
            <ReadOnly label="Description" value={f.description} count={f.description.length} max={LIMITS.youtube.description} />
            <ReadOnly label="Tags" value={f.tags.join(', ')} />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visibility">
            <select className={inputClass} value={draft.youtube.privacy} onChange={(e) => setOption({ privacy: e.target.value })}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </Field>
          <Field label="Category">
            <select className={inputClass} value={draft.youtube.categoryId} onChange={(e) => setOption({ categoryId: e.target.value })}>
              {YOUTUBE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Switch label="Made for kids" checked={draft.youtube.madeForKids} onChange={(v) => setOption({ madeForKids: v })} />
        <Switch label="Notify subscribers" checked={draft.youtube.notifySubscribers} onChange={(v) => setOption({ notifySubscribers: v })} />
      </>
    );
  } else if (platform === 'instagram') {
    const f = fields as InstagramFields;
    body = (
      <>
        {custom ? (
          <Field label="Caption" count={draft.overrides.instagram.caption.length} max={LIMITS.instagram.caption} hint={`${countHashtags(draft.overrides.instagram.caption)} of ${LIMITS.instagram.hashtags} hashtags used`}>
            <textarea className={inputClass} rows={5} value={draft.overrides.instagram.caption} onChange={(e) => setOverride({ caption: e.target.value })} />
          </Field>
        ) : (
          <ReadOnly label="Caption" value={f.caption} count={f.caption.length} max={LIMITS.instagram.caption} />
        )}
        <Switch label="Also show in the main feed" checked={draft.instagram.shareToFeed} onChange={(v) => setOption({ shareToFeed: v })} />
      </>
    );
  } else {
    const f = fields as FacebookFields;
    const o = draft.overrides.facebook;
    body = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Format</span>
          <Segmented
            label="Facebook format"
            value={draft.facebook.format}
            onChange={(format) => setOption({ format })}
            options={[
              { value: 'auto', label: `Auto (${f.format === 'reel' && draft.facebook.format === 'auto' ? 'Reel' : draft.facebook.format === 'auto' ? 'Video' : 'by video'})` },
              { value: 'video', label: 'Video' },
              { value: 'reel', label: 'Reel' },
            ]}
          />
        </div>
        {custom ? (
          <>
            {f.format === 'video' && (
              <Field label="Title" count={o.title.length} max={LIMITS.facebook.title}>
                <input className={inputClass} value={o.title} onChange={(e) => setOverride({ title: e.target.value })} />
              </Field>
            )}
            <Field label="Description">
              <textarea className={inputClass} rows={4} value={o.description} onChange={(e) => setOverride({ description: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            {f.format === 'video' && <ReadOnly label="Title" value={f.title} count={f.title.length} max={LIMITS.facebook.title} />}
            <ReadOnly label="Description" value={f.description} />
          </>
        )}
      </>
    );
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <PlatformIcon platform={platform} /> {PLATFORM_INFO[platform].label}
          <span className="text-sm font-normal text-ink-3">{accounts.map((a) => a.name).join(', ')}</span>
        </h3>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="size-4 accent-(--accent)" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
          Write separately
        </label>
      </div>
      <p className="mb-4 text-xs text-ink-3">{PLATFORM_INFO[platform].summary}</p>
      <div className="space-y-4">
        {body}
        <IssueList issues={issues} />
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export function Compose({ draft, setDraft, go }: { draft: Draft; setDraft: SetDraft; go: (r: Route) => void }) {
  const accounts = useAccounts();
  const videos = useVideos();
  const toast = useToast();
  const create = useAction(actions.createPost, ['posts']);

  if (accounts.isLoading || videos.isLoading) return <Spinner />;
  if (accounts.isError || videos.isError) return <ErrorNote>Could not load your channels and library. Reload to try again.</ErrorNote>;
  const allAccounts = accounts.data ?? [];

  if (!allAccounts.length)
    return (
      <>
        <PageHeader title="Publish" subtitle="One upload, every channel." />
        <EmptyState
          icon={<Radio className="size-5" aria-hidden />}
          title="Connect a channel to start"
          body="Link your YouTube channel, Instagram account and Facebook Page once. After that, publishing to all of them is a single click."
          action={<Button variant="primary" onClick={() => go('channels')}>Connect channels</Button>}
        />
      </>
    );

  const video = videos.data?.find((v) => v.id === draft.videoId) ?? null;
  const videoMeta = meta(video);
  const selectedIds = draft.accountIds ?? allAccounts.filter((a) => a.status === 'connected').map((a) => a.id);
  const selected = allAccounts.filter((a) => selectedIds.includes(a.id));
  const platforms = PLATFORMS.filter((p) => selected.some((a) => a.platform === p));
  const issues = Object.fromEntries(platforms.map((p) => [p, validateFields(p, fieldsFor(p, draft, videoMeta), videoMeta)])) as Record<Platform, Issue[]>;
  const blocked = platforms.filter((p) => hasErrors(issues[p]));

  const scheduleTime = draft.scheduleOn && draft.scheduleAt ? new Date(draft.scheduleAt).getTime() : null;
  const scheduleInvalid = draft.scheduleOn && (!scheduleTime || scheduleTime < Date.now() + 60_000);
  const reason = !video ? 'Choose a video first.' : !selected.length ? 'Select at least one channel.' : blocked.length ? `Fix the ${blocked.map((p) => PLATFORM_INFO[p].label).join(' and ')} errors.` : scheduleInvalid ? 'Pick a time at least a minute from now.' : null;

  const toggleAccount = (id: string) => setDraft((d) => ({ ...d, accountIds: selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id] }));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const hashtagCount = parseHashtags(draft.hashtags).length;

  const submit = () => {
    if (!video || reason) return;
    create.mutate(
      {
        videoId: video.id,
        title: draft.title.trim() || video.name,
        scheduledAt: scheduleTime,
        targets: selected.map((a) => ({ accountId: a.id, fields: fieldsFor(a.platform, draft, videoMeta) })),
      },
      {
        onSuccess: () => {
          toast('good', scheduleTime ? 'Scheduled.' : `Publishing to ${selected.length} ${selected.length === 1 ? 'channel' : 'channels'}.`);
          setDraft(emptyDraft());
          go('posts');
        },
        onError: (e) => toast('bad', (e as Error).message),
      },
    );
  };

  return (
    <>
      <PageHeader title="Publish" subtitle="Upload once, write once. Each platform gets the fields it accepts." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Step n={1} title="Video">
            <VideoPicker video={video} videos={videos.data ?? []} onPick={(videoId) => set({ videoId })} />
          </Step>

          <Step n={2} title="Channels">
            <div className="flex flex-wrap gap-2">
              {allAccounts.map((a) => {
                const on = selectedIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    disabled={a.status !== 'connected'}
                    onClick={() => toggleAccount(a.id)}
                    className={cx('flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 text-sm transition-colors disabled:opacity-50', on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken')}
                  >
                    <PlatformIcon platform={a.platform} size={24} />
                    <span className="font-medium">{a.name}</span>
                    {a.status !== 'connected' ? <Badge tone="warn">Reconnect</Badge> : on ? <Check className="size-4 text-accent" aria-hidden /> : <span className="size-4" />}
                  </button>
                );
              })}
            </div>
          </Step>

          <Step n={3} title="Write it once">
            <div className="space-y-4">
              <Field label="Title" hint="Used as the YouTube and Facebook title, and as the first line of the Instagram caption." count={draft.title.length} max={LIMITS.youtube.title}>
                <input className={inputClass} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="What is this video about?" />
              </Field>
              <Field label="Description">
                <textarea className={inputClass} rows={5} value={draft.text} onChange={(e) => set({ text: e.target.value })} placeholder="Tell viewers more. This becomes the description or caption." />
              </Field>
              <Field label="Hashtags" hint="Added to the end of each description and used as YouTube tags. Instagram allows 30." count={hashtagCount} max={LIMITS.instagram.hashtags}>
                <input className={inputClass} value={draft.hashtags} onChange={(e) => set({ hashtags: e.target.value })} placeholder="travel vlog behindthescenes" />
              </Field>
            </div>
          </Step>

          {platforms.length > 0 && (
            <Step n={4} title="Check each platform">
              <div className="space-y-4">
                {platforms.map((p) => (
                  <PlatformCard key={p} platform={p} accounts={selected.filter((a) => a.platform === p)} draft={draft} setDraft={setDraft} video={videoMeta} issues={issues[p]} />
                ))}
              </div>
            </Step>
          )}
        </div>

        {/* Summary and the one button */}
        <Card className="p-5 lg:sticky lg:top-6">
          <h2 className="mb-3 text-base font-semibold">Ready to go</h2>
          <ul className="mb-4 space-y-2.5">
            {selected.length === 0 && <li className="text-sm text-ink-3">No channels selected.</li>}
            {selected.map((a) => {
              const list = issues[a.platform] ?? [];
              const errors = list.filter((i) => i.level === 'error').length;
              const warnings = list.filter((i) => i.level === 'warning').length;
              const short = a.platform === 'youtube' && isYouTubeShort(videoMeta);
              const fb = a.platform === 'facebook' && (fieldsFor('facebook', draft, videoMeta) as FacebookFields).format === 'reel';
              return (
                <li key={a.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar name={a.name} url={a.avatarUrl} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block text-xs text-ink-3">
                      {PLATFORM_INFO[a.platform].label}
                      {a.platform === 'instagram' ? ' Reel' : short ? ' Short' : fb ? ' Reel' : video ? ' video' : ''}
                    </span>
                  </span>
                  {errors ? <Badge tone="bad">{errors} to fix</Badge> : warnings ? <Badge tone="warn">{warnings} {warnings === 1 ? 'note' : 'notes'}</Badge> : <CheckCircle2 className="size-4 text-good" aria-label="Ready" />}
                </li>
              );
            })}
          </ul>

          <div className="space-y-3 border-t border-line pt-4">
            <Switch label="Schedule for later" checked={draft.scheduleOn} onChange={(on) => set({ scheduleOn: on, scheduleAt: draft.scheduleAt || toLocalInput(new Date(Date.now() + 3600_000)) })} />
            {draft.scheduleOn && (
              <input type="datetime-local" aria-label="Publish time" className={inputClass} value={draft.scheduleAt} min={toLocalInput(new Date())} onChange={(e) => set({ scheduleAt: e.target.value })} />
            )}
          </div>

          <Button variant="primary" size="lg" className="mt-4 w-full" disabled={Boolean(reason)} loading={create.isPending} onClick={submit}>
            {draft.scheduleOn ? <CalendarClock className="size-5" aria-hidden /> : <Send className="size-5" aria-hidden />}
            {draft.scheduleOn ? 'Schedule' : 'Publish'} to {selected.length} {selected.length === 1 ? 'channel' : 'channels'}
          </Button>
          {reason && <p className="mt-2 text-center text-xs text-ink-3">{reason}</p>}
        </Card>
      </div>
    </>
  );
}
