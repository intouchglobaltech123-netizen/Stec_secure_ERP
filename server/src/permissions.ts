// Who may run which action. Checked on the server before every action, so hiding a button in the
// app is never the only protection. Returns a reason when the action is refused.
import { ErpState } from '../../src/lib/erp/core';
import { ActionName } from '../../src/lib/erp/actions';
import { AppSection, Job, User } from '../../src/lib/stecsecure-types';
import { canAccessSection, isManagementRole } from './scope';

type Check = (ctx: { state: ErpState; user: User; args: any }) => string | null;

const DENIED = 'You do not have permission to do this.';

const managementOnly: Check = ({ user }) => (isManagementRole(user) ? null : DENIED);
const ceoOnly: Check = ({ user }) => (user.role === 'CEO' ? null : 'Only the CEO can do this.');
const section =
  (s: AppSection): Check =>
  ({ state, user }) =>
    canAccessSection(state, user, s) ? null : DENIED;
const all =
  (...checks: Check[]): Check =>
  (ctx) => {
    for (const check of checks) {
      const reason = check(ctx);
      if (reason) return reason;
    }
    return null;
  };

const findJob = (state: ErpState, jobId?: string) => state.jobs.find((j) => j.id === jobId);
const isLead = (job: Job, user: User) =>
  job.teamLeadUserId === user.id || (!job.teamLeadUserId && job.assignedTeam[0] === user.id);
const isMember = (job: Job, user: User) => isLead(job, user) || job.assignedTeam.includes(user.id);

// Team lead (or management) of the job named by args.jobId
const jobLead =
  (jobIdOf: (args: any, state: ErpState) => string | undefined = (a) => a.jobId): Check =>
  ({ state, user, args }) => {
    if (isManagementRole(user)) return null;
    const job = findJob(state, jobIdOf(args, state));
    if (!job) return 'Job not found.';
    return isLead(job, user) ? null : 'Only the team lead of this job can do this.';
  };
const jobMember: Check = ({ state, user, args }) => {
  if (isManagementRole(user)) return null;
  const job = findJob(state, args.jobId);
  if (!job) return 'Job not found.';
  return isMember(job, user) ? null : 'You are not on the team for this job.';
};

const invoiceJob = (args: any, state: ErpState) => state.invoices.find((i) => i.id === args.invoiceId)?.linkedJobId;

const RULES: Record<ActionName, Check> = {
  // Jobs — created and administered by management; worked by their team
  createJob: managementOnly,
  deleteJob: ceoOnly,
  updateJob: managementOnly,
  editJob: managementOnly,
  cancelJob: managementOnly,
  updateJobStatus: managementOnly,
  startJob: jobLead(),
  completeJob: jobLead(),
  verifyJobOtp: jobLead(),
  raiseJobInvoice: managementOnly,
  addWorkLogNote: jobMember,
  addMaterialUsage: jobMember,
  raiseHold: jobMember,
  addJobProductUsage: jobMember,
  removeJobProductUsage: jobLead((args, state) => state.jobProductUsages.find((u) => u.id === args.usageId)?.jobId),
  allocateSerialToJob: jobMember,
  resolveHoldEvent: ({ state, user, args }) => {
    if (isManagementRole(user)) return null;
    const hold = state.holdEvents.find((h) => h.id === args.holdId);
    const job = hold && findJob(state, hold.jobId);
    if (!hold || !job) return 'Hold not found.';
    return isLead(job, user) || hold.raisedByUserId === user.id ? null : 'Only the team lead can resume this job.';
  },

  // Payment collection at job closure — team lead; other payments — Payments page
  recordPaymentAfterOtp: jobLead(invoiceJob),
  recordManualPayment: all(managementOnly, section('payments')),
  addPayment: all(managementOnly, section('payments')),
  recordAdvance: managementOnly,

  // Commercial documents — management
  createQuotation: managementOnly,
  updateQuotation: managementOnly,
  setQuotationStatus: managementOnly,
  updateInvoice: managementOnly,
  createDeliveryChallan: managementOnly,
  updateDeliveryChallan: managementOnly,
  convertQuotationToInvoice: managementOnly,
  convertQuotationToDeliveryChallan: managementOnly,
  convertDeliveryChallanToInvoice: managementOnly,
  // Step 3: correcting issued invoices
  cancelInvoice: managementOnly,
  createCreditNote: managementOnly,
  recordCreditNoteRefund: managementOnly,

  // Inventory — whoever has the Inventory page
  addProduct: section('inventory'),
  updateProduct: section('inventory'),
  addVendor: section('inventory'),
  updateVendor: section('inventory'),
  addSerialUnit: section('inventory'),
  updateSerialUnit: section('inventory'),
  stockInSerials: section('inventory'),
  markSerialReturned: section('inventory'),
  installJobSerials: managementOnly,

  // Customers — anyone may add one (quick-add in jobs and repairs); editing needs the Customers page,
  // except a technician saving the site map link for a customer on their own job
  addCustomer: () => null,
  updateCustomer: ({ state, user, args }) => {
    if (canAccessSection(state, user, 'customers')) return null;
    const onlySiteLink = Object.keys(args.updates || {}).every((k) => k === 'siteLocationMapLink');
    const ownCustomer = state.jobs.some((j) => j.customerNumber === args.id && isMember(j, user));
    return onlySiteLink && ownCustomer ? null : DENIED;
  },

  // Enquiries — whoever has the Enquiries page; deleting is management
  createEnquiry: section('enquiries'),
  deleteEnquiry: all(managementOnly, section('enquiries')),
  addEnquiryFollowUpNote: section('enquiries'),
  approveEnquiry: all(managementOnly, section('enquiries')),
  cancelEnquiry: all(managementOnly, section('enquiries')),
  convertEnquiryToJob: managementOnly,

  // Repairs — any Repair page user raises tickets; the assigned / bench technician or management moves them
  createRepairTicket: section('repairs'),
  transitionRepairTicket: ({ state, user, args }) => {
    if (isManagementRole(user)) return null;
    const t = state.repairTickets.find((r) => r.id === args.ticketId);
    if (!t) return 'Repair ticket not found.';
    return t.assignedTechnicianId === user.id || t.inHouseRepairedByUserId === user.id ? null : DENIED;
  },

  updateAccessControl: ceoOnly,
  // Only ever touches the caller's own notifications
  markNotificationsRead: () => null,
};

export function checkPermission(name: ActionName, state: ErpState, user: User, args: unknown): string | null {
  const rule = RULES[name];
  return rule ? rule({ state, user, args: args ?? {} }) : DENIED;
}
