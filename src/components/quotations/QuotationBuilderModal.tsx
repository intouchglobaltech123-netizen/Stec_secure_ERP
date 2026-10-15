import React, { useState, useEffect } from 'react';
import { localDateISO } from '@/lib/numbering';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Quotation, LineItem, Customer } from '@/lib/stecsecure-types';
import {
  X,
  Plus,
  Trash2,
  FileSpreadsheet,
  Building2,
  Calendar,
  CheckCircle2,
  Printer,
  ReceiptText,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatINR, formatDate } from '@/lib/utils';
import { CANARA_BANK_DETAILS } from '@/lib/seed-data';
import {
  COMPANY_STATE_CODE,
  INDIAN_STATES,
  customerStateCode,
  hsnSummary,
  isInterState,
  isValidGstin,
  placeOfSupplyLabel,
  splitLineTax,
  splitTax,
  taxTotals,
} from '@/lib/gst';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';

interface QuotationBuilderModalProps {
  isOpen: boolean;
  initialCustomerId?: string;
  initialEnquiryId?: string;
  quotationToEdit?: Quotation | null;
  onClose: () => void;
  onQuotationSaved?: (quotation: Quotation) => void;
  onConvertedToInvoice?: () => void;
}

export const QuotationBuilderModal: React.FC<QuotationBuilderModalProps> = ({
  isOpen,
  initialCustomerId,
  initialEnquiryId,
  quotationToEdit,
  onClose,
  onQuotationSaved,
  onConvertedToInvoice,
}) => {
  const { customers, products, createQuotation, updateQuotation, addCustomer } = useStecSecure();

  // Customer selection / quick-add
  const [customerId, setCustomerId] = useState<string>(
    quotationToEdit?.customerNumber || initialCustomerId || customers[0]?.id || ''
  );
  const [isQuickAdd, setIsQuickAdd] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustGstin, setNewCustGstin] = useState('');
  const [newCustState, setNewCustState] = useState(COMPANY_STATE_CODE);
  const [saving, setSaving] = useState(false);

  // Quotation Meta
  const [quotationDate, setQuotationDate] = useState<string>(
    quotationToEdit?.date || localDateISO()
  );
  const [validityDays, setValidityDays] = useState<number>(quotationToEdit?.validityDays || 15);

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>(() => {
    if (quotationToEdit && quotationToEdit.lineItems?.length > 0) {
      return quotationToEdit.lineItems;
    }
    return [
      {
        itemName: 'ONEVU 4G Smart Solar / Standalone Camera',
        description: '4G LTE SIM camera with solar panel option & 1080p color night vision',
        hsnSac: '85258090',
        gstRate: 18,
        qty: 1,
        rate: 6195,
        amount: 6195,
        cgst: 557.55,
        sgst: 557.55,
        total: 7310.1,
      },
      {
        itemName: 'Installation & Technical Wiring Setup',
        description: 'Mounting brackets, power cable routing, conduit & cloud pairing',
        hsnSac: '998719',
        gstRate: 18,
        qty: 1,
        rate: 1500,
        amount: 1500,
        cgst: 135,
        sgst: 135,
        total: 1770,
      },
    ];
  });

  // Standard S Tec Secure Terms & Conditions
  const [terms, setTerms] = useState<string>(
    quotationToEdit?.termsAndConditions ||
      '1. 50% advance along with confirmed order.\n2. Balance against delivery or completion of work.\n3. Taxes extra as applicable (18% GST).\n4. 1-year standard warranty on hardware components against manufacturing defects.\n5. Physical damage, surge currents, lightning or water ingress due to improper handling not covered under warranty.'
  );

  useEffect(() => {
    if (isOpen) {
      if (quotationToEdit) {
        setCustomerId(quotationToEdit.customerNumber);
        setQuotationDate(quotationToEdit.date);
        setValidityDays(quotationToEdit.validityDays || 15);
        setLineItems(
          quotationToEdit.lineItems?.length > 0
            ? quotationToEdit.lineItems
            : [
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
              ]
        );
        setTerms(
          quotationToEdit.termsAndConditions ||
            '1. 50% advance along with confirmed order.\n2. Balance against delivery or completion of work.\n3. Taxes extra as applicable (18% GST).\n4. 1-year standard warranty on hardware components against manufacturing defects.\n5. Physical damage, surge currents, lightning or water ingress due to improper handling not covered under warranty.'
        );
        setIsQuickAdd(false);
      } else {
        if (initialCustomerId) {
          setCustomerId(initialCustomerId);
        }
        setIsQuickAdd(false);
      }
    }
  }, [isOpen, quotationToEdit, initialCustomerId]);

  if (!isOpen) return null;

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Line Item Math
  const handleUpdateItem = (index: number, updates: Partial<LineItem>) => {
    setLineItems((prev) => {
      const copy = [...prev];
      copy[index] = splitLineTax({ ...copy[index], ...updates }, false);
      return copy;
    });
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

  // Step 3: tax follows the customer's state — CGST+SGST in Tamil Nadu, IGST elsewhere
  // (the server recomputes the same when the quotation is saved)
  const placeOfSupply = isQuickAdd
    ? customerStateCode({ gstin: newCustGstin, stateCode: newCustState })
    : customerStateCode(selectedCustomer);
  const interState = isInterState(placeOfSupply);
  const taxedItems = splitTax(lineItems, interState);
  const { totalAmount, totalCgst, totalSgst, totalIgst, roundOff, grandTotal } = taxTotals(taxedItems);
  const hsnRows = hsnSummary(taxedItems);

  const handleSaveQuotation = async (status: 'DRAFT' | 'SENT') => {
    if (saving) return;
    let finalCustId = customerId;

    if (isQuickAdd) {
      if (!newCustName.trim() || !newCustPhone.trim() || !newCustAddress.trim()) {
        toast.error('Please complete customer details');
        return;
      }
      if (newCustGstin.trim() && !isValidGstin(newCustGstin)) {
        toast.error('GSTIN is not valid — check it or leave it empty');
        return;
      }
    }

    if (!isQuickAdd && !finalCustId) {
      toast.error('Please select or add a customer');
      return;
    }

    setSaving(true);
    try {
      if (isQuickAdd) {
        const createdCust = await addCustomer({
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          address: newCustAddress.trim(),
          gstin: newCustGstin.trim().toUpperCase() || undefined,
          stateCode: customerStateCode({ gstin: newCustGstin, stateCode: newCustState }),
        });
        finalCustId = createdCust.id;
        // Customer now exists — select it so a retry after a failed save doesn't add it twice
        setCustomerId(createdCust.id);
        setIsQuickAdd(false);
      }

      if (quotationToEdit) {
        // In-place update: preserves same quotationNo and same id, no duplicate created
        const updated = await updateQuotation(quotationToEdit.id, {
          customerNumber: finalCustId,
          date: quotationDate,
          validityDays,
          lineItems: taxedItems,
          termsAndConditions: terms,
          totalAmount,
          totalCgst,
          totalSgst,
          totalIgst,
          roundOff,
          grandTotal,
          bankDetails: CANARA_BANK_DETAILS,
          status,
          enquiryId: quotationToEdit.enquiryId || initialEnquiryId,
        });

        toast.success(`Quotation ${quotationToEdit.quotationNo} updated successfully (no duplicate created).`);
        if (onQuotationSaved) onQuotationSaved(updated);
        onClose();
        return;
      }

      const created = await createQuotation({
        customerNumber: finalCustId,
        date: quotationDate,
        validityDays,
        lineItems: taxedItems,
        termsAndConditions: terms,
        totalAmount,
        totalCgst,
        totalSgst,
        totalIgst,
        roundOff,
        grandTotal,
        bankDetails: CANARA_BANK_DETAILS,
        status,
        enquiryId: initialEnquiryId,
      });

      toast.success(`Quotation ${created.quotationNo} generated.`);
      if (onQuotationSaved) onQuotationSaved(created);
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
      maxWidth="6xl"
      showCloseButton={false}
      className="max-h-[94vh] sm:max-h-[92vh] w-[94vw] max-w-6xl"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      {/* Pinned Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              {quotationToEdit
                ? `Edit Quotation (${quotationToEdit.quotationNo})`
                : 'Create S Tec Secure Quotation'}
            </h2>
            <p className="text-xs text-slate-500">
              {quotationToEdit
                ? 'Update quotation line items, commercials, or terms in-place with zero duplicate creation'
                : 'Official quotation builder matching authentic customer estimate format (A-Series)'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Document Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs overscroll-contain">
          {/* Company & Customer Header Blocks */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* S Tec Secure Official Block */}
            <div className="space-y-1 text-slate-700">
              <div className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">
                ISSUED BY:
              </div>
              <div className="text-base font-black text-slate-900 uppercase font-display">
                S Tec Secure <span className="text-orange-600">(Surveillance & Automation's)</span>
              </div>
              <div className="text-[11px] text-slate-500 font-bold">
                CCTV | HOME AUTOMATIONS | GATE AUTOMATION | BIOMETRIC & ACCESS CONTROL | INTERCOM | BURGLAR ALARM SYSTEM
              </div>
              <div className="text-slate-600">14/2 Thundu Kadu Street, Veerappan Chathiram, Erode, Tamil Nadu, India - 638004</div>
              <div className="text-slate-500">Phone: 81485 62605 / 96002 52605 &bull; Email: stecsecure@gmail.com</div>
              <div className="font-mono text-orange-600 text-[11px] font-semibold">
                GSTIN: 33KDUPS8091G1ZL &bull; PAN: KDUPS8091G
              </div>
            </div>

            {/* Quotation For / Customer Picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">
                  QUOTATION FOR:
                </span>
                <button
                  type="button"
                  onClick={() => setIsQuickAdd(!isQuickAdd)}
                  className="text-orange-600 hover:text-orange-700 font-semibold underline cursor-pointer"
                >
                  {isQuickAdd ? '← Select Existing' : '+ Quick Add Customer'}
                </button>
              </div>

              {!isQuickAdd ? (
                <div className="space-y-1.5">
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} &bull; {c.phone}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && (
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <div>{selectedCustomer.address}</div>
                      {selectedCustomer.gstin && (
                        <div className="font-mono text-orange-600 font-semibold">GST: {selectedCustomer.gstin}</div>
                      )}
                      <div>
                        Place of supply: <strong>{placeOfSupplyLabel(placeOfSupply)}</strong> ·{' '}
                        {interState ? 'IGST' : 'CGST + SGST'}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    placeholder="Customer / Org Name *"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input
                      placeholder="Phone *"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="h-8 text-xs bg-white"
                    />
                    <Input
                      placeholder="GSTIN (optional)"
                      value={newCustGstin}
                      onChange={(e) => setNewCustGstin(e.target.value)}
                      className="h-8 text-xs bg-white font-mono"
                    />
                  </div>
                  <Input
                    placeholder="Address *"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                  <select
                    value={isValidGstin(newCustGstin) ? newCustGstin.trim().slice(0, 2) : newCustState}
                    disabled={isValidGstin(newCustGstin)}
                    onChange={(e) => setNewCustState(e.target.value)}
                    className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 disabled:bg-slate-100"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.name} ({st.code})
                      </option>
                    ))}
                  </select>
                  {newCustGstin.trim() && !isValidGstin(newCustGstin) && (
                    <div className="text-[11px] text-rose-600">GSTIN is not valid</div>
                  )}
                  <div className="text-[11px] text-slate-600">
                    Place of supply: <strong>{placeOfSupplyLabel(placeOfSupply)}</strong> ·{' '}
                    {interState ? 'IGST' : 'CGST + SGST'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quotation Metadata (Date, Validity) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 items-center">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold">
                {quotationToEdit ? 'Quotation No' : 'Series'}
              </span>
              <div className="font-mono font-bold text-orange-600 text-sm">
                {quotationToEdit ? `${quotationToEdit.quotationNo} (Editing In-Place)` : 'A##### (Auto-generated)'}
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-700 uppercase font-bold mb-1">
                Quotation Date
              </label>
              <Input
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                className="h-8 text-xs bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-700 uppercase font-bold mb-1">
                Validity (Days)
              </label>
              <Input
                type="number"
                min="1"
                max="90"
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
                className="h-8 text-xs bg-white"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Quotation Line Items</span>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line Item
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5 min-w-[280px]">Item & Technical Description</th>
                    <th className="p-2.5 w-28">HSN/SAC</th>
                    <th className="p-2.5 w-20 text-center">Qty</th>
                    <th className="p-2.5 w-28 text-right">Rate (₹)</th>
                    <th className="p-2.5 w-32 text-right">GST</th>
                    <th className="p-2.5 w-32 text-right">Total (₹)</th>
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
                            aria-label="Pick Product from Catalog"
                            className="h-8 rounded-lg bg-slate-100 border border-slate-200 text-[10px] text-orange-700 px-1.5 focus:outline-none cursor-pointer font-medium"
                          >
                            <option value="" disabled>
                              Pick Catalog...
                            </option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Input
                          placeholder="Scope & description"
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
                      <td className="p-2 text-right pt-3 text-[11px] text-slate-500 font-medium">
                        {item.gstRate}% (₹{(taxedItems[idx].total - taxedItems[idx].amount).toFixed(2)})
                      </td>
                      <td className="p-2 text-right font-bold text-slate-900 pt-3 font-mono">
                        {formatINR(taxedItems[idx].total)}
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

          {/* Totals & Commercials Block */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Terms & Conditions Block */}
            <div className="space-y-2">
              <label className="block font-semibold text-slate-700">Terms & Conditions</label>
              <textarea
                rows={5}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-700 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Totals Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex justify-between text-slate-700 text-xs">
                <span>Subtotal (Taxable Amount):</span>
                <span className="font-semibold text-slate-900 font-mono">{formatINR(totalAmount)}</span>
              </div>
              {interState ? (
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>Total IGST:</span>
                  <span className="font-mono">{formatINR(totalIgst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>Total CGST:</span>
                    <span className="font-mono">{formatINR(totalCgst)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>Total SGST:</span>
                    <span className="font-mono">{formatINR(totalSgst)}</span>
                  </div>
                </>
              )}
              {roundOff !== 0 && (
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Round Off:</span>
                  <span className="font-mono">{formatINR(roundOff)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 flex justify-between text-base font-bold text-orange-600 font-mono">
                <span>Grand Total (INR):</span>
                <span>{formatINR(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* HSN-wise tax summary table at bottom */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-800">
              HSN / SAC Tax Summary Breakdown
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-white text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2">HSN / SAC</th>
                    <th className="p-2 text-right">Taxable Value (₹)</th>
                    <th className="p-2 text-right">Rate</th>
                    {interState ? (
                      <th className="p-2 text-right">IGST</th>
                    ) : (
                      <>
                        <th className="p-2 text-right">CGST</th>
                        <th className="p-2 text-right">SGST</th>
                      </>
                    )}
                    <th className="p-2 text-right">Total Tax (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hsnRows.map((row) => (
                    <tr key={`${row.hsnSac}@${row.gstRate}`}>
                      <td className="p-2 font-mono text-orange-600 font-semibold">{row.hsnSac}</td>
                      <td className="p-2 text-right font-medium text-slate-900 font-mono">{formatINR(row.taxable)}</td>
                      <td className="p-2 text-right text-slate-600 font-mono">{row.gstRate}%</td>
                      {interState ? (
                        <td className="p-2 text-right text-slate-600 font-mono">{formatINR(row.igst)}</td>
                      ) : (
                        <>
                          <td className="p-2 text-right text-slate-600 font-mono">{formatINR(row.cgst)}</td>
                          <td className="p-2 text-right text-slate-600 font-mono">{formatINR(row.sgst)}</td>
                        </>
                      )}
                      <td className="p-2 text-right font-bold text-emerald-700 font-mono">
                        {formatINR(row.cgst + row.sgst + row.igst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bank Details Block */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
            <div>
              <div className="font-bold text-slate-900 text-xs">Bank Details for Remittance:</div>
              <div className="text-slate-600">
                A/C Name: <strong>S TEC SECURE</strong> &bull; Bank: <strong>CANARA</strong> &bull; A/C Type: <strong>Current</strong>
              </div>
              <div className="text-slate-600">
                A/C No: <strong className="font-mono">{CANARA_BANK_DETAILS.accountNumber}</strong> &bull; IFSC: <strong className="font-mono">{CANARA_BANK_DETAILS.ifscCode}</strong> &bull; Branch: <strong>Veerappan Chathiram, Erode</strong>
              </div>
            </div>
            <div className="text-orange-600 font-mono font-semibold">
              UPI Remittance Available
            </div>
          </div>
        </div>

        {/* Pinned Action Buttons Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => handleSaveQuotation('DRAFT')}
              disabled={saving}
            >
              {quotationToEdit ? 'Save Changes as Draft' : 'Save Draft'}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => handleSaveQuotation('SENT')}
              disabled={saving}
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5" />
              {quotationToEdit ? 'Update Quotation' : 'Save & Finalize Quotation'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  };

