# S Tec Secure ERP

Operations ERP for S Tec Secure, a CCTV / access control / gate & home automation installer in Erode, Tamil Nadu (GSTIN state code 33). Covers enquiries → service & installation jobs → quotations, delivery challans, invoices → OTP-verified job closure → payments, plus inventory with serial tracking, repair tickets, customers, technicians and reports.

## Commands

- `npm install` — install dependencies
- `npm run dev` — Vite dev server on http://localhost:3000 (config opens a browser; pass `-- --no-open` to skip)
- `npm run build` — `tsc -b` type check, then Vite production build into `dist/`
- No test runner or linter is configured yet. `npm run build` is the only automated check — run it after every change.

## Stack

React 19, TypeScript (strict), Vite 6, Tailwind CSS 4 (via `@tailwindcss/vite`, styles in `src/styles.css`), Radix UI primitives, lucide-react icons, sonner toasts, recharts, jspdf + html-to-image for PDFs. `@/` aliases `src/`.

## Architecture

- **No backend.** All data lives in one React context, `src/lib/stecsecure-context.tsx`, and is persisted as a single JSON blob in browser `localStorage` under `stecsecure_erp_v1`. Every device/browser has its own separate copy of the data.
- `getInitialState()` in the context loads that blob, falls back to demo data from `src/lib/seed-data.ts`, and applies ad-hoc migrations on every load.
- All business actions (create job, raise invoice, record payment, stock-in serials, repair transitions…) are functions on the context; pages and modals call them via `useStecSecure()`.
- Data models and company constants (`COMPANY_DETAILS`, bank details, `SERVICE_CATEGORIES`) are in `src/lib/stecsecure-types.ts`.
- **Navigation is not URL routing.** TanStack Router has a single `/` route; `src/router.tsx` (`AppLayout`) switches pages on a `currentSection` state (`NavSection` in `src/components/layout/AppShell.tsx`). Initial section can come from `?section=`.
- Pages live in `src/routes/*Page.tsx`; feature modals in `src/components/<feature>/`; shared primitives in `src/components/ui/`.

## Auth and roles

- Roles: `CEO`, `MANAGER` (together `isManagement`), `TECHNICIAN`.
- Login is a 4-digit PIN matched client-side against `users[].pin`. Logged-in user id is kept in `localStorage` key `stecsecure_erp_auth_user_id`; no stored id means logged out.
- **Demo mode** (`src/lib/demo-mode.ts`, `DEMO_MODE`): one-click persona logins, the header persona switcher, PIN hints and "Reset Demo" exist only in demo mode. It is on for `npm run dev` and off in production builds; force it with `VITE_DEMO_MODE=true|false`. Never expose PINs or PIN-less login outside demo mode.
- **Access control** (Phase 18): `accessControl` in state maps `MANAGER` / `TECHNICIAN` to the `AppSection`s they may open; the CEO always has everything and edits the matrix in Settings → Access Control. Gate pages with `canAccessSection()` (sidebar and `router.tsx` already do). New pages must be added to `APP_SECTIONS` in `stecsecure-types.ts`.
- Inside pages, management-only actions (editing quotations/invoices, creating challans, converting to invoices) check `isManagement`.
- Technicians only see jobs where they are in `assignedTeam` or are `teamLeadUserId` (`visibleJobs`), and repair tickets assigned to them (`visibleRepairTickets`). Always filter through these, not the raw `jobs` / `repairTickets` arrays, in technician-facing UI.

## Conventions

- Money is INR; format with `formatINR` and dates with `formatDate` / `formatDateTime` from `src/lib/utils.ts`.
- GST line items use the `LineItem` shape (`amount`, `cgst`, `sgst`, `total`). Hardware/material lines use the product's own `gstRate`; the job's GST choice applies only to the service line.
- Document numbers come from `nextDocNumber(prefix, existing)` in the context (max existing + 1, never array length). Prefixes use the financial-year start (`financialYearStart()` in `src/lib/numbering.ts`): `INV-2026-001`, `DC-`, `JOB-`, `ENQ-`, `RMA-`, quotations `A26001`.
- Store dates with `localDateISO()` (IST calendar date), never `toISOString().split('T')[0]` (UTC).
- An invoice records its source `quotationId` / `deliveryChallanId`; conversions must refuse to invoice the same source twice.
- One job is billed by one tax invoice (`findInvoiceForJob`). A job with a quotation (`getJobQuotation`) is invoiced at the quotation as agreed, plus usage beyond the quoted quantities and any extra labour; jobs without one bill labour + materials + products used.
- Photos go through `compressImageFile()` (`src/lib/image-utils.ts`) before being stored.
- Comments reference development phases ("Phase 13 Part B") — keep that style when extending a phase's feature.
- Update context state with functional `setErpState(prev => …)` updates; React StrictMode is on, so updaters must be pure.
