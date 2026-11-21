// Things the user saves for reuse: channel groups, hashtag sets and caption templates, and drafts.
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DraftDTO, GroupDTO, SnippetDTO } from '../../shared/types';
import { newId } from '../crypto';
import { db, schema } from '../db';

const { groups, snippets, drafts } = schema;
const name = z.string().trim().min(1, 'Give it a name.').max(80);
type IdParams = { Params: { id: string } };

export function registerSaved(app: FastifyInstance) {
  // ── Channel groups ──
  app.get('/api/groups', async (): Promise<GroupDTO[]> => db.select().from(groups).orderBy(groups.createdAt).all().map(({ id, name, accountIds }) => ({ id, name, accountIds })));
  app.post('/api/groups', async (req): Promise<GroupDTO> => {
    const body = z.object({ name, accountIds: z.array(z.string()).min(1, 'Select at least one channel first.') }).parse(req.body);
    const row = { id: newId(), ...body, createdAt: Date.now() };
    db.insert(groups).values(row).run();
    return { id: row.id, name: row.name, accountIds: row.accountIds };
  });
  app.delete<IdParams>('/api/groups/:id', async (req) => {
    db.delete(groups).where(eq(groups.id, req.params.id)).run();
    return { ok: true };
  });

  // ── Hashtag sets and caption templates ──
  app.get('/api/snippets', async (): Promise<SnippetDTO[]> => db.select().from(snippets).orderBy(snippets.createdAt).all().map(({ id, kind, name, content }) => ({ id, kind, name, content })));
  app.post('/api/snippets', async (req): Promise<SnippetDTO> => {
    const body = z.object({ kind: z.enum(['hashtags', 'text']), name, content: z.string().trim().min(1, 'There is nothing to save yet.').max(6000) }).parse(req.body);
    const row = { id: newId(), ...body, createdAt: Date.now() };
    db.insert(snippets).values(row).run();
    return { id: row.id, kind: row.kind, name: row.name, content: row.content };
  });
  app.delete<IdParams>('/api/snippets/:id', async (req) => {
    db.delete(snippets).where(eq(snippets.id, req.params.id)).run();
    return { ok: true };
  });

  // ── Drafts ──
  app.get('/api/drafts', async (): Promise<DraftDTO[]> => db.select().from(drafts).orderBy(desc(drafts.updatedAt)).all());
  /** Creates a draft, or overwrites the one with the given id. */
  app.post('/api/drafts', async (req): Promise<DraftDTO> => {
    const body = z.object({ id: z.string().nullish(), name, data: z.record(z.string(), z.unknown()) }).parse(req.body);
    const row = { id: body.id || newId(), name: body.name, data: body.data, updatedAt: Date.now() };
    db.insert(drafts).values(row).onConflictDoUpdate({ target: drafts.id, set: { name: row.name, data: row.data, updatedAt: row.updatedAt } }).run();
    return row;
  });
  app.delete<IdParams>('/api/drafts/:id', async (req) => {
    db.delete(drafts).where(eq(drafts.id, req.params.id)).run();
    return { ok: true };
  });
}
