import React, { useState, useMemo } from 'react';
import { localDateISO } from '@/lib/numbering';
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
import { formatINR, formatDate, formatDateTime } from '@/lib/utils';
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

// Helper for client-side CSV download
function exportToCSV(filename: string, headers: string[], rows: (string | number | undefined | null)[][]) {
  const csvContent = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${localDateISO()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${filename}.csv`);
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ onNavigateToJob }) => {
  const { jobs: allJobs, visibleJobs, currentUser, customers, invoices, payments, users, holdEvents } = useStecSecure();
  const jobs = currentUser?.role === 'TECHNICIAN' ? visibleJobs : allJobs;
  const [activeReport, setActiveReport] = useState<ReportTab>('REVENUE');
  const [inspectedJob, setInspectedJob] = useState<Job | null>(null);

  // Filters for AMC Renewal Report
  const [amcDaysFilter, setAmcDaysFilter] = useState<'30' | '60' | '90' | 'ALL'>('60');

  // Filters for Revenue Report
  const [revenueTypeFilter, setRevenueTypeFilter] = useState<'ALL' | 'SERVICE' | 'INSTALLATION'>('ALL');

  // Filter for Ongoing projects
  const [ongoingDeptFilter, setOngoingDeptFilter] = useState<'ALL' | 'SERVICE' | 'INSTALLATION'>('ALL');

  const nowMs = new Date().getTime();

  // ==========================================
  // 1. REVENUE REPORT COMPUTATIONS
  // ==========================================
  const revenueByCategory = useMemo(() => {
    return SERVICE_CATEGORIES.map((cat) => {
      const catJobs = jobs.filter(
        (j) =>
          j.category === cat &&
          (revenueTypeFilter === 'ALL' || j.type === revenueTypeFilter)
      );

      let billed = 0;
      let collected = 0;

      catJobs.forEach((job) => {
        const inv = invoices.find((i) => i.linkedJobId === job.id);
        if (inv) {
          billed += inv.grandTotal;
          collected += inv.amountPaid;
        } else if (job.serviceAmount) {
          billed += job.serviceAmount;
          if (job.status === 'CLOSED') {
            collected += job.serviceAmount;
          }
        }
      });

      return {
        category: cat,
        jobsCount: catJobs.length,
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
      };
    });
  }, [jobs, invoices, revenueTypeFilter]);

  const totalRevenueBilled = revenueByCategory.reduce((sum, c) => sum + c.billed, 0);
  const totalRevenueCollected = revenueByCategory.reduce((sum, c) => sum + c.collected, 0);

  const handleDownloadRevenueCSV = () => {
    const headers = ['Category', 'Jobs Count', 'Billed Revenue (INR)', 'Collected Revenue (INR)', 'Outstanding (INR)'];
    const rows = revenueByCategory.map((r) => [
      r.category,
      r.jobsCount,
      r.billed.toFixed(2),
      r.collected.toFixed(2),
      r.outstanding.toFixed(2),
    ]);
    exportToCSV('stec_revenue_report', headers, rows);
  };

  // ==========================================
  // 2. AMC RENEWAL REPORT COMPUTATIONS
  // ==========================================
  const amcCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        const hasAmcJob = jobs.some((j) => j.customerNumber === c.id && j.customerStatus === 'AMC');
        return c.amcActive || Boolean(c.amcRenewalDate) || hasAmcJob;
      })
      .map((c) => {
        let renewalDate = c.amcRenewalDate || '2026-10-30';
        const renewalMs = new Date(renewalDate).getTime();
        const diffDays = Math.ceil((renewalMs - nowMs) / (1000 * 60 * 60 * 24));
        const amcJobs = jobs.filter((j) => j.customerNumber === c.id && j.customerStatus === 'AMC');
        const latestJob = amcJobs[amcJobs.length - 1];

        return {
          customer: c,
          renewalDate,
          daysRemaining: diffDays,
          status: diffDays < 0 ? 'EXPIRED' : diffDays <= 30 ? 'CRITICAL_30D' : diffDays <= 60 ? 'UPCOMING_60D' : 'ACTIVE',
          latestCategory: latestJob?.category || 'CCTV',
          amcJobsCount: amcJobs.length,
        };
      })
      .filter((item) => {
        if (amcDaysFilter === '30') return item.daysRemaining <= 30;
        if (amcDaysFilter === '60') return item.daysRemaining <= 60;
        if (amcDaysFilter === '90') return item.daysRemaining <= 90;
        return true;
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [customers, jobs, amcDaysFilter, nowMs]);

  const handleDownloadAmcCSV = () => {
    const headers = ['Customer Name', 'Phone', 'Contact Person', 'Renewal Date', 'Days Remaining', 'AMC Status', 'Primary Category'];
    const rows = amcCustomers.map((a) => [
      a.customer.name,
      a.customer.phone,
      a.customer.contactPerson || '-',
      a.renewalDate,
      a.daysRemaining,
      a.status,
      a.latestCategory,
    ]);
    exportToCSV('stec_amc_renewal_report', headers, rows);
  };

  // ==========================================
  // 3. OUTSTANDING DUES & COLLECTIONS REPORT
  // ==========================================
  const outstandingReport = useMemo(() => {
    return customers
      .map((cust) => {
        const custInvoices = invoices.filter((i) => i.customerNumber === cust.id);
        const unpaidInvoices = custInvoices.filter((i) => i.balanceDue > 0);
        const totalBilled = custInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
        const totalPaid = custInvoices.reduce((sum, i) => sum + i.amountPaid, 0);
        const balanceDue = custInvoices.reduce((sum, i) => sum + i.balanceDue, 0);

        let oldestUnpaidDate = '-';
        let maxOverdueDays = 0;

        if (unpaidInvoices.length > 0) {
          const sortedInvs = [...unpaidInvoices].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          oldestUnpaidDate = sortedInvs[0].date;
          maxOverdueDays = Math.max(
            0,
            Math.floor((nowMs - new Date(oldestUnpaidDate).getTime()) / (1000 * 60 * 60 * 24))
          );
        }

        return {
          customer: cust,
          invoicesCount: custInvoices.length,
          unpaidInvoicesCount: unpaidInvoices.length,
          totalBilled,
          totalPaid,
          balanceDue,
          oldestUnpaidDate,
          maxOverdueDays,
          overdueCategory:
            maxOverdueDays > 30 ? '> 30 Days' : maxOverdueDays > 15 ? '15 - 30 Days' : maxOverdueDays > 0 ? '< 15 Days' : 'Current',
        };
      })
      .filter((entry) => entry.balanceDue > 0)
      .sort((a, b) => b.balanceDue - a.balanceDue);
  }, [customers, invoices, nowMs]);

  const totalOutstandingReportDue = outstandingReport.reduce((sum, o) => sum + o.balanceDue, 0);

  const handleDownloadOutstandingCSV = () => {
    const headers = [
      'Customer Name',
      'Phone',
      'Pending Invoices',
      'Total Billed (INR)',
      'Total Paid (INR)',
      'Balance Due (INR)',
      'Oldest Unpaid Invoice Date',
      'Days Overdue',
      'Overdue Category',
    ];
    const rows = outstandingReport.map((o) => [
      o.customer.name,
      o.customer.phone,
      o.unpaidInvoicesCount,
      o.totalBilled.toFixed(2),
      o.totalPaid.toFixed(2),
      o.balanceDue.toFixed(2),
      o.oldestUnpaidDate,
      o.maxOverdueDays,
      o.overdueCategory,
    ]);
    exportToCSV('stec_outstanding_dues_report', headers, rows);
  };

  // ==========================================
  // 4. TECHNICIAN PERFORMANCE REPORT
  // ==========================================
  const technicianStats = useMemo(() => {
    const techs = users.filter((u) => u.role === 'TECHNICIAN');

    return techs.map((tech) => {
      const assignedJobs = jobs.filter(
        (j) => j.teamLeadUserId === tech.id || j.assignedTeam?.includes(tech.id)
      );
      const completedJobs = assignedJobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CLOSED');
      const activeJobs = assignedJobs.filter((j) => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED');
      const techHolds = holdEvents.filter((h) => h.raisedByUserId === tech.id);

      // Average completion time in hours mock/calc
      const avgCompletionHours =
        completedJobs.length > 0
          ? Math.round(
              completedJobs.reduce((sum, j) => {
                if (j.totalDurationSeconds) {
                  return sum + Math.max(1, j.totalDurationSeconds / 3600);
                }
                const start = new Date(j.timerStartedAt || j.createdAt).getTime();
                const end = new Date(j.completedAt || j.createdAt).getTime();
                const hours = Math.max(1.5, (end - start) / (1000 * 60 * 60));
                return sum + hours;
              }, 0) / completedJobs.length
            )
          : 0;

      const completionRate =
        assignedJobs.length > 0
          ? Math.round((completedJobs.length / assignedJobs.length) * 100)
          : 0;

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
  }, [users, jobs, holdEvents]);

  const handleDownloadTechnicianCSV = () => {
    const headers = [
      'Technician Name',
      'Phone',
      'Total Assigned Jobs',
      'Completed Jobs',
      'Active In-Progress',
      'Holds Raised',
      'Avg Completion (Hours)',
      'Completion Rate (%)',
    ];
    const rows = technicianStats.map((t) => [
      t.tech.name,
      t.tech.phone,
      t.totalAssigned,
      t.completed,
      t.active,
      t.holdsRaised,
      t.avgCompletionHours,
      `${t.completionRate}%`,
    ]);
    exportToCSV('stec_technician_performance_report', headers, rows);
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
        const cust = customers.find((c) => c.id === j.customerNumber);
        const lead = users.find((u) => u.id === j.teamLeadUserId);
        const startMs = new Date(j.timerStartedAt || j.createdAt).getTime();
        const daysElapsed = Math.max(1, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)));

        return {
          job: j,
          customerName: cust?.name || j.customerNumber,
          customerPhone: cust?.phone || '-',
          leadName: lead?.name || 'Unassigned',
          daysElapsed,
        };
      })
      .sort((a, b) => b.daysElapsed - a.daysElapsed);
  }, [jobs, customers, users, ongoingDeptFilter, nowMs]);

  const handleDownloadOngoingCSV = () => {
    const headers = [
      'Job Number',
      'Job Type',
      'Customer Name',
      'Category',
      'Product Model',
      'Team Lead',
      'Started Date',
      'Days Elapsed',
      'Status Stage',
      'Scope / Problem',
    ];
    const rows = ongoingProjects.map((p) => [
      p.job.jobNumber,
      p.job.type,
      p.customerName,
      p.job.category,
      p.job.productModel,
      p.leadName,
      formatDate(p.job.timerStartedAt || p.job.createdAt),
      p.daysElapsed,
      p.job.status.replace('_', ' '),
      p.job.problemReported,
    ]);
    exportToCSV('stec_ongoing_projects_report', headers, rows);
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="orange" className="text-xs">
              <BarChart3 className="w-3.5 h-3.5 text-orange-600" />
              Executive Analytics
            </Badge>
            <span className="text-xs text-slate-500 font-medium">
              Real-time Business & Dispatch Telemetry
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
            Reports & Operational Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Exportable audits for revenue, AMC contract renewals, debtor dues, field engineer metrics, and active projects
          </p>
        </div>
      </div>

      {/* 5 Dedicated Report Navigation Tabs */}
      <div className="w-full border-b border-slate-200 overflow-x-auto pb-2">
        <div className="flex items-center gap-2 min-w-max">
          <button
            type="button"
            onClick={() => setActiveReport('REVENUE')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'REVENUE'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>1. Revenue Report</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('AMC_RENEWAL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'AMC_RENEWAL'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>2. AMC Renewal Report</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeReport === 'AMC_RENEWAL' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {amcCustomers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('OUTSTANDING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'OUTSTANDING'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>3. Outstanding Dues Report</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeReport === 'OUTSTANDING' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {outstandingReport.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('TECHNICIAN')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'TECHNICIAN'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>4. Technician Performance</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReport('ONGOING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 ${
              activeReport === 'ONGOING'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>5. Ongoing Projects</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-700">Filter Department:</span>
              <div className="flex items-center gap-1.5">
                {(['ALL', 'SERVICE', 'INSTALLATION'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRevenueTypeFilter(mode)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      revenueTypeFilter === mode
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {mode === 'ALL' ? 'All Departments' : mode === 'SERVICE' ? 'Service Jobs' : 'Installation Projects'}
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadRevenueCSV}
              className="text-xs font-semibold cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-orange-600" />
              Download CSV
            </Button>
          </div>

          {/* Revenue KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] uppercase font-bold text-slate-500">Total Billed Revenue</div>
                <div className="text-2xl font-bold text-slate-900 font-mono">{formatINR(totalRevenueBilled)}</div>
                <p className="text-[11px] text-slate-500">Across 6 service categories</p>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50/70 shadow-sm">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] uppercase font-bold text-orange-900">Total Realized (Collected)</div>
                <div className="text-2xl font-bold text-orange-900 font-mono">{formatINR(totalRevenueCollected)}</div>
                <p className="text-[11px] text-orange-700">Actual collections received</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/70 shadow-sm">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] uppercase font-bold text-amber-900">Outstanding Balance</div>
                <div className="text-2xl font-bold text-amber-900 font-mono">
                  {formatINR(Math.max(0, totalRevenueBilled - totalRevenueCollected))}
                </div>
                <p className="text-[11px] text-amber-700">Unsettled work & invoices</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart & Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border-slate-200 bg-white shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Revenue Comparison by Category (Billed vs Collected)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByCategory} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="category"
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip formatter={(value: any) => [formatINR(Number(value)), '']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="billed" name="Billed (₹)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="collected" name="Collected (₹)" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900">Job Count Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {revenueByCategory.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-800 font-medium truncate max-w-[170px]">{item.category}</span>
                      <span className="text-slate-500 font-mono font-semibold">{item.jobsCount} jobs</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{
                          width: `${Math.max(8, Math.round((item.jobsCount / Math.max(jobs.length, 1)) * 100))}%`,
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
                Detailed Revenue Breakdown by Vertical
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-700">Filter Expiry Window:</span>
              <div className="flex items-center gap-1.5">
                {(['30', '60', '90', 'ALL'] as const).map((window) => (
                  <button
                    key={window}
                    type="button"
                    onClick={() => setAmcDaysFilter(window)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      amcDaysFilter === window
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {window === 'ALL' ? 'All AMC Accounts' : `Expiring in ${window} Days`}
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAmcCSV}
              className="text-xs font-semibold cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-orange-600" />
              Download CSV
            </Button>
          </div>

          <div className="p-4 rounded-xl bg-orange-50/60 border border-orange-200 text-xs text-orange-900">
            <strong>CEO Action Dashboard:</strong> Showing AMC contract accounts sorted by nearest renewal date. Call these clients before their maintenance contracts expire to secure renewals.
          </div>

          {/* AMC Accounts Table */}
          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Contract Accounts ({amcCustomers.length} Records)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Customer Name</th>
                    <th className="p-3">Contact Person</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Primary Equipment</th>
                    <th className="p-3">Renewal Date</th>
                    <th className="p-3 text-center">Days Remaining</th>
                    <th className="p-3 text-center">Urgency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {amcCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No AMC contracts expiring within the selected timeframe.
                      </td>
                    </tr>
                  ) : (
                    amcCustomers.map((item) => (
                      <tr key={item.customer.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{item.customer.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.customer.id}</div>
                        </td>
                        <td className="p-3 text-slate-700">{item.customer.contactPerson || '-'}</td>
                        <td className="p-3 font-mono text-slate-600">{item.customer.phone}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px]">
                            {item.latestCategory}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-900">
                          {formatDate(item.renewalDate)}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {item.daysRemaining < 0 ? (
                            <span className="text-rose-600">Expired {Math.abs(item.daysRemaining)}d ago</span>
                          ) : (
                            <span>{item.daysRemaining} days</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {item.daysRemaining < 0 ? (
                            <Badge variant="danger" className="text-[10px]">
                              EXPIRED
                            </Badge>
                          ) : item.daysRemaining <= 30 ? (
                            <Badge variant="warning" className="text-[10px]">
                              URGENT (&le;30D)
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              UPCOMING
                            </Badge>
                          )}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Accounts Receivable Aging & Debtor Audit
              </h2>
              <p className="text-[11px] text-slate-500">
                Sorted by highest outstanding balance and overdue aging
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOutstandingCSV}
              className="text-xs font-semibold cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-orange-600" />
              Download CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-rose-200 bg-rose-50/60 shadow-sm">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] uppercase font-bold text-rose-800">Total Uncollected Balance</div>
                <div className="text-2xl font-bold text-rose-800 font-mono">
                  {formatINR(totalOutstandingReportDue)}
                </div>
                <p className="text-[11px] text-rose-700">Across {outstandingReport.length} clients</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4 space-y-1">
                <div className="text-[10px] uppercase font-bold text-slate-500">Overdue Recovery Strategy</div>
                <div className="text-xs text-slate-600 pt-1">
                  Clients past 15 days require direct management follow-up before initiating further job dispatches or parts warranty allocations.
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Debtor Ledger ({outstandingReport.length} Accounts)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Customer Name</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-center">Unpaid Invoices</th>
                    <th className="p-3 text-right">Total Invoiced</th>
                    <th className="p-3 text-right">Collected</th>
                    <th className="p-3 text-right font-bold text-slate-900">Balance Due (INR)</th>
                    <th className="p-3 text-center">Oldest Unpaid</th>
                    <th className="p-3 text-center">Aging Bracket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outstandingReport.map((row) => (
                    <tr key={row.customer.id} className="hover:bg-slate-50/80">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{row.customer.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{row.customer.id}</div>
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
                      <td className="p-3 text-center font-mono text-[11px] text-slate-500">
                        {row.oldestUnpaidDate !== '-' ? formatDate(row.oldestUnpaidDate) : '-'}
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
                          className="text-[10px]"
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Field Technician Performance & Dispatch Efficiency
              </h2>
              <p className="text-[11px] text-slate-500">
                Comparative metrics across job completion times, active workloads, and obstacles encountered
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTechnicianCSV}
              className="text-xs font-semibold cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-orange-600" />
              Download CSV
            </Button>
          </div>

          {/* Comparative Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {technicianStats.map((t) => (
              <Card key={t.tech.id} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{t.tech.name}</h3>
                      <div className="text-[10px] text-slate-500">{t.tech.phone}</div>
                    </div>
                    <Badge variant="orange" className="text-[10px]">
                      {t.completionRate}% Done
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[9px] uppercase text-slate-500 font-bold">Completed</div>
                      <div className="font-bold text-slate-900 font-mono text-base">{t.completed}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-orange-50/70 border border-orange-100">
                      <div className="text-[9px] uppercase text-orange-800 font-bold">Active Jobs</div>
                      <div className="font-bold text-orange-800 font-mono text-base">{t.active}</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 flex justify-between pt-1">
                    <span>Avg Completion: <strong className="text-slate-900">{t.avgCompletionHours} hrs</strong></span>
                    <span>Holds Raised: <strong className="text-amber-800">{t.holdsRaised}</strong></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Detailed Table */}
          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Comparative Engineer Roster
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Technician</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-center">Total Assigned</th>
                    <th className="p-3 text-center">Completed</th>
                    <th className="p-3 text-center">Active Now</th>
                    <th className="p-3 text-center">Holds Raised</th>
                    <th className="p-3 text-center">Avg Turnaround</th>
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
                      <td className="p-3 text-center font-mono">{row.avgCompletionHours} hrs</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {row.completionRate}%
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-700">Filter Department:</span>
              <div className="flex items-center gap-1.5">
                {(['ALL', 'SERVICE', 'INSTALLATION'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOngoingDeptFilter(mode)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      ongoingDeptFilter === mode
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {mode === 'ALL' ? 'All Operations' : mode === 'SERVICE' ? 'Service Jobs' : 'Installation Projects'}
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOngoingCSV}
              className="text-xs font-semibold cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-orange-600" />
              Download CSV
            </Button>
          </div>

          <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Live Active Operations ({ongoingProjects.length} Tasks in Progress / Hold)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Job ID</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Category & Hardware</th>
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
                        No ongoing projects currently active in the selected department.
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
                          <Badge variant={item.job.type === 'SERVICE' ? 'default' : 'secondary'} className="text-[10px] rounded">
                            {item.job.type}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{item.customerName}</div>
                          <div className="text-[10px] text-slate-500">{item.customerPhone}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-slate-900 font-medium">{item.job.category}</div>
                          <div className="text-[10px] text-slate-500">{item.job.productModel}</div>
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
                            className="text-[10px] rounded"
                          >
                            {item.job.status.replace('_', ' ')}
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
