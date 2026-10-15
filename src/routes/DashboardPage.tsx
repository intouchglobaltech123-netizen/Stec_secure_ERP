import React, { useMemo, useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { formatINR, formatDateTime, formatDate } from '@/lib/utils';
import { invoiceNetTotal, isCancelledInvoice } from '@/lib/invoice-status';
import {
  SERVICE_CATEGORIES,
  ServiceCategory,
  JobStatus,
} from '@/lib/stecsecure-types';
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
    serialUnits,
    invoices,
    workLogs,
    enquiries,
    resolveHoldEvent,
    canResolveHold,
    canResumeHold,
    isManagement,
  } = useStecSecure();

  // Hold being resumed on the server (disables its button meanwhile)
  const [resumingHoldId, setResumingHoldId] = useState<string | null>(null);

  const serviceJobs = visibleJobs.filter((j) => j.type === 'SERVICE');
  const installationJobs = visibleJobs.filter((j) => j.type === 'INSTALLATION');

  const followUpEnquiriesCount = enquiries.filter((e) => e.status === 'FOLLOW_UP').length;
  const approvedEnquiriesCount = enquiries.filter((e) => e.status === 'APPROVED').length;
  const cancelledEnquiriesCount = enquiries.filter((e) => e.status === 'CANCELLED').length;

  const openHolds = holdEvents.filter((h) => {
    if (h.status !== 'OPEN') return false;
    if (!isManagement) {
      return visibleJobs.some((j) => j.id === h.jobId);
    }
    return true;
  });
  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);

  // Computed trend indicator for Service completed/closed jobs
  const serviceCompletedTrend = useMemo(() => {
    const completedList = serviceJobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CLOSED');
    if (completedList.length < 2) return undefined;
    const timestamps = completedList
      .map((j) => new Date(j.completedAt || j.createdAt).getTime())
      .filter((t) => !isNaN(t));
    if (!timestamps.length) return undefined;
    const maxTime = Math.max(...timestamps);
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const thisWeek = completedList.filter((j) => {
      const t = new Date(j.completedAt || j.createdAt).getTime();
      return t >= maxTime - oneWeekMs;
    }).length;

    const lastWeek = completedList.filter((j) => {
      const t = new Date(j.completedAt || j.createdAt).getTime();
      return t >= maxTime - 2 * oneWeekMs && t < maxTime - oneWeekMs;
    }).length;

    if (lastWeek === 0 && thisWeek === 0) return undefined;
    if (lastWeek === 0) return { label: `+${thisWeek} new`, isPositive: true };

    const diffPct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    return {
      label: `${diffPct >= 0 ? '+' : ''}${diffPct}% vs last week`,
      isPositive: diffPct >= 0,
    };
  }, [serviceJobs]);

  // Computed trend indicator for Installation completed/closed jobs
  const installationCompletedTrend = useMemo(() => {
    const completedList = installationJobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CLOSED');
    if (completedList.length < 2) return undefined;
    const timestamps = completedList
      .map((j) => new Date(j.completedAt || j.createdAt).getTime())
      .filter((t) => !isNaN(t));
    if (!timestamps.length) return undefined;
    const maxTime = Math.max(...timestamps);
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const thisWeek = completedList.filter((j) => {
      const t = new Date(j.completedAt || j.createdAt).getTime();
      return t >= maxTime - oneWeekMs;
    }).length;

    const lastWeek = completedList.filter((j) => {
      const t = new Date(j.completedAt || j.createdAt).getTime();
      return t >= maxTime - 2 * oneWeekMs && t < maxTime - oneWeekMs;
    }).length;

    if (lastWeek === 0 && thisWeek === 0) return undefined;
    if (lastWeek === 0) return { label: `+${thisWeek} new`, isPositive: true };

    const diffPct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    return {
      label: `${diffPct >= 0 ? '+' : ''}${diffPct}% vs last week`,
      isPositive: diffPct >= 0,
    };
  }, [installationJobs]);

  // Chart 1 Data: Job Status Overview
  const jobStatusData = useMemo(() => {
    const targetJobs = currentUser?.role === 'TECHNICIAN' ? visibleJobs : jobs;
    const statusCounts: Record<JobStatus, number> = {
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      ON_HOLD: 0,
      AWAITING_OTP: 0,
      COMPLETED: 0,
      CLOSED: 0,
      CANCELLED: 0,
    };

    targetJobs.forEach((j) => {
      if (statusCounts[j.status] !== undefined) {
        statusCounts[j.status]++;
      }
    });

    const STATUS_CONFIG: { status: JobStatus; label: string; color: string }[] = [
      { status: 'ASSIGNED', label: 'Assigned', color: '#64748b' },
      { status: 'IN_PROGRESS', label: 'In Progress', color: '#ea580c' },
      { status: 'ON_HOLD', label: 'On Hold', color: '#e11d48' },
      { status: 'AWAITING_OTP', label: 'Awaiting OTP', color: '#d97706' },
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
  }, [currentUser, visibleJobs, jobs]);

  // Chart 2 Data: Revenue by Category
  const categoryRevenueData = useMemo(() => {
    const totals: Record<string, number> = {};
    SERVICE_CATEGORIES.forEach((c) => {
      totals[c] = 0;
    });

    invoices.forEach((inv) => {
      let cat: ServiceCategory = 'CCTV';
      if (inv.linkedJobId) {
        const job = jobs.find((j) => j.id === inv.linkedJobId);
        if (job?.category) cat = job.category;
      } else {
        const text = (inv.lineItems || []).map((l) => `${l.itemName} ${l.description}`).join(' ').toLowerCase();
        if (text.includes('biometric') || text.includes('face') || text.includes('essl')) {
          cat = 'Biometric & Access Control';
        } else if (text.includes('barrier') || text.includes('gate') || text.includes('swing')) {
          cat = 'Gate Automation';
        } else if (text.includes('intercom') || text.includes('door phone') || text.includes('vdp')) {
          cat = 'Intercom';
        } else if (text.includes('alarm') || text.includes('burglar')) {
          cat = 'Burglar Alarm System';
        } else if (text.includes('home') || text.includes('automation') || text.includes('smart switch')) {
          cat = 'Home Automations';
        }
      }
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
  }, [invoices, jobs]);

  // Chart 3 Data: Revenue Trend Over Time
  const revenueTrendData = useMemo(() => {
    const sorted = [...invoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const dateMap = new Map<string, number>();
    sorted.forEach((inv) => {
      const key = inv.date;
      dateMap.set(key, (dateMap.get(key) || 0) + invoiceNetTotal(inv));
    });

    const list: { date: string; displayDate: string; revenue: number }[] = [];
    dateMap.forEach((revenue, date) => {
      list.push({
        date,
        displayDate: formatDate(date),
        revenue,
      });
    });

    return list;
  }, [invoices]);

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

  return (
    <div className="w-full space-y-6">
      {/* Welcome Hero Banner */}
      <div className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-50 via-white to-amber-50/50 border border-orange-200/80 p-6 shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="orange" className="text-xs">
                <Activity className="w-3 h-3 text-orange-600" />
                Operations Active
              </Badge>
              <span className="text-xs text-slate-500 font-medium">
                User: <strong className="text-slate-900">{currentUser?.name}</strong> ({currentUser?.role})
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
              S Tec Secure Operations Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              Real-time dispatch telemetry across separated Service & Maintenance and Turnkey Installation operations.
            </p>
          </div>

          {currentUser?.role === 'TECHNICIAN' ? (
            <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-200 px-4 py-2.5 rounded-xl shadow-2xs shrink-0">
              <ShieldCheck className="w-5 h-5 text-orange-600" />
              <div>
                <div className="text-xs text-orange-900 font-bold">Technician View</div>
                <div className="text-[11px] text-slate-600">
                  Filtered to your {visibleJobs.length} assigned tasks
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-200 px-4 py-2.5 rounded-xl shadow-2xs shrink-0">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <div>
                <div className="text-xs text-orange-900 font-bold">Executive Console</div>
                <div className="text-[11px] text-slate-600">
                  Full operations, hold authority & billing view
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GROUP 0: Inward Enquiry Pipeline (Entry Point of Funnel) - Hidden for Technicians */}
      {currentUser?.role !== 'TECHNICIAN' && (
        <div className="w-full p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Inbox className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                  Inward Enquiry Pipeline
                </h2>
                <p className="text-[11px] text-slate-500">
                  Top-of-funnel customer intake converting into Service or Installation jobs
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="orange" className="text-xs">
                {enquiries.length} Total Enquiries
              </Badge>
            </div>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-xl bg-white border border-orange-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold text-orange-900 tracking-wider">Follow-up Required</span>
                <div className="w-7 h-7 rounded-lg bg-orange-100/70 border border-orange-200 flex items-center justify-center text-orange-600">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-orange-900 mt-2 font-mono">
                {followUpEnquiriesCount}
              </div>
              <p className="text-[11px] text-orange-700 mt-1">Calls, site surveys & estimates pending</p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-orange-300/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold text-orange-950 tracking-wider">Approved & Converted</span>
                <div className="w-7 h-7 rounded-lg bg-orange-200/60 border border-orange-300 flex items-center justify-center text-orange-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-orange-950 mt-2 font-mono">
                {approvedEnquiriesCount}
              </div>
              <p className="text-[11px] text-orange-800 mt-1">Converted into active jobs</p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">Cancelled</span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2 font-mono">
                {cancelledEnquiriesCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Closed without job creation</p>
            </div>
          </div>
        </div>
      )}

      {/* Separate KPI Groupings for Service Jobs vs Installation Jobs */}
      <div className="w-full space-y-4">
        {/* GROUP 1: Service Department Overview */}
        <div className="w-full p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Wrench className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                Service Department KPIs (Break-fix, Warranty & AMC)
              </h2>
            </div>
            <Badge variant="orange" className="text-xs">
              {serviceJobs.length} Active Service Calls
            </Badge>
          </div>

          <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Assigned</span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 my-1 font-mono">
                {serviceJobs.filter((j) => j.status === 'ASSIGNED').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Ready to start</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-orange-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-orange-800 tracking-wider">In Progress</span>
                <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600">
                  <Play className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-orange-800 my-1 font-mono">
                {serviceJobs.filter((j) => j.status === 'IN_PROGRESS').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-orange-700">
                <span>Session active</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-amber-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">On Hold</span>
                <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600">
                  <AlertOctagon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-amber-800 my-1 font-mono">
                {serviceJobs.filter((j) => j.status === 'ON_HOLD').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-amber-700">
                <span>Timer paused</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-orange-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-orange-900 tracking-wider">Awaiting OTP</span>
                <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-orange-900 my-1 font-mono">
                {serviceJobs.filter((j) => j.status === 'AWAITING_OTP').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-orange-700">
                <span>Sign-off pending</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-emerald-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Completed</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-800 my-1 font-mono">
                {serviceJobs.filter((j) => j.status === 'COMPLETED').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-emerald-700">
                <span>Finished</span>
                {serviceCompletedTrend && (
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    serviceCompletedTrend.isPositive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {serviceCompletedTrend.isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {serviceCompletedTrend.label}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Closed</span>
                <div className="w-7 h-7 rounded-lg bg-teal-100 border border-teal-200 flex items-center justify-center text-teal-700">
                  <FileCheck2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 my-1 font-mono">
                {serviceJobs.filter((j) => j.status === 'CLOSED').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>OTP Verified</span>
                {serviceCompletedTrend && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ArrowUpRight className="w-2.5 h-2.5" />
                    Verified
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* GROUP 2: Installation Department Overview */}
        <div className="w-full p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                Installation Department KPIs (Projects, Commissioning & Turnkey)
              </h2>
            </div>
            <Badge variant="orange" className="text-xs">
              {installationJobs.length} Installation Projects
            </Badge>
          </div>

          <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Assigned</span>
                <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                  <Clock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 my-1 font-mono">
                {installationJobs.filter((j) => j.status === 'ASSIGNED').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Ready to start</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-orange-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-orange-800 tracking-wider">In Progress</span>
                <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600">
                  <Play className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-orange-800 my-1 font-mono">
                {installationJobs.filter((j) => j.status === 'IN_PROGRESS').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-orange-700">
                <span>Mounting / Wiring</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-amber-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">On Hold</span>
                <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600">
                  <AlertOctagon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-amber-800 my-1 font-mono">
                {installationJobs.filter((j) => j.status === 'ON_HOLD').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-amber-700">
                <span>Site obstacle</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-orange-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-orange-900 tracking-wider">Awaiting OTP</span>
                <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-orange-900 my-1 font-mono">
                {installationJobs.filter((j) => j.status === 'AWAITING_OTP').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-orange-700">
                <span>Commission sign-off</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-emerald-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Completed</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-800 my-1 font-mono">
                {installationJobs.filter((j) => j.status === 'COMPLETED').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-emerald-700">
                <span>Hardware mounted</span>
                {installationCompletedTrend && (
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    installationCompletedTrend.isPositive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {installationCompletedTrend.isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    {installationCompletedTrend.label}
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between min-h-[110px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Closed</span>
                <div className="w-7 h-7 rounded-lg bg-teal-100 border border-teal-200 flex items-center justify-center text-teal-700">
                  <FileCheck2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 my-1 font-mono">
                {installationJobs.filter((j) => j.status === 'CLOSED').length}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Live & Invoiced</span>
                {installationCompletedTrend && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ArrowUpRight className="w-2.5 h-2.5" />
                    Verified
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EXECUTIVE ANALYTICS SECTION: 3 CHARTS IN RESPONSIVE GRID (Placed below KPIs, above Live Activity Feed) */}
      {currentUser?.role !== 'TECHNICIAN' && (
        <div className="w-full space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                Executive Telemetry & Performance Analytics
              </h2>
              <p className="text-[11px] text-slate-500">
                Job lifecycle distribution, category revenue yield, and invoice velocity
              </p>
            </div>
            <Badge variant="outline" className="text-xs self-start sm:self-auto font-mono bg-white text-slate-700">
              Total Revenue Collected: <strong className="ml-1 text-slate-900 font-bold">{formatINR(totalRevenue)}</strong>
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
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Live lifecycle distribution across {jobs.length} jobs
                  </p>
                </div>
                <Badge variant="orange" className="text-xs font-mono">
                  {jobs.length} Total
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
                          `${value} jobs (${Math.round(((Number(value) || 0) / (jobs.length || 1)) * 100)}%)`,
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
                          <span className="text-xs text-slate-700 font-medium">{val}</span>
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
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Invoice billing aggregated across 6 service verticals
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-mono text-emerald-700 bg-emerald-50 border-emerald-200">
                  6 Verticals
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
                  Revenue Trend Over Time
                </CardTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Chronological invoice generation and billing velocity
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono text-orange-700 bg-orange-50 border-orange-200">
                  {invoices.length} Invoices Tracked
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
                      <span className="text-xs font-bold text-orange-600 font-mono">
                        {job?.jobNumber || hold.jobId}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {job?.category}
                      </Badge>
                      <span className="text-xs text-slate-900 font-semibold">{job?.productModel}</span>
                    </div>
                    <p className="text-xs text-amber-900 mt-1 font-medium">{hold.reason}</p>
                    <div className="text-[10px] text-slate-500 mt-0.5">
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
                      className="shrink-0 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Resume Work
                    </Button>
                  ) : (
                    <span className="text-xs text-amber-800 font-medium italic">
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
              Live Field Activity Feed
            </CardTitle>
            <span className="text-xs text-slate-500 font-medium">Real-time telemetry</span>
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
                    <span className="text-xs font-semibold text-slate-900 truncate">{item.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {formatDateTime(item.time)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{item.desc}</p>
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
              Active Job Highlights
            </CardTitle>
            <span className="text-xs text-slate-500 font-medium">{visibleJobs.length} active jobs</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleJobs.slice(0, 4).map((job) => (
              <div
                key={job.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between hover:border-orange-200 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-600 font-mono">{job.jobNumber}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {job.category}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-900 font-semibold">{job.productModel}</div>
                  <div className="text-[11px] text-slate-500 truncate max-w-xs">{job.problemReported}</div>
                </div>

                <Badge
                  variant={
                    job.status === 'ON_HOLD'
                      ? 'warning'
                      : job.status === 'AWAITING_OTP'
                      ? 'orange'
                      : 'outline'
                  }
                  className="text-[10px] shrink-0"
                >
                  {job.status.replace('_', ' ')}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
