import React, { useState } from 'react';
import { localDateISO } from '@/lib/numbering';
import { useStecSecure } from '@/lib/stecsecure-context';
import {
  LayoutDashboard,
  Wrench,
  Boxes,
  Users,
  HardHat,
  FileSpreadsheet,
  CreditCard,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  AlertTriangle,
  ChevronDown,
  UserCheck,
  KeyRound,
  RotateCcw,
  Layers,
  Inbox,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DEMO_MODE } from '@/lib/demo-mode';
import { ChangePinModal } from '@/components/auth/ChangePinModal';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { AppSection } from '@/lib/stecsecure-types';

// REPLACE WITH ACTUAL S TEC SECURE LOGO (white background version) — see /public/logo-placeholder.png
export const COMPANY_LOGO_SRC = '/logo.png';

// 'jobs' is a legacy alias of 'service-jobs'
export type NavSection = AppSection | 'jobs';

interface AppShellProps {
  currentSection: NavSection;
  onNavigate: (section: NavSection) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentSection, onNavigate, children }) => {
  const {
    currentUser,
    logout,
    visibleJobs,
    visibleRepairTickets,
    holdEvents,
    enquiries,
    isManagement,
    canAccessSection,
  } = useStecSecure();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);

  const visibleJobIds = new Set(visibleJobs.map((j) => j.id));
  const openHoldsCount = holdEvents.filter(
    (h) => h.status === 'OPEN' && (isManagement || visibleJobIds.has(h.jobId))
  ).length;

  const followUpEnquiriesCount = enquiries.filter((e) => e.status === 'FOLLOW_UP').length;
  const serviceJobsCount = visibleJobs.filter((j) => j.type === 'SERVICE').length;
  const installationJobsCount = visibleJobs.filter((j) => j.type === 'INSTALLATION').length;

  // Repair counts (scoped to visibleRepairTickets)
  const todayStr = localDateISO();
  const overdueRepairsCount = visibleRepairTickets.filter(
    (t) =>
      t.status === 'SENT_TO_VENDOR' &&
      t.vendorExpectedReturnDate &&
      todayStr > t.vendorExpectedReturnDate
  ).length;
  const activeRepairsCount = visibleRepairTickets.filter(
    (t) => t.status !== 'REINSTALLED' && t.status !== 'WRITE_OFF'
  ).length;

  const rawNavItems: ({
    id: NavSection;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number | string;
    badgeVariant?: 'default' | 'warning' | 'danger';
  } | null)[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'enquiries',
      label: 'Enquiries',
      icon: Inbox,
      badge: followUpEnquiriesCount > 0 ? followUpEnquiriesCount : undefined,
    },
    {
      id: 'service-jobs',
      label: 'Service Jobs',
      icon: Wrench,
      badge: serviceJobsCount,
    },
    {
      id: 'installation-jobs',
      label: 'Installation Jobs',
      icon: Layers,
      badge: installationJobsCount,
    },
    {
      id: 'repairs',
      label: 'Repair',
      icon: RotateCcw,
      badge:
        overdueRepairsCount > 0
          ? `${overdueRepairsCount} Overdue`
          : activeRepairsCount > 0
          ? activeRepairsCount
          : undefined,
      badgeVariant: overdueRepairsCount > 0 ? 'danger' : 'default',
    },
    { id: 'inventory', label: 'Inventory', icon: Boxes },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'technicians', label: 'Technicians', icon: HardHat },
    { id: 'quotations-invoices', label: 'Quotations & Invoices', icon: FileSpreadsheet },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Phase 18: only the sections the CEO's access control allows for this role
  const navItems = rawNavItems.filter(
    (item): item is NonNullable<typeof item> => Boolean(item) && canAccessSection(item!.id as AppSection)
  );

  const handleNavClick = (section: NavSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    setRoleMenuOpen(false);
    await logout();
    toast.success('Signed out.');
  };

  const roleBadgeVariant =
    currentUser?.role === 'CEO'
      ? 'orange'
      : currentUser?.role === 'MANAGER'
      ? 'default'
      : 'success';

  return (
    <div className="h-screen max-h-screen bg-slate-50 text-slate-900 flex flex-col overflow-hidden antialiased">
      {/* Top Header */}
      <header className="shrink-0 h-16 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shadow-2xs z-40">
        {/* Left: Mobile hamburger & Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 cursor-pointer group py-1"
          >
            <div>
              <div className="font-extrabold text-base tracking-tight text-slate-900 flex items-center gap-1.5 font-display whitespace-nowrap">
                <span>S Tec</span>
                <span className="text-orange-600">Secure</span>
                <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 ml-1">
                  ERP
                </span>
              </div>
              <div className="text-[11px] text-slate-500 hidden sm:block -mt-0.5 font-medium">
                Surveillance & Automation Intelligence
              </div>
            </div>
          </div>
        </div>

        {/* Right: Logged In User Profile */}
        <div className="flex items-center gap-3">
          {openHoldsCount > 0 && (
            <button
              onClick={() => onNavigate('service-jobs')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer shadow-2xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{openHoldsCount} Hold Pending</span>
            </button>
          )}

          {/* Phase 22: notifications */}
          <NotificationBell onNavigate={onNavigate} />

          {/* Account menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-left transition-all cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-xs font-bold text-orange-700">
                {currentUser?.name.charAt(0)}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-900 leading-tight flex items-center gap-1">
                  <span>{currentUser?.name}</span>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </div>
                <div className="text-[10px] text-slate-500 font-medium">{currentUser?.role}</div>
              </div>
              <Badge variant={roleBadgeVariant} className="text-[10px] sm:hidden">
                {currentUser?.role}
              </Badge>
            </button>

            {roleMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-50 animate-in fade-in-50 zoom-in-95">
                <div className="px-2 py-1.5">
                  <div className="text-xs font-semibold text-slate-900">{currentUser?.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {currentUser?.role} · {currentUser?.phone}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRoleMenuOpen(false);
                      setChangePinOpen(true);
                    }}
                    className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" /> Change PIN
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-[11px] text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <LogOut className="w-3 h-3" /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body container with Sidebar and Content: fixed viewport height */}
      <div className="flex-1 flex h-[calc(100vh-4rem)] overflow-hidden relative">
        {/* Desktop Sidebar: full height of body, never leaves gap below settings, independent scroll */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white shrink-0 h-full overflow-hidden">
          {/* Scrollable Navigation section */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Status indicator */}
            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-700">Live Workspace</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono font-medium">
                {DEMO_MODE ? 'v1.0 Demo' : 'v1.0'}
              </span>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all group cursor-pointer ${
                      isActive
                        ? 'bg-orange-50 text-orange-600 font-semibold border-l-4 border-orange-500 rounded-r-xl'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive ? 'text-orange-600' : 'text-slate-400 group-hover:text-slate-700'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          item.badgeVariant === 'danger'
                            ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse'
                            : isActive
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Fixed Sidebar Footer pinned at bottom */}
          <div className="p-4 border-t border-slate-200 bg-white shrink-0 space-y-3">
            <div className="flex items-center justify-between px-2 text-xs text-slate-500">
              <span>Services Scope:</span>
              <span className="text-orange-600 font-semibold">6 Categories</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-orange-500" /> S Tec Secure
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                CCTV &bull; Home Automations &bull; Gate Automation &bull; Biometric Access
              </p>
            </div>
          </div>
        </aside>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-72 bg-white border-r border-slate-200 p-4 flex flex-col justify-between z-10 h-full shadow-2xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm font-display">S Tec Secure</span>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavClick(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium ${
                          isActive
                            ? 'bg-orange-50 text-orange-600 font-semibold border-l-4 border-orange-500 rounded-r-xl'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon
                            className={`w-4 h-4 ${
                              isActive ? 'text-orange-600' : 'text-slate-400'
                            }`}
                          />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              item.badgeVariant === 'danger'
                                ? 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse'
                                : isActive
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="w-full text-xs text-rose-600 hover:text-rose-700"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign Out
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area — Fluid 100% remaining width with min-w-0 */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50">
          <div className="w-full min-w-0">{children}</div>
        </main>
      </div>
      <ChangePinModal isOpen={changePinOpen} onClose={() => setChangePinOpen(false)} />
    </div>
  );
};
