import React, { useEffect, useState } from 'react';
import { humanize } from '@/lib/utils';
import { Users, Plus, KeyRound, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure, StaffAccount } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { UserRole } from '@/lib/stecsecure-types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';

const ROLES: UserRole[] = ['TECHNICIAN', 'MANAGER', 'CEO'];
const onlyDigits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; staff: StaffAccount }
  | { kind: 'pin'; staff: StaffAccount }
  | null;

// Phase 21: CEO manages who can log in — add staff, change details or role, disable, reset PINs
export const StaffAccountsCard: React.FC = () => {
  const { listStaff, createStaff, updateStaff, resetStaffPin, currentUser } = useStecSecure();
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saving, setSaving] = useState(false);

  // Form fields shared by the dialogs
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('TECHNICIAN');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');

  const reload = async () => {
    try {
      setStaff(await listStaff());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const open = (next: Dialog) => {
    const s = next && next.kind !== 'add' ? next.staff : null;
    setName(s?.name ?? '');
    setRole(s?.role ?? 'TECHNICIAN');
    setPhone(s?.phone ?? '');
    setEmail(s?.email ?? '');
    setPin('');
    setDialog(next);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.kind === 'add') {
        await createStaff({ name, role, phone, pin, email: email || undefined });
        toast.success(`${name} can now log in with ${phone}.`);
      } else if (dialog.kind === 'edit') {
        await updateStaff(dialog.staff.id, { name, role, phone, email });
        toast.success(`${name} updated.`);
      } else {
        await resetStaffPin(dialog.staff.id, pin);
        toast.success(`New PIN set for ${dialog.staff.name}. They have been signed out everywhere.`);
      }
      setDialog(null);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: StaffAccount) => {
    const disabling = s.active;
    if (disabling && !window.confirm(`Disable ${s.name}? They will be signed out and can no longer log in.`)) return;
    try {
      await updateStaff(s.id, { active: !s.active });
      toast.success(disabling ? `${s.name} disabled.` : `${s.name} can log in again.`);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const field = (label: string, input: React.ReactNode) => (
    <div>
      <label className="block text-[13px] font-semibold text-slate-700 mb-1">{label}</label>
      {input}
    </div>
  );

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-600" />
              Staff Accounts
            </CardTitle>
            <CardDescription className="text-slate-500">
              Staff log in with their mobile number and a 4-digit PIN. Five wrong PINs lock an account for 15
              minutes.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => open({ kind: 'add' })} className="shrink-0">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add staff
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-[13px] text-slate-500">Loading staff…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="stack-on-phone w-full text-[13px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">Name</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">Mobile</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {s.name}
                      {s.id === currentUser?.id && <span className="text-slate-400 font-normal"> (you)</span>}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{humanize(s.role)}</td>
                    <td className="py-2 pr-3 font-mono text-slate-700">{s.phone}</td>
                    <td className="py-2 pr-3">
                      {!s.active ? (
                        <Badge variant="outline" className="text-[11px]">Disabled</Badge>
                      ) : s.locked ? (
                        <Badge variant="warning" className="text-[11px]">Locked</Badge>
                      ) : (
                        <Badge variant="success" className="text-[11px]">Active</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => open({ kind: 'edit', staff: s })}
                        className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                        title="Edit details"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => open({ kind: 'pin', staff: s })}
                        className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                        title="Set a new PIN"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      {s.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => void toggleActive(s)}
                          className={`ml-1 text-xs font-semibold cursor-pointer ${
                            s.active ? 'text-rose-600 hover:text-rose-700' : 'text-emerald-600 hover:text-emerald-700'
                          }`}
                        >
                          {s.active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Modal
        isOpen={Boolean(dialog)}
        onClose={() => setDialog(null)}
        maxWidth="sm"
        title={
          dialog?.kind === 'add'
            ? 'Add staff member'
            : dialog?.kind === 'edit'
            ? `Edit ${dialog.staff.name}`
            : dialog?.kind === 'pin'
            ? `New PIN for ${dialog.staff.name}`
            : ''
        }
      >
        <form onSubmit={save} className="space-y-3">
          {dialog?.kind !== 'pin' && (
            <>
              {field('Name', <Input required value={name} onChange={(e) => setName(e.target.value)} className="h-9" />)}
              {field(
                'Role',
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full h-9 px-3 rounded-md border border-slate-300 bg-white text-[13px]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
              {field(
                'Mobile number (used to log in)',
                <Input
                  required
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(onlyDigits(e.target.value, 10))}
                  className="h-9 font-mono"
                />
              )}
              {field(
                'Email (optional)',
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
              )}
            </>
          )}
          {dialog?.kind !== 'edit' &&
            field(
              dialog?.kind === 'pin' ? 'New 4-digit PIN' : '4-digit PIN (tell the staff member privately)',
              <Input
                required
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(onlyDigits(e.target.value, 4))}
                className="h-9 font-mono tracking-[0.4em]"
              />
            )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
};
