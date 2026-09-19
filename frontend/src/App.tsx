import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TextSizeProvider } from './context/TextSizeContext';
import { I18nProvider } from './i18n/I18nContext';
import { PayrollProvider, usePayroll } from './context/PayrollContext';
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

const MainContent: React.FC = () => {
  const { currentView, role } = usePayroll();

  const renderView = () => {
    // Employee role — restricted views
    if (role === 'EMPLOYEE') {
      if (currentView === 'payslips') return <PayslipsView />;
      if (currentView === 'help') return <HelpView />;
      return <DashboardView />;
    }

    switch (currentView) {
      case 'dashboard':       return <DashboardView />;
      case 'payroll':         return <RunPayrollWizardView />;
      case 'people':          return <EmployeesView />;
      case 'employee-detail': return <EmployeeDetailView />;
      case 'attendance':      return <AttendanceView />;
      case 'payslips':        return <PayslipsView />;
      case 'reports':         return <ReportsView />;
      case 'settings':        return <ComplianceSettingsView />;
      case 'help':            return <HelpView />;
      default:                return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-surface flex font-sans">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <Header />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-y-auto">
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
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center">
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
      <MainContent />
    </PayrollProvider>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <TextSizeProvider>
        <I18nProvider>
          <AppRouter />
        </I18nProvider>
      </TextSizeProvider>
    </AuthProvider>
  );
};

export default App;
