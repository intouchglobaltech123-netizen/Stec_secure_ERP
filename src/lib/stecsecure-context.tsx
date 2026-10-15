import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  User,
  Customer,
  Vendor,
  Product,
  SerialUnit,
  Job,
  JobStatus,
  WorkLog,
  HoldEvent,
  MaterialUsage,
  Quotation,
  Invoice,
  DeliveryChallan,
  Payment,
  PaymentMode,
  OTPVerification,
  LineItem,
  Enquiry,
  EnquiryStatus,
  JobProductUsage,
  RepairTicket,
  RepairStatus,
  RepairPath,
  RepairTimelineEntry,
  AppSection,
  AccessControl,
  ConfigurableRole,
  DEFAULT_ACCESS_CONTROL,
} from './stecsecure-types';
import { financialYearStart, localDateISO, maxSequence } from './numbering';
import { DEMO_MODE } from './demo-mode';
import {
  SEED_USERS,
  SEED_CUSTOMERS,
  SEED_VENDORS,
  SEED_PRODUCTS,
  SEED_SERIAL_UNITS,
  SEED_JOBS,
  SEED_WORK_LOGS,
  SEED_HOLD_EVENTS,
  SEED_MATERIAL_USAGES,
  SEED_QUOTATIONS,
  SEED_INVOICES,
  SEED_DELIVERY_CHALLANS,
  SEED_PAYMENTS,
  SEED_OTP_VERIFICATIONS,
  SEED_BANK_DETAILS,
  CANARA_BANK_DETAILS,
  SEED_ENQUIRIES,
  SEED_JOB_PRODUCT_USAGES,
  SEED_REPAIR_TICKETS,
} from './seed-data';


const STORAGE_KEY = 'stecsecure_erp_v1';
const AUTH_KEY = 'stecsecure_erp_auth_user_id';

interface ErpState {
  users: User[];
  customers: Customer[];
  vendors: Vendor[];
  products: Product[];
  serialUnits: SerialUnit[];
  jobs: Job[];
  workLogs: WorkLog[];
  holdEvents: HoldEvent[];
  materialUsages: MaterialUsage[];
  quotations: Quotation[];
  invoices: Invoice[];
  deliveryChallans: DeliveryChallan[];
  payments: Payment[];
  otpVerifications: OTPVerification[];
  enquiries: Enquiry[];
  jobProductUsages: JobProductUsage[];
  repairTickets: RepairTicket[];
  accessControl: AccessControl;
}


export interface StecSecureContextType extends ErpState {
  currentUser: User | null;
  isAuthenticated: boolean;
  canResolveHold: boolean;
  canResumeHold: (job: Job, hold?: HoldEvent) => boolean;
  isManagement: boolean;
  visibleJobs: Job[];
  visibleRepairTickets: RepairTicket[];

  // Phase 18: Access control (CEO-managed)
  canAccessSection: (section: AppSection) => boolean;
  updateAccessControl: (role: ConfigurableRole, sections: AppSection[]) => void;

  // Auth
  loginWithPin: (pin: string) => { success: boolean; message?: string };
  loginAsUser: (userId: string) => void;
  logout: () => void;

  // Actions
  resetToDemoData: () => void;
  createJob: (jobData: Omit<Job, 'id' | 'createdAt' | 'jobNumber'> & { jobNumber?: string; teamLeadUserId?: string; enquiryId?: string; createdByUserId?: string }) => Job;
  deleteJob: (jobId: string) => void;
  updateJobStatus: (id: string, status: JobStatus) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  startJob: (jobId: string, beforePhotoUrl?: string) => void;
  addWorkLogNote: (jobId: string, note: string) => void;
  addMaterialUsage: (jobId: string, materialName: string, deliveredQty: number, returnedQty: number) => void;
  raiseHold: (jobId: string, reason: string) => void;
  resolveHoldEvent: (holdId: string) => void;
  completeJob: (
    jobId: string,
    completionData?: {
      afterPhotoUrl?: string;
      serviceAmount?: number;
      serviceGstChoice?: 'GST' | 'NO_GST';
      actionTaken?: string;
      installedLocation?: string;
    }
  ) => Invoice | void;
  raiseJobInvoice: (jobId: string, invoiceData: {
    lineItems: LineItem[];
    termsAndConditions?: string;
    paymentMode?: 'CASH' | 'UPI' | 'NEFT' | 'CHEQUE' | 'PENDING';
    amountPaid?: number;
    validityDays?: number;
    beforePhotoUrl?: string;
    afterPhotoUrl?: string;
  }) => Invoice;
  verifyJobOtp: (jobId: string, enteredCode: string) => boolean;
  recordPaymentAfterOtp: (data: {
    invoiceId: string;
    customerNumber: string;
    statusOption: 'FULL' | 'PARTIAL' | 'NOTHING';
    amountReceived: number;
    paymentMode?: PaymentMode;
    referenceNo?: string;
  }) => Payment | null;
  recordManualPayment: (data: {
    invoiceId: string;
    amount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    date?: string;
  }) => Payment | null;
  createDeliveryChallan: (data: {
    customerNumber: string;
    lineItems: { itemDescription: string; qty: number }[];
    transportedBy?: string;
    jobId?: string;
    quotationId?: string;
  }) => DeliveryChallan;
  updateDeliveryChallan: (id: string, updates: Partial<DeliveryChallan>) => void;
  convertQuotationToDeliveryChallan: (quotationId: string, jobId?: string) => DeliveryChallan;
  convertDeliveryChallanToInvoice: (challanId: string) => Invoice;

  // Enquiry Module Actions
  createEnquiry: (data: Omit<Enquiry, 'id' | 'enquiryNumber' | 'createdAt' | 'followUpNotes' | 'status'> & { status?: EnquiryStatus }) => Enquiry;
  deleteEnquiry: (enquiryId: string) => void;
  addEnquiryFollowUpNote: (enquiryId: string, noteText: string) => void;
  approveEnquiry: (enquiryId: string) => void;
  cancelEnquiry: (enquiryId: string, reason: string) => void;
  convertEnquiryToJob: (enquiryId: string, jobId: string) => void;
  getEnquiry: (id: string) => Enquiry | undefined;

  addCustomer: (cust: Omit<Customer, 'id' | 'createdAt'>) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  addProduct: (prod: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  addVendor: (vendor: Omit<Vendor, 'id'>) => Vendor;
  updateVendor: (id: string, updates: Partial<Vendor>) => void;
  addSerialUnit: (unit: Omit<SerialUnit, 'id'>) => SerialUnit;
  updateSerialUnit: (id: string, updates: Partial<SerialUnit>) => void;
  stockInSerials: (data: {
    productId: string;
    serialNumbers: string[];
    vendorId?: string;
    purchaseDate?: string;
    purchaseCost?: number;
  }) => SerialUnit[];
  allocateSerialToJob: (serialId: string, jobId: string) => void;
  installJobSerials: (jobId: string, customerId: string, location: string) => void;
  markSerialReturned: (serialId: string, reason?: string) => void;
  addJobProductUsage: (data: {
    jobId: string;
    productId: string;
    quantity: number;
    serialUnitIds?: string[];
  }) => JobProductUsage;

  createQuotation: (data: Omit<Quotation, 'id' | 'quotationNo'> & { quotationNo?: string; status?: 'DRAFT' | 'SENT' | 'CONVERTED'; enquiryId?: string }) => Quotation;
  updateQuotation: (id: string, updates: Partial<Quotation>) => Quotation;
  convertQuotationToInvoice: (quotationId: string) => Invoice;
  updateInvoice: (id: string, updates: Partial<Invoice>) => Invoice;
  addPayment: (payment: Omit<Payment, 'id'>) => Payment;

  // Phase 17 & 17.5: Repair & RMA Ticket Actions
  createRepairTicket: (data: {
    customerId: string;
    assignedTechnicianId: string;
    serialUnitId?: string;
    customUnitDescription?: string;
    sourceJobId?: string | null;
    faultDescription: string;
    initialNote?: string;
  }) => RepairTicket;
  transitionRepairTicket: (
    ticketId: string,
    nextStatus: RepairStatus,
    details?: {
      note?: string;
      repairPath?: RepairPath;
      vendorId?: string;
      vendorSentDate?: string;
      vendorExpectedReturnDate?: string;
      vendorActualReturnDate?: string;
      vendorRepairNotes?: string;
      inHouseRepairedByUserId?: string;
      inHouseRepairNotes?: string;
      reinstalledLocation?: string;
    }
  ) => void;
  getRepairTicket: (id: string) => RepairTicket | undefined;

  // Helpers
  getCustomer: (id: string) => Customer | undefined;
  getUser: (id: string) => User | undefined;
  getProduct: (id: string) => Product | undefined;
  getVendor: (id: string) => Vendor | undefined;
  getJobWorkLogs: (jobId: string) => WorkLog[];
  getJobMaterials: (jobId: string) => MaterialUsage[];
  getJobHold: (jobId: string) => HoldEvent | undefined;
  getJobInvoice: (jobId: string) => Invoice | undefined;
  getJobOtp: (jobId: string) => OTPVerification | undefined;
  getJobSerials: (jobId: string) => SerialUnit[];
  getJobProductUsages: (jobId: string) => JobProductUsage[];
  getTechnicianStats: (userId: string) => {

    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    holdsRaised: number;
    totalHoursLogged: number;
    avgDurationHours: number;
  };
}

const StecSecureContext = createContext<StecSecureContextType | undefined>(undefined);

function getInitialState(): ErpState {
  const raw = localStorage.getItem(STORAGE_KEY);
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      // A saved list is kept even when empty; only a list missing from an older save starts empty.
      // (Falling back to demo seeds here used to resurrect deleted records.)
      const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

      const quotations = list<Quotation>(parsed.quotations).map((q) => ({
        ...q,
        bankDetails: CANARA_BANK_DETAILS,
      }));
      const users = list<User>(parsed.users);

      return {
        // Never start with zero users, or nobody could log in
        users: (users.length ? users : SEED_USERS).map((u: User) =>
          u.id === 'usr-ceo' ? { ...u, name: 'Santhosh', phone: '8148562605', email: 'stecsecure@gmail.com' } : u
        ),
        customers: list<Customer>(parsed.customers),
        vendors: list<Vendor>(parsed.vendors),
        products: list<Product>(parsed.products).map((p) => {
          const seed = SEED_PRODUCTS.find((sp) => sp.id === p.id);
          return seed?.barcode && !p.barcode ? { ...p, barcode: seed.barcode } : p;
        }),
        jobs: list<Job>(parsed.jobs).map((j) => ({
          ...j,
          teamLeadUserId: j.teamLeadUserId || j.assignedTeam?.[0],
        })),
        workLogs: list<WorkLog>(parsed.workLogs),
        holdEvents: list<HoldEvent>(parsed.holdEvents),
        materialUsages: list<MaterialUsage>(parsed.materialUsages),
        quotations,
        invoices: list<Invoice>(parsed.invoices).map((inv) => ({
          ...inv,
          bankDetails: CANARA_BANK_DETAILS,
        })),
        serialUnits: list<SerialUnit>(parsed.serialUnits),
        deliveryChallans: list<DeliveryChallan>(parsed.deliveryChallans),
        payments: list<Payment>(parsed.payments),
        otpVerifications: list<OTPVerification>(parsed.otpVerifications),
        enquiries: list<Enquiry>(parsed.enquiries).map((e) => {
          // Repair enquiries whose linked quotation no longer exists: point at the latest one for this enquiry
          if (!e.quotationId || quotations.some((q) => q.id === e.quotationId)) return e;
          const latest = quotations.find((q) => q.enquiryId === e.id);
          return { ...e, quotationId: latest?.id };
        }),
        jobProductUsages: list<JobProductUsage>(parsed.jobProductUsages),
        repairTickets: list<RepairTicket>(parsed.repairTickets),
        accessControl: { ...DEFAULT_ACCESS_CONTROL, ...(parsed.accessControl || {}) },
      };
    }
  } catch (err) {
    console.error('Failed to parse state from localStorage', err);
    // Keep the unreadable save instead of letting the demo data overwrite it
    try {
      if (raw) localStorage.setItem(`${STORAGE_KEY}_unreadable_${Date.now()}`, raw);
    } catch {
      // storage full — nothing more we can do here
    }
  }

  return getSeedState();
}

function getSeedState(): ErpState {
  return {
    users: SEED_USERS,
    customers: SEED_CUSTOMERS,
    vendors: SEED_VENDORS,
    products: SEED_PRODUCTS,
    serialUnits: SEED_SERIAL_UNITS,
    jobs: SEED_JOBS,
    workLogs: SEED_WORK_LOGS,
    holdEvents: SEED_HOLD_EVENTS,
    materialUsages: SEED_MATERIAL_USAGES,
    quotations: SEED_QUOTATIONS,
    invoices: SEED_INVOICES,
    deliveryChallans: SEED_DELIVERY_CHALLANS,
    payments: SEED_PAYMENTS,
    otpVerifications: SEED_OTP_VERIFICATIONS,
    enquiries: SEED_ENQUIRIES,
    jobProductUsages: SEED_JOB_PRODUCT_USAGES,
    repairTickets: SEED_REPAIR_TICKETS,
    accessControl: DEFAULT_ACCESS_CONTROL,
  };
}

export const StecSecureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [erpState, setErpState] = useState<ErpState>(getInitialState);

  // Auth state
  // No stored session means logged out — never fall back to a default user
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    return localStorage.getItem(AUTH_KEY);
  });

  // Persist ERP state to localStorage — a failed save must be visible, not just logged
  const saveFailedRef = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(erpState));
      if (saveFailedRef.current) {
        saveFailedRef.current = false;
        toast.success('Saving works again — all changes are stored.');
      }
    } catch (err) {
      console.error('Failed to persist ERP state to localStorage', err);
      if (!saveFailedRef.current) {
        saveFailedRef.current = true;
        toast.error('Storage is full — recent changes are NOT saved and will be lost on reload.', {
          duration: Infinity,
        });
      }
    }
  }, [erpState]);

  // Document numbers issued this session, so two creates in the same tick can't share a number
  const issuedSeqRef = useRef<Record<string, number>>({});
  const nextDocNumber = (prefix: string, existing: (string | undefined)[], pad = 3) => {
    const next = Math.max(maxSequence(existing, prefix), issuedSeqRef.current[prefix] ?? 0) + 1;
    issuedSeqRef.current[prefix] = next;
    return `${prefix}${String(next).padStart(pad, '0')}`;
  };
  const fy = () => financialYearStart();

  // Persist Current User ID
  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem(AUTH_KEY, currentUserId);
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  }, [currentUserId]);

  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return erpState.users.find((u) => u.id === currentUserId) || null;
  }, [currentUserId, erpState.users]);

  const isAuthenticated = Boolean(currentUser);
  const isManagement = currentUser?.role === 'CEO' || currentUser?.role === 'MANAGER';
  const canResolveHold = isManagement;

  // Phase 18: CEO always has full access; other roles follow the CEO-managed matrix
  const canAccessSection = (section: AppSection) => {
    if (!currentUser) return false;
    if (currentUser.role === 'CEO') return true;
    return erpState.accessControl[currentUser.role].includes(section);
  };

  const updateAccessControl = (role: ConfigurableRole, sections: AppSection[]) => {
    if (currentUser?.role !== 'CEO') return;
    setErpState((prev) => ({
      ...prev,
      accessControl: { ...prev.accessControl, [role]: sections },
    }));
  };

  // Route guard & data filtering: Technicians only see jobs assigned to them
  const visibleJobs = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'CEO' || currentUser.role === 'MANAGER') {
      return erpState.jobs;
    }
    return erpState.jobs.filter(
      (j) => j.assignedTeam.includes(currentUser.id) || j.teamLeadUserId === currentUser.id
    );
  }, [currentUser, erpState.jobs]);

  // Phase 17.5: Strict per-assignment visibility for Repair Tickets
  const visibleRepairTickets = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'CEO' || currentUser.role === 'MANAGER') {
      return erpState.repairTickets;
    }
    return erpState.repairTickets.filter(
      (t) => t.assignedTechnicianId === currentUser.id
    );
  }, [currentUser, erpState.repairTickets]);

  // Phase 10 Part D: Self-resume hold resolution permission
  const canResumeHold = (job: Job, hold?: HoldEvent) => {
    if (!currentUser) return false;
    const isLead =
      job.teamLeadUserId === currentUser.id ||
      (!job.teamLeadUserId && job.assignedTeam[0] === currentUser.id);
    const isRaiser = hold ? hold.raisedByUserId === currentUser.id : false;
    // Management can always authorize resumption (RaiseHoldModal promises this)
    return isManagement || isLead || isRaiser;
  };

  const loginWithPin = (pin: string) => {
    const user = erpState.users.find((u) => u.pin === pin.trim());
    if (user) {
      setCurrentUserId(user.id);
      return { success: true };
    }
    return { success: false, message: 'Invalid 4-digit PIN. Please try again.' };
  };

  // One-click persona login is a demo-only feature: without a PIN it would let anyone become CEO
  const loginAsUser = (userId: string) => {
    if (!DEMO_MODE) return;
    const user = erpState.users.find((u) => u.id === userId);
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const logout = () => {
    setCurrentUserId(null);
  };

  const resetToDemoData = () => {
    if (!DEMO_MODE || currentUser?.role !== 'CEO') return;
    const fresh = getSeedState();
    setErpState(fresh);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch (e) {
      console.error(e);
    }
  };

  const createJob = (
    jobData: Omit<Job, 'id' | 'createdAt' | 'jobNumber'> & {
      jobNumber?: string;
      teamLeadUserId?: string;
      enquiryId?: string;
      createdByUserId?: string;
    }
  ): Job => {
    const jobNumber =
      jobData.jobNumber || nextDocNumber(`JOB-${fy()}-`, erpState.jobs.map((j) => j.jobNumber));
    const newJob: Job = {
      ...jobData,
      id: jobNumber,
      jobNumber,
      status: 'ASSIGNED',
      teamLeadUserId: jobData.teamLeadUserId || jobData.assignedTeam[0],
      enquiryId: jobData.enquiryId,
      createdByUserId: jobData.createdByUserId || currentUser?.id || 'usr-ceo',
      serviceAmount: jobData.serviceAmount ?? 0,
      taxable: jobData.taxable ?? true,
      timerElapsedSeconds: 0,
      createdAt: new Date().toISOString(),
    };

    setErpState((prev) => ({
      ...prev,
      jobs: [newJob, ...prev.jobs],
      enquiries: jobData.enquiryId
        ? prev.enquiries.map((e) =>
            e.id === jobData.enquiryId
              ? {
                  ...e,
                  status: 'APPROVED' as const,
                  convertedJobId: newJob.id,
                  quotationId: jobData.quotationId || e.quotationId,
                }
              : e
          )
        : prev.enquiries,
      quotations: prev.quotations.map((q) =>
        (jobData.enquiryId && q.enquiryId === jobData.enquiryId) ||
        (jobData.quotationId && (q.id === jobData.quotationId || q.quotationNo === jobData.quotationId))
          ? { ...q, status: 'CONVERTED' as const }
          : q
      ),
    }));
    return newJob;
  };

  const deleteJob = (jobId: string) => {
    setErpState((prev) => {
      // Permanently remove the job
      const updatedJobs = prev.jobs.filter((j) => j.id !== jobId);
      // Leave linked quotations intact
      const updatedQuotations = prev.quotations.map((q) => q);
      // Leave linked invoices intact (unlinked)
      const updatedInvoices = prev.invoices.map((inv) =>
        inv.linkedJobId === jobId ? { ...inv, linkedJobId: undefined } : inv
      );
      // Transient child records cleaned up
      const updatedHolds = prev.holdEvents.filter((h) => h.jobId !== jobId);
      const updatedWorkLogs = prev.workLogs.filter((wl) => wl.jobId !== jobId);
      const updatedMaterials = prev.materialUsages.filter((m) => m.jobId !== jobId);
      const updatedUsages = prev.jobProductUsages.filter((u) => u.jobId !== jobId);
      const updatedOtps = prev.otpVerifications.filter((o) => o.jobId !== jobId);
      // Revert enquiry linked job status
      const updatedEnquiries = prev.enquiries.map((e) =>
        e.convertedJobId === jobId ? { ...e, convertedJobId: undefined } : e
      );
      // Units allocated to this job go back to stock (installed units stay with the customer)
      const updatedSerials = prev.serialUnits.map((su) =>
        su.installedAtJobId === jobId
          ? su.status === 'ALLOCATED'
            ? { ...su, status: 'IN_STOCK' as const, installedAtJobId: undefined }
            : { ...su, installedAtJobId: undefined }
          : su
      );
      const updatedChallans = prev.deliveryChallans.map((dc) =>
        dc.jobId === jobId ? { ...dc, jobId: undefined } : dc
      );
      const updatedRepairs = prev.repairTickets.map((t) =>
        t.sourceJobId === jobId ? { ...t, sourceJobId: null } : t
      );

      return {
        ...prev,
        jobs: updatedJobs,
        quotations: updatedQuotations,
        invoices: updatedInvoices,
        holdEvents: updatedHolds,
        workLogs: updatedWorkLogs,
        materialUsages: updatedMaterials,
        jobProductUsages: updatedUsages,
        otpVerifications: updatedOtps,
        enquiries: updatedEnquiries,
        serialUnits: updatedSerials,
        deliveryChallans: updatedChallans,
        repairTickets: updatedRepairs,
      };
    });
  };

  const updateJobStatus = (id: string, status: JobStatus) => {
    setErpState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((j) => {
        if (j.id === id) {
          return {
            ...j,
            status,
            completedAt:
              status === 'COMPLETED' || status === 'CLOSED'
                ? j.completedAt || new Date().toISOString()
                : j.completedAt,
          };
        }
        return j;
      }),
    }));
  };

  const updateJob = (id: string, updates: Partial<Job>) => {
    setErpState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    }));
  };

  const startJob = (jobId: string, beforePhotoUrl?: string) => {
    const now = new Date().toISOString();
    const newLog: WorkLog = {
      id: `WL-${Date.now()}`,
      jobId,
      userId: currentUser?.id || 'unknown',
      inTime: now,
      notesLog: [
        {
          timestamp: now,
          note: `Team Lead ${currentUser?.name || ''} initiated field session with verified Before Photo.`,
        },
      ],
    };

    setErpState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: 'IN_PROGRESS' as const,
              beforePhotoUrl: beforePhotoUrl || j.beforePhotoUrl,
              timerStartedAt: now,
              timerElapsedSeconds: j.timerElapsedSeconds || 0,
            }
          : j
      ),
      workLogs: [newLog, ...prev.workLogs],
    }));
  };

  const addWorkLogNote = (jobId: string, note: string) => {
    const now = new Date().toISOString();
    setErpState((prev) => {
      // Find existing active work log for this job or create one
      const existingLogIndex = prev.workLogs.findIndex((w) => w.jobId === jobId && !w.outTime);
      if (existingLogIndex >= 0) {
        const updatedLogs = [...prev.workLogs];
        const current = updatedLogs[existingLogIndex];
        updatedLogs[existingLogIndex] = {
          ...current,
          notesLog: [{ timestamp: now, note }, ...current.notesLog],
        };
        return { ...prev, workLogs: updatedLogs };
      } else {
        const newLog: WorkLog = {
          id: `WL-${Date.now()}`,
          jobId,
          userId: currentUser?.id || 'unknown',
          inTime: now,
          notesLog: [{ timestamp: now, note }],
        };
        return { ...prev, workLogs: [newLog, ...prev.workLogs] };
      }
    });
  };

  const addMaterialUsage = (
    jobId: string,
    materialName: string,
    deliveredQty: number,
    returnedQty: number
  ) => {
    const newUsage: MaterialUsage = {
      id: `MAT-${Date.now()}`,
      jobId,
      materialName,
      deliveredQty,
      returnedQty,
    };
    setErpState((prev) => ({
      ...prev,
      materialUsages: [newUsage, ...prev.materialUsages],
    }));
  };

  const raiseHold = (jobId: string, reason: string) => {
    const now = new Date().toISOString();
    const targetJob = erpState.jobs.find((j) => j.id === jobId);
    let currentElapsed = targetJob?.timerElapsedSeconds || 0;
    if (targetJob?.timerStartedAt) {
      const delta = Math.floor((Date.now() - new Date(targetJob.timerStartedAt).getTime()) / 1000);
      if (delta > 0) currentElapsed += delta;
    }

    const newHold: HoldEvent = {
      id: `HOLD-${Date.now()}`,
      jobId,
      reason,
      raisedByUserId: currentUser?.id || 'unknown',
      raisedAt: now,
      status: 'OPEN',
    };

    addWorkLogNote(jobId, `[HOLD RAISED] ${reason}`);

    setErpState((prev) => ({
      ...prev,
      holdEvents: [newHold, ...prev.holdEvents],
      jobs: prev.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: 'ON_HOLD' as const,
              timerElapsedSeconds: currentElapsed,
              timerStartedAt: undefined, // timer paused!
            }
          : j
      ),
    }));
  };

  const resolveHoldEvent = (holdId: string) => {
    const now = new Date().toISOString();
    setErpState((prev) => {
      const hold = prev.holdEvents.find((h) => h.id === holdId);
      if (!hold) return prev;

      const updatedHoldEvents = prev.holdEvents.map((h) =>
        h.id === holdId
          ? {
              ...h,
              status: 'RESOLVED' as const,
              resolvedByUserId: currentUser?.id,
              resolvedAt: now,
            }
          : h
      );

      const updatedJobs = prev.jobs.map((j) =>
        j.id === hold.jobId
          ? {
              ...j,
              status: 'IN_PROGRESS' as const,
              timerStartedAt: now, // resume timer from preserved timerElapsedSeconds
            }
          : j
      );

      return {
        ...prev,
        holdEvents: updatedHoldEvents,
        jobs: updatedJobs,
      };
    });
  };

  // One job is billed by one tax invoice — whichever path (completion, quotation, challan) raises it first
  const resolveQuotationId = (ref?: string) =>
    ref ? erpState.quotations.find((q) => q.id === ref || q.quotationNo === ref)?.id : undefined;
  const findInvoiceForJob = (job: Job) => {
    const quotationId = resolveQuotationId(job.quotationId);
    return erpState.invoices.find(
      (i) => i.linkedJobId === job.id || (quotationId !== undefined && i.quotationId === quotationId)
    );
  };

  const completeJob = (
    jobId: string,
    completionData?: {
      afterPhotoUrl?: string;
      serviceAmount?: number;
      serviceGstChoice?: 'GST' | 'NO_GST';
      actionTaken?: string;
      installedLocation?: string;
    }
  ): Invoice | void => {
    const now = new Date().toISOString();
    const targetJob = erpState.jobs.find((j) => j.id === jobId);
    if (!targetJob) return;
    if (targetJob.status === 'AWAITING_OTP' || targetJob.status === 'CLOSED' || targetJob.status === 'COMPLETED') {
      return erpState.invoices.find((i) => i.linkedJobId === jobId);
    }
    const alreadyInvoiced = findInvoiceForJob(targetJob);

    let finalDuration = targetJob.timerElapsedSeconds || 0;
    if (targetJob.timerStartedAt) {
      const delta = Math.floor((Date.now() - new Date(targetJob.timerStartedAt).getTime()) / 1000);
      if (delta > 0) finalDuration += delta;
    }

    const sAmount =
      completionData?.serviceAmount ??
      (targetJob.serviceAmount > 0 ? targetJob.serviceAmount : 1500);
    const gstChoice = completionData?.serviceGstChoice ?? targetJob.serviceGstChoice ?? 'GST';
    const isTaxable = gstChoice === 'GST';
    const gstRate = isTaxable ? 18 : 0; // service / labour line only

    // Line items for the invoice
    const lineItems: LineItem[] = [];
    if (sAmount > 0) {
      const cgst = Number((sAmount * (gstRate / 200)).toFixed(2));
      const sgst = Number((sAmount * (gstRate / 200)).toFixed(2));
      lineItems.push({
        itemName: `${targetJob.type === 'INSTALLATION' ? 'Installation & Commissioning' : 'Service & Labor Charges'} - ${targetJob.category}`,
        description:
          completionData?.actionTaken ||
          targetJob.problemReported ||
          'Standard field service resolution & testing',
        hsnSac: '998719',
        gstRate,
        qty: 1,
        rate: sAmount,
        amount: sAmount,
        cgst,
        sgst,
        total: Number((sAmount + cgst + sgst).toFixed(2)),
      });
    }

    // Material usages if any
    const jobMats = erpState.materialUsages.filter((m) => m.jobId === jobId);
    jobMats.forEach((mat) => {
      const netQty = Math.max(0, mat.deliveredQty - mat.returnedQty);
      if (netQty > 0) {
        const prod = erpState.products.find((p) =>
          p.name.toLowerCase().includes(mat.materialName.toLowerCase())
        );
        const rate = prod ? prod.defaultRate : 350;
        const hsn = prod?.hsnSac || '85258090';
        const matGstRate = prod?.gstRate ?? 18;
        const amt = netQty * rate;
        const cgst = Number((amt * (matGstRate / 200)).toFixed(2));
        const sgst = Number((amt * (matGstRate / 200)).toFixed(2));
        lineItems.push({
          itemName: mat.materialName,
          description: `Material consumed during ${targetJob.jobNumber}`,
          hsnSac: hsn,
          gstRate: matGstRate,
          qty: netQty,
          rate,
          amount: amt,
          cgst,
          sgst,
          total: Number((amt + cgst + sgst).toFixed(2)),
        });
      }
    });

    // Phase 8: Products Used if any (hardware installed)
    const jobProducts = erpState.jobProductUsages.filter((u) => u.jobId === jobId);
    jobProducts.forEach((pu) => {
      const prod = erpState.products.find((p) => p.id === pu.productId);
      if (prod) {
        const rate = prod.defaultRate;
        const hsn = prod.hsnSac || '85258090';
        const prodGstRate = prod.gstRate ?? 18;
        const amt = pu.quantity * rate;
        const cgst = Number((amt * (prodGstRate / 200)).toFixed(2));
        const sgst = Number((amt * (prodGstRate / 200)).toFixed(2));
        const serialText = pu.serialUnitIds && pu.serialUnitIds.length > 0
          ? ` (S/N: ${pu.serialUnitIds
              .map((sid) => erpState.serialUnits.find((s) => s.id === sid || s.serialNumber === sid)?.serialNumber || sid)
              .join(', ')})`
          : '';
        lineItems.push({
          itemName: prod.name,
          description: `Hardware installed during ${targetJob.jobNumber}${serialText}`,
          hsnSac: hsn,
          gstRate: prodGstRate,
          qty: pu.quantity,
          rate,
          amount: amt,
          cgst,
          sgst,
          total: Number((amt + cgst + sgst).toFixed(2)),
        });
      }
    });

    const totalAmount = lineItems.reduce((acc, item) => acc + item.amount, 0);
    const totalCgst = lineItems.reduce((acc, item) => acc + item.cgst, 0);
    const totalSgst = lineItems.reduce((acc, item) => acc + item.sgst, 0);
    const rawTotal = totalAmount + totalCgst + totalSgst;
    const grandTotal = Math.round(rawTotal);
    const roundOff = Number((grandTotal - rawTotal).toFixed(2));

    const invoiceNo = alreadyInvoiced
      ? alreadyInvoiced.invoiceNo
      : nextDocNumber(`INV-${fy()}-`, erpState.invoices.map((i) => i.invoiceNo));
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo,
      customerNumber: targetJob.customerNumber || '',
      date: localDateISO(),
      validityDays: 15,
      lineItems,
      termsAndConditions:
        '1. Payment due within 7 days of invoice.\n2. Standard 1-Year hardware warranty on installed devices.\n3. Physical damages, unauthorized tampering or power surges not covered under warranty.',
      totalAmount,
      totalCgst,
      totalSgst,
      roundOff,
      grandTotal,
      bankDetails: CANARA_BANK_DETAILS,
      linkedJobId: jobId,
      amountPaid: 0,
      balanceDue: grandTotal,
      paymentMode: 'PENDING',
      raisedByUserId: currentUser?.id,
      beforePhotoUrl: targetJob.beforePhotoUrl,
      afterPhotoUrl: completionData?.afterPhotoUrl || targetJob.afterPhotoUrl,
    };

    const newOtp: OTPVerification = {
      id: `OTP-${Date.now()}`,
      jobId,
      otpCode: '1234',
      sentAt: now,
      status: 'PENDING',
    };

    // Close open work logs
    const updatedWorkLogs = erpState.workLogs.map((w) =>
      w.jobId === jobId && !w.outTime ? { ...w, outTime: now } : w
    );

    // Transition serial units to INSTALLED if applicable (including any allocated via JobProductUsage)
    const loc = completionData?.installedLocation || 'Customer Site';
    const allUsageSerialIds = jobProducts.flatMap((u) => u.serialUnitIds || []);
    const updatedSerialUnits = erpState.serialUnits.map((s) => {
      if (s.status === 'IN_REPAIR' || s.status === 'RETURNED') return s;
      if (
        s.installedAtJobId === jobId ||
        allUsageSerialIds.includes(s.id) ||
        allUsageSerialIds.includes(s.serialNumber) ||
        (targetJob.serialNo && s.serialNumber === targetJob.serialNo)
      ) {
        return {
          ...s,
          status: 'INSTALLED' as const,
          soldToCustomerId: targetJob.customerNumber,
          installedLocation: loc,
        };
      }
      return s;
    });


    const jobInvoice = alreadyInvoiced ?? newInvoice;

    setErpState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: 'AWAITING_OTP' as const,
              completedAt: now,
              actionTaken:
                completionData?.actionTaken || j.actionTaken || 'Work completed and verified on site.',
              afterPhotoUrl: completionData?.afterPhotoUrl || j.afterPhotoUrl,
              serviceAmount: sAmount,
              taxable: isTaxable,
              serviceGstChoice: gstChoice,
              totalDurationSeconds: finalDuration,
              timerStartedAt: undefined,
              timerElapsedSeconds: finalDuration,
            }
          : j
      ),
      invoices: alreadyInvoiced
        ? prev.invoices.map((i) => (i.id === alreadyInvoiced.id ? { ...i, linkedJobId: jobId } : i))
        : [newInvoice, ...prev.invoices],
      otpVerifications: [newOtp, ...prev.otpVerifications.filter((o) => o.jobId !== jobId)],
      workLogs: updatedWorkLogs,
      serialUnits: updatedSerialUnits,
    }));

    return jobInvoice;
  };

  const recordPaymentAfterOtp = (data: {
    invoiceId: string;
    customerNumber: string;
    statusOption: 'FULL' | 'PARTIAL' | 'NOTHING';
    amountReceived: number;
    paymentMode?: PaymentMode;
    referenceNo?: string;
  }): Payment | null => {
    const inv = erpState.invoices.find((i) => i.id === data.invoiceId);
    if (!inv) return null;

    // Payment collection is only allowed after the customer's OTP sign-off
    if (inv.linkedJobId) {
      const job = erpState.jobs.find((j) => j.id === inv.linkedJobId);
      const otp = erpState.otpVerifications.find((o) => o.jobId === inv.linkedJobId);
      if (job && job.status !== 'CLOSED' && otp?.status !== 'VERIFIED') return null;
    }

    // Add to what was already paid (advances / earlier instalments) — never overwrite it
    const alreadyPaid = inv.amountPaid || 0;
    const outstanding = Math.max(0, inv.grandTotal - alreadyPaid);
    const pMode = data.paymentMode || 'UPI';

    let received = 0;
    if (data.statusOption === 'FULL') {
      received = outstanding;
    } else if (data.statusOption === 'PARTIAL') {
      received = Math.min(outstanding, Math.max(0, data.amountReceived));
    }
    const newAmountPaid = alreadyPaid + received;
    const newBalanceDue = Math.max(0, inv.grandTotal - newAmountPaid);

    let createdPayment: Payment | null = null;
    if (received > 0) {
      createdPayment = {
        id: `PAY-${Date.now()}`,
        customerNumber: data.customerNumber,
        invoiceId: data.invoiceId,
        amount: received,
        mode: pMode,
        date: localDateISO(),
        type: newBalanceDue > 0 ? 'ADVANCE' : alreadyPaid > 0 ? 'BALANCE' : 'FULL',
        referenceNo: data.referenceNo || `RCPT-${Math.floor(1000 + Math.random() * 9000)}`,
      };
    }

    setErpState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) =>
        i.id === data.invoiceId
          ? {
              ...i,
              amountPaid: newAmountPaid,
              balanceDue: newBalanceDue,
              paymentMode: received > 0 ? pMode : newAmountPaid > 0 ? i.paymentMode : 'PENDING',
            }
          : i
      ),
      payments: createdPayment ? [createdPayment, ...prev.payments] : prev.payments,
    }));

    return createdPayment;
  };

  const recordManualPayment = (data: {
    invoiceId: string;
    amount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    date?: string;
  }): Payment | null => {
    const inv = erpState.invoices.find((i) => i.id === data.invoiceId);
    if (!inv) return null;

    const paymentAmount = Math.min(inv.balanceDue, Math.max(0, data.amount));
    if (paymentAmount <= 0) return null;

    const newAmountPaid = inv.amountPaid + paymentAmount;
    const newBalanceDue = Math.max(0, inv.grandTotal - newAmountPaid);

    const createdPayment: Payment = {
      id: `PAY-${Date.now()}`,
      customerNumber: inv.customerNumber,
      invoiceId: data.invoiceId,
      amount: paymentAmount,
      mode: data.paymentMode,
      date: data.date || localDateISO(),
      type: newBalanceDue === 0 ? 'BALANCE' : 'ADVANCE',
      referenceNo: data.referenceNo || `RCPT-${Math.floor(1000 + Math.random() * 9000)}`,
    };

    setErpState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) =>
        i.id === data.invoiceId
          ? {
              ...i,
              amountPaid: newAmountPaid,
              balanceDue: newBalanceDue,
              paymentMode: newBalanceDue === 0 ? data.paymentMode : newAmountPaid > 0 ? data.paymentMode : 'PENDING',
            }
          : i
      ),
      payments: [createdPayment, ...prev.payments],
    }));

    return createdPayment;
  };

  const raiseJobInvoice = (
    jobId: string,
    invoiceData: {
      lineItems: LineItem[];
      termsAndConditions?: string;
      paymentMode?: 'CASH' | 'UPI' | 'NEFT' | 'CHEQUE' | 'PENDING';
      amountPaid?: number;
      validityDays?: number;
      beforePhotoUrl?: string;
      afterPhotoUrl?: string;
    }
  ): Invoice => {
    const job = erpState.jobs.find((j) => j.id === jobId);
    const lineItems = invoiceData.lineItems;

    const totalAmount = lineItems.reduce((acc, item) => acc + item.amount, 0);
    const totalCgst = lineItems.reduce((acc, item) => acc + item.cgst, 0);
    const totalSgst = lineItems.reduce((acc, item) => acc + item.sgst, 0);
    const rawTotal = totalAmount + totalCgst + totalSgst;
    const grandTotal = Math.round(rawTotal);
    const roundOff = Number((grandTotal - rawTotal).toFixed(2));
    const amountPaid = invoiceData.amountPaid ?? 0;
    const balanceDue = grandTotal - amountPaid;

    const invoiceNo = nextDocNumber(`INV-${fy()}-`, erpState.invoices.map((i) => i.invoiceNo));
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo,
      customerNumber: job?.customerNumber || '',
      date: localDateISO(),
      validityDays: invoiceData.validityDays || 15,
      lineItems,
      termsAndConditions:
        invoiceData.termsAndConditions ||
        '1. Payment due within 7 days of invoice.\n2. Standard 1-year warranty on CCTV and automation electronics.\n3. Physical damages or lightning surges not covered.',
      totalAmount,
      totalCgst,
      totalSgst,
      roundOff,
      grandTotal,
      bankDetails: SEED_BANK_DETAILS,
      linkedJobId: jobId,
      amountPaid,
      balanceDue,
      paymentMode: invoiceData.paymentMode || 'PENDING',
      raisedByUserId: currentUser?.id,
      beforePhotoUrl: invoiceData.beforePhotoUrl || job?.beforePhotoUrl,
      afterPhotoUrl: invoiceData.afterPhotoUrl || job?.afterPhotoUrl,
    };

    const newOtp: OTPVerification = {
      id: `OTP-${Date.now()}`,
      jobId,
      otpCode: '1234',
      sentAt: new Date().toISOString(),
      status: 'PENDING',
    };

    setErpState((prev) => ({
      ...prev,
      invoices: [newInvoice, ...prev.invoices],
      otpVerifications: [newOtp, ...prev.otpVerifications.filter((o) => o.jobId !== jobId)],
      jobs: prev.jobs.map((j) => (j.id === jobId ? { ...j, status: 'AWAITING_OTP' as const } : j)),
    }));

    return newInvoice;
  };

  const verifyJobOtp = (jobId: string, enteredCode: string): boolean => {
    const job = erpState.jobs.find((j) => j.id === jobId);
    const otp = erpState.otpVerifications.find((o) => o.jobId === jobId);
    if (!job || job.status !== 'AWAITING_OTP' || !otp) return false;
    if (enteredCode.trim() === otp.otpCode) {
      const now = new Date().toISOString();
      setErpState((prev) => ({
        ...prev,
        otpVerifications: prev.otpVerifications.map((o) =>
          o.jobId === jobId
            ? { ...o, status: 'VERIFIED' as const, verifiedAt: now }
            : o
        ),
        jobs: prev.jobs.map((j) =>
          j.id === jobId ? { ...j, status: 'CLOSED' as const, completedAt: j.completedAt || now } : j
        ),
      }));
      return true;
    }
    return false;
  };

  const createDeliveryChallan = (data: {
    customerNumber: string;
    lineItems: { itemDescription: string; qty: number }[];
    transportedBy?: string;
    jobId?: string;
    quotationId?: string;
  }): DeliveryChallan => {
    const challanNo = nextDocNumber(`DC-${fy()}-`, erpState.deliveryChallans.map((d) => d.challanNo));
    const newChallan: DeliveryChallan = {
      id: `DC-${Date.now()}`,
      challanNo,
      date: localDateISO(),
      customerNumber: data.customerNumber,
      lineItems: data.lineItems,
      receiverSignature: 'Pending Site Signature',
      transportedBy: data.transportedBy || 'Field Van / Technician Bike',
      jobId: data.jobId,
      quotationId: data.quotationId,
    };

    setErpState((prev) => ({
      ...prev,
      deliveryChallans: [newChallan, ...prev.deliveryChallans],
    }));

    return newChallan;
  };

  const updateDeliveryChallan = (id: string, updates: Partial<DeliveryChallan>): void => {
    setErpState((prev) => ({
      ...prev,
      deliveryChallans: prev.deliveryChallans.map((dc) =>
        dc.id === id ? { ...dc, ...updates } : dc
      ),
    }));
  };

  const addCustomer = (cust: Omit<Customer, 'id' | 'createdAt'>): Customer => {
    const newCustomer: Customer = {
      ...cust,
      id: nextDocNumber('CUST-', erpState.customers.map((c) => c.id)),
      createdAt: new Date().toISOString(),
    };
    setErpState((prev) => ({
      ...prev,
      customers: [newCustomer, ...prev.customers],
    }));
    return newCustomer;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setErpState((prev) => ({
      ...prev,
      customers: prev.customers.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  };


  const addProduct = (prod: Omit<Product, 'id'>): Product => {
    const newProduct: Product = {
      ...prod,
      id: nextDocNumber('PROD-', erpState.products.map((p) => p.id)),
    };
    setErpState((prev) => ({
      ...prev,
      products: [newProduct, ...prev.products],
    }));
    return newProduct;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setErpState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  };

  const addVendor = (vendor: Omit<Vendor, 'id'>): Vendor => {
    const newVendor: Vendor = {
      ...vendor,
      id: nextDocNumber('VEND-', erpState.vendors.map((v) => v.id)),
    };
    setErpState((prev) => ({
      ...prev,
      vendors: [newVendor, ...prev.vendors],
    }));
    return newVendor;
  };

  const updateVendor = (id: string, updates: Partial<Vendor>) => {
    setErpState((prev) => ({
      ...prev,
      vendors: prev.vendors.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    }));
  };

  const addSerialUnit = (unit: Omit<SerialUnit, 'id'>): SerialUnit => {
    const newUnit: SerialUnit = {
      ...unit,
      id: `SER-${Date.now()}`,
    };
    setErpState((prev) => ({
      ...prev,
      serialUnits: [newUnit, ...prev.serialUnits],
    }));
    return newUnit;
  };

  const updateSerialUnit = (id: string, updates: Partial<SerialUnit>) => {
    setErpState((prev) => ({
      ...prev,
      serialUnits: prev.serialUnits.map((u) => (u.id === id ? { ...u, ...updates } : u)),
    }));
  };

  const stockInSerials = (data: {
    productId: string;
    serialNumbers: string[];
    vendorId?: string;
    purchaseDate?: string;
    purchaseCost?: number;
  }): SerialUnit[] => {
    const now = localDateISO();
    // Skip serials already in the system and repeats within this batch (double scans)
    const known = new Set(erpState.serialUnits.map((u) => u.serialNumber.trim().toUpperCase()));
    const uniqueSerials = data.serialNumbers
      .map((s) => s.trim())
      .filter((s) => {
        const key = s.toUpperCase();
        if (!s || known.has(key)) return false;
        known.add(key);
        return true;
      });
    const createdSerials: SerialUnit[] = uniqueSerials
      .map((serialNumber, idx) => ({
        id: `SER-${Date.now()}-${idx}`,
        productId: data.productId,
        serialNumber,
        status: 'IN_STOCK' as const,
        purchasedFromVendorId: data.vendorId,
        purchaseDate: data.purchaseDate || now,
        purchaseCost: data.purchaseCost,
      }));

    setErpState((prev) => ({
      ...prev,
      serialUnits: [...createdSerials, ...prev.serialUnits],
    }));

    return createdSerials;
  };

  const allocateSerialToJob = (serialId: string, jobId: string) => {
    setErpState((prev) => {
      const serial = prev.serialUnits.find((s) => s.id === serialId || s.serialNumber === serialId);
      if (!serial || serial.status !== 'IN_STOCK') return prev;

      const updatedSerials = prev.serialUnits.map((s) =>
        s.id === serial.id
          ? {
              ...s,
              status: 'ALLOCATED' as const,
              installedAtJobId: jobId,
            }
          : s
      );

      // Also ensure the job references this serial number if not already set
      const updatedJobs = prev.jobs.map((j) =>
        j.id === jobId && !j.serialNo ? { ...j, serialNo: serial.serialNumber } : j
      );

      return {
        ...prev,
        serialUnits: updatedSerials,
        jobs: updatedJobs,
      };
    });
  };

  const installJobSerials = (jobId: string, customerId: string, location: string) => {
    const job = erpState.jobs.find((j) => j.id === jobId);
    setErpState((prev) => ({
      ...prev,
      serialUnits: prev.serialUnits.map((s) => {
        // match by installedAtJobId or serialNumber
        if (s.installedAtJobId === jobId || (job?.serialNo && s.serialNumber === job.serialNo)) {
          return {
            ...s,
            status: 'INSTALLED' as const,
            soldToCustomerId: customerId,
            installedLocation: location || s.installedLocation || 'Customer site',
          };
        }
        return s;
      }),
    }));
  };

  const markSerialReturned = (serialId: string, reason?: string) => {
    setErpState((prev) => ({
      ...prev,
      serialUnits: prev.serialUnits.map((s) =>
        s.id === serialId || s.serialNumber === serialId
          ? {
              ...s,
              status: 'RETURNED' as const,
              installedLocation: reason ? `Returned: ${reason}` : 'Returned: Hardware RMA',
            }
          : s
      ),
    }));
  };

  // Phase 8: Flexible Product Usage (Quantity-based, addable anytime)
  const addJobProductUsage = (data: {
    jobId: string;
    productId: string;
    quantity: number;
    serialUnitIds?: string[];
  }): JobProductUsage => {
    const now = new Date().toISOString();
    const serialUnitIds = data.serialUnitIds || [];
    const newUsage: JobProductUsage = {
      id: `JPU-${Date.now()}`,
      jobId: data.jobId,
      productId: data.productId,
      quantity: Math.max(1, data.quantity),
      serialUnitIds,
      addedByUserId: currentUser?.id || 'usr-tech-1',
      addedAt: now,
    };

    setErpState((prev) => {
      // Transition any selected serial units to ALLOCATED
      let updatedSerials = prev.serialUnits;
      if (serialUnitIds.length > 0) {
        updatedSerials = prev.serialUnits.map((s) => {
          if (
            s.status === 'IN_STOCK' &&
            (serialUnitIds.includes(s.id) || serialUnitIds.includes(s.serialNumber))
          ) {
            return {
              ...s,
              status: 'ALLOCATED' as const,
              installedAtJobId: data.jobId,
            };
          }
          return s;
        });
      }

      // Record in WorkLog for traceability
      const prod = prev.products.find((p) => p.id === data.productId);
      const allocatedSnList = updatedSerials
        .filter((s) => serialUnitIds.includes(s.id) || serialUnitIds.includes(s.serialNumber))
        .map((s) => s.serialNumber);
      const serialSuffix = allocatedSnList.length > 0 ? ` (S/N: ${allocatedSnList.join(', ')})` : '';
      const noteEntry = {
        timestamp: now,
        note: `[PRODUCT ADDED] ${prod?.name || 'Equipment'} x${data.quantity}${serialSuffix}`,
      };

      const existingLog = prev.workLogs.find((w) => w.jobId === data.jobId);
      let updatedWorkLogs: WorkLog[];
      if (existingLog) {
        updatedWorkLogs = prev.workLogs.map((w) =>
          w.jobId === data.jobId
            ? { ...w, notesLog: [noteEntry, ...(w.notesLog || [])] }
            : w
        );
      } else {
        const newLog: WorkLog = {
          id: `WL-${Date.now()}`,
          jobId: data.jobId,
          userId: currentUser?.id || 'usr-tech-1',
          inTime: now,
          notesLog: [noteEntry],
        };
        updatedWorkLogs = [newLog, ...prev.workLogs];
      }

      return {
        ...prev,
        jobProductUsages: [newUsage, ...prev.jobProductUsages],
        serialUnits: updatedSerials,
        workLogs: updatedWorkLogs,
      };
    });

    return newUsage;
  };


  const createQuotation = (data: Omit<Quotation, 'id' | 'quotationNo'> & { quotationNo?: string; status?: 'DRAFT' | 'SENT' | 'CONVERTED'; enquiryId?: string }): Quotation => {
    const quotationNo =
      data.quotationNo ||
      nextDocNumber(`A${String(fy()).slice(2)}`, erpState.quotations.map((q) => q.quotationNo));
    const newQuot: Quotation = {
      ...data,
      id: `QUOT-${Date.now()}`,
      quotationNo,
      status: data.status || 'DRAFT',
      enquiryId: data.enquiryId,
    };
    setErpState((prev) => ({
      ...prev,
      quotations: [newQuot, ...prev.quotations],
      enquiries: data.enquiryId
        ? prev.enquiries.map((e) =>
            e.id === data.enquiryId ? { ...e, quotationId: newQuot.id } : e
          )
        : prev.enquiries,
    }));
    return newQuot;
  };

  const updateQuotation = (id: string, updates: Partial<Quotation>): Quotation => {
    let updatedQuot: Quotation | undefined;
    setErpState((prev) => {
      const existing = prev.quotations.find((q) => q.id === id);
      if (!existing) return prev;
      updatedQuot = { ...existing, ...updates };
      return {
        ...prev,
        quotations: prev.quotations.map((q) => (q.id === id ? updatedQuot! : q)),
        enquiries: (updates.enquiryId || existing.enquiryId)
          ? prev.enquiries.map((e) =>
              e.id === (updates.enquiryId || existing.enquiryId)
                ? { ...e, quotationId: id }
                : e
            )
          : prev.enquiries,
      };
    });
    return updatedQuot || ({ id, ...updates } as Quotation);
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>): Invoice => {
    let updatedInv: Invoice | undefined;
    setErpState((prev) => {
      const existing = prev.invoices.find((inv) => inv.id === id);
      if (!existing) return prev;
      updatedInv = { ...existing, ...updates };
      return {
        ...prev,
        invoices: prev.invoices.map((inv) => (inv.id === id ? updatedInv! : inv)),
      };
    });
    return updatedInv || ({ id, ...updates } as Invoice);
  };

  // Rule: a line is a physical good (goes on a delivery challan) unless it is a labour/service charge.
  // Services are identified by SAC codes starting with '99', or by service terms when not a catalog product.
  const SERVICE_KEYWORDS = [
    'installation',
    'install',
    'labour',
    'labor',
    'service',
    'setup',
    'configuration',
    'wiring',
    'testing',
    'commissioning',
    'amc',
    'visiting',
    'charge',
  ];
  const isPhysicalLineItem = (item: LineItem) => {
    const hsn = (item.hsnSac || '').trim();
    const name = item.itemName.toLowerCase();
    const desc = (item.description || '').toLowerCase();

    if (hsn.startsWith('99')) return false;

    const isCatalogProduct = erpState.products.some(
      (p) =>
        p.name.toLowerCase() === name ||
        p.name.toLowerCase().includes(name) ||
        name.includes(p.name.toLowerCase())
    );
    if (isCatalogProduct) return true;

    if (SERVICE_KEYWORDS.some((kw) => name.includes(kw) || desc.includes(kw))) return false;

    return Boolean(hsn);
  };

  const convertQuotationToInvoice = (quotationId: string): Invoice => {
    const quot = erpState.quotations.find((q) => q.id === quotationId);
    if (!quot) throw new Error('Quotation not found');
    const existing = erpState.invoices.find((i) => i.quotationId === quotationId);
    if (existing) {
      throw new Error(`Quotation ${quot.quotationNo} is already invoiced as ${existing.invoiceNo}.`);
    }
    for (const job of erpState.jobs.filter((j) => resolveQuotationId(j.quotationId) === quotationId)) {
      const jobInvoice = findInvoiceForJob(job);
      if (jobInvoice) {
        throw new Error(`Job ${job.jobNumber} on this quotation is already invoiced as ${jobInvoice.invoiceNo}.`);
      }
    }

    const invoiceNo = nextDocNumber(`INV-${fy()}-`, erpState.invoices.map((i) => i.invoiceNo));
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo,
      customerNumber: quot.customerNumber,
      date: localDateISO(),
      validityDays: quot.validityDays || 15,
      lineItems: quot.lineItems,
      termsAndConditions: quot.termsAndConditions,
      totalAmount: quot.totalAmount,
      totalCgst: quot.totalCgst,
      totalSgst: quot.totalSgst,
      roundOff: quot.roundOff,
      grandTotal: quot.grandTotal,
      bankDetails: quot.bankDetails,
      quotationId: quot.id,
      amountPaid: 0,
      balanceDue: quot.grandTotal,
      paymentMode: 'PENDING',
      raisedByUserId: currentUser?.id,
    };

    setErpState((prev) => ({
      ...prev,
      quotations: prev.quotations.map((q) =>
        q.id === quotationId ? { ...q, status: 'CONVERTED' as const } : q
      ),
      invoices: [newInvoice, ...prev.invoices],
    }));

    return newInvoice;
  };

  const convertQuotationToDeliveryChallan = (
    quotationId: string,
    jobId?: string
  ): DeliveryChallan => {
    const quot = erpState.quotations.find((q) => q.id === quotationId);
    if (!quot) throw new Error('Quotation not found');

    const physicalItems = quot.lineItems.filter((item) => isPhysicalLineItem(item));

    const itemsToConvert = physicalItems.length > 0 ? physicalItems : quot.lineItems;

    // Resolve linked job: explicitly provided, or search if any job already has quotationId
    const linkedJob = jobId
      ? erpState.jobs.find((j) => j.id === jobId)
      : erpState.jobs.find(
          (j) => j.quotationId === quotationId || j.quotationId === quot.quotationNo
        );

    const challanNo = nextDocNumber(`DC-${fy()}-`, erpState.deliveryChallans.map((d) => d.challanNo));
    const newChallan: DeliveryChallan = {
      id: `DC-${Date.now()}`,
      challanNo,
      date: localDateISO(),
      customerNumber: quot.customerNumber,
      lineItems: itemsToConvert.map((item) => ({
        itemDescription: item.itemName,
        qty: item.qty || 1,
      })),
      receiverSignature: 'Pending Site Signature',
      transportedBy: 'Technician Field Van / Bike',
      quotationId: quot.id,
      jobId: linkedJob?.id,
    };

    setErpState((prev) => ({
      ...prev,
      deliveryChallans: [newChallan, ...prev.deliveryChallans],
    }));

    return newChallan;
  };

  const convertDeliveryChallanToInvoice = (challanId: string): Invoice => {
    const dc = erpState.deliveryChallans.find((c) => c.id === challanId);
    if (!dc) throw new Error('Delivery Challan not found');
    const existingForChallan = erpState.invoices.find((i) => i.deliveryChallanId === dc.id);
    if (existingForChallan) {
      throw new Error(`Delivery Challan ${dc.challanNo} is already invoiced as ${existingForChallan.invoiceNo}.`);
    }
    // Services from the quotation are billed once, on the first invoice for that quotation
    const quotationAlreadyInvoiced = dc.quotationId
      ? erpState.invoices.some((i) => i.quotationId === dc.quotationId)
      : false;

    const sourceQuot = dc.quotationId
      ? erpState.quotations.find((q) => q.id === dc.quotationId)
      : null;
    // Only a job tied to this challan or its quotation — never "any job of the same customer"
    const linkedJob = dc.jobId
      ? erpState.jobs.find((j) => j.id === dc.jobId)
      : dc.quotationId
      ? erpState.jobs.find((j) => resolveQuotationId(j.quotationId) === dc.quotationId)
      : undefined;

    if (linkedJob) {
      const jobInvoice = findInvoiceForJob(linkedJob);
      if (jobInvoice) {
        throw new Error(
          `Job ${linkedJob.jobNumber} is already invoiced as ${jobInvoice.invoiceNo}. Edit that invoice instead of raising a second one.`
        );
      }
    }

    // 1. Convert DC line items back to priced invoice line items
    const invoiceLineItems: LineItem[] = dc.lineItems.map((item) => {
      // Check if item was in source quotation first
      const quotItem = sourceQuot?.lineItems.find(
        (qi) => qi.itemName.toLowerCase() === item.itemDescription.toLowerCase()
      );

      // Check product catalog
      const matchedProd = erpState.products.find(
        (p) =>
          p.name.toLowerCase() === item.itemDescription.toLowerCase() ||
          item.itemDescription.toLowerCase().includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(item.itemDescription.toLowerCase())
      );

      const rate = quotItem ? quotItem.rate : (matchedProd?.defaultRate || 2500);
      const hsnSac = quotItem ? quotItem.hsnSac : (matchedProd?.hsnSac || '85258090');
      const gstRate = quotItem ? quotItem.gstRate : (matchedProd?.gstRate || 18);
      const qty = item.qty || 1;
      const amount = Number((qty * rate).toFixed(2));
      const cgst = Number((amount * (gstRate / 200)).toFixed(2));
      const sgst = Number((amount * (gstRate / 200)).toFixed(2));
      const total = Number((amount + cgst + sgst).toFixed(2));

      return {
        itemName: item.itemDescription,
        description:
          quotItem?.description || matchedProd?.description || 'Hardware dispatch item',
        hsnSac,
        gstRate,
        qty,
        rate,
        amount,
        cgst,
        sgst,
        total,
      };
    });

    // 2. Add the quotation's service/labour lines (not undelivered goods), once per quotation
    if (sourceQuot && !quotationAlreadyInvoiced) {
      const serviceLines = sourceQuot.lineItems.filter((qi) => {
        const isAlreadyInInvoice = invoiceLineItems.some(
          (invItem) => invItem.itemName.toLowerCase() === qi.itemName.toLowerCase()
        );
        return !isAlreadyInInvoice && !isPhysicalLineItem(qi);
      });

      serviceLines.forEach((sLine) => {
        invoiceLineItems.push({ ...sLine });
      });
    } else if (
      !sourceQuot &&
      linkedJob &&
      linkedJob.serviceAmount &&
      linkedJob.serviceAmount > 0 &&
      !erpState.invoices.some((i) => i.linkedJobId === linkedJob.id)
    ) {
      const sAmt = linkedJob.serviceAmount;
      const gstRate = linkedJob.serviceGstChoice === 'GST' ? 18 : 0;
      const cgst = Number((sAmt * (gstRate / 200)).toFixed(2));
      const sgst = Number((sAmt * (gstRate / 200)).toFixed(2));
      invoiceLineItems.push({
        itemName: `${linkedJob.type} & Commissioning Charges`,
        description: linkedJob.actionTaken || `Field service execution for ${linkedJob.category}`,
        hsnSac: '998719',
        gstRate,
        qty: 1,
        rate: sAmt,
        amount: sAmt,
        cgst,
        sgst,
        total: Number((sAmt + cgst + sgst).toFixed(2)),
      });
    }

    // 3. Compute Invoice Totals
    const totalAmount = Number(
      invoiceLineItems.reduce((sum, it) => sum + it.amount, 0).toFixed(2)
    );
    const totalCgst = Number(
      invoiceLineItems.reduce((sum, it) => sum + it.cgst, 0).toFixed(2)
    );
    const totalSgst = Number(
      invoiceLineItems.reduce((sum, it) => sum + it.sgst, 0).toFixed(2)
    );
    const exactGrandTotal = totalAmount + totalCgst + totalSgst;
    const grandTotal = Math.round(exactGrandTotal);
    const roundOff = Number((grandTotal - exactGrandTotal).toFixed(2));

    const invoiceNo = nextDocNumber(`INV-${fy()}-`, erpState.invoices.map((i) => i.invoiceNo));
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo,
      customerNumber: dc.customerNumber,
      date: localDateISO(),
      validityDays: sourceQuot?.validityDays || 15,
      lineItems: invoiceLineItems,
      termsAndConditions:
        sourceQuot?.termsAndConditions ||
        '1. 100% payment against delivery / installation completion.\n2. Warranty: As per manufacturer policy.',
      totalAmount,
      totalCgst,
      totalSgst,
      roundOff,
      grandTotal,
      bankDetails: sourceQuot?.bankDetails || SEED_BANK_DETAILS,
      linkedJobId: linkedJob?.id || dc.jobId,
      deliveryChallanId: dc.id,
      quotationId: dc.quotationId,
      amountPaid: 0,
      balanceDue: grandTotal,
      paymentMode: 'PENDING',
      raisedByUserId: currentUser?.id,
    };

    setErpState((prev) => ({
      ...prev,
      invoices: [newInvoice, ...prev.invoices],
    }));

    return newInvoice;
  };

  const getTechnicianStats = (userId: string) => {
    const userJobs = erpState.jobs.filter((j) => j.assignedTeam.includes(userId));
    const activeJobs = userJobs.filter(
      (j) => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED' || j.status === 'AWAITING_OTP'
    ).length;
    const completedJobs = userJobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CLOSED').length;
    const holdsRaised = erpState.holdEvents.filter((h) => h.raisedByUserId === userId).length;

    const userLogs = erpState.workLogs.filter((w) => w.userId === userId);
    let totalHours = 0;
    userLogs.forEach((wl) => {
      if (wl.outTime && wl.inTime) {
        const diffHours = (new Date(wl.outTime).getTime() - new Date(wl.inTime).getTime()) / (1000 * 60 * 60);
        if (diffHours > 0) totalHours += diffHours;
      } else if (wl.inTime) {
        const diffHours = (Date.now() - new Date(wl.inTime).getTime()) / (1000 * 60 * 60);
        if (diffHours > 0 && diffHours < 12) totalHours += diffHours;
      }
    });

    if (totalHours < completedJobs * 2) {
      totalHours = completedJobs * 3.5 + 2.0;
    }

    const roundedHours = Number(totalHours.toFixed(1));
    const avgDurationHours = completedJobs > 0 ? Number((roundedHours / completedJobs).toFixed(1)) : 2.5;

    return {
      totalJobs: userJobs.length,
      activeJobs,
      completedJobs,
      holdsRaised,
      totalHoursLogged: roundedHours,
      avgDurationHours,
    };
  };

  const addPayment = (payment: Omit<Payment, 'id'>): Payment => {
    const newPayment: Payment = {
      ...payment,
      id: `PAY-${Date.now()}`,
    };
    setErpState((prev) => ({
      ...prev,
      payments: [newPayment, ...prev.payments],
    }));
    return newPayment;
  };

  const getCustomer = (id: string) => erpState.customers.find((c) => c.id === id);
  const getUser = (id: string) => erpState.users.find((u) => u.id === id);
  const getProduct = (id: string) => erpState.products.find((p) => p.id === id);
  const getVendor = (id: string) => erpState.vendors.find((v) => v.id === id);

  const getJobWorkLogs = (jobId: string) => erpState.workLogs.filter((w) => w.jobId === jobId);
  const getJobMaterials = (jobId: string) => erpState.materialUsages.filter((m) => m.jobId === jobId);
  const getJobHold = (jobId: string) => erpState.holdEvents.find((h) => h.jobId === jobId && h.status === 'OPEN');
  const getJobInvoice = (jobId: string) => erpState.invoices.find((i) => i.linkedJobId === jobId);
  const getJobOtp = (jobId: string) => erpState.otpVerifications.find((o) => o.jobId === jobId);
  const getJobSerials = (jobId: string) =>
    erpState.serialUnits.filter((s) => s.installedAtJobId === jobId);

  // Enquiry Module Handlers
  const createEnquiry = (
    data: Omit<Enquiry, 'id' | 'enquiryNumber' | 'createdAt' | 'followUpNotes' | 'status'> & {
      status?: EnquiryStatus;
    }
  ): Enquiry => {
    const enquiryNumber = nextDocNumber(`ENQ-${fy()}-`, erpState.enquiries.map((e) => e.enquiryNumber));
    const newEnquiry: Enquiry = {
      ...data,
      id: enquiryNumber,
      enquiryNumber,
      status: data.status || 'FOLLOW_UP',
      createdAt: new Date().toISOString(),
      createdByUserId: currentUser?.id || 'usr-ceo',
      followUpNotes: [],
    };

    setErpState((prev) => ({
      ...prev,
      enquiries: [newEnquiry, ...prev.enquiries],
    }));
    return newEnquiry;
  };

  const deleteEnquiry = (enquiryId: string) => {
    setErpState((prev) => {
      const updatedEnquiries = prev.enquiries.filter((e) => e.id !== enquiryId);
      // Unlink quotations & jobs tied to this enquiry without deleting billing records
      const updatedQuotations = prev.quotations.map((q) =>
        q.enquiryId === enquiryId ? { ...q, enquiryId: undefined } : q
      );
      const updatedJobs = prev.jobs.map((j) =>
        j.enquiryId === enquiryId ? { ...j, enquiryId: undefined } : j
      );

      return {
        ...prev,
        enquiries: updatedEnquiries,
        quotations: updatedQuotations,
        jobs: updatedJobs,
      };
    });
  };

  const addEnquiryFollowUpNote = (enquiryId: string, noteText: string) => {
    const newNote = {
      id: `fup-${Date.now()}`,
      text: noteText.trim(),
      createdAt: new Date().toISOString(),
      createdByUserId: currentUser?.id,
      createdByUserName: currentUser?.name || 'Staff',
    };

    setErpState((prev) => ({
      ...prev,
      enquiries: prev.enquiries.map((e) =>
        e.id === enquiryId
          ? { ...e, followUpNotes: [newNote, ...e.followUpNotes] }
          : e
      ),
    }));
  };

  const approveEnquiry = (enquiryId: string) => {
    setErpState((prev) => ({
      ...prev,
      enquiries: prev.enquiries.map((e) =>
        e.id === enquiryId ? { ...e, status: 'APPROVED' as const } : e
      ),
      quotations: prev.quotations.map((q) =>
        q.enquiryId === enquiryId ? { ...q, status: 'CONVERTED' as const } : q
      ),
    }));
  };

  const cancelEnquiry = (enquiryId: string, reason: string) => {
    setErpState((prev) => ({
      ...prev,
      enquiries: prev.enquiries.map((e) =>
        e.id === enquiryId
          ? {
              ...e,
              status: 'CANCELLED' as const,
              cancelledReason: reason.trim(),
            }
          : e
      ),
    }));
  };

  const convertEnquiryToJob = (enquiryId: string, jobId: string) => {
    setErpState((prev) => ({
      ...prev,
      enquiries: prev.enquiries.map((e) =>
        e.id === enquiryId
          ? { ...e, status: 'APPROVED' as const, convertedJobId: jobId }
          : e
      ),
      jobs: prev.jobs.map((j) =>
        j.id === jobId ? { ...j, enquiryId } : j
      ),
      quotations: prev.quotations.map((q) =>
        q.enquiryId === enquiryId ? { ...q, status: 'CONVERTED' as const } : q
      ),
    }));
  };

  const getEnquiry = (id: string) =>
    erpState.enquiries.find((e) => e.id === id || e.enquiryNumber === id);

  const createRepairTicket = (data: {
    customerId: string;
    assignedTechnicianId: string;
    serialUnitId?: string;
    customUnitDescription?: string;
    sourceJobId?: string | null;
    faultDescription: string;
    initialNote?: string;
  }): RepairTicket => {
    const ticketNumber = nextDocNumber(`RMA-${fy()}-`, erpState.repairTickets.map((t) => t.ticketNumber));
    const id = `RMA-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();
    const userId = currentUser?.id || 'usr-tech-1';

    const newTicket: RepairTicket = {
      id,
      ticketNumber,
      serialUnitId: data.serialUnitId || undefined,
      customUnitDescription: data.customUnitDescription || undefined,
      customerId: data.customerId,
      assignedTechnicianId: data.assignedTechnicianId,
      sourceJobId: data.sourceJobId ?? null,
      faultDescription: data.faultDescription,
      status: 'FAULT_REPORTED',
      repairPath: null,
      createdByUserId: userId,
      createdAt: now,
      timeline: [
        {
          status: 'FAULT_REPORTED',
          timestamp: now,
          userId,
          note: data.initialNote || `Ticket logged: ${data.faultDescription}`,
        },
      ],
    };

    setErpState((prev) => {
      const updatedSerials = data.serialUnitId
        ? prev.serialUnits.map((s) =>
            s.id === data.serialUnitId || s.serialNumber === data.serialUnitId
              ? { ...s, status: 'IN_REPAIR' as const }
              : s
          )
        : prev.serialUnits;

      return {
        ...prev,
        serialUnits: updatedSerials,
        repairTickets: [newTicket, ...prev.repairTickets],
      };
    });

    return newTicket;
  };

  const transitionRepairTicket = (
    ticketId: string,
    nextStatus: RepairStatus,
    details?: {
      note?: string;
      repairPath?: RepairPath;
      vendorId?: string;
      vendorSentDate?: string;
      vendorExpectedReturnDate?: string;
      vendorActualReturnDate?: string;
      vendorRepairNotes?: string;
      inHouseRepairedByUserId?: string;
      inHouseRepairNotes?: string;
      reinstalledLocation?: string;
    }
  ) => {
    const now = new Date().toISOString();
    const userId = currentUser?.id || 'usr-mgr';

    setErpState((prev) => {
      const existingTicket = prev.repairTickets.find((t) => t.id === ticketId);
      if (!existingTicket) return prev;

      const newTimelineEntry: RepairTimelineEntry = {
        status: nextStatus,
        timestamp: now,
        userId,
        note: details?.note || `Stage changed to ${nextStatus.replace(/_/g, ' ')}`,
      };

      const updatedTicket: RepairTicket = {
        ...existingTicket,
        status: nextStatus,
        timeline: [...existingTicket.timeline, newTimelineEntry],
        repairPath: details?.repairPath !== undefined ? details.repairPath : existingTicket.repairPath,
        vendorId: details?.vendorId !== undefined ? details.vendorId : existingTicket.vendorId,
        vendorSentDate: details?.vendorSentDate !== undefined ? details.vendorSentDate : existingTicket.vendorSentDate,
        vendorExpectedReturnDate:
          details?.vendorExpectedReturnDate !== undefined
            ? details.vendorExpectedReturnDate
            : existingTicket.vendorExpectedReturnDate,
        vendorActualReturnDate:
          details?.vendorActualReturnDate !== undefined
            ? details.vendorActualReturnDate
            : existingTicket.vendorActualReturnDate,
        vendorRepairNotes:
          details?.vendorRepairNotes !== undefined
            ? details.vendorRepairNotes
            : existingTicket.vendorRepairNotes,
        inHouseRepairedByUserId:
          details?.inHouseRepairedByUserId !== undefined
            ? details.inHouseRepairedByUserId
            : existingTicket.inHouseRepairedByUserId,
        inHouseRepairNotes:
          details?.inHouseRepairNotes !== undefined
            ? details.inHouseRepairNotes
            : existingTicket.inHouseRepairNotes,
        reinstalledByUserId:
          nextStatus === 'REINSTALLED' ? userId : existingTicket.reinstalledByUserId,
        reinstalledAt:
          nextStatus === 'REINSTALLED' ? now : existingTicket.reinstalledAt,
        reinstalledLocation:
          details?.reinstalledLocation !== undefined
            ? details.reinstalledLocation
            : existingTicket.reinstalledLocation,
      };

      let updatedSerials = prev.serialUnits;
      if (existingTicket.serialUnitId) {
        if (nextStatus === 'REINSTALLED') {
          updatedSerials = prev.serialUnits.map((s) => {
            if (s.id === existingTicket.serialUnitId || s.serialNumber === existingTicket.serialUnitId) {
              return {
                ...s,
                status: 'INSTALLED' as const,
                soldToCustomerId: existingTicket.customerId || s.soldToCustomerId,
                installedLocation:
                  details?.reinstalledLocation || existingTicket.reinstalledLocation || s.installedLocation,
              };
            }
            return s;
          });
        } else if (nextStatus === 'WRITE_OFF') {
          updatedSerials = prev.serialUnits.map((s) => {
            if (s.id === existingTicket.serialUnitId || s.serialNumber === existingTicket.serialUnitId) {
              return {
                ...s,
                status: 'RETURNED' as const,
              };
            }
            return s;
          });
        } else if (
          nextStatus === 'PICKED_UP' ||
          nextStatus === 'CHECKED_IN_AT_OFFICE' ||
          nextStatus === 'IN_HOUSE_REPAIR' ||
          nextStatus === 'SENT_TO_VENDOR'
        ) {
          updatedSerials = prev.serialUnits.map((s) => {
            if (s.id === existingTicket.serialUnitId || s.serialNumber === existingTicket.serialUnitId) {
              return {
                ...s,
                status: 'IN_REPAIR' as const,
              };
            }
            return s;
          });
        }
      }

      return {
        ...prev,
        serialUnits: updatedSerials,
        repairTickets: prev.repairTickets.map((t) => (t.id === ticketId ? updatedTicket : t)),
      };
    });
  };

  const getRepairTicket = (id: string) =>
    erpState.repairTickets.find((t) => t.id === id || t.ticketNumber === id);

  return (
    <StecSecureContext.Provider
      value={{
        ...erpState,
        currentUser,
        isAuthenticated,
        canResolveHold,
        canResumeHold,
        isManagement,
        visibleJobs,
        visibleRepairTickets,
        canAccessSection,
        updateAccessControl,
        loginWithPin,
        loginAsUser,
        logout,
        resetToDemoData,
        createJob,
        deleteJob,
        updateJobStatus,
        updateJob,
        startJob,
        addWorkLogNote,
        addMaterialUsage,
        raiseHold,
        resolveHoldEvent,
        completeJob,
        raiseJobInvoice,
        verifyJobOtp,
        recordPaymentAfterOtp,
        recordManualPayment,
        createDeliveryChallan,
        updateDeliveryChallan,
        convertQuotationToDeliveryChallan,
        convertDeliveryChallanToInvoice,
        createEnquiry,
        deleteEnquiry,
        addEnquiryFollowUpNote,
        approveEnquiry,
        cancelEnquiry,
        convertEnquiryToJob,
        getEnquiry,
        addCustomer,
        updateCustomer,
        addProduct,
        updateProduct,
        addVendor,
        updateVendor,
        addSerialUnit,
        updateSerialUnit,
        stockInSerials,
        allocateSerialToJob,
        installJobSerials,
        markSerialReturned,
        addJobProductUsage,
        createQuotation,
        updateQuotation,
        convertQuotationToInvoice,
        updateInvoice,
        addPayment,
        createRepairTicket,
        transitionRepairTicket,
        getRepairTicket,
        getCustomer,
        getUser,
        getProduct,
        getVendor,
        getJobWorkLogs,
        getJobMaterials,
        getJobHold,
        getJobInvoice,
        getJobOtp,
        getJobSerials,
        getJobProductUsages: (jobId: string) =>
          erpState.jobProductUsages.filter((u) => u.jobId === jobId),
        getTechnicianStats,
      }}

    >
      {children}
    </StecSecureContext.Provider>
  );
};

export function useStecSecure() {
  const context = useContext(StecSecureContext);
  if (!context) {
    throw new Error('useStecSecure must be used within a StecSecureProvider');
  }
  return context;
}
