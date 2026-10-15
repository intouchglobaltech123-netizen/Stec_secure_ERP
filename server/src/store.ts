// The authoritative ERP state. Loaded from Postgres at start, kept in memory, and changed only by
// running shared actions one at a time; each change is saved in one transaction before it is visible.
// Run a single server instance (Railway replicas = 1) — the in-memory state is not shared.
import bcrypt from 'bcryptjs';
import { Database, Queryable } from './db';
import { config } from './config';
import { ErpState, getSeedState, makeEnv, normalizeSavedState } from '../../src/lib/erp/core';
import { ACTIONS, ActionName } from '../../src/lib/erp/actions';
import { User } from '../../src/lib/stecsecure-types';

type CollectionName = Exclude<keyof ErpState, 'accessControl'>;
type AnyRecord = { id: string };

export const COLLECTIONS: CollectionName[] = [
  'users',
  'customers',
  'vendors',
  'products',
  'serialUnits',
  'jobs',
  'workLogs',
  'holdEvents',
  'materialUsages',
  'quotations',
  'invoices',
  'deliveryChallans',
  'payments',
  'otpVerifications',
  'enquiries',
  'jobProductUsages',
  'repairTickets',
];

export interface StateChanges {
  upserts: Partial<Record<CollectionName, AnyRecord[]>>;
  deletes: Partial<Record<CollectionName, string[]>>;
  accessControl?: ErpState['accessControl'];
}

// Records whose object changed (actions copy what they modify) and ids that disappeared
export function diffStates(prev: ErpState, next: ErpState): StateChanges {
  const changes: StateChanges = { upserts: {}, deletes: {} };
  for (const c of COLLECTIONS) {
    const before = prev[c] as AnyRecord[];
    const after = next[c] as AnyRecord[];
    if (before === after) continue;
    const beforeById = new Map(before.map((r) => [r.id, r]));
    const afterIds = new Set(after.map((r) => r.id));
    const upserts = after.filter((r) => beforeById.get(r.id) !== r);
    const deletes = before.filter((r) => !afterIds.has(r.id)).map((r) => r.id);
    if (upserts.length) changes.upserts[c] = upserts;
    if (deletes.length) changes.deletes[c] = deletes;
  }
  if (prev.accessControl !== next.accessControl) changes.accessControl = next.accessControl;
  return changes;
}

// User records never carry PINs on the server; credentials live in their own table
const stripPin = (u: User): User => {
  const { pin: _pin, ...rest } = u;
  return rest;
};

export const hashPin = (pin: string) => bcrypt.hash(pin, 10);

export class Store {
  state!: ErpState;
  version = 0;
  private sortKey = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private db: Database) {}

  async init(): Promise<void> {
    const { rows: countRows } = await this.db.query<{ n: string }>('SELECT count(*)::text AS n FROM records');
    if (Number(countRows[0].n) === 0) await this.bootstrap();
    await this.load();
  }

  // First start on an empty database
  private async bootstrap(): Promise<void> {
    if (config.seedDemoData) {
      const seed = getSeedState();
      await this.db.transaction(async (tx) => {
        await this.writeAll(tx, { ...seed, users: seed.users.map(stripPin) });
        for (const u of seed.users) {
          if (u.pin) await this.insertCredential(tx, u.id, u.phone, u.pin);
        }
      });
      console.log('[store] empty database — loaded demo data');
      return;
    }

    const { name, phone, pin } = config.initialCeo;
    const empty: ErpState = normalizeSavedState({}, { browserLegacyFixes: false });
    if (!phone || !/^\d{4}$/.test(pin)) {
      console.error(
        '[store] empty database and no INITIAL_CEO_PHONE / INITIAL_CEO_PIN (4 digits) set — nobody can log in yet.'
      );
      await this.db.transaction((tx) => this.writeAll(tx, empty));
      return;
    }
    const ceo: User = { id: 'usr-ceo', name, role: 'CEO', phone: normalizePhone(phone) };
    await this.db.transaction(async (tx) => {
      await this.writeAll(tx, { ...empty, users: [ceo] });
      await this.insertCredential(tx, ceo.id, ceo.phone, pin);
    });
    console.log(`[store] empty database — created CEO account for ${ceo.phone}`);
  }

  private async insertCredential(tx: Queryable, userId: string, phone: string, pin: string) {
    await tx.query('INSERT INTO credentials (user_id, phone, pin_hash) VALUES ($1, $2, $3)', [
      userId,
      normalizePhone(phone),
      await hashPin(pin),
    ]);
  }

  private async writeAll(tx: Queryable, state: ErpState) {
    this.version = 1;
    for (const c of COLLECTIONS) {
      const list = state[c] as AnyRecord[];
      // Lists are newest-first: the first record gets the highest sort key
      for (let i = list.length - 1; i >= 0; i--) {
        await tx.query(
          'INSERT INTO records (collection, id, data, version, sort_key) VALUES ($1, $2, $3, $4, $5)',
          [c, list[i].id, JSON.stringify(list[i]), this.version, ++this.sortKey]
        );
      }
    }
    await tx.query(
      `INSERT INTO meta (key, value) VALUES ('accessControl', $1), ('version', $2)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [JSON.stringify(state.accessControl), JSON.stringify(this.version)]
    );
  }

  private async load(): Promise<void> {
    const { rows } = await this.db.query<{ collection: string; data: AnyRecord; sort_key: string }>(
      'SELECT collection, data, sort_key::text AS sort_key FROM records WHERE NOT deleted ORDER BY sort_key DESC'
    );
    const raw: Record<string, AnyRecord[]> = {};
    for (const c of COLLECTIONS) raw[c] = [];
    for (const r of rows) raw[r.collection]?.push(typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
    // The staff list reads oldest-first (new staff are appended); every other list is newest-first
    raw.users.reverse();

    const { rows: meta } = await this.db.query<{ key: string; value: any }>('SELECT key, value FROM meta');
    const metaMap = new Map(meta.map((m) => [m.key, typeof m.value === 'string' ? JSON.parse(m.value) : m.value]));
    const { rows: maxRows } = await this.db.query<{ m: string | null }>(
      'SELECT max(sort_key)::text AS m FROM records'
    );

    this.state = normalizeSavedState(
      { ...raw, accessControl: metaMap.get('accessControl') },
      { browserLegacyFixes: false }
    );
    this.version = Number(metaMap.get('version') ?? 1);
    this.sortKey = Number(maxRows[0].m ?? 0);
    console.log(`[store] loaded ${rows.length} records, version ${this.version}`);
  }

  // Changes are applied strictly one after another
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // Applies a state transition and saves the changed records; the in-memory state only moves
  // forward once the database has committed
  commit(mutate: (state: ErpState) => ErpState, extra?: (tx: Queryable) => Promise<void>) {
    return this.serialize(async () => {
      const prev = this.state;
      const next = mutate(prev);
      const changes = diffStates(prev, next);
      const version = this.version + 1;
      let sortKey = this.sortKey;

      await this.db.transaction(async (tx) => {
        for (const [c, list] of Object.entries(changes.upserts) as [CollectionName, AnyRecord[]][]) {
          const existing = new Set((prev[c] as AnyRecord[]).map((r) => r.id));
          // New records are prepended newest-first, so give later array positions lower keys
          const fresh = list.filter((r) => !existing.has(r.id)).reverse();
          const keys = new Map(fresh.map((r) => [r.id, ++sortKey]));
          for (const r of list) {
            await tx.query(
              `INSERT INTO records (collection, id, data, version, sort_key) VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (collection, id) DO UPDATE
                 SET data = excluded.data, version = excluded.version, deleted = false, updated_at = now()`,
              [c, r.id, JSON.stringify(r), version, keys.get(r.id) ?? ++sortKey]
            );
          }
        }
        for (const [c, ids] of Object.entries(changes.deletes) as [CollectionName, string[]][]) {
          for (const id of ids) {
            await tx.query(
              'UPDATE records SET deleted = true, version = $3, updated_at = now() WHERE collection = $1 AND id = $2',
              [c, id, version]
            );
          }
        }
        if (changes.accessControl) {
          await tx.query(`UPDATE meta SET value = $1 WHERE key = 'accessControl'`, [
            JSON.stringify(changes.accessControl),
          ]);
        }
        await tx.query(`UPDATE meta SET value = $1 WHERE key = 'version'`, [JSON.stringify(version)]);
        if (extra) await extra(tx);
      });

      this.state = next;
      this.version = version;
      this.sortKey = sortKey;
      return { prev, next, changes, version };
    });
  }

  // Runs one shared business action as `actor`. `guard` sees the exact state the action will run on
  // and returns a reason to refuse. Errors thrown by the action (business rules) propagate unchanged
  // and nothing is saved.
  async runAction(name: ActionName, args: unknown, actor: User, guard?: (state: ErpState) => string | null) {
    let result: unknown;
    const outcome = await this.commit((state) => {
      const refusal = guard?.(state);
      if (refusal) throw new PermissionError(refusal);
      const action = ACTIONS[name] as unknown as (
        s: ErpState,
        env: ReturnType<typeof makeEnv>,
        a: unknown
      ) => { state: ErpState; result: unknown };
      const out = action(state, makeEnv(actor), args);
      result = out.result;
      return out.state;
    });
    return { result, ...outcome };
  }
}

export class PermissionError extends Error {
  name = 'PermissionError';
}

// Indian mobile numbers are stored as their last 10 digits (+91 / 0 prefixes removed)
export function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}
