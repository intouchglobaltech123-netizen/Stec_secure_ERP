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
- **Backups** (Step 3): `GET /api/admin/backup` (CEO) streams every `records` row, `meta` and photos — never `credentials` or `sessions` — and records `meta.lastBackup`; `Settings → Backups` (`BackupCard`). `npm run restore -- <file> [--replace]` (`server/src/restore.ts`, built to `server-dist/restore.js`) loads one into a database; see docs/DEPLOY-RAILWAY.md. A new collection needs no backup change, but new tables must be added to both files.

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
- GST line items use the `LineItem` shape (`amount`, `cgst`, `sgst`, `igst`, `total`). Hardware/material lines use the product's own `gstRate`; the job's GST choice applies only to the service line.
- **GST rules** (Step 3, `src/lib/gst.ts`): place of supply = the customer's state (`customerStateCode()`: valid GSTIN prefix, else `customer.stateCode`, else `33`). Tamil Nadu (33) → CGST + SGST; any other state → IGST. Every invoice/quotation create or update path must end in `finalizeInvoiceTax()` / `finalizeQuotationTax()` (core) — the server recomputes tax and totals, so client-sent totals are ignored. Invoices snapshot `billTo` and `placeOfSupply`. `updateInvoice` cannot touch payments and refuses a total below the amount received (credit note instead). GSTINs are checked with `isValidGstin()` (check digit) in the customer actions. The printable invoice is `TaxInvoiceDocument` (`#printable-invoice-doc`).
- **Invoice corrections** (Step 3, `actions/invoiceCorrections.ts`, helpers in `src/lib/invoice-status.ts`): an issued invoice is never deleted or renumbered. `cancelInvoice` (reason required; refused once money other than pre-invoice advances was received, or after a credit note) sets `status: 'CANCELLED'`, returns advances to their quotation/job, reopens the quotation, and can re-issue the bill under a new number (`replacesInvoiceId` / `replacedByInvoiceId`). `createCreditNote` (`CN-<FY>-###`) credits invoice lines (capped per line), keeps the invoice's place of supply, and adds to `invoice.creditNoteTotal`; `recordCreditNoteRefund` records a negative `REFUND` payment (`RFD-<FY>-###`). Use `liveInvoices()` for "already invoiced" checks, `invoiceNetTotal()` for billed amounts and `invoiceBalanceDue()` for balances — never raw `grandTotal`.
- JSON drops `undefined`, so an update that must clear a field sends `''` (see `updateCustomer`).
- Document numbers come from `nextDocNumber(prefix, existing)` in `src/lib/numbering.ts` (max existing + 1, never array length). Prefixes use the financial-year start (`financialYearStart()` in `src/lib/numbering.ts`): `INV-2026-001`, `DC-`, `JOB-`, `ENQ-`, `RMA-`, quotations `A26001`.
- Store dates with `env.today` / `localDateISO()` (India calendar date via `Asia/Kolkata`, correct even on a UTC server), never `toISOString().split('T')[0]` (UTC).
- An invoice records its source `quotationId` / `deliveryChallanId`; conversions must refuse to invoice the same source twice.
- One job is billed by one tax invoice (`findInvoiceForJob`). A job with a quotation (`getJobQuotation`) is invoiced at the quotation as agreed, plus usage beyond the quoted quantities and any extra labour; jobs without one bill labour + materials + products used.
- Photos go through `compressImageFile()` (`src/lib/image-utils.ts`) before being stored.
- **Advances** (Phase 22): `recordAdvance` stores a payment with no `invoiceId`, linked to a `quotationId` / `jobId`; `applyAdvancesToInvoice()` moves them onto the invoice whenever one is raised for that quotation/job. Every payment gets a sequential `receiptNo` (`RCPT-<FY>-###`); `referenceNo` is the customer's UTR/cheque.
- **Quotation status** (Phase 22): Draft → Sent → Accepted / Rejected / Lost → `CONVERTED` (shown as **Invoiced**, set only by raising the invoice). Use `quotationStatusMeta()` (`src/lib/quotation-status.ts`) for labels/colours. Invoiced quotations are locked (`findInvoiceForQuotation`).
- **Jobs** (Phase 22): `editJob` (details, team, lead, schedule, site contact), `cancelJob` (status `CANCELLED` + reason, releases allocated stock, refused once invoiced), `removeJobProductUsage` (before completion). Prefer cancel over delete.
- **Challan stock** (Phase 22): challan lines carry `productId` and `serialUnitIds`; `applyChallanSerials()` takes picked units out of stock (allocated to the challan's job, or delivered to the customer when there is no job) and returns removed ones on edit.
- **Notifications** (Phase 22): add them inside actions with `withNotification(state, env, recipientIds, {...})` (never notifies the actor; `managementIds()` for CEO/managers). The server sends each user only notifications addressed to them; `NotificationBell` shows them.
- Comments reference development phases ("Phase 13 Part B") — keep that style when extending a phase's feature.
- Never set ERP state directly from components; go through an action. React StrictMode is on, so actions must stay pure.
