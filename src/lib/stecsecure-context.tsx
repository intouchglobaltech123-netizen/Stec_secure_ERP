import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
} from './stecsecure-types';
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
}


export interface StecSecureContextType extends ErpState {
  currentUser: User | null;
  isAuthenticated: boolean;
  canResolveHold: boolean;
  canResumeHold: (job: Job, hold?: HoldEvent) => boolean;
  isManagement: boolean;
  visibleJobs: Job[];
  visibleRepairTickets: RepairTicket[];

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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);

      const rawQuotations: Quotation[] = (parsed.quotations?.length ? parsed.quotations : SEED_QUOTATIONS).map(
        (q: Quotation) => ({
          ...q,
          bankDetails: CANARA_BANK_DETAILS,
        })
      );
      // Phase 15.5: Audit and consolidate duplicate demo quotations (e.g. A24101 duplicate of A24100)
      const sanitizedQuotations: Quotation[] = [];
      const seenEnquiryQuotes = new Set<string>();
      for (const q of rawQuotations) {
        // If specifically A24101 was created on the same enquiry as A24100, skip duplicate
        if (q.quotationNo === 'A24101' && rawQuotations.some((o) => o.quotationNo === 'A24100')) {
          continue;
        }
        if (q.enquiryId) {
          const key = `${q.enquiryId}_${q.customerNumber}`;
          if (seenEnquiryQuotes.has(key)) {
            continue; // skip duplicate quotation on same enquiry
          }
          seenEnquiryQuotes.add(key);
        }
        sanitizedQuotations.push(q);
      }

      return {
        users: (parsed.users?.length ? parsed.users : SEED_USERS).map((u: User) =>
          u.id === 'usr-ceo' ? { ...u, name: 'Santhosh', phone: '8148562605', email: 'stecsecure@gmail.com' } : u
        ),
        customers: parsed.customers?.length ? parsed.customers : SEED_CUSTOMERS,
        vendors: parsed.vendors?.length ? parsed.vendors : SEED_VENDORS,
        products: (parsed.products?.length ? parsed.products : SEED_PRODUCTS).map((p: Product) => {
          const seed = SEED_PRODUCTS.find((sp) => sp.id === p.id);
          return seed?.barcode && !p.barcode ? { ...p, barcode: seed.barcode } : p;
        }),
        jobs: (parsed.jobs?.length ? parsed.jobs : SEED_JOBS).map((j: Job) => ({
          ...j,
          teamLeadUserId: j.teamLeadUserId || j.assignedTeam?.[0] || 'usr-tech-1',
        })),
        workLogs: parsed.workLogs?.length ? parsed.workLogs : SEED_WORK_LOGS,
        holdEvents: parsed.holdEvents?.length ? parsed.holdEvents : SEED_HOLD_EVENTS,
        materialUsages: parsed.materialUsages?.length ? parsed.materialUsages : SEED_MATERIAL_USAGES,
        quotations: sanitizedQuotations,
        invoices: (parsed.invoices?.length ? parsed.invoices : SEED_INVOICES).map((inv: Invoice) => ({
          ...inv,
          bankDetails: CANARA_BANK_DETAILS,
        })),
        serialUnits: parsed.serialUnits?.length ? parsed.serialUnits : SEED_SERIAL_UNITS,
        deliveryChallans: parsed.deliveryChallans?.length
          ? parsed.deliveryChallans
          : SEED_DELIVERY_CHALLANS,
        payments: parsed.payments?.length ? parsed.payments : SEED_PAYMENTS,
        otpVerifications: parsed.otpVerifications?.length
          ? parsed.otpVerifications
          : SEED_OTP_VERIFICATIONS,
        enquiries: (parsed.enquiries?.length ? parsed.enquiries : SEED_ENQUIRIES).map((e: Enquiry) => {
          // If the linked quotation was removed or consolidated, point to the canonical quotation for this enquiry
          const canonical = sanitizedQuotations.find((q) => q.enquiryId === e.id);
          return canonical ? { ...e, quotationId: canonical.id } : e;
        }),
        jobProductUsages: parsed.jobProductUsages?.length
          ? parsed.jobProductUsages
          : SEED_JOB_PRODUCT_USAGES,
        repairTickets: parsed.repairTickets?.length
          ? parsed.repairTickets
          : SEED_REPAIR_TICKETS,
      };
    }
  } catch (err) {
    console.error('Failed to parse state from localStorage', err);
  }

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
  };
}

export const StecSecureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [erpState, setErpState] = useState<ErpState>(getInitialState);

  // Auth state
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    return localStorage.getItem(AUTH_KEY) || 'usr-ceo';
  });

  // Persist ERP state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(erpState));
    } catch (err) {
      console.error('Failed to persist ERP state to localStorage', err);
    }
  }, [erpState]);

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
    return isLead || isRaiser;
  };

  const loginWithPin = (pin: string) => {
    const user = erpState.users.find((u) => u.pin === pin.trim());
    if (user) {
      setCurrentUserId(user.id);
      return { success: true };
    }
    return { success: false, message: 'Invalid 4-digit PIN. Please try again.' };
  };

  const loginAsUser = (userId: string) => {
    const user = erpState.users.find((u) => u.id === userId);
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const logout = () => {
    setCurrentUserId(null);
  };

  const resetToDemoData = () => {
    const fresh: ErpState = {
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
    };

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
    const nextSeq = String(erpState.jobs.length + 1).padStart(3, '0');
    const jobNumber = jobData.jobNumber || `JOB-2024-${nextSeq}`;
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
    const gstRate = isTaxable ? 18 : 0;

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
        const amt = netQty * rate;
        const cgst = Number((amt * (gstRate / 200)).toFixed(2));
        const sgst = Number((amt * (gstRate / 200)).toFixed(2));
        lineItems.push({
          itemName: mat.materialName,
          description: `Material consumed during ${targetJob.jobNumber}`,
          hsnSac: hsn,
          gstRate,
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
        const amt = pu.quantity * rate;
        const cgst = Number((amt * (gstRate / 200)).toFixed(2));
        const sgst = Number((amt * (gstRate / 200)).toFixed(2));
        const serialText = pu.serialUnitIds && pu.serialUnitIds.length > 0
          ? ` (S/N: ${pu.serialUnitIds
              .map((sid) => erpState.serialUnits.find((s) => s.id === sid || s.serialNumber === sid)?.serialNumber || sid)
              .join(', ')})`
          : '';
        lineItems.push({
          itemName: prod.name,
          description: `Hardware installed during ${targetJob.jobNumber}${serialText}`,
          hsnSac: hsn,
          gstRate,
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

    const invSeq = String(erpState.invoices.length + 91).padStart(3, '0');
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo: `INV-2024-${invSeq}`,
      customerNumber: targetJob.customerNumber || '',
      date: now.split('T')[0],
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
      invoices: [newInvoice, ...prev.invoices],
      otpVerifications: [newOtp, ...prev.otpVerifications.filter((o) => o.jobId !== jobId)],
      workLogs: updatedWorkLogs,
      serialUnits: updatedSerialUnits,
    }));

    return newInvoice;
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

    let finalPaid = 0;
    let finalBalance = inv.grandTotal;
    let pMode = data.paymentMode || 'UPI';

    if (data.statusOption === 'FULL') {
      finalPaid = inv.grandTotal;
      finalBalance = 0;
    } else if (data.statusOption === 'PARTIAL') {
      finalPaid = Math.min(inv.grandTotal, Math.max(0, data.amountReceived));
      finalBalance = Math.max(0, inv.grandTotal - finalPaid);
    } else {
      finalPaid = 0;
      finalBalance = inv.grandTotal;
      pMode = 'CASH';
    }

    let createdPayment: Payment | null = null;
    if (finalPaid > 0) {
      createdPayment = {
        id: `PAY-${Date.now()}`,
        customerNumber: data.customerNumber,
        invoiceId: data.invoiceId,
        amount: finalPaid,
        mode: pMode,
        date: new Date().toISOString().split('T')[0],
        type: data.statusOption === 'FULL' ? 'FULL' : 'ADVANCE',
        referenceNo: data.referenceNo || `RCPT-${Math.floor(1000 + Math.random() * 9000)}`,
      };
    }

    setErpState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) =>
        i.id === data.invoiceId
          ? {
              ...i,
              amountPaid: finalPaid,
              balanceDue: finalBalance,
              paymentMode: finalBalance === 0 ? pMode : finalPaid > 0 ? pMode : 'PENDING',
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
      date: data.date || new Date().toISOString().split('T')[0],
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

    const invSeq = String(erpState.invoices.length + 91).padStart(3, '0');
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo: `INV-2024-${invSeq}`,
      customerNumber: job?.customerNumber || '',
      date: new Date().toISOString().split('T')[0],
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
    if (enteredCode.trim() === '1234') {
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
    const nextSeq = String(erpState.deliveryChallans.length + 43).padStart(3, '0');
    const newChallan: DeliveryChallan = {
      id: `DC-${Date.now()}`,
      challanNo: `DC-2024-${nextSeq}`,
      date: new Date().toISOString().split('T')[0],
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
      id: `CUST-${String(erpState.customers.length + 1).padStart(3, '0')}`,
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
      id: `PROD-${String(erpState.products.length + 1).padStart(3, '0')}`,
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
      id: `VEND-${String(erpState.vendors.length + 1).padStart(3, '0')}`,
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
      id: `SER-${String(erpState.serialUnits.length + 1).padStart(3, '0')}`,
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
    const now = new Date().toISOString().split('T')[0];
    const createdSerials: SerialUnit[] = data.serialNumbers
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
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
      if (!serial) return prev;

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
          if (serialUnitIds.includes(s.id) || serialUnitIds.includes(s.serialNumber)) {
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
    const nextSeq = String(erpState.quotations.length + 82).padStart(3, '0');
    const quotationNo = data.quotationNo || `A24${nextSeq}`;
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

  const convertQuotationToInvoice = (quotationId: string): Invoice => {
    const quot = erpState.quotations.find((q) => q.id === quotationId);
    if (!quot) throw new Error('Quotation not found');

    const invSeq = String(erpState.invoices.length + 95).padStart(3, '0');
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo: `INV-2024-${invSeq}`,
      customerNumber: quot.customerNumber,
      date: new Date().toISOString().split('T')[0],
      validityDays: quot.validityDays || 15,
      lineItems: quot.lineItems,
      termsAndConditions: quot.termsAndConditions,
      totalAmount: quot.totalAmount,
      totalCgst: quot.totalCgst,
      totalSgst: quot.totalSgst,
      roundOff: quot.roundOff,
      grandTotal: quot.grandTotal,
      bankDetails: quot.bankDetails,
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

    // Rule: Skip any line item that represents labor/service charges.
    // Identify these as:
    // - HSN/SAC starting with '99' (service SAC code) or empty
    // - or itemName/description having service terms
    const serviceKeywords = [
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

    const physicalItems = quot.lineItems.filter((item) => {
      const hsn = (item.hsnSac || '').trim();
      const name = item.itemName.toLowerCase();
      const desc = (item.description || '').toLowerCase();

      // If SAC code starts with 99, it's a service
      if (hsn.startsWith('99')) return false;

      // If item matches a catalog product, it's a physical good
      const isCatalogProduct = erpState.products.some(
        (p) =>
          p.name.toLowerCase() === name ||
          p.name.toLowerCase().includes(name) ||
          name.includes(p.name.toLowerCase())
      );
      if (isCatalogProduct) return true;

      // If keywords match service and not a catalog product, exclude it
      const hasServiceKeyword = serviceKeywords.some(
        (kw) => name.includes(kw) || desc.includes(kw)
      );
      if (hasServiceKeyword) return false;

      // If HSN is empty or missing, exclude
      if (!hsn) return false;

      return true;
    });

    const itemsToConvert = physicalItems.length > 0 ? physicalItems : quot.lineItems;

    // Resolve linked job: explicitly provided, or search if any job already has quotationId
    const linkedJob = jobId
      ? erpState.jobs.find((j) => j.id === jobId)
      : erpState.jobs.find(
          (j) => j.quotationId === quotationId || j.quotationId === quot.quotationNo
        );

    const nextSeq = String(erpState.deliveryChallans.length + 43).padStart(3, '0');
    const newChallan: DeliveryChallan = {
      id: `DC-${Date.now()}`,
      challanNo: `DC-2024-${nextSeq}`,
      date: new Date().toISOString().split('T')[0],
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

    const sourceQuot = dc.quotationId
      ? erpState.quotations.find((q) => q.id === dc.quotationId)
      : null;
    const linkedJob = dc.jobId
      ? erpState.jobs.find((j) => j.id === dc.jobId)
      : erpState.jobs.find(
          (j) =>
            (dc.quotationId && j.quotationId === dc.quotationId) ||
            j.customerNumber === dc.customerNumber
        );

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

    // 2. Re-add excluded service/labor lines from the source quotation if present
    if (sourceQuot) {
      const serviceLines = sourceQuot.lineItems.filter((qi) => {
        const isAlreadyInInvoice = invoiceLineItems.some(
          (invItem) => invItem.itemName.toLowerCase() === qi.itemName.toLowerCase()
        );
        return !isAlreadyInInvoice;
      });

      serviceLines.forEach((sLine) => {
        invoiceLineItems.push({ ...sLine });
      });
    } else if (linkedJob && linkedJob.serviceAmount && linkedJob.serviceAmount > 0) {
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

    const invSeq = String(erpState.invoices.length + 95).padStart(3, '0');
    const newInvoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo: `INV-2024-${invSeq}`,
      customerNumber: dc.customerNumber,
      date: new Date().toISOString().split('T')[0],
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
      id: `PAY-${String(erpState.payments.length + 1).padStart(3, '0')}`,
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
    const nextSeq = String(erpState.enquiries.length + 1).padStart(3, '0');
    const enquiryNumber = `ENQ-2024-${nextSeq}`;
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
    const year = new Date().getFullYear();
    const count = erpState.repairTickets.length + 1;
    const ticketNumber = `RMA-${year}-${String(count).padStart(3, '0')}`;
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
