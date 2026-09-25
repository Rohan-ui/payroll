import React from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TextSizeProvider } from './context/TextSizeContext';
import { I18nProvider } from './i18n/I18nContext';
import { PayrollProvider, usePayroll } from './context/PayrollContext';
import { SidebarProvider } from './context/SidebarContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { VIEW_NAVIGATION } from './components/layout/navigation';

// Views
import { AuthView } from './views/AuthView';
import { Toaster } from './components/ui/Toaster';
import { AccountSetupView } from './views/AccountSetupView';
import { DashboardView } from './views/DashboardView';
import { RunPayrollWizardView } from './views/RunPayrollWizardView';
import { EmployeesView } from './views/EmployeesView';
import { EmployeeDetailView } from './views/EmployeeDetailView';
import { AttendanceView } from './views/AttendanceView';
import { PayslipsView } from './views/PayslipsView';
import { ReportsView } from './views/ReportsView';
import { ComplianceSettingsView } from './views/ComplianceSettingsView';
import { HelpView } from './views/HelpView';
import { AddEmployeeView } from './views/AddEmployeeView';
import { BookkeepingView } from './views/BookkeepingView';
import { ClockInView } from './views/ClockInView';
import { CrmWorkspaceView } from './views/crm/CrmWorkspaceView';
import { EmailMarketingView } from './views/emails/EmailMarketingView';
import { OrganizationSettingsView } from './views/OrganizationSettingsView';
import { Card } from './components/ui/Card';
import { cn } from './utils/cn';

const Unavailable: React.FC<{ title: string; detail: string }> = ({ title, detail }) => (
  <Card className="max-w-xl mx-auto mt-10">
    <div role="status" className="space-y-2">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  </Card>
);

const MainContent: React.FC = () => {
  const { currentView } = usePayroll();
  const { theme } = useTheme();
  const { navigationEntry, accessLoaded } = useAuth();

  const renderView = () => {
    if (!accessLoaded) {
      return (
        <Unavailable
          title="Your permissions for this workspace couldn't be loaded"
          detail="Refresh the page. If this keeps happening, the server may be running an older version; ask your administrator to restart it."
        />
      );
    }
    // What a member may open comes from their role's permissions, decided by
    // the server; the API refuses the same things if a view is reached anyway.
    const entry = navigationEntry(VIEW_NAVIGATION[currentView] ?? 'dashboard');
    if (!entry) {
      return (
        <Unavailable
          title="You don't have access to this area"
          detail="Your role doesn't include it. Choose another item from the menu, or ask a workspace administrator for access."
        />
      );
    }
    if (!entry.moduleEnabled) {
      return (
        <Unavailable
          title={`${entry.moduleName ?? 'This module'} is turned off for this workspace`}
          detail="An administrator can turn it on in Organization & Settings → Modules & Apps."
        />
      );
    }

    switch (currentView) {
      case 'dashboard':       return <DashboardView />;
      case 'crm':             return <CrmWorkspaceView />;
      case 'emails':          return <EmailMarketingView />;
      case 'organization':    return <OrganizationSettingsView initialTab="organization" />;
      case 'users':           return <OrganizationSettingsView initialTab="users" />;
      case 'payroll':         return <RunPayrollWizardView />;
      case 'people':          return <EmployeesView />;
      case 'add-employee':    return <AddEmployeeView />;
      case 'edit-employee':   return <AddEmployeeView />;
      case 'employee-detail': return <EmployeeDetailView />;
      case 'attendance':      return <AttendanceView />;
      case 'clock-in':        return <ClockInView />;
      case 'payslips':        return <PayslipsView />;
      case 'bookkeeping':     return <BookkeepingView />;
      case 'reports':         return <ReportsView />;
      case 'settings':        return <ComplianceSettingsView />;
      case 'help':            return <HelpView />;
      default:                return <DashboardView />;
    }
  };

  return (
    <div
      className={cn(
        'h-screen max-h-screen flex font-sans overflow-hidden relative transition-colors duration-200',
        theme === 'dark' ? 'bg-[#0c0b14] text-slate-100' : 'bg-[#F8F9FC] text-slate-900',
      )}
      data-theme={theme}
    >
      {/* Desktop sidebar with smooth slide */}
      <Sidebar />

      {/* Main area */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 h-full max-h-screen overflow-hidden transition-all duration-300 ease-in-out',
          theme === 'dark' ? 'bg-[#0c0b14]' : 'bg-[#F8F9FC]',
        )}
      >
        {/* Mobile topbar */}
        <Header />

        <main
          className={cn(
            'flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-y-auto overflow-x-hidden min-h-0',
            theme === 'dark' ? 'bg-[#0c0b14]' : 'bg-[#F8F9FC]',
          )}
        >
          {renderView()}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
};

/**
 * The one-time token of an emailed setup link (`#setup=<token>`), read once
 * and removed from the address bar so it is not left in history or bookmarks.
 * Cached, because development mode runs state initialisers twice.
 */
let setupTokenFromLink: string | null | undefined;
function takeSetupToken(): string | null {
  if (setupTokenFromLink === undefined) {
    const match = window.location.hash.match(/^#setup=([A-Za-z0-9_-]{43})$/);
    setupTokenFromLink = match ? match[1] : null;
    if (match) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return setupTokenFromLink;
}

const AppRouter: React.FC = () => {
  const { isAuthenticated, isLoading, activeTenant } = useAuth();
  const [setupToken, setSetupToken] = React.useState<string | null>(takeSetupToken);
  const [signInEmail, setSignInEmail] = React.useState<string | undefined>(undefined);

  if (setupToken) {
    return (
      <AccountSetupView
        token={setupToken}
        onDone={(email) => {
          setupTokenFromLink = null;
          setSetupToken(null);
          setSignInEmail(email ?? undefined);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface dark:bg-[#0F0E17] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-[3px] border-teal-100 border-t-teal-500 rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Loading Payroll…
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView initialEmail={signInEmail} />;
  }

  // Keyed by workspace: switching tenants remounts every view and context, so
  // nothing loaded for the previous workspace can stay on screen.
  return (
    <PayrollProvider key={activeTenant?.tenantId}>
      <SidebarProvider>
        <MainContent />
      </SidebarProvider>
    </PayrollProvider>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TextSizeProvider>
          <I18nProvider>
            <AppRouter />
            <Toaster />
          </I18nProvider>
        </TextSizeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
