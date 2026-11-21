// Small building blocks shared by every page.
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Issue, Platform } from '../../shared/platforms';
import { cx } from '../lib';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        variant === 'primary' && 'bg-accent text-on-accent hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-sunken',
        variant === 'ghost' && 'text-ink-2 hover:bg-sunken hover:text-ink',
        variant === 'danger' && 'border border-line bg-surface text-bad hover:bg-bad-soft',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <section className={cx('rounded-xl border border-line bg-surface', className)}>{children}</section>
);

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

export function Field({ label, hint, count, max, children }: { label: string; hint?: string; count?: number; max?: number; children: ReactNode }) {
  const over = count != null && max != null && count > max;
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {count != null && max != null && (
          <span className={cx('tabular text-xs', over ? 'font-semibold text-bad' : 'text-ink-3')}>
            {count.toLocaleString()} / {max.toLocaleString()}
          </span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs with optional counts. */
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cx('-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors', t.value === value ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink')}
        >
          {t.label}
          {t.count != null && <span className={cx('tabular rounded-full px-1.5 py-0.5 text-xs', t.value === value ? 'bg-accent-soft text-accent' : 'bg-sunken text-ink-3')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A button that opens a small panel beneath it. Closes on outside click or Escape. */
export function Popover({ trigger, children, align = 'right' }: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div className={cx('rise absolute top-full z-30 mt-1.5 w-72 rounded-xl border border-line bg-surface p-2 shadow-xl', align === 'right' ? 'right-0' : 'left-0')}>{children(() => setOpen(false))}</div>
      )}
    </div>
  );
}

export const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
    <h2 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">{children}</h2>
    {aside}
  </div>
);

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  accent: 'bg-accent-soft text-accent',
};
export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', toneClass[tone])}>{children}</span>
);

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-2" role="status">
    <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
  </div>
);

export const EmptyState = ({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) => (
  <Card className="flex flex-col items-center px-6 py-14 text-center">
    <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-sunken text-ink-2">{icon}</div>
    <h2 className="text-base font-semibold">{title}</h2>
    <p className="mt-1 max-w-md text-sm text-ink-2">{body}</p>
    {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
  </Card>
);

export const ErrorNote = ({ children }: { children: ReactNode }) => (
  <p className="flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
    <span>{children}</span>
  </p>
);

/** Validation messages for one platform. Each level has its own icon, so meaning never rests on colour alone. */
export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  const style = {
    error: { icon: XCircle, cls: 'text-bad' },
    warning: { icon: AlertTriangle, cls: 'text-warn' },
    info: { icon: Info, cls: 'text-ink-2' },
  };
  return (
    <ul className="space-y-1.5">
      {issues.map((issue, i) => {
        const { icon: Icon, cls } = style[issue.level];
        return (
          <li key={i} className={cx('flex items-start gap-2 text-sm', cls)}>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{issue.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Generic platform marks (not the official logos): a play button, a camera and a page. */
export function PlatformIcon({ platform, size = 20 }: { platform: Platform; size?: number }) {
  const fill = { youtube: '#e0322f', instagram: '#c2338a', facebook: '#2f6fdd' }[platform];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <rect width="24" height="24" rx="6" fill={fill} />
      {platform === 'youtube' && <path d="M9.5 7.5v9l7.5-4.5z" fill="#fff" />}
      {platform === 'instagram' && (
        <g fill="none" stroke="#fff" strokeWidth="1.8">
          <rect x="6" y="6" width="12" height="12" rx="3.5" />
          <circle cx="12" cy="12" r="2.8" />
          <circle cx="15.8" cy="8.2" r="0.6" fill="#fff" />
        </g>
      )}
      {platform === 'facebook' && <path d="M13.2 19v-5.6h2l.4-2.4h-2.4V9.6c0-.8.3-1.2 1.2-1.2h1.3V6.2c-.5-.1-1.2-.2-1.9-.2-2 0-3.2 1.2-3.2 3.3V11H8.6v2.4h2V19z" fill="#fff" />}
    </svg>
  );
}

export const Avatar = ({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) =>
  url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-semibold text-ink-2" style={{ width: size, height: size }} aria-hidden>
      {name.replace(/^@/, '').charAt(0).toUpperCase()}
    </span>
  );

// ── Toasts ───────────────────────────────────────────────────────────────────

type Toast = { id: number; tone: 'good' | 'bad'; text: string };
const ToastContext = createContext<(tone: Toast['tone'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="rise pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-lg">
            {t.tone === 'good' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
