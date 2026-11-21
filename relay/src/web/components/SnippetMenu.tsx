// Saved hashtag sets and caption templates: insert one, or save what is currently typed.
import { Bookmark, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { SnippetDTO } from '../../shared/types';
import { actions, useAction, useSnippets } from '../api';
import { cx } from '../lib';
import { Button, inputClass, Popover, useToast } from './ui';

export function SnippetMenu({ kind, current, onInsert }: { kind: SnippetDTO['kind']; current: string; onInsert: (content: string) => void }) {
  const snippets = useSnippets();
  const toast = useToast();
  const onError = (e: unknown) => toast('bad', (e as Error).message);
  const save = useAction(actions.saveSnippet, ['snippets']);
  const remove = useAction(actions.deleteSnippet, ['snippets']);
  const [name, setName] = useState('');
  const list = (snippets.data ?? []).filter((s) => s.kind === kind);
  const noun = kind === 'hashtags' ? 'hashtag set' : 'template';

  return (
    <Popover
      trigger={
        <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent-soft">
          <Bookmark className="size-3.5" aria-hidden /> Saved{list.length ? ` (${list.length})` : ''}
        </button>
      }
    >
      {(close) => (
        <div>
          {list.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-3">No saved {noun}s yet. Type one, name it below and save it to reuse later.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {list.map((s) => (
                <li key={s.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => (onInsert(s.content), close())} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-sunken">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block truncate text-xs text-ink-3">{s.content}</span>
                  </button>
                  <button type="button" aria-label={`Delete ${s.name}`} onClick={() => remove.mutate(s.id, { onError })} className="rounded-md p-1.5 text-ink-3 hover:bg-bad-soft hover:text-bad">
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2 border-t border-line pt-2">
            <input className={cx(inputClass, 'h-8 py-1')} placeholder={`Name this ${noun}`} value={name} onChange={(e) => setName(e.target.value)} aria-label={`Name for the ${noun}`} />
            <Button
              size="sm"
              variant="primary"
              disabled={!name.trim() || !current.trim()}
              loading={save.isPending}
              onClick={() => save.mutate({ kind, name, content: current }, { onSuccess: () => (setName(''), toast('good', 'Saved.')), onError })}
            >
              Save
            </Button>
          </div>
          {!current.trim() && <p className="px-1 pt-1.5 text-xs text-ink-3">Type something in the field first to save it.</p>}
        </div>
      )}
    </Popover>
  );
}
