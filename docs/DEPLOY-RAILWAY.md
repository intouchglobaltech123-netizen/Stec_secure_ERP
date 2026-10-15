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

Railway PostgreSQL → **Backups** tab: turn on scheduled backups. (Available on paid plans.)

## Something wrong?

- App service → **Deployments → View logs**: the server logs `[store] loaded … records` and `listening on port …`
  when it starts correctly.
- `[store] empty database and no INITIAL_CEO_PHONE / INITIAL_CEO_PIN` means step 3 was missed — add the variables
  and redeploy, then nobody is locked out.
