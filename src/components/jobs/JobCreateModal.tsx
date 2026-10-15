import React, { useState, useEffect, useRef } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import {
  Job,
  JobType,
  CustomerStatus,
  ServiceCategory,
  SERVICE_CATEGORIES,
  Enquiry,
  Quotation,
  Customer,
} from '@/lib/stecsecure-types';
import {
  X,
  Plus,
  Users,
  Wrench,
  ShieldCheck,
  Check,
  UserCheck,
  FileSpreadsheet,
  Layers,
  FilePlus2,
  MapPin,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { QuotationBuilderModal } from '@/components/quotations/QuotationBuilderModal';
import { QuotationPreviewModal } from '@/components/quotations/QuotationPreviewModal';
import { formatDate } from '@/lib/utils';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';

const JOB_FORM_DRAFT_KEY = 'stec_job_creation_draft_v1';

export type QuotationSelectionMode = 'NONE' | 'CREATE_NEW' | 'EXISTING';

interface JobCreateModalProps {
  isOpen: boolean;
  initialType?: JobType;
  initialEnquiry?: Enquiry | null;
  onClose: () => void;
  onOpenQuotationBuilder?: (customerId: string) => void;
  onJobCreated?: (job: Job) => void;
}

export const JobCreateModal: React.FC<JobCreateModalProps> = ({
  isOpen,
  initialType = 'SERVICE',
  initialEnquiry = null,
  onClose,
  onOpenQuotationBuilder,
  onJobCreated,
}) => {
  const {
    customers,
    users,
    quotations,
    createJob,
    addCustomer,
    updateCustomer,
    currentUser,
  } = useStecSecure();

  const technicians = users.filter((u) => u.role === 'TECHNICIAN');

  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [isQuickAddCustomer, setIsQuickAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustGstin, setNewCustGstin] = useState('');
  const [newCustSiteLocation, setNewCustSiteLocation] = useState('');

  const [jobType, setJobType] = useState<JobType>(initialType);
  const [category, setCategory] = useState<ServiceCategory>('CCTV');
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>('OTHERS');
  // Phase 22: planned visit and the person to call at site
  const [scheduledFor, setScheduledFor] = useState('');
  const [siteContactName, setSiteContactName] = useState('');
  const [siteContactPhone, setSiteContactPhone] = useState('');
  const [problemReported, setProblemReported] = useState('');
  const [siteLocationInput, setSiteLocationInput] = useState('');

  // Team Assignment & Lead
  const [assignedTeam, setAssignedTeam] = useState<string[]>(
    technicians[0]?.id ? [technicians[0].id] : []
  );
  const [teamLeadUserId, setTeamLeadUserId] = useState<string>(technicians[0]?.id || '');

  // Two-path Quotation States
  const [quotationMode, setQuotationMode] = useState<QuotationSelectionMode>('NONE');
  const [selectedQuotationId, setSelectedQuotationId] = useState<string>('');
  const [isQuotationBuilderOpen, setIsQuotationBuilderOpen] = useState(false);
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);

  // Phase 21: actions run on the server — block double submits, and remember the customer
  // this form already registered so a retry after a failed save does not add it twice
  const [saving, setSaving] = useState(false);
  const quickAddedCustomerRef = useRef<Customer | null>(null);

  // Audit Enquiry -> Linked Quotation handoff (Phase 12 Part C)
  const linkedEnquiryQuotation = React.useMemo(() => {
    if (!initialEnquiry) return null;
    return (
      quotations.find(
        (q) =>
          (initialEnquiry.quotationId &&
            (q.id === initialEnquiry.quotationId || q.quotationNo === initialEnquiry.quotationId)) ||
          q.enquiryId === initialEnquiry.id
      ) || null
    );
  }, [initialEnquiry, quotations]);

  // Sync / Restore Draft State on Modal Open
  useEffect(() => {
    if (isOpen) {
      if (initialEnquiry) {
        setJobType(initialEnquiry.enquiryType);
        setCategory(initialEnquiry.category);
        setProblemReported(initialEnquiry.description);

        // Link quotation from enquiry if exists (Phase 12 Part C)
        const matchedQuot = quotations.find(
          (q) =>
            (initialEnquiry.quotationId &&
              (q.id === initialEnquiry.quotationId || q.quotationNo === initialEnquiry.quotationId)) ||
            q.enquiryId === initialEnquiry.id
        );
        if (matchedQuot) {
          setSelectedQuotationId(matchedQuot.id);
          setQuotationMode('EXISTING');
        } else {
          setSelectedQuotationId('');
          setQuotationMode('NONE');
        }

        const matchedCust = customers.find(
          (c) =>
            (initialEnquiry.customerId && c.id === initialEnquiry.customerId) ||
            c.phone === initialEnquiry.customerPhone ||
            c.name.toLowerCase() === initialEnquiry.customerName.toLowerCase()
        );

        if (matchedCust) {
          setSelectedCustomerId(matchedCust.id);
          setIsQuickAddCustomer(false);
        } else {
          setIsQuickAddCustomer(true);
          setNewCustName(initialEnquiry.customerName);
          setNewCustPhone(initialEnquiry.customerPhone);
          setNewCustAddress(initialEnquiry.customerAddress);
          setNewCustGstin('');
        }
        try {
          localStorage.removeItem(JOB_FORM_DRAFT_KEY);
        } catch {
          // ignore
        }
      } else {
        // Check for saved in-progress draft
        try {
          const saved = localStorage.getItem(JOB_FORM_DRAFT_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.jobType) setJobType(parsed.jobType);
            if (parsed.selectedCustomerId) setSelectedCustomerId(parsed.selectedCustomerId);
            if (typeof parsed.isQuickAddCustomer === 'boolean') {
              setIsQuickAddCustomer(parsed.isQuickAddCustomer);
            }
            if (parsed.newCustName) setNewCustName(parsed.newCustName);
            if (parsed.newCustPhone) setNewCustPhone(parsed.newCustPhone);
            if (parsed.newCustAddress) setNewCustAddress(parsed.newCustAddress);
            if (parsed.newCustGstin) setNewCustGstin(parsed.newCustGstin);
            if (parsed.category) setCategory(parsed.category);
            if (parsed.customerStatus) setCustomerStatus(parsed.customerStatus);
            if (parsed.problemReported) setProblemReported(parsed.problemReported);
            if (Array.isArray(parsed.assignedTeam) && parsed.assignedTeam.length > 0) {
              setAssignedTeam(parsed.assignedTeam);
            }
            if (parsed.teamLeadUserId) setTeamLeadUserId(parsed.teamLeadUserId);
            if (parsed.quotationMode) setQuotationMode(parsed.quotationMode);
            if (parsed.selectedQuotationId) setSelectedQuotationId(parsed.selectedQuotationId);
            return;
          }
        } catch {
          // ignore
        }
        // Fallback default
        setJobType(initialType);
      }
    }
  }, [isOpen, initialType, initialEnquiry, customers]);

  // Persist In-Progress Form State to LocalStorage (Draft)
  useEffect(() => {
    if (isOpen && !initialEnquiry) {
      const draft = {
        jobType,
        selectedCustomerId,
        isQuickAddCustomer,
        newCustName,
        newCustPhone,
        newCustAddress,
        newCustGstin,
        category,
        customerStatus,
        problemReported,
        assignedTeam,
        teamLeadUserId,
        quotationMode,
        selectedQuotationId,
      };
      try {
        localStorage.setItem(JOB_FORM_DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // ignore
      }
    }
  }, [
    isOpen,
    initialEnquiry,
    jobType,
    selectedCustomerId,
    isQuickAddCustomer,
    newCustName,
    newCustPhone,
    newCustAddress,
    newCustGstin,
    category,
    customerStatus,
    problemReported,
    assignedTeam,
    teamLeadUserId,
    quotationMode,
    selectedQuotationId,
  ]);

  // Keep teamLeadUserId valid if assignedTeam changes
  useEffect(() => {
    if (assignedTeam.length > 0 && !assignedTeam.includes(teamLeadUserId)) {
      setTeamLeadUserId(assignedTeam[0]);
    }
  }, [assignedTeam, teamLeadUserId]);

  if (!isOpen) return null;

  const toggleTechnician = (techId: string) => {
    setAssignedTeam((prev) => {
      const exists = prev.includes(techId);
      if (exists) {
        return prev.filter((id) => id !== techId);
      } else {
        return [...prev, techId];
      }
    });
  };

  const currentCustomer = customers.find((c) => c.id === selectedCustomerId);

  const handleSaveCustomerMapLink = async () => {
    if (!siteLocationInput.trim()) return;
    if (selectedCustomerId) {
      setSaving(true);
      try {
        await updateCustomer(selectedCustomerId, { siteLocationMapLink: siteLocationInput.trim() });
        toast.success('Site location map link saved to customer profile.');
        setSiteLocationInput('');
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setSaving(false);
      }
    }
  };

  // Phase 21: add the quick-add customer once; a retry after a failed save reuses it
  const registerQuickAddCustomer = async (): Promise<{ customer: Customer; isNew: boolean }> => {
    const previous = quickAddedCustomerRef.current;
    if (previous && previous.name === newCustName.trim() && previous.phone === newCustPhone.trim()) {
      return { customer: previous, isNew: false };
    }
    const customer = await addCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
      gstin: newCustGstin.trim() || undefined,
      siteLocationMapLink: newCustSiteLocation.trim() || undefined,
    });
    quickAddedCustomerRef.current = customer;
    return { customer, isNew: true };
  };

  // Quotation calculations
  const selectedQuotation = quotations.find((q) => q.id === selectedQuotationId);

  const handleLaunchNewQuotation = async () => {
    let targetCustId = selectedCustomerId;

    if (isQuickAddCustomer) {
      if (!newCustName.trim() || !newCustPhone.trim() || !newCustAddress.trim()) {
        toast.error('Please enter customer name, phone, and address first');
        return;
      }
      setSaving(true);
      try {
        const { customer: created, isNew } = await registerQuickAddCustomer();
        targetCustId = created.id;

        setSelectedCustomerId(created.id);
        setIsQuickAddCustomer(false);
        if (isNew) toast.success(`Customer ${created.name} registered.`);
      } catch (err) {
        toast.error(errorMessage(err));
        return;
      } finally {
        setSaving(false);
      }
    }

    if (!targetCustId) {
      toast.error('Please select or add a customer first');
      return;
    }

    setQuotationMode('CREATE_NEW');

    if (onOpenQuotationBuilder) {
      onOpenQuotationBuilder(targetCustId);
    } else {
      setIsQuotationBuilderOpen(true);
    }
  };

  const handleQuotationSaved = (newQuot: Quotation) => {
    setSelectedQuotationId(newQuot.id);
    setIsQuotationBuilderOpen(false);
    toast.success(`Quotation ${newQuot.quotationNo} generated and attached to this job.`);
  };

  const handleCancel = () => {
    try {
      localStorage.removeItem(JOB_FORM_DRAFT_KEY);
    } catch {
      // ignore
    }
    // Reset fields to demo baseline
    setSelectedCustomerId(customers[0]?.id || '');
    setIsQuickAddCustomer(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setNewCustGstin('');
    setJobType(initialType);
    setCategory('CCTV');
    setCustomerStatus('AMC');
    setProblemReported('');
    setAssignedTeam(technicians[0]?.id ? [technicians[0].id] : []);
    setTeamLeadUserId(technicians[0]?.id || '');
    setQuotationMode('NONE');
    setSelectedQuotationId('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Validate everything before any server call, so a failed check never leaves a half-created customer
    if (isQuickAddCustomer) {
      if (!newCustName.trim() || !newCustPhone.trim() || !newCustAddress.trim()) {
        toast.error('Please enter customer name, phone, and address');
        return;
      }
    } else if (!selectedCustomerId) {
      toast.error('Please select or add a customer');
      return;
    }

    if (assignedTeam.length === 0) {
      toast.error('Please assign at least one technician');
      return;
    }

    const leadId = teamLeadUserId || assignedTeam[0];

    if (!problemReported.trim()) {
      toast.error('Please describe the scope of work or problem reported');
      return;
    }

    setSaving(true);
    try {
      let targetCustomerId = selectedCustomerId;

      if (isQuickAddCustomer) {
        const { customer: created, isNew } = await registerQuickAddCustomer();
        targetCustomerId = created.id;

        if (isNew) toast.success(`Customer ${created.name} added.`);
      } else if (siteLocationInput.trim() && targetCustomerId) {
        await updateCustomer(targetCustomerId, { siteLocationMapLink: siteLocationInput.trim() });
      }

      const newJob = await createJob({
        type: jobType,
        category,
        customerNumber: targetCustomerId,
        customerStatus,
        assignedTeam,
        teamLeadUserId: leadId,
        enquiryId: initialEnquiry?.id,
        quotationId: selectedQuotationId || linkedEnquiryQuotation?.id || undefined,
        createdByUserId: currentUser?.id,
        productModel: `${category} ${jobType === 'SERVICE' ? 'Service' : 'Installation'} Job`,
        problemReported: problemReported.trim(),
        serviceAmount: 0,
        taxable: true,
        status: 'ASSIGNED',
        scheduledFor: scheduledFor || undefined,
        siteContactName: siteContactName.trim() || undefined,
        siteContactPhone: siteContactPhone.replace(/\D/g, '').slice(-10) || undefined,
      });
      setScheduledFor('');
      setSiteContactName('');
      setSiteContactPhone('');

      try {
        localStorage.removeItem(JOB_FORM_DRAFT_KEY);
      } catch {
        // ignore
      }

      if (onJobCreated) {
        onJobCreated(newJob);
      }

      const leadUser = users.find((u) => u.id === leadId);
      toast.success(`Job ${newJob.jobNumber} assigned to ${leadUser?.name}.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCancel}
        maxWidth="2xl"
        showCloseButton={false}
        className="max-h-[90vh]"
        bodyClassName="p-0 flex flex-col overflow-hidden"
      >
        {/* Pinned Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                jobType === 'SERVICE'
                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {jobType === 'SERVICE' ? (
                <Wrench className="w-5 h-5" />
              ) : (
                <Layers className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-display">
                {initialEnquiry
                  ? `Assign Job (${initialEnquiry.enquiryType === 'SERVICE' ? 'Service' : 'Installation'})`
                  : `Create New ${jobType === 'SERVICE' ? 'Service' : 'Installation'} Job`}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {initialEnquiry
                  ? `Converting Enquiry #${initialEnquiry.enquiryNumber} • Assign team and launch dispatch`
                  : 'Fresh team assignment with dedicated Team Lead authority'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden text-xs">
          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain">
            {/* 1. Department / Job Type: Read-only badge when from Enquiry, minimal toggle when standalone (Part A) */}
            {initialEnquiry ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Department / Job Type:</span>
                  <Badge
                    variant={jobType === 'SERVICE' ? 'default' : 'success'}
                    className="text-xs font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5"
                  >
                    {jobType === 'SERVICE' ? (
                      <Wrench className="w-3.5 h-3.5" />
                    ) : (
                      <Layers className="w-3.5 h-3.5" />
                    )}
                    {jobType === 'SERVICE' ? 'Service Job' : 'Installation Job'}
                  </Badge>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  Inherited from Enquiry #{initialEnquiry.enquiryNumber}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-semibold text-slate-700">Department / Job Type:</span>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setJobType('SERVICE')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      jobType === 'SERVICE'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Service
                  </button>
                  <button
                    type="button"
                    onClick={() => setJobType('INSTALLATION')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      jobType === 'INSTALLATION'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Installation
                  </button>
                </div>
              </div>
            )}

            {/* 2. Customer Selection / Quick Add & Site Location (Part C) */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Customer Details *
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickAddCustomer(!isQuickAddCustomer)}
                  className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold cursor-pointer"
                >
                  {isQuickAddCustomer ? '← Select Existing Customer' : '+ Quick-Add New Customer'}
                </button>
              </div>

              {!isQuickAddCustomer ? (
                <div className="space-y-2">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value);
                      setSiteLocationInput('');
                    }}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.phone} ({c.address.slice(0, 35)}...)
                      </option>
                    ))}
                  </select>

                  {/* Part C: Site Location for Selected Customer */}
                  {currentCustomer && (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-orange-600" />
                          Site Location (Google Maps)
                        </span>
                        {currentCustomer.siteLocationMapLink && (
                          <a
                            href={currentCustomer.siteLocationMapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View on Google Maps
                          </a>
                        )}
                      </div>

                      {currentCustomer.siteLocationMapLink ? (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                          <div className="flex items-center gap-2 text-emerald-950 truncate mr-2">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-[11px] font-mono truncate text-emerald-900">
                              {currentCustomer.siteLocationMapLink}
                            </span>
                          </div>
                          <a
                            href={currentCustomer.siteLocationMapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded bg-white text-emerald-700 hover:bg-emerald-100/60 border border-emerald-300 font-bold text-[10px] shrink-0 shadow-2xs inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open Maps
                          </a>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="Add site location link (e.g. https://maps.app.goo.gl/...)"
                              value={siteLocationInput}
                              onChange={(e) => setSiteLocationInput(e.target.value)}
                              className="text-xs h-8 bg-white font-mono flex-1 border-slate-300"
                            />
                            {siteLocationInput.trim() && (
                              <button
                                type="button"
                                onClick={handleSaveCustomerMapLink}
                                disabled={saving}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shrink-0 shadow-2xs cursor-pointer flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Save Link
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 italic">
                            Optional: saving a Google Maps link updates this client profile for future dispatch.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Input
                      placeholder="Customer / Company Name *"
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className="text-xs h-9 bg-white"
                    />
                    <Input
                      placeholder="Phone Number *"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="text-xs h-9 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <Input
                        placeholder="Installation / Site Address *"
                        value={newCustAddress}
                        onChange={(e) => setNewCustAddress(e.target.value)}
                        className="text-xs h-9 bg-white"
                      />
                    </div>
                    <Input
                      placeholder="GSTIN (Optional)"
                      value={newCustGstin}
                      onChange={(e) => setNewCustGstin(e.target.value)}
                      className="text-xs h-9 font-mono uppercase bg-white"
                    />
                  </div>
                  <div>
                    <Input
                      placeholder="Site Location (Google Maps Link) — https://maps.app.goo.gl/..."
                      value={newCustSiteLocation}
                      onChange={(e) => setNewCustSiteLocation(e.target.value)}
                      className="text-xs h-9 font-mono bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Category & Customer Status Row (Exact Baseline & Height Alignment) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 leading-normal">
                  Service Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs transition-colors"
                >
                  {SERVICE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 leading-normal">
                  Contract / Warranty Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={customerStatus}
                  onChange={(e) => setCustomerStatus(e.target.value as CustomerStatus)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs transition-colors"
                >
                  <option value="WARRANTY">WARRANTY</option>
                  <option value="AMC">AMC</option>
                  <option value="SERVICE_CALL">SERVICE CALL</option>
                  <option value="OTHERS">OTHERS</option>
                </select>
              </div>
            </div>

            {/* 4. Scope of Work / Problem Description */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 leading-normal">
                Scope of Work / Problem Reported <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                required
                placeholder={
                  jobType === 'INSTALLATION'
                    ? 'Describe installation scope (e.g. 6-camera perimeter setup, wiring route, NVR placement)...'
                    : 'Short description of problem reported or repair needed on site...'
                }
                value={problemReported}
                onChange={(e) => setProblemReported(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 leading-relaxed shadow-2xs transition-colors"
              />
            </div>

            {/* Phase 22: schedule & site contact (optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 leading-normal">Scheduled visit</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 leading-normal">Site contact name</label>
                <input
                  value={siteContactName}
                  onChange={(e) => setSiteContactName(e.target.value)}
                  placeholder="Person to meet at site"
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 leading-normal">Site contact mobile</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={siteContactPhone}
                  onChange={(e) => setSiteContactPhone(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-mono text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                />
              </div>
            </div>

            {/* 5. Team Assignment + Team Lead Designation (Consistent Width & Style) */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Users className="w-4 h-4 text-orange-600" />
                    Assign Team Members (1 to N) <span className="text-rose-500">*</span>
                  </label>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Select all technicians participating in this job
                  </div>
                </div>
                <span className="text-[11px] font-mono text-orange-600 font-bold">
                  {assignedTeam.length} selected
                </span>
              </div>

              {/* Technician selection grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {technicians.map((t) => {
                  const isSelected = assignedTeam.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTechnician(t.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer min-h-[52px] ${
                        isSelected
                          ? 'bg-orange-50 border-orange-400 text-orange-950 font-medium shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="truncate mr-1">
                        <div className="font-semibold text-xs text-slate-900 truncate">{t.name}</div>
                        <div className="text-[10px] text-slate-500">{t.phone}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-orange-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Designate ONE Team Lead (Consistent 3-col grid matching above) */}
              {assignedTeam.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-orange-600" />
                      Designate Team Lead *
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Has execution & billing authority
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {assignedTeam.map((techId) => {
                      const tech = users.find((u) => u.id === techId);
                      const isLead = (teamLeadUserId || assignedTeam[0]) === techId;
                      return (
                        <button
                          key={techId}
                          type="button"
                          onClick={() => setTeamLeadUserId(techId)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer min-h-[52px] ${
                            isLead
                              ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-2xs ring-1 ring-amber-300'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="truncate mr-1">
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                              <span className="truncate">{tech?.name}</span>
                              {isLead && (
                                <span className="text-[8px] px-1 py-0.2 rounded bg-amber-200 text-amber-900 font-extrabold uppercase border border-amber-300">
                                  LEAD
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {isLead ? 'Can invoice & close' : 'Supporting crew'}
                            </div>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isLead ? 'border-amber-600 bg-amber-500' : 'border-slate-300'
                            }`}
                          >
                            {isLead && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 6. Quotation Section: Fixed Enquiry -> Job Reuse (Phase 12 Part C) */}
            {linkedEnquiryQuotation ? (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Linked Commercial Quotation
                      <Badge variant="success" className="text-[10px] ml-1">
                        Inherited from Enquiry
                      </Badge>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Quotation already created & attached to Enquiry #{initialEnquiry?.enquiryNumber}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white border border-emerald-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-emerald-800">
                          {linkedEnquiryQuotation.quotationNo}
                        </span>
                        <Badge
                          variant={
                            linkedEnquiryQuotation.status === 'CONVERTED'
                              ? 'success'
                              : linkedEnquiryQuotation.status === 'SENT'
                              ? 'default'
                              : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {linkedEnquiryQuotation.status || 'DRAFT'}
                        </Badge>
                        {linkedEnquiryQuotation.whatsappSharedAt && (
                          <Badge variant="success" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                            WhatsApp Sent
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>
                          Total: <strong className="text-slate-900 font-mono">₹{linkedEnquiryQuotation.grandTotal.toLocaleString('en-IN')}</strong>
                        </span>
                        <span>&bull;</span>
                        <span>{linkedEnquiryQuotation.lineItems.length} item(s)</span>
                        <span>&bull;</span>
                        <span className="text-slate-500 font-mono">{formatDate(linkedEnquiryQuotation.date)}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300 rounded-lg shrink-0 flex items-center gap-1.5 cursor-pointer self-end sm:self-auto"
                    onClick={() => setPreviewQuotation(linkedEnquiryQuotation)}
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    View Quotation
                  </Button>
                </div>

                <div className="text-[11px] text-emerald-800 bg-emerald-50/70 rounded-lg p-2.5 border border-emerald-200 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    This quotation travels through the <strong>Enquiry &rarr; Job &rarr; Invoice</strong> reference chain automatically. No duplicate re-entry or quotation prompts needed.
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-orange-600" />
                      Quotation & Commercial Scope{' '}
                      <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Create a new tailored estimate or proceed without one
                    </p>
                  </div>

                  {selectedQuotationId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedQuotationId('');
                        setQuotationMode('NONE');
                      }}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-medium cursor-pointer underline"
                    >
                      Clear / Skip Quotation
                    </button>
                  )}
                </div>

                {selectedQuotation ? (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2.5 text-emerald-950">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <span>Attached Quotation:</span>
                          <span className="font-mono text-emerald-700">{selectedQuotation.quotationNo}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          Total: <strong>₹{selectedQuotation.grandTotal.toLocaleString('en-IN')}</strong> &bull; {selectedQuotation.lineItems.length} item(s)
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedQuotationId('');
                        setQuotationMode('NONE');
                      }}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer px-2 py-1"
                    >
                      Clear / Skip
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleLaunchNewQuotation}
                      disabled={saving}
                      className="w-full p-3 rounded-xl border border-dashed border-orange-300 bg-white hover:bg-orange-50/40 text-left transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 group-hover:scale-105 transition-transform shrink-0">
                          <FilePlus2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900">Create New Quotation</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Opens builder pre-filled with customer details, attaches estimate upon save
                          </div>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-orange-600 shrink-0 ml-1" />
                    </button>
                    <p className="text-[10px] text-slate-400 italic">
                      Note: Quotation is optional. You can skip this and proceed directly with job creation.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 7. Billing Note */}
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-[11px] leading-relaxed">
              <strong>Billing Note:</strong> Service labor rate and GST choice (18% GST vs Exempted) will be entered directly by Team Lead upon job completion.
            </div>
          </div>

          {/* Pinned Action Buttons Footer */}
          <div className="flex items-center justify-end gap-2 p-3 sm:p-4 border-t border-slate-200 bg-slate-50/80 shrink-0">
            <Button type="button" variant="secondary" size="md" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={saving}>
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Create & Assign {jobType === 'SERVICE' ? 'Service' : 'Installation'} Job
            </Button>
          </div>
        </form>
      </Modal>

      {/* Embedded QuotationBuilderModal */}
      <QuotationBuilderModal
        isOpen={isQuotationBuilderOpen}
        initialCustomerId={selectedCustomerId}
        initialEnquiryId={initialEnquiry?.id}
        onClose={() => setIsQuotationBuilderOpen(false)}
        onQuotationSaved={handleQuotationSaved}
      />

      {/* Embedded QuotationPreviewModal for inspecting linked quotation */}
      <QuotationPreviewModal
        isOpen={Boolean(previewQuotation)}
        quotation={previewQuotation}
        onClose={() => setPreviewQuotation(null)}
      />
    </>
  );
};
