import React, { useEffect, useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { useStecSecure } from '@/lib/stecsecure-context';
import { errorMessage } from '@/lib/api';
import { humanize, formatINR } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TablePager } from '@/components/ui/table-pager';
import { usePagination } from '@/lib/use-pagination';

type Draft = {
  monthlySalary: string;
  serviceIncentive: string;
  installationIncentive: string;
  paidLeavePerMonth: string;
  casualLeavePerMonth: string;
};

// Payroll settings (CEO only): monthly salary and incentive per finished job, per person.
// The Payroll report works out pay from these.
export const SalariesCard: React.FC = () => {
  const { users, payProfiles, setPayProfile } = useStecSecure();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shownUsers = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || (u.staffCode || '').toLowerCase().includes(q))
    : users;
  const pager = usePagination(shownUsers, [search]);

  const saved = (userId: string): Draft => {
    const p = payProfiles.find((x) => x.id === userId);
    return {
      monthlySalary: p ? String(p.monthlySalary) : '',
      serviceIncentive: p ? String(p.serviceIncentive) : '',
      installationIncentive: p ? String(p.installationIncentive) : '',
      paidLeavePerMonth: p ? String(p.paidLeavePerMonth ?? 0) : '',
      casualLeavePerMonth: p ? String(p.casualLeavePerMonth ?? 0) : '',
    };
  };

  // Fill the form from what is saved (and again when someone else saves)
  useEffect(() => {
    setDrafts(Object.fromEntries(users.map((u) => [u.id, saved(u.id)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, payProfiles]);

  const change = (userId: string, field: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [userId]: { ...(d[userId] ?? saved(userId)), [field]: value } }));

  const save = async (userId: string) => {
    const d = drafts[userId];
    setSavingId(userId);
    try {
      await setPayProfile({
        userId,
        monthlySalary: Number(d.monthlySalary) || 0,
        serviceIncentive: Number(d.serviceIncentive) || 0,
        installationIncentive: Number(d.installationIncentive) || 0,
        paidLeavePerMonth: Number(d.paidLeavePerMonth) || 0,
        casualLeavePerMonth: Number(d.casualLeavePerMonth) || 0,
      });
      toast.success(`Pay saved for ${users.find((u) => u.id === userId)?.name}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  const field = (userId: string, key: keyof Draft, label: string) => (
    <Input
      type="number"
      min="0"
      inputMode="decimal"
      aria-label={label}
      placeholder="0"
      value={drafts[userId]?.[key] ?? ''}
      onChange={(e) => change(userId, key, e.target.value)}
      className="h-9 w-full lg:w-[5.5rem] xl:w-28 text-[13px] text-right font-mono bg-white"
    />
  );

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-base text-slate-900 flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-orange-600" />
          Salaries
        </CardTitle>
        <CardDescription className="text-slate-500">
          Monthly salary, incentive per finished job and leave days per month, for Reports → Payroll.
          <span className="hidden sm:inline">
            {' '}Every team member on a finished job gets that job's incentive. Unused leave carries forward until March.
            Only you can see this.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TablePager
          pager={pager}
          noun="staff"
          search={{ value: search, onChange: setSearch, placeholder: 'Search name or staff no.' }}
          className="mb-3"
        />
        <table className="stack-on-phone w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3">Staff</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3 text-right">Monthly salary (₹)</th>
              <th className="py-2 pr-3 text-right">Per service job (₹)</th>
              <th className="py-2 pr-3 text-right">Per installation job (₹)</th>
              <th className="py-2 pr-3 text-right">Paid leave / month</th>
              <th className="py-2 pr-3 text-right">Casual leave / month</th>
              <th className="py-2 text-right">Save</th>
            </tr>
          </thead>
          <tbody>
            {pager.items.map((u) => {
              const d = drafts[u.id] ?? saved(u.id);
              const s = saved(u.id);
              const changed =
                d.monthlySalary !== s.monthlySalary ||
                d.serviceIncentive !== s.serviceIncentive ||
                d.installationIncentive !== s.installationIncentive ||
                d.paidLeavePerMonth !== s.paidLeavePerMonth ||
                d.casualLeavePerMonth !== s.casualLeavePerMonth;
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-slate-900">{u.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{u.staffCode}</div>
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{humanize(u.role)}</td>
                  <td className="py-2 pr-3 text-right">{field(u.id, 'monthlySalary', `Monthly salary for ${u.name}`)}</td>
                  <td className="py-2 pr-3 text-right">{field(u.id, 'serviceIncentive', `Per service job for ${u.name}`)}</td>
                  <td className="py-2 pr-3 text-right">
                    {field(u.id, 'installationIncentive', `Per installation job for ${u.name}`)}
                  </td>
                  <td className="py-2 pr-3 text-right">{field(u.id, 'paidLeavePerMonth', `Paid leave days per month for ${u.name}`)}</td>
                  <td className="py-2 pr-3 text-right">{field(u.id, 'casualLeavePerMonth', `Casual leave days per month for ${u.name}`)}</td>
                  <td className="py-2 text-right">
                    <Button
                      size="sm"
                      variant={changed ? 'primary' : 'outline'}
                      disabled={!changed || savingId === u.id}
                      onClick={() => save(u.id)}
                    >
                      {savingId === u.id ? 'Saving…' : changed ? 'Save' : 'Saved'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-3">
          Total monthly salaries: <strong className="text-slate-800 font-mono">{formatINR(payProfiles.reduce((sum, p) => sum + p.monthlySalary, 0))}</strong>
        </p>
      </CardContent>
    </Card>
  );
};
