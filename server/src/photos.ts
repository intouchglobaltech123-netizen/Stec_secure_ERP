// Job photos arrive inside action arguments as data: URLs. They are stored once in the photos table
// and replaced by a short /api/photos/<id> link, so records (and every sync to phones) stay small.
import crypto from 'node:crypto';
import express from 'express';
import { Database } from './db';

const DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function extractPhotos(db: Database, value: unknown, userId: string): Promise<unknown> {
  if (typeof value === 'string') {
    const match = DATA_URL.exec(value);
    if (!match) return value;
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Photo is too large (max 5 MB).');
    const id = crypto.randomUUID();
    await db.query('INSERT INTO photos (id, mime, data, created_by) VALUES ($1, $2, $3, $4)', [
      id,
      match[1],
      bytes,
      userId,
    ]);
    return `/api/photos/${id}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => extractPhotos(db, v, userId)));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await extractPhotos(db, v, userId);
    return out;
  }
  return value;
}

export function createPhotosRouter(db: Database) {
  const router = express.Router();
  router.get('/:id', async (req, res) => {
    const { rows } = await db.query<{ mime: string; data: Buffer | Uint8Array }>(
      'SELECT mime, data FROM photos WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', rows[0].mime);
    // Photos never change once stored
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(Buffer.from(rows[0].data));
  });
  return router;
}
