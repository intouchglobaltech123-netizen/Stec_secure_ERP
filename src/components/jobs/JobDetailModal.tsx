import React from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Job, Quotation, DeliveryChallan, Invoice } from '@/lib/stecsecure-types';
import {
  X,
  Wrench,
  User,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Package,
  ReceiptText,
  Tag,
  MapPin,
  FileText,
  Boxes,
  ExternalLink,
  Plus,
  Play,
  Trash2,
  UserCheck,
  Truck,
  ArrowRight,
  FileSpreadsheet,
  Edit,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatDateTime, formatDate, formatINR, formatCreatedBy } from '@/lib/utils';
import { SiteLocationModal } from '@/components/customers/SiteLocationModal';
import { DeliveryChallanModal } from '@/components/jobs/DeliveryChallanModal';
import { QuotationBuilderModal } from '@/components/quotations/QuotationBuilderModal';
import { QuotationPreviewModal } from '@/components/quotations/QuotationPreviewModal';
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal';
import { RepairTicket } from '@/lib/stecsecure-types';
import { CreateRepairTicketModal } from '@/components/repairs/CreateRepairTicketModal';
import { RepairTicketDetailModal } from '@/components/repairs/RepairTicketDetailModal';
import { toast } from 'sonner';


interface JobDetailModalProps {
  isOpen: boolean;
  job: Job | null;
  onClose: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ isOpen, job, onClose }) => {
  const {
    getCustomer,
    users,
    getJobWorkLogs,
    getJobMaterials,
    getJobHold,
    getJobInvoice,
    getJobOtp,
    getJobSerials,
    getJobProductUsages,
    products,
    currentUser,
    deleteJob,
    canResumeHold,
    resolveHoldEvent,
    quotations,
    deliveryChallans,
    convertQuotationToDeliveryChallan,
    visibleRepairTickets,
  } = useStecSecure();

  const [isSiteLocationModalOpen, setIsSiteLocationModalOpen] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  // Phase 15: Document chain modals
  const [inspectingChallan, setInspectingChallan] = React.useState<DeliveryChallan | null>(null);
  const [isChallanModalOpen, setIsChallanModalOpen] = React.useState(false);
  const [inspectingQuotation, setInspectingQuotation] = React.useState<Quotation | null>(null);
  const [editingQuotation, setEditingQuotation] = React.useState<Quotation | null>(null);
  const [isQuotationBuilderOpen, setIsQuotationBuilderOpen] = React.useState(false);
  const [inspectingInvoice, setInspectingInvoice] = React.useState<Invoice | null>(null);

  // Phase 17: Repair & RMA Ticket modals
  const [isCreateRepairModalOpen, setIsCreateRepairModalOpen] = React.useState(false);
  const [inspectingRepairTicket, setInspectingRepairTicket] = React.useState<RepairTicket | null>(null);

  if (!isOpen || !job) return null;


  const customer = getCustomer(job.customerNumber);
  const team = users.filter((u) => job.assignedTeam.includes(u.id));
  const workLogs = getJobWorkLogs(job.id);
  const materials = getJobMaterials(job.id);
  const hold = getJobHold(job.id);
  const invoice = getJobInvoice(job.id);
  const otp = getJobOtp(job.id);
  const serials = getJobSerials(job.id);

  const linkedSerialUnit = serials.find(
    (s) => s.serialNumber === job.serialNo || s.id === job.serialNo
  );

  const linkedRepairTickets = visibleRepairTickets.filter(
    (t) =>
      t.sourceJobId === job.id ||
      (job.serialNo &&
        (t.serialUnitId === linkedSerialUnit?.id ||
          t.customUnitDescription?.includes(job.serialNo)))
  );

  const statusVariant =
    job.status === 'CLOSED'
      ? 'success'
      : job.status === 'COMPLETED'
      ? 'default'
      : job.status === 'IN_PROGRESS'
      ? 'default'
      : job.status === 'ON_HOLD'
      ? 'danger'
      : job.status === 'AWAITING_OTP'
      ? 'warning'
      : 'secondary';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="3xl"
        showCloseButton={false}
        className="max-h-[90vh]"
        bodyClassName="p-0 flex flex-col overflow-hidden"
      >
        {/* Pinned Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 font-mono">{job.jobNumber}</h2>
                <Badge variant={statusVariant} className="text-[10px]">
                  {job.status}
                </Badge>
                <span className="text-[10px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-slate-500" />
                  {formatCreatedBy(job.createdByUserId, users)}
                </span>
                {job.enquiryId && (
                  <Badge variant="outline" className="text-[10px] text-blue-700 border-blue-300 bg-blue-50 font-mono">
                    Enquiry: {job.enquiryId}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {job.type} &bull; {job.category} &bull; Created {formatDate(job.createdAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain">
          {/* Phase 15: PART E — FULL DOCUMENT CHAIN PAPER TRAIL */}
          {(() => {
            const linkedQuotation = quotations.find(
              (q) => q.id === job.quotationId || q.quotationNo === job.quotationId
            );
            const jobChallans = deliveryChallans.filter(
              (dc) =>
                dc.jobId === job.id ||
                (job.quotationId &&
                  (dc.quotationId === job.quotationId || dc.quotationId === linkedQuotation?.id)) ||
                (dc.customerNumber === job.customerNumber && dc.jobId === job.id)
            );

            return (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-orange-50/70 via-slate-50 to-emerald-50/70 border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-slate-600">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-orange-600" />
                    Commercial Document Chain (Quotation &rarr; DC &rarr; Invoice)
                  </span>
                  <span className="text-[10px] font-normal text-slate-500">
                    Click any stage to view or edit
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  {/* Stage 1: Quotation */}
                  <div
                    className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      linkedQuotation
                        ? 'bg-white border-orange-200 hover:border-orange-400 hover:shadow-xs'
                        : 'bg-slate-100/60 border-dashed border-slate-300 text-slate-400'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                        <span>1. Quotation</span>
                        {linkedQuotation && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-xs truncate">
                        {linkedQuotation ? linkedQuotation.quotationNo : 'None linked'}
                      </div>
                      {linkedQuotation && (
                        <div className="text-[10px] text-orange-600 font-semibold font-mono">
                          {formatINR(linkedQuotation.grandTotal)}
                        </div>
                      )}
                    </div>
                    {linkedQuotation ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingQuotation(linkedQuotation);
                            setIsQuotationBuilderOpen(true);
                          }}
                          className="p-1 rounded text-orange-600 hover:bg-orange-50 cursor-pointer"
                          title="Edit Quotation in-place (no duplicates)"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingQuotation(linkedQuotation);
                          }}
                          className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
                          title="Preview Quotation PDF"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuotation(null);
                          setIsQuotationBuilderOpen(true);
                        }}
                        className="text-[10px] text-orange-600 hover:underline font-semibold cursor-pointer"
                      >
                        + Create
                      </button>
                    )}
                  </div>

                  {/* Stage 2: Delivery Challan */}
                  <div
                    onClick={() => {
                      if (jobChallans.length > 0) {
                        setInspectingChallan(jobChallans[0]);
                        setIsChallanModalOpen(true);
                      } else if (linkedQuotation) {
                        try {
                          const newDc = convertQuotationToDeliveryChallan(linkedQuotation.id, job.id);
                          toast.success(
                            `Delivery Challan ${newDc.challanNo} created from Quotation ${linkedQuotation.quotationNo}`
                          );
                          setInspectingChallan(newDc);
                          setIsChallanModalOpen(true);
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to convert quotation to delivery challan');
                        }
                      } else {
                        setInspectingChallan(null);
                        setIsChallanModalOpen(true);
                      }
                    }}
                    className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      jobChallans.length > 0
                        ? 'bg-white border-blue-200 hover:border-blue-400 hover:shadow-xs cursor-pointer'
                        : 'bg-slate-100/60 border-dashed border-slate-300 hover:bg-slate-100 cursor-pointer text-slate-500'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                        <span>2. Delivery Challan</span>
                        {jobChallans.length > 0 && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-xs truncate">
                        {jobChallans.length > 0
                          ? jobChallans[0].challanNo + (jobChallans.length > 1 ? ` (+${jobChallans.length - 1})` : '')
                          : linkedQuotation
                          ? '+ Convert Quote to DC'
                          : '+ Create DC'}
                      </div>
                      {jobChallans.length > 0 && (
                        <div className="text-[10px] text-blue-600 font-medium">
                          {jobChallans[0].lineItems.length} goods items
                        </div>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                  </div>

                  {/* Stage 3: Tax Invoice */}
                  <div
                    onClick={() => invoice && setInspectingInvoice(invoice)}
                    className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      invoice
                        ? 'bg-white border-emerald-200 hover:border-emerald-400 hover:shadow-xs cursor-pointer'
                        : 'bg-slate-100/60 border-dashed border-slate-300 text-slate-400'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                        <span>3. Tax Invoice</span>
                        {invoice && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                      </div>
                      <div className="font-mono font-bold text-slate-900 text-xs truncate">
                        {invoice ? invoice.invoiceNo : 'Pending generation'}
                      </div>
                      {invoice && (
                        <div className="text-[10px] text-emerald-700 font-semibold font-mono">
                          {formatINR(invoice.grandTotal)} ({invoice.amountPaid >= invoice.grandTotal ? 'Paid' : 'Due'})
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Customer & Product Information */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center justify-between">
                <span>Customer / Site</span>
                {customer?.siteLocationMapLink ? (
                  <a
                    href={customer.siteLocationMapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <MapPin className="w-3 h-3 text-blue-500" />
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSiteLocationModalOpen(true)}
                    className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-orange-600 cursor-pointer font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add site location</span>
                  </button>
                )}
              </div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</div>
              <div className="text-slate-600 text-[11px] mt-0.5">{customer?.address}</div>
              <div className="text-slate-500 text-[11px] mt-0.5 flex items-center justify-between">
                <span>Phone: {customer?.phone}</span>
                {customer?.siteLocationMapLink && (
                  <a
                    href={customer.siteLocationMapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-semibold flex items-center gap-0.5"
                  >
                    <span>View Coordinates</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>


            <div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Hardware / Model</div>
                {/* Task 2: Action to send unit for repair */}
                {job.status !== 'CLOSED' && (
                  <button
                    type="button"
                    onClick={() => setIsCreateRepairModalOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer"
                  >
                    <Wrench className="w-3 h-3" />
                    <span>Send Unit for Repair</span>
                  </button>
                )}
              </div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{job.productModel}</div>
              {job.serialNo && (
                <div className="font-mono text-orange-600 font-bold text-[11px] mt-0.5">S/N: {job.serialNo}</div>
              )}
              <div className="text-slate-500 text-[11px] mt-0.5 font-medium">
                Contract Status: <strong className="text-slate-800">{job.customerStatus}</strong>
              </div>
            </div>
          </div>

          {/* Phase 17: Linked Repair & RMA Tickets */}
          {linkedRepairTickets.length > 0 && (
            <div className="p-3.5 rounded-xl bg-orange-50/60 border border-orange-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-orange-950">
                  <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
                  Linked Repair &amp; RMA Tickets ({linkedRepairTickets.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreateRepairModalOpen(true)}
                  className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  + Raise Another RMA
                </button>
              </div>

              <div className="space-y-1.5">
                {linkedRepairTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => setInspectingRepairTicket(ticket)}
                    className="p-2.5 rounded-lg bg-white border border-slate-200 hover:border-orange-300 flex items-center justify-between text-xs cursor-pointer shadow-2xs transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-orange-600">{ticket.ticketNumber}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {ticket.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-slate-600 truncate max-w-[200px] text-[11px]">
                        {ticket.faultDescription}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-orange-600 flex items-center gap-1">
                      View RMA <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scope / Problem & Resolution */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div>
              <span className="font-bold text-slate-700">Problem Reported / Scope:</span>
              <p className="text-slate-800 mt-0.5 font-medium">{job.problemReported}</p>
            </div>
            {job.actionTaken && (
              <div className="pt-2 border-t border-slate-200">
                <span className="font-bold text-emerald-700">Action Taken / Resolution:</span>
                <p className="text-slate-800 mt-0.5 font-medium">{job.actionTaken}</p>
              </div>
            )}
          </div>

          {/* Assigned Field Crew */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="font-bold text-slate-700">Assigned Team:</span>
            <div className="flex flex-wrap gap-1.5">
              {team.map((t) => (
                <Badge key={t.id} variant="secondary" className="text-[11px]">
                  {t.name} ({t.role})
                </Badge>
              ))}
            </div>
          </div>

          {/* Hold Alert if present */}
          {hold && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Hold Event: {hold.reason}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Raised at {formatDateTime(hold.raisedAt)}
                  </p>
                </div>
                {canResumeHold(job, hold) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="success"
                    className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 shadow-2xs cursor-pointer flex items-center gap-1"
                    onClick={() => {
                      resolveHoldEvent(hold.id);
                      toast.success(`Hold resolved. Job ${job.jobNumber} resumed to In Progress.`);
                      onClose();
                    }}
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Resume Work
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Work Log Timeline */}
          {workLogs.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                Work Log Entries ({workLogs.length})
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {workLogs.map((wl) => (
                  <div key={wl.id} className="p-2 rounded bg-white border border-slate-200 text-[11px] shadow-2xs">
                    <div className="text-[10px] text-orange-600 font-mono font-semibold">
                      {formatDateTime(wl.inTime)}
                    </div>
                    <div className="text-slate-800 mt-0.5 font-medium">
                      {wl.notesLog && wl.notesLog.length > 0 ? wl.notesLog.join(' • ') : 'Session logged'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 8: Products & Hardware Used */}
          {(() => {
            const jobProducts = getJobProductUsages(job.id);
            if (jobProducts.length === 0) return null;

            return (
              <div className="p-3.5 rounded-xl bg-orange-50/40 border border-orange-200 space-y-2.5">
                <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-orange-600" />
                  Products & Hardware Used ({jobProducts.length})
                </div>
                <div className="space-y-2">
                  {jobProducts.map((usage) => {
                    const prod = products.find((p) => p.id === usage.productId);
                    const addedUser = users.find((u) => u.id === usage.addedByUserId);
                    const serialList =
                      usage.serialUnitIds?.map(
                        (sid) =>
                          serials.find((s) => s.id === sid || s.serialNumber === sid)?.serialNumber ||
                          sid
                      ) || [];

                    return (
                      <div
                        key={usage.id}
                        className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 shadow-2xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{prod?.name || 'Equipment'}</span>
                            <span className="font-mono font-bold text-orange-600">
                              Qty: {usage.quantity} {prod?.unit || 'Nos'}
                            </span>
                          </div>
                          {serialList.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[10px] text-slate-500">Serials:</span>
                              {serialList.map((sn, idx) => (
                                <span
                                  key={idx}
                                  className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 border border-slate-300 text-slate-800 font-semibold"
                                >
                                  {sn}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 sm:text-right shrink-0">
                          <div>Added by {addedUser?.name || 'Lead'}</div>
                          <div className="font-mono">{formatDateTime(usage.addedAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Materials Ledger */}
          {materials.length > 0 && (

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-orange-600" />
                Materials Consumed ({materials.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {materials.map((m) => (
                  <div
                    key={m.id}
                    className="p-2 rounded bg-white border border-slate-200 text-[11px] flex justify-between shadow-2xs"
                  >
                    <span className="text-slate-800 font-medium">{m.materialName}</span>
                    <span className="text-slate-500">
                      Del: {m.deliveredQty} &bull; Ret: {m.returnedQty} &bull;{' '}
                      <strong className="text-emerald-700">Net: {m.deliveredQty - m.returnedQty}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 15: PART A — DELIVERY CHALLANS SECTION */}
          {(() => {
            const linkedQuotation = quotations.find(
              (q) => q.id === job.quotationId || q.quotationNo === job.quotationId
            );
            const jobChallans = deliveryChallans.filter(
              (dc) =>
                dc.jobId === job.id ||
                (job.quotationId &&
                  (dc.quotationId === job.quotationId || dc.quotationId === linkedQuotation?.id)) ||
                (dc.customerNumber === job.customerNumber && dc.jobId === job.id)
            );

            return (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-orange-600" />
                    <span>Delivery Challans & Dispatches ({jobChallans.length})</span>
                    <span className="text-[10px] font-normal text-slate-500 hidden sm:inline">
                      &bull; Material transfer without pricing
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setInspectingChallan(null);
                      setIsChallanModalOpen(true);
                    }}
                    className="text-xs h-7 px-2.5 rounded-lg border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    + Create Delivery Challan
                  </Button>
                </div>

                {jobChallans.length === 0 ? (
                  <div className="p-4 rounded-lg bg-white border border-dashed border-slate-300 text-center space-y-2">
                    <p className="text-xs text-slate-500">
                      No delivery challans issued for this job yet.
                    </p>
                    {linkedQuotation && (
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          try {
                            const newDc = convertQuotationToDeliveryChallan(linkedQuotation.id, job.id);
                            toast.success(
                              `Delivery Challan ${newDc.challanNo} created from Quotation ${linkedQuotation.quotationNo}`
                            );
                            setInspectingChallan(newDc);
                            setIsChallanModalOpen(true);
                          } catch (err: any) {
                            toast.error(err.message || 'Failed to convert quotation');
                          }
                        }}
                        className="text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow-2xs"
                      >
                        <Truck className="w-3.5 h-3.5 mr-1" />
                        Convert Quotation {linkedQuotation.quotationNo} to Delivery Challan
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobChallans.map((dc) => (
                      <div
                        key={dc.id}
                        className="p-3 rounded-lg bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs hover:border-slate-300 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-orange-600 text-xs">{dc.challanNo}</span>
                            <span className="text-[10px] text-slate-500 font-medium">&bull; {formatDate(dc.date)}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {dc.lineItems.length} Goods Item(s)
                            </Badge>
                            {dc.quotationId && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                From Quote: {dc.quotationId}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1">
                            Transport: <strong className="text-slate-800">{dc.transportedBy || 'Field Transit'}</strong>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-md">
                            Items: {dc.lineItems.map((li) => `${li.itemDescription} (${li.qty} Nos)`).join(', ')}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setInspectingChallan(dc);
                              setIsChallanModalOpen(true);
                            }}
                            className="text-[11px] h-7 px-2.5 rounded-lg border-slate-300 hover:bg-slate-50"
                          >
                            View / Print
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setInspectingChallan(dc);
                              setIsChallanModalOpen(true);
                            }}
                            className="text-[11px] h-7 px-2.5 rounded-lg"
                          >
                            <Edit className="w-3 h-3 mr-1" /> Edit
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Linked Invoice / OTP Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {invoice && (
              <div
                onClick={() => setInspectingInvoice(invoice)}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 hover:border-emerald-300 hover:bg-emerald-50/30 cursor-pointer transition-colors"
                title="Click to view full Tax Invoice preview"
              >
                <div className="font-bold text-slate-900 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <ReceiptText className="w-3.5 h-3.5 text-emerald-600" />
                    Tax Invoice {invoice.invoiceNo}
                  </span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  Total: <strong className="text-slate-900">{formatINR(invoice.grandTotal)}</strong> &bull; Paid:{' '}
                  <span className="text-emerald-700 font-bold">{formatINR(invoice.amountPaid)}</span>
                </div>
              </div>
            )}

            {otp && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  Customer Verification OTP
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  Status: <strong className="text-slate-900">{otp.status}</strong> &bull; Verified at:{' '}
                  {otp.verifiedAt ? formatDateTime(otp.verifiedAt) : 'Pending'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pinned Action Buttons Footer */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <div>
            {currentUser?.role === 'CEO' && (
              <Button
                type="button"
                variant="outline"
                size="md"
                className="text-xs text-rose-600 hover:bg-rose-50 border-rose-300 rounded-xl font-semibold flex items-center gap-1 cursor-pointer"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Job
              </Button>
            )}
          </div>

          <Button type="button" variant="primary" size="md" onClick={onClose} className="rounded-xl">
            Close
          </Button>
        </div>
      </Modal>

      {showDeleteConfirm && (
        <Modal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          maxWidth="md"
          title="Delete Job Permanently"
          subtitle={`#${job.jobNumber}`}
          icon={<Trash2 className="w-5 h-5 text-rose-600" />}
        >
          <div className="space-y-3.5 text-xs">
            <p className="text-slate-700 leading-relaxed">
              This will permanently delete job <strong className="font-mono text-slate-900">#{job.jobNumber}</strong> ({job.category} &bull; {job.productModel}) from active dispatch. This action cannot be undone.
            </p>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] leading-relaxed">
              <strong>Billing Integrity Note:</strong> Any linked customer invoices or commercial quotations will remain intact in accounting records.
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                className="rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                onClick={() => {
                  const num = job.jobNumber;
                  deleteJob(job.id);
                  toast.success(`Job ${num} permanently deleted.`);
                  setShowDeleteConfirm(false);
                  onClose();
                }}
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {customer && (
        <SiteLocationModal
          isOpen={isSiteLocationModalOpen}
          customer={customer}
          onClose={() => setIsSiteLocationModalOpen(false)}
        />
      )}

      {/* Phase 15: Delivery Challan Modal for Job */}
      <DeliveryChallanModal
        isOpen={isChallanModalOpen}
        onClose={() => {
          setIsChallanModalOpen(false);
          setInspectingChallan(null);
        }}
        initialChallan={inspectingChallan}
        jobId={job.id}
        defaultCustomerId={job.customerNumber}
        quotationId={job.quotationId}
        onConvertedToInvoice={(newInv) => {
          setInspectingInvoice(newInv);
        }}
      />

      {/* Phase 15.5: Quotation Builder Modal (In-place edit or create) */}
      {isQuotationBuilderOpen && (
        <QuotationBuilderModal
          isOpen={isQuotationBuilderOpen}
          initialCustomerId={job.customerNumber}
          initialEnquiryId={job.enquiryId}
          quotationToEdit={editingQuotation}
          onClose={() => {
            setIsQuotationBuilderOpen(false);
            setEditingQuotation(null);
          }}
          onQuotationSaved={(savedQuot) => {
            setIsQuotationBuilderOpen(false);
            setEditingQuotation(null);
            setInspectingQuotation(savedQuot);
          }}
        />
      )}

      {/* Phase 15: Quotation Preview Modal */}
      {inspectingQuotation && (
        <QuotationPreviewModal
          isOpen={Boolean(inspectingQuotation)}
          quotation={inspectingQuotation}
          onClose={() => setInspectingQuotation(null)}
          onEdit={(q) => {
            setEditingQuotation(q);
            setIsQuotationBuilderOpen(true);
          }}
        />
      )}

      {/* Phase 15: Invoice Preview Modal */}
      {inspectingInvoice && (
        <InvoicePreviewModal
          isOpen={Boolean(inspectingInvoice)}
          invoice={inspectingInvoice}
          onClose={() => setInspectingInvoice(null)}
        />
      )}

      {/* Phase 17: Create Repair Ticket Modal from Job */}
      <CreateRepairTicketModal
        isOpen={isCreateRepairModalOpen}
        onClose={() => setIsCreateRepairModalOpen(false)}
        initialJobId={job.id}
        initialCustomerId={customer?.id || job.customerNumber}
        initialSerialUnitId={linkedSerialUnit?.id}
        onSuccess={(ticketId) => {
          setIsCreateRepairModalOpen(false);
          const t = visibleRepairTickets.find((item) => item.id === ticketId);
          if (t) setInspectingRepairTicket(t);
        }}
      />

      {/* Phase 17: Repair Ticket Detail Modal */}
      <RepairTicketDetailModal
        ticket={inspectingRepairTicket}
        isOpen={Boolean(inspectingRepairTicket)}
        onClose={() => setInspectingRepairTicket(null)}
      />
    </>
  );
};

