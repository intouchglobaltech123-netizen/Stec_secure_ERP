import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Download, FileMinus, Printer, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { exportElementToPdfWithToast } from '@/lib/pdf-generator';
import { CreditNote, CreditNoteReason, Invoice, PaymentMode } from '@/lib/stecsecure-types';
import { COMPANY_STATE_CODE, customerStateCode, isInterState, splitLineTax, taxTotals } from '@/lib/gst';
import { CREDIT_NOTE_REASONS, invoiceNetTotal, invoiceRefundDue } from '@/lib/invoice-status';
import type { CancelInvoiceResult } from '@/lib/erp/actions/invoiceCorrections';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditNoteDocument } from '@/components/invoices/TaxInvoiceDocument';
import { FitToWidth } from '@/components/ui/fit-to-width';

const labelCls = 'block font-semibold text-slate-700 mb-1';
const MODES: PaymentMode[] = ['UPI', 'CASH', 'NEFT', 'CHEQUE'];

// Step 3: cancel an invoice before money is received against it, optionally re-issuing it under a new
// number (e.g. to the right customer). Advances taken before invoicing move to the re-issued invoice.
export const CancelInvoiceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onDone?: (result: CancelInvoiceResult) => void;
}> = ({ isOpen, onClose, invoice, onDone }) => {
  const { cancelInvoice, payments, customers } = useStecSecure();
  const [reason, setReason] = useState('');
  const [reissue, setReissue] = useState(false);
  const [customerNumber, setCustomerNumber] = useState(invoice.customerNumber);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setReissue(false);
      setCustomerNumber(invoice.customerNumber);
    }
  }, [isOpen, invoice.id, invoice.customerNumber]);

  const onInvoice = payments.filter((p) => p.invoiceId === invoice.id);
  const advances = onInvoice.filter((p) => p.quotationId || p.jobId);
  const received = onInvoice.filter((p) => !(p.quotationId || p.jobId));
  const receivedTotal = received.reduce((sum, p) => sum + p.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const result = await cancelInvoice(invoice.id, reason, reissue ? { customerNumber } : undefined);
      toast.success(
        result.replacement
          ? `${invoice.invoiceNo} cancelled and re-issued as ${result.replacement.invoiceNo}.`
          : `${invoice.invoiceNo} cancelled.`
      );
      onClose();
      onDone?.(result);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={`Cancel ${invoice.invoiceNo}?`}
      icon={<Ban className="w-5 h-5 text-rose-600" />}
    >
      {received.length > 0 ? (
        <div className="space-y-3 text-[13px]">
          <p className="text-slate-700">
            {formatINR(receivedTotal)} has already been received against this invoice, so it cannot be cancelled.
            Issue a <strong>credit note</strong> to reduce it instead.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 text-[13px]">
          <p className="text-slate-600">
            The invoice stays on record, stamped <strong>Cancelled</strong>, and its number is not reused. It stops
            counting in balances and reports, and its job, quotation or challan can be invoiced again.
          </p>
          {advances.length > 0 && (
            <p className="text-slate-600">
              The {formatINR(advances.reduce((s, p) => s + p.amount, 0))} advance on it goes back to its quotation /
              job and is applied to the next invoice raised for it.
            </p>
          )}
          <div>
            <label className={labelCls}>Reason (printed on the cancelled invoice)</label>
            <textarea
              rows={2}
              required
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Billed to the wrong customer"
              className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-[13px]"
            />
          </div>
          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!reissue} onChange={() => setReissue(false)} />
              Just cancel — nothing should be billed
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={reissue} onChange={() => setReissue(true)} />
              Re-issue the same bill under a new invoice number
            </label>
            {reissue && (
              <div className="pl-6 pt-1">
                <label className={labelCls}>Bill to</label>
                <select
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-[13px]"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.phone}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Dated today, with the customer's current details and GST state. Edit it afterwards if items need
                  correcting.
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Keep invoice
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={saving || !reason.trim()}>
              {saving ? 'Cancelling…' : reissue ? 'Cancel & re-issue' : 'Cancel invoice'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

// Step 3: credit note against an invoice — choose how much of each invoice line to credit
export const CreditNoteModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onCreated?: (creditNote: CreditNote) => void;
}> = ({ isOpen, onClose, invoice, onCreated }) => {
  const { createCreditNote, creditNotes, getCustomer } = useStecSecure();
  const [reason, setReason] = useState<CreditNoteReason>('GOODS_RETURNED');
  const [reasonNote, setReasonNote] = useState('');
  const [lines, setLines] = useState<{ qty: number; rate: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('GOODS_RETURNED');
      setReasonNote('');
      setLines(invoice.lineItems.map((l) => ({ qty: 0, rate: l.rate })));
    }
  }, [isOpen, invoice.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same place of supply as the invoice (older invoices were all within Tamil Nadu)
  const placeOfSupply =
    invoice.placeOfSupply ?? (invoice.totalIgst ? customerStateCode(getCustomer(invoice.customerNumber)) : COMPANY_STATE_CODE);
  const interState = isInterState(placeOfSupply);

  const creditedOnLine = useMemo(() => {
    const m = new Map<number, number>();
    for (const cn of creditNotes.filter((c) => c.invoiceId === invoice.id)) {
      for (const l of cn.lineItems) m.set(l.sourceLine, (m.get(l.sourceLine) || 0) + l.amount);
    }
    return m;
  }, [creditNotes, invoice.id]);

  const credited = lines
    .map((l, idx) =>
      l.qty > 0 && l.rate > 0
        ? splitLineTax({ ...invoice.lineItems[idx], qty: l.qty, rate: l.rate, amount: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }, interState)
        : null
    )
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const totals = taxTotals(credited);
  const netAfter = Math.max(0, invoiceNetTotal(invoice) - totals.grandTotal);
  const refundAfter = Math.max(0, (invoice.amountPaid || 0) - netAfter);

  const setLine = (idx: number, patch: Partial<{ qty: number; rate: number }>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const cn = await createCreditNote({
        invoiceId: invoice.id,
        reason,
        reasonNote,
        lines: lines.map((l, sourceLine) => ({ sourceLine, ...l })).filter((l) => l.qty > 0 && l.rate > 0),
      });
      toast.success(`Credit note ${cn.creditNoteNo} issued for ${formatINR(cn.grandTotal)}.`);
      onClose();
      onCreated?.(cn);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={`Credit note against ${invoice.invoiceNo}`}
      subtitle="Reduces what the invoice bills. Tax follows the original invoice."
      icon={<FileMinus className="w-5 h-5 text-orange-600" />}
    >
      <form onSubmit={handleSubmit} className="space-y-3 text-[13px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as CreditNoteReason)}
              className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-[13px]"
            >
              {CREDIT_NOTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Details {reason === 'OTHER' ? '(required)' : '(optional)'}</label>
            <Input
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="e.g. 1 camera returned unused"
              className="h-8 text-[13px] bg-white"
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          <table className="stack-on-phone w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-2">Invoice line</th>
                <th className="p-2 text-right">Invoiced</th>
                <th className="p-2 text-right">Credited so far</th>
                <th className="p-2 w-20">Credit qty</th>
                <th className="p-2 w-28">Credit rate (₹)</th>
                <th className="p-2 text-right">Credit (before tax)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.lineItems.map((item, idx) => {
                const line = lines[idx] ?? { qty: 0, rate: item.rate };
                const already = creditedOnLine.get(idx) || 0;
                return (
                  <tr key={idx}>
                    <td className="p-2">
                      <div className="font-semibold text-slate-900">{item.itemName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {item.hsnSac} · {item.gstRate}% GST
                      </div>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {item.qty} × {formatINR(item.rate)}
                    </td>
                    <td className="p-2 text-right">{already ? formatINR(already) : '—'}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        max={item.qty}
                        step="any"
                        value={line.qty}
                        onChange={(e) => setLine(idx, { qty: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 text-[13px] bg-white text-center"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        max={item.rate}
                        step="any"
                        value={line.rate}
                        onChange={(e) => setLine(idx, { rate: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 text-[13px] bg-white text-right font-mono"
                      />
                    </td>
                    <td className="p-2 text-right font-mono">{formatINR(line.qty * line.rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Returned goods: enter the quantity returned at the invoiced rate. Price correction or discount: enter the
          quantity and the reduction per unit. Returned serial-numbered items must be put back into stock from
          Inventory.
        </p>

        <div className="ml-auto w-full sm:w-72 space-y-1 rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="flex justify-between">
            <span>Taxable value</span>
            <span className="font-mono">{formatINR(totals.totalAmount)}</span>
          </div>
          {interState ? (
            <div className="flex justify-between">
              <span>IGST</span>
              <span className="font-mono">{formatINR(totals.totalIgst)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span>CGST</span>
                <span className="font-mono">{formatINR(totals.totalCgst)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST</span>
                <span className="font-mono">{formatINR(totals.totalSgst)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-bold text-sm border-t border-slate-300 pt-1">
            <span>Credit note value</span>
            <span className="font-mono">{formatINR(totals.grandTotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Invoice then bills</span>
            <span className="font-mono">{formatINR(netAfter)}</span>
          </div>
          {refundAfter > 0 && (
            <div className="flex justify-between text-amber-700 font-semibold">
              <span>Refund due to customer</span>
              <span className="font-mono">{formatINR(refundAfter)}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" size="sm" disabled={saving || totals.grandTotal <= 0}>
            {saving ? 'Issuing…' : 'Issue credit note'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Step 3: view / print a credit note and record the refund it leaves due
export const CreditNotePreviewModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  creditNote: CreditNote | null;
}> = ({ isOpen, onClose, creditNote }) => {
  const { creditNotes, invoices, isManagement, recordCreditNoteRefund } = useStecSecure();
  const cn = creditNote ? creditNotes.find((c) => c.id === creditNote.id) ?? creditNote : null;
  const invoice = cn ? invoices.find((i) => i.id === cn.invoiceId) : undefined;
  const refundable = cn && invoice ? Math.max(0, Math.min(cn.grandTotal - (cn.refundedAmount || 0), invoiceRefundDue(invoice))) : 0;

  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [referenceNo, setReferenceNo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount(refundable);
      setMode('UPI');
      setReferenceNo('');
    }
  }, [isOpen, cn?.id, refundable]);

  if (!isOpen || !cn) return null;

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const refund = await recordCreditNoteRefund({ creditNoteId: cn.id, amount, paymentMode: mode, referenceNo });
      toast.success(`Refund ${refund.receiptNo} of ${formatINR(-refund.amount)} recorded.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      showCloseButton={false}
      className="max-h-[92vh]"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <Badge variant="orange" className="text-[13px] font-mono font-bold">
            {cn.creditNoteNo}
          </Badge>
          <span className="text-xs font-mono text-slate-500">against {cn.invoiceNo}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportElementToPdfWithToast('printable-credit-note-doc', { filename: `CreditNote-${cn.creditNoteNo}-${cn.billTo.name}` })}
            className="h-8 text-[13px] rounded-lg"
          >
            <Download className="w-3.5 h-3.5 mr-1" /> Download PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="h-8 text-[13px] rounded-lg">
            <Printer className="w-3.5 h-3.5 mr-1" /> Print
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
        {isManagement && refundable > 0 && (
          <form
            onSubmit={handleRefund}
            className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] space-y-2"
          >
            <div className="font-semibold text-amber-900 flex items-center gap-1.5">
              <Undo2 className="w-4 h-4" /> {formatINR(refundable)} is due back to the customer
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className={labelCls}>Amount (₹)</label>
                <Input
                  type="number"
                  min="0"
                  max={refundable}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className="h-8 text-[13px] bg-white font-mono"
                />
              </div>
              <div>
                <label className={labelCls}>Paid by</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PaymentMode)}
                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-[13px]"
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>UTR / cheque no.</label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="h-8 text-[13px] bg-white" />
              </div>
              <Button type="submit" size="sm" disabled={saving || !(amount > 0)}>
                {saving ? 'Saving…' : 'Record refund'}
              </Button>
            </div>
          </form>
        )}
        <FitToWidth>
          <CreditNoteDocument creditNote={cn} />
        </FitToWidth>
      </div>
    </Modal>
  );
};
