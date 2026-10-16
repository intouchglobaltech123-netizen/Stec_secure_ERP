import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
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
  UserRole,
  QuotationStatus,
  CreditNote,
  PayProfile,
} from './stecsecure-types';
import { ErpState, normalizeSavedState, getJobQuotation as getJobQuotationIn } from './erp/core';
import type { ActionName, ActionArgs, ActionReturn } from './erp/actions';
import type { EditableJobFields } from './erp/actions/jobs';
import type {
  CancelInvoiceResult,
  CreateCreditNoteArgs,
  RecordCreditNoteRefundArgs,
} from './erp/actions/invoiceCorrections';
import { isCancelledInvoice } from './invoice-status';
import { DateRange, inRange, rangeBounds } from './date-range';
import { api, ApiError, errorMessage } from './api';

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
  updateAccessControl: (role: ConfigurableRole, sections: AppSection[]) => Promise<void>;
  payProfiles: PayProfile[]; // CEO only (empty for everyone else)
  setPayProfile: (args: ActionArgs<'setPayProfile'>) => Promise<PayProfile>;
  // Phase 22: mark my notifications read (all, or the given ids)
  markNotificationsRead: (ids?: string[]) => Promise<void>;

  // Auth (Phase 21: server sessions, phone + PIN)
  login: (phone: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  changeOwnPin: (currentPin: string, newPin: string) => Promise<void>;

  // Staff accounts (CEO only)
  listStaff: () => Promise<StaffAccount[]>;
  createStaff: (data: { name: string; role: UserRole; phone: string; pin: string; email?: string }) => Promise<void>;
  updateStaff: (
    id: string,
    data: Partial<{ name: string; role: UserRole; phone: string; email: string; active: boolean }>
  ) => Promise<void>;
  resetStaffPin: (id: string, pin: string) => Promise<void>;

  // Actions — each runs on the server; the promise rejects with a message to show the user
  createJob: (jobData: Omit<Job, 'id' | 'createdAt' | 'jobNumber'> & { jobNumber?: string; teamLeadUserId?: string; enquiryId?: string; createdByUserId?: string }) => Promise<Job>;
  deleteJob: (jobId: string) => Promise<void>;
  updateJobStatus: (id: string, status: JobStatus) => Promise<void>;
  updateJob: (id: string, updates: Partial<Job>) => Promise<void>;
  // Phase 22: edit details / team / schedule, cancel with a reason, undo a product added by mistake
  editJob: (jobId: string, updates: EditableJobFields) => Promise<Job>;
  cancelJob: (jobId: string, reason: string) => Promise<void>;
  removeJobProductUsage: (usageId: string) => Promise<void>;
  startJob: (jobId: string, beforePhotoUrl?: string) => Promise<void>;
  addWorkLogNote: (jobId: string, note: string) => Promise<void>;
  addMaterialUsage: (jobId: string, materialName: string, deliveredQty: number, returnedQty: number) => Promise<void>;
  raiseHold: (jobId: string, reason: string) => Promise<void>;
  resolveHoldEvent: (holdId: string) => Promise<void>;
  completeJob: (
    jobId: string,
    completionData?: {
      afterPhotoUrl?: string;
      serviceAmount?: number;
      serviceGstChoice?: 'GST' | 'NO_GST';
      actionTaken?: string;
      installedLocation?: string;
    }
  ) => Promise<Invoice | void>;
  raiseJobInvoice: (jobId: string, invoiceData: {
    lineItems: LineItem[];
    termsAndConditions?: string;
    paymentMode?: 'CASH' | 'UPI' | 'NEFT' | 'CHEQUE' | 'PENDING';
    amountPaid?: number;
    validityDays?: number;
    beforePhotoUrl?: string;
    afterPhotoUrl?: string;
  }) => Promise<Invoice>;
  verifyJobOtp: (jobId: string, enteredCode: string) => Promise<boolean>;
  recordPaymentAfterOtp: (data: {
    invoiceId: string;
    customerNumber: string;
    statusOption: 'FULL' | 'PARTIAL' | 'NOTHING';
    amountReceived: number;
    paymentMode?: PaymentMode;
    referenceNo?: string;
  }) => Promise<Payment | null>;
  recordManualPayment: (data: {
    invoiceId: string;
    amount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    date?: string;
  }) => Promise<Payment | null>;
  createDeliveryChallan: (data: {
    customerNumber: string;
    lineItems: { itemDescription: string; qty: number }[];
    transportedBy?: string;
    jobId?: string;
    quotationId?: string;
  }) => Promise<DeliveryChallan>;
  updateDeliveryChallan: (id: string, updates: Partial<DeliveryChallan>) => Promise<void>;
  convertQuotationToDeliveryChallan: (quotationId: string, jobId?: string) => Promise<DeliveryChallan>;
  convertDeliveryChallanToInvoice: (challanId: string) => Promise<Invoice>;

  // Enquiry Module Actions
  createEnquiry: (data: Omit<Enquiry, 'id' | 'enquiryNumber' | 'createdAt' | 'followUpNotes' | 'status'> & { status?: EnquiryStatus }) => Promise<Enquiry>;
  deleteEnquiry: (enquiryId: string) => Promise<void>;
  addEnquiryFollowUpNote: (enquiryId: string, noteText: string) => Promise<void>;
  approveEnquiry: (enquiryId: string) => Promise<void>;
  cancelEnquiry: (enquiryId: string, reason: string) => Promise<void>;
  convertEnquiryToJob: (enquiryId: string, jobId: string) => Promise<void>;
  getEnquiry: (id: string) => Enquiry | undefined;

  addCustomer: (cust: Omit<Customer, 'id' | 'createdAt'>) => Promise<Customer>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  addProduct: (prod: Omit<Product, 'id'>) => Promise<Product>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  addVendor: (vendor: Omit<Vendor, 'id'>) => Promise<Vendor>;
  updateVendor: (id: string, updates: Partial<Vendor>) => Promise<void>;
  addSerialUnit: (unit: Omit<SerialUnit, 'id'>) => Promise<SerialUnit>;
  updateSerialUnit: (id: string, updates: Partial<SerialUnit>) => Promise<void>;
  stockInSerials: (data: {
    productId: string;
    serialNumbers: string[];
    vendorId?: string;
    purchaseDate?: string;
    purchaseCost?: number;
  }) => Promise<SerialUnit[]>;
  allocateSerialToJob: (serialId: string, jobId: string) => Promise<void>;
  installJobSerials: (jobId: string, customerId: string, location: string) => Promise<void>;
  markSerialReturned: (serialId: string, reason?: string) => Promise<void>;
  addJobProductUsage: (data: {
    jobId: string;
    productId: string;
    quantity: number;
    serialUnitIds?: string[];
  }) => Promise<JobProductUsage>;

  createQuotation: (data: Omit<Quotation, 'id' | 'quotationNo'> & { quotationNo?: string; status?: QuotationStatus; enquiryId?: string }) => Promise<Quotation>;
  // Phase 22: Sent / Accepted / Rejected / Lost (Invoiced is set by raising the invoice)
  setQuotationStatus: (quotationId: string, status: QuotationStatus, note?: string) => Promise<Quotation>;
  updateQuotation: (id: string, updates: Partial<Quotation>) => Promise<Quotation>;
  convertQuotationToInvoice: (quotationId: string) => Promise<Invoice>;
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<Invoice>;
  // Step 3: cancel an invoice (optionally re-issuing it under a new number), credit notes and refunds
  cancelInvoice: (
    invoiceId: string,
    reason: string,
    reissue?: { customerNumber?: string }
  ) => Promise<CancelInvoiceResult>;
  createCreditNote: (data: CreateCreditNoteArgs) => Promise<CreditNote>;
  recordCreditNoteRefund: (data: RecordCreditNoteRefundArgs) => Promise<Payment>;
  addPayment: (payment: Omit<Payment, 'id'>) => Promise<Payment>;
  // Phase 22: advance against a quotation or job, applied automatically when it is invoiced
  recordAdvance: (data: {
    quotationId?: string;
    jobId?: string;
    amount: number;
    paymentMode: PaymentMode;
    referenceNo?: string;
    date?: string;
  }) => Promise<Payment>;

  // Phase 17 & 17.5: Repair & RMA Ticket Actions
  createRepairTicket: (data: {
    customerId: string;
    assignedTechnicianId: string;
    serialUnitId?: string;
    customUnitDescription?: string;
    sourceJobId?: string | null;
    faultDescription: string;
    initialNote?: string;
  }) => Promise<RepairTicket>;
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
  ) => Promise<void>;
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
  getTechnicianStats: (userId: string, range?: DateRange) => {
    totalJobs: number;
    activeJobs: number;
    completedJobs: number;
    holdsRaised: number;
    totalHoursLogged: number;
    avgDurationHours: number | null; // null when no finished job has a recorded duration
  };
}

export interface StaffAccount extends User {
  active: boolean;
  locked: boolean;
}

const StecSecureContext = createContext<StecSecureContextType | undefined>(undefined);

type CollectionName = Exclude<keyof ErpState, 'accessControl'>;
interface StateChanges {
  upserts: Partial<Record<CollectionName, { id: string }[]>>;
  deletes: Partial<Record<CollectionName, string[]>>;
  accessControl?: ErpState['accessControl'];
}

const EMPTY_STATE: ErpState = normalizeSavedState({}, { browserLegacyFixes: false });
const POLL_MS = 15_000;

// Applies the records an action changed on the server to the local copy
function applyChanges(state: ErpState, changes: StateChanges): ErpState {
  const next: ErpState = { ...state };
  const collections = new Set([
    ...Object.keys(changes.upserts),
    ...Object.keys(changes.deletes),
  ]) as Set<CollectionName>;
  for (const c of collections) {
    const deleted = new Set(changes.deletes[c] ?? []);
    const byId = new Map((changes.upserts[c] ?? []).map((r) => [r.id, r]));
    const list = (state[c] as { id: string }[])
      .filter((r) => !deleted.has(r.id))
      .map((r) => {
        const updated = byId.get(r.id);
        if (updated) byId.delete(r.id);
        return updated ?? r;
      });
    // Records not seen before are new: lists are newest-first, except the staff list
    const fresh = [...byId.values()];
    (next as any)[c] = c === 'users' ? [...list, ...fresh] : [...fresh, ...list];
  }
  if (changes.accessControl) next.accessControl = changes.accessControl;
  return next;
}

type Status = 'checking' | 'logged-out' | 'loading' | 'ready';

export const StecSecureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Status>('checking');
  const [erpState, setErpState] = useState<ErpState>(EMPTY_STATE);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const versionRef = useRef(0);
  // Identical actions already on their way to the server (double clicks) share one request
  const inFlightRef = useRef(new Map<string, Promise<unknown>>());

  const signedOut = () => {
    setCurrentUser(null);
    setErpState(EMPTY_STATE);
    versionRef.current = 0;
    setStatus('logged-out');
  };

  // Full (first time) or incremental refresh of this user's data
  const refreshState = async () => {
    try {
      const data = await api<{ version: number; state: ErpState } | undefined>(
        `/state${versionRef.current ? `?since=${versionRef.current}` : ''}`
      );
      if (!data) return; // nothing changed
      versionRef.current = data.version;
      setErpState(data.state);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) signedOut();
      else throw err;
    }
  };

  // Restore an existing session on start
  useEffect(() => {
    (async () => {
      try {
        const { user } = await api<{ user: User }>('/auth/me');
        setCurrentUser(user);
        setStatus('loading');
        await refreshState();
        setStatus('ready');
      } catch {
        signedOut();
      }
    })();
  }, []);

  // Pick up other people's changes: every 15 seconds and whenever the app comes back to the screen
  useEffect(() => {
    if (status !== 'ready') return;
    const tick = () => {
      if (document.visibilityState === 'visible') refreshState().catch(() => undefined);
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [status]);

  // Phase 21: every business action runs on the server (shared src/lib/erp/actions + server-side
  // permissions); the reply carries the changed records, which are merged into the local copy
  const run = <N extends ActionName>(name: N, args: ActionArgs<N>): Promise<ActionReturn<N>> => {
    const key = `${name}:${JSON.stringify(args)}`;
    const pending = inFlightRef.current.get(key);
    if (pending) return pending as Promise<ActionReturn<N>>;

    const request = (async () => {
      try {
        const res = await api<{ result: ActionReturn<N>; version: number; changes: StateChanges }>(
          `/actions/${name}`,
          { body: { args } }
        );
        setErpState((prev) => applyChanges(prev, res.changes));
        if (res.version === versionRef.current + 1) {
          versionRef.current = res.version;
        } else {
          // Someone else changed data in between — fetch everything so nothing is missed
          versionRef.current = 0;
          refreshState().catch(() => undefined);
        }
        return res.result;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) signedOut();
        throw err;
      } finally {
        inFlightRef.current.delete(key);
      }
    })();
    inFlightRef.current.set(key, request);
    return request;
  };

  const login = async (phone: string, pin: string) => {
    try {
      const { user } = await api<{ user: User }>('/auth/login', { body: { phone, pin } });
      setCurrentUser(user);
      setStatus('loading');
      versionRef.current = 0;
      await refreshState();
      setStatus('ready');
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { body: {} });
    } finally {
      signedOut();
    }
  };

  // Staff changes alter the user list, so the local copy is refreshed afterwards
  const afterStaffChange = async () => {
    versionRef.current = 0;
    await refreshState();
  };

  const isAuthenticated = status === 'ready' && Boolean(currentUser);
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

  // Phase 17.5: Strict per-assignment visibility for Repair Tickets (assigned or bench technician)
  const visibleRepairTickets = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'CEO' || currentUser.role === 'MANAGER') {
      return erpState.repairTickets;
    }
    return erpState.repairTickets.filter(
      (t) => t.assignedTechnicianId === currentUser.id || t.inHouseRepairedByUserId === currentUser.id
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

  // Real figures only: jobs created in the period, hours from the work log (the part inside the
  // period), and the average over finished jobs that have a recorded duration
  const getTechnicianStats = (userId: string, range?: DateRange) => {
    const inPeriod = (value?: string) => !range || inRange(value, range);
    const userJobs = erpState.jobs.filter(
      (j) => (j.assignedTeam.includes(userId) || j.teamLeadUserId === userId) && inPeriod(j.createdAt)
    );
    const activeJobs = userJobs.filter(
      (j) => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED' || j.status === 'ON_HOLD' || j.status === 'AWAITING_OTP'
    ).length;
    const finished = userJobs.filter((j) => j.status === 'COMPLETED' || j.status === 'CLOSED');
    const holdsRaised = erpState.holdEvents.filter((h) => h.raisedByUserId === userId && inPeriod(h.raisedAt)).length;

    const { start, end } = range ? rangeBounds(range) : { start: -Infinity, end: Infinity };
    let totalMs = 0;
    erpState.workLogs
      .filter((w) => w.userId === userId && w.inTime)
      .forEach((wl) => {
        const inMs = new Date(wl.inTime).getTime();
        // A session still open counts up to now, unless it was left running for over 12 hours
        const outMs = wl.outTime
          ? new Date(wl.outTime).getTime()
          : Date.now() - inMs < 12 * 3_600_000
          ? Date.now()
          : inMs;
        const from = Math.max(inMs, start);
        const to = Math.min(outMs, end);
        if (to > from) totalMs += to - from;
      });

    const roundedHours = Math.round((totalMs / 3_600_000) * 10) / 10;
    const timed = finished.filter((j) => (j.totalDurationSeconds || 0) > 0);
    const avgDurationHours = timed.length
      ? Math.round((timed.reduce((sum, j) => sum + (j.totalDurationSeconds || 0), 0) / timed.length / 3600) * 10) / 10
      : null;
    const completedJobs = finished.length;

    return {
      totalJobs: userJobs.length,
      activeJobs,
      completedJobs,
      holdsRaised,
      totalHoursLogged: roundedHours,
      avgDurationHours,
    };
  };

  if (status === 'checking' || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
        {status === 'checking' ? 'Starting S Tec Secure ERP…' : 'Loading your data…'}
      </div>
    );
  }

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
        payProfiles: erpState.payProfiles,
        setPayProfile: (args) => run('setPayProfile', args),
        markNotificationsRead: (ids) => run('markNotificationsRead', { ids }),
        login,
        logout,
        changeOwnPin: async (currentPin, newPin) => {
          await api('/auth/change-pin', { body: { currentPin, newPin } });
        },

        listStaff: async () => (await api<{ users: StaffAccount[] }>('/admin/users')).users,
        createStaff: async (data) => {
          await api('/admin/users', { body: data });
          await afterStaffChange();
        },
        updateStaff: async (id, data) => {
          await api(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: data });
          await afterStaffChange();
        },
        resetStaffPin: async (id, pin) => {
          await api(`/admin/users/${encodeURIComponent(id)}/reset-pin`, { body: { pin } });
        },

        // Jobs
        createJob: (jobData) => run('createJob', jobData),
        deleteJob: (jobId) => run('deleteJob', { jobId }),
        updateJobStatus: (id, status) => run('updateJobStatus', { id, status }),
        updateJob: (id, updates) => run('updateJob', { id, updates }),
        editJob: (jobId, updates) => run('editJob', { jobId, updates }),
        cancelJob: (jobId, reason) => run('cancelJob', { jobId, reason }),
        removeJobProductUsage: (usageId) => run('removeJobProductUsage', { usageId }),
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
        recordAdvance: (data) => run('recordAdvance', data),
        createDeliveryChallan: (data) => run('createDeliveryChallan', data),
        updateDeliveryChallan: (id, updates) => run('updateDeliveryChallan', { id, updates }),
        convertQuotationToDeliveryChallan: (quotationId, jobId) =>
          run('convertQuotationToDeliveryChallan', { quotationId, jobId }),
        convertDeliveryChallanToInvoice: (challanId) => run('convertDeliveryChallanToInvoice', { challanId }),
        createQuotation: (data) => run('createQuotation', data),
        setQuotationStatus: (quotationId, status, note) => run('setQuotationStatus', { quotationId, status, note }),
        updateQuotation: (id, updates) => run('updateQuotation', { id, updates }),
        convertQuotationToInvoice: (quotationId) => run('convertQuotationToInvoice', { quotationId }),
        updateInvoice: (id, updates) => run('updateInvoice', { id, updates }),
        cancelInvoice: (invoiceId, reason, reissue) => run('cancelInvoice', { invoiceId, reason, reissue }),
        createCreditNote: (data) => run('createCreditNote', data),
        recordCreditNoteRefund: (data) => run('recordCreditNoteRefund', data),

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
        getJobInvoice: (jobId) =>
          erpState.invoices.find((i) => i.linkedJobId === jobId && !isCancelledInvoice(i)),
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
