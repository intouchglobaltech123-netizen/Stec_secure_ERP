import React from 'react';
import { BankDetails, COMPANY_DETAILS, LineItem } from '@/lib/stecsecure-types';
import { formatINR } from '@/lib/utils';
import { amountInWords, hsnSummary, isInterState, stateName } from '@/lib/gst';

// Step 3: the printable GST document shared by tax invoices and credit notes — supplier block,
// recipient, line items with CGST/SGST (Tamil Nadu) or IGST (other states), HSN/SAC summary, totals
// and amount in words. `elementId` is what PDF export captures.
export interface GstDocumentProps {
  elementId: string;
  title: string;
  subtitle?: string;
  stamp?: string; // e.g. CANCELLED, shown across the document
  notice?: React.ReactNode; // highlighted line under the header
  details: [string, React.ReactNode][];
  billTo: { name: string; address: string; phone: string; gstin?: string; stateCode: string };
  billToLabel?: string;
  placeOfSupply: string;
  lineItems: LineItem[];
  totals: { totalAmount: number; totalCgst: number; totalSgst: number; totalIgst?: number; roundOff: number; grandTotal: number };
  grandTotalLabel?: string;
  afterTotals?: { label: string; value: string; className?: string }[];
  notes?: React.ReactNode;
  bank?: Partial<BankDetails> | null;
  footer?: string;
}

export const GstDocument: React.FC<GstDocumentProps> = ({
  elementId,
  title,
  subtitle,
  stamp,
  notice,
  details,
  billTo,
  billToLabel = 'Billed to',
  placeOfSupply,
  lineItems,
  totals,
  grandTotalLabel = 'Grand total',
  afterTotals = [],
  notes,
  bank,
  footer = 'This is a computer-generated document.',
}) => {
  const interState = isInterState(placeOfSupply) || Boolean(totals.totalIgst);
  const summary = hsnSummary(lineItems);
  const totalTax = (totals.totalCgst || 0) + (totals.totalSgst || 0) + (totals.totalIgst || 0);
  const cell = 'py-1.5 px-2';

  return (
    <div
      id={elementId}
      className="relative p-6 rounded-xl bg-white text-slate-900 font-sans shadow-xs border border-slate-200 print:shadow-none print:p-0 overflow-hidden"
    >
      {stamp && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="-rotate-[24deg] border-[6px] border-rose-500/70 text-rose-500/70 rounded-xl px-8 py-2 text-6xl font-black tracking-[0.2em]">
            {stamp}
          </div>
        </div>
      )}

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
          <div className="text-lg font-black tracking-wide">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-500 uppercase">{subtitle}</div>}
        </div>
      </div>

      {notice && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">{notice}</div>
      )}

      {/* Recipient + document details */}
      <div className="py-3 border-b border-slate-200 grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">{billToLabel}</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">{billTo.name}</div>
          {billTo.address && <div className="text-slate-600">{billTo.address}</div>}
          {billTo.phone && <div className="text-slate-600 font-mono">Phone: {billTo.phone}</div>}
          <div className="text-slate-700 font-mono font-semibold">GSTIN: {billTo.gstin || 'Unregistered'}</div>
          <div className="text-slate-600">
            State: {stateName(billTo.stateCode)} ({billTo.stateCode})
          </div>
        </div>
        <div className="text-right space-y-0.5">
          {details.map(([label, value]) => (
            <div key={label}>
              {label}: <span className="font-semibold">{value}</span>
            </div>
          ))}
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
            {lineItems.map((item, idx) => (
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
      <div className="grid grid-cols-5 gap-4 pt-2 border-t border-slate-200">
        <div className="col-span-3 overflow-x-auto">
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

        <div className="col-span-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span>Taxable value</span>
            <span className="font-semibold">{formatINR(totals.totalAmount)}</span>
          </div>
          {interState ? (
            <div className="flex justify-between">
              <span>IGST</span>
              <span>{formatINR(totals.totalIgst || 0)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span>CGST</span>
                <span>{formatINR(totals.totalCgst)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <span>{formatINR(totals.totalSgst)}</span>
              </div>
            </>
          )}
          {totals.roundOff !== 0 && (
            <div className="flex justify-between text-slate-600 text-[11px]">
              <span>Round off</span>
              <span>{formatINR(totals.roundOff)}</span>
            </div>
          )}
          <div className="pt-1.5 border-t-2 border-slate-900 flex justify-between text-sm font-black">
            <span>{grandTotalLabel}</span>
            <span>{formatINR(totals.grandTotal)}</span>
          </div>
          {afterTotals.map((row) => (
            <div key={row.label} className={`flex justify-between ${row.className || ''}`}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
          <div className="text-[10px] text-slate-500">Total tax: {formatINR(totalTax)}</div>
        </div>
      </div>

      <div className="mt-2 text-xs">
        <span className="font-semibold">Amount in words: </span>
        {amountInWords(totals.grandTotal)}
      </div>

      {/* Bank, notes, signature */}
      <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-4 text-[11px]">
        <div className="space-y-2">
          {bank !== null && (
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-0.5">
              <div className="font-bold text-slate-900">Bank details</div>
              <div>
                A/C name: <strong>{COMPANY_DETAILS.bank.accountName}</strong> · Bank:{' '}
                <strong>{bank?.bankName || COMPANY_DETAILS.bank.bankName}</strong>
              </div>
              <div>
                A/C no: <strong className="font-mono">{bank?.accountNumber || COMPANY_DETAILS.bank.accountNumber}</strong>
              </div>
              <div>
                IFSC: <strong className="font-mono">{bank?.ifscCode || COMPANY_DETAILS.bank.ifscCode}</strong> · Branch:{' '}
                {bank?.branch || COMPANY_DETAILS.bank.branch}
              </div>
            </div>
          )}
          {notes}
        </div>
        <div className="text-right flex flex-col justify-between">
          <div className="font-bold">For {COMPANY_DETAILS.legalName}</div>
          <div className="text-slate-500 border-t border-slate-300 pt-1 inline-block self-end mt-10">Authorised Signatory</div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-slate-400">{footer}</div>
    </div>
  );
};
