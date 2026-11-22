// Reads duration and dimensions from an uploaded video and grabs a thumbnail frame.
// Uses ffprobe/ffmpeg when they are installed (they are in the Docker image); without them
// the app still works, the browser-reported metadata is used and there is no thumbnail.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function probe(filePath: string): Promise<{ durationSec: number | null; width: number | null; height: number | null } | null> {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', filePath], { timeout: 20_000 });
    const info = JSON.parse(stdout);
    const stream = info.streams?.[0];
    if (!stream) return null;
    let { width, height } = stream as { width: number; height: number };
    // Phone videos are often stored sideways with a rotation flag.
    const rotation = Math.abs(Number(stream.side_data_list?.find((s: any) => s.rotation != null)?.rotation ?? 0));
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    const duration = Number(info.format?.duration);
    return { durationSec: Number.isFinite(duration) ? Math.round(duration) : null, width: width ?? null, height: height ?? null };
  } catch {
    return null;
  }
}

export async function makeThumbnail(filePath: string, outPath: string, atSec: number): Promise<boolean> {
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(atSec), '-i', filePath, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', outPath], { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Grabs a few still frames spread across the video, as small JPEGs, so the AI writer can see what the video shows.
 * Returns an empty list when ffmpeg is not installed; the writer then works from the description alone.
 */
export async function extractFrames(filePath: string, durationSec: number | null, count = 4): Promise<Buffer[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-frames-'));
  try {
    const length = durationSec && durationSec > 0 ? durationSec : 8;
    const frames: Buffer[] = [];
    for (let i = 0; i < count; i++) {
      const out = path.join(dir, `${i}.jpg`);
      const at = (length * (i + 0.5)) / count;
      try {
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', at.toFixed(2), '-i', filePath, '-frames:v', '1', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease', '-q:v', '6', out], { timeout: 20_000 });
        frames.push(fs.readFileSync(out));
      } catch {
        if (i === 0) return []; // ffmpeg missing or the file is unreadable: no point trying the rest
      }
    }
    return frames;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
