// Server settings, all from environment variables (set them in Railway → service → Variables)
import path from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT) || 8080,
  isProduction: env.NODE_ENV === 'production',

  // Railway's Postgres plugin provides DATABASE_URL. Without it, an embedded Postgres (PGlite)
  // stores data in .data/pglite — for local development only.
  databaseUrl: env.DATABASE_URL || '',
  localDataDir: env.LOCAL_DATA_DIR || path.resolve(process.cwd(), '.data', 'pglite'),

  // First start on an empty database: load the demo data (true) or create only the CEO account (false)
  seedDemoData: env.SEED_DEMO_DATA === 'true',
  initialCeo: {
    name: env.INITIAL_CEO_NAME || 'CEO',
    phone: env.INITIAL_CEO_PHONE || '',
    pin: env.INITIAL_CEO_PIN || '',
  },

  // Built frontend served by this server in production
  staticDir: env.STATIC_DIR || path.resolve(process.cwd(), 'dist'),

  sessionDays: 30,
  // Wrong PINs before an account is locked, and for how long
  maxFailedLogins: 5,
  lockMinutes: 15,
};
