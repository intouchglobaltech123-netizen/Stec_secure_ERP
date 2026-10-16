// Sheets describing each kind of record — used by the readable Excel copy inside a backup ZIP (all
// records) and by the Reports downloads (records in the chosen period). The JSON file next to the
// Excel copy is what gets restored; these sheets are for people to read.
import type { ErpState } from './erp/core';
import type { SheetSpec } from './excel-book';
import type { Customer, Enquiry, Job, RepairTicket, SerialUnit } from './stecsecure-types';
import { humanize } from './utils';
import { stateName, customerStateCode } from './gst';
import { creditNoteReasonLabel, invoiceNetTotal, isCancelledInvoice } from './invoice-status';
import { quotationStatusMeta } from './quotation-status';
import { leaveDays, leaveTypeLabel } from './leave';

export type SheetLookups = Pick<
  ErpState,
  'customers' | 'users' | 'products' | 'vendors' | 'jobs' | 'invoices' | 'quotations' | 'serialUnits' | 'payments'
>;

function helpers(state: SheetLookups) {
  const customer = new Map(state.customers.map((c) => [c.id, c]));
  const user = new Map(state.users.map((u) => [u.id, u]));
  const product = new Map(state.products.map((p) => [p.id, p]));
  const vendor = new Map(state.vendors.map((v) => [v.id, v]));
  const job = new Map(state.jobs.map((j) => [j.id, j]));
  const invoice = new Map(state.invoices.map((i) => [i.id, i]));
  const quotation = new Map(state.quotations.map((q) => [q.id, q]));
  return {
    customer,
    user,
    product,
    vendor,
    job,
    invoice,
    quotation,
    custName: (id?: string) => (id ? customer.get(id)?.name || id : ''),
    userName: (id?: string | null) => (id ? user.get(id)?.name || id : ''),
  };
}

const oldestFirst = <T,>(list: T[], key: (x: T) => string) => [...list].sort((a, b) => key(a).localeCompare(key(b)));

export function customersSheet(state: SheetLookups, customers: Customer[], title?: string): SheetSpec {
  // Lifetime totals per customer (live invoices only)
  const billed = new Map<string, { jobs: number; billed: number; paid: number; balance: number }>();
  for (const c of customers) billed.set(c.id, { jobs: 0, billed: 0, paid: 0, balance: 0 });
  for (const j of state.jobs) {
    const t = billed.get(j.customerNumber);
    if (t) t.jobs += 1;
  }
  for (const i of state.invoices) {
    const t = billed.get(i.customerNumber);
    if (!t || isCancelledInvoice(i)) continue;
    t.billed += invoiceNetTotal(i);
    t.paid += i.amountPaid;
    t.balance += i.balanceDue;
  }
  return {
    name: 'Customers',
    title,
    columns: [
      { header: 'Customer ID', key: 'id', pdf: false },
      { header: 'Name', key: 'name' },
      { header: 'Mobile', key: 'phone' },
      { header: 'Email', key: 'email', pdf: false },
      { header: 'Contact person', key: 'contact' },
      { header: 'Address', key: 'address', width: 40 },
      { header: 'GSTIN', key: 'gstin' },
      { header: 'State', key: 'state', pdf: false },
      { header: 'AMC', key: 'amc' },
      { header: 'AMC renewal', key: 'amcRenewal', type: 'date' },
      { header: 'Added on', key: 'created', type: 'date' },
      { header: 'Jobs', key: 'jobs', type: 'number' },
      { header: 'Billed (₹)', key: 'billed', type: 'money' },
      { header: 'Paid (₹)', key: 'paid', type: 'money' },
      { header: 'Balance (₹)', key: 'balance', type: 'money' },
    ],
    rows: oldestFirst(customers, (c) => c.createdAt || '').map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      contact: c.contactPerson,
      address: c.address,
      gstin: c.gstin || 'Unregistered',
      state: stateName(customerStateCode(c)),
      amc: c.amcActive ? 'Yes' : 'No',
      amcRenewal: c.amcRenewalDate,
      created: c.createdAt,
      ...billed.get(c.id),
    })),
    totalKeys: ['jobs', 'billed', 'paid', 'balance'],
  };
}

export function enquiriesSheet(state: SheetLookups, enquiries: Enquiry[], title?: string): SheetSpec {
  const h = helpers(state);
  return {
    name: 'Enquiries',
    title,
    columns: [
      { header: 'Enquiry', key: 'no' },
      { header: 'Logged', key: 'date', type: 'datetime' },
      { header: 'Customer', key: 'customer' },
      { header: 'Mobile', key: 'phone' },
      { header: 'Type', key: 'type' },
      { header: 'Category', key: 'category' },
      { header: 'Source', key: 'source' },
      { header: 'Status', key: 'status' },
      { header: 'Quotation', key: 'quotation' },
      { header: 'Job', key: 'job' },
      { header: 'Logged by', key: 'by', pdf: false },
      { header: 'Details', key: 'description', width: 50 },
    ],
    rows: oldestFirst(enquiries, (e) => e.createdAt).map((e) => ({
      no: e.enquiryNumber,
      date: e.createdAt,
      customer: e.customerName,
      phone: e.customerPhone,
      type: humanize(e.enquiryType),
      category: e.category,
      source: e.source,
      status: e.status === 'FOLLOW_UP' ? 'Follow-up' : humanize(e.status),
      quotation: e.quotationId ? h.quotation.get(e.quotationId)?.quotationNo : '',
      job: e.convertedJobId ? h.job.get(e.convertedJobId)?.jobNumber : '',
      by: h.userName(e.createdByUserId),
      description: e.description,
    })),
  };
}

export function jobsSheet(state: SheetLookups, jobs: Job[], name = 'Jobs', title?: string): SheetSpec {
  const h = helpers(state);
  const invoiceForJob = new Map(
    state.invoices.filter((i) => i.linkedJobId && !isCancelledInvoice(i)).map((i) => [i.linkedJobId as string, i])
  );
  return {
    name,
    title,
    columns: [
      { header: 'Job', key: 'no' },
      { header: 'Type', key: 'type', pdf: false },
      { header: 'Created', key: 'created', type: 'datetime' },
      { header: 'Customer', key: 'customer' },
      { header: 'Mobile', key: 'phone', pdf: false },
      { header: 'Category', key: 'category' },
      { header: 'Contract', key: 'contract', pdf: false },
      { header: 'Status', key: 'status' },
      { header: 'Team lead', key: 'lead' },
      { header: 'Team', key: 'team', pdf: false },
      { header: 'Scheduled visit', key: 'scheduled', pdf: false },
      { header: 'Completed', key: 'completed', type: 'datetime' },
      { header: 'Hours worked', key: 'hours', type: 'number' },
      { header: 'Invoice', key: 'invoice' },
      { header: 'Billed (₹)', key: 'billed', type: 'money' },
      { header: 'Paid (₹)', key: 'paid', type: 'money' },
      { header: 'Balance (₹)', key: 'balance', type: 'money' },
      { header: 'Problem', key: 'problem', width: 45, pdf: false },
      { header: 'What was done', key: 'action', width: 45, pdf: false },
    ],
    rows: oldestFirst(jobs, (j) => j.createdAt).map((j) => {
      const inv = invoiceForJob.get(j.id);
      return {
        no: j.jobNumber,
        type: humanize(j.type),
        created: j.createdAt,
        customer: h.custName(j.customerNumber),
        phone: h.customer.get(j.customerNumber)?.phone,
        category: j.category,
        contract: humanize(j.customerStatus),
        status: humanize(j.status),
        lead: h.userName(j.teamLeadUserId),
        team: j.assignedTeam.map((id) => h.userName(id)).join(', '),
        scheduled: j.scheduledFor?.replace('T', ' '),
        completed: j.completedAt,
        hours: j.totalDurationSeconds ? Math.round((j.totalDurationSeconds / 3600) * 10) / 10 : null,
        invoice: inv?.invoiceNo,
        billed: inv ? invoiceNetTotal(inv) : null,
        paid: inv ? inv.amountPaid : null,
        balance: inv ? inv.balanceDue : null,
        problem: j.problemReported,
        action: j.actionTaken,
      };
    }),
    totalKeys: ['hours', 'billed', 'paid', 'balance'],
  };
}

export function repairsSheet(state: SheetLookups, tickets: RepairTicket[], title?: string): SheetSpec {
  const h = helpers(state);
  return {
    name: 'Repairs',
    title,
    columns: [
      { header: 'Ticket', key: 'no' },
      { header: 'Opened', key: 'created', type: 'datetime' },
      { header: 'Customer', key: 'customer' },
      { header: 'Unit', key: 'unit' },
      { header: 'Stage', key: 'status' },
      { header: 'Repair path', key: 'path' },
      { header: 'Supplier', key: 'vendor' },
      { header: 'Technician', key: 'tech' },
      { header: 'Reinstalled', key: 'reinstalled', type: 'datetime' },
      { header: 'Fault', key: 'fault', width: 45 },
    ],
    rows: oldestFirst(tickets, (t) => t.createdAt).map((t) => {
      const unit = t.serialUnitId ? state.serialUnits.find((u) => u.id === t.serialUnitId) : undefined;
      return {
        no: t.ticketNumber,
        created: t.createdAt,
        customer: h.custName(t.customerId),
        unit: unit ? `${h.product.get(unit.productId)?.name || ''} (${unit.serialNumber})` : t.customUnitDescription,
        status: humanize(t.status),
        path: t.repairPath ? humanize(t.repairPath) : '',
        vendor: t.vendorId ? h.vendor.get(t.vendorId)?.name : '',
        tech: h.userName(t.assignedTechnicianId),
        reinstalled: t.reinstalledAt,
        fault: t.faultDescription,
      };
    }),
  };
}

export function stockSheet(state: SheetLookups, units: SerialUnit[], title?: string, name = 'Stock (serial numbers)'): SheetSpec {
  const h = helpers(state);
  return {
    name,
    title,
    columns: [
      { header: 'Serial number', key: 'serial' },
      { header: 'Product', key: 'product' },
      { header: 'Category', key: 'category' },
      { header: 'Status', key: 'status' },
      { header: 'Supplier', key: 'supplier' },
      { header: 'Purchase date', key: 'bought', type: 'date' },
      { header: 'Purchase cost (₹)', key: 'cost', type: 'money' },
      { header: 'Customer', key: 'customer' },
      { header: 'Job', key: 'job' },
    ],
    rows: oldestFirst(units, (u) => `${u.purchaseDate || ''} ${u.serialNumber}`).map((u) => ({
      serial: u.serialNumber,
      product: h.product.get(u.productId)?.name || u.productId,
      category: h.product.get(u.productId)?.category,
      status: humanize(u.status),
      supplier: u.purchasedFromVendorId ? h.vendor.get(u.purchasedFromVendorId)?.name : '',
      bought: u.purchaseDate,
      cost: u.purchaseCost,
      customer: h.custName(u.soldToCustomerId),
      job: u.installedAtJobId ? h.job.get(u.installedAtJobId)?.jobNumber : '',
    })),
    totalKeys: ['cost'],
  };
}

// Current stock by product: units in each status and the stock value at purchase cost
export function stockSummarySheet(state: SheetLookups, title?: string): SheetSpec {
  return {
    name: 'Stock by product',
    title,
    columns: [
      { header: 'Product', key: 'name' },
      { header: 'Category', key: 'category' },
      { header: 'HSN / SAC', key: 'hsn', pdf: false },
      { header: 'Selling rate (₹)', key: 'rate', type: 'money' },
      { header: 'In stock', key: 'inStock', type: 'number' },
      { header: 'Allocated', key: 'allocated', type: 'number' },
      { header: 'Installed', key: 'installed', type: 'number' },
      { header: 'In repair', key: 'repair', type: 'number' },
      { header: 'Returned', key: 'returned', type: 'number' },
      { header: 'Stock value at cost (₹)', key: 'value', type: 'money' },
    ],
    rows: state.products.map((p) => {
      const units = state.serialUnits.filter((u) => u.productId === p.id);
      const count = (s: SerialUnit['status']) => units.filter((u) => u.status === s).length;
      return {
        name: p.name,
        category: p.category,
        hsn: p.hsnSac,
        rate: p.defaultRate,
        inStock: count('IN_STOCK'),
        allocated: count('ALLOCATED'),
        installed: count('INSTALLED'),
        repair: count('IN_REPAIR'),
        returned: count('RETURNED'),
        value: units.filter((u) => u.status === 'IN_STOCK').reduce((sum, u) => sum + (u.purchaseCost || 0), 0),
      };
    }),
    totalKeys: ['inStock', 'allocated', 'installed', 'repair', 'returned', 'value'],
  };
}

export function backupSheets(state: ErpState): SheetSpec[] {
  const h = helpers(state);
  return [
    customersSheet(state, state.customers),
    enquiriesSheet(state, state.enquiries),
    jobsSheet(state, state.jobs),
    {
      name: 'Quotations',
      columns: [
        { header: 'Quotation', key: 'no' },
        { header: 'Date', key: 'date', type: 'date' },
        { header: 'Customer', key: 'customer' },
        { header: 'Status', key: 'status' },
        { header: 'Items', key: 'items', width: 45 },
        { header: 'Taxable (₹)', key: 'taxable', type: 'money' },
        { header: 'GST (₹)', key: 'gst', type: 'money' },
        { header: 'Total (₹)', key: 'total', type: 'money' },
      ],
      rows: oldestFirst(state.quotations, (q) => q.date).map((q) => ({
        no: q.quotationNo,
        date: q.date,
        customer: h.custName(q.customerNumber),
        status: quotationStatusMeta(q.status).label,
        items: q.lineItems.map((l) => `${l.qty} × ${l.itemName}`).join('; '),
        taxable: q.totalAmount,
        gst: q.totalCgst + q.totalSgst + (q.totalIgst || 0),
        total: q.grandTotal,
      })),
      totalKeys: ['taxable', 'gst', 'total'],
    },
    {
      name: 'Invoices',
      columns: [
        { header: 'Invoice', key: 'no' },
        { header: 'Date', key: 'date', type: 'date' },
        { header: 'Customer', key: 'customer' },
        { header: 'Mobile', key: 'phone' },
        { header: 'GSTIN', key: 'gstin' },
        { header: 'State', key: 'state' },
        { header: 'Job', key: 'job' },
        { header: 'Quotation', key: 'quotation' },
        { header: 'Taxable (₹)', key: 'taxable', type: 'money' },
        { header: 'CGST (₹)', key: 'cgst', type: 'money' },
        { header: 'SGST (₹)', key: 'sgst', type: 'money' },
        { header: 'IGST (₹)', key: 'igst', type: 'money' },
        { header: 'Invoice total (₹)', key: 'total', type: 'money' },
        { header: 'Credit notes (₹)', key: 'credit', type: 'money' },
        { header: 'Net billed (₹)', key: 'net', type: 'money' },
        { header: 'Paid (₹)', key: 'paid', type: 'money' },
        { header: 'Balance (₹)', key: 'balance', type: 'money' },
        { header: 'Status', key: 'status' },
      ],
      rows: oldestFirst(state.invoices, (i) => `${i.date} ${i.invoiceNo}`).map((i) => ({
        no: i.invoiceNo,
        date: i.date,
        customer: i.billTo?.name || h.custName(i.customerNumber),
        phone: i.billTo?.phone || h.customer.get(i.customerNumber)?.phone,
        gstin: i.billTo?.gstin || h.customer.get(i.customerNumber)?.gstin || 'Unregistered',
        state: stateName(i.placeOfSupply),
        job: i.linkedJobId ? h.job.get(i.linkedJobId)?.jobNumber : '',
        quotation: i.quotationId ? h.quotation.get(i.quotationId)?.quotationNo : '',
        taxable: i.totalAmount,
        cgst: i.totalCgst,
        sgst: i.totalSgst,
        igst: i.totalIgst || 0,
        total: i.grandTotal,
        credit: i.creditNoteTotal || 0,
        net: invoiceNetTotal(i),
        paid: i.amountPaid,
        balance: i.balanceDue,
        status: isCancelledInvoice(i)
          ? `Cancelled — ${i.cancelReason || ''}`.trim()
          : i.balanceDue <= 0
          ? 'Paid'
          : i.amountPaid > 0
          ? 'Part paid'
          : 'Unpaid',
      })),
    },
    {
      name: 'Credit notes',
      columns: [
        { header: 'Credit note', key: 'no' },
        { header: 'Date', key: 'date', type: 'date' },
        { header: 'Invoice', key: 'invoice' },
        { header: 'Customer', key: 'customer' },
        { header: 'Reason', key: 'reason' },
        { header: 'Taxable (₹)', key: 'taxable', type: 'money' },
        { header: 'Total (₹)', key: 'total', type: 'money' },
        { header: 'Refunded (₹)', key: 'refunded', type: 'money' },
      ],
      rows: oldestFirst(state.creditNotes, (c) => c.date).map((c) => ({
        no: c.creditNoteNo,
        date: c.date,
        invoice: c.invoiceNo,
        customer: c.billTo?.name || h.custName(c.customerNumber),
        reason: [creditNoteReasonLabel(c.reason), c.reasonNote].filter(Boolean).join(' — '),
        taxable: c.totalAmount,
        total: c.grandTotal,
        refunded: c.refundedAmount,
      })),
      totalKeys: ['taxable', 'total', 'refunded'],
    },
    {
      name: 'Payments',
      columns: [
        { header: 'Receipt', key: 'receipt' },
        { header: 'Date', key: 'date', type: 'date' },
        { header: 'Customer', key: 'customer' },
        { header: 'Invoice', key: 'invoice' },
        { header: 'Type', key: 'type' },
        { header: 'Mode', key: 'mode' },
        { header: 'Amount (₹)', key: 'amount', type: 'money' },
        { header: 'UTR / cheque no.', key: 'ref' },
      ],
      rows: oldestFirst(state.payments, (p) => `${p.date} ${p.receiptNo || ''}`).map((p) => ({
        receipt: p.receiptNo,
        date: p.date,
        customer: h.custName(p.customerNumber),
        invoice: p.invoiceId
          ? h.invoice.get(p.invoiceId)?.invoiceNo
          : p.quotationId
          ? `Advance — ${h.quotation.get(p.quotationId)?.quotationNo || ''}`
          : 'Advance',
        type: humanize(p.type),
        mode: p.mode,
        amount: p.amount,
        ref: p.referenceNo,
      })),
      totalKeys: ['amount'],
    },
    stockSummarySheet(state),
    stockSheet(state, state.serialUnits),
    {
      name: 'Suppliers',
      columns: [
        { header: 'Supplier', key: 'name' },
        { header: 'Contact person', key: 'contact' },
        { header: 'Mobile', key: 'phone' },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'GSTIN', key: 'gstin' },
      ],
      rows: state.vendors.map((v) => ({
        name: v.name,
        contact: v.contactPerson,
        phone: v.phone,
        address: v.address,
        gstin: v.gstin,
      })),
    },
    repairsSheet(state, state.repairTickets),
    {
      name: 'Staff',
      columns: [
        { header: 'Staff no.', key: 'code' },
        { header: 'Name', key: 'name' },
        { header: 'Role', key: 'role' },
        { header: 'Mobile', key: 'phone' },
        { header: 'Email', key: 'email' },
        { header: 'Monthly salary (₹)', key: 'salary', type: 'money' },
        { header: 'Per service job (₹)', key: 'service', type: 'money' },
        { header: 'Per installation job (₹)', key: 'installation', type: 'money' },
        { header: 'Paid leave / month', key: 'paidLeave', type: 'number' },
        { header: 'Casual leave / month', key: 'casualLeave', type: 'number' },
      ],
      rows: state.users.map((u) => {
        const pay = state.payProfiles.find((p) => p.id === u.id);
        return {
          code: u.staffCode,
          name: u.name,
          role: humanize(u.role),
          phone: u.phone,
          email: u.email,
          salary: pay?.monthlySalary,
          service: pay?.serviceIncentive,
          installation: pay?.installationIncentive,
          paidLeave: pay?.paidLeavePerMonth,
          casualLeave: pay?.casualLeavePerMonth,
        };
      }),
    },
    {
      name: 'Leave',
      columns: [
        { header: 'Staff', key: 'name' },
        { header: 'Type', key: 'type' },
        { header: 'From', key: 'from', type: 'date' },
        { header: 'To', key: 'to', type: 'date' },
        { header: 'Days', key: 'days', type: 'number' },
        { header: 'Reason', key: 'reason', width: 40 },
      ],
      rows: oldestFirst(state.leaveRecords, (l) => l.from).map((l) => ({
        name: h.userName(l.userId),
        type: leaveTypeLabel(l.type) + (l.halfDay ? ' (half day)' : ''),
        from: l.from,
        to: l.to,
        days: leaveDays(l),
        reason: l.reason,
      })),
      totalKeys: ['days'],
    },
  ];
}
