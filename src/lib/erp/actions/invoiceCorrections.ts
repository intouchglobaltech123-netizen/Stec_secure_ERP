// Step 3: correcting issued invoices — cancellation (before money is received) and GST credit notes.
// An issued invoice is never deleted or renumbered: it is cancelled (and optionally re-issued under a
// new number) or reduced by a credit note.
import {
  CreditNote,
  CreditNoteLineItem,
  CreditNoteReason,
  Invoice,
  Payment,
  PaymentMode,
} from '../../stecsecure-types';
import { nextDocNumber } from '../../numbering';
import { COMPANY_STATE_CODE, customerStateCode, isInterState, splitLineTax, taxTotals } from '../../gst';
import {
  CREDIT_NOTE_REASONS,
  invoiceBalanceDue,
  invoiceNetTotal,
  invoiceRefundDue,
  isCancelledInvoice,
} from '../../invoice-status';
import {
  Action,
  ErpState,
  done,
  updateById,
  applyAdvancesToInvoice,
  finalizeInvoiceTax,
  findInvoiceForQuotation,
  resolveQuotationId,
  withNotification,
  managementIds,
} from '../core';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export interface CancelInvoiceArgs {
  invoiceId: string;
  reason: string;
  // Re-issue the same bill under a new number — to the same customer or, when the wrong party was
  // billed, to another one. Tax is recomputed for the new customer's state.
  reissue?: { customerNumber?: string };
}

export interface CancelInvoiceResult {
  cancelled: Invoice;
  replacement?: Invoice;
}

// Allowed until money is received against the invoice. Advances taken before the invoice was raised
// go back to their quotation / job and move onto the replacement (or the next invoice raised).
export const cancelInvoice: Action<CancelInvoiceArgs, CancelInvoiceResult> = (s, env, { invoiceId, reason, reissue }) => {
  const inv = s.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error('Invoice not found');
  if (isCancelledInvoice(inv)) throw new Error(`Invoice ${inv.invoiceNo} is already cancelled.`);
  const why = (reason || '').trim();
  if (!why) throw new Error('Give the reason for cancelling this invoice.');
  if (inv.creditNoteTotal) {
    throw new Error(`Invoice ${inv.invoiceNo} has credit notes against it and cannot be cancelled.`);
  }

  const isAdvance = (p: Payment) => Boolean(p.quotationId || p.jobId);
  const received = s.payments.filter((p) => p.invoiceId === inv.id && !isAdvance(p));
  if (received.length) {
    const total = received.reduce((sum, p) => sum + p.amount, 0);
    throw new Error(
      `${rupees(total)} has already been received against ${inv.invoiceNo} — issue a credit note instead of cancelling.`
    );
  }

  const customerNumber = reissue?.customerNumber || inv.customerNumber;
  if (reissue && !s.customers.some((c) => c.id === customerNumber)) throw new Error('Customer not found');
  const replacementId = reissue ? env.newId('INV') : undefined;

  let next: ErpState = {
    ...s,
    payments: s.payments.map((p) => (p.invoiceId === inv.id ? { ...p, invoiceId: undefined } : p)),
    invoices: updateById(s.invoices, inv.id, (i) => ({
      ...i,
      status: 'CANCELLED' as const,
      cancelledAt: env.nowIso,
      cancelledByUserId: env.actor?.id,
      cancelReason: why,
      replacedByInvoiceId: replacementId,
      amountPaid: 0,
      balanceDue: 0,
      paymentMode: 'PENDING' as const,
    })),
  };

  let replacement: Invoice | undefined;
  if (replacementId) {
    const fresh = finalizeInvoiceTax(next, {
      ...inv,
      id: replacementId,
      invoiceNo: nextDocNumber(`INV-${env.fy}-`, s.invoices.map((i) => i.invoiceNo)),
      customerNumber,
      date: env.today,
      billTo: undefined,
      placeOfSupply: undefined,
      amountPaid: 0,
      balanceDue: 0,
      paymentMode: 'PENDING',
      raisedByUserId: env.actor?.id,
      replacesInvoiceId: inv.id,
      replacedByInvoiceId: undefined,
    });
    next = applyAdvancesToInvoice({ ...next, invoices: [fresh, ...next.invoices] }, fresh.id);
    replacement = next.invoices.find((i) => i.id === fresh.id);
  } else {
    // The quotation is open again once nothing bills it
    const job = inv.linkedJobId ? s.jobs.find((j) => j.id === inv.linkedJobId) : undefined;
    const quotationIds = [inv.quotationId, resolveQuotationId(s, job?.quotationId)].filter(
      (id): id is string => Boolean(id)
    );
    for (const qid of new Set(quotationIds)) {
      if (findInvoiceForQuotation(next, qid)) continue;
      next = {
        ...next,
        quotations: updateById(next.quotations, qid, (q) =>
          q.status === 'CONVERTED' ? { ...q, status: 'ACCEPTED' as const } : q
        ),
      };
    }
  }

  const cancelled = next.invoices.find((i) => i.id === inv.id)!;
  next = withNotification(next, env, managementIds(s), {
    title: `Invoice ${inv.invoiceNo} cancelled${env.actor ? ` by ${env.actor.name}` : ''}`,
    body: `${why}${replacement ? ` · re-issued as ${replacement.invoiceNo}` : ''}`,
    section: 'quotations-invoices',
  });
  return done(next, { cancelled, replacement });
};

export interface CreateCreditNoteArgs {
  invoiceId: string;
  reason: CreditNoteReason;
  reasonNote?: string;
  // Quantity and rate credited against each invoice line (by its position on the invoice)
  lines: { sourceLine: number; qty: number; rate: number }[];
}

const r2 = (n: number) => Number(n.toFixed(2));

export const createCreditNote: Action<CreateCreditNoteArgs, CreditNote> = (s, env, data) => {
  const inv = s.invoices.find((i) => i.id === data.invoiceId);
  if (!inv) throw new Error('Invoice not found');
  if (isCancelledInvoice(inv)) throw new Error(`Invoice ${inv.invoiceNo} is cancelled.`);
  if (!CREDIT_NOTE_REASONS.some((r) => r.value === data.reason)) throw new Error('Choose the reason for the credit note.');
  const note = (data.reasonNote || '').trim();
  if (data.reason === 'OTHER' && !note) throw new Error('Describe the reason for the credit note.');

  // The credit note carries the invoice's place of supply (older invoices were all within Tamil Nadu)
  const customer = s.customers.find((c) => c.id === inv.customerNumber);
  const placeOfSupply = inv.placeOfSupply ?? (inv.totalIgst ? customerStateCode(customer) : COMPANY_STATE_CODE);
  const interState = isInterState(placeOfSupply);

  // Already credited per invoice line, so a line is never credited beyond what it billed
  const creditedOnLine = new Map<number, number>();
  for (const cn of s.creditNotes.filter((c) => c.invoiceId === inv.id)) {
    for (const l of cn.lineItems) creditedOnLine.set(l.sourceLine, (creditedOnLine.get(l.sourceLine) || 0) + l.amount);
  }

  const lineItems: CreditNoteLineItem[] = [];
  for (const line of data.lines || []) {
    const qty = Number(line.qty);
    const rate = Number(line.rate);
    if (!(qty > 0) || !(rate > 0)) continue;
    const src = inv.lineItems[line.sourceLine];
    if (!src) throw new Error('A credited line is not on the invoice.');
    if (qty > src.qty) throw new Error(`${src.itemName}: cannot credit more than the ${src.qty} invoiced.`);
    if (rate > src.rate) throw new Error(`${src.itemName}: the credit rate cannot exceed the invoiced rate of ${rupees(src.rate)}.`);
    const already = creditedOnLine.get(line.sourceLine) || 0;
    const left = r2(src.amount - already);
    if (r2(qty * rate) > left + 0.005) {
      throw new Error(`${src.itemName}: only ${rupees(left)} (before tax) is left to credit on this line.`);
    }
    lineItems.push({
      ...splitLineTax(
        { ...src, qty, rate, amount: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
        interState
      ),
      sourceLine: line.sourceLine,
    });
  }
  if (!lineItems.length) throw new Error('Enter the quantity and rate to credit on at least one line.');

  const totals = taxTotals(lineItems);
  const net = invoiceNetTotal(inv);
  // Rupee rounding on two documents can differ by under a rupee
  if (totals.grandTotal > net + 1) {
    throw new Error(`The credit note (${rupees(totals.grandTotal)}) is more than the ${rupees(net)} this invoice still bills.`);
  }

  const creditNote: CreditNote = {
    id: env.newId('CN'),
    creditNoteNo: nextDocNumber(`CN-${env.fy}-`, s.creditNotes.map((c) => c.creditNoteNo)),
    invoiceId: inv.id,
    invoiceNo: inv.invoiceNo,
    invoiceDate: inv.date,
    customerNumber: inv.customerNumber,
    date: env.today,
    reason: data.reason,
    reasonNote: note || undefined,
    lineItems,
    ...totals,
    placeOfSupply,
    billTo: inv.billTo ?? {
      name: customer?.name ?? inv.customerNumber,
      address: customer?.address ?? '',
      phone: customer?.phone ?? '',
      gstin: customer?.gstin || undefined,
      stateCode: placeOfSupply,
    },
    refundedAmount: 0,
    createdAt: env.nowIso,
    createdByUserId: env.actor?.id,
  };

  const creditNoteTotal = Math.min(inv.grandTotal, r2((inv.creditNoteTotal || 0) + creditNote.grandTotal));
  const next: ErpState = {
    ...s,
    creditNotes: [creditNote, ...s.creditNotes],
    invoices: updateById(s.invoices, inv.id, (i) => {
      const updated = { ...i, creditNoteTotal };
      return { ...updated, balanceDue: invoiceBalanceDue(updated) };
    }),
  };
  const refund = invoiceRefundDue(next.invoices.find((i) => i.id === inv.id)!);
  return done(
    withNotification(next, env, managementIds(s), {
      title: `Credit note ${creditNote.creditNoteNo} for ${rupees(creditNote.grandTotal)}`,
      body: `Against ${inv.invoiceNo} · ${creditNote.billTo.name}${refund ? ` · ${rupees(refund)} to refund` : ''}`,
      section: 'quotations-invoices',
    }),
    creditNote
  );
};

export interface RecordCreditNoteRefundArgs {
  creditNoteId: string;
  amount: number;
  paymentMode: PaymentMode;
  referenceNo?: string;
  date?: string;
}

// Money paid back to the customer when a credit note leaves them having paid more than the invoice
// now bills. Recorded as a negative payment, so collection totals stay true.
export const recordCreditNoteRefund: Action<RecordCreditNoteRefundArgs, Payment> = (s, env, data) => {
  const cn = s.creditNotes.find((c) => c.id === data.creditNoteId);
  if (!cn) throw new Error('Credit note not found');
  const inv = s.invoices.find((i) => i.id === cn.invoiceId);
  if (!inv) throw new Error('Invoice not found');
  const refundable = r2(Math.min(cn.grandTotal - (cn.refundedAmount || 0), invoiceRefundDue(inv)));
  const amount = r2(Number(data.amount));
  if (refundable <= 0) throw new Error('Nothing to refund — the customer has not paid more than the invoice now bills.');
  if (!(amount > 0)) throw new Error('Enter the refund amount.');
  if (amount > refundable) throw new Error(`At most ${rupees(refundable)} can be refunded against ${cn.creditNoteNo}.`);

  const refund: Payment = {
    id: env.newId('PAY'),
    customerNumber: cn.customerNumber,
    invoiceId: inv.id,
    creditNoteId: cn.id,
    amount: -amount,
    mode: data.paymentMode,
    date: data.date || env.today,
    type: 'REFUND',
    receiptNo: nextDocNumber(`RFD-${env.fy}-`, s.payments.map((p) => p.receiptNo)),
    referenceNo: data.referenceNo?.trim() || undefined,
  };
  const next: ErpState = {
    ...s,
    payments: [refund, ...s.payments],
    creditNotes: updateById(s.creditNotes, cn.id, (c) => ({ ...c, refundedAmount: r2((c.refundedAmount || 0) + amount) })),
    invoices: updateById(s.invoices, inv.id, (i) => {
      const amountPaid = r2((i.amountPaid || 0) - amount);
      return { ...i, amountPaid, balanceDue: invoiceBalanceDue(i, amountPaid) };
    }),
  };
  return done(
    withNotification(next, env, managementIds(s), {
      title: `${rupees(amount)} refunded to ${cn.billTo.name}`,
      body: `${cn.creditNoteNo} · ${data.paymentMode} · ${refund.receiptNo}${env.actor ? ` · by ${env.actor.name}` : ''}`,
      section: 'payments',
    }),
    refund
  );
};
