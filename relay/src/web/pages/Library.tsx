// Uploaded videos, ready to be published or reused.
import { Clapperboard, Film, Send, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { actions, uploadVideo, useAction, useVideos } from '../api';
import type { Route } from '../App';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Spinner, useToast } from '../components/ui';
import { emptyDraft, type Draft } from '../draft';
import { formatBytes, formatDuration, orientation, timeAgo } from '../lib';

export function Library({ go, setDraft }: { go: (r: Route) => void; setDraft: Dispatch<SetStateAction<Draft>> }) {
  const videos = useVideos();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useAction((file: File) => uploadVideo(file, setProgress), ['videos']);
  const remove = useAction(actions.deleteVideo, ['videos', 'posts']);

  const start = (file?: File) => {
    if (!file) return;
    setProgress(0);
    upload.mutate(file, { onSuccess: () => toast('good', 'Video added to your library.'), onError: (e) => toast('bad', (e as Error).message), onSettled: () => setProgress(null) });
  };
  const uploadButton = (
    <Button variant="primary" loading={progress != null} onClick={() => input.current?.click()}>
      {progress == null && <Upload className="size-4" aria-hidden />}
      {progress != null ? `Uploading ${progress}%` : 'Upload video'}
    </Button>
  );
  const header = (
    <>
      <PageHeader title="Library" subtitle="Videos you have uploaded. Publish any of them again without re-uploading." actions={uploadButton} />
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => (start(e.target.files?.[0]), (e.target.value = ''))} />
    </>
  );

  if (videos.isLoading) return <>{header}<Spinner /></>;
  if (videos.isError) return <>{header}<ErrorNote>Could not load your library. Reload to try again.</ErrorNote></>;
  if (!videos.data?.length)
    return (
      <>
        {header}
        <EmptyState icon={<Clapperboard className="size-5" aria-hidden />} title="Your library is empty" body="Upload a video to keep it here. Files stay on your own server until you delete them." />
      </>
    );

  return (
    <>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.data.map((v) => (
          <Card key={v.id} className="overflow-hidden">
            <div className="flex aspect-video items-center justify-center bg-sunken">
              {v.hasThumb ? <img src={`/api/videos/${v.id}/thumb`} alt="" className="size-full object-contain" /> : <Film className="size-7 text-ink-3" aria-hidden />}
            </div>
            <div className="p-4">
              <p className="truncate font-medium" title={v.name}>{v.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[formatDuration(v.durationSec), orientation(v.width, v.height), formatBytes(v.sizeBytes)].filter(Boolean).map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">Added {timeAgo(v.createdAt)}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    setDraft({ ...emptyDraft(), videoId: v.id });
                    go('compose');
                  }}
                >
                  <Send className="size-4" aria-hidden /> Publish
                </Button>
                <Button size="sm" variant="danger" aria-label={`Delete ${v.name}`} onClick={() => confirm(`Delete "${v.name}" from your library? This cannot be undone.`) && remove.mutate(v.id, { onError: (e) => toast('bad', (e as Error).message) })}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
