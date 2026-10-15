import React from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Settings, Database, ShieldCheck, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { APP_SECTIONS, AppSection, ConfigurableRole } from '@/lib/stecsecure-types';
import { StaffAccountsCard } from '@/components/settings/StaffAccountsCard';

const CONFIGURABLE_ROLES: { role: ConfigurableRole; label: string }[] = [
  { role: 'MANAGER', label: 'Manager' },
  { role: 'TECHNICIAN', label: 'Technician' },
];

export const SettingsPage: React.FC = () => {
  const { currentUser, products, serialUnits, jobs, customers, invoices, accessControl, updateAccessControl } =
    useStecSecure();
  const isCeo = currentUser?.role === 'CEO';

  // Phase 18: CEO toggles which sections each role can open
  const toggleAccess = async (role: ConfigurableRole, section: AppSection) => {
    const current = accessControl[role];
    const enabled = current.includes(section);
    const next = enabled ? current.filter((s) => s !== section) : [...current, section];
    try {
      // Keep the matrix order stable so it reads the same as the sidebar
      await updateAccessControl(
        role,
        APP_SECTIONS.map((s) => s.id).filter((id) => next.includes(id))
      );
      const label = APP_SECTIONS.find((s) => s.id === section)?.label;
      toast.success(
        `${label} ${enabled ? 'hidden from' : 'enabled for'} ${role === 'MANAGER' ? 'Managers' : 'Technicians'}`
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="orange" className="text-xs">
            <Settings className="w-3.5 h-3.5 text-orange-600" />
            System Configuration
          </Badge>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
          ERP Settings & System Environment
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">Staff accounts, access control and system information</p>
      </div>

      {isCeo && <StaffAccountsCard />}

      {isCeo && (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              Access Control
            </CardTitle>
            <CardDescription className="text-slate-500">
              Choose which pages each role can open. Technicians still only see the jobs and repair tickets
              assigned to them. Changes apply immediately, for everyone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 font-semibold">Page</th>
                    <th className="py-2 px-4 font-semibold text-center">CEO</th>
                    {CONFIGURABLE_ROLES.map((r) => (
                      <th key={r.role} className="py-2 px-4 font-semibold text-center">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {APP_SECTIONS.map((section) => (
                    <tr key={section.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 text-slate-800 font-medium">{section.label}</td>
                      <td className="py-2 px-4 text-center">
                        <Check className="w-4 h-4 text-slate-400 inline" aria-label="Always allowed" />
                      </td>
                      {CONFIGURABLE_ROLES.map((r) => {
                        const checked = accessControl[r.role].includes(section.id);
                        return (
                          <td key={r.role} className="py-2 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => void toggleAccess(r.role, section.id)}
                              aria-label={`${section.label} for ${r.label}`}
                              className="w-4 h-4 accent-orange-600 cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">
              The CEO always has access to every page. Access Control and Staff Accounts are visible only to the CEO.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-slate-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-orange-600" />
            Data
          </CardTitle>
          <CardDescription className="text-slate-500">
            Stored on the S Tec Secure server and shared by every device. Records you can see:
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {[
            ['Jobs', jobs.length],
            ['Customers', customers.length],
            ['Invoices', invoices.length],
            ['Products', products.length],
            ['Serial units', serialUnits.length],
          ].map(([label, count]) => (
            <div key={label} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">{label}</div>
              <div className="font-semibold text-slate-900 font-mono text-sm">{count}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
