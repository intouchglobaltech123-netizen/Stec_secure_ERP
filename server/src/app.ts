// HTTP API. Everything under /api needs a logged-in user except login itself and the health check.
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import compression from 'compression';
import { Database } from './db';
import { Store, StateChanges } from './store';
import { config } from './config';
import { createAuth } from './auth';
import { createUsersRouter, HttpError } from './users';
import { createPhotosRouter, extractPhotos } from './photos';
import { checkPermission } from './permissions';
import { scopeStateFor } from './scope';
import { ACTIONS, ActionName } from '../../src/lib/erp/actions';
import { ErpState } from '../../src/lib/erp/core';
import { User } from '../../src/lib/stecsecure-types';

// Only the records this user may see, in the form they may see them
function scopeChanges(changes: StateChanges, scoped: ErpState): StateChanges {
  const out: StateChanges = { upserts: {}, deletes: changes.deletes, accessControl: changes.accessControl };
  for (const [c, list] of Object.entries(changes.upserts) as [keyof StateChanges['upserts'], { id: string }[]][]) {
    const visible = new Map((scoped[c] as { id: string }[]).map((r) => [r.id, r]));
    const kept = list.map((r) => visible.get(r.id)).filter((r): r is { id: string } => Boolean(r));
    if (kept.length) out.upserts[c] = kept as any;
  }
  return out;
}

export function createApp(db: Database, store: Store) {
  const app = express();
  app.set('trust proxy', 1); // Railway terminates HTTPS in front of the app
  app.disable('x-powered-by');
  app.use(compression());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '15mb' }));

  const auth = createAuth(db, store);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, database: db.kind, version: store.version });
  });
  app.use('/api/auth', auth.router);
  app.use('/api', auth.requireUser);
  app.use('/api/admin/users', createUsersRouter(db, store));
  app.use('/api/photos', createPhotosRouter(db));

  // Current data for this user. ?since=<version> returns 204 when nothing changed.
  app.get('/api/state', (req, res) => {
    const since = Number(req.query.since);
    if (since && since === store.version) {
      res.status(204).end();
      return;
    }
    res.json({ version: store.version, state: scopeStateFor(store.state, res.locals.user as User) });
  });

  // Runs one business action, e.g. POST /api/actions/completeJob { args: {...} }
  app.post('/api/actions/:name', async (req, res) => {
    const name = req.params.name as ActionName;
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, name)) {
      res.status(404).json({ error: `Unknown action ${name}` });
      return;
    }
    const user = res.locals.user as User;
    const args = await extractPhotos(db, req.body?.args ?? {}, user.id);
    const out = await store.runAction(name, args, user, (state) => checkPermission(name, state, user, args));
    res.json({
      result: out.result,
      version: out.version,
      changes: scopeChanges(out.changes, scopeStateFor(out.next, user)),
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // The built app, with every other path falling back to index.html
  if (fs.existsSync(path.join(config.staticDir, 'index.html'))) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.staticDir, 'index.html'));
    });
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (err?.name === 'PermissionError') {
      res.status(403).json({ error: err.message });
    } else if (err?.code === '23505') {
      // Unique index on document numbers — two people created one at the same moment
      res.status(409).json({ error: 'That document number was just taken. Please try again.' });
    } else if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'The upload is too large.' });
    } else if (err instanceof Error && !(err as any).code) {
      // Business rules in the shared actions throw plain errors with a message meant for the user
      res.status(400).json({ error: err.message });
    } else {
      console.error('[api] unexpected error', err);
      res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
    }
  });

  return app;
}
