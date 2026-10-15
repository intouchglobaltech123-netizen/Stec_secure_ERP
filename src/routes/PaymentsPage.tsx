import React, { useState } from 'react';
import { localDateISO } from '@/lib/numbering';
import { invoiceNetTotal } from '@/lib/invoice-status';
import { useStecSecure } from '@/lib/stecsecure-context';
import {
  Payment,
  PaymentMode,
  PaymentType,
  Invoice,
  Customer,
  Quotation,
  Job,
} from '@/lib/stecsecure-types';
import {
  CreditCard,
  ArrowDownLeft,
  CheckCircle2,
  ShieldCheck,
  Search,
  Filter,
  Plus,
  Calendar,
  Building2,
  Phone,
  AlertTriangle,
  Clock,
  ExternalLink,
  X,
  FileSpreadsheet,
  Receipt,
  Users,
  ChevronRight,
  ArrowUpRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { formatINR, formatDate, formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';

// Phase 22: an advance not yet on an invoice shows what it was taken against
const AdvanceLabel: React.FC<{ payment: Payment; quotations: Quotation[]; jobs: Job[] }> = ({
  payment,
  quotations,
  jobs,
}) => {
  const quote = quotations.find((q) => q.id === payment.quotationId);
  const job = jobs.find((j) => j.id === payment.jobId);
  return (
    <span className="text-amber-700">
      Advance · {quote ? `Quote ${quote.quotationNo}` : job ? job.jobNumber : 'not yet invoiced'}
    </span>
  );
};

export const PaymentsPage: React.FC = () => {
  const {
    payments,
    customers,
    invoices,
    jobs,
    quotations,
    currentUser,
    isManagement,
    recordManualPayment,
  } = useStecSecure();

  // Active Desk View Tab: "OUTSTANDING_AR" vs "LEDGER"
  const [activeTab, setActiveTab] = useState<'OUTSTANDING_AR' | 'LEDGER'>('OUTSTANDING_AR');

  // Cockpit sorting & search state
  const [cockpitSearch, setCockpitSearch] = useState('');
  const [cockpitSortField, setCockpitSortField] = useState<'balance' | 'invoiced' | 'collected' | 'name'>('balance');
  const [cockpitSortOrder, setCockpitSortOrder] = useState<'asc' | 'desc'>('desc');
  const [cockpitStatusFilter, setCockpitStatusFilter] = useState<'ALL' | 'DUE' | 'SETTLED'>('ALL');

  // Filters for Ledger tab
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Customer Drill-down Modal
  const [drilldownCustomer, setDrilldownCustomer] = useState<Customer | null>(null);

  // Manual Payment Recording Modal
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [manualCustomerId, setManualCustomerId] = useState<string>('');
  const [manualInvoiceId, setManualInvoiceId] = useState<string>('');
  const [manualAmount, setManualAmount] = useState<number | ''>('');
  const [manualMode, setManualMode] = useState<PaymentMode>('NEFT');
  const [manualReference, setManualReference] = useState('');
  const [manualDate, setManualDate] = useState<string>(localDateISO());
  const [savingPayment, setSavingPayment] = useState(false);

  // TASK 1: Overview KPIs
  // Step 3: billed = invoices net of credit notes; cancelled invoices bill nothing. Refunds are
  // negative payments, so collections are net of them.
  const totalInvoiced = invoices.reduce((sum, inv) => sum + invoiceNetTotal(inv), 0);
  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

  // Overdue calculation (pending beyond 15 days threshold)
  const nowMs = new Date().getTime();
  const overdueInvoices = invoices.filter((inv) => {
    if (inv.balanceDue <= 0) return false;
    const invDateMs = new Date(inv.date).getTime();
    const diffDays = (nowMs - invDateMs) / (1000 * 60 * 60 * 24);
    return diffDays > 15;
  });
  const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

  // Distinct customers with outstanding balance
  const customersWithBalanceMap = new Map<string, { totalDue: number; invoicesCount: number }>();
  invoices.forEach((inv) => {
    if (inv.balanceDue > 0) {
      const existing = customersWithBalanceMap.get(inv.customerNumber) || {
        totalDue: 0,
        invoicesCount: 0,
      };
      customersWithBalanceMap.set(inv.customerNumber, {
        totalDue: existing.totalDue + inv.balanceDue,
        invoicesCount: existing.invoicesCount + 1,
      });
    }
  });
  const customersWithOutstandingCount = customersWithBalanceMap.size;

  // Filtered Payments Ledger
  const filteredPayments = payments.filter((p) => {
    const cust = customers.find((c) => c.id === p.customerNumber);
    const matchesSearch =
      !searchQuery.trim() ||
      p.referenceNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.receiptNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cust?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.invoiceId?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMode = modeFilter === 'ALL' || p.mode === modeFilter;
    const matchesType = typeFilter === 'ALL' || p.type === typeFilter;

    return matchesSearch && matchesMode && matchesType;
  });

  // Grouped by Customer for Outstanding View
  const customerOutstandingList = customers
    .map((cust) => {
      const custInvoices = invoices.filter((i) => i.customerNumber === cust.id);
      const custPayments = payments.filter((p) => p.customerNumber === cust.id);
      const custInvoiced = custInvoices.reduce((sum, i) => sum + invoiceNetTotal(i), 0);
      const custCollected = custPayments.reduce((sum, p) => sum + p.amount, 0);
      const custBalance = custInvoices.reduce((sum, i) => sum + i.balanceDue, 0);

      const hasOverdue = custInvoices.some((inv) => {
        if (inv.balanceDue <= 0) return false;
        const diffDays = (nowMs - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24);
        return diffDays > 15;
      });

      return {
        customer: cust,
        invoices: custInvoices,
        payments: custPayments,
        totalInvoiced: custInvoiced,
        totalCollected: custCollected,
        totalBalance: custBalance,
        hasOverdue,
      };
    })
    .filter((entry) => entry.totalInvoiced > 0 || entry.totalBalance > 0);

  // Sorting and filtering the Cockpit Data Table
  const handleSortCockpit = (field: 'balance' | 'invoiced' | 'collected' | 'name') => {
    if (cockpitSortField === field) {
      setCockpitSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCockpitSortField(field);
      setCockpitSortOrder('desc');
    }
  };

  const sortedAndFilteredOutstanding = customerOutstandingList
    .filter((entry) => {
      const cust = entry.customer;
      const matchesSearch =
        !cockpitSearch.trim() ||
        cust.name.toLowerCase().includes(cockpitSearch.toLowerCase()) ||
        cust.id.toLowerCase().includes(cockpitSearch.toLowerCase()) ||
        cust.phone.includes(cockpitSearch);

      const matchesStatus =
        cockpitStatusFilter === 'ALL'
          ? true
          : cockpitStatusFilter === 'DUE'
          ? entry.totalBalance > 0
          : entry.totalBalance === 0;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (cockpitSortField === 'balance') {
        comparison = a.totalBalance - b.totalBalance;
      } else if (cockpitSortField === 'invoiced') {
        comparison = a.totalInvoiced - b.totalInvoiced;
      } else if (cockpitSortField === 'collected') {
        comparison = a.totalCollected - b.totalCollected;
      } else if (cockpitSortField === 'name') {
        comparison = a.customer.name.localeCompare(b.customer.name);
      }
      return cockpitSortOrder === 'desc' ? -comparison : comparison;
    });

  // Open Manual Payment Modal helper
  const handleOpenRecordPayment = (prefillCustId?: string, prefillInvId?: string) => {
    const targetCustId = prefillCustId || customers[0]?.id || '';
    setManualCustomerId(targetCustId);

    const pendingInvs = invoices.filter(
      (i) => (targetCustId ? i.customerNumber === targetCustId : true) && i.balanceDue > 0
    );

    const targetInv = prefillInvId
      ? invoices.find((i) => i.id === prefillInvId)
      : pendingInvs[0] || null;

    setManualInvoiceId(targetInv?.id || '');
    setManualAmount(targetInv ? targetInv.balanceDue : '');
    setManualMode('NEFT');
    setManualReference('');
    setManualDate(localDateISO());
    setIsRecordModalOpen(true);
  };

  const handleCustomerSelectChange = (custId: string) => {
    setManualCustomerId(custId);
    const pendingInvs = invoices.filter(
      (i) => i.customerNumber === custId && i.balanceDue > 0
    );
    const firstInv = pendingInvs[0];
    setManualInvoiceId(firstInv?.id || '');
    setManualAmount(firstInv ? firstInv.balanceDue : '');
  };

  const handleInvoiceSelectChange = (invId: string) => {
    setManualInvoiceId(invId);
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      setManualAmount(inv.balanceDue);
    }
  };

  const handleSubmitManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPayment) return;

    const selectedInv = invoices.find((i) => i.id === manualInvoiceId);
    if (!selectedInv) {
      toast.error('Please select an invoice with pending balance');
      return;
    }

    const numAmount = Number(manualAmount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter a valid payment amount greater than zero');
      return;
    }

    if (numAmount > selectedInv.balanceDue) {
      toast.error(
        `Amount cannot exceed remaining balance of ${formatINR(selectedInv.balanceDue)}`
      );
      return;
    }

    setSavingPayment(true);
    try {
      const created = await recordManualPayment({
        invoiceId: selectedInv.id,
        amount: numAmount,
        paymentMode: manualMode,
        referenceNo: manualReference.trim() || undefined,
        date: manualDate,
      });

      if (created) {
        const remaining = selectedInv.balanceDue - numAmount;
        toast.success(
          `Payment of ${formatINR(numAmount)} recorded for ${selectedInv.invoiceNo}. Remaining: ${formatINR(remaining)}.`
        );
        setIsRecordModalOpen(false);
      } else {
        toast.error('Failed to record payment');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="orange" className="text-xs">
              <CreditCard className="w-3.5 h-3.5 text-orange-600" />
              Accounts Receivable & Credit Desk
            </Badge>
            <span className="text-xs text-slate-500 font-medium">
              Payment Ledgers & Settle Operations
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
            Payments & Collections Desk
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Real-time accounts receivable cockpit, outstanding customer balances, and payment receipt logs
          </p>
        </div>

        {isManagement && (
          <Button
            variant="primary"
            size="md"
            onClick={() => handleOpenRecordPayment()}
            className="text-xs font-semibold shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Record Payment Receipt
          </Button>
        )}
      </div>

      {/* TASK 1: Overview Dashboard KPI Tiles */}
      <div className="w-full grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] uppercase font-bold text-slate-500 flex justify-between items-center">
              <span>Total Invoiced</span>
              <Receipt className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {formatINR(totalInvoiced)}
            </div>
            <p className="text-[10px] text-slate-500">{invoices.length} total tax invoices</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/60 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] uppercase font-bold text-orange-900 flex justify-between items-center">
              <span>Total Collected</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-orange-900 font-mono">
              {formatINR(totalCollected)}
            </div>
            <p className="text-[10px] text-orange-700">{payments.length} verified receipts</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] uppercase font-bold text-amber-900 flex justify-between items-center">
              <span>Total Outstanding</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-900 font-mono">
              {formatINR(totalOutstanding)}
            </div>
            <p className="text-[10px] text-amber-700">Pending customer clearance</p>
          </CardContent>
        </Card>

        <Card className="border-rose-200 bg-rose-50/60 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] uppercase font-bold text-rose-800 flex justify-between items-center">
              <span>Overdue (&gt;15 Days)</span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            </div>
            <div className="text-2xl font-bold text-rose-800 font-mono">
              {formatINR(overdueAmount)}
            </div>
            <p className="text-[10px] text-rose-700">{overdueInvoices.length} past grace period</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm col-span-2 lg:col-span-1">
          <CardContent className="p-4 space-y-1">
            <div className="text-[10px] uppercase font-bold text-slate-500 flex justify-between items-center">
              <span>Debtor Accounts</span>
              <Users className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">
              {customersWithOutstandingCount}
            </div>
            <p className="text-[10px] text-slate-500">Clients with balance due</p>
          </CardContent>
        </Card>
      </div>

      {/* Desk View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('OUTSTANDING_AR')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'OUTSTANDING_AR'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Customer Outstanding Cockpit</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
              activeTab === 'OUTSTANDING_AR' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {customersWithOutstandingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('LEDGER')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'LEDGER'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Payment Transactions Ledger</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
              activeTab === 'LEDGER' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {payments.length}
          </span>
        </button>
      </div>

      {/* VIEW 1: CUSTOMER OUTSTANDING COCKPIT (TASK 3 — DATA TABLE LAYOUT) */}
      {activeTab === 'OUTSTANDING_AR' && (
        <Card className="w-full border-slate-200 bg-white shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base text-slate-900 font-bold font-display flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-orange-600" />
                  Customer Receivables Ledger
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aggregated balance dues across all jobs & invoices. Click column headers to sort.
                </p>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search by name, ID, or phone..."
                    value={cockpitSearch}
                    onChange={(e) => setCockpitSearch(e.target.value)}
                    className="pl-8 text-xs h-8 bg-slate-50"
                  />
                </div>

                <select
                  value={cockpitStatusFilter}
                  onChange={(e) => setCockpitStatusFilter(e.target.value as any)}
                  className="text-xs h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Accounts</option>
                  <option value="DUE">With Balance Due</option>
                  <option value="SETTLED">Fully Settled</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-semibold text-slate-700">Customer ID</th>
                    <th
                      className="p-3 font-semibold text-slate-700 cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSortCockpit('name')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Customer Name</span>
                        {cockpitSortField === 'name' ? (
                          cockpitSortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-orange-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-orange-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3 font-semibold text-slate-700">Phone</th>
                    <th className="p-3 font-semibold text-slate-700 text-center">Invoices</th>
                    <th
                      className="p-3 font-semibold text-slate-700 text-right cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSortCockpit('invoiced')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Invoiced Amount</span>
                        {cockpitSortField === 'invoiced' ? (
                          cockpitSortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-orange-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-orange-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="p-3 font-semibold text-slate-700 text-right cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSortCockpit('collected')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Collected Amount</span>
                        {cockpitSortField === 'collected' ? (
                          cockpitSortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-orange-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-orange-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="p-3 font-semibold text-slate-700 text-right cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSortCockpit('balance')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Balance Due</span>
                        {cockpitSortField === 'balance' ? (
                          cockpitSortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-orange-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-orange-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3 font-semibold text-slate-700 text-center">Status</th>
                    <th className="p-3 font-semibold text-slate-700 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedAndFilteredOutstanding.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        No customer accounts match the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    sortedAndFilteredOutstanding.map((entry, idx) => {
                      const cust = entry.customer;
                      const hasBalance = entry.totalBalance > 0;
                      const isPartial = hasBalance && entry.totalCollected > 0;

                      return (
                        <tr
                          key={cust.id}
                          className={`hover:bg-orange-50/30 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                          }`}
                        >
                          <td className="p-3 font-mono font-semibold text-slate-500">
                            {cust.id}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{cust.name}</div>
                            {cust.contactPerson && (
                              <div className="text-[10px] text-slate-500">{cust.contactPerson}</div>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-600">
                            {cust.phone}
                          </td>
                          <td className="p-3 text-center font-mono font-medium text-slate-700">
                            {entry.invoices.length}
                          </td>
                          <td className="p-3 text-right font-mono font-medium text-slate-700">
                            {formatINR(entry.totalInvoiced)}
                          </td>
                          <td className="p-3 text-right font-mono font-medium text-emerald-700">
                            {formatINR(entry.totalCollected)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            <span
                              className={
                                entry.hasOverdue
                                  ? 'text-rose-700 font-bold'
                                  : hasBalance
                                  ? 'text-amber-800 font-bold'
                                  : 'text-slate-400'
                              }
                            >
                              {formatINR(entry.totalBalance)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {entry.hasOverdue ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                Overdue &gt;15D
                              </span>
                            ) : !hasBalance ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Fully Settled
                              </span>
                            ) : isPartial ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                Partial
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-orange-50 text-orange-800 border border-orange-200">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDrilldownCustomer(cust)}
                                className="h-7 px-2.5 text-xs cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" /> View Ledger
                              </Button>
                              {hasBalance && isManagement && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleOpenRecordPayment(cust.id)}
                                  className="h-7 px-2.5 text-xs font-semibold cursor-pointer"
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> Pay
                                </Button>
                              )}
                            </div>
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
      )}

      {/* VIEW 2: PAYMENT TRANSACTIONS LEDGER (TASK 2 — DATA TABLE LAYOUT) */}
      {activeTab === 'LEDGER' && (
        <Card className="w-full border-slate-200 bg-white shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base text-slate-900 font-bold font-display flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                All Payment Receipts & Collections
              </CardTitle>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search receipt, invoice, or client..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 text-xs h-8 bg-slate-50"
                  />
                </div>

                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                  className="text-xs h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Modes</option>
                  <option value="UPI">UPI</option>
                  <option value="NEFT">NEFT</option>
                  <option value="CASH">CASH</option>
                  <option value="CHEQUE">CHEQUE</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-xs h-8 px-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Types</option>
                  <option value="FULL">FULL</option>
                  <option value="BALANCE">BALANCE</option>
                  <option value="ADVANCE">ADVANCE</option>
                  <option value="REFUND">REFUND</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-semibold text-slate-700">Receipt Ref</th>
                    <th className="p-3 font-semibold text-slate-700">Customer</th>
                    <th className="p-3 font-semibold text-slate-700">Invoice Ref</th>
                    <th className="p-3 font-semibold text-slate-700">Job Ref</th>
                    <th className="p-3 font-semibold text-slate-700">Payment Mode</th>
                    <th className="p-3 font-semibold text-slate-700">Type</th>
                    <th className="p-3 font-semibold text-slate-700">Date</th>
                    <th className="p-3 font-semibold text-slate-700 text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        No payment transactions match the active filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p, idx) => {
                      const cust = customers.find((c) => c.id === p.customerNumber);
                      const inv = invoices.find((i) => i.id === p.invoiceId);
                      const job = jobs.find((j) => j.id === (inv?.linkedJobId ?? p.jobId));

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-orange-50/30 transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                          }`}
                        >
                          <td className="p-3 font-mono font-bold text-orange-600">
                            {p.receiptNo || p.referenceNo || p.id}
                            {p.receiptNo && p.referenceNo && (
                              <div className="text-[10px] font-normal text-slate-500">Ref {p.referenceNo}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{cust?.name}</div>
                            <div className="text-[10px] text-slate-500">{cust?.phone}</div>
                          </td>
                          <td className="p-3 font-mono text-slate-700 font-medium">
                            {inv?.invoiceNo || <AdvanceLabel payment={p} quotations={quotations} jobs={jobs} />}
                          </td>
                          <td className="p-3 font-mono text-slate-500">
                            {job?.jobNumber || '-'}
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {p.mode}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                p.type === 'FULL'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : p.type === 'REFUND'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {p.type}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 font-mono text-[11px]">
                            {formatDate(p.date)}
                          </td>
                          <td
                            className={`p-3 text-right font-bold font-mono text-sm ${
                              p.amount < 0 ? 'text-rose-700' : 'text-emerald-800'
                            }`}
                          >
                            {formatINR(p.amount)}
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
      )}

      {/* MODAL 1: Customer Drilldown History Modal */}
      {drilldownCustomer && (
        <Modal
          isOpen={Boolean(drilldownCustomer)}
          onClose={() => setDrilldownCustomer(null)}
          maxWidth="3xl"
          showCloseButton={false}
          className="max-h-[90vh]"
          bodyClassName="p-0 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 font-bold shadow-2xs">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 font-display">
                  {drilldownCustomer.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {drilldownCustomer.address} &bull; {drilldownCustomer.phone}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDrilldownCustomer(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs overscroll-contain">
              {/* Invoices List */}
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                  Invoices for this Customer
                </h3>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Invoice No</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Total</th>
                        <th className="p-2.5 text-right">Paid</th>
                        <th className="p-2.5 text-right">Balance Due</th>
                        <th className="p-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices
                        .filter((i) => i.customerNumber === drilldownCustomer.id)
                        .map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-orange-600">
                              {inv.invoiceNo}
                            </td>
                            <td className="p-2.5 font-mono text-slate-500">{formatDate(inv.date)}</td>
                            <td className="p-2.5 text-right font-mono">{formatINR(inv.grandTotal)}</td>
                            <td className="p-2.5 text-right font-mono text-emerald-700">
                              {formatINR(inv.amountPaid)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-amber-800">
                              {formatINR(inv.balanceDue)}
                            </td>
                            <td className="p-2.5 text-center">
                              {inv.balanceDue > 0 && isManagement ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDrilldownCustomer(null);
                                    handleOpenRecordPayment(drilldownCustomer.id, inv.id);
                                  }}
                                  className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer"
                                >
                                  Collect
                                </button>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Settled
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments History List */}
              <div className="space-y-2 pt-2">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                  Receipts Logged for this Customer
                </h3>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Receipt Ref</th>
                        <th className="p-2.5">Invoice</th>
                        <th className="p-2.5">Mode</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments
                        .filter((p) => p.customerNumber === drilldownCustomer.id)
                        .map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-orange-600 font-semibold">
                              {p.receiptNo || p.referenceNo || p.id}
                            </td>
                            <td className="p-2.5 font-mono text-slate-600">
                              {invoices.find((i) => i.id === p.invoiceId)?.invoiceNo || (
                                <AdvanceLabel payment={p} quotations={quotations} jobs={jobs} />
                              )}
                            </td>
                            <td className="p-2.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {p.mode}
                              </span>
                            </td>
                            <td className="p-2.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                {p.type}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-slate-500">{formatDate(p.date)}</td>
                            <td
                              className={`p-2.5 text-right font-bold font-mono ${
                                p.amount < 0 ? 'text-rose-700' : 'text-emerald-800'
                              }`}
                            >
                              {formatINR(p.amount)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
            </div>
          </div>

          <div className="flex justify-end px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setDrilldownCustomer(null)} className="rounded-xl">
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* MODAL 2: Record Manual Payment (TASK 4) */}
      {isRecordModalOpen && (
        <Modal
          isOpen={isRecordModalOpen}
          onClose={() => setIsRecordModalOpen(false)}
          maxWidth="lg"
          showCloseButton={false}
          className="max-h-[90vh]"
          bodyClassName="p-0 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  Record Manual Payment Receipt
                </h3>
                <p className="text-xs text-slate-500">
                  Direct collection outside standard OTP sign-off
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsRecordModalOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmitManualPayment} className="flex-1 flex flex-col overflow-hidden text-xs">
            <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
              {/* Customer Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Customer *</label>
                <select
                  value={manualCustomerId}
                  onChange={(e) => handleCustomerSelectChange(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} &mdash; {c.phone}
                    </option>
                  ))}
                </select>
              </div>

              {/* Invoice Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target Outstanding Invoice *
                </label>
                <select
                  value={manualInvoiceId}
                  onChange={(e) => handleInvoiceSelectChange(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500 font-mono"
                >
                  <option value="">-- Choose an invoice --</option>
                  {invoices
                    .filter((i) => i.customerNumber === manualCustomerId && i.balanceDue > 0)
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNo} &bull; Total: {formatINR(inv.grandTotal)} (Balance Due:{' '}
                        {formatINR(inv.balanceDue)})
                      </option>
                    ))}
                </select>
              </div>

              {/* Amount and Payment Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount Received (₹) *</label>
                  <Input
                    type="number"
                    required
                    min={1}
                    placeholder="Enter amount"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(Number(e.target.value) || '')}
                    className="h-9 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Mode *</label>
                  <select
                    value={manualMode}
                    onChange={(e) => setManualMode(e.target.value as PaymentMode)}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                  >
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="NEFT">NEFT / RTGS / IMPS</option>
                    <option value="CASH">Cash Collection</option>
                    <option value="CHEQUE">Bank Cheque</option>
                  </select>
                </div>
              </div>

              {/* Reference and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    UTR / Cheque / Transaction Ref No
                  </label>
                  <Input
                    placeholder="e.g. UTR-4029104881"
                    value={manualReference}
                    onChange={(e) => setManualReference(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Date *</label>
                  <Input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setIsRecordModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" disabled={savingPayment} className="rounded-xl font-semibold">
                Confirm & Post Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
