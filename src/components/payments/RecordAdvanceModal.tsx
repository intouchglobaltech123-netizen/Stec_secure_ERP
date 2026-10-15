import React, { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { localDateISO } from '@/lib/numbering';
import { formatINR } from '@/lib/utils';
import { Job, PaymentMode, Quotation } from '@/lib/stecsecure-types';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const MODES: PaymentMode[] = ['UPI', 'CASH', 'NEFT', 'CHEQUE'];

// Phase 22: record money received before work / invoicing, against a quotation or a job.
// The server applies it to the invoice automatically when that quotation or job is invoiced.
export const RecordAdvanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  quotation?: Quotation | null;
  job?: Job | null;
}> = ({ isOpen, onClose, quotation, job }) => {
  const { payments, getCustomer, recordAdvance } = useStecSecure();
  const [amount, setAmount] = useState<number | ''>('');
  const [mode, setMode] = useState<PaymentMode>('UPI');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(localDateISO());
  const [saving, setSaving] = useState(false);

  // Advances already received for this quotation / job and not yet on an invoice
  const received = payments
    .filter(
      (p) =>
        !p.invoiceId &&
        ((quotation && p.quotationId === quotation.id) || (job && p.jobId === job.id))
    )
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = quotation ? Math.max(0, quotation.grandTotal - received) : undefined;

  useEffect(() => {
    if (!isOpen) return;
    // Suggest the customary 50% of the quotation, never more than what is left
    setAmount(quotation ? Math.min(Math.round(quotation.grandTotal / 2), remaining ?? 0) || '' : '');
    setMode('UPI');
    setReference('');
    setDate(localDateISO());
  }, [isOpen, quotation?.id, job?.id]);

  const customer = getCustomer(quotation?.customerNumber ?? job?.customerNumber ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      toast.error('Enter the advance amount.');
      return;
    }
    setSaving(true);
    try {
      const advance = await recordAdvance({
        quotationId: quotation?.id,
        jobId: job?.id,
        amount: Number(amount),
        paymentMode: mode,
        referenceNo: reference.trim() || undefined,
        date,
      });
      toast.success(`Advance of ${formatINR(advance.amount)} recorded — receipt ${advance.receiptNo}.`);
      onClose();
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
      maxWidth="sm"
      title="Record advance"
      subtitle={quotation ? `Quotation ${quotation.quotationNo}` : job ? `Job ${job.jobNumber}` : undefined}
      icon={<Wallet className="w-5 h-5 text-orange-600" />}
    >
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
          <div className="font-semibold text-slate-900">{customer?.name || 'Customer'}</div>
          {quotation && (
            <div className="flex justify-between text-slate-600">
              <span>Quotation total</span>
              <span className="font-mono">{formatINR(quotation.grandTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>Advance already received</span>
            <span className="font-mono">{formatINR(received)}</span>
          </div>
          <p className="text-[11px] text-slate-500 pt-1">
            The advance is deducted automatically from the final invoice for this{' '}
            {quotation ? 'quotation' : 'job'}.
          </p>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Amount received (₹)</label>
          <Input
            type="number"
            min={1}
            max={remaining}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-9 font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Payment mode</label>
          <div className="grid grid-cols-4 gap-1.5">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`h-8 rounded-lg border text-[11px] font-bold cursor-pointer ${
                  mode === m ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">UTR / cheque no. (optional)</label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 font-mono" />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Date</label>
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Record advance'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
