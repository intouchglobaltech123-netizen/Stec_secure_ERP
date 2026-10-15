// S Tec Secure ERP server: PostgreSQL-backed API + the built web app
import { config } from './config';
import { connectDatabase } from './db';
import { migrate } from './migrate';
import { Store } from './store';
import { createApp } from './app';

async function main() {
  const db = await connectDatabase();
  console.log(`[db] connected (${db.kind})`);
  await migrate(db);

  const store = new Store(db);
  await store.init();

  const server = createApp(db, store).listen(config.port, () => {
    console.log(`[server] listening on port ${config.port}`);
  });

  const shutdown = () => {
    console.log('[server] shutting down');
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
