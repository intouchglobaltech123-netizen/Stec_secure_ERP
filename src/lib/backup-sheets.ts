// Step 3: the readable Excel copy inside a backup ZIP — one sheet per kind of record. The JSON file next
// to it is what gets restored; this copy is for people to open and read.
import type { ErpState } from './erp/core';
import type { SheetSpec } from './excel-book';
import { humanize } from './utils';
import { stateName, customerStateCode } from './gst';
import { creditNoteReasonLabel, invoiceNetTotal, isCancelledInvoice } from './invoice-status';
import { quotationStatusMeta } from './quotation-status';

export function backupSheets(state: ErpState): SheetSpec[] {
  const customer = new Map(state.customers.map((c) => [c.id, c]));
  const user = new Map(state.users.map((u) => [u.id, u]));
  const product = new Map(state.products.map((p) => [p.id, p]));
  const vendor = new Map(state.vendors.map((v) => [v.id, v]));
  const job = new Map(state.jobs.map((j) => [j.id, j]));
  const invoice = new Map(state.invoices.map((i) => [i.id, i]));
  const quotation = new Map(state.quotations.map((q) => [q.id, q]));
  const custName = (id?: string) => (id ? customer.get(id)?.name || id : '');
  const userName = (id?: string | null) => (id ? user.get(id)?.name || id : '');
  const oldestFirst = <T,>(list: T[], key: (x: T) => string) => [...list].sort((a, b) => key(a).localeCompare(key(b)));

  return [
    {
      name: 'Customers',
      columns: [
        { header: 'Customer ID', key: 'id' },
        { header: 'Name', key: 'name' },
        { header: 'Mobile', key: 'phone' },
        { header: 'Email', key: 'email' },
        { header: 'Contact person', key: 'contact' },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'GSTIN', key: 'gstin' },
        { header: 'State', key: 'state' },
        { header: 'AMC', key: 'amc' },
        { header: 'AMC renewal', key: 'amcRenewal', type: 'date' },
        { header: 'Added on', key: 'created', type: 'date' },
      ],
      rows: oldestFirst(state.customers, (c) => c.createdAt || '').map((c) => ({
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
      })),
    },
    {
      name: 'Enquiries',
      columns: [
        { header: 'Enquiry', key: 'no' },
        { header: 'Date', key: 'date', type: 'date' },
        { header: 'Customer', key: 'customer' },
        { header: 'Mobile', key: 'phone' },
        { header: 'Type', key: 'type' },
        { header: 'Category', key: 'category' },
        { header: 'Source', key: 'source' },
        { header: 'Status', key: 'status' },
        { header: 'Job', key: 'job' },
        { header: 'Details', key: 'description', width: 50 },
      ],
      rows: oldestFirst(state.enquiries, (e) => e.createdAt).map((e) => ({
        no: e.enquiryNumber,
        date: e.createdAt,
        customer: e.customerName,
        phone: e.customerPhone,
        type: humanize(e.enquiryType),
        category: e.category,
        source: e.source,
        status: e.status === 'FOLLOW_UP' ? 'Follow-up' : humanize(e.status),
        job: e.convertedJobId ? job.get(e.convertedJobId)?.jobNumber : '',
        description: e.description,
      })),
    },
    {
      name: 'Jobs',
      columns: [
        { header: 'Job', key: 'no' },
        { header: 'Type', key: 'type' },
        { header: 'Created', key: 'created', type: 'date' },
        { header: 'Customer', key: 'customer' },
        { header: 'Category', key: 'category' },
        { header: 'Contract', key: 'contract' },
        { header: 'Status', key: 'status' },
        { header: 'Team lead', key: 'lead' },
        { header: 'Team', key: 'team' },
        { header: 'Scheduled visit', key: 'scheduled' },
        { header: 'Completed', key: 'completed', type: 'date' },
        { header: 'Hours worked', key: 'hours', type: 'number' },
        { header: 'Service charge (₹)', key: 'charge', type: 'money' },
        { header: 'Problem', key: 'problem', width: 45 },
        { header: 'What was done', key: 'action', width: 45 },
      ],
      rows: oldestFirst(state.jobs, (j) => j.createdAt).map((j) => ({
        no: j.jobNumber,
        type: humanize(j.type),
        created: j.createdAt,
        customer: custName(j.customerNumber),
        category: j.category,
        contract: humanize(j.customerStatus),
        status: humanize(j.status),
        lead: userName(j.teamLeadUserId),
        team: j.assignedTeam.map((id) => userName(id)).join(', '),
        scheduled: j.scheduledFor?.replace('T', ' '),
        completed: j.completedAt,
        hours: j.totalDurationSeconds ? Math.round((j.totalDurationSeconds / 3600) * 10) / 10 : null,
        charge: j.serviceAmount,
        problem: j.problemReported,
        action: j.actionTaken,
      })),
    },
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
        customer: custName(q.customerNumber),
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
        customer: i.billTo?.name || custName(i.customerNumber),
        phone: i.billTo?.phone || customer.get(i.customerNumber)?.phone,
        gstin: i.billTo?.gstin || customer.get(i.customerNumber)?.gstin || 'Unregistered',
        state: stateName(i.placeOfSupply),
        job: i.linkedJobId ? job.get(i.linkedJobId)?.jobNumber : '',
        quotation: i.quotationId ? quotation.get(i.quotationId)?.quotationNo : '',
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
        customer: c.billTo?.name || custName(c.customerNumber),
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
        customer: custName(p.customerNumber),
        invoice: p.invoiceId ? invoice.get(p.invoiceId)?.invoiceNo : p.quotationId ? `Advance — ${quotation.get(p.quotationId)?.quotationNo || ''}` : 'Advance',
        type: humanize(p.type),
        mode: p.mode,
        amount: p.amount,
        ref: p.referenceNo,
      })),
      totalKeys: ['amount'],
    },
    {
      name: 'Products',
      columns: [
        { header: 'Product', key: 'name' },
        { header: 'Category', key: 'category' },
        { header: 'Unit', key: 'unit' },
        { header: 'HSN / SAC', key: 'hsn' },
        { header: 'Selling rate (₹)', key: 'rate', type: 'money' },
        { header: 'GST %', key: 'gst', type: 'number' },
        { header: 'Barcode', key: 'barcode' },
        { header: 'In stock', key: 'inStock', type: 'number' },
      ],
      rows: state.products.map((p) => ({
        name: p.name,
        category: p.category,
        unit: p.unit,
        hsn: p.hsnSac,
        rate: p.defaultRate,
        gst: p.gstRate,
        barcode: p.barcode,
        inStock: state.serialUnits.filter((u) => u.productId === p.id && u.status === 'IN_STOCK').length,
      })),
    },
    {
      name: 'Stock (serial numbers)',
      columns: [
        { header: 'Serial number', key: 'serial' },
        { header: 'Product', key: 'product' },
        { header: 'Status', key: 'status' },
        { header: 'Supplier', key: 'supplier' },
        { header: 'Purchase date', key: 'bought', type: 'date' },
        { header: 'Purchase cost (₹)', key: 'cost', type: 'money' },
        { header: 'Customer', key: 'customer' },
        { header: 'Job', key: 'job' },
      ],
      rows: state.serialUnits.map((u) => ({
        serial: u.serialNumber,
        product: product.get(u.productId)?.name || u.productId,
        status: humanize(u.status),
        supplier: u.purchasedFromVendorId ? vendor.get(u.purchasedFromVendorId)?.name : '',
        bought: u.purchaseDate,
        cost: u.purchaseCost,
        customer: custName(u.soldToCustomerId),
        job: u.installedAtJobId ? job.get(u.installedAtJobId)?.jobNumber : '',
      })),
    },
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
    {
      name: 'Repairs',
      columns: [
        { header: 'Ticket', key: 'no' },
        { header: 'Opened', key: 'created', type: 'date' },
        { header: 'Customer', key: 'customer' },
        { header: 'Unit', key: 'unit' },
        { header: 'Stage', key: 'status' },
        { header: 'Repair path', key: 'path' },
        { header: 'Technician', key: 'tech' },
        { header: 'Fault', key: 'fault', width: 45 },
      ],
      rows: oldestFirst(state.repairTickets, (t) => t.createdAt).map((t) => {
        const unit = t.serialUnitId ? state.serialUnits.find((u) => u.id === t.serialUnitId) : undefined;
        return {
          no: t.ticketNumber,
          created: t.createdAt,
          customer: custName(t.customerId),
          unit: unit ? `${product.get(unit.productId)?.name || ''} (${unit.serialNumber})` : t.customUnitDescription,
          status: humanize(t.status),
          path: t.repairPath ? humanize(t.repairPath) : '',
          tech: userName(t.assignedTechnicianId),
          fault: t.faultDescription,
        };
      }),
    },
    {
      name: 'Staff',
      columns: [
        { header: 'Staff no.', key: 'code' },
        { header: 'Name', key: 'name' },
        { header: 'Role', key: 'role' },
        { header: 'Mobile', key: 'phone' },
        { header: 'Email', key: 'email' },
      ],
      rows: state.users.map((u) => ({
        code: u.staffCode,
        name: u.name,
        role: humanize(u.role),
        phone: u.phone,
        email: u.email,
      })),
    },
  ];
}
