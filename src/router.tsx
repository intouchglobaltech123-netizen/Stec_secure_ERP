import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { AppShell, NavSection } from '@/components/layout/AppShell';
import { DashboardPage } from '@/routes/DashboardPage';
import { EnquiriesPage } from '@/routes/EnquiriesPage';
import { JobsPage } from '@/routes/JobsPage';
import { InventoryPage } from '@/routes/InventoryPage';
import { CustomersPage } from '@/routes/CustomersPage';
import { TechniciansPage } from '@/routes/TechniciansPage';
import { QuotationsInvoicesPage } from '@/routes/QuotationsInvoicesPage';
import { PaymentsPage } from '@/routes/PaymentsPage';
import { ReportsPage } from '@/routes/ReportsPage';
import { SettingsPage } from '@/routes/SettingsPage';
import { RepairsPage } from '@/routes/RepairsPage';
import { APP_SECTIONS, AppSection } from '@/lib/stecsecure-types';
import { ShieldAlert } from 'lucide-react';

// Shown when the CEO's access control doesn't allow this page for the user's role
const AccessRestricted: React.FC<{ onGoHome?: () => void }> = ({ onGoHome }) => (
  <div className="max-w-md mx-auto mt-16 text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-2xs">
    <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
    <h2 className="text-lg font-bold text-slate-900">Access restricted</h2>
    <p className="text-sm text-slate-600 mt-1">
      Your role doesn't have access to this page. Ask the CEO to enable it in Settings → Access Control.
    </p>
    {onGoHome && (
      <button
        type="button"
        onClick={onGoHome}
        className="mt-4 text-sm font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
      >
        Go to my pages
      </button>
    )}
  </div>
);

const isAppSection = (value: string | null): value is AppSection =>
  APP_SECTIONS.some((s) => s.id === value);

// Root app layout that handles authentication check & active module view
export const AppLayout: React.FC = () => {
  const { isAuthenticated, currentUser, canAccessSection } = useStecSecure();
  const [currentSection, setCurrentSection] = useState<NavSection>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('section');
      if (isAppSection(p)) return p;
    }
    return 'dashboard';
  });

  // 'jobs' is a legacy alias of the service jobs list
  const sectionKey: AppSection = currentSection === 'jobs' ? 'service-jobs' : currentSection;
  const firstAllowed = APP_SECTIONS.find((s) => canAccessSection(s.id))?.id;

  // Phase 18: each user lands on their own first allowed page — never the previous user's page
  const lastUserIdRef = React.useRef<string | undefined>(currentUser?.id);
  React.useEffect(() => {
    if (lastUserIdRef.current === currentUser?.id) return;
    lastUserIdRef.current = currentUser?.id;
    if (currentUser) {
      setCurrentSection(canAccessSection('dashboard') ? 'dashboard' : firstAllowed ?? 'dashboard');
    }
  }, [currentUser, firstAllowed]);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const renderSection = () => {
    if (!canAccessSection(sectionKey)) {
      return <AccessRestricted onGoHome={firstAllowed ? () => setCurrentSection(firstAllowed) : undefined} />;
    }
    switch (currentSection) {
      case 'dashboard':
        return <DashboardPage />;
      case 'enquiries':
        return (
          <EnquiriesPage
            onNavigateToJob={(_jobId, type) =>
              setCurrentSection(type === 'INSTALLATION' ? 'installation-jobs' : 'service-jobs')
            }
          />
        );
      case 'service-jobs':
        return <JobsPage department="SERVICE" />;
      case 'installation-jobs':
        return <JobsPage department="INSTALLATION" />;
      case 'repairs':
        return (
          <RepairsPage
            onNavigateToJob={(_jobId) => setCurrentSection('service-jobs')}
          />
        );
      case 'jobs':
        return <JobsPage department="SERVICE" />;
      case 'inventory':
        return <InventoryPage />;
      case 'customers':
        return <CustomersPage />;
      case 'technicians':
        return <TechniciansPage />;
      case 'quotations-invoices':
        return <QuotationsInvoicesPage />;
      case 'payments':
        return <PaymentsPage />;
      case 'reports':
        return (
          <ReportsPage
            onNavigateToJob={(_jobId, type) =>
              setCurrentSection(type === 'INSTALLATION' ? 'installation-jobs' : 'service-jobs')
            }
          />
        );
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <AppShell currentSection={currentSection} onNavigate={setCurrentSection}>
      {renderSection()}
    </AppShell>
  );
};

// TanStack Router Root definition
const rootRoute = createRootRoute({
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: AppLayout,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
