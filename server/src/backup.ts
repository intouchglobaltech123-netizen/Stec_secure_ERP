// Step 3: backups (CEO only). One ZIP with a readable Excel copy and the full backup (JSON): every
// business record, the settings and the job photos — everything except PINs and login sessions (4-digit
// PIN hashes are easy to crack, so they never leave the server). `restore.ts` loads the ZIP (or the
// JSON inside it) into a database.
import express from 'express';
import ExcelJS from 'exceljs';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { Database } from './db';
import { Store } from './store';
import { User } from '../../src/lib/stecsecure-types';
import { buildWorkbook } from '../../src/lib/excel-book';
import { backupSheets } from '../../src/lib/backup-sheets';

export const BACKUP_FORMAT = 'stecsecure-erp-backup';
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupRecord {
  collection: string;
  id: string;
  data: unknown;
  version: number;
  sortKey: number;
  deleted: boolean;
}

export interface BackupPhoto {
  id: string;
  mime: string;
  createdBy: string | null;
  createdAt: string;
  data: string; // base64
}

export interface BackupFile {
  format: string;
  formatVersion: number;
  createdAt: string;
  createdBy: { id: string; name: string };
  dataVersion: number;
  includesPhotos: boolean;
  records: BackupRecord[];
  meta: { key: string; value: unknown }[];
  photos: BackupPhoto[];
}

const asJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

// India time, for the file name the CEO sees
function stamp(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`;
}

// Photos a few at a time, so a large photo store never sits in memory at once. Returns how many.
async function writePhotos(db: Database, write: (text: string) => void): Promise<number> {
  let count = 0;
  let after = '';
  for (;;) {
    const { rows } = await db.query<{
      id: string;
      mime: string;
      created_by: string | null;
      created_at: string | Date;
      data: Buffer | Uint8Array;
    }>('SELECT id, mime, created_by, created_at, data FROM photos WHERE id > $1 ORDER BY id LIMIT 20', [after]);
    if (!rows.length) return count;
    for (const p of rows) {
      const photo: BackupPhoto = {
        id: p.id,
        mime: p.mime,
        createdBy: p.created_by,
        createdAt: new Date(p.created_at).toISOString(),
        data: Buffer.from(p.data).toString('base64'),
      };
      write(`${count ? ',' : ''}${JSON.stringify(photo)}`);
      count++;
    }
    after = rows[rows.length - 1].id;
  }
}

export function createBackupRouter(db: Database, store: Store) {
  const router = express.Router();

  router.use((_req, res, next) => {
    if ((res.locals.user as User).role !== 'CEO') {
      res.status(403).json({ error: 'Only the CEO can download backups.' });
      return;
    }
    next();
  });

  // What the Backups card shows: when the last copy was taken and how much there is
  router.get('/info', async (_req, res) => {
    const { rows: meta } = await db.query<{ value: unknown }>(`SELECT value FROM meta WHERE key = 'lastBackup'`);
    const { rows: counts } = await db.query<{ records: string; photos: string; photo_bytes: string | null }>(
      `SELECT (SELECT count(*) FROM records WHERE NOT deleted)::text AS records,
              (SELECT count(*) FROM photos)::text AS photos,
              (SELECT sum(length(data)) FROM photos)::text AS photo_bytes`
    );
    res.json({
      lastBackup: meta.length ? asJson(meta[0].value) : null,
      records: Number(counts[0].records),
      photos: Number(counts[0].photos),
      photoBytes: Number(counts[0].photo_bytes ?? 0),
    });
  });

  router.get('/', async (req, res) => {
    const user = res.locals.user as User;
    const includePhotos = req.query.photos !== '0';
    const now = new Date();

    // A consistent snapshot: no action commits while records and settings are read. Photos are only
    // ever added, and before the record that uses them, so reading them afterwards misses nothing.
    const snapshot = await store.exclusive(async () => {
      const { rows: records } = await db.query<{
        collection: string;
        id: string;
        data: unknown;
        version: string;
        sort_key: string;
        deleted: boolean;
      }>(
        'SELECT collection, id, data, version::text AS version, sort_key::text AS sort_key, deleted FROM records ORDER BY collection, sort_key'
      );
      const { rows: meta } = await db.query<{ key: string; value: unknown }>('SELECT key, value FROM meta');
      return { records, meta, dataVersion: store.version, state: store.state };
    });
    const records: BackupRecord[] = snapshot.records.map((r) => ({
      collection: r.collection,
      id: r.id,
      data: asJson(r.data),
      version: Number(r.version),
      sortKey: Number(r.sort_key),
      deleted: r.deleted,
    }));

    // The Excel copy is made before anything is sent, so a problem there is a clean error
    const xlsx = new Uint8Array(await buildWorkbook(ExcelJS, backupSheets(snapshot.state)).xlsx.writeBuffer());

    const baseName = `stecsecure-backup-${stamp(now)}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`);
    res.setHeader('Cache-Control', 'no-store');

    let photoCount = 0;
    try {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          console.error('[backup] could not build the ZIP', err);
          res.destroy(err);
          return;
        }
        res.write(chunk);
        if (final) res.end();
      });

      // 1. The readable copy (an .xlsx is already compressed)
      const excel = new ZipPassThrough(`${baseName}-readable.xlsx`);
      zip.add(excel);
      excel.push(xlsx, true);

      // 2. The full backup, streamed into the ZIP
      const json = new ZipDeflate(`${baseName}.json`, { level: 6 });
      zip.add(json);
      const write = (text: string) => json.push(strToU8(text));
      const header = {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        createdAt: now.toISOString(),
        createdBy: { id: user.id, name: user.name },
        dataVersion: snapshot.dataVersion,
        includesPhotos: includePhotos,
      };
      write(JSON.stringify(header).slice(0, -1));
      write(`,"records":${JSON.stringify(records)}`);
      write(`,"meta":${JSON.stringify(snapshot.meta.map((m) => ({ key: m.key, value: asJson(m.value) })))}`);
      write(',"photos":[');
      if (includePhotos) photoCount = await writePhotos(db, write);
      json.push(strToU8(']}'), true);
      zip.end();
    } catch (err) {
      // Headers are already sent — abort, so a partial file is never mistaken for a backup
      console.error('[backup] failed while sending', err);
      res.destroy(err as Error);
      return;
    }

    const lastBackup = {
      at: now.toISOString(),
      byUserId: user.id,
      byName: user.name,
      records: records.filter((r) => !r.deleted).length,
      photos: photoCount,
      includesPhotos: includePhotos,
    };
    await db
      .query(
        `INSERT INTO meta (key, value) VALUES ('lastBackup', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [JSON.stringify(lastBackup)]
      )
      .catch((err) => console.error('[backup] could not record the backup time', err));
    console.log(`[backup] ${user.name} downloaded ${records.length} records, ${photoCount} photos`);
  });

  return router;
}
