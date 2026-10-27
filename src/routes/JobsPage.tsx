import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Job, JobStatus, Invoice, ServiceCategory, Customer, SERVICE_CATEGORIES } from '@/lib/stecsecure-types';
import {
  Wrench,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  KeyRound,
  FileText,
  Truck,
  MessageSquare,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  ShieldCheck,
  Building2,
  Calendar,
  Send,
  ReceiptText,
  Tag,
  MapPin,
  X,
  Camera,
  UserCheck,
  ShieldAlert,
  Percent,
  ExternalLink,
  Boxes,
  Users,
  Trash2,
  Inbox,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { formatDate, formatDateTime, formatINR, formatCreatedBy } from '@/lib/utils';
import { JobCreateModal } from '@/components/jobs/JobCreateModal';
import { JobShareOtpModal } from '@/components/jobs/JobShareOtpModal';
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal';
import { EditJobModal, CancelJobModal } from '@/components/jobs/EditJobModal';
import { RaiseHoldModal } from '@/components/jobs/RaiseHoldModal';
import { DeliveryChallanModal } from '@/components/jobs/DeliveryChallanModal';
import { JobPhotoUpload } from '@/components/jobs/JobPhotoUpload';
import { AddProductUsedModal } from '@/components/jobs/AddProductUsedModal';
import { SiteLocationModal } from '@/components/customers/SiteLocationModal';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { TablePager } from '@/components/ui/table-pager';
import { usePagination } from '@/lib/use-pagination';
import { DateRange, inRange, presetRange } from '@/lib/date-range';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';

interface JobsPageProps {
  department?: 'SERVICE' | 'INSTALLATION';
}

// Digital clock format chip (HH:MM:SS) for job duration tracking
const LiveJobTimer: React.FC<{
  status: JobStatus;
  timerStartedAt?: string;
  timerElapsedSeconds?: number;
  totalDurationSeconds?: number;
}> = ({ status, timerStartedAt, timerElapsedSeconds = 0, totalDurationSeconds }) => {
  const [currentSeconds, setCurrentSeconds] = useState<number>(() => {
    if (status === 'IN_PROGRESS' && timerStartedAt) {
      const delta = Math.floor((Date.now() - new Date(timerStartedAt).getTime()) / 1000);
      return Math.max(0, timerElapsedSeconds + delta);
    }
    if (totalDurationSeconds !== undefined) return totalDurationSeconds;
    return timerElapsedSeconds;
  });

  useEffect(() => {
    if (status !== 'IN_PROGRESS' || !timerStartedAt) return;

    const interval = setInterval(() => {
      const delta = Math.floor((Date.now() - new Date(timerStartedAt).getTime()) / 1000);
      setCurrentSeconds(Math.max(0, timerElapsedSeconds + delta));
    }, 1000);

    return () => clearInterval(interval);
  }, [status, timerStartedAt, timerElapsedSeconds]);

  const formatHHMMSS = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  if (status === 'IN_PROGRESS') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] font-mono font-medium shadow-2xs">
        <Clock className="w-3.5 h-3.5 text-emerald-600" />
        <span>{formatHHMMSS(currentSeconds)}</span>
      </div>
    );
  }

  if (status === 'ON_HOLD') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[13px] font-mono font-medium shadow-2xs">
        <Clock className="w-3.5 h-3.5 text-amber-600" />
        <span>Paused: {formatHHMMSS(timerElapsedSeconds)}</span>
      </div>
    );
  }

  if (status === 'COMPLETED' || status === 'AWAITING_OTP' || status === 'CLOSED') {
    const finalSecs = totalDurationSeconds ?? timerElapsedSeconds;
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[13px] font-mono font-medium shadow-2xs">
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        <span>Duration: {formatHHMMSS(finalSecs)}</span>
      </div>
    );
  }

  return null;
};

// Stage label and colours for the phone job cards
const MOBILE_JOB_STAGE: Record<JobStatus, { label: string; cls: string }> = {
  ASSIGNED: { label: 'Assigned', cls: 'bg-slate-50 text-slate-700 border-slate-300' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-50 text-blue-800 border-blue-300' },
  ON_HOLD: { label: 'On Hold', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  AWAITING_OTP: { label: 'Awaiting Sign-off', cls: 'bg-orange-50 text-orange-800 border-orange-300' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  CLOSED: { label: 'Closed', cls: 'bg-emerald-100 text-emerald-900 border-emerald-500' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

export const JobsPage: React.FC<JobsPageProps> = ({ department = 'SERVICE' }) => {
  const {
    visibleJobs,
    users,
    customers,
    currentUser,
    isManagement,
    canResolveHold,
    canResumeHold,
    deleteJob,
    startJob,
    addWorkLogNote,
    addMaterialUsage,
    resolveHoldEvent,
    completeJob,
    getJobWorkLogs,
    getJobMaterials,
    getJobHold,
    getJobInvoice,
    getJobQuotation,
    getJobProductUsages,
    removeJobProductUsage,
    serialUnits,
    products,
    allocateSerialToJob,
    payments,
  } = useStecSecure();

  const [range, setRange] = useState<DateRange>(() => presetRange('FY'));

  // Filter jobs strictly by the active department
  // Date filter (created in the chosen period) — tab counts, search and the list all work inside it
  const deptJobs = visibleJobs.filter((j) => j.type === department && inRange(j.createdAt, range));

  // Status Filter Tab & Search
  const [activeFilter, setActiveFilter] = useState<'ALL' | JobStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modal controls
  const [isCreateOpen, setIsCreateOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('create') === 'true';
    }
    return false;
  });
  const [isChallanOpen, setIsChallanOpen] = useState(false);
  const [selectedHoldJob, setSelectedHoldJob] = useState<Job | null>(null);
  const [selectedShareJob, setSelectedShareJob] = useState<Job | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [activeCreatedInvoice, setActiveCreatedInvoice] = useState<Invoice | null>(null);
  const [productUsedJob, setProductUsedJob] = useState<Job | null>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('productUsed');
      if (p) {
        return visibleJobs.find((j) => j.id === p || j.jobNumber === p) || visibleJobs[0] || null;
      }
    }
    return null;
  });
  const [siteLocationCustomer, setSiteLocationCustomer] = useState<Customer | null>(null);
  const [deletingJob, setDeletingJob] = useState<Job | null>(null);

  // Interactive detail view modal state
  const [selectedDetailJob, setSelectedDetailJob] = useState<Job | null>(() => {
    if (typeof window !== 'undefined') {
      const d = new URLSearchParams(window.location.search).get('detail');
      if (d) {
        return visibleJobs.find((j) => j.id === d || j.jobNumber === d) || visibleJobs[0] || null;
      }
    }
    return null;
  });
  const [expandedRowJobId, setExpandedRowJobId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const exp = new URLSearchParams(window.location.search).get('expand');
      if (exp) {
        const found = visibleJobs.find((j) => j.id === exp || j.jobNumber === exp);
        return found ? found.id : null;
      }
    }
    return null;
  });

  // Before photo staging map for ASSIGNED jobs: { [jobId]: base64Url }
  const [beforePhotoMap, setBeforePhotoMap] = useState<Record<string, string>>({});

  // Complete Job & Billing Modal state
  const [completingJob, setCompletingJob] = useState<Job | null>(null);
  const [afterPhotoInput, setAfterPhotoInput] = useState<string>('');
  const [serviceRateInput, setServiceRateInput] = useState<number>(1500);
  const [gstChoiceInput, setGstChoiceInput] = useState<'GST' | 'NO_GST'>('GST');
  const [installedLocationInput, setInstalledLocationInput] = useState('Front Gate / Main Entrance');
  const [actionTakenInput, setActionTakenInput] = useState('');

  // Form input states for active work session on jobs
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [materialInputs, setMaterialInputs] = useState<
    Record<string, { name: string; delivered: number; returned: number }>
  >({});
  const [serialAttachInputs, setSerialAttachInputs] = useState<Record<string, string>>({});

  // Busy flags while a server action is in flight (prevents double submission)
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [removingUsageId, setRemovingUsageId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [cancellingJob, setCancellingJob] = useState<Job | null>(null);

  // Phase 22: undo a product added by mistake — its serial units go back to stock
  const handleRemoveUsage = async (usageId: string, productName: string) => {
    if (!window.confirm(`Remove ${productName} from this job? Its serial units go back to stock.`)) return;
    setRemovingUsageId(usageId);
    try {
      await removeJobProductUsage(usageId);
      toast.success(`${productName} removed from the job.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemovingUsageId(null);
    }
  };
  const [isCompletingSaving, setIsCompletingSaving] = useState(false);
  const [isDeletingSaving, setIsDeletingSaving] = useState(false);

  // Synchronize updated state into selectedDetailJob if changed
  useEffect(() => {
    if (selectedDetailJob) {
      const fresh = visibleJobs.find((j) => j.id === selectedDetailJob.id);
      if (fresh) setSelectedDetailJob(fresh);
    }
  }, [visibleJobs]);

  const filteredJobs = deptJobs.filter((j) => {
    if (activeFilter !== 'ALL' && j.status !== activeFilter) return false;
    if (categoryFilter !== 'ALL' && j.category !== categoryFilter) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;

    const customer = customers.find((c) => c.id === j.customerNumber);
    return (
      j.jobNumber.toLowerCase().includes(q) ||
      (customer && customer.name.toLowerCase().includes(q)) ||
      (customer && customer.phone.includes(q)) ||
      (customer && customer.address.toLowerCase().includes(q)) ||
      j.category.toLowerCase().includes(q) ||
      (j.problemReported && j.problemReported.toLowerCase().includes(q))
    );
  });
  const pager = usePagination(filteredJobs, [department, activeFilter, categoryFilter, searchQuery, range]);

  const handleStartJobWithPhoto = async (job: Job) => {
    const photo = beforePhotoMap[job.id] || job.beforePhotoUrl;
    if (!photo) {
      toast.error('Before Photo is mandatory before starting the job session');
      return;
    }

    setBusyAction(`start-${job.id}`);
    try {
      await startJob(job.id, photo);
      toast.success(`Job ${job.jobNumber} started.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleAttachSerial = async (jobId: string) => {
    const serialId = serialAttachInputs[jobId];
    if (!serialId) {
      toast.error('Please select an in-stock serial unit to attach');
      return;
    }
    const sn = serialUnits.find((s) => s.id === serialId)?.serialNumber;
    try {
      await allocateSerialToJob(serialId, jobId);
      toast.success(`Serial ${sn} attached and allocated to job.`);
      setSerialAttachInputs((prev) => ({ ...prev, [jobId]: '' }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleAddNote = async (jobId: string) => {
    const note = noteInputs[jobId]?.trim();
    if (!note) {
      toast.error('Please enter a note');
      return;
    }
    setBusyAction(`note-${jobId}`);
    try {
      await addWorkLogNote(jobId, note);
      setNoteInputs((prev) => ({ ...prev, [jobId]: '' }));
      toast.success('Work note recorded in job log');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddMaterial = async (jobId: string) => {
    const input = materialInputs[jobId];
    if (!input || !input.name?.trim()) {
      toast.error('Please enter material name');
      return;
    }
    try {
      await addMaterialUsage(
        jobId,
        input.name.trim(),
        Number(input.delivered) || 0,
        Number(input.returned) || 0
      );
      setMaterialInputs((prev) => ({
        ...prev,
        [jobId]: { name: '', delivered: 1, returned: 0 },
      }));
      toast.success('Material usage ledger updated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const completingQuotation = completingJob ? getJobQuotation(completingJob) : undefined;

  const initiateCompleteJob = (job: Job) => {
    setCompletingJob(job);
    setAfterPhotoInput(job.afterPhotoUrl || '');
    // A quotation already contains the agreed labour — only extra labour is entered at completion
    setServiceRateInput(
      getJobQuotation(job)
        ? 0
        : job.serviceAmount > 0
        ? job.serviceAmount
        : department === 'INSTALLATION'
        ? 2500
        : 1500
    );
    setGstChoiceInput(job.serviceGstChoice || 'GST');
    setActionTakenInput(
      job.actionTaken ||
        `${department === 'INSTALLATION' ? 'Installation' : 'Service maintenance'} verified and operational.`
    );
    setInstalledLocationInput('Main Site Entrance');
  };

  const confirmCompleteJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingJob) return;

    if (!afterPhotoInput) {
      toast.error('After Photo is mandatory before completing the job');
      return;
    }

    const targetJob = completingJob;
    setIsCompletingSaving(true);
    try {
      // Complete the job with photo, rate, and GST choice
      const generatedInvoice = await completeJob(targetJob.id, {
        afterPhotoUrl: afterPhotoInput,
        serviceAmount: Number(serviceRateInput) || 0,
        serviceGstChoice: gstChoiceInput,
        actionTaken: actionTakenInput.trim(),
        installedLocation: installedLocationInput.trim(),
      });

      toast.success(
        `Job ${targetJob.jobNumber} completed. Invoice generated with work photos.`
      );

      setCompletingJob(null);

      // Open WhatsApp / OTP modal immediately
      setSelectedShareJob(targetJob);
      setActiveCreatedInvoice(generatedInvoice || null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsCompletingSaving(false);
    }
  };

  const handleResolveHold = async (holdId: string, jobNumber: string) => {
    setBusyAction(`resume-${holdId}`);
    try {
      await resolveHoldEvent(holdId);
      toast.success(`Hold cleared. Job ${jobNumber} resumed.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  // Helper to render the complete interactive panel for any job
  const renderInteractiveJobPanel = (job: Job) => {
    const customer = customers.find((c) => c.id === job.customerNumber);
    const team = users.filter((u) => job.assignedTeam.includes(u.id));
    const leadUserId = job.teamLeadUserId || job.assignedTeam[0];
    const teamLead = users.find((u) => u.id === leadUserId);

    const isLead = currentUser?.id === leadUserId || isManagement;
    const workLogs = getJobWorkLogs(job.id);
    const allNotes = workLogs.flatMap((wl) => wl.notesLog?.map((e) => e.note) || []);
    const materials = getJobMaterials(job.id);
    const openHold = getJobHold(job.id);
    const invoice = getJobInvoice(job.id);
    const currentBeforePhoto = beforePhotoMap[job.id] || job.beforePhotoUrl;

    const inStockSerials = serialUnits.filter((s) => s.status === 'IN_STOCK');

    const jobProductUsages = getJobProductUsages(job.id);
    const canAddProducts =
      isLead &&
      (job.status === 'ASSIGNED' || job.status === 'IN_PROGRESS' || job.status === 'ON_HOLD');

    return (
      <div className="space-y-4 p-4 rounded-md bg-white border border-slate-200 text-[13px]">
        {/* Top Status & Duration Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-orange-600">{job.jobNumber}</span>
            <Badge variant="outline" className="font-semibold">
              {job.category}
            </Badge>
            <span className="text-slate-500 font-medium text-[13px]">
              {job.type === 'INSTALLATION' ? 'Installation' : 'Service'}
            </span>
            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {formatCreatedBy(job.createdByUserId, users)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Phase 22: management edits or cancels an open job */}
            {isManagement && job.status !== 'CLOSED' && job.status !== 'CANCELLED' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[13px] px-2.5 rounded-md font-semibold"
                  onClick={() => setEditingJob(job)}
                >
                  Edit Job
                </Button>
                {!invoice && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[13px] px-2.5 rounded-md font-semibold text-rose-600 border-rose-300 hover:bg-rose-50"
                    onClick={() => setCancellingJob(job)}
                  >
                    Cancel Job
                  </Button>
                )}
              </>
            )}
            <LiveJobTimer
              status={job.status}
              timerStartedAt={job.timerStartedAt}
              timerElapsedSeconds={job.timerElapsedSeconds}
              totalDurationSeconds={job.totalDurationSeconds}
            />
          </div>
        </div>

        {/* Phase 22: schedule, site contact, cancellation */}
        {(job.scheduledFor || job.siteContactName || job.siteContactPhone || job.status === 'CANCELLED') && (
          <div
            className={`p-2.5 rounded-md border flex flex-wrap gap-x-5 gap-y-1 ${
              job.status === 'CANCELLED' ? 'bg-slate-100 border-slate-300' : 'bg-blue-50/60 border-blue-200'
            }`}
          >
            {job.status === 'CANCELLED' && (
              <span className="text-slate-700">
                <strong>Cancelled</strong>
                {job.cancelledAt && ` on ${formatDateTime(job.cancelledAt)}`}
                {job.cancelledReason && ` — ${job.cancelledReason}`}
              </span>
            )}
            {job.scheduledFor && (
              <span className="text-slate-700">
                Scheduled visit: <strong>{formatDateTime(job.scheduledFor)}</strong>
              </span>
            )}
            {(job.siteContactName || job.siteContactPhone) && (
              <span className="text-slate-700">
                Site contact: <strong>{job.siteContactName || ''}</strong>{' '}
                {job.siteContactPhone && (
                  <a href={`tel:${job.siteContactPhone}`} className="font-mono text-blue-700 hover:underline">
                    {job.siteContactPhone}
                  </a>
                )}
              </span>
            )}
          </div>
        )}

        {/* 3-Column Execution Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Col 1: Customer & Site */}
          <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="text-[11px] uppercase font-bold text-slate-500 flex items-center justify-between">
              <span>Customer & Site</span>
              {customer?.siteLocationMapLink ? (
                <a
                  href={customer.siteLocationMapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5 hover:underline"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setSiteLocationCustomer(customer || null)}
                  className="text-[11px] text-orange-600 hover:underline font-semibold cursor-pointer"
                >
                  + Add Map Link
                </button>
              )}
            </div>
            <div className="font-bold text-slate-900 text-sm">{customer?.name}</div>
            <div className="text-slate-600 flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{customer?.address}</span>
            </div>
            <div className="text-slate-500 font-medium">Phone: {customer?.phone}</div>
          </div>

          {/* Col 2: Problem Scope & Crew */}
          <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="text-[11px] uppercase font-bold text-slate-500">Problem / Work Scope</div>
            <p className="text-slate-800 font-medium leading-relaxed">{job.problemReported}</p>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">Crew Lead:</span>
              <span className="font-bold text-orange-700 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-orange-600" />
                {teamLead?.name || 'Unassigned'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {team.map((t) => (
                <span
                  key={t.id}
                  className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>

          {/* Col 3: Stage Execution Actions */}
          <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-2">
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-500">Next step</div>
              <div className="text-[13px] font-bold text-slate-900 mt-0.5">
                {job.status === 'ASSIGNED' && 'Take the before photo, then start'}
                {job.status === 'IN_PROGRESS' && 'Work in progress (timer running)'}
                {job.status === 'ON_HOLD' && 'Paused — job on hold'}
                {job.status === 'COMPLETED' && 'Work complete — ready for invoice'}
                {job.status === 'AWAITING_OTP' && 'Waiting for customer sign-off'}
                {job.status === 'CLOSED' && 'Signed off and closed'}
                {job.status === 'CANCELLED' && `Cancelled — ${job.cancelledReason || 'no reason given'}`}
              </div>
            </div>

            <div className="space-y-1.5">
              {/* ASSIGNED */}
              {job.status === 'ASSIGNED' && (
                <div className="space-y-2">
                  {isLead ? (
                    <>
                      <JobPhotoUpload
                        label="Before Photo (Mandatory to start)"
                        photoUrl={currentBeforePhoto}
                        required
                        samplePhotoFallback={SAMPLE_BEFORE_PHOTO}
                        onPhotoChange={(url) =>
                          setBeforePhotoMap((prev) => ({ ...prev, [job.id]: url || '' }))
                        }
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!currentBeforePhoto || busyAction === `start-${job.id}`}
                        className="w-full text-[13px] font-semibold rounded-md shadow-2xs"
                        onClick={() => handleStartJobWithPhoto(job)}
                      >
                        <Play className="w-3.5 h-3.5 mr-1" /> Start Job Session
                      </Button>
                    </>
                  ) : (
                    <div className="p-2 bg-white rounded border border-slate-200 text-xs text-slate-600 text-center">
                      Only Team Lead ({teamLead?.name}) can start session.
                    </div>
                  )}
                </div>
              )}

              {/* IN_PROGRESS */}
              {job.status === 'IN_PROGRESS' && (
                <div className="space-y-1.5">
                  {isLead ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        className="text-[13px] font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => initiateCompleteJob(job)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete
                      </Button>
                      <Button
                        variant="warning"
                        size="sm"
                        className="text-[13px] font-semibold rounded-md"
                        onClick={() => setSelectedHoldJob(job)}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Raise Hold
                      </Button>
                    </div>
                  ) : (
                    <div className="p-2 bg-white rounded border border-slate-200 text-xs text-slate-600 text-center">
                      Work in progress by {teamLead?.name}.
                    </div>
                  )}
                </div>
              )}

              {/* ON_HOLD */}
              {job.status === 'ON_HOLD' && openHold && (
                <div className="space-y-1.5">
                  <div className="p-2 rounded bg-amber-100/60 border border-amber-300 text-amber-900 text-xs">
                    <strong>Reason:</strong> {openHold.reason}
                  </div>
                  {canResumeHold(job, openHold) ? (
                    <Button
                      size="sm"
                      variant="success"
                      className="w-full text-[13px] font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                      disabled={busyAction === `resume-${openHold.id}`}
                      onClick={() => handleResolveHold(openHold.id, job.jobNumber)}
                    >
                      <Play className="w-3.5 h-3.5" /> Resume Work
                    </Button>
                  ) : (
                    <div className="p-2 bg-amber-50 rounded border border-amber-200 text-xs text-amber-800 text-center font-medium">
                      On Hold &bull; Awaiting Team Lead ({teamLead?.name || 'Lead'}) to resume
                    </div>
                  )}
                </div>
              )}

              {/* AWAITING_OTP — customer sign-off and payment are handled by the team lead (or management) */}
              {job.status === 'AWAITING_OTP' && !isLead && (
                <div className="p-2 bg-slate-50 rounded border border-slate-200 text-xs text-slate-600 text-center font-medium">
                  Awaiting team lead to verify customer OTP
                </div>
              )}
              {job.status === 'AWAITING_OTP' && isLead && (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full text-[13px] font-semibold rounded-md"
                  onClick={() => {
                    setSelectedShareJob(job);
                    setActiveCreatedInvoice(invoice || null);
                  }}
                >
                  <KeyRound className="w-3.5 h-3.5 mr-1" /> Verify OTP & Collect
                </Button>
              )}

              {/* COMPLETED or CLOSED */}
              {(job.status === 'COMPLETED' || job.status === 'CLOSED') && invoice && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-[13px] font-semibold rounded-md border-slate-300 hover:bg-slate-100"
                  onClick={() => setViewingInvoice(invoice)}
                >
                  <ReceiptText className="w-3.5 h-3.5 mr-1 text-emerald-600" /> View Invoice ({invoice.invoiceNo})
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Phase 8: Products & Hardware Used Ledger */}
        <div className="p-3 rounded-md bg-orange-50/40 border border-orange-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-orange-600" />
                Products used ({jobProductUsages.length})
              </span>
            </div>

            {canAddProducts && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setProductUsedJob(job)}
                className="h-7 text-[13px] px-2.5 font-semibold rounded-md shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add product
              </Button>
            )}
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {jobProductUsages.length === 0 ? (
              <div className="p-3 rounded bg-white border border-dashed border-orange-200 text-center text-[13px] text-slate-500">
                No products recorded yet. Tap &quot;Add product&quot; when you use one.
              </div>
            ) : (
              jobProductUsages.map((usage) => {
                const prod = products.find((p) => p.id === usage.productId);
                const allocatedSerials =
                  usage.serialUnitIds?.map(
                    (sid) => serialUnits.find((s) => s.id === sid || s.serialNumber === sid)?.serialNumber || sid
                  ) || [];

                return (
                  <div
                    key={usage.id}
                    className="p-2.5 rounded bg-white border border-slate-200 text-[13px] flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-2xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{prod?.name || 'Equipment'}</span>
                      <span className="text-[11px] text-slate-500 ml-2">({prod?.category})</span>
                      {allocatedSerials.length > 0 && (
                        <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                          Serials: {allocatedSerials.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-orange-600 text-[13px] px-2 py-0.5 rounded bg-orange-50 border border-orange-200">
                        Qty: {usage.quantity} {prod?.unit || 'Nos'}
                      </span>
                      {canAddProducts && (
                        <button
                          type="button"
                          disabled={removingUsageId === usage.id}
                          onClick={() => void handleRemoveUsage(usage.id, prod?.name || 'Equipment')}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer disabled:opacity-50"
                          title="Remove this product (added by mistake)"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Work Logs & Notes Section */}
        <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2">
          <div className="font-bold text-slate-900 text-[13px] uppercase flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
              Work Log Notes ({allNotes.length})
            </span>
          </div>

          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {allNotes.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No work notes recorded yet.</p>
            ) : (
              allNotes.map((note, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-white border border-slate-200 text-xs text-slate-800"
                >
                  {note}
                </div>
              ))
            )}
          </div>

          {/* Add note input */}
          <div className="flex gap-2 pt-1">
            <Input
              placeholder="Record a work update, progress note, or on-site finding..."
              value={noteInputs[job.id] || ''}
              onChange={(e) =>
                setNoteInputs((prev) => ({ ...prev, [job.id]: e.target.value }))
              }
              className="text-[13px] h-8 bg-white rounded-md border-slate-300"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busyAction === `note-${job.id}`}
              onClick={() => handleAddNote(job.id)}
              className="h-8 text-[13px] font-semibold rounded-md shrink-0 border-slate-300 hover:bg-slate-100"
            >
              Add Note
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 w-full pb-12">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-md border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {department === 'SERVICE' ? 'Service Jobs' : 'Installation Jobs'} ({filteredJobs.length})
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {department === 'SERVICE'
              ? 'Repair calls, warranty visits and AMC maintenance'
              : 'New installations: CCTV, gates, access control and automation'}
          </p>
        </div>

        {/* Action buttons (CEO / Manager only) */}
        {isManagement && (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="text-[13px] font-semibold rounded-md shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New {department === 'SERVICE' ? 'Service' : 'Installation'} Job
            </Button>
          </div>
        )}
      </div>

      {/* Filter Tabs matching Robotics ERP reference */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { id: 'ALL', label: 'All Jobs', count: deptJobs.length },
          {
            id: 'ASSIGNED',
            label: 'Assigned',
            count: deptJobs.filter((j) => j.status === 'ASSIGNED').length,
          },
          {
            id: 'IN_PROGRESS',
            label: 'In Progress',
            count: deptJobs.filter((j) => j.status === 'IN_PROGRESS').length,
          },
          {
            id: 'ON_HOLD',
            label: 'On Hold',
            count: deptJobs.filter((j) => j.status === 'ON_HOLD').length,
          },
          {
            id: 'AWAITING_OTP',
            label: 'Awaiting sign-off',
            count: deptJobs.filter((j) => j.status === 'AWAITING_OTP').length,
          },
          {
            id: 'COMPLETED',
            label: 'Completed',
            count: deptJobs.filter((j) => j.status === 'COMPLETED').length,
          },
          {
            id: 'CLOSED',
            label: 'Closed',
            count: deptJobs.filter((j) => j.status === 'CLOSED').length,
          },
          {
            id: 'CANCELLED',
            label: 'Cancelled',
            count: deptJobs.filter((j) => j.status === 'CANCELLED').length,
          },
        ].map((tab) => {
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-orange-500 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-md font-mono font-bold ${
                  isActive ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Date and category filters (search is in the bar above the list) */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <DateRangeFilter value={range} onChange={setRange} withTime />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-[13px] h-8 px-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-700 focus:outline-none focus:border-orange-500 font-medium"
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

      <TablePager
        pager={pager}
        noun={department === 'SERVICE' ? 'service jobs' : 'installation jobs'}
        search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search by Job #, customer, phone, or scope...' }}
      />

      {/* Phones and tablets: one tappable card per job — the table below needs a wide screen */}
      <div className="lg:hidden grid gap-2 md:grid-cols-2">
        {filteredJobs.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-slate-500 bg-white border border-slate-200 rounded-md">
            No {department.toLowerCase()} jobs match this filter.
          </div>
        ) : (
          pager.items.map((job) => {
            const customer = customers.find((c) => c.id === job.customerNumber);
            const lead = users.find((u) => u.id === (job.teamLeadUserId || job.assignedTeam[0]));
            const stage = MOBILE_JOB_STAGE[job.status];
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedDetailJob(job)}
                className="w-full text-left bg-white border border-slate-200 rounded-lg p-3 shadow-2xs active:bg-orange-50 space-y-1.5 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-[13px] text-orange-600">#{job.jobNumber}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${stage.cls}`}>{stage.label}</span>
                </div>
                <div className="font-semibold text-sm text-slate-900">{customer?.name || job.customerNumber}</div>
                <div className="text-[13px] text-slate-600 line-clamp-2">{job.problemReported}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span>{job.category}</span>
                  {job.scheduledFor && <span>Visit: {formatDateTime(job.scheduledFor)}</span>}
                  <span>Lead: {lead?.name || '—'}</span>
                </div>
                <div className="text-xs font-semibold text-orange-700">Open job &rarr;</div>
              </button>
            );
          })
        )}
      </div>

      {/* Robotics ERP Projects Data Table */}
      <div className="hidden lg:block bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-32 whitespace-nowrap">Job ID</th>
                <th className="min-w-[190px]">Customer</th>
                <th className="min-w-[160px]">Work Type</th>
                <th className="w-36 whitespace-nowrap">Team Lead</th>
                <th className="w-28 text-center whitespace-nowrap hidden 2xl:table-cell">Start Date</th>
                <th className="text-center whitespace-nowrap">Stage</th>
                <th className="text-center whitespace-nowrap">Payment</th>
                <th className="text-right pr-4 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500">
                    <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="font-semibold text-slate-700 text-sm">No jobs found</div>
                    <p className="text-[13px] text-slate-500 mt-1">
                      No {department.toLowerCase()} jobs match this status filter.
                    </p>
                  </td>
                </tr>
              ) : (
                pager.items.map((job) => {
                  const customer = customers.find((c) => c.id === job.customerNumber);
                  const leadUserId = job.teamLeadUserId || job.assignedTeam[0];
                  const teamLead = users.find((u) => u.id === leadUserId);

                  // Payment Status calculation from Invoice and Payments
                  const invoice = getJobInvoice(job.id);
                  const jobPayments = invoice ? payments.filter((p) => p.invoiceId === invoice.id) : [];
                  const totalPaid = jobPayments.reduce((acc, p) => acc + p.amount, 0);

                  let paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING' = 'PENDING';
                  if (invoice) {
                    // balanceDue is net of credit notes (Step 3)
                    if (invoice.balanceDue === 0) {
                      paymentStatus = 'PAID';
                    } else if (invoice.amountPaid > 0 || totalPaid > 0) {
                      paymentStatus = 'PARTIAL';
                    } else {
                      paymentStatus = 'PENDING';
                    }
                  } else if (job.status === 'CLOSED') {
                    paymentStatus = 'PAID';
                  }

                  const isRowExpanded = expandedRowJobId === job.id;

                  return (
                    <React.Fragment key={job.id}>
                      <tr className="transition-colors hover:bg-slate-50/90">
                        {/* 1. Job ID */}
                        <td className="whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedDetailJob(job)}
                              className="font-bold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer flex items-center gap-1 font-mono text-[13px]"
                            >
                              <span>#{job.jobNumber}</span>
                            </button>
                            <span className="hidden 2xl:inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                              <UserCheck className="w-3 h-3 text-slate-400" />
                              {formatCreatedBy(job.createdByUserId, users)}
                            </span>
                          </div>
                        </td>

                        {/* 2. Customer */}
                        <td>
                          <div className="font-bold text-slate-900 leading-tight truncate max-w-[180px]">
                            {customer?.name || 'Client'}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">
                            {customer?.phone} &bull; {customer?.address}
                          </div>
                        </td>

                        {/* 3. Work Type */}
                        <td>
                          <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap">
                            <span className="text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {job.category}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              ({job.type === 'INSTALLATION' ? 'Installation' : 'Service'})
                            </span>
                          </div>
                          <div className="text-[13px] text-slate-700 mt-1 line-clamp-1 max-w-[220px]">
                            {job.problemReported}
                          </div>
                        </td>

                        {/* 4. Team Lead */}
                        <td className="whitespace-nowrap">
                          {teamLead ? (
                            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-800">
                              <UserCheck className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                              <span className="truncate max-w-[120px]">{teamLead.name}</span>
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              Unassigned
                            </span>
                          )}
                        </td>

                        {/* 5. Start Date */}
                        <td className="text-center font-mono text-[13px] text-slate-600 whitespace-nowrap hidden 2xl:table-cell">
                          {formatDate(job.createdAt)}
                        </td>

                        {/* 6. Current Stage/Status */}
                        <td className="text-center whitespace-nowrap">
                          {job.status === 'ASSIGNED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                              Assigned
                            </span>
                          )}
                          {job.status === 'IN_PROGRESS' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              In Progress
                            </span>
                          )}
                          {job.status === 'ON_HOLD' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              On Hold
                            </span>
                          )}
                          {job.status === 'AWAITING_OTP' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-orange-50 text-orange-800 border border-orange-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                              Awaiting sign-off
                            </span>
                          )}
                          {job.status === 'COMPLETED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Completed
                            </span>
                          )}
                          {job.status === 'CLOSED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-700"></span>
                              Closed
                            </span>
                          )}
                          {job.status === 'CANCELLED' && (
                            <span
                              title={job.cancelledReason}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300 line-through decoration-slate-400"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                              Cancelled
                            </span>
                          )}
                        </td>

                        {/* 7. Payment Status */}
                        <td className="text-center whitespace-nowrap">
                          {paymentStatus === 'PAID' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Paid
                            </span>
                          )}
                          {paymentStatus === 'PARTIAL' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Partial
                            </span>
                          )}
                          {paymentStatus === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              Pending
                            </span>
                          )}
                        </td>

                        {/* 8. Action */}
                        <td className="text-right pr-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedDetailJob(job)}
                              className="h-7 px-2.5 rounded-md text-[13px] font-bold bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 shadow-2xs cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                            >
                              <span>Open</span>
                              <span>&rarr;</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setExpandedRowJobId(isRowExpanded ? null : job.id)}
                              className="hidden 2xl:flex w-7 h-7 items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                              title={isRowExpanded ? 'Collapse row' : 'Quick expand'}
                            >
                              {isRowExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {currentUser?.role === 'CEO' && (
                              <button
                                type="button"
                                onClick={() => setDeletingJob(job)}
                                className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                                title="Delete Job (CEO Only)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Inline Expanded Row */}
                      {isRowExpanded && (
                        <tr>
                          <td colSpan={8} className="p-3 bg-slate-50/70 border-b border-slate-200">
                            {renderInteractiveJobPanel(job)}
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
      </div>

      {/* MODAL: Full Interactive Job Detail View */}
      {selectedDetailJob && (
        <Modal
          isOpen={Boolean(selectedDetailJob)}
          onClose={() => setSelectedDetailJob(null)}
          maxWidth="4xl"
          showCloseButton={false}
          className="max-h-[90vh]"
          bodyClassName="p-0 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Job {selectedDetailJob.jobNumber}
                </h2>
                <p className="text-[13px] text-slate-500">
                  {customers.find((c) => c.id === selectedDetailJob.customerNumber)?.name || 'Work, products used and notes'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDetailJob(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
            {renderInteractiveJobPanel(selectedDetailJob)}
          </div>

          <div className="flex items-center justify-end px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedDetailJob(null)}
              className="rounded-xl text-[13px] font-semibold"
            >
              Close Job Details
            </Button>
          </div>
        </Modal>
      )}

      {/* Complete Job & Billing Modal */}
      {completingJob && (
        <Modal
          isOpen={Boolean(completingJob)}
          onClose={() => setCompletingJob(null)}
          maxWidth="xl"
          showCloseButton={false}
          className="max-h-[90vh]"
          bodyClassName="p-0 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Complete Job & Generate Invoice
                </h3>
                <p className="text-[13px] text-slate-500 font-mono">{completingJob.jobNumber}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCompletingJob(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={confirmCompleteJob} className="flex-1 flex flex-col overflow-hidden text-[13px]">
            <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
              <JobPhotoUpload
                label="After work photo (required)"
                photoUrl={afterPhotoInput}
                required
                samplePhotoFallback={SAMPLE_AFTER_PHOTO}
                onPhotoChange={(url) => setAfterPhotoInput(url || '')}
              />

              {completingQuotation && (
                <div className="p-3 rounded-md bg-orange-50 border border-orange-200 text-xs text-orange-900 leading-relaxed">
                  Invoice will bill <strong>Quotation {completingQuotation.quotationNo}</strong> as agreed (
                  {formatINR(completingQuotation.grandTotal)}). Products used beyond the quoted quantities are
                  added automatically. Enter labour only if extra work was done beyond the quotation.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    {completingQuotation ? 'Extra labour beyond the quotation (₹)' : 'Service charge (₹) *'}
                  </label>
                  <Input
                    type="number"
                    required
                    min={0}
                    value={serviceRateInput}
                    onChange={(e) => setServiceRateInput(Number(e.target.value))}
                    className="text-[13px] h-9 bg-white rounded-md border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">GST *</label>
                  <select
                    value={gstChoiceInput}
                    onChange={(e) => setGstChoiceInput(e.target.value as any)}
                    className="w-full text-[13px] h-9 px-3 rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                  >
                    <option value="GST">18% GST</option>
                    <option value="NO_GST">No GST (exempt)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  What was done *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the work done…"
                  value={actionTakenInput}
                  onChange={(e) => setActionTakenInput(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white p-3 text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 leading-relaxed shadow-2xs"
                />
              </div>

            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setCompletingJob(null)}
                className="rounded-xl text-[13px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="success"
                size="md"
                disabled={isCompletingSaving}
                className="rounded-xl text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Complete & Generate Invoice
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Global Modals */}
      <JobCreateModal
        isOpen={isCreateOpen}
        initialType={department}
        onClose={() => setIsCreateOpen(false)}
        onJobCreated={(newJob) => {
          setIsCreateOpen(false);
          toast.success(`Job ${newJob.jobNumber} created.`);
        }}
      />

      <DeliveryChallanModal
        isOpen={isChallanOpen}
        onClose={() => setIsChallanOpen(false)}
      />

      {productUsedJob && (
        <AddProductUsedModal
          isOpen={Boolean(productUsedJob)}
          job={productUsedJob}
          onClose={() => setProductUsedJob(null)}
        />
      )}

      {siteLocationCustomer && (
        <SiteLocationModal
          isOpen={Boolean(siteLocationCustomer)}
          customer={siteLocationCustomer}
          onClose={() => setSiteLocationCustomer(null)}
        />
      )}

      <RaiseHoldModal
        isOpen={Boolean(selectedHoldJob)}
        job={selectedHoldJob}
        onClose={() => setSelectedHoldJob(null)}
        onHoldRaised={() => setSelectedHoldJob(null)}
      />

      {/* View-only invoice for completed / closed jobs — must not re-run OTP & payment collection */}
      <InvoicePreviewModal
        isOpen={Boolean(viewingInvoice)}
        invoice={viewingInvoice}
        onClose={() => setViewingInvoice(null)}
      />

      <JobShareOtpModal
        isOpen={Boolean(selectedShareJob)}
        // Always the latest copy of the job (e.g. with the after photo saved by completion)
        job={selectedShareJob ? visibleJobs.find((j) => j.id === selectedShareJob.id) ?? selectedShareJob : null}
        invoice={activeCreatedInvoice}
        onClose={() => {
          setSelectedShareJob(null);
          setActiveCreatedInvoice(null);
        }}
        onJobClosed={() => {
          setSelectedShareJob(null);
          setActiveCreatedInvoice(null);
        }}
      />

      {/* Phase 22: edit / cancel (always the latest copy of the job) */}
      {editingJob && (
        <EditJobModal
          isOpen
          job={visibleJobs.find((j) => j.id === editingJob.id) ?? editingJob}
          onClose={() => setEditingJob(null)}
        />
      )}
      {cancellingJob && (
        <CancelJobModal
          isOpen
          job={visibleJobs.find((j) => j.id === cancellingJob.id) ?? cancellingJob}
          onClose={() => setCancellingJob(null)}
        />
      )}

      {/* MODAL: Delete Job Confirmation (CEO Only) (Part C) */}
      {deletingJob && (
        <Modal
          isOpen={Boolean(deletingJob)}
          onClose={() => setDeletingJob(null)}
          maxWidth="md"
          title="Delete Job Permanently"
          subtitle={`#${deletingJob.jobNumber}`}
          icon={<Trash2 className="w-5 h-5 text-rose-600" />}
        >
          <div className="space-y-3.5 text-[13px]">
            <p className="text-slate-700 leading-relaxed">
              This will permanently delete job <strong className="font-mono text-slate-900">#{deletingJob.jobNumber}</strong> ({deletingJob.category} &bull; {deletingJob.productModel}) from active dispatch. This action cannot be undone.
            </p>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs leading-relaxed">
              <strong>Billing Integrity Note:</strong> Any linked customer invoices or commercial quotations will remain intact in accounting records.
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setDeletingJob(null)}
                className="rounded-xl text-[13px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                className="rounded-xl text-[13px] font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                disabled={isDeletingSaving}
                onClick={async () => {
                  const target = deletingJob;
                  const num = target.jobNumber;
                  setIsDeletingSaving(true);
                  try {
                    await deleteJob(target.id);
                    toast.success(`Job ${num} permanently deleted.`);
                    setDeletingJob(null);
                    if (selectedDetailJob?.id === target.id) {
                      setSelectedDetailJob(null);
                    }
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setIsDeletingSaving(false);
                  }
                }}
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
