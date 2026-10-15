import React from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Settings, RefreshCw, Database, ShieldCheck, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { DEMO_MODE } from '@/lib/demo-mode';
import { APP_SECTIONS, AppSection, ConfigurableRole } from '@/lib/stecsecure-types';

const CONFIGURABLE_ROLES: { role: ConfigurableRole; label: string }[] = [
  { role: 'MANAGER', label: 'Manager' },
  { role: 'TECHNICIAN', label: 'Technician' },
];

export const SettingsPage: React.FC = () => {
  const { currentUser, resetToDemoData, products, serialUnits, jobs, accessControl, updateAccessControl } =
    useStecSecure();
  const isCeo = currentUser?.role === 'CEO';

  const handleReset = () => {
    if (
      window.confirm(
        'Reset to demo data? This permanently deletes ALL customers, jobs, invoices and payments in this browser and cannot be undone.'
      )
    ) {
      resetToDemoData();
      toast.success('System state reset to initial seed data.');
    }
  };

  // Phase 18: CEO toggles which sections each role can open
  const toggleAccess = (role: ConfigurableRole, section: AppSection) => {
    const current = accessControl[role];
    const enabled = current.includes(section);
    const next = enabled ? current.filter((s) => s !== section) : [...current, section];
    // Keep the matrix order stable so it reads the same as the sidebar
    updateAccessControl(
      role,
      APP_SECTIONS.map((s) => s.id).filter((id) => next.includes(id))
    );
    const label = APP_SECTIONS.find((s) => s.id === section)?.label;
    toast.success(`${label} ${enabled ? 'hidden from' : 'enabled for'} ${role === 'MANAGER' ? 'Managers' : 'Technicians'}`);
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
        <p className="text-xs sm:text-sm text-slate-500">
          Environment configuration, access control and local storage diagnostics
        </p>
      </div>

      {isCeo && (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              Access Control
            </CardTitle>
            <CardDescription className="text-slate-500">
              Choose which pages each role can open. Technicians still only see the jobs and repair tickets
              assigned to them. Changes apply immediately.
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
                              onChange={() => toggleAccess(r.role, section.id)}
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
              The CEO always has access to every page. Access Control itself is visible only to the CEO.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System & Storage Diagnostics */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-orange-600" />
              Storage & Persistence
            </CardTitle>
            <CardDescription className="text-slate-500">
              Client-side mock engine active with browser localStorage persistence
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Storage Key:</span>
              <span className="font-mono text-orange-600 font-bold">stecsecure_erp_v1</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Total Products:</span>
              <span className="font-semibold text-slate-900 font-mono">{products.length} products</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Tracked Serial Units:</span>
              <span className="font-semibold text-slate-900 font-mono">{serialUnits.length} units</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-600">Active Jobs:</span>
              <span className="font-semibold text-slate-900 font-mono">{jobs.length} jobs</span>
            </div>
          </CardContent>
        </Card>

        {/* Demo Controls — demo mode and CEO only */}
        {DEMO_MODE && isCeo && (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-600" />
                Demo Data Reset
              </CardTitle>
              <CardDescription className="text-slate-500">
                Restore seed data anytime during presentation or demo testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Clicking reset deletes everything entered in this browser and restores the full CCTV & automation
                catalogue, 15 serial items, sample jobs (including the pending OTP and Hold events), and invoices
                to their factory demo baseline.
              </p>
              <Button variant="danger" size="md" onClick={handleReset} className="w-full sm:w-auto">
                <RefreshCw className="w-4 h-4 mr-2" /> Reset All Demo Data
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
