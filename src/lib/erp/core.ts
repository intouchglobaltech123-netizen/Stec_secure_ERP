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
  AppNotification,
  AccessControl,
  CreditNote,
  PayProfile,
  LeaveRecord,
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
import { customerStateCode, isInterState, splitTax, taxTotals } from '../gst';
import { invoiceBalanceDue, isCancelledInvoice } from '../invoice-status';

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
  notifications: AppNotification[];
  creditNotes: CreditNote[]; // Step 3
  payProfiles: PayProfile[]; // payroll settings (CEO only)
  leaveRecords: LeaveRecord[]; // leave taken (management; technicians get their own)
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
  randomCode: (digits: number) => string; // e.g. a customer sign-off code
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
    randomCode: (digits) =>
      String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** digits).padStart(digits, '0'),
  };
}

// Replace one record by id
export const updateById = <T extends { id: string }>(list: T[], id: string, fn: (item: T) => T): T[] =>
  list.map((item) => (item.id === id ? fn(item) : item));

// Totals for a set of GST line items, rounded to the rupee with a round-off line
export const invoiceTotals = taxTotals;

// Step 3: CGST+SGST within Tamil Nadu, IGST to other states — decided by the customer's state.
// Every invoice is finalised here: tax split, totals, place of supply and a snapshot of the customer.
export function finalizeInvoiceTax(s: ErpState, inv: Invoice): Invoice {
  const customer = s.customers.find((c) => c.id === inv.customerNumber);
  const placeOfSupply = customerStateCode(customer);
  const lineItems = splitTax(inv.lineItems, isInterState(placeOfSupply));
  const totals = taxTotals(lineItems);
  const amountPaid = inv.amountPaid || 0;
  return {
    ...inv,
    lineItems,
    ...totals,
    placeOfSupply,
    billTo: customer
      ? {
          name: customer.name,
          address: customer.address,
          phone: customer.phone,
          gstin: customer.gstin || undefined,
          stateCode: placeOfSupply,
        }
      : inv.billTo,
    amountPaid,
    balanceDue: invoiceBalanceDue({ ...inv, grandTotal: totals.grandTotal }, amountPaid),
  };
}

// Step 3: invoices that still bill something. Cancelled ones stay in the list (and in the number
// series) but never count as "already invoiced", in totals, or for payments.
export const liveInvoices = (s: Pick<ErpState, 'invoices'>) => s.invoices.filter((i) => !isCancelledInvoice(i));

export function finalizeQuotationTax(s: ErpState, q: Quotation): Quotation {
  const customer = s.customers.find((c) => c.id === q.customerNumber);
  const placeOfSupply = customerStateCode(customer);
  const lineItems = splitTax(q.lineItems, isInterState(placeOfSupply));
  return { ...q, lineItems, ...taxTotals(lineItems), placeOfSupply };
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
  return liveInvoices(s).find(
    (i) => i.linkedJobId === job.id || (quotationId !== undefined && i.quotationId === quotationId)
  );
};

// Phase 22: catalogue product a challan / quotation line refers to (exact name first, then partial)
export function matchProduct(s: ErpState, name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return (
    s.products.find((p) => p.name.toLowerCase() === n) ??
    s.products.find((p) => n.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(n))
  );
}

// Phase 22: delivery challans take their serial units out of stock. Units on a challan for a job are
// allocated to that job (installed when the job completes); units on a stand-alone challan are
// delivered to the customer. `prev` is the challan before an edit, so removed units go back to stock.
export function applyChallanSerials(s: ErpState, dc: DeliveryChallan, prev?: DeliveryChallan): ErpState {
  const ids = (c?: DeliveryChallan) => new Set((c?.lineItems ?? []).flatMap((l) => l.serialUnitIds ?? []));
  const before = ids(prev);
  const after = ids(dc);

  for (const line of dc.lineItems) {
    const picked = line.serialUnitIds ?? [];
    if (picked.length > line.qty) {
      throw new Error(`${line.itemDescription}: ${picked.length} serials picked for a quantity of ${line.qty}.`);
    }
    for (const id of picked) {
      if (before.has(id)) continue;
      const unit = s.serialUnits.find((u) => u.id === id);
      if (!unit) throw new Error('A selected serial number no longer exists.');
      if (unit.status !== 'IN_STOCK') throw new Error(`Serial ${unit.serialNumber} is not in stock (${unit.status}).`);
      if (line.productId && unit.productId !== line.productId) {
        throw new Error(`Serial ${unit.serialNumber} is not a ${line.itemDescription}.`);
      }
    }
  }
  for (const id of before) {
    if (after.has(id)) continue;
    const unit = s.serialUnits.find((u) => u.id === id);
    // Units already back in stock (e.g. the job was cancelled) need nothing
    if (!unit || unit.challanId !== dc.id) continue;
    const releasable = unit.status === 'ALLOCATED' || (!dc.jobId && unit.status === 'INSTALLED');
    if (!releasable) {
      throw new Error(`Serial ${unit.serialNumber} is already installed and cannot be taken off the challan.`);
    }
  }

  return {
    ...s,
    serialUnits: s.serialUnits.map((u) => {
      if (after.has(u.id) && !before.has(u.id)) {
        return dc.jobId
          ? { ...u, status: 'ALLOCATED' as const, installedAtJobId: dc.jobId, challanId: dc.id }
          : {
              ...u,
              status: 'INSTALLED' as const,
              soldToCustomerId: dc.customerNumber,
              installedLocation: `Delivered on ${dc.challanNo}`,
              challanId: dc.id,
            };
      }
      if (before.has(u.id) && !after.has(u.id) && u.challanId === dc.id) {
        return {
          ...u,
          status: 'IN_STOCK' as const,
          challanId: undefined,
          installedAtJobId: u.installedAtJobId === dc.jobId ? undefined : u.installedAtJobId,
          soldToCustomerId: dc.jobId ? u.soldToCustomerId : undefined,
          installedLocation: dc.jobId ? u.installedLocation : undefined,
        };
      }
      return u;
    }),
  };
}

// Phase 22: in-app notifications. The person who caused the event is never notified; only the most
// recent ones are kept so the list (and every sync) stays small.
const MAX_NOTIFICATIONS = 300;

export const managementIds = (s: ErpState) =>
  s.users.filter((u) => u.role === 'CEO' || u.role === 'MANAGER').map((u) => u.id);

export function withNotification(
  s: ErpState,
  env: ActionEnv,
  to: (string | undefined)[],
  message: { title: string; body?: string; section?: string; jobId?: string }
): ErpState {
  const recipients = [...new Set(to.filter((id): id is string => Boolean(id) && id !== env.actor?.id))];
  if (!recipients.length) return s;
  const notification: AppNotification = {
    id: env.newId('NTF'),
    createdAt: env.nowIso,
    recipientUserIds: recipients,
    readBy: [],
    ...message,
  };
  return { ...s, notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS) };
}

export const jobSection = (job: { type: string }) => (job.type === 'INSTALLATION' ? 'installation-jobs' : 'service-jobs');

// Phase 22: the invoice that bills this quotation — directly, via a challan, or via a job raised from it
export const findInvoiceForQuotation = (s: ErpState, quotationId: string) =>
  liveInvoices(s).find((i) => i.quotationId === quotationId) ??
  s.jobs
    .filter((j) => resolveQuotationId(s, j.quotationId) === quotationId)
    .map((j) => liveInvoices(s).find((i) => i.linkedJobId === j.id))
    .find(Boolean);

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
    // A re-issued invoice may bill a different customer — the advance follows the invoice
    payments: s.payments.map((p) =>
      advanceIds.has(p.id) ? { ...p, invoiceId, customerNumber: inv.customerNumber } : p
    ),
    invoices: updateById(s.invoices, invoiceId, (i) => ({
      ...i,
      amountPaid,
      balanceDue: invoiceBalanceDue(i, amountPaid),
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
    notifications: [],
    creditNotes: [],
    payProfiles: [],
    leaveRecords: [],
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

  // Phase 22: "CONVERTED" (shown as Invoiced) means the quotation is billed — older data used it for
  // "a job was created" and left billed quotations as Draft/Sent; line both up with the invoices
  const migrated: ErpState['quotations'] = quotations.map((q) => q);
  const partial = { quotations: migrated, invoices: list<Invoice>(parsed.invoices), jobs: list<Job>(parsed.jobs) } as ErpState;
  for (let i = 0; i < migrated.length; i++) {
    const q = migrated[i];
    const invoiced = Boolean(findInvoiceForQuotation(partial, q.id));
    if (invoiced && q.status !== 'CONVERTED') migrated[i] = { ...q, status: 'CONVERTED' };
    else if (!invoiced && q.status === 'CONVERTED') migrated[i] = { ...q, status: 'ACCEPTED' };
  }

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
    quotations: migrated,
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
    notifications: list<AppNotification>(parsed.notifications),
    creditNotes: list<CreditNote>(parsed.creditNotes),
    payProfiles: list<PayProfile>(parsed.payProfiles),
    leaveRecords: list<LeaveRecord>(parsed.leaveRecords),
    accessControl: { ...DEFAULT_ACCESS_CONTROL, ...(parsed.accessControl || {}) },
  };
}
