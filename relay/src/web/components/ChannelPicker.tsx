// Where the video goes: a checkbox per channel, grouped by platform, plus saved groups for one-click selection.
import { BookmarkPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PLATFORM_INFO, PLATFORMS } from '../../shared/platforms';
import type { AccountDTO } from '../../shared/types';
import { actions, useAction, useGroups } from '../api';
import { cx } from '../lib';
import { Avatar, Badge, Button, inputClass, PlatformIcon, useToast } from './ui';

function PlatformCheckbox({ state, onChange, label }: { state: 'all' | 'some' | 'none'; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return <input ref={ref} type="checkbox" className="size-4 accent-(--accent)" checked={state === 'all'} onChange={onChange} aria-label={label} />;
}

export function ChannelPicker({ accounts, selected, onChange }: { accounts: AccountDTO[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const groups = useGroups();
  const toast = useToast();
  const onError = (e: unknown) => toast('bad', (e as Error).message);
  const saveGroup = useAction(actions.saveGroup, ['groups']);
  const deleteGroup = useAction(actions.deleteGroup, ['groups']);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const usable = accounts.filter((a) => a.status === 'connected');
  const usableIds = new Set(usable.map((a) => a.id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const sameSet = (ids: string[]) => ids.length === selected.length && ids.every((id) => selected.includes(id));

  const save = () =>
    saveGroup.mutate(
      { name, accountIds: selected },
      {
        onSuccess: () => {
          toast('good', `Saved group “${name.trim()}”.`);
          setNaming(false);
          setName('');
        },
        onError,
      },
    );

  return (
    <div>
      {/* Quick selection */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onChange(usable.map((a) => a.id))}>Select all</Button>
        <Button size="sm" onClick={() => onChange([])} disabled={!selected.length}>Clear</Button>
        {(groups.data ?? []).map((g) => {
          const ids = g.accountIds.filter((id) => usableIds.has(id));
          if (!ids.length) return null;
          const active = sameSet(ids);
          return (
            <span key={g.id} className={cx('inline-flex h-8 items-center rounded-lg border text-sm font-medium', active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')}>
              <button type="button" aria-pressed={active} onClick={() => onChange(ids)} className="h-full rounded-l-lg pr-1.5 pl-3 hover:underline">
                {g.name} <span className="tabular font-normal text-ink-3">{ids.length}</span>
              </button>
              <button type="button" aria-label={`Delete group ${g.name}`} onClick={() => confirm(`Delete the group “${g.name}”? The channels stay connected.`) && deleteGroup.mutate(g.id, { onError })} className="h-full rounded-r-lg pr-2 pl-1 text-ink-3 hover:text-bad">
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          );
        })}
        {naming ? (
          <span className="flex items-center gap-2">
            <input autoFocus className={cx(inputClass, 'h-8 w-44 py-1')} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' && name.trim() ? save() : e.key === 'Escape' && setNaming(false))} aria-label="Group name" />
            <Button size="sm" variant="primary" disabled={!name.trim()} loading={saveGroup.isPending} onClick={save}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>Cancel</Button>
          </span>
        ) : (
          selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setNaming(true)}>
              <BookmarkPlus className="size-4" aria-hidden /> Save as group
            </Button>
          )
        )}
      </div>

      {/* One column per platform */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const list = accounts.filter((a) => a.platform === platform);
          if (!list.length) return null;
          const ids = list.filter((a) => a.status === 'connected').map((a) => a.id);
          const on = ids.filter((id) => selected.includes(id)).length;
          const state = on === 0 ? 'none' : on === ids.length ? 'all' : 'some';
          const togglePlatform = () => onChange(state === 'all' ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
          return (
            <fieldset key={platform} className="rounded-xl border border-line">
              <legend className="sr-only">{PLATFORM_INFO[platform].label}</legend>
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-line bg-sunken/60 px-3 py-2.5 text-sm font-semibold">
                <PlatformCheckbox state={state} onChange={togglePlatform} label={`All ${PLATFORM_INFO[platform].label} channels`} />
                <PlatformIcon platform={platform} size={18} />
                <span className="flex-1">{PLATFORM_INFO[platform].label}</span>
                <span className="tabular text-xs font-normal text-ink-3">{on} of {list.length}</span>
              </label>
              <ul>
                {list.map((a) => {
                  const disabled = a.status !== 'connected';
                  const checked = selected.includes(a.id);
                  return (
                    <li key={a.id}>
                      <label className={cx('flex items-center gap-2.5 px-3 py-2.5 text-sm', disabled ? 'opacity-60' : 'cursor-pointer hover:bg-sunken/60', checked && 'bg-accent-soft/50')}>
                        <input type="checkbox" className="size-4 accent-(--accent)" checked={checked} disabled={disabled} onChange={() => toggle(a.id)} />
                        <Avatar name={a.name} url={a.avatarUrl} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{a.name}</span>
                          {a.handle && <span className="block truncate text-xs text-ink-3">{a.handle}</span>}
                        </span>
                        {disabled && <Badge tone="warn">Reconnect</Badge>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
