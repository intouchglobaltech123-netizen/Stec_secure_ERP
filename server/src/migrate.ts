// Schema migrations, applied in order on every start. Never edit a migration that has shipped —
// add a new one at the end.
import { Database } from './db';

const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '001_initial',
    sql: `
      -- Every ERP record (job, invoice, customer…) as a JSON document, versioned for sync
      CREATE TABLE records (
        collection  text        NOT NULL,
        id          text        NOT NULL,
        data        jsonb       NOT NULL,
        version     bigint      NOT NULL,
        sort_key    bigint      NOT NULL, -- newest first, matching the order lists are shown in
        deleted     boolean     NOT NULL DEFAULT false,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX records_version_idx ON records (version);

      -- Safety net: document numbers can never repeat, whatever the application does
      CREATE UNIQUE INDEX records_invoice_no_uq ON records ((data->>'invoiceNo'))
        WHERE collection = 'invoices' AND NOT deleted;
      CREATE UNIQUE INDEX records_challan_no_uq ON records ((data->>'challanNo'))
        WHERE collection = 'deliveryChallans' AND NOT deleted;
      CREATE UNIQUE INDEX records_quotation_no_uq ON records ((data->>'quotationNo'))
        WHERE collection = 'quotations' AND NOT deleted;

      -- Settings and counters (global data version, access control)
      CREATE TABLE meta (
        key   text PRIMARY KEY,
        value jsonb NOT NULL
      );

      -- Login: phone + hashed PIN, kept apart from the user records that are sent to browsers
      CREATE TABLE credentials (
        user_id          text PRIMARY KEY,
        phone            text NOT NULL UNIQUE,
        pin_hash         text NOT NULL,
        active           boolean NOT NULL DEFAULT true,
        failed_attempts  integer NOT NULL DEFAULT 0,
        locked_until     timestamptz,
        updated_at       timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE sessions (
        token_hash    text PRIMARY KEY,
        user_id       text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        expires_at    timestamptz NOT NULL,
        last_seen_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX sessions_user_idx ON sessions (user_id);

      -- Job photos, stored once and referenced by URL from records
      CREATE TABLE photos (
        id          text PRIMARY KEY,
        mime        text NOT NULL,
        data        bytea NOT NULL,
        created_by  text,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
];

export async function migrate(db: Database): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query<{ id: string }>('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.id));

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    });
    console.log(`[db] applied migration ${m.id}`);
  }
}
