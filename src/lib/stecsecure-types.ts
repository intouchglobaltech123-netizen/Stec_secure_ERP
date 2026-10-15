// S Tec Secure ERP - Core Data Models

export type UserRole = 'CEO' | 'MANAGER' | 'TECHNICIAN';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  phone: string;
  pin?: string; // 4-digit PIN — demo/offline mode only; the server keeps hashed PINs separately and never sends them
  photo?: string;
  email?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  gstin?: string;
  createdAt: string;
  email?: string;
  contactPerson?: string;
  amcRenewalDate?: string;
  amcActive?: boolean;
  siteLocationMapLink?: string; // Google Maps URL (maps.app.goo.gl or google.com/maps)
}

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  address: string;
  gstin?: string;
  contactPerson?: string;
}

export type ServiceCategory =
  | 'CCTV'
  | 'Home Automations'
  | 'Gate Automation'
  | 'Biometric & Access Control'
  | 'Intercom'
  | 'Burglar Alarm System';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'CCTV',
  'Home Automations',
  'Gate Automation',
  'Biometric & Access Control',
  'Intercom',
  'Burglar Alarm System',
];

export interface Product {
  id: string;
  name: string;
  category: ServiceCategory;
  hsnSac?: string;
  unit: string; // e.g. 'Nos', 'Mtr', 'Set', 'Pkt'
  defaultRate: number;
  gstRate: number; // percentage e.g. 18
  description?: string;
  barcode?: string;
}

export type SerialStatus = 'IN_STOCK' | 'ALLOCATED' | 'INSTALLED' | 'RETURNED' | 'IN_REPAIR';

export interface SerialUnit {
  id: string;
  productId: string;
  serialNumber: string;
  status: SerialStatus;
  purchasedFromVendorId?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  soldToCustomerId?: string;
  installedAtJobId?: string;
  installedLocation?: string;
}

export type JobType = 'SERVICE' | 'INSTALLATION';

export type JobStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'AWAITING_OTP'
  | 'CLOSED'
  | 'CANCELLED'; // Phase 22: cancelled by management, with a reason

export type CustomerStatus = 'WARRANTY' | 'AMC' | 'SERVICE_CALL' | 'OTHERS';

export interface Job {
  id: string;
  jobNumber: string; // e.g. "JOB-2024-001"
  type: JobType;
  category: ServiceCategory;
  customerNumber: string; // references Customer id or customer phone/id
  status: JobStatus;
  customerStatus: CustomerStatus;
  assignedTeam: string[]; // array of User ids (technicians)
  teamLeadUserId?: string; // designated team lead with full execution authority
  enquiryId?: string; // optional originating enquiry ref
  quotationId?: string; // optional linked quotation
  productModel?: string;
  serialNo?: string;
  problemReported?: string;
  analysisReason?: string;
  actionTaken?: string;
  serviceAmount: number;
  taxable: boolean; // computed or legacy
  serviceGstChoice?: 'GST' | 'NO_GST';
  beforePhotoUrl?: string; // base64 encoded photo
  afterPhotoUrl?: string; // base64 encoded photo
  timerStartedAt?: string; // ISO string when timer is running
  timerElapsedSeconds?: number; // accumulated running seconds
  totalDurationSeconds?: number; // final completed duration
  createdByUserId?: string; // Phase 13: CEO / Manager who created the job
  createdAt: string;
  completedAt?: string;
  // Phase 22: scheduling, site contact and cancellation
  scheduledFor?: string; // planned visit, local 'YYYY-MM-DDTHH:mm'
  siteContactName?: string;
  siteContactPhone?: string;
  cancelledAt?: string;
  cancelledByUserId?: string;
  cancelledReason?: string;
}

export interface WorkLogEntry {
  timestamp: string;
  note: string;
}

export interface WorkLog {
  id: string;
  jobId: string;
  userId: string;
  inTime: string;
  outTime?: string;
  notesLog: WorkLogEntry[];
}

export type HoldStatus = 'OPEN' | 'RESOLVED';

export interface HoldEvent {
  id: string;
  jobId: string;
  reason: string;
  raisedByUserId: string;
  raisedAt: string;
  resolvedByUserId?: string;
  resolvedAt?: string;
  status: HoldStatus;
}

export interface MaterialUsage {
  id: string;
  jobId: string;
  materialName: string;
  deliveredQty: number;
  returnedQty: number;
}

// Phase 8: Flexible Product Usage (Quantity-based, addable anytime)
export interface JobProductUsage {
  id: string;
  jobId: string;
  productId: string;
  quantity: number;
  serialUnitIds: string[]; // array, may be empty if product isn't serial-tracked or serials weren't specified
  addedByUserId: string;
  addedAt: string;
}


export interface LineItem {
  itemName: string;
  description: string;
  hsnSac: string;
  gstRate: number; // e.g. 18
  qty: number;
  rate: number;
  amount: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  accountType?: string;
  upiId?: string;
}

export const COMPANY_DETAILS = {
  name: "S Tec Secure (Surveillance & Automation's)",
  legalName: 'S TEC SECURE',
  address: '14/2 Thundu Kadu Street, Veerappan Chathiram, Erode, Tamil Nadu, India - 638004',
  gstin: '33KDUPS8091G1ZL',
  pan: 'KDUPS8091G',
  email: 'stecsecure@gmail.com',
  phone: '81485 62605 / 96002 52605',
  tagline: 'CCTV | HOME AUTOMATIONS | GATE AUTOMATION | BIOMETRIC & ACCESS CONTROL | INTERCOM | BURGLAR ALARM SYSTEM',
  bank: {
    accountName: 'S TEC SECURE',
    bankName: 'CANARA',
    accountNumber: '120001799990',
    ifscCode: 'CNRB0005567',
    accountType: 'Current',
    branch: 'Veerappan Chathiram, Erode',
    upiId: 'UPI: TBD',
  },
};

// Phase 22: Draft → Sent → Accepted / Rejected / Lost → Converted (= invoiced)
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'LOST' | 'CONVERTED';

export interface Quotation {
  id: string;
  quotationNo: string; // format A##### e.g. A24081
  customerNumber: string; // Customer ref
  date: string;
  validityDays: number;
  lineItems: LineItem[];
  termsAndConditions: string;
  totalAmount: number;
  totalCgst: number;
  totalSgst: number;
  roundOff: number;
  grandTotal: number;
  bankDetails: BankDetails;
  status?: QuotationStatus;
  statusNote?: string; // e.g. why it was rejected or lost
  statusUpdatedAt?: string;
  enquiryId?: string; // Phase 9.5: Linked back to source Enquiry
  whatsappSharedAt?: string; // Phase 12: WhatsApp outreach timestamp
}

export interface Invoice {
  id: string;
  invoiceNo: string; // format INV-####
  customerNumber: string; // Customer ref
  date: string;
  validityDays: number;
  lineItems: LineItem[];
  termsAndConditions: string;
  totalAmount: number;
  totalCgst: number;
  totalSgst: number;
  roundOff: number;
  grandTotal: number;
  bankDetails: BankDetails;
  linkedJobId?: string;
  deliveryChallanId?: string; // Phase 15: Linked Delivery Challan ID
  amountPaid: number;
  balanceDue: number;
  paymentMode: 'CASH' | 'UPI' | 'NEFT' | 'CHEQUE' | 'PENDING';
  quotationId?: string; // source quotation (direct or via delivery challan) — used to block double invoicing
  raisedByUserId?: string; // technician who raised it at job completion
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
}

export interface DeliveryChallanLineItem {
  itemDescription: string;
  qty: number;
}

export interface DeliveryChallan {
  id: string;
  challanNo: string; // e.g. DC-2024-001
  date: string;
  customerNumber: string;
  lineItems: DeliveryChallanLineItem[];
  receiverSignature?: string; // mock signature text/url
  transportedBy?: string;
  jobId?: string; // Phase 15: Linked Job ID
  quotationId?: string; // Phase 15: Linked Quotation ID
}

export type PaymentMode = 'CASH' | 'UPI' | 'NEFT' | 'CHEQUE';
export type PaymentType = 'ADVANCE' | 'BALANCE' | 'FULL';

export interface Payment {
  id: string;
  customerNumber: string;
  // Phase 22: an advance taken before invoicing has no invoice yet; it is linked to its quotation or
  // job and applied to the invoice automatically when that invoice is raised
  invoiceId?: string;
  quotationId?: string;
  jobId?: string;
  amount: number;
  mode: PaymentMode;
  date: string;
  type: PaymentType;
  receiptNo?: string; // RCPT-<FY>-### — sequential receipt number (older payments have none)
  referenceNo?: string; // UTR / cheque number given by the customer
}

export type OTPStatus = 'PENDING' | 'VERIFIED';

export interface OTPVerification {
  id: string;
  jobId: string;
  otpCode: string; // mock, always "1234" for demo
  sentAt: string;
  verifiedAt?: string;
  status: OTPStatus;
}

// Phase 6: Enquiry Pipeline Models
export type EnquiryType = 'SERVICE' | 'INSTALLATION';

export type EnquiryStatus = 'FOLLOW_UP' | 'APPROVED' | 'CANCELLED';

export type EnquirySource =
  | 'Phone'
  | 'WhatsApp'
  | 'Referral'
  | 'Walk-in'
  | 'Website'
  | 'Other';

export interface EnquiryFollowUpNote {
  id: string;
  text: string;
  createdAt: string;
  createdByUserId?: string;
  createdByUserName?: string;
}

export interface Enquiry {
  id: string;
  enquiryNumber: string; // e.g. "ENQ-2024-001"
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerId?: string; // link to existing Customer if already in system
  enquiryType: EnquiryType;
  category: ServiceCategory;
  description: string;
  source?: EnquirySource | string;
  status: EnquiryStatus;
  createdByUserId: string;
  createdAt: string;
  followUpNotes: EnquiryFollowUpNote[];
  cancelledReason?: string;
  convertedJobId?: string; // set when approved and converted to a Job
  quotationId?: string; // Phase 12: Linked quotation ID
}

// Phase 17: Repair & RMA Ticket Tracking
export type RepairStatus =
  | 'FAULT_REPORTED'
  | 'PICKED_UP'
  | 'CHECKED_IN_AT_OFFICE'
  | 'IN_HOUSE_REPAIR'
  | 'SENT_TO_VENDOR'
  | 'READY_TO_REINSTALL'
  | 'REINSTALLED'
  | 'WRITE_OFF';

export type RepairPath = 'IN_HOUSE' | 'VENDOR';

export interface RepairTimelineEntry {
  status: RepairStatus;
  timestamp: string;
  userId: string;
  note?: string;
}

export interface RepairTicket {
  id: string;
  ticketNumber: string; // e.g. RMA-2024-001
  serialUnitId?: string; // link to specific unit if in inventory
  customUnitDescription?: string; // if walk-in / uncatalogued unit
  customerId: string;
  assignedTechnicianId: string; // Phase 17.5: Assigned technician responsible for physical collection & reinstallation
  sourceJobId?: string | null; // optional — set if raised from existing Service job, null if standalone
  faultDescription: string;
  status: RepairStatus;
  repairPath: RepairPath | null; // null until decided at CHECKED_IN_AT_OFFICE
  vendorId?: string;
  vendorSentDate?: string;
  vendorExpectedReturnDate?: string;
  vendorActualReturnDate?: string;
  vendorRepairNotes?: string;
  inHouseRepairNotes?: string;
  inHouseRepairedByUserId?: string;
  reinstalledByUserId?: string;
  reinstalledAt?: string;
  reinstalledLocation?: string;
  createdByUserId: string;
  createdAt: string;
  timeline: RepairTimelineEntry[];
}

// Phase 22: in-app notifications — addressed to specific staff, read state per person
export interface AppNotification {
  id: string;
  createdAt: string;
  recipientUserIds: string[];
  readBy: string[];
  title: string;
  body?: string;
  section?: string; // AppSection to open when clicked
  jobId?: string;
}

// Phase 18: CEO-managed access control — which app sections each role may open
export type AppSection =
  | 'dashboard'
  | 'enquiries'
  | 'service-jobs'
  | 'installation-jobs'
  | 'repairs'
  | 'inventory'
  | 'customers'
  | 'technicians'
  | 'quotations-invoices'
  | 'payments'
  | 'reports'
  | 'settings';

export const APP_SECTIONS: { id: AppSection; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'enquiries', label: 'Enquiries' },
  { id: 'service-jobs', label: 'Service Jobs' },
  { id: 'installation-jobs', label: 'Installation Jobs' },
  { id: 'repairs', label: 'Repair' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customers', label: 'Customers' },
  { id: 'technicians', label: 'Technicians' },
  { id: 'quotations-invoices', label: 'Quotations & Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

// CEO always has every section; only these roles are configurable
export type ConfigurableRole = Exclude<UserRole, 'CEO'>;

export type AccessControl = Record<ConfigurableRole, AppSection[]>;

export const DEFAULT_ACCESS_CONTROL: AccessControl = {
  MANAGER: APP_SECTIONS.map((s) => s.id),
  TECHNICIAN: ['dashboard', 'service-jobs', 'installation-jobs', 'repairs'],
};
