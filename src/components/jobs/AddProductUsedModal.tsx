import React, { useState, useEffect, useMemo } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Job, Product } from '@/lib/stecsecure-types';
import {
  X,
  PackagePlus,
  Boxes,
  Tag,
  Check,
  Search,
  CheckCircle2,
  AlertCircle,
  Info,
  Minus,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatINR } from '@/lib/utils';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';

interface AddProductUsedModalProps {
  isOpen: boolean;
  job: Job;
  onClose: () => void;
  onAdded?: () => void;
}

export const AddProductUsedModal: React.FC<AddProductUsedModalProps> = ({
  isOpen,
  job,
  onClose,
  onAdded,
}) => {
  const { products, serialUnits, vendors, addJobProductUsage } = useStecSecure();

  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset selections when opening or changing product
  useEffect(() => {
    if (isOpen) {
      if (!selectedProductId && products.length > 0) {
        setSelectedProductId(products[0].id);
      }
      setSelectedSerialIds([]);
      setQuantity(1);
      setProductSearch('');
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedSerialIds([]);
  }, [selectedProductId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  // In-stock serial units for the selected product
  const availableSerials = useMemo(() => {
    if (!selectedProductId) return [];
    return serialUnits.filter(
      (s) => s.productId === selectedProductId && s.status === 'IN_STOCK'
    );
  }, [serialUnits, selectedProductId]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.hsnSac && p.hsnSac.toLowerCase().includes(q))
    );
  }, [products, productSearch]);

  if (!isOpen) return null;

  const handleToggleSerial = (serialId: string) => {
    setSelectedSerialIds((prev) => {
      if (prev.includes(serialId)) {
        return prev.filter((id) => id !== serialId);
      } else {
        if (prev.length >= quantity) {
          toast.warning(`You have set quantity to ${quantity}. Deselect another serial first or increase quantity.`);
          return prev;
        }
        return [...prev, serialId];
      }
    });
  };

  const handleAutoSelectSerials = () => {
    const needed = Math.min(quantity, availableSerials.length);
    const toPick = availableSerials.slice(0, needed).map((s) => s.id);
    setSelectedSerialIds(toPick);
    toast.info(`Auto-selected first ${toPick.length} in-stock serial(s).`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error('Please select a product from catalog');
      return;
    }
    if (quantity < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }

    setSaving(true);
    try {
      // Call context action: records JobProductUsage & immediately transitions serials to ALLOCATED
      await addJobProductUsage({
        jobId: job.id,
        productId: selectedProductId,
        quantity,
        serialUnitIds: selectedSerialIds,
      });

      toast.success(
        `Recorded ${quantity}x ${selectedProduct?.name} used for ${job.jobNumber}. Warehouse stock decremented.`
      );

      if (onAdded) onAdded();
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
      maxWidth="lg"
      showCloseButton={false}
      className="max-h-[90vh]"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Add product used
            </h2>
            <p className="text-[13px] text-slate-500">
              {job.jobNumber} — products and parts used on this job
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

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-[13px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
          {/* Product Picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-700 font-semibold">
                Select Product from Catalog <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-500">{products.length} catalog items</span>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="Filter products..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-8 text-[13px] h-8 bg-slate-50 border-slate-200"
                />
              </div>

              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                required
              >
                {filteredProducts.map((p) => {
                  const stockCount = serialUnits.filter(
                    (s) => s.productId === p.id && s.status === 'IN_STOCK'
                  ).length;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} — [{p.category}] (Stock: {stockCount} {p.unit})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Selected Product Summary Badge */}
          {selectedProduct && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[13px]">
              <div>
                <div className="font-bold text-slate-900">{selectedProduct.name}</div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[11px]">
                    {selectedProduct.category}
                  </Badge>
                  <span>Rate: {formatINR(selectedProduct.defaultRate)}</span>
                  {selectedProduct.hsnSac && <span>HSN: {selectedProduct.hsnSac}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[11px] text-slate-500 block">Warehouse Stock</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    availableSerials.length > 0 ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {availableSerials.length} in-stock
                </span>
              </div>
            </div>
          )}

          {/* Quantity Input (Prominent & Clear for Installation & Service Jobs) */}
          <div className="p-3 rounded-xl bg-orange-50/50 border border-orange-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-800 font-bold text-[13px] flex items-center gap-1.5">
                {job.type === 'INSTALLATION' ? 'Quantity installed' : 'Quantity used'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <span className="hidden sm:inline text-xs text-slate-500">
                {job.type === 'INSTALLATION' ? 'e.g. 6 cameras' : 'Parts fitted or replaced'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, quantity - 1);
                    setQuantity(next);
                    if (selectedSerialIds.length > next) {
                      setSelectedSerialIds(selectedSerialIds.slice(0, next));
                    }
                  }}
                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer border-r border-slate-200"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <Input
                  type="number"
                  min="1"
                  max={availableSerials.length > 0 ? undefined : 999}
                  value={quantity}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 1);
                    setQuantity(val);
                    if (selectedSerialIds.length > val) {
                      setSelectedSerialIds(selectedSerialIds.slice(0, val));
                    }
                  }}
                  className="w-16 h-8 text-center text-[13px] bg-white font-mono font-bold border-none shadow-none rounded-none focus-visible:ring-0"
                  required
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer border-l border-slate-200"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className="text-[13px] font-semibold text-slate-700 font-mono">
                {selectedProduct?.unit || 'Units'}
              </span>

              {/* Quick Batch Presets for Installation jobs */}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[11px] text-slate-400 font-medium mr-0.5">Quick:</span>
                {[2, 4, 6, 8, 10].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setQuantity(preset);
                      if (selectedSerialIds.length > preset) {
                        setSelectedSerialIds(selectedSerialIds.slice(0, preset));
                      }
                    }}
                    className={`px-2 py-1 text-[11px] font-mono font-bold rounded-md border transition-all cursor-pointer ${
                      quantity === preset
                        ? 'bg-orange-500 border-orange-500 text-white shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Serial Picker (Multi-select) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-800 text-[13px] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-orange-600" />
                  Serial numbers (optional)
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Pick up to {quantity} — recorded at this customer for warranty
                </span>
              </div>

              {availableSerials.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px] font-mono">
                    {selectedSerialIds.length} / {quantity}
                  </Badge>
                  {availableSerials.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAutoSelectSerials}
                      className="text-[11px] h-6 px-2"
                    >
                      Auto-pick {Math.min(quantity, availableSerials.length)}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {availableSerials.length === 0 ? (
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-[13px] space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-xs">
                  <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  Non-serial tracking mode
                </div>
                <p className="text-[11px] text-blue-700 leading-normal">
                  No individual serial numbers are registered in warehouse stock for this item.
                  Quantity will be recorded directly against product usage (ideal for consumables,
                  junction boxes, and bulk accessories).
                </p>
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200">
                {availableSerials.map((s) => {
                  const isSelected = selectedSerialIds.includes(s.id);
                  const vendor = vendors.find((v) => v.id === s.purchasedFromVendorId);

                  return (
                    <div
                      key={s.id}
                      onClick={() => handleToggleSerial(s.id)}
                      className={`p-2 rounded-lg border text-[13px] flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-orange-50/80 border-orange-400 text-orange-950 font-semibold shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center ${
                            isSelected
                              ? 'bg-orange-500 border-orange-500 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="font-mono font-bold text-slate-900 whitespace-nowrap">{s.serialNumber}</span>
                      </div>

                      <div className="hidden sm:block text-[11px] text-slate-500 text-right">
                        <span>{vendor?.name || 'Warehouse Stock'}</span>
                        {s.purchaseDate && <span className="ml-1 text-slate-400 font-mono">&bull; {s.purchaseDate}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving} className="rounded-xl font-semibold">
            Add {quantity} to job
          </Button>
        </div>
      </form>
    </Modal>
  );
};
