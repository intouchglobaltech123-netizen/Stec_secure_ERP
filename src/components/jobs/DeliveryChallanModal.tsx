import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { DeliveryChallan, DeliveryChallanLineItem, Invoice } from '@/lib/stecsecure-types';
import {
  X,
  Plus,
  Trash2,
  Truck,
  FileText,
  CheckCircle2,
  Printer,
  ArrowLeft,
  ReceiptText,
  Edit,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { formatDate } from '@/lib/utils';
import { exportElementToPdfWithToast } from '@/lib/pdf-generator';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';

interface DeliveryChallanModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialChallan?: DeliveryChallan | null;
  initialMode?: 'CREATE' | 'PREVIEW' | 'EDIT';
  jobId?: string;
  quotationId?: string;
  defaultCustomerId?: string;
  onConvertedToInvoice?: (invoice: Invoice) => void;
  onChallanSaved?: (challan: DeliveryChallan) => void;
}

export const DeliveryChallanModal: React.FC<DeliveryChallanModalProps> = ({
  isOpen,
  onClose,
  initialChallan,
  initialMode,
  jobId,
  quotationId,
  defaultCustomerId,
  onConvertedToInvoice,
  onChallanSaved,
}) => {
  const {
    customers,
    createDeliveryChallan,
    updateDeliveryChallan,
    convertDeliveryChallanToInvoice,
    products,
    invoices,
    isManagement,
    serialUnits,
  } = useStecSecure();

  // Phase 22: catalogue product for a line (exact name first, then partial), to show stock and serials
  const productForLine = (item: DeliveryChallanLineItem) => {
    if (item.productId) return products.find((p) => p.id === item.productId);
    const n = item.itemDescription.trim().toLowerCase();
    if (!n) return undefined;
    return (
      products.find((p) => p.name.toLowerCase() === n) ??
      products.find((p) => n.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(n))
    );
  };

  const toggleSerial = (index: number, serialId: string) => {
    setLineItems((prev) => {
      const updated = [...prev];
      const picked = updated[index].serialUnitIds ?? [];
      updated[index] = {
        ...updated[index],
        serialUnitIds: picked.includes(serialId) ? picked.filter((id) => id !== serialId) : [...picked, serialId],
      };
      return updated;
    });
  };

  const [mode, setMode] = useState<'CREATE' | 'PREVIEW'>(() => {
    if (initialMode === 'EDIT' || initialMode === 'CREATE') return 'CREATE';
    return initialChallan ? 'PREVIEW' : 'CREATE';
  });
  const [activeChallan, setActiveChallan] = useState<DeliveryChallan | null>(initialChallan || null);

  // Form states
  const [customerId, setCustomerId] = useState<string>(
    initialChallan?.customerNumber || defaultCustomerId || customers[0]?.id || ''
  );
  const [transportedBy, setTransportedBy] = useState<string>(
    initialChallan?.transportedBy || 'Technician Field Bike / S Tec Secure Van'
  );
  const [lineItems, setLineItems] = useState<DeliveryChallanLineItem[]>(
    initialChallan?.lineItems || [
      { itemDescription: 'ONEVU 4G Smart Solar / Standalone Camera', qty: 1 },
      { itemDescription: '64GB High Endurance Surveillance Micro SD Card', qty: 1 },
      { itemDescription: 'Weatherproof PVC Junction Box 4x4', qty: 2 },
    ]
  );

  // Phase 21: server actions in flight (blocks double submits)
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (initialChallan) {
      setActiveChallan(initialChallan);
      setMode(initialMode === 'EDIT' || initialMode === 'CREATE' ? 'CREATE' : 'PREVIEW');
      setCustomerId(initialChallan.customerNumber);
      setTransportedBy(initialChallan.transportedBy || 'Technician Field Bike / S Tec Secure Van');
      setLineItems(initialChallan.lineItems);
    } else if (isOpen) {
      setActiveChallan(null);
      setMode('CREATE');
      if (defaultCustomerId) {
        setCustomerId(defaultCustomerId);
      }
      setLineItems([
        { itemDescription: '', qty: 1 },
      ]);
    }
  }, [initialChallan, isOpen, defaultCustomerId, initialMode]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setLineItems((prev) => [...prev, { itemDescription: '', qty: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = (index: number, updates: Partial<DeliveryChallanLineItem>) => {
    setLineItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  const handleQuickInsertProduct = (index: number, productName: string) => {
    const prod = products.find((p) => p.name === productName);
    handleUpdateItem(index, { itemDescription: productName, productId: prod?.id, serialUnitIds: [] });
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const validItems = lineItems.filter((item) => item.itemDescription.trim());
    if (validItems.length === 0) {
      toast.error('Please specify at least one delivery item');
      return;
    }

    setSaving(true);
    try {
      if (activeChallan) {
        // Independent edit of existing challan
        await updateDeliveryChallan(activeChallan.id, {
          customerNumber: customerId,
          lineItems: validItems,
          transportedBy,
        });
        const updated = {
          ...activeChallan,
          customerNumber: customerId,
          lineItems: validItems,
          transportedBy,
        };
        setActiveChallan(updated);
        toast.success(`Delivery Challan ${activeChallan.challanNo} updated.`);
        if (onChallanSaved) onChallanSaved(updated);
        setMode('PREVIEW');
      } else {
        const created = await createDeliveryChallan({
          customerNumber: customerId,
          lineItems: validItems,
          transportedBy,
          jobId,
          quotationId,
        });

        toast.success(`Delivery Challan ${created.challanNo} created.`);
        setActiveChallan(created);
        if (onChallanSaved) onChallanSaved(created);
        setMode('PREVIEW');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!activeChallan || converting) return;
    setConverting(true);
    try {
      const inv = await convertDeliveryChallanToInvoice(activeChallan.id);
      toast.success(`Tax Invoice ${inv.invoiceNo} created from Delivery Challan ${activeChallan.challanNo}`);
      if (onConvertedToInvoice) {
        onConvertedToInvoice(inv);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConverting(false);
    }
  };

  // A challan is invoiced at most once
  const existingChallanInvoice = activeChallan
    ? invoices.find((i) => i.deliveryChallanId === activeChallan.id)
    : undefined;

  const previewCustomer = customers.find(
    (c) => c.id === (activeChallan ? activeChallan.customerNumber : customerId)
  );

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
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              {mode === 'CREATE'
                ? activeChallan
                  ? `Edit Delivery Challan (${activeChallan.challanNo})`
                  : 'Generate Delivery Challan'
                : 'Delivery Challan Preview'}
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              {activeChallan && mode === 'CREATE'
                ? 'Update dispatch quantities or line items directly in-place'
                : 'Official material transfer dispatch document • S Tec Secure'}
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
        {/* MODE: CREATE */}
        {mode === 'CREATE' && (
          <form onSubmit={handleCreateOrUpdate} className="space-y-4 text-xs">
            {/* Customer & Transport Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deliver To (Customer) *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Transport Mode / Vehicle</label>
                <Input
                  value={transportedBy}
                  onChange={(e) => setTransportedBy(e.target.value)}
                  placeholder="e.g. Field Bike / Van TN-33-AX-8911"
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Dispatch Hardware & Components</span>
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
                      <th className="p-2.5">Item Description / Model</th>
                      <th className="p-2.5 w-24 text-center">Qty (Nos)</th>
                      <th className="p-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <div className="space-y-1">
                            <Input
                              required
                              value={item.itemDescription}
                              onChange={(e) =>
                                handleUpdateItem(idx, {
                                  itemDescription: e.target.value,
                                  productId: undefined,
                                  serialUnitIds: [],
                                })
                              }
                              placeholder="Type item name or pick from catalogue below..."
                              className="h-8 text-xs bg-white text-slate-900"
                            />
                            <div className="flex flex-wrap gap-1">
                              {products.slice(0, 4).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => handleQuickInsertProduct(idx, p.name)}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-700 cursor-pointer"
                                >
                                  + {p.name.slice(0, 20)}...
                                </button>
                              ))}
                            </div>
                            {(() => {
                              // Phase 22: stock available for this line and the serial units to dispatch
                              const prod = productForLine(item);
                              if (!prod) return null;
                              const picked = item.serialUnitIds ?? [];
                              const tracked = serialUnits.some((u) => u.productId === prod.id);
                              if (!tracked) return null;
                              const available = serialUnits.filter(
                                (u) => u.productId === prod.id && (u.status === 'IN_STOCK' || picked.includes(u.id))
                              );
                              return (
                                <div className="pt-1 space-y-1">
                                  <div className="text-[10px] text-slate-600">
                                    In stock: <strong>{available.length}</strong> · Serials picked:{' '}
                                    <strong>
                                      {picked.length}/{item.qty}
                                    </strong>
                                    {item.qty > available.length && (
                                      <span className="ml-1 text-amber-700 font-semibold">
                                        — only {available.length} in stock
                                      </span>
                                    )}
                                  </div>
                                  {available.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {available.map((u) => {
                                        const on = picked.includes(u.id);
                                        return (
                                          <button
                                            key={u.id}
                                            type="button"
                                            disabled={!on && picked.length >= item.qty}
                                            onClick={() => toggleSerial(idx, u.id)}
                                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border cursor-pointer disabled:opacity-40 ${
                                              on
                                                ? 'bg-orange-500 border-orange-500 text-white'
                                                : 'bg-white border-slate-300 text-slate-600'
                                            }`}
                                          >
                                            {u.serialNumber}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) =>
                              handleUpdateItem(idx, { qty: Number(e.target.value) || 1 })
                            }
                            className="h-8 text-xs text-center bg-white font-mono"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
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

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
              {activeChallan && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setMode('PREVIEW')}
                >
                  Cancel
                </Button>
              )}
              {!activeChallan && (
                <Button type="button" variant="secondary" size="md" onClick={onClose}>
                  Cancel
                </Button>
              )}
              <Button type="submit" variant="primary" size="md" disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">
                <FileText className="w-4 h-4 mr-1.5" />
                {activeChallan ? 'Save Challan Changes' : 'Generate Challan'}
              </Button>
            </div>
          </form>
        )}

        {/* MODE: PREVIEW (Printable Paper Style) */}
        {mode === 'PREVIEW' && activeChallan && (
          <div className="space-y-4 pt-4 text-xs">
            {/* Paper Replica Container */}
            <div id="printable-delivery-challan-doc" className="bg-white text-slate-900 border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 font-sans">
              {/* Top Company Header */}
              <div className="text-center pb-3 border-b border-slate-200 space-y-1">
                <h3 className="text-lg font-black tracking-wide text-slate-900 uppercase font-display">
                  S Tec Secure <span className="text-orange-600">(Surveillance & Automation's)</span>
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  CCTV | HOME AUTOMATIONS | GATE AUTOMATION | BIOMETRIC & ACCESS CONTROL | INTERCOM | BURGLAR ALARM SYSTEM
                </p>
                <p className="text-[10px] text-slate-600">
                  14/2 Thundu Kadu Street, Veerappan Chathiram, Erode, Tamil Nadu - 638004 &bull; Phone: 81485 62605 / 96002 52605
                </p>
                <p className="text-[10px] font-mono text-orange-600 font-semibold">
                  GSTIN: 33KDUPS8091G1ZL &bull; PAN: KDUPS8091G &bull; Email: stecsecure@gmail.com
                </p>
                <div className="inline-block px-3 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 font-bold text-xs uppercase tracking-widest mt-1 shadow-2xs">
                  DELIVERY CHALLAN
                </div>
              </div>

              {/* Challan Meta & Consignee */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Consignee / Deliver To:</div>
                  <div className="font-bold text-slate-900 text-sm">{previewCustomer?.name}</div>
                  <div className="text-slate-600">{previewCustomer?.address}</div>
                  <div className="text-slate-600">Phone: {previewCustomer?.phone}</div>
                  {previewCustomer?.gstin && (
                    <div className="font-mono text-orange-600 text-[11px] font-semibold">GSTIN: {previewCustomer.gstin}</div>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <div>
                    <span className="text-slate-500">Challan No: </span>
                    <span className="font-mono font-bold text-orange-600 text-sm">{activeChallan.challanNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Date: </span>
                    <span className="font-medium text-slate-900">{formatDate(activeChallan.date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Transport: </span>
                    <span className="text-slate-800">{activeChallan.transportedBy || 'Technician Transit'}</span>
                  </div>
                </div>
              </div>

              {/* Table of Goods */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-2 w-12 text-center">S.No</th>
                      <th className="p-2">Description of Goods / Components</th>
                      <th className="p-2 w-20 text-center">Quantity</th>
                      <th className="p-2 w-24 text-right">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeChallan.lineItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                        <td className="p-2 font-medium text-slate-900">
                          {item.itemDescription}
                          {(item.serialUnitIds?.length ?? 0) > 0 && (
                            <div className="text-[10px] font-mono font-normal text-slate-500">
                              S/N:{' '}
                              {item.serialUnitIds!
                                .map((id) => serialUnits.find((u) => u.id === id)?.serialNumber || id)
                                .join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-center font-bold text-orange-600">{item.qty} Nos</td>
                        <td className="p-2 text-right text-slate-500 text-[11px]">Site Installation</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Declarations & Signature blocks */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-[11px] text-slate-500 border-t border-slate-200">
                <div className="space-y-6">
                  <p className="italic">
                    "Received the above listed equipment/materials in satisfactory condition for installation."
                  </p>
                  <div className="border-t border-slate-300 pt-1 text-center font-medium text-slate-700">
                    Customer / Receiver Signature & Stamp
                  </div>
                </div>

                <div className="space-y-6 text-right">
                  <p className="font-semibold text-slate-800">For S TEC SECURE</p>
                  <div className="border-t border-slate-300 pt-1 text-center font-medium text-slate-700">
                    Authorized Signatory / Dispatch Officer
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActiveChallan(null);
                    setMode('CREATE');
                    setLineItems([{ itemDescription: '', qty: 1 }]);
                  }}
                  className="text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> New Challan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMode('CREATE')}
                  className="text-xs text-slate-700 border-slate-300"
                >
                  <Edit className="w-3.5 h-3.5 mr-1" /> Edit Challan
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    exportElementToPdfWithToast('printable-delivery-challan-doc', {
                      filename: `DeliveryChallan-${activeChallan.challanNo}`,
                    });
                  }}
                  className="text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1 text-slate-600" /> Download PDF
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="text-xs"
                >
                  <Printer className="w-3.5 h-3.5 mr-1" /> Print
                </Button>

                {existingChallanInvoice ? (
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 px-2">
                    <ReceiptText className="w-3.5 h-3.5" />
                    Invoiced as {existingChallanInvoice.invoiceNo}
                  </span>
                ) : (
                  isManagement && (
                    <Button
                      type="button"
                      variant="success"
                      size="sm"
                      onClick={handleConvertToInvoice}
                      disabled={converting}
                      className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <ReceiptText className="w-3.5 h-3.5" />
                      Convert to Invoice
                    </Button>
                  )
                )}

                <Button type="button" variant="primary" size="sm" onClick={onClose} className="rounded-xl text-xs">
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
