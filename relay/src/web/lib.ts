import type { Platform } from '../shared/platforms';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const formatCount = (n: number | null | undefined) => (n == null ? '–' : n < 10_000 ? n.toLocaleString('en') : compact.format(n));

export const formatDate = (value: number | string) =>
  new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric', year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

export const formatDateTime = (value: number | string) =>
  new Date(value).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function timeAgo(value: number | string): string {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  if (mins < 60 * 24 * 30) return `${Math.round(mins / 1440)} d ago`;
  return formatDate(value);
}

export function orientation(width: number | null, height: number | null): string | null {
  if (!width || !height) return null;
  if (height > width) return 'Vertical';
  return width === height ? 'Square' : 'Landscape';
}

export const PLATFORM_LABEL: Record<Platform, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };

/** Value for <input type="datetime-local"> in the viewer's own time zone. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
