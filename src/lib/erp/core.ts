// Phase 20: shared ERP core — the state shape, action contract and helpers used by every business action.
// Actions are pure functions (state in → new state out), so the same rules run in the browser today
// and on the server in step 2.
import {
  User,
  Customer,
  Vendor,
  Product,
  SerialUnit,
  Job,
  WorkLog,
  HoldEvent,
  MaterialUsage,
  Quotation,
  Invoice,
  DeliveryChallan,
  Payment,
  OTPVerification,
  Enquiry,
  JobProductUsage,
  RepairTicket,
  LineItem,
  AccessControl,
  DEFAULT_ACCESS_CONTROL,
} from '../stecsecure-types';
import {
  SEED_USERS,
  SEED_CUSTOMERS,
  SEED_VENDORS,
  SEED_PRODUCTS,
  SEED_SERIAL_UNITS,
  SEED_JOBS,
  SEED_WORK_LOGS,
  SEED_HOLD_EVENTS,
  SEED_MATERIAL_USAGES,
  SEED_QUOTATIONS,
  SEED_INVOICES,
  SEED_DELIVERY_CHALLANS,
  SEED_PAYMENTS,
  SEED_OTP_VERIFICATIONS,
  SEED_ENQUIRIES,
  SEED_JOB_PRODUCT_USAGES,
  SEED_REPAIR_TICKETS,
  CANARA_BANK_DETAILS,
} from '../seed-data';
import { financialYearStart, localDateISO } from '../numbering';

export interface ErpState {
  users: User[];
  customers: Customer[];
  vendors: Vendor[];
  products: Product[];
  serialUnits: SerialUnit[];
  jobs: Job[];
  workLogs: WorkLog[];
  holdEvents: HoldEvent[];
  materialUsages: MaterialUsage[];
  quotations: Quotation[];
  invoices: Invoice[];
  deliveryChallans: DeliveryChallan[];
  payments: Payment[];
  otpVerifications: OTPVerification[];
  enquiries: Enquiry[];
  jobProductUsages: JobProductUsage[];
  repairTickets: RepairTicket[];
  accessControl: AccessControl;
}

// Everything an action may depend on besides the state: who is acting and when
export interface ActionEnv {
  actor: User | null;
  now: Date;
  nowIso: string; // timestamp for createdAt / timeline fields
  today: string; // India calendar date, YYYY-MM-DD, for document dates
  fy: number; // financial-year start year, for document number prefixes
  newId: (prefix: string) => string;
}

export type ActionResult<R> = { state: ErpState; result: R };
export type Action<A, R> = (state: ErpState, env: ActionEnv, args: A) => ActionResult<R>;

export const done = <R>(state: ErpState, result: R): ActionResult<R> => ({ state, result });

// Ids are PREFIX-<millis>; a monotonic stamp keeps ids created in the same millisecond unique
let lastStamp = 0;
const uniqueStamp = () => {
  const t = Date.now();
  lastStamp = t > lastStamp ? t : lastStamp + 1;
  return lastStamp;
};

export function makeEnv(actor: User | null, now: Date = new Date()): ActionEnv {
  return {
    actor,
    now,
    nowIso: now.toISOString(),
    today: localDateISO(now),
    fy: financialYearStart(now),
    newId: (prefix) => `${prefix}-${uniqueStamp()}`,
  };
}

// Replace one record by id
export const updateById = <T extends { id: string }>(list: T[], id: string, fn: (item: T) => T): T[] =>
  list.map((item) => (item.id === id ? fn(item) : item));

// Totals for a set of GST line items, rounded to the rupee with a round-off line
// (sums are rounded to paise first, so float drift like 7144.4999 can't flip the rupee rounding)
export function invoiceTotals(lineItems: LineItem[]) {
  const sum = (pick: (item: LineItem) => number) =>
    Number(lineItems.reduce((acc, item) => acc + pick(item), 0).toFixed(2));
  const totalAmount = sum((item) => item.amount);
  const totalCgst = sum((item) => item.cgst);
  const totalSgst = sum((item) => item.sgst);
  const rawTotal = Number((totalAmount + totalCgst + totalSgst).toFixed(2));
  const grandTotal = Math.round(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));
  return { totalAmount, totalCgst, totalSgst, grandTotal, roundOff };
}

export function makeLineItem(
  itemName: string,
  description: string,
  hsnSac: string,
  gstRate: number,
  qty: number,
  rate: number
): LineItem {
  const amount = Number((qty * rate).toFixed(2));
  const cgst = Number((amount * (gstRate / 200)).toFixed(2));
  const sgst = Number((amount * (gstRate / 200)).toFixed(2));
  return {
    itemName,
    description,
    hsnSac,
    gstRate,
    qty,
    rate,
    amount,
    cgst,
    sgst,
    total: Number((amount + cgst + sgst).toFixed(2)),
  };
}

// job.quotationId may hold the quotation id or its A-number
export const resolveQuotationId = (s: ErpState, ref?: string) =>
  ref ? s.quotations.find((q) => q.id === ref || q.quotationNo === ref)?.id : undefined;

export const getJobQuotation = (s: ErpState, job: Job) => {
  const quotationId = resolveQuotationId(s, job.quotationId);
  return quotationId ? s.quotations.find((q) => q.id === quotationId) : undefined;
};

// One job is billed by one tax invoice — whichever path (completion, quotation, challan) raises it first
export const findInvoiceForJob = (s: ErpState, job: Job) => {
  const quotationId = resolveQuotationId(s, job.quotationId);
  return s.invoices.find(
    (i) => i.linkedJobId === job.id || (quotationId !== undefined && i.quotationId === quotationId)
  );
};

// Phase 22: advances taken against a quotation or job that are not yet on an invoice
export const unappliedAdvances = (s: ErpState, ref: { quotationId?: string; jobId?: string }) =>
  s.payments.filter(
    (p) =>
      !p.invoiceId &&
      ((ref.quotationId && p.quotationId === ref.quotationId) || (ref.jobId && p.jobId === ref.jobId))
  );

// Moves matching advances onto a newly raised invoice: links the payments and counts them as paid
export function applyAdvancesToInvoice(s: ErpState, invoiceId: string): ErpState {
  const inv = s.invoices.find((i) => i.id === invoiceId);
  if (!inv) return s;
  const advances = unappliedAdvances(s, { quotationId: inv.quotationId, jobId: inv.linkedJobId });
  if (!advances.length) return s;
  const advanceIds = new Set(advances.map((p) => p.id));
  const total = advances.reduce((sum, p) => sum + p.amount, 0);
  const amountPaid = Math.min(inv.grandTotal, (inv.amountPaid || 0) + total);
  return {
    ...s,
    payments: s.payments.map((p) => (advanceIds.has(p.id) ? { ...p, invoiceId } : p)),
    invoices: updateById(s.invoices, invoiceId, (i) => ({
      ...i,
      amountPaid,
      balanceDue: Math.max(0, i.grandTotal - amountPaid),
      paymentMode: advances[0].mode,
    })),
  };
}

// Rule: a line is a physical good (goes on a delivery challan) unless it is a labour/service charge.
// Services are identified by SAC codes starting with '99', or by service terms when not a catalog product.
const SERVICE_KEYWORDS = [
  'installation',
  'install',
  'labour',
  'labor',
  'service',
  'setup',
  'configuration',
  'wiring',
  'testing',
  'commissioning',
  'amc',
  'visiting',
  'charge',
];

export function isPhysicalLineItem(s: ErpState, item: LineItem): boolean {
  const hsn = (item.hsnSac || '').trim();
  const name = item.itemName.toLowerCase();
  const desc = (item.description || '').toLowerCase();

  if (hsn.startsWith('99')) return false;

  const isCatalogProduct = s.products.some(
    (p) =>
      p.name.toLowerCase() === name ||
      p.name.toLowerCase().includes(name) ||
      name.includes(p.name.toLowerCase())
  );
  if (isCatalogProduct) return true;

  if (SERVICE_KEYWORDS.some((kw) => name.includes(kw) || desc.includes(kw))) return false;

  return Boolean(hsn);
}

export function getSeedState(): ErpState {
  return {
    users: SEED_USERS,
    customers: SEED_CUSTOMERS,
    vendors: SEED_VENDORS,
    products: SEED_PRODUCTS,
    serialUnits: SEED_SERIAL_UNITS,
    jobs: SEED_JOBS,
    workLogs: SEED_WORK_LOGS,
    holdEvents: SEED_HOLD_EVENTS,
    materialUsages: SEED_MATERIAL_USAGES,
    quotations: SEED_QUOTATIONS,
    invoices: SEED_INVOICES,
    deliveryChallans: SEED_DELIVERY_CHALLANS,
    payments: SEED_PAYMENTS,
    otpVerifications: SEED_OTP_VERIFICATIONS,
    enquiries: SEED_ENQUIRIES,
    jobProductUsages: SEED_JOB_PRODUCT_USAGES,
    repairTickets: SEED_REPAIR_TICKETS,
    accessControl: DEFAULT_ACCESS_CONTROL,
  };
}

// Normalizes a saved state blob (possibly from an older version) into the current shape.
// A saved list is kept even when empty; only a list missing from an older save starts empty.
// (Falling back to demo seeds here used to resurrect deleted records.)
// `browserLegacyFixes` applies one-off fixes for old browser saves (demo CEO name, bank details,
// demo users when none exist); the server stores real data and never applies them.
export function normalizeSavedState(parsed: any, { browserLegacyFixes = true } = {}): ErpState {
  const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

  const quotations = list<Quotation>(parsed.quotations).map((q) =>
    browserLegacyFixes ? { ...q, bankDetails: CANARA_BANK_DETAILS } : q
  );
  const users = list<User>(parsed.users);

  return {
    users: browserLegacyFixes
      ? // Never start with zero users, or nobody could log in
        (users.length ? users : SEED_USERS).map((u: User) =>
          u.id === 'usr-ceo' ? { ...u, name: 'Santhosh', phone: '8148562605', email: 'stecsecure@gmail.com' } : u
        )
      : users,
    customers: list<Customer>(parsed.customers),
    vendors: list<Vendor>(parsed.vendors),
    products: list<Product>(parsed.products).map((p) => {
      const seed = SEED_PRODUCTS.find((sp) => sp.id === p.id);
      return seed?.barcode && !p.barcode ? { ...p, barcode: seed.barcode } : p;
    }),
    jobs: list<Job>(parsed.jobs).map((j) => ({
      ...j,
      teamLeadUserId: j.teamLeadUserId || j.assignedTeam?.[0],
    })),
    workLogs: list<WorkLog>(parsed.workLogs),
    holdEvents: list<HoldEvent>(parsed.holdEvents),
    materialUsages: list<MaterialUsage>(parsed.materialUsages),
    quotations,
    invoices: list<Invoice>(parsed.invoices).map((inv) =>
      browserLegacyFixes ? { ...inv, bankDetails: CANARA_BANK_DETAILS } : inv
    ),
    serialUnits: list<SerialUnit>(parsed.serialUnits),
    deliveryChallans: list<DeliveryChallan>(parsed.deliveryChallans),
    payments: list<Payment>(parsed.payments),
    otpVerifications: list<OTPVerification>(parsed.otpVerifications),
    enquiries: list<Enquiry>(parsed.enquiries).map((e) => {
      // Repair enquiries whose linked quotation no longer exists: point at the latest one for this enquiry
      if (!e.quotationId || quotations.some((q) => q.id === e.quotationId)) return e;
      const latest = quotations.find((q) => q.enquiryId === e.id);
      return { ...e, quotationId: latest?.id };
    }),
    jobProductUsages: list<JobProductUsage>(parsed.jobProductUsages),
    repairTickets: list<RepairTicket>(parsed.repairTickets),
    accessControl: { ...DEFAULT_ACCESS_CONTROL, ...(parsed.accessControl || {}) },
  };
}
