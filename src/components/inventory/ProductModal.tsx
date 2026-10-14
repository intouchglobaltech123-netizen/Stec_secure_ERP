import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Product, ServiceCategory, SERVICE_CATEGORIES } from '@/lib/stecsecure-types';
import { generateInternalBarcode, copyBarcodeToClipboard } from '@/lib/barcode-utils';
import { X, Package, ShieldCheck, ScanBarcode, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';

interface ProductModalProps {
  isOpen: boolean;
  product?: Product | null;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ isOpen, product, onClose }) => {
  const { products, addProduct, updateProduct } = useStecSecure();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('CCTV');
  const [hsnSac, setHsnSac] = useState('');
  const [unit, setUnit] = useState('Nos');
  const [defaultRate, setDefaultRate] = useState<number>(3500);
  const [gstRate, setGstRate] = useState<number>(18);
  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategory(product.category);
      setHsnSac(product.hsnSac || '');
      setUnit(product.unit || 'Nos');
      setDefaultRate(product.defaultRate);
      setGstRate(product.gstRate);
      setDescription(product.description || '');
      setBarcode(product.barcode || '');
    } else {
      setName('');
      setCategory('CCTV');
      setHsnSac('');
      setUnit('Nos');
      setDefaultRate(2500);
      setGstRate(18);
      setDescription('');
      setBarcode('');
    }
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter product name');
      return;
    }

    if (product) {
      updateProduct(product.id, {
        name: name.trim(),
        category,
        hsnSac: hsnSac.trim() || undefined,
        unit: unit.trim() || 'Nos',
        defaultRate: Number(defaultRate) || 0,
        gstRate: Number(gstRate) || 0,
        description: description.trim() || undefined,
        barcode: barcode.trim() || undefined,
      });
      toast.success(`Product ${name} updated.`);
    } else {
      const created = addProduct({
        name: name.trim(),
        category,
        hsnSac: hsnSac.trim() || undefined,
        unit: unit.trim() || 'Nos',
        defaultRate: Number(defaultRate) || 0,
        gstRate: Number(gstRate) || 0,
        description: description.trim() || undefined,
        barcode: barcode.trim() || undefined,
      });
      toast.success(`Product ${created.name} added to catalog.`);
    }
    onClose();
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
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              {product ? 'Edit Product' : 'Add New Product to Catalog'}
            </h2>
            <p className="text-xs text-slate-500">
              Manage equipment metadata, HSN/SAC codes and default pricing
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
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Product / Model Name *</label>
            <Input
              required
              placeholder="e.g. ONEVU 4G Smart Solar Dual Camera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xs h-9 bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
              >
                {SERVICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">HSN / SAC Code</label>
              <Input
                placeholder="e.g. 85258090"
                value={hsnSac}
                onChange={(e) => setHsnSac(e.target.value)}
                className="text-xs h-9 font-mono bg-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <ScanBarcode className="w-3.5 h-3.5 text-orange-600" />
                Barcode / EAN (Physical or Internal)
              </label>
              {!barcode && (
                <button
                  type="button"
                  onClick={() => {
                    const code = generateInternalBarcode(products);
                    setBarcode(code);
                    toast.success(`Generated internal barcode: ${code}`);
                  }}
                  className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  + Generate Internal Barcode
                </button>
              )}
            </div>
            <Input
              placeholder="e.g. 8901234567890 or STS-INT-0001"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="text-xs h-9 font-mono bg-white"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Used for high-speed scanner stock-in. Leave blank if product has no physical barcode and manual entry is preferred.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Unit of Measure</label>
              <Input
                placeholder="Nos / Mtr / Set"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="text-xs h-9 bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default Rate (₹)</label>
              <Input
                type="number"
                min="0"
                value={defaultRate}
                onChange={(e) => setDefaultRate(Number(e.target.value))}
                className="text-xs h-9 font-mono bg-white font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">GST Rate (%)</label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-mono"
              >
                <option value={0}>0% (Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18% (Std)</option>
                <option value={28}>28%</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description / Notes</label>
            <textarea
              rows={2}
              placeholder="Technical specifications, lens size, port configuration..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <Button type="button" variant="secondary" size="md" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" className="rounded-xl font-semibold">
            <ShieldCheck className="w-4 h-4 mr-1.5" />
            {product ? 'Save Changes' : 'Create Product'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
