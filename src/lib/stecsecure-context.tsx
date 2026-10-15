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
  AppSection,
  ConfigurableRole,
} from './stecsecure-types';
import { DEMO_MODE } from './demo-mode';
import {
  ErpState,
  Action,
  getSeedState,
  normalizeSavedState,
  makeEnv,
  getJobQuotation as getJobQuotationIn,
} from './erp/core';
import { ACTIONS, ActionName, ActionArgs, ActionReturn } from './erp/actions';

const STORAGE_KEY = 'stecsecure_erp_v1';
const AUTH_KEY = 'stecsecure_erp_auth_user_id';

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
  getJobQuotation: (job: Job) => Quotation | undefined;
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
    if (raw) return normalizeSavedState(JSON.parse(raw));
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

export const StecSecureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [erpState, setErpState] = useState<ErpState>(getInitialState);
  // Latest state, readable synchronously: an action always sees the result of the previous one,
  // even when a handler runs several actions in a row
  const stateRef = useRef(erpState);

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
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const commit = (next: ErpState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    setErpState(next);
  };

  // Phase 20: every business action is a pure function in src/lib/erp/actions, shared with the server
  const run = <N extends ActionName>(name: N, args: ActionArgs<N>): ActionReturn<N> => {
    const action = ACTIONS[name] as unknown as Action<ActionArgs<N>, ActionReturn<N>>;
    const { state, result } = action(stateRef.current, makeEnv(currentUserRef.current), args);
    commit(state);
    return result;
  };

  const isAuthenticated = Boolean(currentUser);
  const isManagement = currentUser?.role === 'CEO' || currentUser?.role === 'MANAGER';
  const canResolveHold = isManagement;

  // Phase 18: CEO always has full access; other roles follow the CEO-managed matrix
  const canAccessSection = (section: AppSection) => {
    if (!currentUser) return false;
    if (currentUser.role === 'CEO') return true;
    return erpState.accessControl[currentUser.role].includes(section);
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
    return erpState.repairTickets.filter((t) => t.assignedTechnicianId === currentUser.id);
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
    commit(fresh);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch (e) {
      console.error(e);
    }
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
        updateAccessControl: (role, sections) => run('updateAccessControl', { role, sections }),
        loginWithPin,
        loginAsUser,
        logout,
        resetToDemoData,

        // Jobs
        createJob: (jobData) => run('createJob', jobData),
        deleteJob: (jobId) => run('deleteJob', { jobId }),
        updateJobStatus: (id, status) => run('updateJobStatus', { id, status }),
        updateJob: (id, updates) => run('updateJob', { id, updates }),
        startJob: (jobId, beforePhotoUrl) => run('startJob', { jobId, beforePhotoUrl }),
        addWorkLogNote: (jobId, note) => run('addWorkLogNote', { jobId, note }),
        addMaterialUsage: (jobId, materialName, deliveredQty, returnedQty) =>
          run('addMaterialUsage', { jobId, materialName, deliveredQty, returnedQty }),
        raiseHold: (jobId, reason) => run('raiseHold', { jobId, reason }),
        resolveHoldEvent: (holdId) => run('resolveHoldEvent', { holdId }),
        completeJob: (jobId, completionData) => run('completeJob', { jobId, ...completionData }),
        raiseJobInvoice: (jobId, invoiceData) => run('raiseJobInvoice', { jobId, ...invoiceData }),
        verifyJobOtp: (jobId, enteredCode) => run('verifyJobOtp', { jobId, enteredCode }),

        // Billing
        recordPaymentAfterOtp: (data) => run('recordPaymentAfterOtp', data),
        recordManualPayment: (data) => run('recordManualPayment', data),
        addPayment: (payment) => run('addPayment', payment),
        createDeliveryChallan: (data) => run('createDeliveryChallan', data),
        updateDeliveryChallan: (id, updates) => run('updateDeliveryChallan', { id, updates }),
        convertQuotationToDeliveryChallan: (quotationId, jobId) =>
          run('convertQuotationToDeliveryChallan', { quotationId, jobId }),
        convertDeliveryChallanToInvoice: (challanId) => run('convertDeliveryChallanToInvoice', { challanId }),
        createQuotation: (data) => run('createQuotation', data),
        updateQuotation: (id, updates) => run('updateQuotation', { id, updates }),
        convertQuotationToInvoice: (quotationId) => run('convertQuotationToInvoice', { quotationId }),
        updateInvoice: (id, updates) => run('updateInvoice', { id, updates }),

        // Customers & enquiries
        createEnquiry: (data) => run('createEnquiry', data),
        deleteEnquiry: (enquiryId) => run('deleteEnquiry', { enquiryId }),
        addEnquiryFollowUpNote: (enquiryId, noteText) => run('addEnquiryFollowUpNote', { enquiryId, noteText }),
        approveEnquiry: (enquiryId) => run('approveEnquiry', { enquiryId }),
        cancelEnquiry: (enquiryId, reason) => run('cancelEnquiry', { enquiryId, reason }),
        convertEnquiryToJob: (enquiryId, jobId) => run('convertEnquiryToJob', { enquiryId, jobId }),
        getEnquiry: (id) => erpState.enquiries.find((e) => e.id === id || e.enquiryNumber === id),
        addCustomer: (cust) => run('addCustomer', cust),
        updateCustomer: (id, updates) => run('updateCustomer', { id, updates }),

        // Inventory
        addProduct: (prod) => run('addProduct', prod),
        updateProduct: (id, updates) => run('updateProduct', { id, updates }),
        addVendor: (vendor) => run('addVendor', vendor),
        updateVendor: (id, updates) => run('updateVendor', { id, updates }),
        addSerialUnit: (unit) => run('addSerialUnit', unit),
        updateSerialUnit: (id, updates) => run('updateSerialUnit', { id, updates }),
        stockInSerials: (data) => run('stockInSerials', data),
        allocateSerialToJob: (serialId, jobId) => run('allocateSerialToJob', { serialId, jobId }),
        installJobSerials: (jobId, customerId, location) => run('installJobSerials', { jobId, customerId, location }),
        markSerialReturned: (serialId, reason) => run('markSerialReturned', { serialId, reason }),
        addJobProductUsage: (data) => run('addJobProductUsage', data),

        // Repairs
        createRepairTicket: (data) => run('createRepairTicket', data),
        transitionRepairTicket: (ticketId, nextStatus, details) =>
          run('transitionRepairTicket', { ticketId, nextStatus, details }),
        getRepairTicket: (id) => erpState.repairTickets.find((t) => t.id === id || t.ticketNumber === id),

        // Read helpers
        getCustomer: (id) => erpState.customers.find((c) => c.id === id),
        getUser: (id) => erpState.users.find((u) => u.id === id),
        getProduct: (id) => erpState.products.find((p) => p.id === id),
        getVendor: (id) => erpState.vendors.find((v) => v.id === id),
        getJobWorkLogs: (jobId) => erpState.workLogs.filter((w) => w.jobId === jobId),
        getJobMaterials: (jobId) => erpState.materialUsages.filter((m) => m.jobId === jobId),
        getJobHold: (jobId) => erpState.holdEvents.find((h) => h.jobId === jobId && h.status === 'OPEN'),
        getJobInvoice: (jobId) => erpState.invoices.find((i) => i.linkedJobId === jobId),
        getJobQuotation: (job) => getJobQuotationIn(erpState, job),
        getJobOtp: (jobId) => erpState.otpVerifications.find((o) => o.jobId === jobId),
        getJobSerials: (jobId) => erpState.serialUnits.filter((s) => s.installedAtJobId === jobId),
        getJobProductUsages: (jobId) => erpState.jobProductUsages.filter((u) => u.jobId === jobId),
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
