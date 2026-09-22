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

// Views
import { AuthView } from './views/AuthView';
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
import { SuperAdminDashboardView } from './views/super-admin/SuperAdminDashboardView';
import { CrmWorkspaceView } from './views/crm/CrmWorkspaceView';
import { EmailMarketingView } from './views/emails/EmailMarketingView';
import { OrganizationSettingsView } from './views/OrganizationSettingsView';
import { cn } from './utils/cn';

const MainContent: React.FC = () => {
  const { currentView, role } = usePayroll();
  const { theme } = useTheme();

  const renderView = () => {
    // Employee role — restricted views
    if (role === 'EMPLOYEE') {
      if (currentView === 'attendance') return <AttendanceView />;
      if (currentView === 'clock-in') return <ClockInView />;
      if (currentView === 'payslips') return <PayslipsView />;
      if (currentView === 'help') return <HelpView />;
      return <DashboardView />;
    }

    switch (currentView) {
      case 'dashboard':       return <DashboardView />;
      case 'crm':             return <CrmWorkspaceView />;
      case 'emails':          return <EmailMarketingView />;
      case 'organization':    return <OrganizationSettingsView initialTab="organization" />;
      case 'users':           return <OrganizationSettingsView initialTab="users" />;
      case 'super-admin':     return <SuperAdminDashboardView />;
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

const AppRouter: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

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
    return <AuthView />;
  }

  return (
    <PayrollProvider>
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
          </I18nProvider>
        </TextSizeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
