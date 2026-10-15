import React, { useState, useMemo } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Quotation, Invoice, DeliveryChallan, Job, Enquiry, Customer } from '@/lib/stecsecure-types';
import {
  FileSpreadsheet,
  ReceiptText,
  Plus,
  CheckCircle2,
  Clock,
  Search,
  Printer,
  Share2,
  FileText,
  Building2,
  ArrowRight,
  Filter,
  Truck,
  Edit,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ExternalLink,
  Layers,
  Phone,
  Briefcase,
  FolderGit2,
  Wallet,
} from 'lucide-react';
import { RecordAdvanceModal } from '@/components/payments/RecordAdvanceModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR, formatDate } from '@/lib/utils';
import { QuotationBuilderModal } from '@/components/quotations/QuotationBuilderModal';
import { QuotationPreviewModal } from '@/components/quotations/QuotationPreviewModal';
import { DeliveryChallanModal } from '@/components/jobs/DeliveryChallanModal';
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';

export interface ProjectCommercialGroup {
  groupId: string;
  projectType: 'JOB' | 'ENQUIRY' | 'STANDALONE';
  referenceId: string;
  title: string;
  customer: Customer | null;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  job?: Job;
  enquiry?: Enquiry;
  quotations: Quotation[];
  primaryQuotation?: Quotation;
  deliveryChallans: DeliveryChallan[];
  primaryChallan?: DeliveryChallan;
  invoices: Invoice[];
  primaryInvoice?: Invoice;
  createdAt: string;
}

export const QuotationsInvoicesPage: React.FC = () => {
  const {
    jobs,
    enquiries,
    quotations,
    deliveryChallans,
    invoices,
    customers,
    convertQuotationToDeliveryChallan,
    convertDeliveryChallanToInvoice,
    convertQuotationToInvoice,
    isManagement,
  } = useStecSecure();

  // Tab State: Default is 'PROJECT_GROUPS' (Part B Requirement)
  const [activeTab, setActiveTab] = useState<'PROJECT_GROUPS' | 'QUOTATIONS' | 'INVOICES' | 'CHALLANS'>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t?.toLowerCase() === 'invoices') return 'INVOICES';
      if (t?.toLowerCase() === 'quotations') return 'QUOTATIONS';
      if (t?.toLowerCase() === 'challans') return 'CHALLANS';
    }
    return 'PROJECT_GROUPS';
  });

  // Search & Filter for Grouped View
  const [projectSearch, setProjectSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<'ALL' | 'WITH_QUOTATION' | 'WITH_CHALLAN' | 'WITH_INVOICE' | 'PENDING_PAYMENT' | 'SETTLED'>('ALL');

  // Search & Filters for Secondary Views
  const [quotationSearch, setQuotationSearch] = useState('');
  const [quotationStatusFilter, setQuotationStatusFilter] = useState<'ALL' | 'DRAFT' | 'SENT' | 'CONVERTED'>('ALL');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [challanSearch, setChallanSearch] = useState('');

  // Expandable row state for grouped view (Set of groupIds)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Modals state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [quotationToEdit, setQuotationToEdit] = useState<Quotation | null>(null);
  const [builderCustomerId, setBuilderCustomerId] = useState<string | undefined>(undefined);
  const [builderEnquiryId, setBuilderEnquiryId] = useState<string | undefined>(undefined);

  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);
  // Phase 22: quotation an advance is being recorded against
  const [advanceQuotation, setAdvanceQuotation] = useState<Quotation | null>(null);
  const [previewChallan, setPreviewChallan] = useState<DeliveryChallan | null>(null);
  const [challanMode, setChallanMode] = useState<'CREATE' | 'PREVIEW' | 'EDIT'>('PREVIEW');
  const [isChallanModalOpen, setIsChallanModalOpen] = useState(false);
  const [challanJobId, setChallanJobId] = useState<string | undefined>(undefined);
  const [challanQuoteId, setChallanQuoteId] = useState<string | undefined>(undefined);
  const [challanCustomerId, setChallanCustomerId] = useState<string | undefined>(undefined);

  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(() => {
    if (typeof window !== 'undefined') {
      const invId = new URLSearchParams(window.location.search).get('previewInvoice');
      if (invId) {
        return invoices.find((i) => i.id === invId || i.invoiceNo === invId) || invoices[0] || null;
      }
    }
    return null;
  });
  const [invoiceMode, setInvoiceMode] = useState<'PREVIEW' | 'EDIT'>('PREVIEW');
  const [converting, setConverting] = useState(false);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Build Project Groups (Jobs, Follow-up Enquiries, and Standalone Quotes/Invoices)
  const projectGroups: ProjectCommercialGroup[] = useMemo(() => {
    const groups: ProjectCommercialGroup[] = [];
    const seenQuotationIds = new Set<string>();
    const seenChallanIds = new Set<string>();
    const seenInvoiceIds = new Set<string>();

    // 1. Process all Jobs
    for (const job of jobs) {
      const jobEnquiry = job.enquiryId ? enquiries.find((e) => e.id === job.enquiryId) : undefined;
      const customer = customers.find((c) => c.id === job.customerNumber) || null;

      // Match linked quotations
      const matchedQuotes = quotations.filter((q) => {
        const matchesJobQuote = job.quotationId && (q.id === job.quotationId || q.quotationNo === job.quotationId);
        const matchesJobEnquiry = job.enquiryId && q.enquiryId === job.enquiryId;
        return Boolean(matchesJobQuote || matchesJobEnquiry);
      });
      matchedQuotes.forEach((q) => seenQuotationIds.add(q.id));

      // Match delivery challans
      const matchedChallans = deliveryChallans.filter((dc) => {
        const matchesJob = dc.jobId === job.id;
        const matchesJobQuote = job.quotationId && (dc.quotationId === job.quotationId || matchedQuotes.some((q) => q.id === dc.quotationId));
        return Boolean(matchesJob || matchesJobQuote);
      });
      matchedChallans.forEach((dc) => seenChallanIds.add(dc.id));

      // Match invoices
      const matchedInvoices = invoices.filter((inv) => {
        const matchesJob = inv.linkedJobId === job.id;
        const matchesQuote = matchedQuotes.some((q) => q.customerNumber === inv.customerNumber && inv.id === q.id);
        const matchesNo = inv.invoiceNo.includes(job.jobNumber);
        return Boolean(matchesJob || matchesQuote || matchesNo);
      });
      matchedInvoices.forEach((inv) => seenInvoiceIds.add(inv.id));

      groups.push({
        groupId: `JOB:${job.id}`,
        projectType: 'JOB',
        referenceId: job.jobNumber,
        title: job.problemReported || `${job.category} Job`,
        customer,
        customerName: customer?.name || jobEnquiry?.customerName || job.customerNumber,
        customerPhone: customer?.phone || jobEnquiry?.customerPhone,
        customerAddress: customer?.address || jobEnquiry?.customerAddress,
        job,
        enquiry: jobEnquiry,
        quotations: matchedQuotes,
        primaryQuotation: matchedQuotes[0],
        deliveryChallans: matchedChallans,
        primaryChallan: matchedChallans[0],
        invoices: matchedInvoices,
        primaryInvoice: matchedInvoices[0],
        createdAt: job.createdAt,
      });
    }

    // 2. Process Enquiries that have NOT been converted to jobs
    for (const enq of enquiries) {
      if (enq.convertedJobId && jobs.some((j) => j.id === enq.convertedJobId || j.jobNumber === enq.convertedJobId)) {
        continue; // already represented under that job
      }

      const customer = customers.find((c) => c.id === enq.customerId) || null;

      const matchedQuotes = quotations.filter((q) => q.enquiryId === enq.id || q.id === enq.quotationId);
      matchedQuotes.forEach((q) => seenQuotationIds.add(q.id));

      const matchedChallans = deliveryChallans.filter((dc) =>
        matchedQuotes.some((q) => q.id === dc.quotationId || q.quotationNo === dc.quotationId)
      );
      matchedChallans.forEach((dc) => seenChallanIds.add(dc.id));

      const matchedInvoices = invoices.filter((inv) =>
        matchedQuotes.some((q) => q.customerNumber === inv.customerNumber && inv.lineItems.some((li) => q.lineItems.some((qli) => qli.itemName === li.itemName)))
      );
      matchedInvoices.forEach((inv) => seenInvoiceIds.add(inv.id));

      groups.push({
        groupId: `ENQ:${enq.id}`,
        projectType: 'ENQUIRY',
        referenceId: enq.enquiryNumber,
        title: enq.description || `${enq.category} Enquiry`,
        customer,
        customerName: enq.customerName || customer?.name || 'Customer',
        customerPhone: enq.customerPhone || customer?.phone,
        customerAddress: enq.customerAddress || customer?.address,
        enquiry: enq,
        quotations: matchedQuotes,
        primaryQuotation: matchedQuotes[0],
        deliveryChallans: matchedChallans,
        primaryChallan: matchedChallans[0],
        invoices: matchedInvoices,
        primaryInvoice: matchedInvoices[0],
        createdAt: enq.createdAt,
      });
    }

    // 3. Any remaining Standalone Quotations not yet captured
    const remainingQuotes = quotations.filter((q) => !seenQuotationIds.has(q.id));
    for (const q of remainingQuotes) {
      const customer = customers.find((c) => c.id === q.customerNumber) || null;
      const matchedChallans = deliveryChallans.filter((dc) => dc.quotationId === q.id || dc.quotationId === q.quotationNo);
      matchedChallans.forEach((dc) => seenChallanIds.add(dc.id));
      const matchedInvoices = invoices.filter((inv) => inv.customerNumber === q.customerNumber && inv.grandTotal === q.grandTotal);
      matchedInvoices.forEach((inv) => seenInvoiceIds.add(inv.id));

      groups.push({
        groupId: `QUOT:${q.id}`,
        projectType: 'STANDALONE',
        referenceId: q.quotationNo,
        title: `Standalone Quotation (${q.lineItems[0]?.itemName || 'Equipment'})`,
        customer,
        customerName: customer?.name || q.customerNumber,
        customerPhone: customer?.phone,
        customerAddress: customer?.address,
        quotations: [q],
        primaryQuotation: q,
        deliveryChallans: matchedChallans,
        primaryChallan: matchedChallans[0],
        invoices: matchedInvoices,
        primaryInvoice: matchedInvoices[0],
        createdAt: q.date,
      });
    }

    // 4. Any remaining Standalone Invoices not yet captured
    const remainingInvoices = invoices.filter((inv) => !seenInvoiceIds.has(inv.id));
    for (const inv of remainingInvoices) {
      const customer = customers.find((c) => c.id === inv.customerNumber) || null;
      groups.push({
        groupId: `INV:${inv.id}`,
        projectType: 'STANDALONE',
        referenceId: inv.invoiceNo,
        title: `Direct Billing Invoice`,
        customer,
        customerName: customer?.name || inv.customerNumber,
        customerPhone: customer?.phone,
        customerAddress: customer?.address,
        quotations: [],
        deliveryChallans: [],
        invoices: [inv],
        primaryInvoice: inv,
        createdAt: inv.date,
      });
    }

    return groups;
  }, [jobs, enquiries, quotations, deliveryChallans, invoices, customers]);

  // Filtered Project Groups
  const filteredProjectGroups = useMemo(() => {
    return projectGroups.filter((g) => {
      const q = projectSearch.toLowerCase();
      const matchesSearch =
        !projectSearch.trim() ||
        g.referenceId.toLowerCase().includes(q) ||
        g.customerName.toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q) ||
        g.quotations.some((quot) => quot.quotationNo.toLowerCase().includes(q)) ||
        g.deliveryChallans.some((dc) => dc.challanNo.toLowerCase().includes(q)) ||
        g.invoices.some((inv) => inv.invoiceNo.toLowerCase().includes(q));

      let matchesFilter = true;
      if (projectFilter === 'WITH_QUOTATION') {
        matchesFilter = g.quotations.length > 0;
      } else if (projectFilter === 'WITH_CHALLAN') {
        matchesFilter = g.deliveryChallans.length > 0;
      } else if (projectFilter === 'WITH_INVOICE') {
        matchesFilter = g.invoices.length > 0;
      } else if (projectFilter === 'PENDING_PAYMENT') {
        matchesFilter = g.invoices.some((i) => i.balanceDue > 0);
      } else if (projectFilter === 'SETTLED') {
        matchesFilter = g.invoices.length > 0 && g.invoices.every((i) => i.balanceDue === 0);
      }

      return matchesSearch && matchesFilter;
    });
  }, [projectGroups, projectSearch, projectFilter]);

  // Filtered Flat Views (Secondary Views)
  const filteredQuotations = quotations.filter((q) => {
    const customer = customers.find((c) => c.id === q.customerNumber);
    const matchesSearch =
      q.quotationNo.toLowerCase().includes(quotationSearch.toLowerCase()) ||
      (customer && customer.name.toLowerCase().includes(quotationSearch.toLowerCase())) ||
      q.lineItems.some((item) => item.itemName.toLowerCase().includes(quotationSearch.toLowerCase()));

    const matchesStatus =
      quotationStatusFilter === 'ALL' || (q.status || 'DRAFT') === quotationStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredInvoices = invoices.filter((inv) => {
    const customer = customers.find((c) => c.id === inv.customerNumber);
    return (
      inv.invoiceNo.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      (customer && customer.name.toLowerCase().includes(invoiceSearch.toLowerCase()))
    );
  });

  const filteredChallans = deliveryChallans.filter((dc) => {
    const customer = customers.find((c) => c.id === dc.customerNumber);
    return (
      dc.challanNo.toLowerCase().includes(challanSearch.toLowerCase()) ||
      (customer && customer.name.toLowerCase().includes(challanSearch.toLowerCase())) ||
      dc.lineItems.some((li) => li.itemDescription.toLowerCase().includes(challanSearch.toLowerCase()))
    );
  });

  // Totals for top statistics
  const totalQuotationValue = quotations.reduce((sum, q) => sum + q.grandTotal, 0);
  const totalBalanceDue = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

  // Conversion Handlers (Phase 21: run on the server; one conversion at a time to avoid double clicks)
  const handleConvertQuoteToChallan = async (quot: Quotation, jobId?: string) => {
    if (converting) return;
    setConverting(true);
    try {
      const newDc = await convertQuotationToDeliveryChallan(quot.id, jobId);
      toast.success(
        `Delivery Challan ${newDc.challanNo} created from Quotation ${quot.quotationNo} (${newDc.lineItems.length} physical goods, labor charges excluded).`
      );
      setPreviewChallan(newDc);
      setIsChallanModalOpen(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConverting(false);
    }
  };

  const handleConvertQuoteToInvoice = async (quot: Quotation) => {
    if (converting) return;
    setConverting(true);
    try {
      const newInv = await convertQuotationToInvoice(quot.id);
      toast.success(`Tax Invoice ${newInv.invoiceNo} raised from Quotation ${quot.quotationNo}.`);
      setInvoiceMode('PREVIEW');
      setPreviewInvoice(newInv);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConverting(false);
    }
  };

  const handleConvertChallanToInvoice = async (dc: DeliveryChallan) => {
    if (converting) return;
    setConverting(true);
    try {
      const newInv = await convertDeliveryChallanToInvoice(dc.id);
      toast.success(`Tax Invoice ${newInv.invoiceNo} generated from Delivery Challan ${dc.challanNo}.`);
      setInvoiceMode('PREVIEW');
      setPreviewInvoice(newInv);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="orange" className="text-xs">
              <FolderGit2 className="w-3.5 h-3.5 text-orange-600 mr-1" />
              Project Commercial Chain
            </Badge>
            <span className="text-xs text-slate-500 font-medium">
              Quotations &bull; Delivery Challans &bull; Tax Invoices &bull; Lifecycle Grouping
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
            Quotations & Commercial Documents
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Track and manage full commercial chains grouped by project/job, edit estimates in-place with zero duplicates, and convert stages seamlessly.
          </p>
        </div>

        {/* Global Action Button */}
        {isManagement && (
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setQuotationToEdit(null);
              setBuilderCustomerId(undefined);
              setBuilderEnquiryId(undefined);
              setIsBuilderOpen(true);
            }}
            className="text-xs font-semibold shrink-0 shadow-2xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            + New Quotation (A-Series)
          </Button>
        )}
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Projects / Jobs</div>
              <div className="text-xl font-extrabold text-slate-900 font-mono">{projectGroups.length}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Quotations (A-Series)</div>
              <div className="text-xl font-extrabold text-slate-900 font-mono">{quotations.length}</div>
              <div className="text-[10px] text-slate-500 font-mono">{formatINR(totalQuotationValue)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Delivery Challans</div>
              <div className="text-xl font-extrabold text-slate-900 font-mono">{deliveryChallans.length}</div>
              <div className="text-[10px] text-slate-500">Material transfers</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Invoiced / Balance Due</div>
              <div className="text-xl font-extrabold text-slate-900 font-mono">{invoices.length} Invoices</div>
              <div className="text-[10px] font-mono">
                Due: <span className={totalBalanceDue > 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>{formatINR(totalBalanceDue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs (Default: Project-Grouped View) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('PROJECT_GROUPS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'PROJECT_GROUPS'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          <span>Grouped by Project / Job ({projectGroups.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('QUOTATIONS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'QUOTATIONS'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>All Quotations (A-Series) ({quotations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CHALLANS')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'CHALLANS'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>All Delivery Challans ({deliveryChallans.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('INVOICES')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'INVOICES'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <ReceiptText className="w-3.5 h-3.5" />
          <span>All Tax Invoices ({invoices.length})</span>
        </button>
      </div>

      {/* TAB 1: DEFAULT PROJECT-GROUPED VIEW (Part B Core) */}
      {activeTab === 'PROJECT_GROUPS' && (
        <div className="space-y-4">
          {/* Filters Strip */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                placeholder="Search by Job ID, Enquiry #, Customer, Quotation #, DC #, or Invoice #..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="pl-9 text-xs bg-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value as any)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="ALL">All Projects / Jobs ({projectGroups.length})</option>
                <option value="WITH_QUOTATION">With Quotations</option>
                <option value="WITH_CHALLAN">With Delivery Challans</option>
                <option value="WITH_INVOICE">With Tax Invoices</option>
                <option value="PENDING_PAYMENT">Payment Pending / Due</option>
                <option value="SETTLED">Fully Paid & Settled</option>
              </select>
            </div>
          </div>

          {/* Grouped Table */}
          <Card className="border-slate-200 bg-white shadow-2xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10 text-center"></th>
                      <th className="p-3 min-w-[200px]">Project / Job Ref</th>
                      <th className="p-3 min-w-[190px]">Customer / Client</th>
                      <th className="p-3 min-w-[170px]">1. Quotation</th>
                      <th className="p-3 min-w-[150px]">2. Delivery Challan</th>
                      <th className="p-3 min-w-[160px]">3. Tax Invoice</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProjectGroups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                          No projects or commercial records found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredProjectGroups.map((group) => {
                        const isExpanded = expandedGroups.has(group.groupId);
                        const quot = group.primaryQuotation;
                        const dc = group.primaryChallan;
                        const inv = group.primaryInvoice;

                        return (
                          <React.Fragment key={group.groupId}>
                            <tr
                              className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                isExpanded ? 'bg-orange-50/30' : ''
                              }`}
                              onClick={() => toggleGroupExpand(group.groupId)}
                            >
                              {/* Expand Toggle */}
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroupExpand(group.groupId);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                                  title={isExpanded ? 'Collapse chain' : 'Expand chain'}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-orange-600" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </button>
                              </td>

                              {/* Project Ref */}
                              <td className="p-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge
                                    variant={
                                      group.projectType === 'JOB'
                                        ? 'default'
                                        : group.projectType === 'ENQUIRY'
                                        ? 'orange'
                                        : 'secondary'
                                    }
                                    className="text-[9px] uppercase font-bold tracking-wider"
                                  >
                                    {group.projectType}
                                  </Badge>
                                  <span className="font-mono font-bold text-slate-900 text-xs">
                                    {group.referenceId}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate max-w-[220px] mt-0.5" title={group.title}>
                                  {group.title}
                                </div>
                              </td>

                              {/* Customer */}
                              <td className="p-3">
                                <div className="font-semibold text-slate-900">
                                  {group.customerName}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate max-w-[200px] flex items-center gap-1">
                                  {group.customerPhone && (
                                    <span className="font-mono text-[10px] text-slate-600">
                                      {group.customerPhone}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Stage 1: Quotation */}
                              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                {quot ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        onClick={() => setPreviewQuotation(quot)}
                                        className="font-mono font-bold text-orange-600 hover:underline cursor-pointer"
                                        title="Preview Quotation PDF"
                                      >
                                        {quot.quotationNo}
                                      </span>
                                      <Badge
                                        variant={
                                          quot.status === 'CONVERTED'
                                            ? 'success'
                                            : quot.status === 'SENT'
                                            ? 'default'
                                            : 'secondary'
                                        }
                                        className="text-[9px] px-1 py-0"
                                      >
                                        {quot.status || 'DRAFT'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px]">
                                      <span className="font-mono font-bold text-slate-800">
                                        {formatINR(quot.grandTotal)}
                                      </span>
                                      {isManagement && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setQuotationToEdit(quot);
                                            setBuilderCustomerId(quot.customerNumber);
                                            setBuilderEnquiryId(quot.enquiryId);
                                            setIsBuilderOpen(true);
                                          }}
                                          className="text-orange-600 hover:text-orange-800 hover:underline font-semibold text-[10px] flex items-center gap-0.5 cursor-pointer"
                                          title="Edit quotation line items in-place (no duplicate record)"
                                        >
                                          <Edit className="w-2.5 h-2.5" /> Edit
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 italic text-[11px]">None</span>
                                    {isManagement && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-1.5 text-[10px] text-orange-600 border-orange-200 hover:bg-orange-50 font-semibold cursor-pointer"
                                        onClick={() => {
                                          setQuotationToEdit(null);
                                          setBuilderCustomerId(group.customer?.id || (group.job ? group.job.customerNumber : undefined));
                                          setBuilderEnquiryId(group.enquiry?.id);
                                          setIsBuilderOpen(true);
                                        }}
                                      >
                                        <Plus className="w-3 h-3 mr-0.5" /> Quote
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Stage 2: Delivery Challan */}
                              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                {dc ? (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        onClick={() => {
                                          setPreviewChallan(dc);
                                          setChallanMode('PREVIEW');
                                          setIsChallanModalOpen(true);
                                        }}
                                        className="font-mono font-bold text-blue-600 hover:underline cursor-pointer"
                                        title="View Delivery Challan"
                                      >
                                        {dc.challanNo}
                                      </span>
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-700 bg-blue-50 border-blue-200">
                                        {dc.lineItems.length} Goods
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreviewChallan(dc);
                                          setChallanMode('PREVIEW');
                                          setIsChallanModalOpen(true);
                                        }}
                                        className="text-blue-600 hover:text-blue-800 hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                                        title="View Delivery Challan preview"
                                      >
                                        <Eye className="w-2.5 h-2.5" /> View
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreviewChallan(dc);
                                          setChallanMode('EDIT');
                                          setIsChallanModalOpen(true);
                                        }}
                                        className="text-blue-600 hover:text-blue-800 hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                                        title="Edit delivery challan in-place"
                                      >
                                        <Edit className="w-2.5 h-2.5" /> Edit
                                      </button>
                                    </div>
                                  </div>
                                ) : quot ? (
                                  <button
                                    type="button"
                                    onClick={() => handleConvertQuoteToChallan(quot, group.job?.id)}
                                    disabled={converting}
                                    className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Create Delivery Challan from Quotation items"
                                  >
                                    <Plus className="w-3 h-3" /> Create DC
                                  </button>
                                ) : (
                                  <span className="text-slate-300 font-mono">—</span>
                                )}
                              </td>

                              {/* Stage 3: Tax Invoice */}
                              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                {inv ? (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        onClick={() => {
                                          setPreviewInvoice(inv);
                                          setInvoiceMode('PREVIEW');
                                        }}
                                        className="font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                                        title="Preview Tax Invoice"
                                      >
                                        {inv.invoiceNo}
                                      </span>
                                      <Badge
                                        variant={inv.balanceDue === 0 ? 'success' : 'danger'}
                                        className="text-[9px] px-1 py-0"
                                      >
                                        {inv.balanceDue === 0 ? 'PAID' : 'DUE'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] font-mono">
                                      {inv.balanceDue > 0 ? (
                                        <span className="text-rose-600 font-semibold">
                                          Due: {formatINR(inv.balanceDue)}
                                        </span>
                                      ) : (
                                        <span className="text-emerald-700 font-medium">
                                          Settled ({formatINR(inv.grandTotal)})
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreviewInvoice(inv);
                                          setInvoiceMode('PREVIEW');
                                        }}
                                        className="text-emerald-700 hover:text-emerald-900 hover:underline font-semibold flex items-center gap-0.5 cursor-pointer font-sans"
                                        title="Preview Tax Invoice"
                                      >
                                        <Eye className="w-2.5 h-2.5" /> View
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreviewInvoice(inv);
                                          setInvoiceMode('EDIT');
                                        }}
                                        className="text-emerald-700 hover:text-emerald-900 hover:underline font-semibold flex items-center gap-0.5 cursor-pointer font-sans"
                                        title="Edit tax invoice in-place"
                                      >
                                        <Edit className="w-2.5 h-2.5" /> Edit
                                      </button>
                                    </div>
                                  </div>
                                ) : dc ? (
                                  <button
                                    type="button"
                                    onClick={() => handleConvertChallanToInvoice(dc)}
                                    disabled={converting}
                                    className="text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Convert Delivery Challan to Tax Invoice"
                                  >
                                    <ReceiptText className="w-3 h-3" /> Raise Inv
                                  </button>
                                ) : quot ? (
                                  <button
                                    type="button"
                                    onClick={() => handleConvertQuoteToInvoice(quot)}
                                    disabled={converting}
                                    className="text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Convert Quotation directly to Tax Invoice"
                                  >
                                    <ReceiptText className="w-3 h-3" /> Raise Inv
                                  </button>
                                ) : (
                                  <span className="text-slate-300 font-mono">—</span>
                                )}
                              </td>

                              {/* Row Action / View Chain */}
                              <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs text-slate-700 hover:text-orange-700 hover:bg-orange-50 border-slate-300 font-semibold cursor-pointer"
                                  onClick={() => toggleGroupExpand(group.groupId)}
                                >
                                  {isExpanded ? 'Hide Chain' : 'View Chain'}
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3 ml-1" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3 ml-1" />
                                  )}
                                </Button>
                              </td>
                            </tr>

                            {/* EXPANDABLE COMMERCIAL CHAIN DRAWER (Phase 15.6 Direct Actions) */}
                            {isExpanded && (
                              <tr className="bg-slate-50/70 border-b border-slate-200">
                                <td colSpan={7} className="p-4 sm:p-5">
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs shadow-2xs">
                                          ⛓
                                        </div>
                                        <div>
                                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm font-display uppercase tracking-wider flex items-center gap-2">
                                            <span>Commercial Document Chain</span>
                                            <span className="text-slate-300 font-normal">&bull;</span>
                                            <span className="text-orange-600 font-mono">{group.referenceId}</span>
                                            <span className="text-slate-500 font-normal font-sans text-xs">({group.customerName})</span>
                                          </h4>
                                          <p className="text-[11px] text-slate-500">
                                            Stage 1: Estimate &rarr; Stage 2: Goods Dispatch &rarr; Stage 3: Official Billing Invoice
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 flex-wrap">
                                        {quot && isManagement && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs text-orange-700 hover:bg-orange-50 border-orange-300 font-semibold cursor-pointer shadow-2xs"
                                            onClick={() => {
                                              setQuotationToEdit(quot);
                                              setBuilderCustomerId(quot.customerNumber);
                                              setBuilderEnquiryId(quot.enquiryId);
                                              setIsBuilderOpen(true);
                                            }}
                                          >
                                            <Edit className="w-3 h-3 mr-1" /> Edit Quotation In-Place
                                          </Button>
                                        )}
                                        {dc && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs text-blue-700 hover:bg-blue-50 border-blue-300 font-semibold cursor-pointer shadow-2xs"
                                            onClick={() => {
                                              setPreviewChallan(dc);
                                              setChallanMode('EDIT');
                                              setIsChallanModalOpen(true);
                                            }}
                                          >
                                            <Edit className="w-3 h-3 mr-1" /> Edit DC In-Place
                                          </Button>
                                        )}
                                        {inv && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs text-emerald-700 hover:bg-emerald-50 border-emerald-300 font-semibold cursor-pointer shadow-2xs"
                                            onClick={() => {
                                              setPreviewInvoice(inv);
                                              setInvoiceMode('EDIT');
                                            }}
                                          >
                                            <Edit className="w-3 h-3 mr-1" /> Edit Invoice In-Place
                                          </Button>
                                        )}
                                      </div>
                                    </div>

                                    {/* 3-Stage Lifecycle Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                      {/* STAGE 1: QUOTATION */}
                                      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between h-full min-h-[200px]">
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                              <FileSpreadsheet className="w-4 h-4 text-orange-600" />
                                              Stage 1: Quotation
                                            </span>
                                            {quot ? (
                                              <Badge
                                                variant={
                                                  quot.status === 'CONVERTED'
                                                    ? 'success'
                                                    : quot.status === 'SENT'
                                                    ? 'default'
                                                    : 'secondary'
                                                }
                                                className="text-[9px]"
                                              >
                                                {quot.status || 'DRAFT'}
                                              </Badge>
                                            ) : (
                                              <Badge variant="secondary" className="text-[9px]">NOT ISSUED</Badge>
                                            )}
                                          </div>

                                          {quot ? (
                                            <div>
                                              <div className="font-mono font-bold text-orange-600 text-sm">
                                                {quot.quotationNo}
                                              </div>
                                              <div className="text-[11px] text-slate-500 font-mono">
                                                Date: {formatDate(quot.date)} &bull; {quot.lineItems.length} item(s)
                                              </div>
                                              <div className="text-xs font-bold text-slate-900 font-mono mt-1">
                                                Grand Total: {formatINR(quot.grandTotal)}
                                              </div>
                                              {isManagement && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setQuotationToEdit(quot);
                                                    setBuilderCustomerId(quot.customerNumber);
                                                    setBuilderEnquiryId(quot.enquiryId);
                                                    setIsBuilderOpen(true);
                                                  }}
                                                  className="text-[10px] text-orange-600 hover:text-orange-800 hover:underline font-semibold flex items-center gap-1 cursor-pointer mt-1"
                                                  title="Edit quotation in-place"
                                                >
                                                  <Edit className="w-2.5 h-2.5" /> Edit Quotation In-Place
                                                </button>
                                              )}
                                              <div className="text-[10px] text-slate-500 mt-1 truncate">
                                                Scope: {quot.lineItems.map((i) => i.itemName).join(', ')}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="p-3 bg-slate-50 rounded-lg text-slate-500 italic text-[11px] text-center">
                                              No quotation generated for this project yet.
                                            </div>
                                          )}
                                        </div>

                                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                                          {quot ? (
                                            <>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs flex-1 cursor-pointer"
                                                onClick={() => setPreviewQuotation(quot)}
                                              >
                                                <Eye className="w-3 h-3 mr-1" /> Preview PDF
                                              </Button>
                                              {isManagement && (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 text-xs flex-1 text-orange-700 border-orange-200 hover:bg-orange-50 cursor-pointer"
                                                  onClick={() => {
                                                    setQuotationToEdit(quot);
                                                    setBuilderCustomerId(quot.customerNumber);
                                                    setBuilderEnquiryId(quot.enquiryId);
                                                    setIsBuilderOpen(true);
                                                  }}
                                                >
                                                  <Edit className="w-3 h-3 mr-1" /> Edit
                                                </Button>
                                              )}
                                              {!dc && (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="primary"
                                                  className="h-7 text-xs flex-1 bg-orange-600 hover:bg-orange-700 text-white cursor-pointer shadow-2xs whitespace-nowrap"
                                                  onClick={() => handleConvertQuoteToChallan(quot, group.job?.id)}
                                                  disabled={converting}
                                                >
                                                  <Truck className="w-3 h-3 mr-1" /> &rarr; Challan
                                                </Button>
                                              )}
                                            </>
                                          ) : (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="primary"
                                              className="h-7 text-xs w-full bg-orange-600 hover:bg-orange-700 text-white cursor-pointer shadow-2xs"
                                              onClick={() => {
                                                setQuotationToEdit(null);
                                                setBuilderCustomerId(group.customer?.id || (group.job ? group.job.customerNumber : undefined));
                                                setBuilderEnquiryId(group.enquiry?.id);
                                                setIsBuilderOpen(true);
                                              }}
                                            >
                                              <Plus className="w-3 h-3 mr-1" /> Create Quotation
                                            </Button>
                                          )}
                                        </div>
                                      </div>

                                      {/* STAGE 2: DELIVERY CHALLAN */}
                                      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between h-full min-h-[200px]">
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                              <Truck className="w-4 h-4 text-blue-600" />
                                              Stage 2: Delivery Challan
                                            </span>
                                            {dc ? (
                                              <Badge variant="outline" className="text-[9px] text-blue-700 bg-blue-50 border-blue-200">
                                                Dispatched
                                              </Badge>
                                            ) : (
                                              <Badge variant="secondary" className="text-[9px]">NOT ISSUED</Badge>
                                            )}
                                          </div>

                                          {dc ? (
                                            <div>
                                              <div className="font-mono font-bold text-blue-600 text-sm">
                                                {dc.challanNo}
                                              </div>
                                              <div className="text-[11px] text-slate-500 font-mono">
                                                Date: {formatDate(dc.date)} &bull; {dc.lineItems.length} goods item(s)
                                              </div>
                                              <div className="text-[11px] text-slate-600 mt-1">
                                                Transit: <strong className="text-slate-800">{dc.transportedBy || 'Field Transit'}</strong>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPreviewChallan(dc);
                                                  setChallanMode('EDIT');
                                                  setIsChallanModalOpen(true);
                                                }}
                                                className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-semibold flex items-center gap-1 cursor-pointer mt-1"
                                                title="Edit delivery challan items and quantities"
                                              >
                                                <Edit className="w-2.5 h-2.5" /> Edit DC In-Place
                                              </button>
                                              <div className="text-[10px] text-slate-500 mt-1 truncate">
                                                Cargo: {dc.lineItems.map((li) => `${li.itemDescription} (${li.qty})`).join(', ')}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="p-3 bg-slate-50 rounded-lg text-slate-500 italic text-[11px] text-center">
                                              No delivery challan issued for this project yet.
                                            </div>
                                          )}
                                        </div>

                                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                                          {dc ? (
                                            <>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs flex-1 cursor-pointer"
                                                onClick={() => {
                                                  setPreviewChallan(dc);
                                                  setChallanMode('PREVIEW');
                                                  setIsChallanModalOpen(true);
                                                }}
                                              >
                                                <Eye className="w-3 h-3 mr-1" /> View DC
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs flex-1 text-blue-700 border-blue-200 hover:bg-blue-50 cursor-pointer"
                                                onClick={() => {
                                                  setPreviewChallan(dc);
                                                  setChallanMode('EDIT');
                                                  setIsChallanModalOpen(true);
                                                }}
                                              >
                                                <Edit className="w-3 h-3 mr-1" /> Edit DC
                                              </Button>
                                              {!inv && (
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="primary"
                                                  className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs whitespace-nowrap"
                                                  onClick={() => handleConvertChallanToInvoice(dc)}
                                                  disabled={converting}
                                                >
                                                  <ReceiptText className="w-3 h-3 mr-1" /> &rarr; Invoice
                                                </Button>
                                              )}
                                            </>
                                          ) : (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              className="h-7 text-xs w-full text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer"
                                              disabled={converting}
                                              onClick={() => {
                                                if (quot) {
                                                  handleConvertQuoteToChallan(quot, group.job?.id);
                                                } else {
                                                  setPreviewChallan(null);
                                                  setChallanMode('CREATE');
                                                  setChallanJobId(group.job?.id);
                                                  setChallanQuoteId(undefined);
                                                  setChallanCustomerId(group.customer?.id || (group.job ? group.job.customerNumber : undefined));
                                                  setIsChallanModalOpen(true);
                                                }
                                              }}
                                            >
                                              <Plus className="w-3 h-3 mr-1" /> + Create Challan
                                            </Button>
                                          )}
                                        </div>
                                      </div>

                                      {/* STAGE 3: TAX INVOICE */}
                                      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between h-full min-h-[200px]">
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                              <ReceiptText className="w-4 h-4 text-emerald-600" />
                                              Stage 3: Tax Invoice
                                            </span>
                                            {inv ? (
                                              <Badge
                                                variant={inv.balanceDue === 0 ? 'success' : 'danger'}
                                                className="text-[9px]"
                                              >
                                                {inv.balanceDue === 0 ? 'SETTLED' : 'PAYMENT DUE'}
                                              </Badge>
                                            ) : (
                                              <Badge variant="secondary" className="text-[9px]">NOT INVOICED</Badge>
                                            )}
                                          </div>

                                          {inv ? (
                                            <div>
                                              <div className="font-mono font-bold text-emerald-700 text-sm">
                                                {inv.invoiceNo}
                                              </div>
                                              <div className="text-[11px] text-slate-500 font-mono">
                                                Date: {formatDate(inv.date)} &bull; Mode: {inv.paymentMode}
                                              </div>
                                              <div className="text-xs font-bold text-slate-900 font-mono mt-1">
                                                Grand Total: {formatINR(inv.grandTotal)}
                                              </div>
                                              <div className="text-[11px] font-mono mt-0.5">
                                                {inv.balanceDue > 0 ? (
                                                  <span className="text-rose-600 font-bold">
                                                    Balance Due: {formatINR(inv.balanceDue)}
                                                  </span>
                                                ) : (
                                                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Fully Paid
                                                  </span>
                                                )}
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPreviewInvoice(inv);
                                                  setInvoiceMode('EDIT');
                                                }}
                                                className="text-[10px] text-emerald-700 hover:text-emerald-900 hover:underline font-semibold flex items-center gap-1 cursor-pointer mt-1"
                                                title="Edit tax invoice in-place"
                                              >
                                                <Edit className="w-2.5 h-2.5" /> Edit Invoice In-Place
                                              </button>
                                              <div className="text-[10px] text-slate-500 mt-1 truncate">
                                                Scope: {inv.lineItems.map((li) => li.itemName).join(', ')}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="p-3 bg-slate-50 rounded-lg text-slate-500 italic text-[11px] text-center">
                                              No tax invoice billed for this project yet.
                                            </div>
                                          )}
                                        </div>

                                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                                          {inv ? (
                                            <>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs flex-1 cursor-pointer text-slate-800"
                                                onClick={() => {
                                                  setPreviewInvoice(inv);
                                                  setInvoiceMode('PREVIEW');
                                                }}
                                              >
                                                <Eye className="w-3 h-3 mr-1" /> Preview PDF
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs flex-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 cursor-pointer"
                                                onClick={() => {
                                                  setPreviewInvoice(inv);
                                                  setInvoiceMode('EDIT');
                                                }}
                                              >
                                                <Edit className="w-3 h-3 mr-1" /> Edit Invoice
                                              </Button>
                                            </>
                                          ) : (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="primary"
                                              className="h-7 text-xs w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
                                              disabled={converting}
                                              onClick={() => {
                                                if (dc) {
                                                  handleConvertChallanToInvoice(dc);
                                                } else if (quot) {
                                                  handleConvertQuoteToInvoice(quot);
                                                } else {
                                                  toast.info('Please create a Quotation or Delivery Challan first to raise an invoice.');
                                                }
                                              }}
                                            >
                                              <ReceiptText className="w-3 h-3 mr-1" /> Raise Tax Invoice
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
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

      {/* TAB 2: ALL QUOTATIONS (SECONDARY VIEW) */}
      {activeTab === 'QUOTATIONS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                placeholder="Search quotation no, customer, or equipment..."
                value={quotationSearch}
                onChange={(e) => setQuotationSearch(e.target.value)}
                className="pl-9 text-xs bg-white"
              />
            </div>
            <select
              value={quotationStatusFilter}
              onChange={(e) => setQuotationStatusFilter(e.target.value as any)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer w-full sm:w-auto"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="CONVERTED">Converted</option>
            </select>
          </div>

          <Card className="border-slate-200 bg-white shadow-2xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Quotation No</th>
                      <th className="p-3">Customer / Organization</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Items & Scope</th>
                      <th className="p-3 text-right">Taxable</th>
                      <th className="p-3 text-right">Grand Total</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredQuotations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                          No quotations found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredQuotations.map((q) => {
                        const customer = customers.find((c) => c.id === q.customerNumber);
                        const status = q.status || 'DRAFT';
                        const statusVariant =
                          status === 'CONVERTED'
                            ? 'success'
                            : status === 'SENT'
                            ? 'default'
                            : 'secondary';

                        return (
                          <tr
                            key={q.id}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setPreviewQuotation(q)}
                          >
                            <td className="p-3 font-mono font-bold text-orange-600">
                              {q.quotationNo}
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-900">
                                {customer?.name || q.customerNumber}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">
                                {customer?.address}
                              </div>
                            </td>
                            <td className="p-3 text-slate-500 font-mono text-[11px]">
                              {formatDate(q.date)}
                            </td>
                            <td className="p-3 text-slate-700">
                              <div className="font-medium">{q.lineItems.length} items</div>
                              <div className="text-[10px] text-slate-500 truncate max-w-xs">
                                {q.lineItems.map((i) => i.itemName).join(', ')}
                              </div>
                            </td>
                            <td className="p-3 text-right text-slate-700 font-mono">
                              {formatINR(q.totalAmount)}
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900 font-mono">
                              {formatINR(q.grandTotal)}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Badge variant={statusVariant} className="text-[10px]">
                                  {status}
                                </Badge>
                                {q.whatsappSharedAt && (
                                  <Badge variant="success" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                    WhatsApp Sent
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                              {isManagement && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] px-2 text-orange-700 border-orange-300 hover:bg-orange-50 font-semibold"
                                  onClick={() => {
                                    setQuotationToEdit(q);
                                    setBuilderCustomerId(q.customerNumber);
                                    setBuilderEnquiryId(q.enquiryId);
                                    setIsBuilderOpen(true);
                                  }}
                                  title="Edit quotation in-place"
                                >
                                  <Edit className="w-3 h-3 mr-1" /> Edit
                                </Button>
                              )}
                              {isManagement && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] px-2"
                                  onClick={() => setAdvanceQuotation(q)}
                                  title="Record an advance received against this quotation"
                                >
                                  <Wallet className="w-3 h-3 mr-1" /> Advance
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2"
                                onClick={() => setPreviewQuotation(q)}
                              >
                                Preview PDF
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

      {/* TAB 3: ALL DELIVERY CHALLANS (SECONDARY VIEW) */}
      {activeTab === 'CHALLANS' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              placeholder="Search challan no, customer, or items..."
              value={challanSearch}
              onChange={(e) => setChallanSearch(e.target.value)}
              className="pl-9 text-xs bg-white"
            />
          </div>

          <Card className="border-slate-200 bg-white shadow-2xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Challan No</th>
                      <th className="p-3">Customer / Organization</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Transported By</th>
                      <th className="p-3">Goods / Line Items</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredChallans.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                          No delivery challans found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredChallans.map((dc) => {
                        const customer = customers.find((c) => c.id === dc.customerNumber);
                        return (
                          <tr
                            key={dc.id}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => {
                              setPreviewChallan(dc);
                              setIsChallanModalOpen(true);
                            }}
                          >
                            <td className="p-3 font-mono font-bold text-blue-600">
                              {dc.challanNo}
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-900">
                                {customer?.name || dc.customerNumber}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">
                                {customer?.address}
                              </div>
                            </td>
                            <td className="p-3 text-slate-500 font-mono text-[11px]">
                              {formatDate(dc.date)}
                            </td>
                            <td className="p-3 text-slate-700">
                              {dc.transportedBy || 'Field Transit'}
                            </td>
                            <td className="p-3 text-slate-600">
                              <div className="font-medium text-slate-900">
                                {dc.lineItems.length} Item(s)
                              </div>
                              <div className="text-[10px] text-slate-500 truncate max-w-xs">
                                {dc.lineItems.map((li) => `${li.itemDescription} (${li.qty})`).join(', ')}
                              </div>
                            </td>
                            <td className="p-3 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                                onClick={() => {
                                  setPreviewChallan(dc);
                                  setChallanMode('PREVIEW');
                                  setIsChallanModalOpen(true);
                                }}
                              >
                                View Challan
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                                onClick={() => {
                                  setPreviewChallan(dc);
                                  setChallanMode('EDIT');
                                  setIsChallanModalOpen(true);
                                }}
                              >
                                <Edit className="w-3 h-3 mr-1" /> Edit DC
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                className="h-7 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => handleConvertChallanToInvoice(dc)}
                                disabled={converting}
                              >
                                &rarr; Raise Invoice
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

      {/* TAB 4: ALL TAX INVOICES (SECONDARY VIEW) */}
      {activeTab === 'INVOICES' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input
              placeholder="Search invoice no or customer..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="pl-9 text-xs bg-white"
            />
          </div>

          <Card className="border-slate-200 bg-white shadow-2xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Invoice No</th>
                      <th className="p-3">Customer / Organization</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Grand Total</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Balance Due</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                          No tax invoices found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map((inv) => {
                        const customer = customers.find((c) => c.id === inv.customerNumber);
                        const isSettled = inv.balanceDue === 0;

                        return (
                          <tr
                            key={inv.id}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => {
                              setPreviewInvoice(inv);
                              setInvoiceMode('PREVIEW');
                            }}
                          >
                            <td className="p-3 font-mono font-bold text-emerald-700">
                              {inv.invoiceNo}
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-900">
                                {customer?.name || inv.customerNumber}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">
                                {customer?.address}
                              </div>
                            </td>
                            <td className="p-3 text-slate-500 font-mono text-[11px]">
                              {formatDate(inv.date)}
                            </td>
                            <td className="p-3 text-right font-mono font-semibold text-slate-900">
                              {formatINR(inv.grandTotal)}
                            </td>
                            <td className="p-3 text-right font-mono text-emerald-700 font-medium">
                              {formatINR(inv.amountPaid)}
                            </td>
                            <td className="p-3 text-right font-mono font-bold">
                              <span className={inv.balanceDue > 0 ? 'text-rose-600' : 'text-slate-400'}>
                                {formatINR(inv.balanceDue)}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant={isSettled ? 'success' : 'danger'} className="text-[10px]">
                                {isSettled ? 'PAID' : 'DUE'}
                              </Badge>
                            </td>
                            <td className="p-3 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-slate-700"
                                onClick={() => {
                                  setPreviewInvoice(inv);
                                  setInvoiceMode('PREVIEW');
                                }}
                              >
                                Preview PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                onClick={() => {
                                  setPreviewInvoice(inv);
                                  setInvoiceMode('EDIT');
                                }}
                              >
                                <Edit className="w-3 h-3 mr-1" /> Edit
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

      {/* Quotation Builder Modal (Creates or Edits in-place with zero duplicates) */}
      <QuotationBuilderModal
        isOpen={isBuilderOpen}
        initialCustomerId={builderCustomerId}
        initialEnquiryId={builderEnquiryId}
        quotationToEdit={quotationToEdit}
        onClose={() => {
          setIsBuilderOpen(false);
          setQuotationToEdit(null);
        }}
        onQuotationSaved={(q) => {
          setIsBuilderOpen(false);
          setQuotationToEdit(null);
          setPreviewQuotation(q);
        }}
      />

      {/* Quotation Preview Modal (with in-place Edit button) */}
      <QuotationPreviewModal
        isOpen={Boolean(previewQuotation)}
        quotation={previewQuotation}
        onClose={() => setPreviewQuotation(null)}
        onEdit={(q) => {
          setQuotationToEdit(q);
          setBuilderCustomerId(q.customerNumber);
          setBuilderEnquiryId(q.enquiryId);
          setIsBuilderOpen(true);
        }}
      />

      {/* Delivery Challan Modal */}
      <DeliveryChallanModal
        isOpen={isChallanModalOpen}
        initialMode={challanMode}
        onClose={() => {
          setIsChallanModalOpen(false);
          setPreviewChallan(null);
          setChallanMode('PREVIEW');
        }}
        initialChallan={previewChallan}
        jobId={challanJobId}
        quotationId={challanQuoteId}
        defaultCustomerId={challanCustomerId}
        onChallanSaved={(c) => {
          setPreviewChallan(c);
        }}
        onConvertedToInvoice={(newInv) => {
          setInvoiceMode('PREVIEW');
          setPreviewInvoice(newInv);
          setInvoiceMode('PREVIEW');
        }}
      />

      {/* Invoice Preview Modal */}
      <InvoicePreviewModal
        isOpen={Boolean(previewInvoice)}
        initialMode={invoiceMode}
        invoice={previewInvoice}
        onClose={() => {
          setPreviewInvoice(null);
          setInvoiceMode('PREVIEW');
        }}
        onInvoiceSaved={(inv) => {
          setPreviewInvoice(inv);
        }}
      />
      <RecordAdvanceModal
        isOpen={Boolean(advanceQuotation)}
        quotation={advanceQuotation}
        onClose={() => setAdvanceQuotation(null)}
      />
    </div>
  );
};
