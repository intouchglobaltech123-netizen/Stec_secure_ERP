import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Job } from '@/lib/stecsecure-types';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { errorMessage } from '@/lib/api';
import { toast } from 'sonner';

interface RaiseHoldModalProps {
  isOpen: boolean;
  job: Job | null;
  onClose: () => void;
  onHoldRaised: () => void;
}

export const RaiseHoldModal: React.FC<RaiseHoldModalProps> = ({
  isOpen,
  job,
  onClose,
  onHoldRaised,
}) => {
  const { raiseHold } = useStecSecure();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen || !job) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Please describe the obstacle causing this hold');
      return;
    }

    setSaving(true);
    try {
      await raiseHold(job.id, reason.trim());
      toast.warning(`Job ${job.jobNumber} placed on hold.`);
      toast.info('Management notified.');
      onHoldRaised();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title="Raise Job Hold"
      subtitle={`Job: ${job.jobNumber} • ${job.productModel || job.category}`}
      icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5 text-xs">
              Reason for Hold (Describe in your own words) *
            </label>
            <textarea
              rows={5}
              required
              autoFocus
              placeholder="Type the exact site condition, obstacle, or client dependency causing work to stop..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 leading-relaxed shadow-2xs"
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
            <strong>Timer Paused:</strong> Submitting this hold immediately pauses the live running timer and preserves current elapsed time. Management (CEO/Manager) will be notified to review and authorize resumption.
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <Button type="button" variant="secondary" size="md" onClick={onClose} className="rounded-xl">
              Cancel
            </Button>
            <Button type="submit" variant="warning" size="md" disabled={saving} className="rounded-xl font-semibold">
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              Raise Hold & Pause Timer
            </Button>
          </div>
        </form>
    </Modal>
  );
};
