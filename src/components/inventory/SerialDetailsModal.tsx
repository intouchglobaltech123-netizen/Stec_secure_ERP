import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { SerialUnit } from '@/lib/stecsecure-types';
import {
  X,
  Boxes,
  ShieldCheck,
  Building2,
  Calendar,
  User,
  MapPin,
  Wrench,
  RotateCcw,
  AlertTriangle,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { formatDate, formatINR } from '@/lib/utils';
import { toast } from 'sonner';

interface SerialDetailsModalProps {
  isOpen: boolean;
  serial: SerialUnit | null;
  onClose: () => void;
}

export const SerialDetailsModal: React.FC<SerialDetailsModalProps> = ({
  isOpen,
  serial,
  onClose,
}) => {
  const {
    products,
    vendors,
    customers,
    jobs,
    isManagement,
    markSerialReturned,
  } = useStecSecure();

  const [isReturning, setIsReturning] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen || !serial) return null;

  const product = products.find((p) => p.id === serial.productId);
  const vendor = vendors.find((v) => v.id === serial.purchasedFromVendorId);
  const customer = customers.find((c) => c.id === serial.soldToCustomerId);
  const job = jobs.find((j) => j.id === serial.installedAtJobId);

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReason.trim()) {
      toast.error('Please specify a return reason');
      return;
    }

    setSaving(true);
    try {
      await markSerialReturned(serial.id, returnReason.trim());
      toast.warning(`Unit ${serial.serialNumber} marked as RETURNED (Defect / RMA)`);
      setIsReturning(false);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const statusVariant =
    serial.status === 'INSTALLED'
      ? 'success'
      : serial.status === 'ALLOCATED'
      ? 'default'
      : serial.status === 'RETURNED'
      ? 'danger'
      : 'secondary';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      showCloseButton={false}
      className="max-h-[90vh]"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 font-mono">
                {serial.serialNumber}
              </h2>
              <Badge variant={statusVariant} className="text-[10px]">
                {serial.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">{product?.name || 'Hardware Unit'}</p>
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

      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs overscroll-contain">
          {/* Hardware Spec Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[10px] uppercase font-bold text-slate-500">Product Specification</div>
            <div className="font-bold text-slate-900 text-sm">{product?.name}</div>
            <div className="flex items-center gap-2 text-slate-600">
              <Badge variant="outline" className="text-[10px]">
                {product?.category}
              </Badge>
              <span>HSN: {product?.hsnSac || '85258090'}</span>
              <span>&bull; GST: {product?.gstRate || 18}%</span>
            </div>
          </div>

          {/* Provenance: Where Bought From */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-orange-600" />
              Inward Provenance (Where Bought From)
            </div>
            {vendor ? (
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">{vendor.name}</div>
                <div className="text-slate-600">{vendor.address}</div>
                <div className="text-slate-500">Phone: {vendor.phone}</div>
                {vendor.gstin && (
                  <div className="font-mono text-orange-600 text-[11px] font-semibold">
                    GSTIN: {vendor.gstin}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500 italic">Direct import or local stock (no vendor recorded)</p>
            )}
            {serial.purchaseDate && (
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                Inward Purchase Date: <strong>{formatDate(serial.purchaseDate)}</strong>
              </div>
            )}
            {serial.purchaseCost !== undefined && (
              <div className="text-[11px] text-slate-700 pt-1 border-t border-slate-200 flex items-center justify-between">
                <span className="text-slate-500">Unit Purchase Cost:</span>
                <strong className="font-mono text-slate-900">{formatINR(serial.purchaseCost)}</strong>
              </div>
            )}
          </div>

          {/* Deployment: Whom Sold To & Installed Location */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              Outward Lifecycle (Whom Sold To & Location Installed)
            </div>

            {customer ? (
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900">{customer.name}</div>
                <div className="text-slate-600">{customer.address}</div>
                <div className="text-slate-500">Phone: {customer.phone}</div>
              </div>
            ) : (
              <p className="text-slate-500 italic">
                Unit has not yet been sold to a customer (available in stock)
              </p>
            )}

            {job && (
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-orange-600" />
                  <span className="font-semibold text-slate-800">Job: {job.jobNumber}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {job.status}
                </Badge>
              </div>
            )}

            {serial.installedLocation && (
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium">
                Physical Installation Point: <strong>{serial.installedLocation}</strong>
              </div>
            )}

            {job && (
              <div className="text-[11px] text-slate-500">
                Job Linked: <strong>{job.jobNumber}</strong> ({formatDate(job.createdAt)})
              </div>
            )}
          </div>

          {/* Return status */}
          {serial.status === 'RETURNED' && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-xs text-rose-800">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Unit Returned for RMA / Defect
              </div>
              <p className="text-[11px] text-slate-700 font-medium">
                Status: Returned to warehouse / supplier for RMA replacement
              </p>
            </div>
          )}

          {/* Return Action Trigger (CEO/Manager only for active units) */}
          {isManagement && serial.status !== 'RETURNED' && (
            <div className="pt-2">
              {!isReturning ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReturning(true)}
                  className="w-full text-xs text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Mark Unit as Returned / RMA Defect
                </Button>
              ) : (
                <form onSubmit={handleReturn} className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                  <div className="font-bold text-rose-900 text-xs">Record Return Reason</div>
                  <Input
                    required
                    placeholder="Describe defective symptoms, RMA ticket, or warranty issue..."
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="text-xs h-8 bg-white"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsReturning(false)}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="danger" size="sm" disabled={saving} className="h-7 text-xs">
                      Confirm Return
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

      <div className="flex justify-end px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0">
        <Button type="button" variant="primary" size="md" onClick={onClose} className="rounded-xl">
          Close Details
        </Button>
      </div>
    </Modal>
  );
};
