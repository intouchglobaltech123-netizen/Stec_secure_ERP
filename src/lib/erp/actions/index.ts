// Registry of every business action, by name — the server dispatches on these names
import * as jobs from './jobs';
import * as billing from './billing';
import * as inventory from './inventory';
import * as crm from './crm';
import * as repairs from './repairs';
import * as admin from './admin';

export const ACTIONS = {
  createJob: jobs.createJob,
  deleteJob: jobs.deleteJob,
  updateJobStatus: jobs.updateJobStatus,
  updateJob: jobs.updateJob,
  editJob: jobs.editJob,
  cancelJob: jobs.cancelJob,
  startJob: jobs.startJob,
  addWorkLogNote: jobs.addWorkLogNote,
  addMaterialUsage: jobs.addMaterialUsage,
  raiseHold: jobs.raiseHold,
  resolveHoldEvent: jobs.resolveHoldEvent,
  completeJob: jobs.completeJob,
  raiseJobInvoice: jobs.raiseJobInvoice,
  verifyJobOtp: jobs.verifyJobOtp,

  recordPaymentAfterOtp: billing.recordPaymentAfterOtp,
  recordManualPayment: billing.recordManualPayment,
  addPayment: billing.addPayment,
  recordAdvance: billing.recordAdvance,
  createDeliveryChallan: billing.createDeliveryChallan,
  updateDeliveryChallan: billing.updateDeliveryChallan,
  createQuotation: billing.createQuotation,
  updateQuotation: billing.updateQuotation,
  updateInvoice: billing.updateInvoice,
  convertQuotationToInvoice: billing.convertQuotationToInvoice,
  convertQuotationToDeliveryChallan: billing.convertQuotationToDeliveryChallan,
  convertDeliveryChallanToInvoice: billing.convertDeliveryChallanToInvoice,

  addProduct: inventory.addProduct,
  updateProduct: inventory.updateProduct,
  addVendor: inventory.addVendor,
  updateVendor: inventory.updateVendor,
  addSerialUnit: inventory.addSerialUnit,
  updateSerialUnit: inventory.updateSerialUnit,
  stockInSerials: inventory.stockInSerials,
  allocateSerialToJob: inventory.allocateSerialToJob,
  installJobSerials: inventory.installJobSerials,
  markSerialReturned: inventory.markSerialReturned,
  addJobProductUsage: inventory.addJobProductUsage,
  removeJobProductUsage: inventory.removeJobProductUsage,

  addCustomer: crm.addCustomer,
  updateCustomer: crm.updateCustomer,
  createEnquiry: crm.createEnquiry,
  deleteEnquiry: crm.deleteEnquiry,
  addEnquiryFollowUpNote: crm.addEnquiryFollowUpNote,
  approveEnquiry: crm.approveEnquiry,
  cancelEnquiry: crm.cancelEnquiry,
  convertEnquiryToJob: crm.convertEnquiryToJob,

  createRepairTicket: repairs.createRepairTicket,
  transitionRepairTicket: repairs.transitionRepairTicket,

  updateAccessControl: admin.updateAccessControl,
} as const;

export type ActionName = keyof typeof ACTIONS;
export type ActionArgs<N extends ActionName> = Parameters<(typeof ACTIONS)[N]>[2];
export type ActionReturn<N extends ActionName> = ReturnType<(typeof ACTIONS)[N]>['result'];
