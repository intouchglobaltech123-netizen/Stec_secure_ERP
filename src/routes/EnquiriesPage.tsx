import { quotationStatusMeta } from '@/lib/quotation-status';
import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import {
  Enquiry,
  EnquiryStatus,
  EnquiryType,
  ServiceCategory,
  SERVICE_CATEGORIES,
  EnquirySource,
  Job,
  Quotation,
} from '@/lib/stecsecure-types';
import {
  Inbox,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  MessageSquare,
  Building2,
  MapPin,
  Phone,
  ArrowRight,
  ExternalLink,
  Calendar,
  X,
  FileCheck2,
  Wrench,
  Layers,
  Trash2,
  UserCheck,
  Tag,
  Edit3,
  Edit,
  FileSpreadsheet,
  MessageCircle,
  Ban,
  Eye,
  Briefcase,
  User,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { formatDate, formatDateTime, formatINR, formatCreatedBy } from '@/lib/utils';
import { JobCreateModal } from '@/components/jobs/JobCreateModal';
import { JobDetailModal } from '@/components/jobs/JobDetailModal';
import { QuotationBuilderModal } from '@/components/quotations/QuotationBuilderModal';
import { QuotationPreviewModal } from '@/components/quotations/QuotationPreviewModal';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';

interface EnquiriesPageProps {
  onNavigateToJob?: (jobId: string, type: 'SERVICE' | 'INSTALLATION') => void;
}

const ENQUIRY_SOURCES: EnquirySource[] = [
  'Phone',
  'WhatsApp',
  'Referral',
  'Walk-in',
  'Website',
  'Other',
];

export const EnquiriesPage: React.FC<EnquiriesPageProps> = ({ onNavigateToJob }) => {
  const {
    enquiries,
    customers,
    quotations,
    jobs,
    users,
    currentUser,
    isManagement,
    createEnquiry,
    addEnquiryFollowUpNote,
    approveEnquiry,
    cancelEnquiry,
    deleteEnquiry,
    addCustomer,
  } = useStecSecure();

  // Tab and Filters (All / Today's / Follow-up / Approved / Cancelled)
  const [activeTab, setActiveTab] = useState<'ALL' | 'TODAYS' | EnquiryStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | EnquiryType>('ALL');

  // Modal Controls
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewEnquiry, setViewEnquiry] = useState<Enquiry | null>(null);
  const [noteEnquiry, setNoteEnquiry] = useState<Enquiry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [cancelModalEnquiry, setCancelModalEnquiry] = useState<Enquiry | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reminderEnquiry, setReminderEnquiry] = useState<Enquiry | null>(null);
  const [remindDate, setRemindDate] = useState('');
  const [remindTime, setRemindTime] = useState('');
  const [deletingEnquiry, setDeletingEnquiry] = useState<Enquiry | null>(null);

  // Job Conversion & Quotation Modal State
  const [jobCreateEnquiry, setJobCreateEnquiry] = useState<Enquiry | null>(null);
  const [inspectedJob, setInspectedJob] = useState<Job | null>(null);
  const [quotationEnquiry, setQuotationEnquiry] = useState<Enquiry | null>(null);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);

  // Phase 21: a server action from one of the dialogs is in flight (blocks double submits)
  const [saving, setSaving] = useState(false);

  // Phase 21: keep the open enquiry in step with the list once the server reply lands
  // (notes, reminders and status changes show up here without re-reading state after an action)
  useEffect(() => {
    setViewEnquiry((prev) => (prev ? enquiries.find((x) => x.id === prev.id) ?? prev : prev));
  }, [enquiries]);

  const initReminderState = () => {
    const now = new Date();
    // Default to today + 2 hours (or tomorrow 10:00 AM if evening after 5 PM)
    if (now.getHours() >= 17) {
      now.setDate(now.getDate() + 1);
      now.setHours(10, 0, 0, 0);
    } else {
      now.setHours(now.getHours() + 2, 0, 0, 0);
    }
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    setRemindDate(`${yyyy}-${mm}-${dd}`);
    setRemindTime(`${hh}:${min}`);
  };

  const handleOpenReminder = (enquiry: Enquiry) => {
    initReminderState();
    setReminderEnquiry(enquiry);
  };

  // New Enquiry Form State
  const [formType, setFormType] = useState<EnquiryType>('SERVICE');
  const [formCategory, setFormCategory] = useState<ServiceCategory>('CCTV');
  const [formSource, setFormSource] = useState<EnquirySource>('Phone');
  const [formDescription, setFormDescription] = useState('');
  const [isQuickAddCustomer, setIsQuickAddCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  const isToday = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    } catch {
      return false;
    }
  };

  // Counts for tabs
  const todaysCount = enquiries.filter((e) => isToday(e.createdAt)).length;
  const followUpCount = enquiries.filter((e) => e.status === 'FOLLOW_UP').length;
  const approvedCount = enquiries.filter((e) => e.status === 'APPROVED').length;
  const cancelledCount = enquiries.filter((e) => e.status === 'CANCELLED').length;

  // Filtered List
  const filteredEnquiries = enquiries.filter((enq) => {
    let matchesTab = true;
    if (activeTab === 'TODAYS') {
      matchesTab = isToday(enq.createdAt);
    } else if (activeTab !== 'ALL') {
      matchesTab = enq.status === activeTab;
    }

    const matchesType = typeFilter === 'ALL' || enq.enquiryType === typeFilter;
    const matchesCategory = categoryFilter === 'ALL' || enq.category === categoryFilter;

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      enq.enquiryNumber.toLowerCase().includes(q) ||
      enq.customerName.toLowerCase().includes(q) ||
      enq.customerPhone.includes(q) ||
      enq.description.toLowerCase().includes(q) ||
      (enq.convertedJobId && enq.convertedJobId.toLowerCase().includes(q));

    return matchesTab && matchesType && matchesCategory && matchesSearch;
  });

  const handleOpenCreate = () => {
    setFormType('SERVICE');
    setFormCategory('CCTV');
    setFormSource('Phone');
    setFormDescription('');
    setIsQuickAddCustomer(false);
    setSelectedCustomerId(customers[0]?.id || '');
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setIsCreateModalOpen(true);
  };

  const handleCreateEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    let targetCustName = '';
    let targetCustPhone = '';
    let targetCustAddress = '';
    let targetCustId: string | undefined = undefined;

    if (isQuickAddCustomer) {
      if (!newCustName.trim() || !newCustPhone.trim() || !newCustAddress.trim()) {
        toast.error('Please enter customer name, phone, and address');
        return;
      }
    } else if (!customers.find((c) => c.id === selectedCustomerId)) {
      toast.error('Please select an existing customer or quick-add a new one');
      return;
    }

    // Checked before any server call so a failed check never leaves a half-created customer
    if (!formDescription.trim()) {
      toast.error('Please enter enquiry request details');
      return;
    }

    setSaving(true);
    try {
      if (isQuickAddCustomer) {
        const created = await addCustomer({
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          address: newCustAddress.trim(),
        });
        // Switch the form to the new customer so a retry does not add it twice
        setSelectedCustomerId(created.id);
        setIsQuickAddCustomer(false);
        targetCustName = created.name;
        targetCustPhone = created.phone;
        targetCustAddress = created.address;
        targetCustId = created.id;
      } else {
        const cust = customers.find((c) => c.id === selectedCustomerId)!;
        targetCustName = cust.name;
        targetCustPhone = cust.phone;
        targetCustAddress = cust.address;
        targetCustId = cust.id;
      }

      const created = await createEnquiry({
        customerName: targetCustName,
        customerPhone: targetCustPhone,
        customerAddress: targetCustAddress,
        customerId: targetCustId,
        enquiryType: formType,
        category: formCategory,
        source: formSource,
        description: formDescription.trim(),
        createdByUserId: currentUser?.id || 'usr-ceo',
      });

      toast.success(`Enquiry ${created.enquiryNumber} recorded.`);
      setIsCreateModalOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteEnquiry || !noteText.trim() || saving) return;

    setSaving(true);
    try {
      await addEnquiryFollowUpNote(noteEnquiry.id, noteText.trim());
      toast.success('Follow-up note recorded.');
      setNoteText('');
      setNoteEnquiry(null);
      // The open enquiry view picks up the new note via the enquiries sync effect above
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmApprove = async (enquiry: Enquiry) => {
    if (saving) return;
    if (window.confirm(`Approve enquiry ${enquiry.enquiryNumber}?`)) {
      setSaving(true);
      try {
        await approveEnquiry(enquiry.id);
        toast.success(`Enquiry ${enquiry.enquiryNumber} approved. Click "Assign Job" to dispatch crew.`);
        if (viewEnquiry && viewEnquiry.id === enquiry.id) {
          setViewEnquiry((prev) => (prev ? { ...prev, status: 'APPROVED' } : null));
        }
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setSaving(false);
      }
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!cancelModalEnquiry || !cancelReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }

    setSaving(true);
    try {
      await cancelEnquiry(cancelModalEnquiry.id, cancelReason.trim());
      toast.info(`Enquiry ${cancelModalEnquiry.enquiryNumber} marked as cancelled.`);
      setCancelModalEnquiry(null);
      setCancelReason('');
      if (viewEnquiry && viewEnquiry.id === cancelModalEnquiry.id) {
        setViewEnquiry(null);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleViewLinkedJob = (jobId: string, enquiryType: EnquiryType) => {
    if (onNavigateToJob) {
      onNavigateToJob(jobId, enquiryType);
    } else {
      const j = jobs.find((item) => item.id === jobId || item.jobNumber === jobId);
      if (j) {
        setInspectedJob(j);
      } else {
        toast.info(`Navigating to Job ${jobId}`);
      }
    }
  };

  return (
    <div className="space-y-4 w-full pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-md border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Enquiries ({filteredEnquiries.length})
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold border border-slate-200">
              Total {enquiries.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operations pipeline intake: triage customer calls, log surveys, and convert to field jobs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            className="text-xs font-semibold shadow-2xs rounded-md"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New Enquiry
          </Button>
        </div>
      </div>

      {/* Filter Tabs matching Robotics ERP reference */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { id: 'ALL', label: 'All', count: enquiries.length },
          { id: 'TODAYS', label: "Today's", count: todaysCount },
          { id: 'FOLLOW_UP', label: 'Follow-up', count: followUpCount },
          { id: 'APPROVED', label: 'Approved', count: approvedCount },
          { id: 'CANCELLED', label: 'Cancelled', count: cancelledCount },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as 'ALL' | 'TODAYS' | EnquiryStatus)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-orange-500 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono font-bold ${
                  isActive ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search and Category Filters Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-2.5 rounded-md border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search by ID, customer, phone, or scope..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-8 bg-slate-50 border-slate-200 rounded-md"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs h-8 px-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-700 focus:outline-none focus:border-orange-500 font-medium"
          >
            <option value="ALL">All Categories</option>
            {SERVICE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | EnquiryType)}
            className="text-xs h-8 px-2.5 rounded-md border border-slate-300 bg-slate-50 text-slate-700 focus:outline-none focus:border-orange-500 font-medium"
          >
            <option value="ALL">All Types</option>
            <option value="SERVICE">Service</option>
            <option value="INSTALLATION">Installation</option>
          </select>
        </div>
      </div>

      {/* Robotics ERP Data Table View */}
      <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-32 whitespace-nowrap">ID</th>
                <th className="min-w-[190px]">Customer</th>
                <th className="min-w-[190px]">Work Type</th>
                <th className="w-28 whitespace-nowrap">Referred By</th>
                <th className="w-36 whitespace-nowrap">Assigned Technician</th>
                <th className="w-24 text-right whitespace-nowrap">Amount</th>
                <th className="w-28 text-center whitespace-nowrap">Start Date</th>
                <th className="w-28 text-center whitespace-nowrap">Status</th>
                <th className="w-56 text-right pr-4 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnquiries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-500">
                    <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="font-semibold text-slate-700 text-sm">No enquiries found</div>
                    <p className="text-xs text-slate-500 mt-1">
                      No records match the active filter or search criteria.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEnquiries.map((enq) => {
                  const linkedJob = jobs.find(
                    (j) => j.id === enq.convertedJobId || j.enquiryId === enq.id
                  );

                  // Determine assigned technician
                  let assignedTechName: string | null = null;
                  if (linkedJob) {
                    const leadUser = users.find((u) => u.id === linkedJob.teamLeadUserId);
                    if (leadUser) assignedTechName = leadUser.name;
                    else if (linkedJob.assignedTeam.length > 0) {
                      const firstUser = users.find((u) => u.id === linkedJob.assignedTeam[0]);
                      if (firstUser) assignedTechName = firstUser.name;
                    }
                  }

                  // Determine amount
                  const amountValue = linkedJob?.serviceAmount;

                  return (
                    <tr key={enq.id} className="transition-colors hover:bg-slate-50/90">
                      {/* 1. ID & Creator */}
                      <td className="whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => setViewEnquiry(enq)}
                            className="font-bold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer font-mono"
                          >
                            #{enq.enquiryNumber}
                          </button>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                            <UserCheck className="w-3 h-3 text-slate-400" />
                            {formatCreatedBy(enq.createdByUserId, users)}
                          </span>
                        </div>
                      </td>

                      {/* 2. Customer */}
                      <td>
                        <div className="font-bold text-slate-900 leading-tight truncate max-w-[200px]">
                          {enq.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                          {enq.customerPhone} &bull; {enq.customerAddress}
                        </div>
                      </td>

                      {/* 3. Work Type */}
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {enq.category}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            ({enq.enquiryType === 'SERVICE' ? 'Service' : 'Installation'})
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 mt-1 line-clamp-1 max-w-[220px]">
                          {enq.description}
                        </div>
                      </td>

                      {/* 4. Referred By */}
                      <td className="text-slate-700 whitespace-nowrap">
                        {enq.source ? (
                          <span className="text-xs font-medium">{enq.source}</span>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      {/* 5. Assigned Technician */}
                      <td className="whitespace-nowrap">
                        {assignedTechName ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-800">
                            <UserCheck className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                            <span className="truncate max-w-[120px]">{assignedTechName}</span>
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* 6. Amount */}
                      <td className="text-right font-mono whitespace-nowrap">
                        {amountValue && amountValue > 0 ? (
                          <span className="font-bold text-slate-900">{formatINR(amountValue)}</span>
                        ) : (
                          <span className="text-slate-400">&mdash;</span>
                        )}
                      </td>

                      {/* 7. Start Date */}
                      <td className="text-center font-mono text-xs text-slate-600 whitespace-nowrap">
                        {formatDate(enq.createdAt)}
                      </td>

                      {/* 8. Status */}
                      <td className="text-center whitespace-nowrap">
                        {enq.status === 'FOLLOW_UP' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Follow-up
                          </span>
                        )}
                        {enq.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Approved
                          </span>
                        )}
                        {enq.status === 'CANCELLED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            Cancelled
                          </span>
                        )}
                      </td>

                      {/* 9. Action */}
                      <td className="text-right pr-4 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Standardized Primary CTA Button (Exact same 108px width across all states) */}
                          {enq.status === 'APPROVED' && enq.convertedJobId ? (
                            <button
                              type="button"
                              onClick={() => handleViewLinkedJob(enq.convertedJobId!, enq.enquiryType)}
                              className="w-[108px] h-7 px-2 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                              title="View dispatched job details"
                            >
                              <span>View Job</span>
                              <span>&rarr;</span>
                            </button>
                          ) : enq.status === 'APPROVED' && !enq.convertedJobId ? (
                            <button
                              type="button"
                              onClick={() => setJobCreateEnquiry(enq)}
                              className="w-[108px] h-7 px-2 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                              title="Assign crew and launch job"
                            >
                              <UserCheck className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                              <span>Assign Job</span>
                              <span>&rarr;</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setViewEnquiry(enq)}
                              className="w-[108px] h-7 px-2 rounded-md text-xs font-bold bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 shadow-2xs cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                              title="View and edit enquiry"
                            >
                              <span>Edit/View</span>
                              <span>&rarr;</span>
                            </button>
                          )}

                          {/* Quick View Details Icon (Always present in column slot 2) */}
                          <button
                            type="button"
                            onClick={() => setViewEnquiry(enq)}
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                            title="Quick View Enquiry Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Cancel Action (or column placeholder spacer if cancelled) */}
                          {enq.status !== 'CANCELLED' && isManagement ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelModalEnquiry(enq);
                                setCancelReason('');
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer transition-colors"
                              title="Cancel Enquiry"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="w-7 h-7 inline-block" />
                          )}

                          {/* Delete Action (CEO Only) */}
                          {currentUser?.role === 'CEO' && (
                            <button
                              type="button"
                              onClick={() => setDeletingEnquiry(enq)}
                              className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                              title="Delete Enquiry (CEO Only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      </div>

      {/* MODAL: View / Edit Enquiry Details */}
      {/* MODAL 0: View / Edit Enquiry */}
      {viewEnquiry && (
        <Modal
          isOpen={Boolean(viewEnquiry)}
          onClose={() => setViewEnquiry(null)}
          maxWidth="xl"
          showCloseButton={false}
          className="max-h-[90vh]"
          bodyClassName="p-0 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
                <Inbox className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 font-mono truncate">
                    #{viewEnquiry.enquiryNumber}
                  </h2>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-bold shrink-0 ${
                      viewEnquiry.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                        : viewEnquiry.status === 'CANCELLED'
                        ? 'bg-rose-50 text-rose-800 border border-rose-300'
                        : 'bg-amber-50 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {viewEnquiry.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                  <span>Received {formatDate(viewEnquiry.createdAt)}</span>
                  <span>&bull;</span>
                  <span>Source: {viewEnquiry.source || 'Direct'}</span>
                  <span>&bull;</span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                    <User className="w-3 h-3 text-slate-400" />
                    {formatCreatedBy(viewEnquiry.createdByUserId, users)}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewEnquiry(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs overscroll-contain">
              {/* Customer & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-md bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Customer</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {viewEnquiry.customerName}
                  </div>
                  <div className="text-slate-600 mt-0.5">{viewEnquiry.customerPhone}</div>
                  <div className="text-slate-500 mt-0.5">{viewEnquiry.customerAddress}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Work Scope</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {viewEnquiry.category} ({viewEnquiry.enquiryType})
                  </div>
                  <p className="text-slate-700 mt-1 leading-relaxed">{viewEnquiry.description}</p>
                </div>
              </div>

              {/* Follow-up History */}
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                    Follow-up Notes ({viewEnquiry.followUpNotes.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {viewEnquiry.status === 'FOLLOW_UP' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 rounded font-semibold flex items-center gap-1 cursor-pointer"
                        onClick={() => handleOpenReminder(viewEnquiry)}
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Send Reminder
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setNoteEnquiry(viewEnquiry);
                        setNoteText('');
                      }}
                      className="text-orange-600 hover:text-orange-700 font-bold text-xs cursor-pointer"
                    >
                      + Add Note
                    </button>
                  </div>
                </div>

                {viewEnquiry.followUpNotes.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {viewEnquiry.followUpNotes.map((note) => (
                      <div
                        key={note.id}
                        className="p-2.5 rounded bg-white border border-slate-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-700">{note.createdByUserName || 'Staff'}</span>
                          <span>{formatDateTime(note.createdAt)}</span>
                        </div>
                        <p className="text-slate-800 whitespace-pre-line leading-relaxed">{note.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic text-[11px]">
                    No follow-up notes yet. Click "+ Add Note" or "Send Reminder" to log interaction history.
                  </p>
                )}
              </div>

              {/* Linked Quotations Section (Phase 15.5: In-Place Edit & No Duplicates) */}
              {(() => {
                const linkedQuotes = quotations.filter((q) => q.enquiryId === viewEnquiry.id);
                const hasQuotes = linkedQuotes.length > 0;
                const primaryQuote = linkedQuotes[0];

                return (
                  <div className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-orange-600" />
                        Linked Quotations ({linkedQuotes.length})
                      </span>
                      {viewEnquiry.status === 'FOLLOW_UP' && isManagement && (
                        <div className="flex items-center gap-1.5">
                          {hasQuotes ? (
                            <>
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                                onClick={() => {
                                  setEditingQuotation(primaryQuote);
                                  setQuotationEnquiry(viewEnquiry);
                                }}
                                title="Edit existing quotation in-place without creating duplicates"
                              >
                                <Edit className="w-3 h-3" /> Edit Quotation
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] text-slate-600 hover:text-orange-700 hover:bg-orange-50 border-slate-300 rounded cursor-pointer"
                                onClick={() => {
                                  setEditingQuotation(null);
                                  setQuotationEnquiry(viewEnquiry);
                                }}
                                title="Deliberately create an alternate additional quotation"
                              >
                                <Plus className="w-3 h-3 mr-0.5" /> + Create Additional Quotation
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 rounded font-semibold cursor-pointer"
                              onClick={() => {
                                setEditingQuotation(null);
                                setQuotationEnquiry(viewEnquiry);
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" /> Create Quotation
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {hasQuotes ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {linkedQuotes.map((q) => (
                          <div
                            key={q.id}
                            className="flex items-center justify-between p-2 rounded bg-white border border-slate-200 text-xs hover:border-orange-300 transition-colors"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-orange-600">{q.quotationNo}</span>
                              <Badge
                                variant={quotationStatusMeta(q.status).variant}
                                className="text-[10px] rounded"
                              >
                                {quotationStatusMeta(q.status).label}
                              </Badge>
                              {q.whatsappSharedAt && (
                                <Badge variant="success" className="text-[10px] rounded bg-emerald-50 text-emerald-700 border-emerald-200">
                                  WhatsApp Sent
                                </Badge>
                              )}
                              <span className="text-slate-500 font-mono text-[11px]">{formatDate(q.date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 mr-1">{formatINR(q.grandTotal)}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] text-orange-700 hover:text-orange-800 hover:bg-orange-50 border-orange-300 rounded cursor-pointer flex items-center gap-1 font-semibold"
                                onClick={() => {
                                  setEditingQuotation(q);
                                  setQuotationEnquiry(viewEnquiry);
                                }}
                                title="Edit this quotation in-place"
                              >
                                <Edit className="w-3 h-3" /> Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] text-slate-600 hover:text-slate-800 hover:bg-slate-50 border-slate-200 rounded cursor-pointer flex items-center gap-1"
                                onClick={() => setPreviewQuotation(q)}
                              >
                                <Eye className="w-3 h-3" /> View
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic text-[11px]">
                        No quotation generated yet. Click "Create Quotation" to create an estimate linked to this enquiry.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Pinned Action Buttons Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-2">
                  {viewEnquiry.status === 'FOLLOW_UP' && isManagement && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-amber-700 hover:bg-amber-50 border-amber-300 rounded-md flex items-center gap-1"
                      onClick={() => {
                        setCancelModalEnquiry(viewEnquiry);
                        setCancelReason('');
                      }}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancel Enquiry
                    </Button>
                  )}
                  {currentUser?.role === 'CEO' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs text-rose-600 hover:bg-rose-50 border-rose-300 rounded-md font-semibold flex items-center gap-1 cursor-pointer"
                      onClick={() => setDeletingEnquiry(viewEnquiry)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Enquiry
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setViewEnquiry(null)}
                    className="text-xs rounded-md"
                  >
                    Close
                  </Button>

                  {viewEnquiry.status === 'FOLLOW_UP' && isManagement && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleConfirmApprove(viewEnquiry)}
                      disabled={saving}
                      className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Enquiry
                    </Button>
                  )}

                  {viewEnquiry.status === 'APPROVED' && !viewEnquiry.convertedJobId && isManagement && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => {
                        setJobCreateEnquiry(viewEnquiry);
                        setViewEnquiry(null);
                      }}
                      className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Assign Job &rarr;
                    </Button>
                  )}

                  {viewEnquiry.status === 'APPROVED' && viewEnquiry.convertedJobId && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        handleViewLinkedJob(viewEnquiry.convertedJobId!, viewEnquiry.enquiryType);
                        setViewEnquiry(null);
                      }}
                      className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center gap-1.5"
                    >
                      View Job &rarr;
                    </Button>
                  )}
                </div>
              </div>
        </Modal>
      )}

      {/* MODAL 1: Create New Enquiry */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          maxWidth="xl"
          showCloseButton={false}
          className="max-h-[90vh]"
          bodyClassName="p-0 flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 font-display">
                  New Customer Enquiry
                </h2>
                <p className="text-xs text-slate-500">
                  First step of operations pipeline &mdash; status starts in Follow-up
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateEnquiry} className="flex-1 flex flex-col overflow-hidden text-xs">
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 overscroll-contain">
              {/* Customer Selector / Quick Add */}
              <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs">Customer Information</span>
                  <button
                    type="button"
                    onClick={() => setIsQuickAddCustomer(!isQuickAddCustomer)}
                    className="text-orange-600 hover:text-orange-700 font-bold cursor-pointer text-xs"
                  >
                    {isQuickAddCustomer ? 'Select Existing Customer' : '+ Quick Add New Customer'}
                  </button>
                </div>

                {isQuickAddCustomer ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-slate-700 font-medium mb-1">Customer / Organization Name *</label>
                      <Input
                        required
                        placeholder="e.g. Apex Industrial Solutions"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="text-xs h-9 bg-white rounded-md"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-700 font-medium mb-1">Phone Number *</label>
                        <Input
                          required
                          placeholder="e.g. 9840112233"
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          className="text-xs h-9 bg-white rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-medium mb-1">Site Address *</label>
                        <Input
                          required
                          placeholder="e.g. Survey 42, Erode"
                          value={newCustAddress}
                          onChange={(e) => setNewCustAddress(e.target.value)}
                          className="text-xs h-9 bg-white rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Select Existing Customer *</label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full text-xs h-9 px-3 rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} &mdash; {c.phone} ({c.address.slice(0, 30)}...)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Enquiry Type & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Enquiry Type *</label>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setFormType('SERVICE')}
                      className={`h-9 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        formType === 'SERVICE'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Wrench className="w-3.5 h-3.5" /> Service
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType('INSTALLATION')}
                      className={`h-9 rounded-md border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        formType === 'INSTALLATION'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" /> Installation
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Inquiry Source</label>
                  <select
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value as EnquirySource)}
                    className="w-full text-xs h-9 px-3 rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                  >
                    {ENQUIRY_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Scope Category *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ServiceCategory)}
                  className="w-full text-xs h-9 px-3 rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
                >
                  {SERVICE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Customer Request / Problem Details *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Describe what the customer is requesting (e.g. 8-channel CCTV setup, gate motor breakdown, biometric enrollment failure)..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 leading-relaxed shadow-2xs"
                />
              </div>

            </div>

            {/* Pinned Create Enquiry Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" disabled={saving} className="rounded-xl text-xs font-semibold">
                Save Enquiry
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: Add Follow-up Note */}
      {noteEnquiry && (
        <Modal
          isOpen={Boolean(noteEnquiry)}
          onClose={() => setNoteEnquiry(null)}
          maxWidth="md"
          title="Log Follow-up Note"
          subtitle={`${noteEnquiry.enquiryNumber} • ${noteEnquiry.customerName}`}
          icon={<MessageSquare className="w-5 h-5" />}
        >
          <form onSubmit={handleSaveNote} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Follow-up Note (Call-back log, site visit update, pricing discussion) *
              </label>
              <textarea
                rows={4}
                required
                autoFocus
                placeholder="e.g. Spoke with client representative. Site survey scheduled for Thursday 2 PM..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 leading-relaxed shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setNoteEnquiry(null)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" disabled={saving} className="rounded-xl text-xs font-semibold">
                Record Note
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: Cancel Enquiry Confirmation */}
      {cancelModalEnquiry && (
        <Modal
          isOpen={Boolean(cancelModalEnquiry)}
          onClose={() => setCancelModalEnquiry(null)}
          maxWidth="md"
          title="Cancel Enquiry"
          subtitle={cancelModalEnquiry.enquiryNumber}
          icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
        >
          <form onSubmit={handleConfirmCancel} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Cancellation Reason (Free text) *
              </label>
              <textarea
                rows={4}
                required
                autoFocus
                placeholder="e.g. Client budget deferred to next quarter, opted for third-party solution, etc."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-rose-500 leading-relaxed shadow-2xs"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
              Once cancelled, this enquiry cannot be converted to a Job.
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setCancelModalEnquiry(null)}
                className="rounded-xl text-xs"
              >
                Back
              </Button>
              <Button type="submit" variant="danger" size="md" disabled={saving} className="rounded-xl text-xs font-semibold">
                Confirm Cancellation
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: Dispatch Follow-up Reminder (Part A) */}
      {reminderEnquiry && (
        <Modal
          isOpen={Boolean(reminderEnquiry)}
          onClose={() => setReminderEnquiry(null)}
          maxWidth="md"
          title="Dispatch Follow-up Reminder"
          subtitle={`#${reminderEnquiry.enquiryNumber}`}
          icon={<MessageCircle className="w-5 h-5 text-emerald-600" />}
        >
          <div className="space-y-3.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex justify-between items-center text-slate-600">
                <span>Customer:</span>
                <strong className="text-slate-900">{reminderEnquiry.customerName}</strong>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Phone:</span>
                <strong className="text-slate-900 font-mono">{reminderEnquiry.customerPhone}</strong>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Category:</span>
                <span className="font-semibold text-slate-800">
                  {reminderEnquiry.category} ({reminderEnquiry.enquiryType})
                </span>
              </div>
            </div>

            {/* Date & Time Picker */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-orange-600" />
                  Remind On
                </label>
                <Input
                  type="date"
                  value={remindDate}
                  onChange={(e) => setRemindDate(e.target.value)}
                  className="h-8 text-xs bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-orange-600" />
                  Remind At
                </label>
                <Input
                  type="time"
                  value={remindTime}
                  onChange={(e) => setRemindTime(e.target.value)}
                  className="h-8 text-xs bg-white"
                  required
                />
              </div>
            </div>

            {/* Honest Local Demo Disclaimer */}
            <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-950 text-[11px] leading-relaxed space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                Local Demo To-Do Record
              </div>
              <p className="text-amber-900/90">
                S Tec Secure runs client-side on local storage with no cloud background scheduler. Confirming creates a scheduled reminder record in <strong>Follow-up Notes</strong> for staff reference and to-do tracking, rather than an automated push notification.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setReminderEnquiry(null)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="success"
                size="md"
                className="rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                disabled={saving}
                onClick={async () => {
                  if (!remindDate || !remindTime) {
                    toast.error('Please select both date and time for the reminder.');
                    return;
                  }

                  let scheduledFormatted = `${remindDate} ${remindTime}`;
                  try {
                    const [y, m, d] = remindDate.split('-').map(Number);
                    const [hh, mm] = remindTime.split(':').map(Number);
                    const schedObj = new Date(y, m - 1, d, hh, mm);
                    scheduledFormatted =
                      schedObj.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      }) +
                      ', ' +
                      schedObj.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      });
                  } catch {
                    // fallback
                  }

                  const now = new Date();
                  const createdStr =
                    now.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }) +
                    ' ' +
                    now.toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                  const scheduledBy = currentUser?.name || 'Staff';
                  const noteText = `Reminder scheduled for ${scheduledFormatted} (Scheduled by ${scheduledBy} on ${createdStr})`;

                  setSaving(true);
                  try {
                    await addEnquiryFollowUpNote(reminderEnquiry.id, noteText);
                    // The open enquiry view picks up the server's note via the enquiries sync effect

                    toast.success(`Reminder scheduled for ${reminderEnquiry.customerName} on ${scheduledFormatted}`);
                    setReminderEnquiry(null);
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <MessageCircle className="w-4 h-4" />
                Send Reminder
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Delete Enquiry Confirmation (CEO Only) (Part C) */}
      {deletingEnquiry && (
        <Modal
          isOpen={Boolean(deletingEnquiry)}
          onClose={() => setDeletingEnquiry(null)}
          maxWidth="md"
          title="Delete Enquiry Permanently"
          subtitle={`#${deletingEnquiry.enquiryNumber}`}
          icon={<Trash2 className="w-5 h-5 text-rose-600" />}
        >
          <div className="space-y-3.5 text-xs">
            <p className="text-slate-700 leading-relaxed">
              This will permanently delete enquiry <strong className="font-mono text-slate-900">#{deletingEnquiry.enquiryNumber}</strong> ({deletingEnquiry.customerName}) from the system. This action cannot be undone.
            </p>

              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-[11px] leading-relaxed">
                <strong>CEO Delete Action:</strong> All follow-up logs and record links for this enquiry will be permanently removed.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setDeletingEnquiry(null)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  className="rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await deleteEnquiry(deletingEnquiry.id);
                      toast.success(`Enquiry ${deletingEnquiry.enquiryNumber} permanently deleted.`);
                      if (viewEnquiry && viewEnquiry.id === deletingEnquiry.id) {
                        setViewEnquiry(null);
                      }
                      setDeletingEnquiry(null);
                    } catch (err) {
                      toast.error(errorMessage(err));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Permanently Delete
                </Button>
              </div>
            </div>
        </Modal>
      )}

      {/* Embedded JobCreateModal when approved */}
      <JobCreateModal
        isOpen={Boolean(jobCreateEnquiry)}
        initialEnquiry={jobCreateEnquiry}
        initialType={jobCreateEnquiry?.enquiryType || 'SERVICE'}
        onClose={() => setJobCreateEnquiry(null)}
        onJobCreated={(newJob) => {
          setJobCreateEnquiry(null);
          toast.success(`Enquiry converted to Job ${newJob.jobNumber}.`);
        }}
      />

      {/* Embedded QuotationBuilderModal for generating / editing estimates from enquiries */}
      {quotationEnquiry && (
        <QuotationBuilderModal
          isOpen={Boolean(quotationEnquiry)}
          initialCustomerId={quotationEnquiry.customerId}
          initialEnquiryId={quotationEnquiry.id}
          quotationToEdit={editingQuotation}
          onClose={() => {
            setQuotationEnquiry(null);
            setEditingQuotation(null);
          }}
          onQuotationSaved={(savedQuot) => {
            if (viewEnquiry && viewEnquiry.id === quotationEnquiry.id) {
              setViewEnquiry({
                ...viewEnquiry,
                quotationId: savedQuot.id,
              });
            }
            setQuotationEnquiry(null);
            setEditingQuotation(null);
            setPreviewQuotation(savedQuot);
          }}
        />
      )}

      {/* Embedded QuotationPreviewModal for inspecting linked quotation (with in-place Edit support) */}
      <QuotationPreviewModal
        isOpen={Boolean(previewQuotation)}
        quotation={previewQuotation}
        onClose={() => setPreviewQuotation(null)}
        onEdit={(q) => {
          setEditingQuotation(q);
          const enq = enquiries.find((e) => e.id === q.enquiryId) || viewEnquiry;
          setQuotationEnquiry(enq || ({ id: q.enquiryId || '', customerId: q.customerNumber } as any));
        }}
      />

      {/* Embedded JobDetailModal for inspecting linked job */}
      <JobDetailModal
        isOpen={Boolean(inspectedJob)}
        job={inspectedJob}
        onClose={() => setInspectedJob(null)}
      />
    </div>
  );
};
