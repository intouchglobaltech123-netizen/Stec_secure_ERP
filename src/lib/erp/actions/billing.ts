// Sales documents and money: quotations, delivery challans, invoices, payments
import {
  QuotationStatus,
  Quotation,
  Invoice,
  DeliveryChallan,
  Payment,
  PaymentMode,
  LineItem,
} from '../../stecsecure-types';
import { SEED_BANK_DETAILS } from '../../seed-data';
import { nextDocNumber } from '../../numbering';
import {
  Action,
  ActionEnv,
  ErpState,
  done,
  updateById,
  invoiceTotals,
  makeLineItem,
  resolveQuotationId,
  findInvoiceForJob,
  isPhysicalLineItem,
  applyAdvancesToInvoice,
  unappliedAdvances,
  findInvoiceForQuotation,
  withNotification,
  managementIds,
  matchProduct,
  applyChallanSerials,
} from '../core';

// Phase 22: tell management about money received (not the person who recorded it)
const notifyPayment = (s: ErpState, env: ActionEnv, payment: Payment, what: string) => {
  const customer = s.customers.find((c) => c.id === payment.customerNumber);
  return withNotification(s, env, managementIds(s), {
    title: `₹${payment.amount.toLocaleString('en-IN')} received${customer ? ` from ${customer.name}` : ''}`,
    body: `${what} · ${payment.mode} · receipt ${payment.receiptNo}${env.actor ? ` · by ${env.actor.name}` : ''}`,
    section: 'payments',
  });
};

// Sequential receipt number for every payment, restarting each financial year
const nextReceiptNo = (s: ErpState, env: ActionEnv) =>
  nextDocNumber(`RCPT-${env.fy}-`, s.payments.map((p) => p.receiptNo));

export interface RecordPaymentAfterOtpArgs {
  invoiceId: string;
  customerNumber: string;
  statusOption: 'FULL' | 'PARTIAL' | 'NOTHING';
  amountReceived: number;
  paymentMode?: PaymentMode;
  referenceNo?: string;
}

export const recordPaymentAfterOtp: Action<RecordPaymentAfterOtpArgs, Payment | null> = (s, env, data) => {
  const inv = s.invoices.find((i) => i.id === data.invoiceId);
  if (!inv) return done(s, null);

  // Payment collection is only allowed after the customer's OTP sign-off
  if (inv.linkedJobId) {
    const job = s.jobs.find((j) => j.id === inv.linkedJobId);
    const otp = s.otpVerifications.find((o) => o.jobId === inv.linkedJobId);
    if (job && job.status !== 'CLOSED' && otp?.status !== 'VERIFIED') return done(s, null);
  }

  // Add to what was already paid (advances / earlier instalments) — never overwrite it
  const alreadyPaid = inv.amountPaid || 0;
  const outstanding = Math.max(0, inv.grandTotal - alreadyPaid);
  const pMode = data.paymentMode || 'UPI';

  let received = 0;
  if (data.statusOption === 'FULL') {
    received = outstanding;
  } else if (data.statusOption === 'PARTIAL') {
    received = Math.min(outstanding, Math.max(0, data.amountReceived));
  }
  const newAmountPaid = alreadyPaid + received;
  const newBalanceDue = Math.max(0, inv.grandTotal - newAmountPaid);

  const createdPayment: Payment | null =
    received > 0
      ? {
          id: env.newId('PAY'),
          customerNumber: data.customerNumber,
          invoiceId: data.invoiceId,
          amount: received,
          mode: pMode,
          date: env.today,
          type: newBalanceDue > 0 ? 'ADVANCE' : alreadyPaid > 0 ? 'BALANCE' : 'FULL',
          receiptNo: nextReceiptNo(s, env),
          referenceNo: data.referenceNo || undefined,
        }
      : null;

  const paid = done(
    {
      ...s,
      invoices: updateById(s.invoices, data.invoiceId, (i) => ({
        ...i,
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        paymentMode: received > 0 ? pMode : newAmountPaid > 0 ? i.paymentMode : 'PENDING',
      })),
      payments: createdPayment ? [createdPayment, ...s.payments] : s.payments,
    },
    createdPayment
  ).state;
  return done(createdPayment ? notifyPayment(paid, env, createdPayment, `Invoice ${inv.invoiceNo}`) : paid, createdPayment);
};

export interface RecordManualPaymentArgs {
  invoiceId: string;
  amount: number;
  paymentMode: PaymentMode;
  referenceNo?: string;
  date?: string;
}

export const recordManualPayment: Action<RecordManualPaymentArgs, Payment | null> = (s, env, data) => {
  const inv = s.invoices.find((i) => i.id === data.invoiceId);
  if (!inv) return done(s, null);

  const paymentAmount = Math.min(inv.balanceDue, Math.max(0, data.amount));
  if (paymentAmount <= 0) return done(s, null);

  const newAmountPaid = inv.amountPaid + paymentAmount;
  const newBalanceDue = Math.max(0, inv.grandTotal - newAmountPaid);

  const createdPayment: Payment = {
    id: env.newId('PAY'),
    customerNumber: inv.customerNumber,
    invoiceId: data.invoiceId,
    amount: paymentAmount,
    mode: data.paymentMode,
    date: data.date || env.today,
    type: newBalanceDue === 0 ? 'BALANCE' : 'ADVANCE',
    receiptNo: nextReceiptNo(s, env),
    referenceNo: data.referenceNo || undefined,
  };

  const paid: ErpState = {
    ...s,
    invoices: updateById(s.invoices, data.invoiceId, (i) => ({
      ...i,
      amountPaid: newAmountPaid,
      balanceDue: newBalanceDue,
      paymentMode: newBalanceDue === 0 ? data.paymentMode : newAmountPaid > 0 ? data.paymentMode : 'PENDING',
    })),
    payments: [createdPayment, ...s.payments],
  };
  return done(notifyPayment(paid, env, createdPayment, `Invoice ${inv.invoiceNo}`), createdPayment);
};

export const addPayment: Action<Omit<Payment, 'id'>, Payment> = (s, env, payment) => {
  const newPayment: Payment = { ...payment, id: env.newId('PAY'), receiptNo: nextReceiptNo(s, env) };
  return done({ ...s, payments: [newPayment, ...s.payments] }, newPayment);
};

// Phase 22: money taken before work / invoicing (e.g. "50% advance with order"), against a quotation
// or a job. It is applied to the invoice automatically when that invoice is raised.
export interface RecordAdvanceArgs {
  quotationId?: string;
  jobId?: string;
  amount: number;
  paymentMode: PaymentMode;
  referenceNo?: string;
  date?: string;
}

export const recordAdvance: Action<RecordAdvanceArgs, Payment> = (s, env, data) => {
  const quot = data.quotationId ? s.quotations.find((q) => q.id === data.quotationId) : undefined;
  const job = data.jobId ? s.jobs.find((j) => j.id === data.jobId) : undefined;
  if (!quot && !job) throw new Error('Choose the quotation or job this advance is for.');
  if (!(data.amount > 0)) throw new Error('Enter the advance amount.');

  // Once invoiced, money is recorded as a payment against the invoice instead
  const invoice = quot ? findInvoiceForQuotation(s, quot.id) : findInvoiceForJob(s, job!);
  if (invoice) {
    throw new Error(`Already invoiced as ${invoice.invoiceNo} — record this as a payment against that invoice.`);
  }

  if (quot) {
    const taken = unappliedAdvances(s, { quotationId: quot.id }).reduce((sum, p) => sum + p.amount, 0);
    if (taken + data.amount > quot.grandTotal) {
      throw new Error(
        `Advances would exceed the quotation total of ₹${quot.grandTotal} (₹${taken} already received).`
      );
    }
  }

  const advance: Payment = {
    id: env.newId('PAY'),
    customerNumber: quot?.customerNumber ?? job!.customerNumber,
    quotationId: quot?.id ?? resolveQuotationId(s, job?.quotationId),
    jobId: job?.id,
    amount: data.amount,
    mode: data.paymentMode,
    date: data.date || env.today,
    type: 'ADVANCE',
    receiptNo: nextReceiptNo(s, env),
    referenceNo: data.referenceNo || undefined,
  };
  const what = quot ? `Advance for quotation ${quot.quotationNo}` : `Advance for job ${job!.jobNumber}`;
  return done(notifyPayment({ ...s, payments: [advance, ...s.payments] }, env, advance, what), advance);
};

export interface CreateDeliveryChallanArgs {
  customerNumber: string;
  lineItems: { itemDescription: string; qty: number; productId?: string; serialUnitIds?: string[] }[];
  transportedBy?: string;
  jobId?: string;
  quotationId?: string;
}

export const createDeliveryChallan: Action<CreateDeliveryChallanArgs, DeliveryChallan> = (s, env, data) => {
  const newChallan: DeliveryChallan = {
    id: env.newId('DC'),
    challanNo: nextDocNumber(`DC-${env.fy}-`, s.deliveryChallans.map((d) => d.challanNo)),
    date: env.today,
    customerNumber: data.customerNumber,
    lineItems: data.lineItems.map((l) => ({ ...l, productId: l.productId ?? matchProduct(s, l.itemDescription)?.id })),
    receiverSignature: 'Pending Site Signature',
    transportedBy: data.transportedBy || 'Field Van / Technician Bike',
    jobId: data.jobId,
    quotationId: data.quotationId,
  };
  const withStock = applyChallanSerials(s, newChallan);
  return done({ ...withStock, deliveryChallans: [newChallan, ...s.deliveryChallans] }, newChallan);
};

export const updateDeliveryChallan: Action<{ id: string; updates: Partial<DeliveryChallan> }, void> = (
  s,
  _env,
  { id, updates }
) => {
  const prev = s.deliveryChallans.find((dc) => dc.id === id);
  if (!prev) throw new Error('Delivery Challan not found');
  const next: DeliveryChallan = {
    ...prev,
    ...updates,
    lineItems: (updates.lineItems ?? prev.lineItems).map((l) => ({
      ...l,
      productId: l.productId ?? matchProduct(s, l.itemDescription)?.id,
    })),
  };
  const withStock = applyChallanSerials(s, next, prev);
  return done({ ...withStock, deliveryChallans: updateById(s.deliveryChallans, id, () => next) }, undefined);
};

export type CreateQuotationArgs = Omit<Quotation, 'id' | 'quotationNo'> & {
  quotationNo?: string;
  status?: QuotationStatus;
  enquiryId?: string;
};

export const createQuotation: Action<CreateQuotationArgs, Quotation> = (s, env, data) => {
  const quotationNo =
    data.quotationNo || nextDocNumber(`A${String(env.fy).slice(2)}`, s.quotations.map((q) => q.quotationNo));
  const newQuot: Quotation = {
    ...data,
    id: env.newId('QUOT'),
    quotationNo,
    status: data.status || 'DRAFT',
    enquiryId: data.enquiryId,
  };
  return done(
    {
      ...s,
      quotations: [newQuot, ...s.quotations],
      enquiries: data.enquiryId
        ? updateById(s.enquiries, data.enquiryId, (e) => ({ ...e, quotationId: newQuot.id }))
        : s.enquiries,
    },
    newQuot
  );
};

export const updateQuotation: Action<{ id: string; updates: Partial<Quotation> }, Quotation> = (
  s,
  _env,
  { id, updates }
) => {
  const existing = s.quotations.find((q) => q.id === id);
  if (!existing) throw new Error('Quotation not found');
  const invoice = findInvoiceForQuotation(s, id);
  if (invoice) {
    throw new Error(`Quotation ${existing.quotationNo} is invoiced as ${invoice.invoiceNo} — edit the invoice instead.`);
  }
  // Phase 22: saving the builder may move Draft ↔ Sent, never undo Accepted / Rejected / Lost
  const keepStatus = !['DRAFT', 'SENT', undefined].includes(existing.status);
  const updatedQuot: Quotation = {
    ...existing,
    ...updates,
    status: keepStatus ? existing.status : updates.status ?? existing.status,
  };
  const enquiryId = updates.enquiryId || existing.enquiryId;
  return done(
    {
      ...s,
      quotations: updateById(s.quotations, id, () => updatedQuot),
      enquiries: enquiryId ? updateById(s.enquiries, enquiryId, (e) => ({ ...e, quotationId: id })) : s.enquiries,
    },
    updatedQuot
  );
};

export const updateInvoice: Action<{ id: string; updates: Partial<Invoice> }, Invoice> = (s, _env, { id, updates }) => {
  const existing = s.invoices.find((inv) => inv.id === id);
  if (!existing) throw new Error('Invoice not found');
  const updatedInv: Invoice = { ...existing, ...updates };
  return done({ ...s, invoices: updateById(s.invoices, id, () => updatedInv) }, updatedInv);
};

// Phase 22: management records the customer's decision on a quotation
export const setQuotationStatus: Action<
  { quotationId: string; status: QuotationStatus; note?: string },
  Quotation
> = (s, env, { quotationId, status, note }) => {
  const quot = s.quotations.find((q) => q.id === quotationId);
  if (!quot) throw new Error('Quotation not found');
  if (status === 'CONVERTED') throw new Error('A quotation becomes Invoiced only when its invoice is raised.');
  const invoice = findInvoiceForQuotation(s, quotationId);
  if (invoice) throw new Error(`Quotation ${quot.quotationNo} is already invoiced as ${invoice.invoiceNo}.`);
  const updated: Quotation = {
    ...quot,
    status,
    statusNote: note?.trim() || undefined,
    statusUpdatedAt: env.nowIso,
  };
  return done({ ...s, quotations: updateById(s.quotations, quotationId, () => updated) }, updated);
};

export const convertQuotationToInvoice: Action<{ quotationId: string }, Invoice> = (s, env, { quotationId }) => {
  const quot = s.quotations.find((q) => q.id === quotationId);
  if (!quot) throw new Error('Quotation not found');
  const existing = s.invoices.find((i) => i.quotationId === quotationId);
  if (existing) {
    throw new Error(`Quotation ${quot.quotationNo} is already invoiced as ${existing.invoiceNo}.`);
  }
  for (const job of s.jobs.filter((j) => resolveQuotationId(s, j.quotationId) === quotationId)) {
    const jobInvoice = findInvoiceForJob(s, job);
    if (jobInvoice) {
      throw new Error(`Job ${job.jobNumber} on this quotation is already invoiced as ${jobInvoice.invoiceNo}.`);
    }
  }

  const newInvoice: Invoice = {
    id: env.newId('INV'),
    invoiceNo: nextDocNumber(`INV-${env.fy}-`, s.invoices.map((i) => i.invoiceNo)),
    customerNumber: quot.customerNumber,
    date: env.today,
    validityDays: quot.validityDays || 15,
    lineItems: quot.lineItems,
    termsAndConditions: quot.termsAndConditions,
    totalAmount: quot.totalAmount,
    totalCgst: quot.totalCgst,
    totalSgst: quot.totalSgst,
    roundOff: quot.roundOff,
    grandTotal: quot.grandTotal,
    bankDetails: quot.bankDetails,
    quotationId: quot.id,
    amountPaid: 0,
    balanceDue: quot.grandTotal,
    paymentMode: 'PENDING',
    raisedByUserId: env.actor?.id,
  };

  const next = applyAdvancesToInvoice(
    {
      ...s,
      quotations: updateById(s.quotations, quotationId, (q) => ({ ...q, status: 'CONVERTED' as const })),
      invoices: [newInvoice, ...s.invoices],
    },
    newInvoice.id
  );
  return done(next, next.invoices.find((i) => i.id === newInvoice.id)!);
};

export const convertQuotationToDeliveryChallan: Action<{ quotationId: string; jobId?: string }, DeliveryChallan> = (
  s,
  env,
  { quotationId, jobId }
) => {
  const quot = s.quotations.find((q) => q.id === quotationId);
  if (!quot) throw new Error('Quotation not found');

  const physicalItems = quot.lineItems.filter((item) => isPhysicalLineItem(s, item));
  const itemsToConvert = physicalItems.length > 0 ? physicalItems : quot.lineItems;

  // Resolve linked job: explicitly provided, or search if any job already has quotationId
  const linkedJob = jobId
    ? s.jobs.find((j) => j.id === jobId)
    : s.jobs.find((j) => j.quotationId === quotationId || j.quotationId === quot.quotationNo);

  const newChallan: DeliveryChallan = {
    id: env.newId('DC'),
    challanNo: nextDocNumber(`DC-${env.fy}-`, s.deliveryChallans.map((d) => d.challanNo)),
    date: env.today,
    customerNumber: quot.customerNumber,
    lineItems: itemsToConvert.map((item) => ({
      itemDescription: item.itemName,
      qty: item.qty || 1,
      productId: matchProduct(s, item.itemName)?.id,
    })),
    receiverSignature: 'Pending Site Signature',
    transportedBy: 'Technician Field Van / Bike',
    quotationId: quot.id,
    jobId: linkedJob?.id,
  };

  return done({ ...s, deliveryChallans: [newChallan, ...s.deliveryChallans] }, newChallan);
};

export const convertDeliveryChallanToInvoice: Action<{ challanId: string }, Invoice> = (s, env, { challanId }) => {
  const dc = s.deliveryChallans.find((c) => c.id === challanId);
  if (!dc) throw new Error('Delivery Challan not found');
  const existingForChallan = s.invoices.find((i) => i.deliveryChallanId === dc.id);
  if (existingForChallan) {
    throw new Error(`Delivery Challan ${dc.challanNo} is already invoiced as ${existingForChallan.invoiceNo}.`);
  }
  // Services from the quotation are billed once, on the first invoice for that quotation
  const quotationAlreadyInvoiced = dc.quotationId ? s.invoices.some((i) => i.quotationId === dc.quotationId) : false;

  const sourceQuot = dc.quotationId ? s.quotations.find((q) => q.id === dc.quotationId) : undefined;
  // Only a job tied to this challan or its quotation — never "any job of the same customer"
  const linkedJob = dc.jobId
    ? s.jobs.find((j) => j.id === dc.jobId)
    : dc.quotationId
    ? s.jobs.find((j) => resolveQuotationId(s, j.quotationId) === dc.quotationId)
    : undefined;

  if (linkedJob) {
    const jobInvoice = findInvoiceForJob(s, linkedJob);
    if (jobInvoice) {
      throw new Error(
        `Job ${linkedJob.jobNumber} is already invoiced as ${jobInvoice.invoiceNo}. Edit that invoice instead of raising a second one.`
      );
    }
  }

  // 1. Convert DC line items back to priced invoice line items
  const invoiceLineItems: LineItem[] = dc.lineItems.map((item) => {
    const desc = item.itemDescription.toLowerCase();
    // Check if item was in source quotation first
    const quotItem = sourceQuot?.lineItems.find((qi) => qi.itemName.toLowerCase() === desc);
    // Check product catalog
    const matchedProd = s.products.find(
      (p) => p.name.toLowerCase() === desc || desc.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(desc)
    );

    return makeLineItem(
      item.itemDescription,
      quotItem?.description || matchedProd?.description || 'Hardware dispatch item',
      quotItem ? quotItem.hsnSac : matchedProd?.hsnSac || '85258090',
      quotItem ? quotItem.gstRate : matchedProd?.gstRate || 18,
      item.qty || 1,
      quotItem ? quotItem.rate : matchedProd?.defaultRate || 2500
    );
  });

  // 2. Add the quotation's service/labour lines (not undelivered goods), once per quotation
  if (sourceQuot && !quotationAlreadyInvoiced) {
    sourceQuot.lineItems
      .filter((qi) => {
        const isAlreadyInInvoice = invoiceLineItems.some(
          (invItem) => invItem.itemName.toLowerCase() === qi.itemName.toLowerCase()
        );
        return !isAlreadyInInvoice && !isPhysicalLineItem(s, qi);
      })
      .forEach((sLine) => invoiceLineItems.push({ ...sLine }));
  } else if (
    !sourceQuot &&
    linkedJob &&
    linkedJob.serviceAmount &&
    linkedJob.serviceAmount > 0 &&
    !s.invoices.some((i) => i.linkedJobId === linkedJob.id)
  ) {
    invoiceLineItems.push(
      makeLineItem(
        `${linkedJob.type} & Commissioning Charges`,
        linkedJob.actionTaken || `Field service execution for ${linkedJob.category}`,
        '998719',
        linkedJob.serviceGstChoice === 'GST' ? 18 : 0,
        1,
        linkedJob.serviceAmount
      )
    );
  }

  // 3. Compute Invoice Totals
  const totals = invoiceTotals(invoiceLineItems);

  const newInvoice: Invoice = {
    id: env.newId('INV'),
    invoiceNo: nextDocNumber(`INV-${env.fy}-`, s.invoices.map((i) => i.invoiceNo)),
    customerNumber: dc.customerNumber,
    date: env.today,
    validityDays: sourceQuot?.validityDays || 15,
    lineItems: invoiceLineItems,
    termsAndConditions:
      sourceQuot?.termsAndConditions ||
      '1. 100% payment against delivery / installation completion.\n2. Warranty: As per manufacturer policy.',
    ...totals,
    bankDetails: sourceQuot?.bankDetails || SEED_BANK_DETAILS,
    linkedJobId: linkedJob?.id || dc.jobId,
    deliveryChallanId: dc.id,
    quotationId: dc.quotationId,
    amountPaid: 0,
    balanceDue: totals.grandTotal,
    paymentMode: 'PENDING',
    raisedByUserId: env.actor?.id,
  };

  const next = applyAdvancesToInvoice(
    {
      ...s,
      invoices: [newInvoice, ...s.invoices],
      quotations: dc.quotationId
        ? updateById(s.quotations, dc.quotationId, (q) => ({ ...q, status: 'CONVERTED' as const }))
        : s.quotations,
    },
    newInvoice.id
  );
  return done(next, next.invoices.find((i) => i.id === newInvoice.id)!);
};
