// Minimal database layer: node-postgres in production, embedded PGlite for local development.
// Both speak the same SQL, so the rest of the server only sees query() and transaction().
import fs from 'node:fs';
import pg from 'pg';
import { config } from './config';

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  // Several statements in one go, no parameters (migrations)
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: 'postgres' | 'pglite';
}

async function connectPostgres(url: string): Promise<Database> {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    // Railway's public proxy needs TLS; its private network does not
    ssl: /sslmode=require/.test(url) || process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  return {
    kind: 'postgres',
    query: (sql, params) => pool.query(sql, params as any[]) as Promise<any>,
    exec: async (sql) => {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (sql, params) => client.query(sql, params as any[]) as Promise<any>,
          exec: async (sql) => {
            await client.query(sql);
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function connectPglite(dir: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  const wrap = (q: { query: typeof db.query; exec: typeof db.exec }): Queryable => ({
    query: async (sql, params) => {
      const res = await q.query(sql, params as any[]);
      return { rows: res.rows as any[] };
    },
    exec: async (sql) => {
      await q.exec(sql);
    },
  });
  const root = wrap(db);
  return {
    kind: 'pglite',
    query: root.query,
    exec: root.exec,
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx as any))),
    close: () => db.close(),
  };
}

export async function connectDatabase(): Promise<Database> {
  if (config.databaseUrl) return connectPostgres(config.databaseUrl);
  if (config.isProduction) {
    throw new Error('DATABASE_URL is not set. Add a PostgreSQL database to the Railway project.');
  }
  return connectPglite(config.localDataDir);
}
