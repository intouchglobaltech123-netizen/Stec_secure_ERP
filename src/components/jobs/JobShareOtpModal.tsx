import React, { useEffect, useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Job, Invoice, PaymentMode } from '@/lib/stecsecure-types';
import {
  X,
  Share2,
  CheckCircle2,
  Phone,
  MessageCircle,
  KeyRound,
  ShieldCheck,
  FileCheck2,
  Receipt,
  CreditCard,
  Camera,
  ArrowRight,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { formatINR, formatDateTime } from '@/lib/utils';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { DEMO_MODE } from '@/lib/demo-mode';

interface JobShareOtpModalProps {
  isOpen: boolean;
  job: Job | null;
  invoice?: Invoice | null;
  onClose: () => void;
  onJobClosed: () => void;
}

export const JobShareOtpModal: React.FC<JobShareOtpModalProps> = ({
  isOpen,
  job,
  invoice: propInvoice,
  onClose,
  onJobClosed,
}) => {
  const { customers, getJobMaterials, getJobInvoice, getJobOtp, verifyJobOtp, recordPaymentAfterOtp } =
    useStecSecure();

  const [whatsAppSentAt, setWhatsAppSentAt] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  // Post-OTP Payment Collection Stage
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [paymentOption, setPaymentOption] = useState<'FULL' | 'PARTIAL' | 'NOTHING'>('FULL');
  const [partialAmountReceived, setPartialAmountReceived] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('UPI');
  const [referenceNo, setReferenceNo] = useState<string>('');

  // Busy flags while the server verifies the OTP / records the payment
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // The modal stays mounted between jobs: start every opening from step 1, or a previous
  // job's "OTP verified" state would let this job skip customer sign-off
  useEffect(() => {
    if (!isOpen) return;
    setWhatsAppSentAt(null);
    setOtpInput('');
    setOtpError(null);
    setIsOtpVerified(false);
    setPaymentOption('FULL');
    setPartialAmountReceived(0);
    setPaymentMode('UPI');
    setReferenceNo('');
  }, [isOpen, job?.id]);

  if (!isOpen || !job) return null;

  const customer = customers.find((c) => c.id === job.customerNumber);
  const invoice = propInvoice || getJobInvoice(job.id);
  const materials = getJobMaterials(job.id);

  const grandTotal = invoice?.grandTotal || job.serviceAmount || 0;

  // Step 3: opens WhatsApp on this phone with the job summary and the customer's sign-off code.
  // (Until the WhatsApp Business API is connected, the code travels in this message.)
  const signOffCode = getJobOtp(job.id)?.otpCode;
  const handleSendWhatsApp = () => {
    const phone = (customer?.phone || '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) {
      toast.error("The customer's mobile number is missing — add it on the Customers page first.");
      return;
    }
    const lines = [
      `Dear ${customer?.name || 'Customer'},`,
      `S Tec Secure has completed job ${job.jobNumber} (${job.category}) at your site.`,
      invoice
        ? `Invoice ${invoice.invoiceNo}: ₹${invoice.grandTotal.toLocaleString('en-IN')}` +
          (invoice.amountPaid ? ` (paid ₹${invoice.amountPaid.toLocaleString('en-IN')}, balance ₹${invoice.balanceDue.toLocaleString('en-IN')})` : '')
        : '',
      signOffCode
        ? `Your sign-off code is ${signOffCode}. Please give this code to our technician only if you are satisfied with the work.`
        : '',
      'Thank you for choosing S Tec Secure.',
    ].filter(Boolean);
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
    setWhatsAppSentAt(
      new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    );
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput.trim()) {
      setOtpError('Please enter the 4-digit OTP');
      return;
    }

    setIsVerifying(true);
    try {
      const success = await verifyJobOtp(job.id, otpInput.trim());
      if (success) {
        toast.success(`OTP verified. Customer sign-off authenticated.`);
        setIsOtpVerified(true);
        setPartialAmountReceived(Math.round(grandTotal / 2));
      } else {
        setOtpError('Wrong code. Ask the customer for the 4-digit code in the WhatsApp message (or send it again).');
        toast.error('Wrong sign-off code.');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAutoFillOtp = () => {
    setOtpInput(signOffCode || '');
    setOtpError(null);
  };

  const handleConfirmPayment = async () => {
    setIsSavingPayment(true);
    try {
      if (invoice) {
        // Advances recorded earlier count towards the total
        const outstanding = Math.max(0, grandTotal - (invoice.amountPaid || 0));
        const amountReceived =
          paymentOption === 'FULL'
            ? outstanding
            : paymentOption === 'PARTIAL'
            ? Math.min(outstanding, Number(partialAmountReceived) || 0)
            : 0;

        const payment = await recordPaymentAfterOtp({
          invoiceId: invoice.id,
          customerNumber: job.customerNumber,
          statusOption: paymentOption,
          amountReceived,
          paymentMode,
          referenceNo: referenceNo.trim() || undefined,
        });

        if (amountReceived > 0 && !payment) {
          toast.error('Payment not recorded — the customer OTP has not been verified for this job.');
          return;
        }
        const balance = Math.max(0, outstanding - amountReceived);
        toast.success(
          `Payment recorded: ${formatINR(amountReceived)} collected (Balance: ${formatINR(balance)}). Job ${job.jobNumber} closed.`
        );
      } else {
        toast.success(`Job ${job.jobNumber} closed.`);
      }

      onJobClosed();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setIsSavingPayment(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      showCloseButton={false}
      className="max-h-[90vh]"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              {isOtpVerified ? 'Record payment' : 'Customer sign-off'}
            </h2>
            <p className="text-[13px] text-slate-500">
              {isOtpVerified
                ? `How much did the customer pay for ${invoice?.invoiceNo || 'this invoice'}?`
                : `${job.jobNumber} — send the summary on WhatsApp, then enter the customer's code`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[13px] overscroll-contain">
          {/* Job Summary Card with Embedded Photos */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <span className="font-mono text-sm font-bold text-orange-600">{job.jobNumber}</span>
                <span className="text-slate-600 text-[13px] ml-2">&bull; {job.productModel}</span>
              </div>
              <Badge variant={isOtpVerified ? 'success' : 'warning'}>
                {isOtpVerified ? 'OTP VERIFIED' : 'AWAITING OTP'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700">
              <div>
                <div className="text-[11px] text-slate-500 uppercase font-bold">Customer Details</div>
                <div className="font-bold text-slate-900 mt-0.5">{customer?.name}</div>
                <div className="text-slate-600 flex items-center gap-1 mt-0.5 font-medium">
                  <Phone className="w-3 h-3 text-emerald-600" /> {customer?.phone}
                </div>
              </div>

              {invoice && (
                <div className="sm:text-right">
                  <div className="text-[11px] text-slate-500 uppercase font-bold">Invoice Total</div>
                  <div className="font-mono font-bold text-emerald-700 text-base mt-0.5">
                    {formatINR(invoice.grandTotal)}
                  </div>
                  <div className="text-slate-500 text-xs">
                    {invoice.invoiceNo} &bull; {invoice.lineItems.length} line item(s)
                  </div>
                </div>
              )}
            </div>

            {/* Embedded Before and After Photos */}
            {(job.beforePhotoUrl || job.afterPhotoUrl) && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-orange-600" />
                  Photographic Evidence (Embedded in Invoice & Report)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {job.beforePhotoUrl && (
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase font-bold text-blue-700 flex items-center justify-between">
                        <span>Before Photo</span>
                        <span className="text-slate-500 font-normal">Pre-Service</span>
                      </div>
                      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                        <img
                          src={job.beforePhotoUrl}
                          alt="Before Work"
                          className="w-full h-32 object-cover object-center"
                        />
                      </div>
                    </div>
                  )}

                  {job.afterPhotoUrl && (
                    <div className="space-y-1">
                      <div className="text-[11px] uppercase font-bold text-emerald-700 flex items-center justify-between">
                        <span>After Photo</span>
                        <span className="text-slate-500 font-normal">Post-Completion</span>
                      </div>
                      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                        <img
                          src={job.afterPhotoUrl}
                          alt="After Work"
                          className="w-full h-32 object-cover object-center"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {!isOtpVerified ? (
            <>
              {/* STEP 1: WhatsApp the job summary and sign-off code to the customer */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-[13px]">Step 1: Share via WhatsApp</div>
                      <div className="text-xs text-slate-600">
                        Opens WhatsApp with the job summary, invoice amount and the customer's sign-off code
                      </div>
                    </div>
                  </div>
                  {whatsAppSentAt && (
                    <Badge variant="success" className="text-[11px]">
                      Opened at {whatsAppSentAt}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-[13px] transition-all shadow-sm shadow-emerald-600/25 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{whatsAppSentAt ? 'Resend via WhatsApp' : 'Send via WhatsApp'}</span>
                  </button>
                  <span className="text-xs text-slate-600 font-medium">
                    Recipient: <strong className="text-slate-900">{customer?.phone}</strong>
                  </span>
                </div>
              </div>

              {/* STEP 2: Customer reads back the sign-off code */}
              <form
                onSubmit={handleVerifyOtp}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-[13px]">Step 2: Customer Sign-off Code</div>
                      <div className="text-xs text-slate-500">
                        Ask the customer for the 4-digit code from the WhatsApp message
                      </div>
                    </div>
                  </div>

                  {DEMO_MODE && (
                    <button
                      type="button"
                      onClick={handleAutoFillOtp}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-mono hover:bg-slate-200 cursor-pointer transition-colors"
                    >
                      Demo: insert code <strong>{signOffCode}</strong>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                  <div className="relative w-full sm:w-48">
                    <Input
                      type="text"
                      maxLength={4}
                      placeholder="Enter 4 digits"
                      value={otpInput}
                      onChange={(e) => {
                        setOtpInput(e.target.value);
                        setOtpError(null);
                      }}
                      className="text-center font-mono text-base tracking-widest h-10 border-slate-300 focus:border-orange-500 bg-white"
                    />
                  </div>
                  <Button type="submit" variant="primary" size="md" disabled={isVerifying} className="w-full sm:w-auto">
                    <ShieldCheck className="w-4 h-4 mr-1.5" />
                    Verify code & continue
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>

                {otpError && (
                  <p className="text-xs text-rose-600 font-semibold">{otpError}</p>
                )}
              </form>
            </>
          ) : (
            /* STEP 3: Post-OTP Payment Recording */
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-sm space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Record Payment Status</div>
                    <div className="text-xs text-slate-500">
                      Invoice Total: <strong className="text-emerald-700 font-mono">{formatINR(grandTotal)}</strong>
                    </div>
                  </div>
                </div>
                <Badge variant="success">Code verified</Badge>
              </div>

              {/* Payment Settlement Status Options */}
              <div className="space-y-2">
                <label className="block text-[13px] font-bold text-slate-700">
                  Payment Collection Status *
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentOption('FULL')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      paymentOption === 'FULL'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-2xs ring-1 ring-emerald-300'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-[13px] text-slate-900">Full Amount Received</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Customer paid 100% ({formatINR(grandTotal)}) on site
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-700 text-sm font-mono">{formatINR(grandTotal)}</span>
                      <div className="text-[11px] text-slate-500">Balance: ₹0</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentOption('PARTIAL')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      paymentOption === 'PARTIAL'
                        ? 'bg-amber-50 border-amber-500 text-amber-950 shadow-2xs ring-1 ring-amber-300'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-[13px] text-slate-900">
                        Credit / Partial — Advance Already Taken, Balance Pending
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Advance collected; remaining balance due as credit
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="warning">Partial</Badge>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentOption('NOTHING')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      paymentOption === 'NOTHING'
                        ? 'bg-rose-50 border-rose-500 text-rose-950 shadow-2xs ring-1 ring-rose-300'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-[13px] text-slate-900">
                        Credit / Partial — Nothing Received Yet
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Total {formatINR(grandTotal)} outstanding on client credit account
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-rose-600 text-sm font-mono">{formatINR(grandTotal)}</span>
                      <div className="text-[11px] text-rose-600 font-semibold">Balance Pending</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* If Partial: prompt for advance received amount */}
              {paymentOption === 'PARTIAL' && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-amber-900 mb-1">
                        Advance Collected (₹) *
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max={grandTotal}
                        value={partialAmountReceived}
                        onChange={(e) => setPartialAmountReceived(Number(e.target.value))}
                        className="text-[13px] h-9 bg-white border-amber-300 focus:border-amber-500 font-mono"
                      />
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-slate-200 flex flex-col justify-center">
                      <div className="text-[11px] text-slate-500 uppercase font-bold">Remaining Balance Due</div>
                      <div className="text-base font-bold text-rose-600 font-mono">
                        {formatINR(Math.max(0, grandTotal - (Number(partialAmountReceived) || 0)))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Mode Selection (for FULL or PARTIAL) */}
              {paymentOption !== 'NOTHING' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1 text-xs">
                      Payment Mode *
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['UPI', 'CASH', 'NEFT', 'CHEQUE'] as PaymentMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPaymentMode(mode)}
                          className={`h-8 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            paymentMode === mode
                              ? 'bg-orange-500 border-orange-500 text-white shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1 text-xs">
                      UTR / Transaction Ref (Optional)
                    </label>
                    <Input
                      placeholder="e.g. UPI-9982481 or Cheque #"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      className="text-[13px] h-8 font-mono bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <Button
                  type="button"
                  variant="success"
                  size="md"
                  disabled={isSavingPayment}
                  onClick={handleConfirmPayment}
                  className="w-full sm:w-auto"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Confirm Payment & Close Job
                </Button>
              </div>
            </div>
          )}
      </div>

      <div className="flex items-center justify-end px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
        <Button type="button" variant="secondary" size="md" onClick={onClose} className="rounded-xl">
          Close Window
        </Button>
      </div>
    </Modal>
  );
};
