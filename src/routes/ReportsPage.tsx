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
  Wallet,
  Inbox,
  RotateCcw,
  Boxes,
  FileText,
  FileDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatINR, formatDate, humanize } from '@/lib/utils';
import { DateRange, inRange, presetRange, rangeFileTag, rangeLabel } from '@/lib/date-range';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { StatTile } from '@/components/ui/stat-tile';
import type { SheetSpec } from '@/lib/excel-book';
import { ExportFormat, ReportExport, exportReport } from '@/lib/report-export';
import { customersSheet, enquiriesSheet, jobsSheet, repairsSheet, stockSheet, stockSummarySheet } from '@/lib/backup-sheets';
import { computePayroll } from '@/lib/payroll';
import { leaveDays, leaveTypeLabel } from '@/lib/leave';
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

type ReportTab =
  | 'REVENUE'
  | 'OUTSTANDING'
  | 'PAYROLL'
  | 'ENQUIRIES'
  | 'SERVICE_JOBS'
  | 'INSTALL_JOBS'
  | 'ONGOING'
  | 'REPAIRS'
  | 'TECHNICIAN'
  | 'INVENTORY'
  | 'CUSTOMERS'
  | 'AMC_RENEWAL';

interface ReportsPageProps {
  onNavigateToJob?: (jobId: string, type: 'SERVICE' | 'INSTALLATION') => void;
}

// Report downloads: Excel, CSV or PDF of the same sheets; the libraries load only when someone downloads
async function runExport(format: ExportFormat, report: ReportExport) {
  try {
    const name = await exportReport(format, report);
    toast.success(`Downloaded ${name}`);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

// A few columns of a sheet as an on-screen table (the download has them all)
const PreviewTable: React.FC<{ sheet: SheetSpec; keys: string[]; limit?: number; empty: string }> = ({
  sheet,
  keys,
  limit = 100,
  empty,
}) => {
  const cols = keys.map((k) => sheet.columns.find((c) => c.key === k)!).filter(Boolean);
  const show = (v: unknown, type?: string) => {
    if (v === undefined || v === null || v === '') return <span className="text-slate-400">—</span>;
    if (type === 'money') return formatINR(Number(v));
    if (type === 'date') return formatDate(String(v));
    if (type === 'datetime') return formatDate(String(v));
    return String(v);
  };
  const rows = sheet.rows.slice(-limit).reverse();
  return (
    <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-100">
        <CardTitle className="text-sm font-bold text-slate-900">
          {sheet.title || sheet.name} ({sheet.rows.length})
          {sheet.rows.length > limit && (
            <span className="font-normal text-slate-500"> — latest {limit} shown; the download has all</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="stack-on-phone w-full text-left text-[13px]">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`p-3 ${c.type === 'money' || c.type === 'number' ? 'text-right' : ''}`}>
                  {c.header.replace(' (₹)', '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="p-8 text-center text-slate-400">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/80">
                  {cols.map((c, k) => (
                    <td
                      key={c.key}
                      className={`p-3 ${k === 0 ? 'font-semibold text-slate-900 whitespace-nowrap' : 'text-slate-700'} ${
                        c.type === 'money' || c.type === 'number' ? 'text-right font-mono whitespace-nowrap' : ''
                      } ${c.type === 'date' || c.type === 'datetime' ? 'whitespace-nowrap' : ''}`}
                    >
                      {show(r[c.key], c.type)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

const DEPT_LABEL = { ALL: 'All', SERVICE: 'Service', INSTALLATION: 'Installation' } as const;

// Short category names so the chart's labels fit on a phone
const SHORT_CATEGORY: Record<string, string> = {
  'Home Automations': 'Home Auto',
  'Gate Automation': 'Gate',
  'Biometric & Access Control': 'Biometric',
  'Burglar Alarm System': 'Alarm',
};

export const ReportsPage: React.FC<ReportsPageProps> = ({ onNavigateToJob }) => {
  const {
    jobs: allJobs,
    visibleJobs,
    currentUser,
    customers,
    invoices,
    payments,
    users,
    holdEvents,
    enquiries,
    repairTickets,
    products,
    vendors,
    serialUnits,
    quotations,
    workLogs,
    payProfiles,
    leaveRecords,
  } = useStecSecure();
  const isCeo = currentUser?.role === 'CEO';
  const jobs = currentUser?.role === 'TECHNICIAN' ? visibleJobs : allJobs;
  const [activeReport, setActiveReport] = useState<ReportTab>('REVENUE');
  const [inspectedJob, setInspectedJob] = useState<Job | null>(null);

  // Report period for Revenue, Dues and Technicians (AMC looks ahead by renewal date; Ongoing is "right now")
  const [range, setRange] = useState<DateRange>(() => presetRange('FY'));
  const periodLabel = rangeLabel(range);
  // AMC looks ahead by renewal date and Ongoing is "right now"; every other report uses the period
  const usesPeriod = activeReport !== 'AMC_RENEWAL' && activeReport !== 'ONGOING';

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

  const revenueReport = (): ReportExport => {
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
    return {
      fileBase: `stec_revenue_${rangeFileTag(range)}`,
      title: `Revenue${revenueTypeFilter === 'ALL' ? '' : ` — ${DEPT_LABEL[revenueTypeFilter]}`}`,
      period: periodLabel,
      sheets: [
      {
        name: 'Invoices',
        title: `Revenue — invoices dated ${periodLabel}${dept}`,
        columns: [
          { header: 'Invoice', key: 'invoiceNo' },
          { header: 'Invoice date', key: 'date', type: 'date' },
          { header: 'Customer', key: 'customer' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Email', key: 'email', pdf: false },
          { header: 'Address', key: 'address', width: 40, pdf: false },
          { header: 'GSTIN', key: 'gstin' },
          { header: 'State', key: 'state', pdf: false },
          { header: 'Job', key: 'job' },
          { header: 'Category', key: 'category' },
          { header: 'Department', key: 'department', pdf: false },
          { header: 'Taxable (₹)', key: 'taxable', type: 'money' },
          { header: 'CGST (₹)', key: 'cgst', type: 'money' },
          { header: 'SGST (₹)', key: 'sgst', type: 'money' },
          { header: 'IGST (₹)', key: 'igst', type: 'money' },
          { header: 'Invoice total (₹)', key: 'total', type: 'money', pdf: false },
          { header: 'Credit notes (₹)', key: 'credit', type: 'money', pdf: false },
          { header: 'Net billed (₹)', key: 'net', type: 'money' },
          { header: 'Paid (₹)', key: 'paid', type: 'money' },
          { header: 'Balance (₹)', key: 'balance', type: 'money' },
          { header: 'Last payment', key: 'lastPayment', type: 'date' },
          { header: 'Payment mode', key: 'modes', pdf: false },
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
    ],
    };
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

  const amcReport = (): ReportExport => {
    return {
      fileBase: `stec_amc_renewals_${amcDaysFilter === 'ALL' ? 'all' : `${amcDaysFilter}-days`}`,
      title: 'AMC renewals',
      period: amcDaysFilter === 'ALL' ? 'All AMC customers' : `Renewing within ${amcDaysFilter} days`,
      sheets: [
      {
        name: 'AMC renewals',
        title: `AMC renewals — ${amcDaysFilter === 'ALL' ? 'all AMC customers' : `renewing within ${amcDaysFilter} days`}`,
        columns: [
          { header: 'Customer', key: 'name' },
          { header: 'Mobile', key: 'phone' },
          { header: 'Contact person', key: 'contact' },
          { header: 'Email', key: 'email', pdf: false },
          { header: 'Address', key: 'address', width: 40, pdf: false },
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
    ],
    };
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

  const duesReport = (): ReportExport => {
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
    return {
      fileBase: `stec_dues_${rangeFileTag(range)}`,
      title: 'Dues',
      period: periodLabel,
      sheets: [
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
    ],
    };
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

  const techniciansReport = (): ReportExport => {
    return {
      fileBase: `stec_technicians_${rangeFileTag(range)}`,
      title: 'Technician performance',
      period: periodLabel,
      sheets: [
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
    ],
    };
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

  const ongoingReport = (): ReportExport => {
    return {
      fileBase: `stec_ongoing_jobs_${new Date(nowMs).toISOString().slice(0, 10)}`,
      title: 'Ongoing jobs',
      period: 'As of today',
      sheets: [
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
    ],
    };
  };

  // ==========================================
  // 6. LISTS FOR THE PERIOD: enquiries, jobs, repairs, inventory, customers
  // ==========================================
  const lookups = { customers, users, products, vendors, jobs: allJobs, invoices, quotations, serialUnits, payments };
  const periodEnquiries = enquiries.filter((e) => inRange(e.createdAt, range));
  const enquirySheet = enquiriesSheet(lookups, periodEnquiries, `Enquiries logged ${periodLabel}`);
  const serviceJobsPeriod = periodJobs.filter((j) => j.type === 'SERVICE');
  const installJobsPeriod = periodJobs.filter((j) => j.type === 'INSTALLATION');
  const serviceSheet = jobsSheet(lookups, serviceJobsPeriod, 'Service jobs', `Service jobs created ${periodLabel}`);
  const installSheet = jobsSheet(lookups, installJobsPeriod, 'Installation jobs', `Installation jobs created ${periodLabel}`);
  const periodRepairs = repairTickets.filter((t) => inRange(t.createdAt, range));
  const repairSheet = repairsSheet(lookups, periodRepairs, `Repair tickets opened ${periodLabel}`);
  const boughtUnits = serialUnits.filter((u) => inRange(u.purchaseDate, range));
  const stockNowSheet = stockSummarySheet(lookups, 'Stock by product (today)');
  const boughtSheet = stockSheet(lookups, boughtUnits, `Units bought ${periodLabel}`, 'Units bought');
  const periodCustomers = customers.filter((c) => inRange(c.createdAt, range));
  const customerSheet = customersSheet(lookups, periodCustomers, `Customers added ${periodLabel}`);

  const listReport = (name: string, title: string, sheets: SheetSpec[]): ReportExport => ({
    fileBase: `stec_${name}_${rangeFileTag(range)}`,
    title,
    period: periodLabel,
    sheets,
  });
  const openStatuses = ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'AWAITING_OTP'];
  const jobTiles = (list: Job[], sheet: SheetSpec) => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile label="Jobs" icon={Wrench} value={list.length} note="Created in the period" />
      <StatTile label="Open" icon={Clock} tone="amber" value={list.filter((j) => openStatuses.includes(j.status)).length} note="Not finished yet" />
      <StatTile
        label="Finished"
        icon={CheckCircle2}
        tone="emerald"
        value={list.filter((j) => j.status === 'COMPLETED' || j.status === 'CLOSED').length}
        note="Completed or closed"
      />
      <StatTile
        label="Billed"
        icon={FileSpreadsheet}
        value={formatINR(sheet.rows.reduce((sum, r) => sum + (Number(r.billed) || 0), 0))}
        note={`Balance ${formatINR(sheet.rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0))}`}
      />
    </div>
  );

  // ==========================================
  // 7. PAYROLL (CEO only): salary for the period + incentives for finished jobs
  // ==========================================
  const payroll = useMemo(
    () => (isCeo ? computePayroll({ users, payProfiles, jobs: allJobs, workLogs, holdEvents, leaveRecords }, range) : null),
    [isCeo, users, payProfiles, allJobs, workLogs, holdEvents, leaveRecords, range]
  );
  const payrollSheet: SheetSpec | null = payroll
    ? {
        name: 'Payroll',
        title: `Payroll — salary for ${payroll.days} ${payroll.days === 1 ? 'day' : 'days'} (${formatDate(payroll.from)} to ${formatDate(payroll.to)}) + job incentives − loss of pay`,
        columns: [
          { header: 'Staff no.', key: 'code' },
          { header: 'Name', key: 'name' },
          { header: 'Role', key: 'role' },
          { header: 'Mobile', key: 'phone', pdf: false },
          { header: 'Monthly salary (₹)', key: 'monthly', type: 'money' },
          { header: 'Salary days', key: 'days', type: 'number' },
          { header: 'Salary for period (₹)', key: 'salary', type: 'money' },
          { header: 'Service jobs finished', key: 'serviceJobs', type: 'number' },
          { header: 'Per service job (₹)', key: 'serviceRate', type: 'money', pdf: false },
          { header: 'Installation jobs finished', key: 'installJobs', type: 'number' },
          { header: 'Per installation job (₹)', key: 'installRate', type: 'money', pdf: false },
          { header: 'Incentives (₹)', key: 'incentives', type: 'money' },
          { header: 'Hours worked', key: 'hours', type: 'number', pdf: false },
          { header: 'Holds raised', key: 'holds', type: 'number', pdf: false },
          { header: 'Paid leave taken', key: 'paidLeave', type: 'number' },
          { header: 'Casual leave taken', key: 'casualLeave', type: 'number' },
          { header: 'Unpaid days', key: 'unpaidDays', type: 'number' },
          { header: 'Loss of pay (₹)', key: 'deduction', type: 'money' },
          { header: 'Paid leave left', key: 'paidLeft', type: 'number', pdf: false },
          { header: 'Casual leave left', key: 'casualLeft', type: 'number', pdf: false },
          { header: 'Total pay (₹)', key: 'total', type: 'money' },
        ],
        rows: payroll.rows.map((r) => ({
          code: r.user.staffCode,
          name: r.user.name,
          role: humanize(r.user.role),
          phone: r.user.phone,
          monthly: r.monthlySalary,
          days: r.monthlySalary ? r.days : null,
          salary: r.salary,
          serviceJobs: r.serviceJobs,
          serviceRate: r.serviceIncentive,
          installJobs: r.installationJobs,
          installRate: r.installationIncentive,
          incentives: r.incentives,
          hours: r.hours,
          holds: r.holds,
          paidLeave: r.paidLeave,
          casualLeave: r.casualLeave,
          unpaidDays: r.unpaidDays,
          deduction: r.deduction,
          paidLeft: r.paidLeaveLeft,
          casualLeft: r.casualLeaveLeft,
          total: r.total,
        })),
        totalKeys: [
          'monthly',
          'salary',
          'serviceJobs',
          'installJobs',
          'incentives',
          'hours',
          'holds',
          'paidLeave',
          'casualLeave',
          'unpaidDays',
          'deduction',
          'total',
        ],
      }
    : null;
  // The leave entries behind those numbers
  const periodLeave = leaveRecords
    .filter((l) => inRange(l.from, range) || inRange(l.to, range))
    .sort((a, b) => a.from.localeCompare(b.from));
  const leaveSheet: SheetSpec = {
    name: 'Leave taken',
    title: `Leave taken ${periodLabel}`,
    columns: [
      { header: 'Staff no.', key: 'code' },
      { header: 'Name', key: 'name' },
      { header: 'Type', key: 'type' },
      { header: 'From', key: 'from', type: 'date' },
      { header: 'To', key: 'to', type: 'date' },
      { header: 'Days', key: 'days', type: 'number' },
      { header: 'Reason', key: 'reason', width: 40 },
    ],
    rows: periodLeave.map((l) => {
      const u = users.find((x) => x.id === l.userId);
      return {
        code: u?.staffCode,
        name: u?.name,
        type: leaveTypeLabel(l.type) + (l.halfDay ? ' (half day)' : ''),
        from: l.from,
        to: l.to,
        days: leaveDays(l),
        reason: l.reason,
      };
    }),
    totalKeys: ['days'],
  };
  const payrollTotals = payroll
    ? {
        salary: payroll.rows.reduce((sum, r) => sum + r.salary, 0),
        incentives: payroll.rows.reduce((sum, r) => sum + r.incentives, 0),
        total: payroll.rows.reduce((sum, r) => sum + r.total, 0),
        notSet: payroll.rows.filter((r) => !r.profile).length,
        deduction: payroll.rows.reduce((sum, r) => sum + r.deduction, 0),
        unpaidDays: payroll.rows.reduce((sum, r) => sum + r.unpaidDays, 0),
      }
    : null;

  // Download buttons: Excel, CSV, PDF of the same report
  const exportButtons = (build: () => ReportExport) => (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="hidden md:inline text-xs font-semibold text-slate-500 mr-0.5">Download</span>
      {(
        [
          ['xlsx', 'Excel', FileSpreadsheet, 'text-emerald-600'],
          ['csv', 'CSV', FileText, 'text-blue-600'],
          ['pdf', 'PDF', FileDown, 'text-rose-600'],
        ] as const
      ).map(([fmt, label, Icon, color]) => (
        <Button
          key={fmt}
          variant="outline"
          size="sm"
          onClick={() => void runExport(fmt, build())}
          className="text-[13px] font-semibold cursor-pointer"
          aria-label={`Download ${label}`}
        >
          <Icon className={`w-3.5 h-3.5 mr-1.5 ${color}`} />
          {label}
        </Button>
      ))}
    </div>
  );

  const reportBar = (left: React.ReactNode, build: () => ReportExport) => (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
      <div className="min-w-0">{left}</div>
      {exportButtons(build)}
    </div>
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
        {usesPeriod && <DateRangeFilter value={range} onChange={setRange} withTime />}
      </div>

      {/* Report tabs: scroll sideways on phones, wrap on larger screens */}
      <div className="w-full border-b border-slate-200 overflow-x-auto sm:overflow-visible pb-2">
        <div className="flex items-center gap-2 min-w-max sm:min-w-0 sm:flex-wrap">
          {(
            [
              ['REVENUE', 'Revenue', TrendingUp, undefined],
              ['OUTSTANDING', 'Dues', Building2, outstandingReport.length],
              ...(isCeo ? ([['PAYROLL', 'Payroll', Wallet, undefined]] as const) : []),
              ['ENQUIRIES', 'Enquiries', Inbox, periodEnquiries.length],
              ['SERVICE_JOBS', 'Service jobs', Wrench, serviceJobsPeriod.length],
              ['INSTALL_JOBS', 'Installation jobs', Layers, installJobsPeriod.length],
              ['ONGOING', 'Ongoing jobs', Clock, ongoingProjects.length],
              ['REPAIRS', 'Repairs', RotateCcw, periodRepairs.length],
              ['TECHNICIAN', 'Technicians', Users, undefined],
              ['INVENTORY', 'Inventory', Boxes, undefined],
              ['CUSTOMERS', 'Customers', Building2, periodCustomers.length],
              ['AMC_RENEWAL', 'AMC renewals', RefreshCw, amcCustomers.length],
            ] as const
          ).map(([id, label, Icon, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveReport(id)}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                activeReport === id
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {count !== undefined && (
                <span
                  className={`text-[11px] px-1.5 rounded-full font-mono font-bold ${
                    activeReport === id ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
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
            {exportButtons(revenueReport)}
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
            {exportButtons(amcReport)}
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
            {exportButtons(duesReport)}
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
            {exportButtons(techniciansReport)}
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
            {exportButtons(ongoingReport)}
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

      {/* ========================================================================= */}
      {/* PAYROLL (CEO only) */}
      {/* ========================================================================= */}
      {activeReport === 'PAYROLL' && payroll && payrollSheet && payrollTotals && (
        <div className="space-y-6">
          {reportBar(
            <div>
              <h2 className="text-sm font-bold text-slate-900">Payroll</h2>
              <p className="text-xs text-slate-500">
                Salary for {payroll.days} {payroll.days === 1 ? 'day' : 'days'} ({formatDate(payroll.from)} – {formatDate(payroll.to)}) + incentives for finished jobs − loss of pay
              </p>
            </div>,
            () => listReport('payroll', 'Payroll', [payrollSheet, leaveSheet])
          )}
          {payrollTotals.notSet > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
              {payrollTotals.notSet} {payrollTotals.notSet === 1 ? 'person has' : 'people have'} no salary set yet — set it in{' '}
              <strong>Settings → Salaries</strong>.
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total pay" icon={Wallet} tone="orange" value={formatINR(payrollTotals.total)} note="Salary + incentives" />
            <StatTile label="Salaries" icon={Users} value={formatINR(payrollTotals.salary)} note={`For ${payroll.days} ${payroll.days === 1 ? 'day' : 'days'}`} />
            <StatTile label="Incentives" icon={CheckCircle2} tone="emerald" value={formatINR(payrollTotals.incentives)} note="Finished jobs" />
            <StatTile
              label="Loss of pay"
              icon={AlertTriangle}
              tone="rose"
              value={formatINR(payrollTotals.deduction)}
              note={`${payrollTotals.unpaidDays} unpaid ${payrollTotals.unpaidDays === 1 ? 'day' : 'days'}`}
            />
          </div>
          <PreviewTable
            sheet={payrollSheet}
            keys={['code', 'name', 'monthly', 'salary', 'incentives', 'paidLeave', 'casualLeave', 'unpaidDays', 'deduction', 'total']}
            empty="No staff yet."
          />
          <PreviewTable sheet={leaveSheet} keys={['name', 'type', 'from', 'to', 'days', 'reason']} empty="No leave in this period." />
        </div>
      )}

      {/* ENQUIRIES */}
      {activeReport === 'ENQUIRIES' && (
        <div className="space-y-6">
          {reportBar(<h2 className="text-sm font-bold text-slate-900">Enquiries</h2>, () =>
            listReport('enquiries', 'Enquiries', [enquirySheet])
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Enquiries" icon={Inbox} value={periodEnquiries.length} note="Logged in the period" />
            <StatTile
              label="Follow-up"
              icon={Clock}
              tone="amber"
              value={periodEnquiries.filter((e) => e.status === 'FOLLOW_UP').length}
              note="Still open"
            />
            <StatTile
              label="Approved"
              icon={CheckCircle2}
              tone="emerald"
              value={periodEnquiries.filter((e) => e.status === 'APPROVED').length}
              note="Turned into jobs"
            />
            <StatTile
              label="Cancelled"
              icon={AlertTriangle}
              value={periodEnquiries.filter((e) => e.status === 'CANCELLED').length}
              note="Closed without a job"
            />
          </div>
          <PreviewTable sheet={enquirySheet} keys={['no', 'date', 'customer', 'phone', 'category', 'status', 'job']} empty="No enquiries in this period." />
        </div>
      )}

      {/* SERVICE JOBS */}
      {activeReport === 'SERVICE_JOBS' && (
        <div className="space-y-6">
          {reportBar(<h2 className="text-sm font-bold text-slate-900">Service jobs</h2>, () =>
            listReport('service_jobs', 'Service jobs', [serviceSheet])
          )}
          {jobTiles(serviceJobsPeriod, serviceSheet)}
          <PreviewTable
            sheet={serviceSheet}
            keys={['no', 'created', 'customer', 'category', 'status', 'lead', 'invoice', 'billed', 'balance']}
            empty="No service jobs in this period."
          />
        </div>
      )}

      {/* INSTALLATION JOBS */}
      {activeReport === 'INSTALL_JOBS' && (
        <div className="space-y-6">
          {reportBar(<h2 className="text-sm font-bold text-slate-900">Installation jobs</h2>, () =>
            listReport('installation_jobs', 'Installation jobs', [installSheet])
          )}
          {jobTiles(installJobsPeriod, installSheet)}
          <PreviewTable
            sheet={installSheet}
            keys={['no', 'created', 'customer', 'category', 'status', 'lead', 'invoice', 'billed', 'balance']}
            empty="No installation jobs in this period."
          />
        </div>
      )}

      {/* REPAIRS */}
      {activeReport === 'REPAIRS' && (
        <div className="space-y-6">
          {reportBar(<h2 className="text-sm font-bold text-slate-900">Repairs</h2>, () =>
            listReport('repairs', 'Repair tickets', [repairSheet])
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Tickets" icon={RotateCcw} value={periodRepairs.length} note="Opened in the period" />
            <StatTile
              label="In-house"
              icon={Wrench}
              tone="orange"
              value={periodRepairs.filter((t) => t.status === 'IN_HOUSE_REPAIR').length}
              note="Being repaired here"
            />
            <StatTile
              label="At supplier"
              icon={Clock}
              tone="blue"
              value={periodRepairs.filter((t) => t.status === 'SENT_TO_VENDOR').length}
              note="Sent for warranty"
            />
            <StatTile
              label="Back in service"
              icon={CheckCircle2}
              tone="emerald"
              value={periodRepairs.filter((t) => t.status === 'READY_TO_REINSTALL' || t.status === 'REINSTALLED').length}
              note="Ready or reinstalled"
            />
          </div>
          <PreviewTable sheet={repairSheet} keys={['no', 'created', 'customer', 'unit', 'status', 'tech']} empty="No repair tickets in this period." />
        </div>
      )}

      {/* INVENTORY */}
      {activeReport === 'INVENTORY' && (
        <div className="space-y-6">
          {reportBar(
            <div>
              <h2 className="text-sm font-bold text-slate-900">Inventory</h2>
              <p className="hidden sm:block text-xs text-slate-500">Stock by product today, and units bought in the period</p>
            </div>,
            () => listReport('inventory', 'Inventory', [stockNowSheet, boughtSheet])
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Products" icon={Boxes} value={products.length} note="In the catalogue" />
            <StatTile
              label="In stock"
              icon={Boxes}
              tone="emerald"
              value={serialUnits.filter((u) => u.status === 'IN_STOCK').length}
              note="Units today"
            />
            <StatTile label="Bought" icon={FileSpreadsheet} tone="blue" value={boughtUnits.length} note="Units in the period" />
            <StatTile
              label="Stock value"
              icon={Wallet}
              tone="orange"
              value={formatINR(stockNowSheet.rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0))}
              note="In stock, at cost"
            />
          </div>
          <PreviewTable
            sheet={stockNowSheet}
            keys={['name', 'category', 'inStock', 'allocated', 'installed', 'repair', 'value']}
            empty="No products yet."
          />
        </div>
      )}

      {/* CUSTOMERS */}
      {activeReport === 'CUSTOMERS' && (
        <div className="space-y-6">
          {reportBar(
            <div>
              <h2 className="text-sm font-bold text-slate-900">Customers</h2>
              <p className="hidden sm:block text-xs text-slate-500">Customers added in the period, with all their jobs and bills</p>
            </div>,
            () => listReport('customers', 'Customers', [customerSheet])
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Customers" icon={Users} value={periodCustomers.length} note="Added in the period" />
            <StatTile
              label="On AMC"
              icon={ShieldCheck}
              tone="emerald"
              value={periodCustomers.filter((c) => c.amcActive).length}
              note="Active contracts"
            />
            <StatTile
              label="Billed"
              icon={FileSpreadsheet}
              value={formatINR(customerSheet.rows.reduce((sum, r) => sum + (Number(r.billed) || 0), 0))}
              note="All their invoices"
            />
            <StatTile
              label="Balance"
              icon={Clock}
              tone="amber"
              value={formatINR(customerSheet.rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0))}
              note="Still to collect"
            />
          </div>
          <PreviewTable
            sheet={customerSheet}
            keys={['name', 'phone', 'gstin', 'created', 'jobs', 'billed', 'balance']}
            empty="No customers added in this period."
          />
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
