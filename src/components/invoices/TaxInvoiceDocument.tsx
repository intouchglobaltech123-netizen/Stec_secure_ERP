import React from 'react';
import { CreditNote, Customer, Invoice } from '@/lib/stecsecure-types';
import { useStecSecure } from '@/lib/stecsecure-context';
import { formatDate, formatDateTime, formatINR } from '@/lib/utils';
import { customerStateCode, placeOfSupplyLabel } from '@/lib/gst';
import { creditNoteReasonLabel, invoiceNetTotal, invoiceRefundDue, isCancelledInvoice } from '@/lib/invoice-status';
import { GstDocument } from '@/components/invoices/GstDocument';

// Step 3: the printable GST tax invoice. A cancelled invoice is shown stamped CANCELLED with the
// reason; credit notes against it are deducted below the total.
export const TaxInvoiceDocument: React.FC<{ invoice: Invoice; customer?: Customer }> = ({ invoice, customer }) => {
  const { invoices, creditNotes } = useStecSecure();
  // Older invoices have no snapshot / place of supply — fall back to the customer record
  const placeOfSupply = invoice.placeOfSupply ?? customerStateCode(customer);
  const billTo = invoice.billTo ?? {
    name: customer?.name ?? invoice.customerNumber,
    address: customer?.address ?? '',
    phone: customer?.phone ?? '',
    gstin: customer?.gstin,
    stateCode: placeOfSupply,
  };
  const cancelled = isCancelledInvoice(invoice);
  const invoiceNoOf = (id?: string) => invoices.find((i) => i.id === id)?.invoiceNo;
  const notes = creditNotes.filter((c) => c.invoiceId === invoice.id);
  const refundDue = invoiceRefundDue(invoice);

  const details: [string, React.ReactNode][] = [
    ['Invoice No', <span className="font-mono">{invoice.invoiceNo}</span>],
    ['Invoice Date', formatDate(invoice.date)],
    ['Place of Supply', placeOfSupplyLabel(placeOfSupply)],
    ['Reverse Charge', 'No'],
  ];
  if (invoice.validityDays) details.push(['Payment Terms', `${invoice.validityDays} days`]);
  if (invoice.replacesInvoiceId) {
    details.push(['Replaces', <span className="font-mono">{invoiceNoOf(invoice.replacesInvoiceId) ?? '—'}</span>]);
  }

  const afterTotals = cancelled
    ? []
    : [
        ...(invoice.creditNoteTotal
          ? [
              {
                label: `Less: credit notes (${notes.map((c) => c.creditNoteNo).join(', ')})`,
                value: `− ${formatINR(invoice.creditNoteTotal)}`,
                className: 'text-slate-600',
              },
              { label: 'Net payable', value: formatINR(invoiceNetTotal(invoice)), className: 'font-bold' },
            ]
          : []),
        { label: 'Amount received', value: formatINR(invoice.amountPaid), className: 'text-emerald-700 font-semibold' },
        { label: 'Balance due', value: formatINR(invoice.balanceDue), className: 'text-rose-700 font-bold' },
        ...(refundDue > 0
          ? [{ label: 'Refund due to customer', value: formatINR(refundDue), className: 'text-amber-700 font-bold' }]
          : []),
      ];

  return (
    <GstDocument
      elementId="printable-invoice-doc"
      title="TAX INVOICE"
      subtitle="Original for recipient"
      stamp={cancelled ? 'CANCELLED' : undefined}
      notice={
        cancelled ? (
          <>
            <strong>Cancelled</strong>
            {invoice.cancelledAt ? ` on ${formatDateTime(invoice.cancelledAt)}` : ''} — {invoice.cancelReason}
            {invoice.replacedByInvoiceId && (
              <>
                {' '}
                · re-issued as <strong className="font-mono">{invoiceNoOf(invoice.replacedByInvoiceId)}</strong>
              </>
            )}
          </>
        ) : undefined
      }
      details={details}
      billTo={billTo}
      placeOfSupply={placeOfSupply}
      lineItems={invoice.lineItems}
      totals={invoice}
      afterTotals={afterTotals}
      bank={invoice.bankDetails}
      notes={
        invoice.termsAndConditions && (
          <div className="whitespace-pre-line text-slate-600">
            <span className="font-semibold text-slate-800">Terms: </span>
            {invoice.termsAndConditions}
          </div>
        )
      }
      footer="This is a computer-generated invoice."
    />
  );
};

// Step 3: the printable GST credit note, referring to the invoice it reduces
export const CreditNoteDocument: React.FC<{ creditNote: CreditNote }> = ({ creditNote }) => (
  <GstDocument
    elementId="printable-credit-note-doc"
    title="CREDIT NOTE"
    subtitle="Original for recipient"
    details={[
      ['Credit Note No', <span className="font-mono">{creditNote.creditNoteNo}</span>],
      ['Date', formatDate(creditNote.date)],
      ['Against Invoice', <span className="font-mono">{creditNote.invoiceNo}</span>],
      ['Invoice Date', formatDate(creditNote.invoiceDate)],
      ['Place of Supply', placeOfSupplyLabel(creditNote.placeOfSupply)],
    ]}
    billTo={creditNote.billTo}
    billToLabel="Issued to"
    placeOfSupply={creditNote.placeOfSupply}
    lineItems={creditNote.lineItems}
    totals={creditNote}
    grandTotalLabel="Credit note value"
    afterTotals={
      creditNote.refundedAmount
        ? [{ label: 'Refunded', value: formatINR(creditNote.refundedAmount), className: 'text-emerald-700 font-semibold' }]
        : []
    }
    bank={null}
    notes={
      <div className="text-slate-700">
        <span className="font-semibold text-slate-900">Reason: </span>
        {creditNoteReasonLabel(creditNote.reason)}
        {creditNote.reasonNote ? ` — ${creditNote.reasonNote}` : ''}
      </div>
    }
    footer="This is a computer-generated credit note."
  />
);
