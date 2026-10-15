// What each user is allowed to receive. Management gets everything; a technician gets their own work
// plus whatever pages the CEO has enabled for technicians in Access Control.
import { ErpState, resolveQuotationId } from '../../src/lib/erp/core';
import { AppSection, User } from '../../src/lib/stecsecure-types';

export const isManagementRole = (user: User) => user.role === 'CEO' || user.role === 'MANAGER';

export function canAccessSection(state: ErpState, user: User, section: AppSection): boolean {
  if (user.role === 'CEO') return true;
  return state.accessControl[user.role].includes(section);
}

export function scopeStateFor(state: ErpState, user: User): ErpState {
  if (isManagementRole(user)) return state;

  const allows = (section: AppSection) => canAccessSection(state, user, section);
  // Company-wide pages need company-wide data
  if (allows('reports') || allows('technicians')) return state;

  const myJobs = state.jobs.filter((j) => j.assignedTeam.includes(user.id) || j.teamLeadUserId === user.id);
  const jobIds = new Set(myJobs.map((j) => j.id));
  const byJob = <T extends { jobId: string }>(list: T[]) => list.filter((r) => jobIds.has(r.jobId));

  const myTickets = state.repairTickets.filter(
    (t) => t.assignedTechnicianId === user.id || t.inHouseRepairedByUserId === user.id
  );

  const billing = allows('quotations-invoices');
  const payments = allows('payments');
  const invoices =
    billing || payments ? state.invoices : state.invoices.filter((i) => i.linkedJobId && jobIds.has(i.linkedJobId));
  const invoiceIds = new Set(invoices.map((i) => i.id));

  const myQuotationIds = new Set(myJobs.map((j) => resolveQuotationId(state, j.quotationId)).filter(Boolean));
  const enquiries = allows('enquiries')
    ? state.enquiries
    : state.enquiries.filter((e) => myJobs.some((j) => j.enquiryId === e.id));
  const quotations =
    billing || allows('enquiries') ? state.quotations : state.quotations.filter((q) => myQuotationIds.has(q.id));

  const inventory = allows('inventory');
  // Customer list is needed to raise repair tickets; balances come from invoices, which stay scoped
  const allCustomers = inventory || billing || payments || allows('customers') || allows('enquiries') || allows('repairs');
  const myCustomerIds = new Set([
    ...myJobs.map((j) => j.customerNumber),
    ...myTickets.map((t) => t.customerId),
  ]);

  return {
    ...state,
    jobs: myJobs,
    workLogs: byJob(state.workLogs),
    holdEvents: byJob(state.holdEvents),
    materialUsages: byJob(state.materialUsages),
    jobProductUsages: byJob(state.jobProductUsages),
    otpVerifications: byJob(state.otpVerifications),
    repairTickets: myTickets,
    invoices,
    payments: payments ? state.payments : state.payments.filter((p) => p.invoiceId && invoiceIds.has(p.invoiceId)),
    deliveryChallans: billing
      ? state.deliveryChallans
      : state.deliveryChallans.filter((dc) => dc.jobId && jobIds.has(dc.jobId)),
    quotations,
    enquiries,
    customers: allCustomers ? state.customers : state.customers.filter((c) => myCustomerIds.has(c.id)),
    // Purchase costs and suppliers are inventory information
    serialUnits: inventory
      ? state.serialUnits
      : state.serialUnits.map(({ purchaseCost: _cost, purchasedFromVendorId: _vendor, ...unit }) => unit),
    vendors: inventory ? state.vendors : state.vendors.map((v) => ({ id: v.id, name: v.name, phone: '', address: '' })),
  };
}
