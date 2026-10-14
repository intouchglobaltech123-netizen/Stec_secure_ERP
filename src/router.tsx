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

// Root app layout that handles authentication check & active module view
export const AppLayout: React.FC = () => {
  const { isAuthenticated, currentUser } = useStecSecure();
  const [currentSection, setCurrentSection] = useState<NavSection>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('section');
      if (p) return p as NavSection;
    }
    return 'dashboard';
  });

  // Phase 13 Part B: Route guard - redirect technician away from enquiries immediately
  React.useEffect(() => {
    if (currentUser?.role === 'TECHNICIAN' && currentSection === 'enquiries') {
      setCurrentSection('service-jobs');
    }
  }, [currentUser?.role, currentSection]);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const renderSection = () => {
    switch (currentSection) {
      case 'dashboard':
        return <DashboardPage />;
      case 'enquiries':
        if (currentUser?.role === 'TECHNICIAN') {
          return <JobsPage department="SERVICE" />;
        }
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
