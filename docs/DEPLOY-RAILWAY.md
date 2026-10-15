# Putting the ERP online on Railway

The app is one Railway service (web server + the built app) plus one PostgreSQL database.
`railway.json` in this repository already tells Railway how to build (`npm run build`),
start (`npm start`) and health-check (`/api/health`) it.

Never paste passwords, PINs or tokens into chat — type them only into Railway's **Variables** screen.

## One-time setup (about 10 minutes)

1. **Create the project.** In Railway: **New Project → Deploy from GitHub repo** → choose
   `Stec_secure_ERP`. If asked, allow Railway to access the repository.
2. **Add the database.** In the project canvas: **+ Create → Database → PostgreSQL**.
3. **Set the variables.** Click the app service (not the database) → **Variables** → add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (pick it from the reference list) |
   | `INITIAL_CEO_NAME` | The CEO's name, e.g. `Santhosh` |
   | `INITIAL_CEO_PHONE` | The CEO's 10-digit mobile number (used to log in) |
   | `INITIAL_CEO_PIN` | A 4-digit PIN for the CEO's first login (change it after logging in) |
   | `SEED_DEMO_DATA` | Optional. `true` loads the demo data instead, for a trial run. Leave it out for real use. |

   The `INITIAL_CEO_*` values are used once, when the database is empty. After that, staff are managed in
   the app under **Settings → Staff Accounts**.
4. **Region.** App service → **Settings → Deploy → Regions**: choose the Asia (Singapore) region, closest to Erode.
   Keep **one** replica — the server must run as a single instance.
5. **Public link.** App service → **Settings → Networking → Generate Domain**. Railway gives a link like
   `https://stec-secure-erp-production.up.railway.app`. Share that with staff.
6. **Deploy.** Railway deploys automatically. When the deployment shows **Active**, open the link and log in
   with the CEO's mobile number and PIN, then:
   - Settings → Staff Accounts: add each manager and technician with their mobile number and a PIN.
   - Settings → Access Control: choose which pages managers and technicians can open.
   - Header menu → Change PIN: replace the initial CEO PIN.

## Every update after that

Every push to the `main` branch on GitHub redeploys automatically. Data stays in the PostgreSQL database.

## Backups

**Download (CEO, weekly):** Settings → **Backups** → **Download backup**. The file holds every record, the
settings and the job photos — not staff PINs. Keep copies outside Railway (laptop, Google Drive). The card turns
amber when the last download is more than 7 days old.

Optional extra: Railway PostgreSQL → **Backups** tab → scheduled daily / weekly / monthly snapshots (kept 6 / 27 /
89 days). These live inside the same Railway project, so they do not replace the downloaded copies.

### Restoring a downloaded backup

The backup download is a ZIP: the backup itself (`.json`) and a readable Excel copy (`-readable.xlsx`). The
restore script loads the ZIP (or the `.json` taken out of it) into a database. It refuses a database that already
has data unless `--replace` is given.

1. **Stop the app service** (Railway → app service → **⋮ → Remove** the active deployment, or `railway down`).
   The running server keeps the data in memory and would not see the restore.
2. On a computer with this repository: `npm install && npm run build`.
3. Point the script at the database — copy `DATABASE_PUBLIC_URL` from Railway PostgreSQL → **Variables**:

   ```bash
   DATABASE_URL="<DATABASE_PUBLIC_URL>" PGSSL=true INITIAL_CEO_PIN=<new 4-digit PIN> npm run restore -- stecsecure-backup-2026-10-15-1121.zip --replace
   ```

   `INITIAL_CEO_PIN` is only used when the CEO has no PIN on that database (a brand-new database). Staff whose
   PIN is still on the server keep it; the script lists everyone else.
4. **Redeploy the app service.** Log in as the CEO and set the listed staff members' PINs in Settings → Staff
   Accounts → **Reset PIN**.

## Something wrong?

- App service → **Deployments → View logs**: the server logs `[store] loaded … records` and `listening on port …`
  when it starts correctly.
- `[store] empty database and no INITIAL_CEO_PHONE / INITIAL_CEO_PIN` means step 3 was missed — add the variables
  and redeploy, then nobody is locked out.
