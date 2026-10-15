import React, { useEffect, useState } from 'react';
import { Pencil, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { CustomerStatus, Job, SERVICE_CATEGORIES, ServiceCategory } from '@/lib/stecsecure-types';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const STATUSES: CustomerStatus[] = ['OTHERS', 'SERVICE_CALL', 'WARRANTY', 'AMC'];
const labelCls = 'block font-semibold text-slate-700 mb-1';
const selectCls = 'w-full h-9 px-3 rounded-md border border-slate-300 bg-white text-[13px]';

// Phase 22: management changes a job's details, team, lead, schedule and site contact
export const EditJobModal: React.FC<{ isOpen: boolean; onClose: () => void; job: Job }> = ({
  isOpen,
  onClose,
  job,
}) => {
  const { users, editJob } = useStecSecure();
  const technicians = users.filter((u) => u.role === 'TECHNICIAN' || job.assignedTeam.includes(u.id));

  const [category, setCategory] = useState<ServiceCategory>(job.category);
  const [customerStatus, setCustomerStatus] = useState<CustomerStatus>(job.customerStatus);
  const [problem, setProblem] = useState(job.problemReported || '');
  const [team, setTeam] = useState<string[]>(job.assignedTeam);
  const [lead, setLead] = useState(job.teamLeadUserId || job.assignedTeam[0] || '');
  const [scheduledFor, setScheduledFor] = useState(job.scheduledFor || '');
  const [contactName, setContactName] = useState(job.siteContactName || '');
  const [contactPhone, setContactPhone] = useState(job.siteContactPhone || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCategory(job.category);
    setCustomerStatus(job.customerStatus);
    setProblem(job.problemReported || '');
    setTeam(job.assignedTeam);
    setLead(job.teamLeadUserId || job.assignedTeam[0] || '');
    setScheduledFor(job.scheduledFor || '');
    setContactName(job.siteContactName || '');
    setContactPhone(job.siteContactPhone || '');
  }, [isOpen, job.id]);

  const toggleMember = (id: string) => {
    setTeam((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      if (!next.includes(lead)) setLead(next[0] || '');
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team.length) {
      toast.error('Select at least one technician.');
      return;
    }
    setSaving(true);
    try {
      await editJob(job.id, {
        category,
        customerStatus,
        problemReported: problem.trim(),
        assignedTeam: team,
        teamLeadUserId: lead || team[0],
        scheduledFor: scheduledFor || undefined,
        siteContactName: contactName.trim() || undefined,
        siteContactPhone: contactPhone.replace(/\D/g, '').slice(-10) || undefined,
      });
      toast.success(`Job ${job.jobNumber} updated.`);
      onClose();
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
      title={`Edit ${job.jobNumber}`}
      icon={<Pencil className="w-5 h-5 text-orange-600" />}
    >
      <form onSubmit={handleSubmit} className="space-y-3 text-[13px]">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory)} className={selectCls}>
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Contract / warranty status</label>
            <select
              value={customerStatus}
              onChange={(e) => setCustomerStatus(e.target.value as CustomerStatus)}
              className={selectCls}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Scope of work / problem</label>
          <textarea
            rows={2}
            required
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-[13px]"
          />
        </div>

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <label className={labelCls}>Team (tap a name to add or remove; ★ = team lead)</label>
          <div className="flex flex-wrap gap-1.5">
            {technicians.map((t) => {
              const inTeam = team.includes(t.id);
              const isLead = inTeam && lead === t.id;
              return (
                <span key={t.id} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleMember(t.id)}
                    className={`px-2.5 py-1 rounded-l-md border text-xs font-semibold cursor-pointer ${
                      inTeam ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-300 text-slate-600'
                    }`}
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    disabled={!inTeam}
                    onClick={() => setLead(t.id)}
                    title="Make team lead"
                    className={`px-1.5 py-1 rounded-r-md border-y border-r text-xs cursor-pointer disabled:opacity-30 ${
                      isLead ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-white border-slate-300 text-slate-400'
                    }`}
                  >
                    ★
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Scheduled visit</label>
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className={labelCls}>Site contact name</label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className={labelCls}>Site contact mobile</label>
            <Input
              type="tel"
              inputMode="numeric"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="h-9 font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Phase 22: cancel a job (instead of deleting it) — keeps the record, releases allocated stock
export const CancelJobModal: React.FC<{ isOpen: boolean; onClose: () => void; job: Job }> = ({
  isOpen,
  onClose,
  job,
}) => {
  const { cancelJob } = useStecSecure();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen, job.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await cancelJob(job.id, reason);
      toast.success(`Job ${job.jobNumber} cancelled.`);
      onClose();
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
      maxWidth="sm"
      title={`Cancel ${job.jobNumber}?`}
      icon={<Ban className="w-5 h-5 text-rose-600" />}
    >
      <form onSubmit={handleSubmit} className="space-y-3 text-[13px]">
        <p className="text-slate-600">
          The job stays on record as Cancelled. Products allocated to it go back to stock. A job that is already
          invoiced cannot be cancelled.
        </p>
        <div>
          <label className={labelCls}>Reason</label>
          <textarea
            rows={2}
            required
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer postponed the installation"
            className="w-full rounded-md border border-slate-300 bg-white p-2.5 text-[13px]"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Keep job
          </Button>
          <Button type="submit" variant="danger" size="sm" disabled={saving || !reason.trim()}>
            {saving ? 'Cancelling…' : 'Cancel job'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
