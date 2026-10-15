import { quotationStatusMeta } from '@/lib/quotation-status';
import React, { useState, useEffect } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Quotation } from '@/lib/stecsecure-types';
import {
  X,
  Printer,
  ReceiptText,
  Share2,
  CheckCircle2,
  Building2,
  Calendar,
  FileSpreadsheet,
  Truck,
  Edit,
  Download,
} from 'lucide-react';
import { DeliveryChallan } from '@/lib/stecsecure-types';
import { DeliveryChallanModal } from '@/components/jobs/DeliveryChallanModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatINR, formatDate } from '@/lib/utils';
import { exportElementToPdfWithToast } from '@/lib/pdf-generator';
import { amountInWords, customerStateCode, hsnSummary, isInterState, placeOfSupplyLabel, stateName } from '@/lib/gst';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';

interface QuotationPreviewModalProps {
  isOpen: boolean;
  quotation: Quotation | null;
  onClose: () => void;
  onEdit?: (quotation: Quotation) => void;
  onConvertedToInvoice?: () => void;
}

export const QuotationPreviewModal: React.FC<QuotationPreviewModalProps> = ({
  isOpen,
  quotation,
  onClose,
  onEdit,
}) => {
  const {
    getCustomer,
    updateQuotation,
    addEnquiryFollowUpNote,
    convertQuotationToDeliveryChallan,
    jobs,
  } = useStecSecure();
  const [whatsAppSentAt, setWhatsAppSentAt] = useState<string | null>(null);
  const [generatedChallan, setGeneratedChallan] = useState<DeliveryChallan | null>(null);
  const [isChallanModalOpen, setIsChallanModalOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (quotation?.whatsappSharedAt) {
      setWhatsAppSentAt(quotation.whatsappSharedAt);
    } else {
      setWhatsAppSentAt(null);
    }
  }, [quotation]);

  if (!isOpen || !quotation) return null;

  const customer = getCustomer(quotation.customerNumber);

  // Step 3: place of supply decides CGST+SGST (Tamil Nadu) or IGST (other states)
  const placeOfSupply = quotation.placeOfSupply ?? customerStateCode(customer);
  const interState = isInterState(placeOfSupply) || Boolean(quotation.totalIgst);
  const hsnRows = hsnSummary(quotation.lineItems);

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = async () => {
    const now = new Date();
    const timestamp =
      now.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ', ' +
      now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

    // Open WhatsApp right away (still inside the click) so popup blockers allow it
    const phone = customer?.phone.replace(/\D/g, '') || '';
    const msg = `Dear ${customer?.name || 'Customer'},\nHere is your official S Tec Secure Quotation ${quotation.quotationNo} for ₹${quotation.grandTotal.toLocaleString('en-IN')}.\nValid for ${quotation.validityDays} days.\nThank you.`;
    const encoded = encodeURIComponent(msg);
    if (phone) {
      window.open(`https://wa.me/91${phone}?text=${encoded}`, '_blank');
    }

    try {
      // Persist to quotation in ERP state
      await updateQuotation(quotation.id, {
        whatsappSharedAt: timestamp,
        status: quotation.status === 'DRAFT' ? 'SENT' : quotation.status,
      });
      setWhatsAppSentAt(timestamp);

      // If linked to enquiry, also log follow-up note
      if (quotation.enquiryId) {
        await addEnquiryFollowUpNote(
          quotation.enquiryId,
          `Quotation ${quotation.quotationNo} (₹${quotation.grandTotal.toLocaleString('en-IN')}) shared with customer via WhatsApp on ${timestamp}`
        );
      }

      toast.success(`Sent via WhatsApp ✓ (${timestamp})`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleConvertToChallan = async () => {
    if (converting) return;
    setConverting(true);
    try {
      const linkedJob = jobs.find(
        (j) =>
          j.quotationId === quotation.id ||
          j.quotationId === quotation.quotationNo
      );
      const newDc = await convertQuotationToDeliveryChallan(
        quotation.id,
        linkedJob?.id
      );
      toast.success(
        `Delivery Challan ${newDc.challanNo} created from Quotation ${quotation.quotationNo} (${newDc.lineItems.length} physical items, labor charges excluded).`
      );
      setGeneratedChallan(newDc);
      setIsChallanModalOpen(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConverting(false);
    }
  };

  return (
    <>
      <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      showCloseButton={false}
      className="max-h-[94vh] sm:max-h-[92vh] w-[94vw] max-w-5xl"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      {/* Top Control Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <Badge variant="orange" className="text-xs font-mono font-bold">
            {quotation.quotationNo}
          </Badge>
          <Badge
            variant={quotationStatusMeta(quotation.status).variant}
            className="text-xs"
          >
            {quotationStatusMeta(quotation.status).label}
          </Badge>
          {whatsAppSentAt && (
            <Badge variant="success" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Sent via WhatsApp ✓
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onEdit(quotation);
                onClose();
              }}
              className="h-8 text-xs rounded-lg text-orange-700 border-orange-300 hover:bg-orange-50 font-semibold cursor-pointer shadow-2xs"
            >
              <Edit className="w-3.5 h-3.5 mr-1 text-orange-600" />
              Edit Quotation
            </Button>
          )}
          <Button
            size="sm"
            variant={whatsAppSentAt ? 'outline' : 'secondary'}
            onClick={handleShareWhatsApp}
            className={`h-8 text-xs rounded-lg ${
              whatsAppSentAt
                ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                : 'text-slate-800'
            }`}
          >
            <Share2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            {whatsAppSentAt ? 'Resend via WhatsApp' : 'Share via WhatsApp'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleConvertToChallan}
            disabled={converting}
            className="h-8 text-xs rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Truck className="w-3.5 h-3.5" />
            Convert to Delivery Challan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const custName = customer?.name || 'Customer';
              exportElementToPdfWithToast('printable-quotation-doc', {
                filename: `Quotation-${quotation.quotationNo}-${custName}`,
              });
            }}
            className="h-8 text-xs rounded-lg text-slate-800 hover:bg-slate-50 font-semibold cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 mr-1 text-slate-600" /> Download PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs rounded-lg">
            <Printer className="w-3.5 h-3.5 mr-1" /> Print
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 overscroll-contain">
        {/* Visible Outreach Record Banner */}
        {whatsAppSentAt && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Quotation Outreach Logged:</strong> Shared with customer ({customer?.name || 'Customer'} &bull; {customer?.phone}) via WhatsApp on <strong>{whatsAppSentAt}</strong>.
              </span>
            </div>
            <Badge variant="success" className="text-[10px] bg-emerald-100 text-emerald-800 border-0">
              Shared Record
            </Badge>
          </div>
        )}

        {/* Real PDF Replica Paper Document */}
        <div id="printable-quotation-doc" className="p-6 rounded-xl bg-white text-slate-900 font-sans shadow-xs border border-slate-200 print:shadow-none print:p-0">
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
            <div className="max-w-md">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase font-display">
                S Tec Secure <span className="text-orange-600">(Surveillance & Automation's)</span>
              </h1>
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-0.5">
                CCTV | HOME AUTOMATIONS | GATE AUTOMATION | BIOMETRIC & ACCESS CONTROL | INTERCOM | BURGLAR ALARM SYSTEM
              </p>
              <p className="text-[11px] text-slate-700 mt-1">
                14/2 Thundu Kadu Street, Veerappan Chathiram, Erode, Tamil Nadu, India - 638004
              </p>
              <p className="text-[11px] text-slate-700">
                Email: stecsecure@gmail.com &bull; Tel: 81485 62605 / 96002 52605
              </p>
              <p className="text-[11px] font-mono text-orange-600 font-bold mt-0.5">
                GSTIN: 33KDUPS8091G1ZL &bull; PAN: KDUPS8091G
              </p>
            </div>

            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-orange-500 text-white font-bold text-sm tracking-wider uppercase rounded shadow-2xs">
                QUOTATION
              </div>
              <div className="mt-2 text-xs text-slate-700">
                <div>
                  <strong>Quotation No: </strong>
                  <span className="font-mono font-bold text-orange-600">{quotation.quotationNo}</span>
                </div>
                <div>
                  <strong>Date: </strong>
                  <span>{formatDate(quotation.date)}</span>
                </div>
                <div>
                  <strong>Validity: </strong>
                  <span>{quotation.validityDays} Days</span>
                </div>
                <div>
                  <strong>Place of Supply: </strong>
                  <span>{placeOfSupplyLabel(placeOfSupply)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quotation For / Customer Section */}
          <div className="py-3 border-b border-slate-200 grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                QUOTATION FOR:
              </div>
              <div className="font-bold text-sm text-slate-900 mt-0.5">{customer?.name}</div>
              <div className="text-slate-700 mt-0.5">{customer?.address}</div>
              <div className="text-slate-700 mt-0.5">Phone: {customer?.phone}</div>
              <div className="font-mono text-[11px] text-orange-600 font-semibold mt-0.5">
                GSTIN: {customer?.gstin || 'Unregistered'}
              </div>
              <div className="text-slate-700 mt-0.5">
                State: {stateName(placeOfSupply)} ({placeOfSupply})
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px] space-y-1">
              <div className="font-bold text-slate-800">Proposal Summary:</div>
              <div className="text-slate-600">
                Supply, delivery, testing & commissioning of electronic security hardware and system setup.
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="py-3">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-y border-slate-200">
                  <th className="p-2 text-center w-8">#</th>
                  <th className="p-2">Description of Goods / Services</th>
                  <th className="p-2 w-20">HSN/SAC</th>
                  <th className="p-2 text-center w-12">Qty</th>
                  <th className="p-2 text-right w-20">Rate (₹)</th>
                  <th className="p-2 text-right w-20">Amount (₹)</th>
                  <th className="p-2 text-right w-16">GST</th>
                  <th className="p-2 text-right w-24">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {quotation.lineItems.map((item, idx) => (
                  <tr key={idx} className="align-top hover:bg-slate-50/50">
                    <td className="p-2 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="p-2">
                      <div className="font-bold text-slate-900">{item.itemName}</div>
                      {item.description && (
                        <div className="text-[11px] text-slate-600 mt-0.5">{item.description}</div>
                      )}
                    </td>
                    <td className="p-2 font-mono text-slate-700">{item.hsnSac || '-'}</td>
                    <td className="p-2 text-center font-medium">{item.qty}</td>
                    <td className="p-2 text-right font-medium">{formatINR(item.rate)}</td>
                    <td className="p-2 text-right font-medium">{formatINR(item.amount)}</td>
                    <td className="p-2 text-right text-slate-600">{item.gstRate}%</td>
                    <td className="p-2 text-right font-bold text-slate-900">{formatINR(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals & Commercial Breakdown */}
          <div className="pt-2 border-t border-slate-200 flex justify-end">
            <div className="w-64 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-700">
                <span>Taxable Value:</span>
                <span className="font-semibold text-slate-900">{formatINR(quotation.totalAmount)}</span>
              </div>
              {interState ? (
                <div className="flex justify-between text-slate-700">
                  <span>IGST:</span>
                  <span>{formatINR(quotation.totalIgst || 0)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-slate-700">
                    <span>CGST:</span>
                    <span>{formatINR(quotation.totalCgst)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>SGST:</span>
                    <span>{formatINR(quotation.totalSgst)}</span>
                  </div>
                </>
              )}
              {quotation.roundOff !== 0 && (
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Round Off:</span>
                  <span>{formatINR(quotation.roundOff)}</span>
                </div>
              )}
              <div className="pt-2 border-t-2 border-slate-900 flex justify-between text-sm font-black text-slate-900">
                <span>Grand Total (INR):</span>
                <span className="text-orange-600">{formatINR(quotation.grandTotal)}</span>
              </div>
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-700">
            <span className="font-semibold">Amount in words: </span>
            {amountInWords(quotation.grandTotal)}
          </div>

          {/* HSN-wise tax summary table */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <div className="text-[11px] font-bold text-slate-800 uppercase mb-1">
              HSN / SAC Tax Breakdown
            </div>
            <table className="w-full text-left text-[11px] border border-slate-200">
              <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-1.5">HSN/SAC</th>
                  <th className="p-1.5 text-right">Taxable Value (₹)</th>
                  <th className="p-1.5 text-right">Rate</th>
                  {interState ? (
                    <th className="p-1.5 text-right">IGST</th>
                  ) : (
                    <>
                      <th className="p-1.5 text-right">CGST</th>
                      <th className="p-1.5 text-right">SGST</th>
                    </>
                  )}
                  <th className="p-1.5 text-right">Total Tax (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {hsnRows.map((row) => (
                  <tr key={`${row.hsnSac}@${row.gstRate}`}>
                    <td className="p-1.5 font-mono font-semibold text-orange-600">{row.hsnSac}</td>
                    <td className="p-1.5 text-right">{formatINR(row.taxable)}</td>
                    <td className="p-1.5 text-right">{row.gstRate}%</td>
                    {interState ? (
                      <td className="p-1.5 text-right">{formatINR(row.igst)}</td>
                    ) : (
                      <>
                        <td className="p-1.5 text-right">{formatINR(row.cgst)}</td>
                        <td className="p-1.5 text-right">{formatINR(row.sgst)}</td>
                      </>
                    )}
                    <td className="p-1.5 text-right font-semibold text-emerald-700">
                      {formatINR(row.cgst + row.sgst + row.igst)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Terms & Conditions Block */}
          <div className="mt-4 pt-3 border-t border-slate-200 text-xs">
            <div className="font-bold text-slate-900 mb-1">Terms & Conditions:</div>
            <pre className="font-sans text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">
              {quotation.termsAndConditions}
            </pre>
          </div>

          {/* Bank Details & Sign-off */}
          <div className="mt-4 pt-3 border-t-2 border-slate-900 grid grid-cols-2 gap-4 text-xs items-end">
            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-[11px]">
              <div className="font-bold text-slate-900">Bank Details for Electronic Remittance:</div>
              <div className="mt-1 text-slate-700">
                A/C Name: <strong>S TEC SECURE</strong> &bull; Bank: <strong>{quotation.bankDetails.bankName || 'CANARA'}</strong>
              </div>
              <div className="text-slate-700">
                Account No: <strong className="font-mono">{quotation.bankDetails.accountNumber}</strong>
              </div>
              <div className="text-slate-700">
                IFSC Code: <strong className="font-mono">{quotation.bankDetails.ifscCode}</strong> &bull; A/C Type: <strong>Current</strong>
              </div>
              <div className="text-slate-700">Branch: <strong>Veerappan Chathiram, Erode</strong></div>
              <div className="text-orange-600 font-mono text-[10px] font-semibold">
                UPI Remittance Available
              </div>
            </div>

            <div className="text-right space-y-8 pr-2">
              <div className="text-slate-900 font-bold">For S TEC SECURE</div>
              <div className="text-slate-500 text-[11px] border-t border-slate-300 pt-1 inline-block">
                Authorized Signatory / Sales Engineer
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>

    {isChallanModalOpen && (
      <DeliveryChallanModal
        isOpen={isChallanModalOpen}
        onClose={() => {
          setIsChallanModalOpen(false);
          setGeneratedChallan(null);
        }}
        initialChallan={generatedChallan}
      />
    )}
  </>
  );
};
