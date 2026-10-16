import React, { useState } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { LeaveType, User } from '@/lib/stecsecure-types';
import { LEAVE_TYPES, leaveDays, leaveLedger, leaveTypeLabel } from '@/lib/leave';
import { DateRange, inRange, rangeLabel } from '@/lib/date-range';
import { localDateISO } from '@/lib/numbering';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

const fmtDays = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'day' : 'days'}`;
const TYPE_VARIANT: Record<LeaveType, 'success' | 'default' | 'danger'> = { PAID: 'success', CASUAL: 'default', UNPAID: 'danger' };

// A person's leave on their profile: balance (CEO), leave taken in the chosen dates, and — for the
// office — recording and removing leave
export const LeaveCard: React.FC<{ user: User; range: DateRange }> = ({ user, range }) => {
  const { leaveRecords, payProfiles, isManagement, currentUser, addLeave, deleteLeave } = useStecSecure();
  const today = localDateISO();
  const mine = leaveRecords.filter((l) => l.userId === user.id);
  const inPeriod = mine
    .filter((l) => inRange(l.from, range) || inRange(l.to, range))
    .sort((a, b) => b.from.localeCompare(a.from));
  const profile = payProfiles.find((p) => p.id === user.id);
  const isCeo = currentUser?.role === 'CEO';
  const ledger = leaveLedger(mine, profile, today);
  const takenBy = (t: LeaveType) => inPeriod.filter((l) => l.type === t).reduce((sum, l) => sum + leaveDays(l), 0);

  // Record-leave form
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeaveType>('CASUAL');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const formDays = from && to && to >= from ? leaveDays({ from, to, halfDay: halfDay && from === to }) : 0;

  const openForm = () => {
    setType('CASUAL');
    setFrom(today);
    setTo(today);
    setHalfDay(false);
    setReason('');
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const rec = await addLeave({ userId: user.id, type, from, to, halfDay: halfDay && from === to, reason });
      toast.success(`${leaveTypeLabel(rec.type)} recorded for ${user.name}: ${fmtDays(leaveDays(rec))}.`);
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this leave entry?')) return;
    setRemovingId(id);
    try {
      await deleteLeave(id);
      toast.success('Leave entry removed.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <CalendarOff className="w-4 h-4 text-orange-600" />
          Leave
        </CardTitle>
        {isManagement && (
          <Button size="sm" onClick={openForm}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Record leave
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[13px]">
          {isCeo && profile ? (
            <>
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-[11px] uppercase font-bold text-emerald-800">Paid leave left</div>
                <div className="font-mono font-bold text-emerald-800 text-base">{fmtDays(ledger.balance.PAID)}</div>
                <div className="text-[11px] text-slate-500">{profile.paidLeavePerMonth ?? 0} per month, carried forward</div>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-[11px] uppercase font-bold text-blue-800">Casual leave left</div>
                <div className="font-mono font-bold text-blue-800 text-base">{fmtDays(ledger.balance.CASUAL)}</div>
                <div className="text-[11px] text-slate-500">{profile.casualLeavePerMonth ?? 0} per month, carried forward</div>
              </div>
            </>
          ) : null}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] uppercase font-bold text-slate-500">Paid + casual taken</div>
            <div className="font-mono font-bold text-slate-900 text-base">{fmtDays(takenBy('PAID') + takenBy('CASUAL'))}</div>
            <div className="text-[11px] text-slate-500">{rangeLabel(range)}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
            <div className="text-[11px] uppercase font-bold text-rose-700">Unpaid leave</div>
            <div className="font-mono font-bold text-rose-700 text-base">{fmtDays(takenBy('UNPAID'))}</div>
            <div className="text-[11px] text-slate-500">{rangeLabel(range)}</div>
          </div>
        </div>

        {inPeriod.length === 0 ? (
          <p className="text-[13px] text-slate-500">No leave in these dates.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {inPeriod.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={TYPE_VARIANT[l.type]} className="text-[11px]">
                      {leaveTypeLabel(l.type)}
                    </Badge>
                    <span className="font-semibold text-slate-900 whitespace-nowrap">
                      {l.from === l.to ? formatDate(l.from) : `${formatDate(l.from)} – ${formatDate(l.to)}`}
                    </span>
                    <span className="text-slate-500 whitespace-nowrap">
                      {l.halfDay ? 'half day' : fmtDays(leaveDays(l))}
                    </span>
                  </div>
                  {l.reason && <div className="text-xs text-slate-500 truncate">{l.reason}</div>}
                </div>
                {isManagement && (
                  <button
                    type="button"
                    onClick={() => remove(l.id)}
                    disabled={removingId === l.id}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                    aria-label="Remove leave entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        isOpen={open}
        onClose={() => !saving && setOpen(false)}
        title={`Record leave — ${user.name}`}
        icon={<CalendarOff className="w-4 h-4" />}
        maxWidth="md"
      >
        <form onSubmit={save} className="space-y-4 text-[13px]">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Type of leave</label>
            <div className="grid grid-cols-3 gap-2">
              {LEAVE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`h-10 rounded-lg border text-[13px] font-semibold ${
                    type === t.value ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block font-semibold text-slate-700 mb-1">From</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (!to || to < e.target.value) setTo(e.target.value);
                }}
                required
              />
            </label>
            <label className="block">
              <span className="block font-semibold text-slate-700 mb-1">To</span>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
            </label>
          </div>
          {from === to && (
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
              Half day
            </label>
          )}
          <label className="block">
            <span className="block font-semibold text-slate-700 mb-1">Reason (optional)</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. family function" />
          </label>
          <p className="text-xs text-slate-500">
            {fmtDays(formDays)} — Sundays are not counted. Paid or casual leave beyond what {user.name.split(' ')[0]} has
            built up is unpaid in payroll.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || formDays === 0}>
              {saving ? 'Saving…' : 'Record leave'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};
