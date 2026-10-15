// Step 3: loads a backup file (Settings → Backups → Download backup) into a database.
//
//   npm run build && npm run restore -- <backup.json> [--replace]
//
// Uses DATABASE_URL like the server (the embedded database when it is not set). By default it only
// restores into an empty database; --replace first removes the current records, settings and photos.
// Staff whose PIN is already on this server keep it; set INITIAL_CEO_PIN to give the CEO a PIN when
// they have none, and the CEO then sets everyone else's PIN in Settings → Staff Accounts.
// Stop the app service before restoring and start it again afterwards — the running server keeps the
// data in memory and would not see the restore.
import fs from 'node:fs';
import { connectDatabase } from './db';
import { migrate } from './migrate';
import { hashPin, normalizePhone } from './store';
import { config } from './config';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BackupFile } from './backup';
import type { User } from '../../src/lib/stecsecure-types';

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const replace = args.includes('--replace');
  if (!file) {
    console.error('Usage: npm run restore -- <backup.json> [--replace]');
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(file, 'utf8')) as BackupFile;
  if (backup.format !== BACKUP_FORMAT || !Array.isArray(backup.records)) {
    throw new Error('This is not an S Tec Secure ERP backup file.');
  }
  if (backup.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error('This backup was made by a newer version of the app — update the app first.');
  }
  console.log(
    `[restore] backup of ${backup.createdAt} by ${backup.createdBy?.name}: ${backup.records.length} records, ${backup.photos.length} photos`
  );
  if (!backup.includesPhotos) console.warn('[restore] this backup was taken without photos — job photos will be missing');

  const db = await connectDatabase();
  console.log(`[restore] connected (${db.kind})`);
  await migrate(db);

  const { rows } = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM records');
  if (Number(rows[0].n) > 0 && !replace) {
    console.error('[restore] this database already has data. Run again with --replace to overwrite it.');
    await db.close();
    process.exit(1);
  }

  const users = backup.records
    .filter((r) => r.collection === 'users' && !r.deleted)
    .map((r) => r.data as User);
  const userIds = users.map((u) => u.id);

  await db.transaction(async (tx) => {
    if (replace) {
      await tx.query('DELETE FROM records');
      await tx.query('DELETE FROM meta');
      await tx.query('DELETE FROM photos');
    }
    // Everyone signs in again; logins of people not in the backup are removed
    await tx.query('DELETE FROM sessions');
    await tx.query('DELETE FROM credentials WHERE NOT (user_id = ANY($1::text[]))', [userIds]);

    for (const r of backup.records) {
      await tx.query(
        'INSERT INTO records (collection, id, data, version, sort_key, deleted) VALUES ($1, $2, $3, $4, $5, $6)',
        [r.collection, r.id, JSON.stringify(r.data), r.version, r.sortKey, r.deleted]
      );
    }
    for (const m of backup.meta) {
      await tx.query(
        'INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [m.key, JSON.stringify(m.value)]
      );
    }
    for (const p of backup.photos) {
      await tx.query(
        'INSERT INTO photos (id, mime, data, created_by, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [p.id, p.mime, Buffer.from(p.data, 'base64'), p.createdBy, p.createdAt]
      );
    }

    // The CEO needs a PIN to get in; everyone else gets theirs from the CEO
    const { rows: creds } = await tx.query<{ user_id: string }>('SELECT user_id FROM credentials');
    const hasLogin = new Set(creds.map((c) => c.user_id));
    const ceo = users.find((u) => u.role === 'CEO' && !hasLogin.has(u.id));
    const anyCeoCanLogIn = users.some((u) => u.role === 'CEO' && hasLogin.has(u.id));
    if (ceo && !anyCeoCanLogIn && /^\d{4}$/.test(config.initialCeo.pin)) {
      await tx.query('INSERT INTO credentials (user_id, phone, pin_hash) VALUES ($1, $2, $3)', [
        ceo.id,
        normalizePhone(ceo.phone),
        await hashPin(config.initialCeo.pin),
      ]);
      hasLogin.add(ceo.id);
      console.log(`[restore] CEO ${ceo.name} can log in with the PIN from INITIAL_CEO_PIN`);
    }
    const withoutLogin = users.filter((u) => !hasLogin.has(u.id));
    if (withoutLogin.length) {
      console.log(
        `[restore] no PIN on this server yet for: ${withoutLogin.map((u) => `${u.name} (${u.role})`).join(', ')}`
      );
    }
    if (!users.some((u) => u.role === 'CEO' && hasLogin.has(u.id))) {
      console.warn('[restore] no CEO can log in — set INITIAL_CEO_PIN and run the restore again with --replace');
    }
  });

  console.log('[restore] done — start (or restart) the app service now');
  await db.close();
}

main().catch((err) => {
  console.error('[restore] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
