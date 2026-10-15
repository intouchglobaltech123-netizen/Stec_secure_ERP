import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import {
  Boxes,
  Search,
  Plus,
  ArrowDownToLine,
  Building2,
  Package,
  Tag,
  AlertTriangle,
  RotateCcw,
  Edit,
  ExternalLink,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  ScanBarcode,
  Copy,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR, formatDate, humanize } from '@/lib/utils';
import { ServiceCategory, SERVICE_CATEGORIES, Product, Vendor, SerialUnit, SerialStatus } from '@/lib/stecsecure-types';
import { generateInternalBarcode, copyBarcodeToClipboard } from '@/lib/barcode-utils';
import { errorMessage } from '@/lib/api';
import { VendorModal } from '@/components/inventory/VendorModal';
import { ProductModal } from '@/components/inventory/ProductModal';
import { AddStockModal } from '@/components/inventory/AddStockModal';
import { SerialDetailsModal } from '@/components/inventory/SerialDetailsModal';
import { toast } from 'sonner';

export const InventoryPage: React.FC = () => {
  const {
    products,
    serialUnits,
    vendors,
    customers,
    jobs,
    isManagement,
    jobProductUsages,
    updateProduct,
  } = useStecSecure();


  // Tab control
  const [activeTab, setActiveTab] = useState<'SERIALS' | 'PRODUCTS' | 'VENDORS'>('SERIALS');

  // Modal controls
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [selectedVendorForEdit, setSelectedVendorForEdit] = useState<Vendor | null>(null);
  const [inspectingSerial, setInspectingSerial] = useState<SerialUnit | null>(null);
  // Product id whose barcode is being generated (one at a time, so two products never get the same code)
  const [generatingBarcodeFor, setGeneratingBarcodeFor] = useState<string | null>(null);

  // Filters for Serial Tracker
  const [serialSearch, setSerialSearch] = useState('');
  const [serialStatusFilter, setSerialStatusFilter] = useState<'ALL' | SerialStatus>('ALL');
  const [serialProductFilter, setSerialProductFilter] = useState<string>('ALL');
  const [serialVendorFilter, setSerialVendorFilter] = useState<string>('ALL');

  // Filters for Product Catalog
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Filters for Vendors
  const [vendorSearch, setVendorSearch] = useState('');

  // Calculations for KPI tiles
  const inStockUnits = serialUnits.filter((s) => s.status === 'IN_STOCK');
  const allocatedUnits = serialUnits.filter((s) => s.status === 'ALLOCATED');
  const installedUnits = serialUnits.filter((s) => s.status === 'INSTALLED');
  const returnedUnits = serialUnits.filter((s) => s.status === 'RETURNED');
  const inRepairUnits = serialUnits.filter((s) => s.status === 'IN_REPAIR');

  // Low stock warning: products with fewer than 3 available units (accounting for job allocations and non-serial usages)
  const lowStockProducts = products.filter((p) => {
    const nonSerialUsed = jobProductUsages
      .filter((u) => u.productId === p.id && (!u.serialUnitIds || u.serialUnitIds.length === 0))
      .reduce((sum, u) => sum + u.quantity, 0);
    const count = Math.max(
      0,
      serialUnits.filter((s) => s.productId === p.id && s.status === 'IN_STOCK').length - nonSerialUsed
    );
    return count < 3;
  });


  // Filtered Serial Units
  const filteredSerials = serialUnits.filter((s) => {
    const prod = products.find((p) => p.id === s.productId);
    const vend = vendors.find((v) => v.id === s.purchasedFromVendorId);
    const cust = customers.find((c) => c.id === s.soldToCustomerId);
    const job = jobs.find((j) => j.id === s.installedAtJobId);

    const matchesSearch =
      s.serialNumber.toLowerCase().includes(serialSearch.toLowerCase()) ||
      (prod && prod.name.toLowerCase().includes(serialSearch.toLowerCase())) ||
      (s.installedLocation && s.installedLocation.toLowerCase().includes(serialSearch.toLowerCase())) ||
      (cust && cust.name.toLowerCase().includes(serialSearch.toLowerCase())) ||
      (job && job.jobNumber.toLowerCase().includes(serialSearch.toLowerCase()));

    const matchesStatus = serialStatusFilter === 'ALL' || s.status === serialStatusFilter;
    const matchesProduct = serialProductFilter === 'ALL' || s.productId === serialProductFilter;
    const matchesVendor = serialVendorFilter === 'ALL' || s.purchasedFromVendorId === serialVendorFilter;

    return matchesSearch && matchesStatus && matchesProduct && matchesVendor;
  });

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.hsnSac && p.hsnSac.toLowerCase().includes(productSearch.toLowerCase())) ||
      (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(productSearch.toLowerCase()));
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Filtered Vendors
  const filteredVendors = vendors.filter((v) => {
    return (
      v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      v.phone.includes(vendorSearch) ||
      (v.contactPerson && v.contactPerson.toLowerCase().includes(vendorSearch.toLowerCase())) ||
      (v.gstin && v.gstin.toLowerCase().includes(vendorSearch.toLowerCase())) ||
      v.address.toLowerCase().includes(vendorSearch.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">
            Inventory
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Products, stock and serial numbers — where every unit is
          </p>
        </div>

        {/* CEO / Manager Action Bar — Single Unified "+ Add Stock" Flow (Phase 10.5) */}
        {isManagement && (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddStockOpen(true)}
              className="text-[13px] font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Stock
            </Button>
          </div>
        )}
      </div>

      {/* Summary Tiles at top of InventoryPage */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total Products */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-3.5 space-y-1">
            <div className="text-[11px] uppercase font-bold text-slate-500 flex items-center justify-between">
              <span>Products</span>
              <Package className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">{products.length}</div>
            <p className="text-[11px] text-slate-500">Across 6 categories</p>
          </CardContent>
        </Card>

        {/* In Stock */}
        <Card className="border-slate-200 bg-white shadow-sm hover:border-emerald-300 transition-colors">
          <CardContent className="p-3.5 space-y-1">
            <div className="text-[11px] uppercase font-bold text-emerald-700 flex items-center justify-between">
              <span>In Stock</span>
              <Boxes className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 font-mono">{inStockUnits.length}</div>
            <p className="text-[11px] text-slate-500">Ready to deploy</p>
          </CardContent>
        </Card>

        {/* Allocated */}
        <Card className="border-slate-200 bg-white shadow-sm hover:border-blue-300 transition-colors">
          <CardContent className="p-3.5 space-y-1">
            <div className="text-[11px] uppercase font-bold text-blue-700 flex items-center justify-between">
              <span>Allocated</span>
              <Clock className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-700 font-mono">{allocatedUnits.length}</div>
            <p className="text-[11px] text-slate-500">Assigned to field jobs</p>
          </CardContent>
        </Card>

        {/* Installed */}
        <Card className="border-slate-200 bg-white shadow-sm hover:border-emerald-300 transition-colors">
          <CardContent className="p-3.5 space-y-1">
            <div className="text-[11px] uppercase font-bold text-emerald-700 flex items-center justify-between">
              <span>Installed</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 font-mono">{installedUnits.length}</div>
            <p className="text-[11px] text-slate-500">Live at client sites</p>
          </CardContent>
        </Card>

        {/* Returned */}
        <Card className="border-slate-200 bg-white shadow-sm hover:border-rose-300 transition-colors">
          <CardContent className="p-3.5 space-y-1">
            <div className="text-[11px] uppercase font-bold text-rose-700 flex items-center justify-between">
              <span>Returned</span>
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="text-2xl font-bold text-rose-700 font-mono">{returnedUnits.length}</div>
            <p className="text-[11px] text-slate-500">RMA / Faulty items</p>
          </CardContent>
        </Card>

        {/* Low Stock Warning */}
        <Card
          className={`border-slate-200 bg-white shadow-sm transition-colors ${
            lowStockProducts.length > 0 ? 'border-amber-300 bg-amber-50/40' : ''
          }`}
        >
          <CardContent className="p-3.5 space-y-1">
            <div className="text-[11px] uppercase font-bold text-amber-800 flex items-center justify-between">
              <span>Low Stock</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-800 font-mono">{lowStockProducts.length}</div>
            <p className="text-[11px] text-slate-500">&lt; 3 units available</p>
          </CardContent>
        </Card>

        {/* Total Vendors */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-3.5 space-y-1">
            <div className="text-[11px] uppercase font-bold text-slate-500 flex items-center justify-between">
              <span>Vendors</span>
              <Building2 className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">{vendors.length}</div>
            <p className="text-[11px] text-slate-500">Registered OEMs</p>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Warning Banner if any */}
      {lowStockProducts.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px] shadow-2xs">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              <strong>Low Inventory Notice:</strong> {lowStockProducts.length} product(s) have fewer than 3 units in stock:{' '}
              {lowStockProducts.slice(0, 3).map((p) => p.name).join(', ')}
              {lowStockProducts.length > 3 ? '...' : ''}
            </span>
          </div>
          {isManagement && (
            <Button
              size="sm"
              variant="warning"
              onClick={() => setIsAddStockOpen(true)}
              className="text-[13px] shrink-0"
            >
              <ArrowDownToLine className="w-3 h-3 mr-1" /> Re-stock Now
            </Button>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('SERIALS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'SERIALS'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Serial numbers ({serialUnits.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PRODUCTS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'PRODUCTS'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Products ({products.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('VENDORS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'VENDORS'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Suppliers ({vendors.length})</span>
        </button>
      </div>

      {/* TAB 1: SERIAL UNIT TRACKER */}
      {activeTab === 'SERIALS' && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                placeholder="Search serial no, product, customer..."
                value={serialSearch}
                onChange={(e) => setSerialSearch(e.target.value)}
                className="pl-9 text-[13px] bg-white"
              />
            </div>

            {/* Status Filter */}
            <select
              value={serialStatusFilter}
              onChange={(e) => setSerialStatusFilter(e.target.value as any)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="IN_STOCK">IN_STOCK (Warehouse)</option>
              <option value="ALLOCATED">ALLOCATED (To Job)</option>
              <option value="INSTALLED">INSTALLED (At Customer)</option>
              <option value="IN_REPAIR">IN_REPAIR (RMA / Workshop)</option>
              <option value="RETURNED">RETURNED (RMA Defect)</option>
            </select>

            {/* Product Filter */}
            <select
              value={serialProductFilter}
              onChange={(e) => setSerialProductFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Products ({products.length})</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Vendor Filter */}
            <select
              value={serialVendorFilter}
              onChange={(e) => setSerialVendorFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Vendors ({vendors.length})</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Serials Table */}
          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="stack-on-phone w-full text-left text-[13px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Serial Number</th>
                      <th className="p-3">Product Model</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Where Bought From</th>
                      <th className="p-3">Where Deployed / Installed</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSerials.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                          No serial units matching your search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredSerials.map((s) => {
                        const prod = products.find((p) => p.id === s.productId);
                        const vend = vendors.find((v) => v.id === s.purchasedFromVendorId);
                        const cust = customers.find((c) => c.id === s.soldToCustomerId);
                        const job = jobs.find((j) => j.id === s.installedAtJobId);

                        const statusVariant =
                          s.status === 'INSTALLED'
                            ? 'success'
                            : s.status === 'ALLOCATED'
                            ? 'default'
                            : s.status === 'RETURNED'
                            ? 'danger'
                            : s.status === 'IN_REPAIR'
                            ? 'warning'
                            : 'secondary';

                        return (
                          <tr
                            key={s.id}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setInspectingSerial(s)}
                          >
                            <td className="p-3 font-mono font-bold text-orange-600 whitespace-nowrap">
                              {s.serialNumber}
                            </td>
                            <td className="p-3 font-medium text-slate-900 max-w-[180px] truncate">
                              {prod?.name || 'Unknown Model'}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-[11px]">
                                {prod?.category}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant={statusVariant} className="text-[11px]">
                                {humanize(s.status)}
                              </Badge>
                            </td>
                            <td className="p-3 text-slate-700">
                              <div>{vend?.name || 'Direct / Warehouse'}</div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {formatDate(s.purchaseDate || '')}
                              </div>
                            </td>
                            <td className="p-3 text-slate-700">
                              {s.status === 'INSTALLED' && (
                                <div>
                                  <div className="text-slate-900 font-semibold">{cust?.name}</div>
                                  <div className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium">
                                    <MapPin className="w-2.5 h-2.5" />
                                    {s.installedLocation || 'Customer site'}
                                  </div>
                                </div>
                              )}
                              {s.status === 'ALLOCATED' && (
                                <div>
                                  <div className="text-blue-700 font-semibold">
                                    Job: {job?.jobNumber || s.installedAtJobId}
                                  </div>
                                  <div className="text-[11px] text-slate-500">{cust?.name}</div>
                                </div>
                              )}
                              {s.status === 'IN_STOCK' && (
                                <span className="text-slate-500 italic">Central Stock</span>
                              )}
                              {s.status === 'RETURNED' && (
                                <span className="text-rose-600 text-xs font-semibold">
                                  {s.installedLocation || 'RMA Return'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 px-2"
                                onClick={() => setInspectingSerial(s)}
                              >
                                Provenance
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: PRODUCT CATALOG MANAGEMENT */}
      {activeTab === 'PRODUCTS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex flex-1 gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <Input
                  placeholder="Search product catalog or HSN..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9 text-[13px] bg-white"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500"
              >
                <option value="ALL">All Categories</option>
                {SERVICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((prod) => {
              const serials = serialUnits.filter((s) => s.productId === prod.id);
              const nonSerialUsed = jobProductUsages
                .filter((u) => u.productId === prod.id && (!u.serialUnitIds || u.serialUnitIds.length === 0))
                .reduce((sum, u) => sum + u.quantity, 0);
              const inStock = Math.max(
                0,
                serials.filter((s) => s.status === 'IN_STOCK').length - nonSerialUsed
              );
              const inFieldAllocated = serials.filter((s) => s.status === 'ALLOCATED').length;


              return (
                <Card key={prod.id} className="border-slate-200 bg-white shadow-sm flex flex-col justify-between hover:border-orange-200 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="outline" className="text-[11px]">
                        {prod.category}
                      </Badge>
                      {prod.hsnSac && (
                        <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          HSN: {prod.hsnSac}
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-base text-slate-900 mt-2 leading-snug">{prod.name}</CardTitle>
                    {prod.description && (
                      <p className="text-[13px] text-slate-500 line-clamp-2 mt-1">{prod.description}</p>
                    )}
                  </CardHeader>

                  <CardContent className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-slate-500">Default Rate:</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {formatINR(prod.defaultRate)} / {prod.unit} ({prod.gstRate}% GST)
                      </span>
                    </div>

                    <div className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Stock Units:</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={inStock < 3 ? 'warning' : 'success'} className="text-[11px]">
                          {inStock} In Stock
                        </Badge>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-600 font-medium">{serials.length} Total</span>
                      </div>
                    </div>

                    {/* Barcode display / Generate Barcode Now action (Task 2 & 3) */}
                    <div className="p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium flex items-center gap-1">
                        <ScanBarcode className="w-3.5 h-3.5 text-slate-500" />
                        Barcode:
                      </span>
                      {prod.barcode ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 text-xs">
                            {prod.barcode}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyBarcodeToClipboard(prod.barcode!);
                              toast.success(`Copied barcode "${prod.barcode}" to clipboard!`);
                            }}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                            title="Copy Barcode"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 italic text-[11px]">
                            No barcode — manual entry
                          </span>
                          {isManagement && (
                            <button
                              type="button"
                              disabled={generatingBarcodeFor !== null}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const code = generateInternalBarcode(products);
                                setGeneratingBarcodeFor(prod.id);
                                try {
                                  await updateProduct(prod.id, { barcode: code });
                                  toast.success(
                                    `Generated barcode ${code} for "${prod.name}" — you can print/write this on the item for future scanning.`,
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
                                } catch (err) {
                                  toast.error(errorMessage(err));
                                } finally {
                                  setGeneratingBarcodeFor(null);
                                }
                              }}
                              className="text-[11px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                              Generate Barcode Now
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isManagement && (
                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedProductForEdit(prod);
                            setIsProductModalOpen(true);
                          }}
                          className="h-7 text-xs"
                        >
                          <Edit className="w-3 h-3 mr-1" /> Edit Product
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: VENDOR DIRECTORY MANAGEMENT */}
      {activeTab === 'VENDORS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                placeholder="Search vendors by name, phone, GSTIN..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="pl-9 text-[13px] bg-white"
              />
            </div>

            {isManagement && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSelectedVendorForEdit(null);
                  setIsVendorModalOpen(true);
                }}
                className="text-[13px] shrink-0 bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Vendor
              </Button>
            )}
          </div>

          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="stack-on-phone w-full text-left text-[13px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Vendor / OEM Name</th>
                      <th className="p-3">Contact Person</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Warehouse Address</th>
                      <th className="p-3">GSTIN</th>
                      <th className="p-3">Purchased Units</th>
                      {isManagement && <th className="p-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVendors.map((vend) => {
                      const vendorSerials = serialUnits.filter(
                        (s) => s.purchasedFromVendorId === vend.id
                      );

                      return (
                        <tr key={vend.id} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-900">
                            {vend.name}
                          </td>
                          <td className="p-3 text-slate-700">
                            {vend.contactPerson || '-'}
                          </td>
                          <td className="p-3 text-slate-700">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {vend.phone}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 max-w-xs truncate">
                            {vend.address}
                          </td>
                          <td className="p-3 font-mono text-orange-600 text-xs font-semibold">
                            {vend.gstin || '-'}
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[11px]">
                              {vendorSerials.length} Units Inwarded
                            </Badge>
                          </td>
                          {isManagement && (
                            <td className="p-3 text-right">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedVendorForEdit(vend);
                                  setIsVendorModalOpen(true);
                                }}
                                className="h-7 text-xs"
                              >
                                <Edit className="w-3 h-3 mr-1" /> Edit
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Unified Add Stock Modal (Phase 10.5) */}
      <AddStockModal isOpen={isAddStockOpen} onClose={() => setIsAddStockOpen(false)} />

      <ProductModal
        isOpen={isProductModalOpen}
        product={selectedProductForEdit}
        onClose={() => {
          setIsProductModalOpen(false);
          setSelectedProductForEdit(null);
        }}
      />

      <VendorModal
        isOpen={isVendorModalOpen}
        vendor={selectedVendorForEdit}
        onClose={() => {
          setIsVendorModalOpen(false);
          setSelectedVendorForEdit(null);
        }}
      />

      <SerialDetailsModal
        isOpen={Boolean(inspectingSerial)}
        serial={inspectingSerial}
        onClose={() => setInspectingSerial(null)}
      />
    </div>
  );
};
