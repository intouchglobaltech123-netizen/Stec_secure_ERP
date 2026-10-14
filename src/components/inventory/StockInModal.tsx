import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { X, Boxes, ShieldCheck, ArrowDownToLine, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';

interface StockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProductId?: string;
}

export const StockInModal: React.FC<StockInModalProps> = ({
  isOpen,
  onClose,
  defaultProductId,
}) => {
  const { products, vendors, stockInSerials } = useStecSecure();

  const [productId, setProductId] = useState<string>(defaultProductId || products[0]?.id || '');
  const [vendorId, setVendorId] = useState<string>(vendors[0]?.id || '');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bulkSerialsText, setBulkSerialsText] = useState<string>('');

  if (!isOpen) return null;

  // Parse serial numbers from textarea (newlines, commas, or spaces)
  const parsedSerials = bulkSerialsText
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const selectedProduct = products.find((p) => p.id === productId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      toast.error('Please select a product');
      return;
    }

    if (parsedSerials.length === 0) {
      toast.error('Please enter at least one serial number');
      return;
    }

    const created = stockInSerials({
      productId,
      serialNumbers: parsedSerials,
      vendorId: vendorId || undefined,
      purchaseDate,
    });

    toast.success(
      `Stock inward completed. Added ${created.length} units of ${selectedProduct?.name}.`
    );
    setBulkSerialsText('');
    onClose();
  };

  const handleInsertSampleSerials = () => {
    const prefix = selectedProduct?.name.includes('ONEVU')
      ? '1VU-2408-'
      : selectedProduct?.name.includes('SD')
      ? 'SD64-WD-'
      : 'STEC-SN-';
    const rand = Math.floor(1000 + Math.random() * 9000);
    setBulkSerialsText(`${prefix}${rand}A\n${prefix}${rand}B\n${prefix}${rand}C`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      showCloseButton={false}
      className="max-h-[90vh]"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs">
            <ArrowDownToLine className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Inward Stock Entry (Barcode / Serial Inward)
            </h2>
            <p className="text-xs text-slate-500">
              Log units received from supplier into IN_STOCK warehouse ledger
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

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
        <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
          {/* Product Selection */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Product Model *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category}) &bull; HSN: {p.hsnSac || 'N/A'}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier & Inward Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Purchased From (Vendor)</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
              >
                <option value="">Direct Import / No Vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} &bull; {v.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Purchase / Inward Date</label>
              <Input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="text-xs h-9 bg-white"
              />
            </div>
          </div>

          {/* Serial Numbers (Bulk Textarea) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">
                Serial Numbers (Scan barcode or paste list) *
              </label>
              <button
                type="button"
                onClick={handleInsertSampleSerials}
                className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold cursor-pointer"
              >
                + Insert Sample Serials
              </button>
            </div>
            <textarea
              rows={5}
              required
              placeholder="Enter one serial number per line, or separate with commas (e.g., 1VU-2408-1001, 1VU-2408-1002)..."
              value={bulkSerialsText}
              onChange={(e) => setBulkSerialsText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
              <span>Separators: Newline, Comma, or Semicolon</span>
              <span className="font-bold text-orange-600 font-mono">
                {parsedSerials.length} unit(s) recognized
              </span>
            </div>
          </div>

          {/* Live Preview Pills */}
          {parsedSerials.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Preview Serials to Inward:</div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                {parsedSerials.map((sn, idx) => (
                  <Badge key={idx} variant="orange" className="font-mono text-[10px]">
                    <Tag className="w-2.5 h-2.5 mr-1" />
                    {sn}
                  </Badge>
                ))}
              </div>
            </div>
          )}

        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <Button type="button" variant="secondary" size="md" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button type="submit" variant="success" size="md" disabled={parsedSerials.length === 0} className="rounded-xl font-semibold">
            <ArrowDownToLine className="w-4 h-4 mr-1.5" />
            Stock In {parsedSerials.length} Unit(s)
          </Button>
        </div>
      </form>
    </Modal>
  );
};
