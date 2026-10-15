import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Invoice, LineItem } from '@/lib/stecsecure-types';
import {
  X,
  Printer,
  Share2,
  CheckCircle2,
  Building2,
  Calendar,
  ReceiptText,
  Edit,
  Plus,
  Trash2,
  FileText,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { formatINR, formatDate } from '@/lib/utils';
import { exportElementToPdfWithToast } from '@/lib/pdf-generator';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';

interface InvoicePreviewModalProps {
  isOpen: boolean;
  invoice: Invoice | null;
  initialMode?: 'PREVIEW' | 'EDIT';
  onClose: () => void;
  onInvoiceSaved?: (invoice: Invoice) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  invoice,
  initialMode = 'PREVIEW',
  onClose,
  onInvoiceSaved,
}) => {
  const { getCustomer, updateInvoice, products, isManagement } = useStecSecure();

  const [mode, setMode] = useState<'PREVIEW' | 'EDIT'>(initialMode);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(invoice);

  // Edit form states
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [validityDays, setValidityDays] = useState<number>(15);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'NEFT' | 'CHEQUE' | 'PENDING'>('UPI');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [terms, setTerms] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invoice) {
      setActiveInvoice(invoice);
      setMode(initialMode);
      setInvoiceDate(invoice.date);
      setValidityDays(invoice.validityDays || 15);
      setLineItems(invoice.lineItems || []);
      setPaymentMode(invoice.paymentMode || 'UPI');
      setAmountPaid(invoice.amountPaid || 0);
      setTerms(invoice.termsAndConditions || '');
    }
  }, [invoice, initialMode, isOpen]);

  if (!isOpen || !activeInvoice) return null;

  const customer = getCustomer(activeInvoice.customerNumber);
  const isSettled = activeInvoice.balanceDue === 0;

  // Group line items by HSN for tax summary
  const hsnMap: Record<string, { taxable: number; cgst: number; sgst: number; rate: number }> = {};
  activeInvoice.lineItems.forEach((item) => {
    const code = item.hsnSac || 'OTHERS';
    if (!hsnMap[code]) {
      hsnMap[code] = { taxable: 0, cgst: 0, sgst: 0, rate: item.gstRate };
    }
    hsnMap[code].taxable += item.amount;
    hsnMap[code].cgst += item.cgst;
    hsnMap[code].sgst += item.sgst;
  });

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    const msg = `Dear ${customer?.name || 'Customer'},\nHere is your official S Tec Secure Tax Invoice ${activeInvoice.invoiceNo} for ₹${activeInvoice.grandTotal.toLocaleString('en-IN')}.\nAmount Paid: ₹${activeInvoice.amountPaid.toLocaleString('en-IN')}\nBalance Due: ₹${activeInvoice.balanceDue.toLocaleString('en-IN')}\nThank you for choosing S Tec Secure.`;
    const encoded = encodeURIComponent(msg);
    const phone = customer?.phone.replace(/\D/g, '') || '';
    toast.success('Opening WhatsApp to share invoice.');
    window.open(`https://wa.me/91${phone}?text=${encoded}`, '_blank');
  };

  // Line Item Math for Edit mode
  const handleUpdateItem = (index: number, updates: Partial<LineItem>) => {
    setLineItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], ...updates };
      const amt = Number((item.qty * item.rate).toFixed(2));
      const cgst = Number((amt * (item.gstRate / 200)).toFixed(2));
      const sgst = Number((amt * (item.gstRate / 200)).toFixed(2));
      const total = Number((amt + cgst + sgst).toFixed(2));

      copy[index] = {
        ...item,
        amount: amt,
        cgst,
        sgst,
        total,
      };
      return copy;
    });
  };

  const handleAddItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        itemName: '',
        description: '',
        hsnSac: '85258090',
        gstRate: 18,
        qty: 1,
        rate: 1000,
        amount: 1000,
        cgst: 90,
        sgst: 90,
        total: 1180,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handlePickProduct = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;

    handleUpdateItem(index, {
      itemName: prod.name,
      description: prod.description || `${prod.category} hardware item`,
      hsnSac: prod.hsnSac || '85258090',
      rate: prod.defaultRate,
      gstRate: prod.gstRate,
    });
  };

  // Calculations for Edit mode
  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalCgst = lineItems.reduce((sum, item) => sum + item.cgst, 0);
  const totalSgst = lineItems.reduce((sum, item) => sum + item.sgst, 0);
  const rawTotal = totalAmount + totalCgst + totalSgst;
  const grandTotal = Math.round(rawTotal);
  const roundOff = Number((grandTotal - rawTotal).toFixed(2));
  const balanceDue = Math.max(0, grandTotal - amountPaid);

  const handleSaveInvoiceChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (lineItems.length === 0) {
      toast.error('Please include at least one line item in the invoice');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateInvoice(activeInvoice.id, {
        date: invoiceDate,
        validityDays,
        lineItems,
        termsAndConditions: terms,
        paymentMode,
        amountPaid,
        balanceDue,
        totalAmount,
        totalCgst,
        totalSgst,
        roundOff,
        grandTotal,
      });

      setActiveInvoice(updated);
      toast.success(`Tax Invoice ${activeInvoice.invoiceNo} updated successfully (no duplicate created).`);
      if (onInvoiceSaved) onInvoiceSaved(updated);
      setMode('PREVIEW');
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
      {/* Top Control Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <Badge variant="orange" className="text-xs font-mono font-bold">
            {activeInvoice.invoiceNo}
          </Badge>
          <Badge
            variant={activeInvoice.balanceDue === 0 ? 'success' : 'warning'}
            className="text-xs font-bold"
          >
            {activeInvoice.balanceDue === 0 ? 'PAID FULL' : 'PAYMENT DUE'}
          </Badge>
          {activeInvoice.linkedJobId && (
            <span className="text-[11px] font-mono text-slate-500">
              Ref: {activeInvoice.linkedJobId}
            </span>
          )}
          {mode === 'EDIT' && (
            <Badge variant="secondary" className="text-xs text-orange-700 bg-orange-50 border-orange-200 font-bold">
              Editing In-Place
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'PREVIEW' ? (
            <>
              {/* Tax invoices are edited by management only */}
              {isManagement && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode('EDIT')}
                  className="h-8 text-xs rounded-lg text-orange-700 border-orange-300 hover:bg-orange-50 font-semibold cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5 mr-1 text-orange-600" /> Edit Invoice
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={handleShareWhatsApp} className="h-8 text-xs rounded-lg">
                <Share2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Share WhatsApp
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const custName = customer?.name || 'Customer';
                  exportElementToPdfWithToast('printable-invoice-doc', {
                    filename: `Invoice-${activeInvoice.invoiceNo}-${custName}`,
                  });
                }}
                className="h-8 text-xs rounded-lg text-slate-800 hover:bg-slate-50 font-semibold cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 mr-1 text-slate-600" /> Download PDF
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs rounded-lg">
                <Printer className="w-3.5 h-3.5 mr-1" /> Print
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMode('PREVIEW')}
              className="h-8 text-xs rounded-lg cursor-pointer"
            >
              Cancel Edit
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* BODY CONTENT: PREVIEW OR EDIT MODE */}
      <div className="flex-1 overflow-y-auto p-5 overscroll-contain">
        {mode === 'PREVIEW' ? (
          /* PREVIEW MODE: Authentic Paper Document */
          <div id="printable-invoice-doc" className="p-6 rounded-xl bg-white text-slate-900 font-sans shadow-xs border border-slate-200 print:shadow-none print:p-0">
            {/* Document Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 font-display">
                  S TEC SECURE
                </h1>
                <div className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                  Surveillance & Automations &bull; Tax Invoice
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  14/2 Thundu Kadu Street, Veerappan Chathiram, Erode - 638004
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  GSTIN: 33KDUPS8091G1ZL &bull; PAN: KDUPS8091G
                </div>
              </div>

              <div className="text-right space-y-1">
                <div className="text-lg font-bold font-mono text-slate-900">
                  {activeInvoice.invoiceNo}
                </div>
                <div className="text-xs text-slate-600">
                  Date: <span className="font-semibold">{formatDate(activeInvoice.date)}</span>
                </div>
                {activeInvoice.validityDays && (
                  <div className="text-xs text-slate-600">
                    Payment Terms: <span className="font-semibold">{activeInvoice.validityDays} Days</span>
                  </div>
                )}
                <div className="text-xs text-slate-600 font-medium">
                  Payment Mode: <span className="font-bold text-orange-700">{activeInvoice.paymentMode || 'UPI'}</span>
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div className="py-4 border-b border-slate-200 grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                  Billed To:
                </div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {customer?.name || activeInvoice.customerNumber}
                </div>
                <div className="text-slate-600 mt-0.5">{customer?.address}</div>
                <div className="text-slate-600 mt-0.5 font-mono">Phone: {customer?.phone}</div>
                {customer?.gstin && (
                  <div className="text-orange-600 font-mono font-semibold mt-0.5">
                    GSTIN: {customer.gstin}
                  </div>
                )}
              </div>

              <div className="text-right space-y-1">
                <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
                  Invoice Summary:
                </div>
                <div className="text-xs text-slate-700">
                  Taxable Amount: <span className="font-mono font-bold">{formatINR(activeInvoice.totalAmount)}</span>
                </div>
                <div className="text-xs text-slate-700">
                  Total GST (18%): <span className="font-mono">{formatINR(activeInvoice.totalCgst + activeInvoice.totalSgst)}</span>
                </div>
                <div className="text-sm text-slate-900 font-extrabold pt-1">
                  Grand Total: <span className="font-mono text-emerald-700">{formatINR(activeInvoice.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900 text-slate-900 font-bold">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 px-2">Description of Goods / Services</th>
                    <th className="py-2 px-2">HSN/SAC</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-2 text-right">Rate (₹)</th>
                    <th className="py-2 px-2 text-right">Taxable</th>
                    <th className="py-2 px-2 text-right">GST</th>
                    <th className="py-2 pl-2 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeInvoice.lineItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 pr-2 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="font-bold text-slate-900">{item.itemName}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-600 mt-0.5">{item.description}</div>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-slate-700">{item.hsnSac || '-'}</td>
                      <td className="py-2 px-2 text-center font-medium">{item.qty}</td>
                      <td className="py-2 px-2 text-right font-medium">{formatINR(item.rate)}</td>
                      <td className="py-2 px-2 text-right font-medium">{formatINR(item.amount)}</td>
                      <td className="py-2 px-2 text-right text-slate-600">{item.gstRate}%</td>
                      <td className="py-2 pl-2 text-right font-bold text-slate-900">{formatINR(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Settlement Breakdown */}
            <div className="pt-2 border-t border-slate-200 flex justify-end">
              <div className="w-72 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-700">
                  <span>Taxable Value:</span>
                  <span className="font-semibold text-slate-900">{formatINR(activeInvoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>CGST (9%):</span>
                  <span>{formatINR(activeInvoice.totalCgst)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>SGST (9%):</span>
                  <span>{formatINR(activeInvoice.totalSgst)}</span>
                </div>
                {activeInvoice.roundOff !== 0 && (
                  <div className="flex justify-between text-slate-600 text-[11px]">
                    <span>Round Off:</span>
                    <span>{formatINR(activeInvoice.roundOff)}</span>
                  </div>
                )}
                <div className="pt-2 border-t-2 border-slate-900 flex justify-between text-sm font-black text-slate-900">
                  <span>Grand Total (INR):</span>
                  <span className="text-emerald-800">{formatINR(activeInvoice.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold text-xs pt-1">
                  <span>Amount Paid:</span>
                  <span>{formatINR(activeInvoice.amountPaid)}</span>
                </div>
                <div className="flex justify-between text-rose-700 font-bold text-xs">
                  <span>Balance Due:</span>
                  <span>{formatINR(activeInvoice.balanceDue)}</span>
                </div>
              </div>
            </div>

            {/* Bank Details & Signature Block */}
            <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-0.5">
                <div className="font-bold text-slate-900">Bank Details for Electronic Remittance:</div>
                <div className="mt-1 text-slate-700">
                  A/C Name: <strong>S TEC SECURE</strong> &bull; Bank: <strong>{activeInvoice.bankDetails.bankName || 'CANARA'}</strong>
                </div>
                <div className="text-slate-700">
                  Account No: <strong className="font-mono">{activeInvoice.bankDetails.accountNumber}</strong>
                </div>
                <div className="text-slate-700">
                  IFSC Code: <strong className="font-mono">{activeInvoice.bankDetails.ifscCode}</strong> &bull; A/C Type: <strong>Current</strong>
                </div>
                <div className="text-slate-700">Branch: <strong>Veerappan Chathiram, Erode</strong></div>
                <div className="text-orange-600 font-mono text-[10px] font-semibold">
                  UPI Remittance Available
                </div>
              </div>

              <div className="text-right space-y-8 pr-2">
                <div className="text-slate-900 font-bold">For S TEC SECURE</div>
                <div className="text-slate-500 text-[11px] border-t border-slate-300 pt-1 inline-block">
                  Authorized Signatory / Accounts Department
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* EDIT MODE: Interactive In-Place Invoice Editor */
          <form onSubmit={handleSaveInvoiceChanges} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 text-xs">
                  Direct In-Place Edit &bull; {activeInvoice.invoiceNo}
                </div>
                <div className="text-[11px] text-slate-600">
                  Updates line items, commercials, or payment status directly on this invoice record.
                </div>
              </div>
              <Badge variant="orange" className="text-[10px] font-mono">
                {activeInvoice.invoiceNo}
              </Badge>
            </div>

            {/* Metadata (Date, Validity, Payment Mode) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-[10px] text-slate-700 uppercase font-bold mb-1">
                  Invoice Date
                </label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-700 uppercase font-bold mb-1">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as any)}
                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                >
                  <option value="UPI">UPI Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="NEFT">NEFT / NetBanking</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="PENDING">Pending Settlement</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-700 uppercase font-bold mb-1">
                  Amount Paid (₹)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                  className="h-8 text-xs bg-white font-mono font-bold text-emerald-700"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Invoice Line Items</span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-10 text-center">#</th>
                      <th className="p-2.5 min-w-[240px]">Item & Scope</th>
                      <th className="p-2.5 w-24">HSN/SAC</th>
                      <th className="p-2.5 w-16 text-center">Qty</th>
                      <th className="p-2.5 w-24 text-right">Rate (₹)</th>
                      <th className="p-2.5 w-24 text-right">GST %</th>
                      <th className="p-2.5 w-28 text-right">Total (₹)</th>
                      <th className="p-2.5 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 align-top">
                        <td className="p-2 text-center text-slate-400 font-mono text-[11px] pt-3">
                          {idx + 1}
                        </td>
                        <td className="p-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Input
                              placeholder="Item name"
                              value={item.itemName}
                              onChange={(e) => handleUpdateItem(idx, { itemName: e.target.value })}
                              className="h-8 text-xs bg-white font-semibold text-slate-900"
                            />
                            <select
                              onChange={(e) => handlePickProduct(idx, e.target.value)}
                              value=""
                              className="h-8 rounded-lg bg-slate-100 border border-slate-200 text-[10px] text-orange-700 px-1 focus:outline-none cursor-pointer"
                            >
                              <option value="" disabled>
                                Catalog...
                              </option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => handleUpdateItem(idx, { description: e.target.value })}
                            className="h-7 text-[11px] bg-slate-50 text-slate-600"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.hsnSac}
                            onChange={(e) => handleUpdateItem(idx, { hsnSac: e.target.value })}
                            className="h-8 text-xs font-mono bg-white"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleUpdateItem(idx, { qty: Number(e.target.value) || 1 })}
                            className="h-8 text-xs text-center bg-white"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="0"
                            value={item.rate}
                            onChange={(e) => handleUpdateItem(idx, { rate: Number(e.target.value) || 0 })}
                            className="h-8 text-xs text-right bg-white font-mono font-medium"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="0"
                            value={item.gstRate}
                            onChange={(e) => handleUpdateItem(idx, { gstRate: Number(e.target.value) || 0 })}
                            className="h-8 text-xs text-right bg-white font-mono"
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-slate-900 pt-3 font-mono">
                          {formatINR(item.total)}
                        </td>
                        <td className="p-2 text-center pt-3">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            disabled={lineItems.length === 1}
                            className="text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
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

            {/* Terms & Totals Block */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">Terms & Conditions</label>
                <textarea
                  rows={4}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-700 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex justify-between text-slate-700 text-xs">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold">{formatINR(totalAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>CGST (9%):</span>
                  <span className="font-mono">{formatINR(totalCgst)}</span>
                </div>
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>SGST (9%):</span>
                  <span className="font-mono">{formatINR(totalSgst)}</span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900 font-mono">
                  <span>Grand Total:</span>
                  <span className="text-emerald-700">{formatINR(grandTotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-700 font-semibold font-mono">
                  <span>Amount Paid:</span>
                  <span>{formatINR(amountPaid)}</span>
                </div>
                <div className="flex justify-between text-xs text-rose-600 font-bold font-mono">
                  <span>Balance Due:</span>
                  <span>{formatINR(balanceDue)}</span>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button type="button" variant="secondary" size="md" onClick={() => setMode('PREVIEW')}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs font-semibold">
                <FileText className="w-4 h-4 mr-1.5" />
                Save Invoice Changes
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
