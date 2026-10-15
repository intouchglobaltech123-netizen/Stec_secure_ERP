import React, { useState, useEffect, useRef } from 'react';
import { localDateISO } from '@/lib/numbering';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import {
  Product,
  Vendor,
  ServiceCategory,
  SERVICE_CATEGORIES,
} from '@/lib/stecsecure-types';
import {
  X,
  Boxes,
  Plus,
  Search,
  Building2,
  Package,
  Check,
  ArrowDownToLine,
  Calendar,
  Tag,
  Sparkles,
  ArrowRight,
  ScanBarcode,
  Barcode,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatINR } from '@/lib/utils';
import { generateInternalBarcode, copyBarcodeToClipboard } from '@/lib/barcode-utils';
import { toast } from 'sonner';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProductId?: string;
}

export const AddStockModal: React.FC<AddStockModalProps> = ({
  isOpen,
  onClose,
  defaultProductId,
}) => {
  const { products, vendors, addProduct, addVendor, stockInSerials } =
    useStecSecure();

  // STEP 1: Product Selection / Barcode Scan / Inline Creation State
  const [productEntryMode, setProductEntryMode] = useState<'SCAN' | 'SEARCH'>('SCAN');
  const [scannedBarcodeInput, setScannedBarcodeInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const [generateInternalBarcodeChecked, setGenerateInternalBarcodeChecked] = useState(true);
  const [productCreatedReason, setProductCreatedReason] = useState<'SCANNED_UNKNOWN' | 'MANUAL_ENTRY' | null>(null);
  const [newProductCategory, setNewProductCategory] = useState<ServiceCategory>('CCTV');
  const [newProductHsn, setNewProductHsn] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('Nos');
  const [newProductRate, setNewProductRate] = useState<number>(2500);
  const [newProductGst, setNewProductGst] = useState<number>(18);

  // STEP 2: Vendor Selection / Inline Creation State
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isCreatingVendor, setIsCreatingVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorAddress, setNewVendorAddress] = useState('');
  const [newVendorGstin, setNewVendorGstin] = useState('');

  // STEP 3: Purchase Details State
  const [purchaseDate, setPurchaseDate] = useState(
    localDateISO()
  );
  const [purchaseCost, setPurchaseCost] = useState('');

  // STEP 4: Serial Numbers State
  const [bulkSerialsText, setBulkSerialsText] = useState('');

  const [saving, setSaving] = useState(false);

  // Initialize on open — only when the modal opens, not when `products` changes
  // while it is open (e.g. after the inline-created product comes back from the server)
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (justOpened) {
      if (defaultProductId) {
        const prod = products.find((p) => p.id === defaultProductId);
        if (prod) {
          setSelectedProduct(prod);
          setProductSearch('');
          setIsCreatingProduct(false);
        }
      } else {
        setSelectedProduct(null);
        setProductSearch('');
        setIsCreatingProduct(false);
      }
      setProductEntryMode('SCAN');
      setScannedBarcodeInput('');
      setNewProductBarcode('');
      setProductCreatedReason(null);
      setGenerateInternalBarcodeChecked(true);
      setSelectedVendor(null);
      setVendorSearch('');
      setIsCreatingVendor(false);
      setPurchaseDate(localDateISO());
      setPurchaseCost('');
      setBulkSerialsText('');
    }
  }, [isOpen, defaultProductId, products]);

  if (!isOpen) return null;

  // Autocomplete matching for products (matches name, category, HSN/SAC, or barcode)
  const matchingProducts = products.filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.hsnSac && p.hsnSac.includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  // Autocomplete matching for vendors
  const matchingVendors = vendors.filter((v) => {
    if (!vendorSearch.trim()) return true;
    const q = vendorSearch.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.phone.includes(q) ||
      (v.contactPerson && v.contactPerson.toLowerCase().includes(q)) ||
      (v.gstin && v.gstin.toLowerCase().includes(q))
    );
  });

  // Parse entered serial numbers
  const parsedSerials = bulkSerialsText
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Auto-generate realistic demo serials
  const handleAutoGenerateSerials = () => {
    const prodName = selectedProduct
      ? selectedProduct.name
      : isCreatingProduct && newProductName
      ? newProductName
      : 'ITEM';

    let prefix = 'STEC-';
    if (prodName.toUpperCase().includes('ONEVU') || prodName.toUpperCase().includes('4G')) {
      prefix = '1VU-2408-';
    } else if (prodName.toUpperCase().includes('CP PLUS') || prodName.toUpperCase().includes('CP')) {
      prefix = 'CP-IPC-';
    } else if (prodName.toUpperCase().includes('HIKVISION') || prodName.toUpperCase().includes('HIK')) {
      prefix = 'HIK-NVR-';
    } else if (prodName.toUpperCase().includes('GATE')) {
      prefix = 'GM-SWG-';
    } else if (prodName.toUpperCase().includes('ESSL') || prodName.toUpperCase().includes('FACE')) {
      prefix = 'ESSL-FC-';
    } else if (prodName.toUpperCase().includes('VDP') || prodName.toUpperCase().includes('INTERCOM')) {
      prefix = 'VDP-MON-';
    } else if (prodName.toUpperCase().includes('ALARM')) {
      prefix = 'SEC-ALM-';
    }

    const rand = Math.floor(1000 + Math.random() * 9000);
    const generated = `${prefix}${rand}A\n${prefix}${rand}B\n${prefix}${rand}C`;
    setBulkSerialsText(generated);
  };

  // Barcode Scan / Lookup Handler
  const handleBarcodeScan = (rawCode?: string) => {
    const code = (rawCode !== undefined ? rawCode : scannedBarcodeInput).trim();
    if (!code) {
      toast.error('Please scan or enter a barcode number');
      return;
    }

    const matched = products.find(
      (p) => p.barcode && p.barcode.trim().toLowerCase() === code.toLowerCase()
    );

    if (matched) {
      setSelectedProduct(matched);
      setIsCreatingProduct(false);
      setScannedBarcodeInput('');
      toast.success(`Matched Product: "${matched.name}"`, {
        description: `Barcode ${matched.barcode} verified against catalog.`,
      });
    } else {
      // Unknown barcode: open inline create and prefill barcode
      setIsCreatingProduct(true);
      setNewProductName('');
      setNewProductBarcode(code);
      setProductCreatedReason('SCANNED_UNKNOWN');
      setGenerateInternalBarcodeChecked(false);
      toast.info(`Unrecognized Barcode: "${code}"`, {
        description: 'New product creation opened. Scanned barcode pre-filled.',
      });
    }
  };

  // Trigger inline product creation from typed text
  const handleStartCreateProduct = () => {
    setNewProductName(productSearch.trim());
    setNewProductBarcode('');
    setProductCreatedReason('MANUAL_ENTRY');
    setGenerateInternalBarcodeChecked(true);
    setNewProductCategory('CCTV');
    setNewProductHsn('');
    setNewProductUnit('Nos');
    setNewProductRate(2500);
    setNewProductGst(18);
    setIsCreatingProduct(true);
  };

  // Trigger inline vendor creation from typed text
  const handleStartCreateVendor = () => {
    setNewVendorName(vendorSearch.trim());
    setNewVendorPhone('');
    setNewVendorAddress('');
    setNewVendorGstin('');
    setIsCreatingVendor(true);
  };

  // Master confirmation submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // 1. Validate Product
    if (!selectedProduct && (!isCreatingProduct || !newProductName.trim())) {
      toast.error('Please select an existing product or fill in the new product details');
      return;
    }

    // 2. Validate Vendor
    if (!selectedVendor && isCreatingVendor) {
      if (!newVendorName.trim() || !newVendorPhone.trim() || !newVendorAddress.trim()) {
        toast.error('Please enter vendor name, phone number, and address');
        return;
      }
    }

    // 3. Validate Serials
    if (parsedSerials.length === 0) {
      toast.error('Please enter at least one serial number');
      return;
    }

    setSaving(true);
    try {
      let finalProductId = selectedProduct?.id;
      let finalProductName = selectedProduct?.name || '';
      let generatedInternalCode: string | null = null;

      if (!selectedProduct) {
        let barcodeToAssign: string | undefined = undefined;
        if (newProductBarcode.trim()) {
          barcodeToAssign = newProductBarcode.trim();
        } else if (generateInternalBarcodeChecked) {
          barcodeToAssign = generateInternalBarcode(products);
          generatedInternalCode = barcodeToAssign;
        }

        // Create new product inline
        const createdProd = await addProduct({
          name: newProductName.trim(),
          category: newProductCategory,
          hsnSac: newProductHsn.trim() || undefined,
          unit: newProductUnit.trim() || 'Nos',
          defaultRate: Number(newProductRate) || 0,
          gstRate: Number(newProductGst) || 18,
          barcode: barcodeToAssign,
        });
        finalProductId = createdProd.id;
        finalProductName = createdProd.name;
        // Keep it selected so a retry after a later failure doesn't create it again
        setSelectedProduct(createdProd);
        setIsCreatingProduct(false);
      }

      let finalVendorId = selectedVendor?.id;
      let finalVendorName = selectedVendor?.name || 'Direct Supplier';

      if (!selectedVendor && isCreatingVendor) {
        // Create new vendor inline
        const createdVend = await addVendor({
          name: newVendorName.trim(),
          phone: newVendorPhone.trim(),
          address: newVendorAddress.trim(),
          gstin: newVendorGstin.trim() || undefined,
        });
        finalVendorId = createdVend.id;
        finalVendorName = createdVend.name;
        // Keep it selected so a retry after a later failure doesn't create it again
        setSelectedVendor(createdVend);
        setIsCreatingVendor(false);
      }

      // 4. Stock in all serials
      const createdUnits = await stockInSerials({
        productId: finalProductId!,
        serialNumbers: parsedSerials,
        vendorId: finalVendorId,
        purchaseDate,
        purchaseCost: purchaseCost ? Number(purchaseCost) : undefined,
      });

      toast.success(
        `Added ${createdUnits.length} unit(s) of "${finalProductName}" to stock from ${finalVendorName}.`
      );
      const skipped = parsedSerials.length - createdUnits.length;
      if (skipped > 0) {
        toast.warning(
          `${skipped} serial number(s) skipped — already in stock records or entered twice.`
        );
      }

      // TASK 3: If an internal barcode was generated, show clearly to the user
      if (generatedInternalCode) {
        const code = generatedInternalCode;
        toast.success(
          `Generated barcode ${code} for "${finalProductName}" — you can print/write this on the item for future scanning.`,
          {
            duration: 10000,
            action: {
              label: 'Copy Barcode',
              onClick: () => {
                copyBarcodeToClipboard(code);
                toast.success(`Copied "${code}" to clipboard!`);
              },
            },
          }
        );
      }

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
      maxWidth="5xl"
      showCloseButton={false}
      className="max-h-[94vh] sm:max-h-[92vh] w-[94vw] max-w-5xl"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      {/* Pinned Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              Add Inward Stock
            </h2>
            <p className="text-xs text-slate-500">
              Log newly arrived hardware units into warehouse inventory in one guided flow
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
        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 overscroll-contain">
          {/* ═══════════════════════════════════════════
              STEP 1: PRODUCT SELECTION / BARCODE SCAN (PRODUCT-LEVEL)
             ═══════════════════════════════════════════ */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-200/80 pb-2.5">
              <div>
                <label className="text-xs font-bold text-slate-900 flex items-center gap-2 font-display">
                  <span className="w-5 h-5 rounded-md bg-orange-600 text-white flex items-center justify-center text-[11px] font-extrabold shadow-2xs">1</span>
                  Step 1: Scan Barcode to Identify Product *
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  The barcode identifies the <strong>PRODUCT MODEL</strong> — every unit of the same product shares one barcode.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800 bg-orange-100/90 border border-orange-200 px-2 py-0.5 rounded-md">
                  Product-Level (Shared)
                </span>
                {selectedProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setIsCreatingProduct(false);
                      setProductSearch('');
                      setScannedBarcodeInput('');
                      setNewProductBarcode('');
                      setProductCreatedReason(null);
                    }}
                    className="text-[11px] text-orange-600 hover:text-orange-800 underline font-bold cursor-pointer"
                  >
                    Change Product
                  </button>
                )}
              </div>
            </div>

            {selectedProduct ? (
              /* Selected Existing Product Card — Confirmed Visual Banner */
              <div className="p-4 rounded-xl bg-emerald-50/95 border-2 border-emerald-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                    <Check className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                        ✓ Identified Product Model:
                      </span>
                      <span className="font-extrabold text-slate-900 text-sm sm:text-base font-display">
                        {selectedProduct.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-white border-emerald-300 text-emerald-900 font-semibold">
                        {selectedProduct.category}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-700 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
                      <span>Rate: <strong className="font-mono text-slate-900">{formatINR(selectedProduct.defaultRate)}</strong> / {selectedProduct.unit}</span>
                      <span>&bull;</span>
                      <span>GST: <strong className="font-mono text-slate-900">{selectedProduct.gstRate}%</strong></span>
                      {selectedProduct.hsnSac && (
                        <>
                          <span>&bull;</span>
                          <span>HSN/SAC: <strong className="font-mono text-slate-900">{selectedProduct.hsnSac}</strong></span>
                        </>
                      )}
                      {selectedProduct.barcode ? (
                        <>
                          <span>&bull;</span>
                          <span className="font-mono text-emerald-900 bg-white border border-emerald-300 px-2 py-0.5 rounded font-bold flex items-center gap-1 shadow-2xs">
                            <ScanBarcode className="w-3 h-3 text-emerald-700" />
                            Model Barcode: {selectedProduct.barcode}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>&bull;</span>
                          <span className="text-slate-500 italic bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                            No physical barcode (manual catalog item)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setIsCreatingProduct(false);
                    setProductSearch('');
                    setScannedBarcodeInput('');
                    setNewProductBarcode('');
                    setProductCreatedReason(null);
                  }}
                  className="text-xs text-orange-700 hover:text-orange-900 font-bold underline px-2.5 py-1 rounded-lg hover:bg-orange-100/60 transition-colors shrink-0 cursor-pointer"
                >
                  Change Product
                </button>
              </div>
            ) : isCreatingProduct ? (
              /* Inline Subform: Create New Product */
              <div className="p-4 rounded-xl bg-white border-2 border-orange-300 space-y-3 shadow-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5 font-bold text-orange-950 text-xs">
                    <Plus className="w-3.5 h-3.5 text-orange-600" />
                    <span>Create New Product in Catalog</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingProduct(false);
                      setNewProductBarcode('');
                      setProductCreatedReason(null);
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Cancel / Choose Again
                  </button>
                </div>

                {/* Scanned Barcode Banner if unknown scan */}
                {newProductBarcode && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                    <ScanBarcode className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-semibold">Unrecognized Scanned Barcode: </span>
                      <strong className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300 text-amber-950">
                        {newProductBarcode}
                      </strong>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        This barcode represents the product model and will be saved to your catalog upon confirmation.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Product Name / Model *
                    </label>
                    <Input
                      autoFocus
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      placeholder="e.g. Hikvision 4MP ColorVu Bullet Camera"
                      className="bg-slate-50 text-xs h-8"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Category *</label>
                    <select
                      value={newProductCategory}
                      onChange={(e) => setNewProductCategory(e.target.value as ServiceCategory)}
                      className="w-full h-8 rounded-md border border-slate-300 bg-slate-50 px-2.5 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                    >
                      {SERVICE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Unit (e.g. Nos, Mtr, Set)
                    </label>
                    <Input
                      value={newProductUnit}
                      onChange={(e) => setNewProductUnit(e.target.value)}
                      placeholder="Nos"
                      className="bg-slate-50 text-xs h-8"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Default Selling Rate (₹) *
                    </label>
                    <Input
                      type="number"
                      value={newProductRate}
                      onChange={(e) => setNewProductRate(Number(e.target.value))}
                      className="bg-slate-50 text-xs h-8 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      HSN / SAC Code (Optional)
                    </label>
                    <Input
                      value={newProductHsn}
                      onChange={(e) => setNewProductHsn(e.target.value)}
                      placeholder="e.g. 85258090"
                      className="bg-slate-50 text-xs h-8 font-mono"
                    />
                  </div>

                  {/* Physical Barcode Field if present */}
                  {newProductBarcode ? (
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Model Barcode (Pre-filled from scan)
                      </label>
                      <Input
                        value={newProductBarcode}
                        onChange={(e) => setNewProductBarcode(e.target.value)}
                        className="bg-slate-50 text-xs h-8 font-mono font-bold text-slate-900"
                      />
                    </div>
                  ) : (
                    /* TASK 2: Products without physical barcode (~10% case) */
                    <div className="sm:col-span-2 lg:col-span-3 p-3 rounded-lg border border-orange-200 bg-orange-50/40 space-y-1.5">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={generateInternalBarcodeChecked}
                          onChange={(e) => setGenerateInternalBarcodeChecked(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 accent-orange-600 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-900">
                            This product has no barcode — generate an internal barcode for faster stock-ins next time?
                          </span>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {generateInternalBarcodeChecked ? (
                              <span className="text-emerald-700 font-semibold flex items-center gap-1.5 mt-1">
                                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                                Will auto-generate unique internal code:{' '}
                                <span className="font-mono bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded text-emerald-950">
                                  {generateInternalBarcode(products)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-500 italic block mt-1">
                                Declined: Barcode will remain empty, product will be manual-entry only (searchable by name).
                              </span>
                            )}
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-orange-700 bg-orange-50 px-2.5 py-1.5 rounded-lg border border-orange-200">
                  This product will be saved to your Product Catalog automatically upon confirmation.
                </div>
              </div>
            ) : (
              /* Entry Method: Scan Barcode OR Search Catalog */
              <div className="space-y-3">
                {/* Method Switcher Tabs */}
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => setProductEntryMode('SCAN')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      productEntryMode === 'SCAN'
                        ? 'bg-white text-orange-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <ScanBarcode className="w-3.5 h-3.5" />
                    Scan Barcode
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductEntryMode('SEARCH')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      productEntryMode === 'SEARCH'
                        ? 'bg-white text-orange-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    Search Catalog by Name
                  </button>
                </div>

                {productEntryMode === 'SCAN' ? (
                  /* Barcode Scanner Input Panel (Task 1) */
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <Barcode className="w-4 h-4 text-orange-600" />
                        <span>Barcode / EAN Scanner Input</span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Point handheld scanner or type barcode and press Enter
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <ScanBarcode className="w-4 h-4 text-orange-600 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          autoFocus
                          value={scannedBarcodeInput}
                          onChange={(e) => setScannedBarcodeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleBarcodeScan();
                            }
                          }}
                          placeholder="Scan or type barcode (e.g. 8901234567890) and press Enter..."
                          className="pl-9 bg-white text-xs h-9 border-slate-300 font-mono focus:border-orange-500 font-medium"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleBarcodeScan()}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-9 px-4 shrink-0 font-bold cursor-pointer"
                      >
                        Lookup / Scan
                      </Button>
                    </div>

                    {/* Quick Demo Test Chips */}
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        <span>Click demo barcodes to test:</span>
                        <span className="text-slate-400 font-normal">Physical barcode scanner inputs directly here</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleBarcodeScan('8901234567890')}
                          className="px-2.5 py-1 rounded bg-slate-50 hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-[11px] font-mono text-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="Existing Product: ONEVU 4G Camera"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>8901234567890</span>
                          <span className="text-[10px] text-slate-500 font-sans">(ONEVU Camera)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleBarcodeScan('8909876543210')}
                          className="px-2.5 py-1 rounded bg-slate-50 hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-[11px] font-mono text-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="Existing Product: 64GB Micro SD Card"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>8909876543210</span>
                          <span className="text-[10px] text-slate-500 font-sans">(64GB SD Card)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleBarcodeScan('8907777888899')}
                          className="px-2.5 py-1 rounded bg-amber-50/80 hover:bg-amber-100 border border-amber-300 text-[11px] font-mono text-amber-900 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="Unknown Barcode (Starts new product creation)"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>8907777888899</span>
                          <span className="text-[10px] text-amber-800 font-sans font-bold">(New Unknown Barcode)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Searchable Autocomplete Input */
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Type to search existing products by name, category, or barcode..."
                        className="pl-9 bg-white text-xs h-9 border-slate-300"
                      />
                    </div>

                    {/* Dropdown Results list */}
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-2xs">
                      {matchingProducts.length > 0 ? (
                        matchingProducts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProduct(p);
                              setProductSearch('');
                            }}
                            className="w-full text-left p-2.5 hover:bg-orange-50/60 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs group-hover:text-orange-700">
                                <span>{p.name}</span>
                                {p.barcode && (
                                  <span className="font-mono text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                    <ScanBarcode className="w-2.5 h-2.5" />
                                    {p.barcode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {p.category} &bull; Unit: {p.unit}
                                {p.hsnSac && <span> &bull; HSN: {p.hsnSac}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className="font-mono font-bold text-slate-900 text-xs">
                                {formatINR(p.defaultRate)}
                              </span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-slate-500 text-xs">
                          No matching products in catalog for "{productSearch}"
                        </div>
                      )}

                      {/* Inline Create Option when typed (Task 2: No-barcode creation) */}
                      {productSearch.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={handleStartCreateProduct}
                          className="w-full text-left p-2.5 bg-orange-50/70 hover:bg-orange-100/80 transition-colors flex items-center justify-between text-orange-950 font-semibold cursor-pointer border-t border-orange-200"
                        >
                          <div className="flex items-center gap-1.5">
                            <Plus className="w-3.5 h-3.5 text-orange-600" />
                            <span>Create <strong>"{productSearch.trim()}"</strong> as a new product</span>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-orange-600" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════
              STEP 2 & STEP 3: VENDOR AND PURCHASE DETAILS
             ═══════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* STEP 2: VENDOR SELECTION / INLINE CREATION */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <div>
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-2 font-display">
                    <span className="w-5 h-5 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold shadow-2xs">2</span>
                    Step 2: Purchased From (Vendor) *
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Select or register the supplier providing this stock.
                  </p>
                </div>
                {selectedVendor && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVendor(null);
                      setIsCreatingVendor(false);
                      setVendorSearch('');
                    }}
                    className="text-[11px] text-orange-600 hover:text-orange-800 underline font-bold cursor-pointer"
                  >
                    Change Vendor
                  </button>
                )}
              </div>

              {selectedVendor ? (
                /* Selected Existing Vendor Card */
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                      <Check className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {selectedVendor.name}
                        </span>
                        {selectedVendor.gstin && (
                          <span className="font-mono text-[10px] text-slate-500">
                            GST: {selectedVendor.gstin}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Phone: <strong className="text-slate-800">{selectedVendor.phone}</strong> &bull; {selectedVendor.address}
                      </div>
                    </div>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    Registered Supplier
                  </Badge>
                </div>
              ) : isCreatingVendor ? (
                /* Inline Subform: Create New Vendor */
                <div className="p-3.5 rounded-xl bg-white border-2 border-orange-300 space-y-3 shadow-xs animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5 font-bold text-orange-950 text-xs">
                      <Plus className="w-3.5 h-3.5 text-orange-600" />
                      <span>Create New Supplier / Vendor</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCreatingVendor(false)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      Cancel / Search Again
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Vendor / Company Name *
                      </label>
                      <Input
                        value={newVendorName}
                        onChange={(e) => setNewVendorName(e.target.value)}
                        placeholder="e.g. SecureTech Systems Distributors"
                        className="bg-slate-50 text-xs h-8"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Phone Number *
                      </label>
                      <Input
                        value={newVendorPhone}
                        onChange={(e) => setNewVendorPhone(e.target.value)}
                        placeholder="e.g. 9840112233"
                        className="bg-slate-50 text-xs h-8"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        Business / Warehouse Address *
                      </label>
                      <Input
                        value={newVendorAddress}
                        onChange={(e) => setNewVendorAddress(e.target.value)}
                        placeholder="e.g. No. 12, Anna Salai, Thousand Lights, Chennai"
                        className="bg-slate-50 text-xs h-8"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">
                        GSTIN (Optional)
                      </label>
                      <Input
                        value={newVendorGstin}
                        onChange={(e) => setNewVendorGstin(e.target.value)}
                        placeholder="e.g. 33AAAAA0000A1Z5"
                        className="bg-slate-50 text-xs h-8 font-mono"
                      />
                    </div>
                  </div>

                  <div className="text-[10px] text-orange-700 bg-orange-50 px-2.5 py-1.5 rounded-lg border border-orange-200">
                    This vendor will be permanently added to your Supplier directory upon confirmation.
                  </div>
                </div>
              ) : (
                /* Searchable Autocomplete Input */
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={vendorSearch}
                      onChange={(e) => setVendorSearch(e.target.value)}
                      placeholder="Type to search suppliers (e.g. CP Plus, Prama, eSSL)..."
                      className="pl-9 bg-white text-xs h-9 border-slate-300"
                    />
                  </div>

                  {/* Dropdown Results list */}
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-2xs">
                    {matchingVendors.length > 0 ? (
                      matchingVendors.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVendor(v);
                            setVendorSearch('');
                          }}
                          className="w-full text-left p-2.5 hover:bg-orange-50/60 transition-colors flex items-center justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-slate-900 text-xs group-hover:text-orange-700">
                              {v.name}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {v.phone} &bull; {v.address}
                            </div>
                          </div>
                          {v.gstin && (
                            <div className="text-right shrink-0 ml-2">
                              <span className="font-mono text-[10px] text-slate-400">
                                {v.gstin}
                              </span>
                            </div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-center text-slate-500 text-xs">
                        No matching vendors for "{vendorSearch}"
                      </div>
                    )}

                    {/* Inline Create Option when typed */}
                    {vendorSearch.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={handleStartCreateVendor}
                        className="w-full text-left p-2.5 bg-orange-50/70 hover:bg-orange-100/80 transition-colors flex items-center justify-between text-orange-950 font-semibold cursor-pointer border-t border-orange-200"
                      >
                        <div className="flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5 text-orange-600" />
                          <span>Create <strong>"{vendorSearch.trim()}"</strong> as a new vendor</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-orange-600" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* STEP 3: PURCHASE DETAILS & UNIT PURCHASE COST */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="border-b border-slate-200/80 pb-2 mb-3">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-2 font-display">
                    <span className="w-5 h-5 rounded-md bg-slate-800 text-white flex items-center justify-center text-[11px] font-extrabold shadow-2xs">3</span>
                    Step 3: Purchase Details &amp; Unit Cost *
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Log inward date &amp; unit purchase cost (saved per serial unit for audit &amp; cost reporting).
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Purchase / Inward Date *
                    </label>
                    <Input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="bg-white text-xs h-9 border-slate-300"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Unit Purchase Cost (₹, per unit)
                    </label>
                    <Input
                      type="number"
                      value={purchaseCost}
                      onChange={(e) => setPurchaseCost(e.target.value)}
                      placeholder="e.g. 2100"
                      className="bg-white text-xs h-9 border-slate-300 font-mono font-medium"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Persisted per individual serial unit record for margin &amp; valuation accuracy.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-200/50 border border-slate-300/60 text-[11px] text-slate-600 mt-2">
                <span className="font-semibold text-slate-800">Batch Note: </span>
                All units in this inward entry will be stamped with this purchase date and unit cost.
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════
              VISUAL DIVIDER: PRODUCT/BATCH -> UNIT-LEVEL
             ═══════════════════════════════════════════ */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-dashed border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-100 px-4 py-1 text-[11px] font-extrabold text-slate-600 rounded-full border border-slate-300/70 uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
                <Tag className="w-3.5 h-3.5 text-orange-600" />
                Unit-Level Unique Serials
              </span>
            </div>
          </div>

          {/* ═══════════════════════════════════════════
              STEP 4: SERIAL NUMBERS (UNIT-LEVEL)
             ═══════════════════════════════════════════ */}
          <div className="p-4 rounded-xl bg-slate-50 border-2 border-orange-200/90 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
              <div>
                <label className="text-xs font-bold text-slate-900 flex items-center gap-2 font-display">
                  <span className="w-5 h-5 rounded-md bg-orange-600 text-white flex items-center justify-center text-[11px] font-extrabold shadow-2xs">4</span>
                  Step 4: Enter Serial Number for EACH Physical Unit *
                </label>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Every individual unit has its own <strong>unique serial number</strong>, even though they share the same barcode above.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAutoGenerateSerials}
                className="text-[11px] text-orange-700 hover:text-orange-900 font-bold flex items-center gap-1.5 cursor-pointer shrink-0 bg-white hover:bg-orange-50 border border-orange-300 px-3 py-1.5 rounded-lg transition-colors shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                + Auto-generate sample serials
              </button>
            </div>

            {/* Clarity Box: 5 units = 5 different serial numbers */}
            <div className="p-3 rounded-xl bg-orange-50/90 border border-orange-200 text-xs text-orange-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-orange-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
                  !
                </div>
                <div>
                  <span className="font-bold">Unit-Level Distinction Rule: </span>
                  <span>
                    If 5 units are being stocked in, enter <strong>5 DIFFERENT serial numbers</strong> below. All 5 units link to the <strong>1 shared barcode/product</strong> ({selectedProduct ? selectedProduct.name : 'identified in Step 1'}).
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                <span className="text-[11px] text-slate-600 font-medium">Batch Count:</span>
                <span className={`font-mono font-bold px-3 py-1 rounded-lg border text-xs shadow-2xs ${
                  parsedSerials.length > 0
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-950'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}>
                  {parsedSerials.length} unit{parsedSerials.length === 1 ? '' : 's'} recognized
                </span>
              </div>
            </div>

            <div>
              <textarea
                rows={5}
                required
                value={bulkSerialsText}
                onChange={(e) => setBulkSerialsText(e.target.value)}
                placeholder="Enter unique unit serial numbers separated by new lines, commas, or spaces:&#10;1VU-2408-9901&#10;1VU-2408-9902&#10;1VU-2408-9903"
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none focus:border-orange-500 leading-relaxed shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span>
                Separate each individual unit serial by newline, comma, or space
              </span>
              <span className="font-mono text-slate-500">
                Unit count must equal total physical items received
              </span>
            </div>
          </div>
        </div>

        {/* Pinned Action Buttons Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            className="rounded-xl text-xs"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={
              saving ||
              (!selectedProduct && (!isCreatingProduct || !newProductName.trim())) ||
              (!selectedVendor && isCreatingVendor && (!newVendorName.trim() || !newVendorPhone.trim() || !newVendorAddress.trim())) ||
              parsedSerials.length === 0
            }
            className="rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Confirm & Add Stock ({parsedSerials.length})
          </Button>
        </div>
      </form>
    </Modal>
  );
};
