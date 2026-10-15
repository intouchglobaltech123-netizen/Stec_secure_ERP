import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { humanize } from '@/lib/utils';
import { useDismiss } from '@/lib/use-dismiss';
import { Modal } from '@/components/ui/modal';

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
  // The phone menu slides back down before it is removed
  const [menuClosing, setMenuClosing] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const closeAccountMenu = useCallback(() => setRoleMenuOpen(false), []);
  useDismiss(accountMenuRef, roleMenuOpen, closeAccountMenu);
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

  const closeMobileMenu = useCallback(() => {
    setMenuClosing(true);
    window.setTimeout(() => {
      setMobileMenuOpen(false);
      setMenuClosing(false);
    }, 200);
  }, []);

  // Escape closes the phone menu
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMobileMenu();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen, closeMobileMenu]);

  const handleNavClick = (section: NavSection) => {
    onNavigate(section);
    if (mobileMenuOpen) closeMobileMenu();
  };

  // Sign out asks first
  const askSignOut = () => {
    setRoleMenuOpen(false);
    if (mobileMenuOpen) closeMobileMenu();
    setSignOutConfirmOpen(true);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      toast.success('Signed out.');
    } finally {
      setSigningOut(false);
      setSignOutConfirmOpen(false);
    }
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
            onClick={() => (mobileMenuOpen ? closeMobileMenu() : setMobileMenuOpen(true))}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
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
                <span className="text-[11px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 ml-1">
                  ERP
                </span>
              </div>
              <div className="text-xs text-slate-500 hidden sm:block -mt-0.5 font-medium">
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
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-[13px] font-semibold hover:bg-amber-100 transition-colors cursor-pointer shadow-2xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>{openHoldsCount} Hold Pending</span>
            </button>
          )}

          {/* Phase 22: notifications */}
          <NotificationBell onNavigate={onNavigate} />

          {/* Account menu */}
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
              className="flex items-center gap-2 px-1.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-left transition-all cursor-pointer shadow-2xs"
            >
              <div className="w-7 h-7 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-[13px] font-bold text-orange-700">
                {currentUser?.name.charAt(0)}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[13px] font-semibold text-slate-900 leading-tight flex items-center gap-1">
                  <span>{currentUser?.name}</span>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </div>
                <div className="text-[11px] text-slate-500 font-medium">{humanize(currentUser?.role)}</div>
              </div>

            </button>

            {roleMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-50 erp-dropdown">
                <div className="px-2 py-1.5">
                  <div className="text-[13px] font-semibold text-slate-900">{currentUser?.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {humanize(currentUser?.role)} · {currentUser?.phone}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRoleMenuOpen(false);
                      setChangePinOpen(true);
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" /> Change PIN
                  </button>
                  <button
                    type="button"
                    onClick={askSignOut}
                    className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer font-medium"
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
                <span className="text-[13px] font-semibold text-slate-700">Live Workspace</span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono font-medium">
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
                        className={`text-[13px] px-2 py-0.5 rounded-full font-semibold ${
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
            <div className="flex items-center justify-between px-2 text-[13px] text-slate-500">
              <span>Services Scope:</span>
              <span className="text-orange-600 font-semibold">6 Categories</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-orange-500" /> S Tec Secure
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                CCTV &bull; Home Automations &bull; Gate Automation &bull; Biometric Access
              </p>
            </div>
          </div>
        </aside>

        {/* Phone menu: a sheet that slides up from the bottom */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className={`absolute inset-0 bg-black/40 backdrop-blur-xs ${menuClosing ? 'erp-backdrop-out' : 'erp-backdrop'}`}
              onClick={closeMobileMenu}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className={`absolute inset-x-0 bottom-0 max-h-[88dvh] flex flex-col rounded-t-2xl bg-white shadow-2xl ${
                menuClosing ? 'erp-sheet-out' : 'erp-sheet'
              }`}
            >
              <div className="pt-2.5 flex justify-center shrink-0" aria-hidden="true">
                <div className="w-10 h-1.5 rounded-full bg-slate-300" />
              </div>
              <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-sm font-bold text-orange-700 shrink-0">
                    {currentUser?.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{currentUser?.name}</div>
                    <div className="text-xs text-slate-500">{humanize(currentUser?.role)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeMobileMenu}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto overscroll-contain p-3 grid grid-cols-2 gap-2 content-start">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`relative flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left text-[13px] font-semibold leading-tight ${
                        isActive
                          ? 'bg-orange-50 border-orange-300 text-orange-700'
                          : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-orange-600' : 'text-slate-400'}`} />
                      <span className="flex-1 min-w-0">{item.label}</span>
                      {item.badge !== undefined && (
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                            item.badgeVariant === 'danger'
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
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

              <div className="p-3 border-t border-slate-100 grid grid-cols-2 gap-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    closeMobileMenu();
                    setChangePinOpen(true);
                  }}
                  className="text-[13px]"
                >
                  <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Change PIN
                </Button>
                <Button variant="outline" size="md" onClick={askSignOut} className="text-[13px] text-rose-600 hover:text-rose-700">
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

      {/* Sign out confirmation */}
      <Modal
        isOpen={signOutConfirmOpen}
        onClose={() => !signingOut && setSignOutConfirmOpen(false)}
        title="Sign out?"
        icon={<LogOut className="w-4 h-4" />}
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setSignOutConfirmOpen(false)} disabled={signingOut}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={handleSignOut} disabled={signingOut}>
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">You will need your mobile number and PIN to log in again.</p>
      </Modal>
    </div>
  );
};
