import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Job, LineItem, Invoice } from '@/lib/stecsecure-types';
import { X, Plus, Trash2, ReceiptText, ShieldAlert, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { formatINR } from '@/lib/utils';
import { toast } from 'sonner';

interface JobInvoiceModalProps {
  isOpen: boolean;
  job: Job | null;
  onClose: () => void;
  onInvoiceCreated: (invoice: Invoice) => void;
}

export const JobInvoiceModal: React.FC<JobInvoiceModalProps> = ({
  isOpen,
  job,
  onClose,
  onInvoiceCreated,
}) => {
  const { customers, getJobMaterials, raiseJobInvoice, products } = useStecSecure();

  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'NEFT' | 'CHEQUE' | 'PENDING'>('UPI');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [terms, setTerms] = useState<string>(
    '1. Payment due within 7 days of invoice.\n2. Standard 1-Year hardware warranty on installed devices.\n3. Physical damages, unauthorized tampering or power surges not covered under warranty.'
  );

  // Initialize line items from job when opened
  useEffect(() => {
    if (!job) return;

    const items: LineItem[] = [];
    const gstRate = job.taxable ? 18 : 0;

    // 1. Service / Labor item
    if (job.serviceAmount > 0) {
      const amt = job.serviceAmount;
      const cgst = Number((amt * (gstRate / 200)).toFixed(2));
      const sgst = Number((amt * (gstRate / 200)).toFixed(2));
      items.push({
        itemName: `${job.type === 'INSTALLATION' ? 'Installation & Commissioning' : 'Service & Labor'} - ${job.category}`,
        description: job.problemReported || `On-site ${job.category} technical services`,
        hsnSac: '998719',
        gstRate,
        qty: 1,
        rate: amt,
        amount: amt,
        cgst,
        sgst,
        total: Number((amt + cgst + sgst).toFixed(2)),
      });
    }

    // 2. Materials used during job
    const materials = getJobMaterials(job.id);
    materials.forEach((mat) => {
      const netQty = Math.max(0, mat.deliveredQty - mat.returnedQty);
      if (netQty > 0) {
        // match with product if available
        const matchedProd = products.find((p) => p.name.toLowerCase().includes(mat.materialName.toLowerCase()));
        const rate = matchedProd ? matchedProd.defaultRate : 350;
        const hsn = matchedProd?.hsnSac || '85258090';
        const amt = netQty * rate;
        const cgst = Number((amt * (gstRate / 200)).toFixed(2));
        const sgst = Number((amt * (gstRate / 200)).toFixed(2));

        items.push({
          itemName: mat.materialName,
          description: `Material consumed during ${job.jobNumber}`,
          hsnSac: hsn,
          gstRate,
          qty: netQty,
          rate,
          amount: amt,
          cgst,
          sgst,
          total: Number((amt + cgst + sgst).toFixed(2)),
        });
      }
    });

    // If still empty, add default line
    if (items.length === 0) {
      items.push({
        itemName: 'Field Service Call Charges',
        description: 'Standard technical inspection and resolution',
        hsnSac: '998719',
        gstRate,
        qty: 1,
        rate: 1000,
        amount: 1000,
        cgst: Number((1000 * (gstRate / 200)).toFixed(2)),
        sgst: Number((1000 * (gstRate / 200)).toFixed(2)),
        total: Number((1000 + 1000 * (gstRate / 100)).toFixed(2)),
      });
    }

    setLineItems(items);

    // Default amount paid to total
    const total = items.reduce((sum, item) => sum + item.total, 0);
    setAmountPaid(Math.round(total));
  }, [job]);

  if (!isOpen || !job) return null;

  const customer = customers.find((c) => c.id === job.customerNumber);

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setLineItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], ...updates };
      const amt = Number((item.qty * item.rate).toFixed(2));
      const cgst = Number((amt * (item.gstRate / 200)).toFixed(2));
      const sgst = Number((amt * (item.gstRate / 200)).toFixed(2));
      const total = Number((amt + cgst + sgst).toFixed(2));

      updated[index] = {
        ...item,
        amount: amt,
        cgst,
        sgst,
        total,
      };
      return updated;
    });
  };

  const addItem = () => {
    const gstRate = job.taxable ? 18 : 0;
    const newItem: LineItem = {
      itemName: 'Additional Accessory / Service Item',
      description: 'Accessories & components',
      hsnSac: '85258090',
      gstRate,
      qty: 1,
      rate: 500,
      amount: 500,
      cgst: Number((500 * (gstRate / 200)).toFixed(2)),
      sgst: Number((500 * (gstRate / 200)).toFixed(2)),
      total: Number((500 + 500 * (gstRate / 100)).toFixed(2)),
    };
    setLineItems((prev) => [...prev, newItem]);
  };

  const removeItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const subTotal = lineItems.reduce((acc, item) => acc + item.amount, 0);
  const totalCgst = lineItems.reduce((acc, item) => acc + item.cgst, 0);
  const totalSgst = lineItems.reduce((acc, item) => acc + item.sgst, 0);
  const rawTotal = subTotal + totalCgst + totalSgst;
  const grandTotal = Math.round(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));

  const handleGenerateInvoice = () => {
    if (lineItems.length === 0) {
      toast.error('Please include at least one invoice line item');
      return;
    }

    const created = raiseJobInvoice(job.id, {
      lineItems,
      termsAndConditions: terms,
      paymentMode,
      amountPaid: Number(amountPaid) || 0,
      validityDays: 15,
      beforePhotoUrl: job.beforePhotoUrl,
      afterPhotoUrl: job.afterPhotoUrl,
    });

    toast.success(`Invoice ${created.invoiceNo} generated. Job status updated to Awaiting OTP.`);
    onInvoiceCreated(created);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      showCloseButton={false}
      className="max-h-[90vh]"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
            <ReceiptText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">Raise Job Invoice</h2>
            <p className="text-xs text-slate-500">
              Generate GST-compliant tax invoice for {job.jobNumber} &bull; {customer?.name}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs overscroll-contain">
          {/* Customer & Job Meta Info */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold">Bill To:</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</div>
              <div className="text-slate-600">{customer?.address}</div>
              <div className="text-slate-600">Phone: {customer?.phone}</div>
              {customer?.gstin && <div className="font-mono text-orange-600 font-semibold">GSTIN: {customer.gstin}</div>}
            </div>
            <div className="sm:text-right space-y-0.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Job Details:</div>
              <div className="font-mono text-orange-600 font-bold">{job.jobNumber}</div>
              <div>Category: {job.category} ({job.type})</div>
              <div>Status: {job.customerStatus}</div>
              <div className="text-emerald-700 font-semibold">
                GST: {job.taxable ? '18% Applicable (CGST 9% + SGST 9%)' : '0% Exempted'}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Invoice Line Items</span>
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line Item
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Item Description</th>
                    <th className="p-2.5 w-20">HSN</th>
                    <th className="p-2.5 w-16 text-center">Qty</th>
                    <th className="p-2.5 w-24 text-right">Rate (₹)</th>
                    <th className="p-2.5 w-28 text-right">GST</th>
                    <th className="p-2.5 w-24 text-right">Total (₹)</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2">
                        <Input
                          value={item.itemName}
                          onChange={(e) => updateItem(idx, { itemName: e.target.value })}
                          className="h-8 text-xs bg-white font-medium text-slate-900"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={item.hsnSac}
                          onChange={(e) => updateItem(idx, { hsnSac: e.target.value })}
                          className="h-8 text-xs font-mono bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 1 })}
                          className="h-8 text-xs text-center bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="0"
                          value={item.rate}
                          onChange={(e) => updateItem(idx, { rate: Number(e.target.value) || 0 })}
                          className="h-8 text-xs text-right bg-white font-mono"
                        />
                      </td>
                      <td className="p-2 text-right text-[11px] text-slate-500 font-medium">
                        {item.gstRate}% (₹{(item.cgst + item.sgst).toFixed(2)})
                      </td>
                      <td className="p-2 text-right font-bold text-slate-900 font-mono">
                        {formatINR(item.total)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          disabled={lineItems.length === 1}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals & Commercial Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Mode</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['UPI', 'CASH', 'NEFT', 'PENDING'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`h-8 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                        paymentMode === mode
                          ? 'bg-orange-500 border-orange-500 text-white shadow-2xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Amount Collected (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                  className="h-8 text-xs bg-white font-mono font-bold"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex justify-between text-slate-700">
                <span>Taxable Value:</span>
                <span className="font-semibold text-slate-900">{formatINR(subTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>CGST (9%):</span>
                <span className="font-mono">{formatINR(totalCgst)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>SGST (9%):</span>
                <span className="font-mono">{formatINR(totalSgst)}</span>
              </div>
              {roundOff !== 0 && (
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Round Off:</span>
                  <span className="font-mono">{formatINR(roundOff)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-emerald-700 font-mono">
                <span>Grand Total:</span>
                <span>{formatINR(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

      {/* Pinned Action Buttons Footer */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
        <Button type="button" variant="secondary" size="md" onClick={onClose} className="rounded-xl">
          Cancel
        </Button>
        <Button type="button" variant="success" size="md" onClick={handleGenerateInvoice} className="rounded-xl font-semibold">
          <ReceiptText className="w-4 h-4 mr-1.5" />
          Raise Invoice & Proceed to OTP
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </Modal>
  );
};
