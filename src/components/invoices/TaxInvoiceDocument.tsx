import React from 'react';
import { COMPANY_DETAILS, Customer, Invoice } from '@/lib/stecsecure-types';
import { formatDate, formatINR } from '@/lib/utils';
import {
  amountInWords,
  customerStateCode,
  hsnSummary,
  isInterState,
  placeOfSupplyLabel,
  stateName,
} from '@/lib/gst';

// Step 3: the printable GST tax invoice (CGST/SGST within Tamil Nadu, IGST otherwise) with place of
// supply, HSN/SAC summary and amount in words. Rendered for preview, print and PDF export.
export const TaxInvoiceDocument: React.FC<{ invoice: Invoice; customer?: Customer }> = ({ invoice, customer }) => {
  // Older invoices have no snapshot / place of supply — fall back to the customer record
  const placeOfSupply = invoice.placeOfSupply ?? customerStateCode(customer);
  const interState = isInterState(placeOfSupply) || Boolean(invoice.totalIgst);
  const billTo = invoice.billTo ?? {
    name: customer?.name ?? invoice.customerNumber,
    address: customer?.address ?? '',
    phone: customer?.phone ?? '',
    gstin: customer?.gstin,
    stateCode: placeOfSupply,
  };
  const summary = hsnSummary(invoice.lineItems);
  const totalTax = (invoice.totalCgst || 0) + (invoice.totalSgst || 0) + (invoice.totalIgst || 0);
  const cell = 'py-1.5 px-2';

  return (
    <div
      id="printable-invoice-doc"
      className="p-6 rounded-xl bg-white text-slate-900 font-sans shadow-xs border border-slate-200 print:shadow-none print:p-0"
    >
      {/* Supplier */}
      <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 font-display">{COMPANY_DETAILS.legalName}</h1>
          <div className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider">{COMPANY_DETAILS.tagline}</div>
          <div className="text-xs text-slate-600 mt-1">{COMPANY_DETAILS.address}</div>
          <div className="text-xs text-slate-600">
            Phone: {COMPANY_DETAILS.phone} · {COMPANY_DETAILS.email}
          </div>
          <div className="text-xs text-slate-700 font-mono font-semibold">
            GSTIN: {COMPANY_DETAILS.gstin} · PAN: {COMPANY_DETAILS.pan} · State: Tamil Nadu (33)
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-black tracking-wide">TAX INVOICE</div>
          <div className="text-[10px] text-slate-500 uppercase">Original for recipient</div>
        </div>
      </div>

      {/* Invoice details + recipient */}
      <div className="py-3 border-b border-slate-200 grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">Billed to</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">{billTo.name}</div>
          {billTo.address && <div className="text-slate-600">{billTo.address}</div>}
          {billTo.phone && <div className="text-slate-600 font-mono">Phone: {billTo.phone}</div>}
          <div className="text-slate-700 font-mono font-semibold">
            GSTIN: {billTo.gstin || 'Unregistered'}
          </div>
          <div className="text-slate-600">
            State: {stateName(billTo.stateCode)} ({billTo.stateCode})
          </div>
        </div>
        <div className="text-right space-y-0.5">
          <div>
            Invoice No: <span className="font-mono font-bold">{invoice.invoiceNo}</span>
          </div>
          <div>
            Invoice Date: <span className="font-semibold">{formatDate(invoice.date)}</span>
          </div>
          <div>
            Place of Supply: <span className="font-semibold">{placeOfSupplyLabel(placeOfSupply)}</span>
          </div>
          <div>
            Reverse Charge: <span className="font-semibold">No</span>
          </div>
          {invoice.validityDays ? (
            <div>
              Payment Terms: <span className="font-semibold">{invoice.validityDays} days</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Line items */}
      <div className="py-3 overflow-x-auto">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-900 font-bold">
              <th className={cell}>#</th>
              <th className={cell}>Description</th>
              <th className={cell}>HSN/SAC</th>
              <th className={`${cell} text-center`}>Qty</th>
              <th className={`${cell} text-right`}>Rate</th>
              <th className={`${cell} text-right`}>Taxable</th>
              <th className={`${cell} text-right`}>GST %</th>
              {interState ? (
                <th className={`${cell} text-right`}>IGST</th>
              ) : (
                <>
                  <th className={`${cell} text-right`}>CGST</th>
                  <th className={`${cell} text-right`}>SGST</th>
                </>
              )}
              <th className={`${cell} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.lineItems.map((item, idx) => (
              <tr key={idx}>
                <td className={`${cell} font-mono text-slate-500`}>{idx + 1}</td>
                <td className={cell}>
                  <div className="font-bold text-slate-900">{item.itemName}</div>
                  {item.description && <div className="text-[10px] text-slate-600">{item.description}</div>}
                </td>
                <td className={`${cell} font-mono`}>{item.hsnSac || '—'}</td>
                <td className={`${cell} text-center`}>{item.qty}</td>
                <td className={`${cell} text-right`}>{formatINR(item.rate)}</td>
                <td className={`${cell} text-right`}>{formatINR(item.amount)}</td>
                <td className={`${cell} text-right`}>{item.gstRate}%</td>
                {interState ? (
                  <td className={`${cell} text-right`}>{formatINR(item.igst || 0)}</td>
                ) : (
                  <>
                    <td className={`${cell} text-right`}>{formatINR(item.cgst)}</td>
                    <td className={`${cell} text-right`}>{formatINR(item.sgst)}</td>
                  </>
                )}
                <td className={`${cell} text-right font-bold`}>{formatINR(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* HSN/SAC summary + totals */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2 border-t border-slate-200">
        <div className="md:col-span-3 overflow-x-auto">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">HSN / SAC summary</div>
          <table className="w-full text-[10px] border border-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-1 text-left">HSN/SAC</th>
                <th className="p-1 text-right">Taxable</th>
                <th className="p-1 text-right">Rate</th>
                {interState ? (
                  <th className="p-1 text-right">IGST</th>
                ) : (
                  <>
                    <th className="p-1 text-right">CGST</th>
                    <th className="p-1 text-right">SGST</th>
                  </>
                )}
                <th className="p-1 text-right">Total tax</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={`${row.hsnSac}@${row.gstRate}`} className="border-t border-slate-200">
                  <td className="p-1 font-mono">{row.hsnSac}</td>
                  <td className="p-1 text-right">{formatINR(row.taxable)}</td>
                  <td className="p-1 text-right">{row.gstRate}%</td>
                  {interState ? (
                    <td className="p-1 text-right">{formatINR(row.igst)}</td>
                  ) : (
                    <>
                      <td className="p-1 text-right">{formatINR(row.cgst)}</td>
                      <td className="p-1 text-right">{formatINR(row.sgst)}</td>
                    </>
                  )}
                  <td className="p-1 text-right">{formatINR(row.cgst + row.sgst + row.igst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:col-span-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span>Taxable value</span>
            <span className="font-semibold">{formatINR(invoice.totalAmount)}</span>
          </div>
          {interState ? (
            <div className="flex justify-between">
              <span>IGST</span>
              <span>{formatINR(invoice.totalIgst || 0)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span>CGST</span>
                <span>{formatINR(invoice.totalCgst)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <span>{formatINR(invoice.totalSgst)}</span>
              </div>
            </>
          )}
          {invoice.roundOff !== 0 && (
            <div className="flex justify-between text-slate-600 text-[11px]">
              <span>Round off</span>
              <span>{formatINR(invoice.roundOff)}</span>
            </div>
          )}
          <div className="pt-1.5 border-t-2 border-slate-900 flex justify-between text-sm font-black">
            <span>Grand total</span>
            <span>{formatINR(invoice.grandTotal)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold">
            <span>Amount received</span>
            <span>{formatINR(invoice.amountPaid)}</span>
          </div>
          <div className="flex justify-between text-rose-700 font-bold">
            <span>Balance due</span>
            <span>{formatINR(invoice.balanceDue)}</span>
          </div>
          <div className="text-[10px] text-slate-500">Total tax: {formatINR(totalTax)}</div>
        </div>
      </div>

      <div className="mt-2 text-xs">
        <span className="font-semibold">Amount in words: </span>
        {amountInWords(invoice.grandTotal)}
      </div>

      {/* Bank, terms, signature */}
      <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-4 text-[11px]">
        <div className="space-y-2">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-0.5">
            <div className="font-bold text-slate-900">Bank details</div>
            <div>
              A/C name: <strong>{COMPANY_DETAILS.bank.accountName}</strong> · Bank:{' '}
              <strong>{invoice.bankDetails?.bankName || COMPANY_DETAILS.bank.bankName}</strong>
            </div>
            <div>
              A/C no: <strong className="font-mono">{invoice.bankDetails?.accountNumber || COMPANY_DETAILS.bank.accountNumber}</strong>
            </div>
            <div>
              IFSC: <strong className="font-mono">{invoice.bankDetails?.ifscCode || COMPANY_DETAILS.bank.ifscCode}</strong> · Branch:{' '}
              {invoice.bankDetails?.branch || COMPANY_DETAILS.bank.branch}
            </div>
          </div>
          {invoice.termsAndConditions && (
            <div className="whitespace-pre-line text-slate-600">
              <span className="font-semibold text-slate-800">Terms: </span>
              {invoice.termsAndConditions}
            </div>
          )}
        </div>
        <div className="text-right flex flex-col justify-between">
          <div className="font-bold">For {COMPANY_DETAILS.legalName}</div>
          <div className="text-slate-500 border-t border-slate-300 pt-1 inline-block self-end mt-10">Authorised Signatory</div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-slate-400">This is a computer-generated invoice.</div>
    </div>
  );
};
