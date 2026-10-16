import React, { useMemo, useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { formatINR, formatDateTime, formatDate, humanize } from '@/lib/utils';
import { invoiceCategory, invoiceNetTotal, isCancelledInvoice } from '@/lib/invoice-status';
import {
  SERVICE_CATEGORIES,
  ServiceCategory,
  JobStatus,
  Job,
} from '@/lib/stecsecure-types';
import { DateRange, inRange, presetRange, previousRange, rangeDays } from '@/lib/date-range';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { StatTile } from '@/components/ui/stat-tile';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Boxes,
  Users,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  FileCheck2,
  Receipt,
  ArrowRight,
  Activity,
  AlertOctagon,
  Lock,
  KeyRound,
  Layers,
  Inbox,
  PieChart as PieIcon,
  BarChart3,
  DollarSign,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';

export const DashboardPage: React.FC = () => {
  const {
    currentUser,
    visibleJobs,
    jobs,
    holdEvents,
    invoices,
    payments,
    workLogs,
    enquiries,
    resolveHoldEvent,
    canResumeHold,
    isManagement,
  } = useStecSecure();

  // Hold being resumed on the server (disables its button meanwhile)
  const [resumingHoldId, setResumingHoldId] = useState<string | null>(null);

  // Date filter for the numbers and charts (opens on this financial year)
  const [range, setRange] = useState<DateRange>(() => presetRange('FY'));

  // Jobs and enquiries count in the period they were created; money in the period it was billed / received
  const periodJobs = useMemo(() => visibleJobs.filter((j) => inRange(j.createdAt, range)), [visibleJobs, range]);
  const serviceJobs = periodJobs.filter((j) => j.type === 'SERVICE');
  const installationJobs = periodJobs.filter((j) => j.type === 'INSTALLATION');
  const countBy = (list: Job[], status: JobStatus) => list.filter((j) => j.status === status).length;

  const periodEnquiries = enquiries.filter((e) => inRange(e.createdAt, range));
  const followUpEnquiriesCount = periodEnquiries.filter((e) => e.status === 'FOLLOW_UP').length;
  const approvedEnquiriesCount = periodEnquiries.filter((e) => e.status === 'APPROVED').length;
  const cancelledEnquiriesCount = periodEnquiries.filter((e) => e.status === 'CANCELLED').length;

  const periodInvoices = useMemo(() => invoices.filter((inv) => inRange(inv.date, range)), [invoices, range]);
  // Money received in the period (refunds are negative payments)
  const totalCollected = payments.filter((p) => inRange(p.date, range)).reduce((sum, p) => sum + p.amount, 0);

  const openHolds = holdEvents.filter((h) => {
    if (h.status !== 'OPEN') return false;
    if (!isManagement) {
      return visibleJobs.some((j) => j.id === h.jobId);
    }
    return true;
  });

  // Jobs finished in this period compared with the period of the same length just before it
  const completionTrend = (type: Job['type']) => {
    const prev = previousRange(range);
    if (!prev) return undefined;
    const finished = visibleJobs.filter((j) => j.type === type && (j.status === 'COMPLETED' || j.status === 'CLOSED'));
    const now = finished.filter((j) => inRange(j.completedAt || j.createdAt, range)).length;
    const before = finished.filter((j) => inRange(j.completedAt || j.createdAt, prev)).length;
    if (now === 0 && before === 0) return undefined;
    const diff = now - before;
    return { label: `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} vs previous period`, isPositive: diff >= 0 };
  };
  const serviceCompletedTrend = completionTrend('SERVICE');
  const installationCompletedTrend = completionTrend('INSTALLATION');

  // Chart 1 Data: Job Status Overview
  const chartJobs = useMemo(
    () => (currentUser?.role === 'TECHNICIAN' ? visibleJobs : jobs).filter((j) => inRange(j.createdAt, range)),
    [currentUser, visibleJobs, jobs, range]
  );
  const jobStatusData = useMemo(() => {
    const statusCounts: Record<JobStatus, number> = {
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      ON_HOLD: 0,
      AWAITING_OTP: 0,
      COMPLETED: 0,
      CLOSED: 0,
      CANCELLED: 0,
    };

    chartJobs.forEach((j) => {
      if (statusCounts[j.status] !== undefined) {
        statusCounts[j.status]++;
      }
    });

    const STATUS_CONFIG: { status: JobStatus; label: string; color: string }[] = [
      { status: 'ASSIGNED', label: 'Assigned', color: '#64748b' },
      { status: 'IN_PROGRESS', label: 'In Progress', color: '#ea580c' },
      { status: 'ON_HOLD', label: 'On Hold', color: '#e11d48' },
      { status: 'AWAITING_OTP', label: 'Awaiting sign-off', color: '#d97706' },
      { status: 'COMPLETED', label: 'Completed', color: '#10b981' },
      { status: 'CLOSED', label: 'Closed', color: '#059669' },
      { status: 'CANCELLED', label: 'Cancelled', color: '#94a3b8' },
    ];

    return STATUS_CONFIG.map((cfg) => ({
      name: cfg.label,
      status: cfg.status,
      value: statusCounts[cfg.status],
      color: cfg.color,
    })).filter((item) => item.value > 0);
  }, [chartJobs]);

  // Chart 2 Data: Revenue by Category
  const categoryRevenueData = useMemo(() => {
    const totals: Record<string, number> = {};
    SERVICE_CATEGORIES.forEach((c) => {
      totals[c] = 0;
    });

    periodInvoices.forEach((inv) => {
      const cat: ServiceCategory = invoiceCategory(inv, jobs);
      // Step 3: net of credit notes; cancelled invoices bill nothing
      totals[cat] = (totals[cat] || 0) + invoiceNetTotal(inv);
    });

    return SERVICE_CATEGORIES.map((c) => ({
      name:
        c === 'Biometric & Access Control'
          ? 'Biometric'
          : c === 'Burglar Alarm System'
          ? 'Alarm'
          : c === 'Home Automations'
          ? 'Home Auto'
          : c === 'Gate Automation'
          ? 'Gate Auto'
          : c,
      fullName: c,
      revenue: totals[c] || 0,
    }));
  }, [periodInvoices, jobs]);

  // Chart 3 Data: billed amount over time — by day for short periods, by month for long ones
  const revenueTrendData = useMemo(() => {
    const dates = periodInvoices.map((inv) => inv.date).sort();
    const spanDays =
      rangeDays(range) ??
      (dates.length ? (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000 : 0);
    const byMonth = spanDays > 62;
    const buckets = new Map<string, number>();
    [...periodInvoices]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((inv) => {
        const key = byMonth ? inv.date.slice(0, 7) : inv.date;
        buckets.set(key, (buckets.get(key) || 0) + invoiceNetTotal(inv));
      });
    return [...buckets.entries()].map(([key, revenue]) => ({
      date: key,
      displayDate: byMonth
        ? new Date(`${key}-01T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        : formatDate(key),
      revenue,
    }));
  }, [periodInvoices, range]);

  // Build live activity feed strictly filtered to user's visibility
  const activityFeed: {
    id: string;
    title: string;
    desc: string;
    time: string;
    type: 'note' | 'status' | 'invoice';
  }[] = [];

  const visibleJobIds = new Set(visibleJobs.map((j) => j.id));

  // 1. Add notes from work logs
  workLogs.forEach((wl) => {
    if (!isManagement && !visibleJobIds.has(wl.jobId)) return;
    const job = visibleJobs.find((j) => j.id === wl.jobId) || jobs.find((j) => j.id === wl.jobId);
    wl.notesLog.forEach((entry, idx) => {
      activityFeed.push({
        id: `note-${wl.id}-${idx}`,
        title: `${job?.jobNumber || 'Job'}: Field Note`,
        desc: entry.note,
        time: entry.timestamp,
        type: 'note',
      });
    });
  });

  // 2. Add invoices
  invoices.forEach((inv) => {
    if (!isManagement) {
      const isLinkedToVisibleJob = inv.linkedJobId && visibleJobIds.has(inv.linkedJobId);
      const isRaisedByMe = inv.raisedByUserId === currentUser?.id;
      if (!isLinkedToVisibleJob && !isRaisedByMe) return;
    }
    activityFeed.push({
      id: `inv-${inv.id}`,
      title: `Invoice ${inv.invoiceNo} ${isCancelledInvoice(inv) ? 'Cancelled' : 'Raised'}`,
      desc: `Total ${formatINR(inv.grandTotal)} • ${inv.paymentMode}`,
      time: inv.date + 'T12:00:00Z',
      type: 'invoice',
    });
  });

  // Sort activity feed by time descending
  activityFeed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const trendPill = (trend?: { label: string; isPositive: boolean }) =>
    trend ? (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
          trend.isPositive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}
      >
        {trend.isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
        {trend.label}
      </span>
    ) : null;

  // The six job stages, for the Service and Installation groups
  const jobStageTiles = (list: Job[], trend?: { label: string; isPositive: boolean }, installation = false) => (
    <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatTile label="Assigned" icon={Clock} value={countBy(list, 'ASSIGNED')} note="Ready to start" />
      <StatTile label="In Progress" icon={Play} tone="orange" value={countBy(list, 'IN_PROGRESS')} note="Work going on" />
      <StatTile label="On Hold" icon={AlertOctagon} tone="amber" value={countBy(list, 'ON_HOLD')} note="Timer paused" />
      <StatTile label="Awaiting sign-off" icon={KeyRound} tone="orange" value={countBy(list, 'AWAITING_OTP')} note="Customer code pending" />
      <StatTile
        label="Completed"
        icon={CheckCircle2}
        tone="emerald"
        value={countBy(list, 'COMPLETED')}
        note={installation ? 'Installed, not yet closed' : 'Finished, not yet closed'}
      />
      <StatTile
        label="Closed"
        icon={FileCheck2}
        tone="teal"
        value={countBy(list, 'CLOSED')}
        note="Signed off"
        extra={trendPill(trend)}
      />
    </div>
  );

  return (
    <div className="w-full space-y-6">
      {/* Welcome banner with the date filter */}
      <div className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-50 via-white to-amber-50/50 border border-orange-200/80 p-5 sm:p-6 shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">
              Hello, {currentUser?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-[13px] sm:text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              {currentUser?.role === 'TECHNICIAN'
                ? `You have ${visibleJobs.filter((j) => j.status !== 'CLOSED' && j.status !== 'CANCELLED').length} open job(s).`
                : "Here's how the business is doing."}
            </p>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      {/* GROUP 0: Inward Enquiry Pipeline (Entry Point of Funnel) - Hidden for Technicians */}
      {currentUser?.role !== 'TECHNICIAN' && (
        <div className="w-full p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Inbox className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Enquiries</h2>
                <p className="hidden sm:block text-xs text-slate-500">New customer requests waiting to become jobs</p>
              </div>
            </div>
            <Badge variant="orange" className="text-[13px]">
              {periodEnquiries.length} total
            </Badge>
          </div>

          <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile label="Follow-up" icon={Clock} tone="orange" value={followUpEnquiriesCount} note="Calls, surveys and estimates pending" />
            <StatTile label="Approved" icon={CheckCircle2} tone="emerald" value={approvedEnquiriesCount} note="Turned into jobs" />
            <StatTile
              label="Cancelled"
              icon={AlertTriangle}
              value={cancelledEnquiriesCount}
              note="Closed without a job"
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      )}

      {/* Separate KPI Groupings for Service Jobs vs Installation Jobs */}
      <div className="w-full space-y-4">
        {/* GROUP 1: Service Department Overview */}
        <div className="w-full p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Wrench className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Service jobs</h2>
            </div>
            <Badge variant="orange" className="text-[13px]">
              {serviceJobs.length} total
            </Badge>
          </div>
          {jobStageTiles(serviceJobs, serviceCompletedTrend)}
        </div>

        {/* GROUP 2: Installation Department Overview */}
        <div className="w-full p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Installation jobs</h2>
            </div>
            <Badge variant="orange" className="text-[13px]">
              {installationJobs.length} total
            </Badge>
          </div>
          {jobStageTiles(installationJobs, installationCompletedTrend, true)}
        </div>
      </div>

      {/* EXECUTIVE ANALYTICS SECTION: 3 CHARTS IN RESPONSIVE GRID (Placed below KPIs, above Live Activity Feed) */}
      {currentUser?.role !== 'TECHNICIAN' && (
        <div className="w-full space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                Business overview
              </h2>
              <p className="hidden sm:block text-xs text-slate-500">
                Jobs by stage, revenue by category and billing over time
              </p>
            </div>
            <Badge variant="outline" className="text-[13px] self-start sm:self-auto font-mono bg-white text-slate-700">
              Collected: <strong className="ml-1 text-slate-900 font-bold">{formatINR(totalCollected)}</strong>
            </Badge>
          </div>

          {/* Responsive 2-column grid for Job Status Donut and Category Revenue Bar */}
          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Job Status Overview (Donut Chart) */}
            <Card className="border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm text-slate-900 flex items-center gap-2 font-display font-bold">
                    <PieIcon className="w-4 h-4 text-orange-600" />
                    Job Status Overview
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Jobs created in this period, by stage
                  </p>
                </div>
                <Badge variant="orange" className="text-[13px] font-mono">
                  {chartJobs.length} jobs
                </Badge>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-[260px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={jobStatusData}
                        cx="50%"
                        cy="45%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {jobStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [
                          `${value} jobs (${Math.round(((Number(value) || 0) / (chartJobs.length || 1)) * 100)}%)`,
                          name,
                        ]}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          borderRadius: '8px',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        formatter={(val: string) => (
                          <span className="text-[13px] text-slate-700 font-medium">{val}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Chart 2: Revenue by Category (Bar Chart) */}
            <Card className="border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-shadow">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm text-slate-900 flex items-center gap-2 font-display font-bold">
                    <BarChart3 className="w-4 h-4 text-orange-600" />
                    Revenue by Category
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Billed amount per category
                  </p>
                </div>
                <Badge variant="outline" className="text-[13px] font-mono text-emerald-700 bg-emerald-50 border-emerald-200">
                  {formatINR(periodInvoices.reduce((sum, inv) => sum + invoiceNetTotal(inv), 0))}
                </Badge>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryRevenueData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                      />
                      <Tooltip
                        formatter={(value: any) => [formatINR(Number(value) || 0), 'Revenue Billed']}
                        labelFormatter={(label, payload) => {
                          const item = payload && payload[0]?.payload;
                          return item ? item.fullName : label;
                        }}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#e2e8f0',
                          borderRadius: '8px',
                          fontSize: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                      />
                      <Bar
                        dataKey="revenue"
                        name="Revenue Billed"
                        fill="#ea580c"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart 3: Revenue Trend Over Time (Full-Width Line Chart) */}
          <Card className="border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-shadow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm text-slate-900 flex items-center gap-2 font-display font-bold">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Billing over time
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Billed amount by invoice date
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[13px] font-mono text-orange-700 bg-orange-50 border-orange-200">
                  {periodInvoices.length} invoices
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="displayDate"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatINR(Number(value) || 0), 'Invoice Value']}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Invoice Value"
                      stroke="#ea580c"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#c2410c' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Critical Alerts: Open Holds with Direct Resolution */}
      {openHolds.length > 0 && (
        <Card className="w-full border-amber-300 bg-amber-50/80 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
                <CardTitle className="text-amber-900 text-base font-bold font-display">
                  Critical Hold Alerts ({openHolds.length} Active)
                </CardTitle>
              </div>
              <Badge variant="warning">Action Required</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {openHolds.map((hold) => {
              const job = jobs.find((j) => j.id === hold.jobId);
              return (
                <div
                  key={hold.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-white border border-amber-200 gap-3 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-orange-600 font-mono">
                        {job?.jobNumber || hold.jobId}
                      </span>
                      <Badge variant="outline" className="text-[11px]">
                        {job?.category}
                      </Badge>
                      <span className="text-[13px] text-slate-900 font-semibold">{job?.productModel}</span>
                    </div>
                    <p className="text-[13px] text-amber-900 mt-1 font-medium">{hold.reason}</p>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Raised at: {formatDateTime(hold.raisedAt)}
                    </div>
                  </div>

                  {job && canResumeHold(job, hold) ? (
                    <Button
                      size="sm"
                      variant="success"
                      disabled={resumingHoldId === hold.id}
                      onClick={async () => {
                        setResumingHoldId(hold.id);
                        try {
                          await resolveHoldEvent(hold.id);
                          toast.success(`Hold cleared on ${job?.jobNumber}. Work resumed.`);
                        } catch (err) {
                          toast.error(errorMessage(err));
                        } finally {
                          setResumingHoldId(null);
                        }
                      }}
                      className="shrink-0 text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Resume Work
                    </Button>
                  ) : (
                    <span className="text-[13px] text-amber-800 font-medium italic">
                      On Hold &bull; Awaiting Team Lead to resume
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Two Column Grid: Today's Live Activity Feed & Quick Live Job Queue */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Activity Feed */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-slate-900 flex items-center gap-2 font-display font-bold">
              <Activity className="w-4 h-4 text-orange-600" />
              Recent activity
            </CardTitle>

          </CardHeader>
          <CardContent className="space-y-3">
            {activityFeed.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 hover:border-orange-200 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0 mt-0.5">
                  {item.type === 'invoice' ? (
                    <Receipt className="w-3.5 h-3.5" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-slate-900 truncate">{item.title}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {formatDateTime(item.time)}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-600 line-clamp-2">{item.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Live Job Roster Highlights */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base text-slate-900 flex items-center gap-2 font-display font-bold">
              <Wrench className="w-4 h-4 text-orange-600" />
              Latest jobs
            </CardTitle>
            <span className="text-[13px] text-slate-500 font-medium">{visibleJobs.length} active jobs</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleJobs.slice(0, 4).map((job) => (
              <div
                key={job.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between hover:border-orange-200 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-orange-600 font-mono">{job.jobNumber}</span>
                    <Badge variant="outline" className="text-[11px]">
                      {job.category}
                    </Badge>
                  </div>
                  <div className="text-[13px] text-slate-900 font-semibold">{job.productModel}</div>
                  <div className="text-xs text-slate-500 truncate max-w-xs">{job.problemReported}</div>
                </div>

                <Badge
                  variant={
                    job.status === 'ON_HOLD'
                      ? 'warning'
                      : job.status === 'AWAITING_OTP'
                      ? 'orange'
                      : 'outline'
                  }
                  className="text-[11px] shrink-0"
                >
                  {humanize(job.status)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
