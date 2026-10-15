# S Tec Secure ERP

Operations ERP for S Tec Secure, a CCTV / access control / gate & home automation installer in Erode, Tamil Nadu (GSTIN state code 33). Covers enquiries → service & installation jobs → quotations, delivery challans, invoices → OTP-verified job closure → payments, plus inventory with serial tracking, repair tickets, customers, technicians and reports.

## Commands

- `npm install` — install dependencies
- `npm run dev:server` + `npm run dev` — run both for development: API on :8080 (embedded database with demo data), app on http://localhost:3000 (proxies `/api`; config opens a browser, pass `-- --no-open` to skip)
- `npm run build` — type-checks app and server, builds the app into `dist/` and the server into `server-dist/`
- `npm start` — production server (API + built app)
- No test runner or linter is configured yet. `npm run build` is the only automated check — run it after every change.

## Stack

React 19, TypeScript (strict), Vite 6, Tailwind CSS 4 (via `@tailwindcss/vite`, styles in `src/styles.css`), Radix UI primitives, lucide-react icons, sonner toasts, recharts, jspdf + html-to-image for PDFs. `@/` aliases `src/`.

## Architecture

- **The server is the source of truth** (Phase 21). The React context `src/lib/stecsecure-context.tsx` restores the session (`/api/auth/me`), loads the user's scoped data (`/api/state`), polls every 15 s and on focus for other people's changes, and sends every action to `POST /api/actions/:name`, merging the changed records from the reply. Nothing is stored in `localStorage`.
- **Every context action returns a Promise and may reject with a user-facing message.** Call sites must `await` it inside `try/catch` with `toast.error(errorMessage(err))` (`src/lib/api.ts`), run success toasts / modal closes after the await, use the action's **return value** (lists from the context update only after re-render), and disable the submit button while waiting.
- **Business rules live in `src/lib/erp/`** (Phase 20) and run on the server:
  - `core.ts` — `ErpState`, `ActionEnv` (actor, time, India date, financial year, id generator), seed/normalize of saved state, and shared helpers (`invoiceTotals`, `makeLineItem`, `getJobQuotation`, `findInvoiceForJob`, `isPhysicalLineItem`).
  - `actions/*.ts` — every business action as a **pure function** `(state, env, args) => { state, result }`, registered by name in `actions/index.ts` (`ACTIONS`). No React, no `localStorage`, no `Date.now()`/`new Date()` for business values — use `env`.
  - To add an action: write it in `actions/`, register it in `ACTIONS`, add a permission rule in `server/src/permissions.ts`, and add its signature and `run(...)` wrapper in the context.
- Data models and company constants (`COMPANY_DETAILS`, bank details, `SERVICE_CATEGORIES`) are in `src/lib/stecsecure-types.ts`.
- **Navigation is not URL routing.** TanStack Router has a single `/` route; `src/router.tsx` (`AppLayout`) switches pages on a `currentSection` state (`NavSection` in `src/components/layout/AppShell.tsx`). Initial section can come from `?section=`.
- Pages live in `src/routes/*Page.tsx`; feature modals in `src/components/<feature>/`; shared primitives in `src/components/ui/`.

## Server (`server/`)

- Node + Express 5 + PostgreSQL. `server/src/index.ts` boots: connect (`db.ts`) → migrate (`migrate.ts`) → load state (`store.ts`) → HTTP (`app.ts`).
- Without `DATABASE_URL` it uses an embedded PGlite database in `.data/pglite` (local development only). On an empty database it loads demo data when `SEED_DEMO_DATA=true`, otherwise creates the CEO from `INITIAL_CEO_NAME` / `INITIAL_CEO_PHONE` / `INITIAL_CEO_PIN`.
- Every record is a JSONB row in `records` (collection, id, version, sort_key). `Store` keeps the full `ErpState` in memory and runs the shared `ACTIONS` one at a time; each change is saved in one transaction before it becomes visible. **Run exactly one server instance.** Add schema changes as new entries at the end of `MIGRATIONS`.
- API: `POST /api/auth/login {phone, pin}` (bcrypt, 5 wrong PINs → 15-minute lock, httpOnly session cookie), `/api/auth/me|logout|change-pin`, `GET /api/state[?since=version]` (204 when unchanged), `POST /api/actions/:name {args}`, `/api/admin/users` (CEO only), `/api/photos/:id`.
- `permissions.ts` decides who may run each action; `scope.ts` decides what each user receives (technicians: own jobs and related records, no purchase costs). Any new action needs a rule in `permissions.ts`.
- Photos sent as `data:` URLs in action args are stored in the `photos` table and replaced by `/api/photos/<id>` links.
- Dev: `npm run dev:server` (port 8080) with `npm run dev` (Vite proxies `/api`). Production: `npm run build` then `npm start` (serves `dist/` too).
- `npx tsc -p server/tsconfig.json` type-checks the server (part of `npm run build`).

## Auth and roles

- Roles: `CEO`, `MANAGER` (together `isManagement`), `TECHNICIAN`.
- Login is mobile number + 4-digit PIN, checked by the server; PINs are bcrypt-hashed in the `credentials` table and never sent to the browser. The CEO manages staff in Settings → Staff Accounts (`StaffAccountsCard`); anyone can change their own PIN from the header menu.
- **Demo mode** (`src/lib/demo-mode.ts`, `DEMO_MODE`) only adds the demo-account shortcuts (phones + PINs from `src/lib/demo-accounts.ts`) to the login screen. It is on for `npm run dev` and off in production builds (the shortcuts are compiled out); force it with `VITE_DEMO_MODE=true|false`.
- **Access control** (Phase 18): `accessControl` in state maps `MANAGER` / `TECHNICIAN` to the `AppSection`s they may open; the CEO always has everything and edits the matrix in Settings → Access Control. Gate pages with `canAccessSection()` (sidebar and `router.tsx` already do). New pages must be added to `APP_SECTIONS` in `stecsecure-types.ts`.
- Inside pages, management-only actions (editing quotations/invoices, creating challans, converting to invoices) check `isManagement`.
- Technicians only see jobs where they are in `assignedTeam` or are `teamLeadUserId` (`visibleJobs`), and repair tickets assigned to them or repaired by them (`visibleRepairTickets`). The server already scopes what a technician receives (`server/src/scope.ts`); still filter through these in technician-facing UI.
- UI checks are convenience only — the server enforces every permission (`server/src/permissions.ts`).

## Conventions

- Money is INR; format with `formatINR` and dates with `formatDate` / `formatDateTime` from `src/lib/utils.ts`.
- GST line items use the `LineItem` shape (`amount`, `cgst`, `sgst`, `total`). Hardware/material lines use the product's own `gstRate`; the job's GST choice applies only to the service line.
- Document numbers come from `nextDocNumber(prefix, existing)` in `src/lib/numbering.ts` (max existing + 1, never array length). Prefixes use the financial-year start (`financialYearStart()` in `src/lib/numbering.ts`): `INV-2026-001`, `DC-`, `JOB-`, `ENQ-`, `RMA-`, quotations `A26001`.
- Store dates with `env.today` / `localDateISO()` (India calendar date via `Asia/Kolkata`, correct even on a UTC server), never `toISOString().split('T')[0]` (UTC).
- An invoice records its source `quotationId` / `deliveryChallanId`; conversions must refuse to invoice the same source twice.
- One job is billed by one tax invoice (`findInvoiceForJob`). A job with a quotation (`getJobQuotation`) is invoiced at the quotation as agreed, plus usage beyond the quoted quantities and any extra labour; jobs without one bill labour + materials + products used.
- Photos go through `compressImageFile()` (`src/lib/image-utils.ts`) before being stored.
- Comments reference development phases ("Phase 13 Part B") — keep that style when extending a phase's feature.
- Never set ERP state directly from components; go through an action. React StrictMode is on, so actions must stay pure.
