// Step 3: invoice cancellation and credit notes, shared by the app and the server.
// A cancelled invoice keeps its number but bills nothing; credit notes reduce what an invoice bills.
import type { CreditNoteReason, Invoice, Job, ServiceCategory } from './stecsecure-types';

export const isCancelledInvoice = (inv: Pick<Invoice, 'status'>) => inv.status === 'CANCELLED';

// What the invoice bills after credit notes (nothing once cancelled)
export const invoiceNetTotal = (inv: Pick<Invoice, 'status' | 'grandTotal' | 'creditNoteTotal'>) =>
  isCancelledInvoice(inv) ? 0 : Math.max(0, inv.grandTotal - (inv.creditNoteTotal || 0));

// Received beyond the net total (after a credit note) — owed back to the customer
export const invoiceRefundDue = (inv: Invoice) => Math.max(0, (inv.amountPaid || 0) - invoiceNetTotal(inv));

export const invoiceBalanceDue = (inv: Invoice, amountPaid = inv.amountPaid || 0) =>
  Math.max(0, invoiceNetTotal(inv) - amountPaid);

export const CREDIT_NOTE_REASONS: { value: CreditNoteReason; label: string }[] = [
  { value: 'GOODS_RETURNED', label: 'Goods returned' },
  { value: 'PRICE_CORRECTION', label: 'Price charged too high' },
  { value: 'DISCOUNT', label: 'Discount after sale' },
  { value: 'SERVICE_DEFICIENCY', label: 'Service not provided / deficient' },
  { value: 'OTHER', label: 'Other' },
];

export const creditNoteReasonLabel = (r: CreditNoteReason) =>
  CREDIT_NOTE_REASONS.find((x) => x.value === r)?.label ?? r;

// The service category an invoice belongs to: its job's category, else guessed from its line items
// (invoices raised straight from a quotation or challan have no job)
export function invoiceCategory(inv: Invoice, jobs: Pick<Job, 'id' | 'category'>[]): ServiceCategory {
  const job = inv.linkedJobId ? jobs.find((j) => j.id === inv.linkedJobId) : undefined;
  if (job?.category) return job.category;
  const text = (inv.lineItems || []).map((l) => `${l.itemName} ${l.description}`).join(' ').toLowerCase();
  if (text.includes('biometric') || text.includes('face') || text.includes('essl')) return 'Biometric & Access Control';
  if (text.includes('barrier') || text.includes('gate') || text.includes('swing')) return 'Gate Automation';
  if (text.includes('intercom') || text.includes('door phone') || text.includes('vdp')) return 'Intercom';
  if (text.includes('alarm') || text.includes('burglar')) return 'Burglar Alarm System';
  if (text.includes('home') || text.includes('automation') || text.includes('smart switch')) return 'Home Automations';
  return 'CCTV';
}
