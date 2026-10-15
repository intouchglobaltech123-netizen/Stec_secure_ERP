import React, { useState, useMemo } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { SERVICE_CATEGORIES, ServiceCategory, Job, Customer, User } from '@/lib/stecsecure-types';
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  Layers,
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  PieChart as PieIcon,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatINR, formatDate, humanize } from '@/lib/utils';
import { DateRange, inRange, presetRange, rangeFileTag, rangeLabel } from '@/lib/date-range';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { StatTile } from '@/components/ui/stat-tile';
import { downloadExcel } from '@/lib/excel-download';
import type { SheetSpec } from '@/lib/excel-book';
import { stateName } from '@/lib/gst';
import { errorMessage } from '@/lib/api';
import { invoiceCategory, invoiceNetTotal, isCancelledInvoice } from '@/lib/invoice-status';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { JobDetailModal } from '@/components/jobs/JobDetailModal';
import { toast } from 'sonner';

type ReportTab = 'REVENUE' | 'AMC_RENEWAL' | 'OUTSTANDING' | 'TECHNICIAN' | 'ONGOING';

interface ReportsPageProps {
  onNavigateToJob?: (jobId: string, type: 'SERVICE' | 'INSTALLATION') => void;
}

// Report downloads are Excel files; the library loads only when someone downloads
async function exportExcel(fileBase: string, sheets: SheetSpec[]) {
  try {
    const name = await downloadExcel(fileBase, sheets);
    toast.success(`Downloaded ${name}`);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

const DEPT_LABEL = { ALL: 'All', SERVICE: 'Service', INSTALLATION: 'Installation' } as const;

// Short category names so the chart's labels fit on a phone
const SHORT_CATEGORY: Record<string, string> = {
  'Home Automations': 'Home Auto',
  'Gate Automation': 'Gate',
  'Biometric & Access Control': 'Biometric',
  'Burglar Alarm System': 'Alarm',
};

export const ReportsPage: React.FC<ReportsPageProps> = ({ onNavigateToJob }) => {
  const { jobs: allJobs, visibleJobs, currentUser, customers, invoices, payments, users, holdEvents } = useStecSecure();
  const jobs = currentUser?.role === 'TECHNICIAN' ? visibleJobs : allJobs;
  const [activeReport, setActiveReport] = useState<ReportTab>('REVENUE');
  const [inspectedJob, setInspectedJob] = useState<Job | null>(null);

  // Report period for Revenue, Dues and Technicians (AMC looks ahead by renewal date; Ongoing is "right now")
  const [range, setRange] = useState<DateRange>(() => presetRange('FY'));
  const periodLabel = rangeLabel(range);
  const usesPeriod = activeReport === 'REVENUE' || activeReport === 'OUTSTANDING' || activeReport === 'TECHNICIAN';

  // Filters for AMC Renewal Report
  const [amcDaysFilter, setAmcDaysFilter] = useState<'30' | '60' | '90' | 'ALL'>('60');

  // Filters for Revenue Report
  const [revenueTypeFilter, setRevenueTypeFilter] = useState<'ALL' | 'SERVICE' | 'INSTALLATION'>('ALL');

  // Filter for Ongoing projects
  const [ongoingDeptFilter, setOngoingDeptFilter] = useState<'ALL' | 'SERVICE' | 'INSTALLATION'>('ALL');

  const nowMs = new Date().getTime();
  const DAY_MS = 1000 * 60 * 60 * 24;
  const jobById = useMemo(() => new Map(allJobs.map((j) => [j.id, j])), [allJobs]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const periodJobs = useMemo(() => jobs.filter((j) => inRange(j.createdAt, range)), [jobs, range]);

  // Live invoices dated in the period (a technician's report covers only their own jobs)
  const periodInvoices = useMemo(() => {
    const visibleIds = new Set(jobs.map((j) => j.id));
    return invoices.filter(
      (inv) =>
        !isCancelledInvoice(inv) &&
        inRange(inv.date, range) &&
        (currentUser?.role !== 'TECHNICIAN' || (inv.linkedJobId !== undefined && visibleIds.has(inv.linkedJobId)))
    );
  }, [invoices, jobs, range, currentUser]);

  // ==========================================
  // 1. REVENUE REPORT COMPUTATIONS
  // ==========================================
  // Step 3: revenue comes from the invoices themselves (net of credit notes, cancelled ones excluded),
  // so it matches the Dashboard and Payments. Invoices raised straight from a quotation or challan have
  // no job and count under Installation.
  const department = (inv: (typeof invoices)[number]) =>
    (inv.linkedJobId && jobById.get(inv.linkedJobId)?.type) || 'INSTALLATION';
  const revenueInvoices = periodInvoices.filter(
    (inv) => revenueTypeFilter === 'ALL' || department(inv) === revenueTypeFilter
  );

  const revenueByCategory = SERVICE_CATEGORIES.map((cat) => {
    const catJobs = periodJobs.filter(
      (j) => j.category === cat && (revenueTypeFilter === 'ALL' || j.type === revenueTypeFilter)
    );
    const catInvoices = revenueInvoices.filter((inv) => invoiceCategory(inv, allJobs) === cat);
    const billed = catInvoices.reduce((sum, inv) => sum + invoiceNetTotal(inv), 0);
    const collected = catInvoices.reduce((sum, inv) => sum + Math.min(inv.amountPaid || 0, invoiceNetTotal(inv)), 0);
    return {
      category: cat,
      jobsCount: catJobs.length,
      invoicesCount: catInvoices.length,
      billed,
      collected,
      outstanding: catInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0),
    };
  });

  const totalRevenueBilled = revenueByCategory.reduce((sum, c) => sum + c.billed, 0);
  const totalRevenueCollected = revenueByCategory.reduce((sum, c) => sum + c.collected, 0);
  const totalRevenueJobs = revenueByCategory.reduce((sum, c) => sum + c.jobsCount, 0);

  const handleDownloadRevenue = () => {
    const rows = [...revenueInvoices]
      .sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNo.localeCompare(b.invoiceNo))
      .map((inv) => {
        const cust = customerById.get(inv.customerNumber);
        const invPayments = payments.filter((p) => p.invoiceId === inv.id);
        const received = invPayments.filter((p) => p.amount > 0);
        return {
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          customer: inv.billTo?.name || cust?.name || inv.customerNumber,
          phone: inv.billTo?.phone || cust?.phone || '',
          email: cust?.email || '',
          address: inv.billTo?.address || cust?.address || '',
          gstin: inv.billTo?.gstin || cust?.gstin || 'Unregistered',
          state: stateName(inv.placeOfSupply),
          job: inv.linkedJobId ? jobById.get(inv.linkedJobId)?.jobNumber || '' : '',
          category: invoiceCategory(inv, allJobs),
          department: DEPT_LABEL[department(inv)],
          taxable: inv.totalAmount,
          cgst: inv.totalCgst,
          sgst: inv.totalSgst,
          igst: inv.totalIgst || 0,
          total: inv.grandTotal,
          credit: inv.creditNoteTotal || 0,
          net: invoiceNetTotal(inv),
          paid: inv.amountPaid,
          balance: inv.balanceDue,
          lastPayment: received.map((p) => p.date).sort().pop() || '',
          modes: [...new Set(received.map((p) => p.mode))].join(', '),
          status: inv.balanceDue <= 0 ? 'Paid' : inv.amountPaid > 0 ? 'Part paid' : 'Unpaid',
        };
      });
    const dept = revenueTypeFilter === 'ALL' ? '' : ` · ${DEPT_LABEL[revenueTypeFilter]}`;
    void exportExcel(`stec_revenue_${rangeFileTag(range)}`, [
      {
        name: 'Invoices',
        title: `Revenue — invoices dated ${periodLabel}${dept}`,
        columns: [
          { header: 'Invoice', key: 'invoiceNo' },
          { header: 'Invoice date', key: 'date', type: 'date' },
          { header: 'Customer', key: 'customer' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Email', key: 'email' },
          { header: 'Address', key: 'address', width: 40 },
          { header: 'GSTIN', key: 'gstin' },
          { header: 'State', key: 'state' },
          { header: 'Job', key: 'job' },
          { header: 'Category', key: 'category' },
          { header: 'Department', key: 'department' },
          { header: 'Taxable (₹)', key: 'taxable', type: 'money' },
          { header: 'CGST (₹)', key: 'cgst', type: 'money' },
          { header: 'SGST (₹)', key: 'sgst', type: 'money' },
          { header: 'IGST (₹)', key: 'igst', type: 'money' },
          { header: 'Invoice total (₹)', key: 'total', type: 'money' },
          { header: 'Credit notes (₹)', key: 'credit', type: 'money' },
          { header: 'Net billed (₹)', key: 'net', type: 'money' },
          { header: 'Paid (₹)', key: 'paid', type: 'money' },
          { header: 'Balance (₹)', key: 'balance', type: 'money' },
          { header: 'Last payment', key: 'lastPayment', type: 'date' },
          { header: 'Payment mode', key: 'modes' },
          { header: 'Status', key: 'status' },
        ],
        rows,
        totalKeys: ['taxable', 'cgst', 'sgst', 'igst', 'total', 'credit', 'net', 'paid', 'balance'],
      },
      {
        name: 'By category',
        title: `Revenue by category — ${periodLabel}${dept}`,
        columns: [
          { header: 'Category', key: 'category' },
          { header: 'Jobs created', key: 'jobsCount', type: 'number' },
          { header: 'Invoices', key: 'invoicesCount', type: 'number' },
          { header: 'Billed (₹)', key: 'billed', type: 'money' },
          { header: 'Collected (₹)', key: 'collected', type: 'money' },
          { header: 'Balance (₹)', key: 'outstanding', type: 'money' },
        ],
        rows: revenueByCategory,
        totalKeys: ['jobsCount', 'invoicesCount', 'billed', 'collected', 'outstanding'],
      },
    ]);
  };

  // ==========================================
  // 2. AMC RENEWAL REPORT COMPUTATIONS
  // ==========================================
  // AMC customers by nearest renewal date; customers with no renewal date are listed last so one gets set
  const amcCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        const hasAmcJob = jobs.some((j) => j.customerNumber === c.id && j.customerStatus === 'AMC');
        return c.amcActive || Boolean(c.amcRenewalDate) || hasAmcJob;
      })
      .map((c) => {
        const renewalDate = c.amcRenewalDate || '';
        const daysRemaining = renewalDate ? Math.ceil((new Date(renewalDate).getTime() - nowMs) / DAY_MS) : null;
        const amcJobs = jobs.filter((j) => j.customerNumber === c.id && j.customerStatus === 'AMC');
        const latestJob = amcJobs[amcJobs.length - 1];
        return {
          customer: c,
          renewalDate,
          daysRemaining,
          status:
            daysRemaining === null
              ? 'No renewal date'
              : daysRemaining < 0
              ? 'Expired'
              : daysRemaining <= 30
              ? 'Within 30 days'
              : 'Upcoming',
          latestCategory: latestJob?.category || '',
          amcJobsCount: amcJobs.length,
        };
      })
      .filter(
        (item) => item.daysRemaining === null || amcDaysFilter === 'ALL' || item.daysRemaining <= Number(amcDaysFilter)
      )
      .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
  }, [customers, jobs, amcDaysFilter, nowMs]);

  const handleDownloadAmc = () => {
    void exportExcel(`stec_amc_renewals_${amcDaysFilter === 'ALL' ? 'all' : `${amcDaysFilter}-days`}`, [
      {
        name: 'AMC renewals',
        title: `AMC renewals — ${amcDaysFilter === 'ALL' ? 'all AMC customers' : `renewing within ${amcDaysFilter} days`}`,
        columns: [
          { header: 'Customer', key: 'name' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Contact person', key: 'contact' },
          { header: 'Email', key: 'email' },
          { header: 'Address', key: 'address', width: 40 },
          { header: 'Renewal date', key: 'renewal', type: 'date' },
          { header: 'Days left', key: 'days', type: 'number' },
          { header: 'Status', key: 'status' },
          { header: 'Main category', key: 'category' },
          { header: 'AMC jobs', key: 'jobs', type: 'number' },
        ],
        rows: amcCustomers.map((a) => ({
          name: a.customer.name,
          phone: a.customer.phone,
          contact: a.customer.contactPerson || '',
          email: a.customer.email || '',
          address: a.customer.address,
          renewal: a.renewalDate,
          days: a.daysRemaining,
          status: a.status,
          category: a.latestCategory,
          jobs: a.amcJobsCount,
        })),
      },
    ]);
  };

  // ==========================================
  // 3. OUTSTANDING DUES & COLLECTIONS REPORT
  // ==========================================
  // Dues as of today on invoices dated in the period
  const outstandingReport = useMemo(() => {
    return customers
      .map((cust) => {
        const custInvoices = periodInvoices.filter((i) => i.customerNumber === cust.id);
        const unpaidInvoices = custInvoices.filter((i) => i.balanceDue > 0);
        const totalBilled = custInvoices.reduce((sum, i) => sum + invoiceNetTotal(i), 0);
        const totalPaid = custInvoices.reduce((sum, i) => sum + i.amountPaid, 0);
        const balanceDue = custInvoices.reduce((sum, i) => sum + i.balanceDue, 0);

        let oldestUnpaidDate = '';
        let maxOverdueDays = 0;
        if (unpaidInvoices.length > 0) {
          oldestUnpaidDate = [...unpaidInvoices].sort((a, b) => a.date.localeCompare(b.date))[0].date;
          maxOverdueDays = Math.max(0, Math.floor((nowMs - new Date(oldestUnpaidDate).getTime()) / DAY_MS));
        }

        return {
          customer: cust,
          unpaidInvoices,
          unpaidInvoicesCount: unpaidInvoices.length,
          totalBilled,
          totalPaid,
          balanceDue,
          oldestUnpaidDate,
          maxOverdueDays,
          overdueCategory:
            maxOverdueDays > 30 ? 'Over 30 days' : maxOverdueDays > 15 ? '15–30 days' : maxOverdueDays > 0 ? 'Under 15 days' : 'Current',
        };
      })
      .filter((entry) => entry.balanceDue > 0)
      .sort((a, b) => b.balanceDue - a.balanceDue);
  }, [customers, periodInvoices, nowMs]);

  const totalOutstandingReportDue = outstandingReport.reduce((sum, o) => sum + o.balanceDue, 0);
  const overdueAccounts = outstandingReport.filter((o) => o.maxOverdueDays > 15);
  const overdueAmount = overdueAccounts.reduce((sum, o) => sum + o.balanceDue, 0);

  const handleDownloadOutstanding = () => {
    const invoiceRows = outstandingReport
      .flatMap((o) =>
        o.unpaidInvoices.map((inv) => ({
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          customer: o.customer.name,
          phone: o.customer.phone,
          net: invoiceNetTotal(inv),
          paid: inv.amountPaid,
          balance: inv.balanceDue,
          days: Math.max(0, Math.floor((nowMs - new Date(inv.date).getTime()) / DAY_MS)),
        }))
      )
      .sort((a, b) => b.days - a.days);
    void exportExcel(`stec_dues_${rangeFileTag(range)}`, [
      {
        name: 'Dues by customer',
        title: `Dues as of today on invoices dated ${periodLabel}`,
        columns: [
          { header: 'Customer', key: 'name' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Contact person', key: 'contact' },
          { header: 'GSTIN', key: 'gstin' },
          { header: 'Unpaid invoices', key: 'unpaid', type: 'number' },
          { header: 'Billed (₹)', key: 'billed', type: 'money' },
          { header: 'Paid (₹)', key: 'paid', type: 'money' },
          { header: 'Balance (₹)', key: 'balance', type: 'money' },
          { header: 'Oldest unpaid', key: 'oldest', type: 'date' },
          { header: 'Days overdue', key: 'days', type: 'number' },
          { header: 'Overdue', key: 'bracket' },
        ],
        rows: outstandingReport.map((o) => ({
          name: o.customer.name,
          phone: o.customer.phone,
          contact: o.customer.contactPerson || '',
          gstin: o.customer.gstin || 'Unregistered',
          unpaid: o.unpaidInvoicesCount,
          billed: o.totalBilled,
          paid: o.totalPaid,
          balance: o.balanceDue,
          oldest: o.oldestUnpaidDate,
          days: o.maxOverdueDays,
          bracket: o.overdueCategory,
        })),
        totalKeys: ['unpaid', 'billed', 'paid', 'balance'],
      },
      {
        name: 'Unpaid invoices',
        title: `Unpaid invoices dated ${periodLabel}`,
        columns: [
          { header: 'Invoice', key: 'invoiceNo' },
          { header: 'Invoice date', key: 'date', type: 'date' },
          { header: 'Customer', key: 'customer' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Net billed (₹)', key: 'net', type: 'money' },
          { header: 'Paid (₹)', key: 'paid', type: 'money' },
          { header: 'Balance (₹)', key: 'balance', type: 'money' },
          { header: 'Days since invoice', key: 'days', type: 'number' },
        ],
        rows: invoiceRows,
        totalKeys: ['net', 'paid', 'balance'],
      },
    ]);
  };

  // ==========================================
  // 4. TECHNICIAN PERFORMANCE REPORT
  // ==========================================
  // Jobs created in the period; average time comes only from jobs with a recorded work timer
  const technicianStats = useMemo(() => {
    const techs = users.filter((u) => u.role === 'TECHNICIAN');

    return techs.map((tech) => {
      const assignedJobs = periodJobs.filter(
        (j) => j.teamLeadUserId === tech.id || j.assignedTeam?.includes(tech.id)
      );
      const completedJobs = assignedJobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CLOSED');
      const activeJobs = assignedJobs.filter(
        (j) => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED' || j.status === 'ON_HOLD' || j.status === 'AWAITING_OTP'
      );
      const techHolds = holdEvents.filter((h) => h.raisedByUserId === tech.id && inRange(h.raisedAt, range));
      const timed = completedJobs.filter((j) => (j.totalDurationSeconds || 0) > 0);
      const avgCompletionHours = timed.length
        ? Math.round((timed.reduce((sum, j) => sum + (j.totalDurationSeconds || 0), 0) / timed.length / 3600) * 10) / 10
        : null;
      const completionRate = assignedJobs.length > 0 ? completedJobs.length / assignedJobs.length : 0;

      return {
        tech,
        totalAssigned: assignedJobs.length,
        completed: completedJobs.length,
        active: activeJobs.length,
        holdsRaised: techHolds.length,
        avgCompletionHours,
        completionRate,
      };
    });
  }, [users, periodJobs, holdEvents, range]);

  const handleDownloadTechnicians = () => {
    void exportExcel(`stec_technicians_${rangeFileTag(range)}`, [
      {
        name: 'Technicians',
        title: `Technician performance — jobs created ${periodLabel}`,
        columns: [
          { header: 'Staff no.', key: 'code' },
          { header: 'Technician', key: 'name' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Jobs assigned', key: 'assigned', type: 'number' },
          { header: 'Completed', key: 'completed', type: 'number' },
          { header: 'Still open', key: 'active', type: 'number' },
          { header: 'Holds raised', key: 'holds', type: 'number' },
          { header: 'Avg hours per job', key: 'avg', type: 'number' },
          { header: 'Completion rate', key: 'rate', type: 'percent' },
        ],
        rows: technicianStats.map((t) => ({
          code: t.tech.staffCode || '',
          name: t.tech.name,
          phone: t.tech.phone,
          assigned: t.totalAssigned,
          completed: t.completed,
          active: t.active,
          holds: t.holdsRaised,
          avg: t.avgCompletionHours,
          rate: t.completionRate,
        })),
        totalKeys: ['assigned', 'completed', 'active', 'holds'],
      },
    ]);
  };

  // ==========================================
  // 5. ONGOING PROJECTS REPORT
  // ==========================================
  const ongoingProjects = useMemo(() => {
    return jobs
      .filter((j) => {
        const matchesStatus = j.status === 'IN_PROGRESS' || j.status === 'ON_HOLD' || j.status === 'AWAITING_OTP';
        const matchesDept = ongoingDeptFilter === 'ALL' || j.type === ongoingDeptFilter;
        return matchesStatus && matchesDept;
      })
      .map((j) => {
        const cust = customerById.get(j.customerNumber);
        const lead = users.find((u) => u.id === j.teamLeadUserId);
        const startMs = new Date(j.timerStartedAt || j.createdAt).getTime();
        const daysElapsed = Math.max(1, Math.floor((nowMs - startMs) / DAY_MS));

        return {
          job: j,
          customerName: cust?.name || j.customerNumber,
          customerPhone: cust?.phone || '-',
          leadName: lead?.name || 'Unassigned',
          daysElapsed,
        };
      })
      .sort((a, b) => b.daysElapsed - a.daysElapsed);
  }, [jobs, customerById, users, ongoingDeptFilter, nowMs]);

  const handleDownloadOngoing = () => {
    void exportExcel(`stec_ongoing_jobs_${new Date(nowMs).toISOString().slice(0, 10)}`, [
      {
        name: 'Ongoing jobs',
        title: `Jobs in progress, on hold or awaiting sign-off${ongoingDeptFilter === 'ALL' ? '' : ` · ${DEPT_LABEL[ongoingDeptFilter]}`}`,
        columns: [
          { header: 'Job', key: 'job' },
          { header: 'Type', key: 'type' },
          { header: 'Customer', key: 'customer' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Category', key: 'category' },
          { header: 'Product', key: 'product' },
          { header: 'Team lead', key: 'lead' },
          { header: 'Started', key: 'started', type: 'date' },
          { header: 'Days open', key: 'days', type: 'number' },
          { header: 'Stage', key: 'stage' },
          { header: 'Problem / scope', key: 'problem', width: 50 },
        ],
        rows: ongoingProjects.map((p) => ({
          job: p.job.jobNumber,
          type: humanize(p.job.type),
          customer: p.customerName,
          phone: p.customerPhone,
          category: p.job.category,
          product: p.job.productModel,
          lead: p.leadName,
          started: p.job.timerStartedAt || p.job.createdAt,
          days: p.daysElapsed,
          stage: humanize(p.job.status),
          problem: p.job.problemReported,
        })),
      },
    ]);
  };

  const excelButton = (onClick: () => void) => (
    <Button variant="outline" size="sm" onClick={onClick} className="text-[13px] font-semibold cursor-pointer shrink-0">
      <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
      Download Excel
    </Button>
  );

  const deptButtons = (value: 'ALL' | 'SERVICE' | 'INSTALLATION', onPick: (v: 'ALL' | 'SERVICE' | 'INSTALLATION') => void) => (
    <div className="flex items-center gap-1.5">
      {(['ALL', 'SERVICE', 'INSTALLATION'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onPick(mode)}
          className={`px-2.5 py-1 rounded-lg text-[13px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
            value === mode ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {DEPT_LABEL[mode]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">
            Reports
          </h1>
          <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
            Revenue, AMC renewals, dues, technician performance and ongoing jobs
          </p>
        </div>
        {usesPeriod && <DateRangeFilter value={range} onChange={setRange} />}
      </div>

      {/* 5 Dedicated Report Navigation Tabs */}
      <div className="w-full border-b border-slate-200 overflow-x-auto pb-2">
        <div className="flex items-center gap-2 min-w-max">
          <button
            type="button"
            onClick={() => setActiveReport('REVENUE')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'REVENUE'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Revenue</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('AMC_RENEWAL')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'AMC_RENEWAL'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>AMC renewals</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeReport === 'AMC_RENEWAL' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {amcCustomers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('OUTSTANDING')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'OUTSTANDING'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Dues</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeReport === 'OUTSTANDING' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {outstandingReport.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('TECHNICIAN')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'TECHNICIAN'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Technicians</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('ONGOING')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'ONGOING'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Ongoing jobs</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeReport === 'ONGOING' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {ongoingProjects.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REPORT 1: REVENUE REPORT */}
      {/* ========================================================================= */}
      {activeReport === 'REVENUE' && (
        <div className="space-y-6">
          {/* Top Controls & KPI Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[13px] font-semibold text-slate-700">Department:</span>
              {deptButtons(revenueTypeFilter, setRevenueTypeFilter)}
            </div>
            {excelButton(handleDownloadRevenue)}
          </div>

          {/* Revenue KPI Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile
              label="Billed"
              icon={FileSpreadsheet}
              value={formatINR(totalRevenueBilled)}
              note={`${revenueInvoices.length} invoices · ${totalRevenueJobs} jobs`}
            />
            <StatTile label="Collected" icon={CheckCircle2} tone="emerald" value={formatINR(totalRevenueCollected)} note="Received against them" />
            <StatTile
              label="Balance"
              icon={Clock}
              tone="amber"
              value={formatINR(Math.max(0, totalRevenueBilled - totalRevenueCollected))}
              note="Still to collect"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          {/* Chart & Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border-slate-200 bg-white shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Billed vs collected by category
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByCategory} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="category"
                      interval={0}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(c: string) => SHORT_CATEGORY[c] || c}
                      height={28}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      width={44}
                      tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip formatter={(value: any) => [formatINR(Number(value)), '']} />
                    <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
                    <Bar dataKey="billed" name="Billed (₹)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" name="Collected (₹)" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900">Jobs by category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {revenueByCategory.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-slate-800 font-medium truncate max-w-[170px]">{item.category}</span>
                      <span className="text-slate-500 font-mono font-semibold">{item.jobsCount} jobs</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{
                          width: `${Math.max(8, Math.round((item.jobsCount / Math.max(totalRevenueJobs, 1)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Revenue Breakdown Table */}
          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                By category
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="stack-on-phone w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Service Category</th>
                    <th className="p-3 text-center">Jobs</th>
                    <th className="p-3 text-right">Billed (INR)</th>
                    <th className="p-3 text-right">Collected (INR)</th>
                    <th className="p-3 text-right">Balance Due (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revenueByCategory.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-900">{row.category}</td>
                      <td className="p-3 text-center font-mono">{row.jobsCount}</td>
                      <td className="p-3 text-right font-mono font-medium text-slate-700">
                        {formatINR(row.billed)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-orange-600">
                        {formatINR(row.collected)}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-amber-800">
                        {formatINR(row.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REPORT 2: AMC RENEWAL REPORT */}
      {/* ========================================================================= */}
      {activeReport === 'AMC_RENEWAL' && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[13px] font-semibold text-slate-700">Renewing within:</span>
              <div className="flex items-center gap-1.5">
                {(['30', '60', '90', 'ALL'] as const).map((window) => (
                  <button
                    key={window}
                    type="button"
                    onClick={() => setAmcDaysFilter(window)}
                    className={`px-3 py-1 rounded-lg text-[13px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                      amcDaysFilter === window ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {window === 'ALL' ? 'All' : `${window} days`}
                  </button>
                ))}
              </div>
            </div>
            {excelButton(handleDownloadAmc)}
          </div>

          <div className="hidden sm:block p-3 rounded-xl bg-orange-50/60 border border-orange-200 text-[13px] text-orange-900">
            Nearest renewal first — call these customers before their AMC ends.
          </div>

          {/* AMC Accounts Table */}
          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>AMC customers ({amcCustomers.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="stack-on-phone w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Contact Person</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Renewal Date</th>
                    <th className="p-3 text-center">Days Left</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {amcCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No AMC customers renew in this window.
                      </td>
                    </tr>
                  ) : (
                    amcCustomers.map((item) => (
                      <tr key={item.customer.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{item.customer.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.customer.id}</div>
                        </td>
                        <td className="p-3 text-slate-700">{item.customer.contactPerson || '-'}</td>
                        <td className="p-3 font-mono text-slate-600">{item.customer.phone}</td>
                        <td className="p-3">
                          {item.latestCategory ? (
                            <Badge variant="outline" className="text-[11px]">
                              {item.latestCategory}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {item.renewalDate ? formatDate(item.renewalDate) : <span className="text-slate-400 font-sans font-normal">Not set</span>}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                          {item.daysRemaining === null ? (
                            <span className="text-slate-400">—</span>
                          ) : item.daysRemaining < 0 ? (
                            <span className="text-rose-600">Expired {Math.abs(item.daysRemaining)}d ago</span>
                          ) : (
                            <span>{item.daysRemaining} days</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={
                              item.daysRemaining === null
                                ? 'outline'
                                : item.daysRemaining < 0
                                ? 'danger'
                                : item.daysRemaining <= 30
                                ? 'warning'
                                : 'secondary'
                            }
                            className="text-[11px]"
                          >
                            {item.daysRemaining === null ? 'Set a renewal date' : item.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REPORT 3: OUTSTANDING DUES & COLLECTIONS REPORT */}
      {/* ========================================================================= */}
      {activeReport === 'OUTSTANDING' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Dues by customer</h2>
              <p className="hidden sm:block text-xs text-slate-500">
                Balance today on invoices dated {periodLabel} · highest first
              </p>
            </div>
            {excelButton(handleDownloadOutstanding)}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Balance due"
              icon={AlertTriangle}
              tone="rose"
              value={formatINR(totalOutstandingReportDue)}
              note={`${outstandingReport.length} customers`}
            />
            <StatTile
              label="Overdue 15+ days"
              icon={Clock}
              tone="amber"
              value={formatINR(overdueAmount)}
              note={`${overdueAccounts.length} customers to follow up`}
            />
          </div>

          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Customers with dues ({outstandingReport.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="stack-on-phone w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-center">Unpaid Invoices</th>
                    <th className="p-3 text-right">Total Invoiced</th>
                    <th className="p-3 text-right">Collected</th>
                    <th className="p-3 text-right font-bold text-slate-900">Balance Due (INR)</th>
                    <th className="p-3 text-center">Oldest Unpaid</th>
                    <th className="p-3 text-center">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outstandingReport.map((row) => (
                    <tr key={row.customer.id} className="hover:bg-slate-50/80">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{row.customer.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{row.customer.id}</div>
                      </td>
                      <td className="p-3 font-mono text-slate-600">{row.customer.phone}</td>
                      <td className="p-3 text-center font-mono font-semibold text-slate-700">
                        {row.unpaidInvoicesCount}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        {formatINR(row.totalBilled)}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-700">
                        {formatINR(row.totalPaid)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-700 text-sm">
                        {formatINR(row.balanceDue)}
                      </td>
                      <td className="p-3 text-center font-mono text-xs text-slate-500">
                        {row.oldestUnpaidDate ? formatDate(row.oldestUnpaidDate) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={
                            row.maxOverdueDays > 15
                              ? 'danger'
                              : row.maxOverdueDays > 0
                              ? 'warning'
                              : 'secondary'
                          }
                          className="text-[11px]"
                        >
                          {row.overdueCategory}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REPORT 4: TECHNICIAN PERFORMANCE REPORT */}
      {/* ========================================================================= */}
      {activeReport === 'TECHNICIAN' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Technician performance</h2>
              <p className="hidden sm:block text-xs text-slate-500">Jobs created {periodLabel}</p>
            </div>
            {excelButton(handleDownloadTechnicians)}
          </div>

          {/* Comparative Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {technicianStats.map((t) => (
              <Card key={t.tech.id} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{t.tech.name}</h3>
                      <div className="text-[11px] text-slate-500">{t.tech.phone}</div>
                    </div>
                    <Badge variant="orange" className="text-[11px]">
                      {Math.round(t.completionRate * 100)}% done
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-[13px]">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[11px] uppercase text-slate-500 font-bold">Completed</div>
                      <div className="font-bold text-slate-900 font-mono text-base">{t.completed}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-orange-50/70 border border-orange-100">
                      <div className="text-[11px] uppercase text-orange-800 font-bold">Active Jobs</div>
                      <div className="font-bold text-orange-800 font-mono text-base">{t.active}</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 flex justify-between pt-1">
                    <span>Avg per job: <strong className="text-slate-900">{t.avgCompletionHours === null ? '—' : `${t.avgCompletionHours} hrs`}</strong></span>
                    <span>Holds: <strong className="text-amber-800">{t.holdsRaised}</strong></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Detailed Table */}
          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                All technicians
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="stack-on-phone w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Technician</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-center">Assigned</th>
                    <th className="p-3 text-center">Completed</th>
                    <th className="p-3 text-center">Still Open</th>
                    <th className="p-3 text-center">Holds</th>
                    <th className="p-3 text-center">Avg per Job</th>
                    <th className="p-3 text-right">Completion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {technicianStats.map((row) => (
                    <tr key={row.tech.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-semibold text-slate-900">{row.tech.name}</td>
                      <td className="p-3 font-mono text-slate-600">{row.tech.phone}</td>
                      <td className="p-3 text-center font-mono">{row.totalAssigned}</td>
                      <td className="p-3 text-center font-mono font-bold text-orange-600">
                        {row.completed}
                      </td>
                      <td className="p-3 text-center font-mono font-medium text-slate-700">{row.active}</td>
                      <td className="p-3 text-center font-mono text-amber-800">{row.holdsRaised}</td>
                      <td className="p-3 text-center font-mono whitespace-nowrap">
                        {row.avgCompletionHours === null ? '—' : `${row.avgCompletionHours} hrs`}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {Math.round(row.completionRate * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REPORT 5: ONGOING PROJECTS REPORT */}
      {/* ========================================================================= */}
      {activeReport === 'ONGOING' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[13px] font-semibold text-slate-700">Department:</span>
              {deptButtons(ongoingDeptFilter, setOngoingDeptFilter)}
            </div>
            {excelButton(handleDownloadOngoing)}
          </div>

          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Open jobs ({ongoingProjects.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="stack-on-phone w-full text-left text-[13px]">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Job ID</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Category & Product</th>
                    <th className="p-3">Team Lead</th>
                    <th className="p-3 text-center">Started Date</th>
                    <th className="p-3 text-center">Days Active</th>
                    <th className="p-3 text-center">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ongoingProjects.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        No jobs in progress, on hold or awaiting sign-off.
                      </td>
                    </tr>
                  ) : (
                    ongoingProjects.map((item) => (
                      <tr
                        key={item.job.id}
                        onClick={() => {
                          if (onNavigateToJob) {
                            onNavigateToJob(item.job.id, item.job.type);
                          } else {
                            setInspectedJob(item.job);
                          }
                        }}
                        className="hover:bg-slate-100/90 transition-colors cursor-pointer group"
                      >
                        <td className="p-3 font-mono font-bold text-orange-600 group-hover:underline flex items-center gap-1">
                          <span>#{item.job.jobNumber}</span>
                          <span className="text-slate-400 group-hover:text-orange-600 font-sans">&rarr;</span>
                        </td>
                        <td className="p-3">
                          <Badge variant={item.job.type === 'SERVICE' ? 'default' : 'secondary'} className="text-[11px] rounded">
                            {humanize(item.job.type)}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{item.customerName}</div>
                          <div className="text-[11px] text-slate-500">{item.customerPhone}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-slate-900 font-medium">{item.job.category}</div>
                          <div className="text-[11px] text-slate-500">{item.job.productModel}</div>
                        </td>
                        <td className="p-3 font-medium text-slate-700">{item.leadName}</td>
                        <td className="p-3 text-center font-mono text-slate-500">
                          {formatDate(item.job.timerStartedAt || item.job.createdAt)}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {item.daysElapsed}d
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={
                              item.job.status === 'ON_HOLD'
                                ? 'warning'
                                : item.job.status === 'AWAITING_OTP'
                                ? 'orange'
                                : 'default'
                            }
                            className="text-[11px] rounded"
                          >
                            {humanize(item.job.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Embedded JobDetailModal for deep-linking from reports */}
      <JobDetailModal
        isOpen={Boolean(inspectedJob)}
        job={inspectedJob}
        onClose={() => setInspectedJob(null)}
      />
    </div>
  );
};
