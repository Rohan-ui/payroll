import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  Globe,
  Receipt,
  Package,
  Ticket,
  Layout,
  FileText,
  BarChart3,
  Activity,
  LifeBuoy,
  Sliders,
  User,
  Bot,
  Lock,
  KeyRound,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { usePlatformAuth } from '../context/PlatformAuthContext';
import { TenantDirectoryView } from './TenantDirectoryView';
import { PlatformAccountSecurityView } from './PlatformAccountSecurityView';
import { UserDirectoryView } from './UserDirectoryView';
import { readHashRoute } from '../hash-route';
import { ThemeSwitch } from '../theme/ThemeSwitch';

import { CommandCentreView } from './CommandCentreView';
import { DomainsView } from './DomainsView';
import { RoleTemplatesView } from './RoleTemplatesView';
import { BillingCentreView } from './BillingCentreView';
import { SubscriptionsView } from './SubscriptionsView';
import { InvoicesView } from './InvoicesView';
import { PackagesView } from './PackagesView';
import { CouponsView } from './CouponsView';
import { WebsiteSettingsView } from './WebsiteSettingsView';
import { ActivityLogView } from './ActivityLogView';
import { SupportTicketsView } from './SupportTicketsView';
import { SecurityView } from './SecurityView';
import { GlobalSettingsView } from './GlobalSettingsView';
import { ProfileView } from './ProfileView';
import { FormsView, HqCopilotView, SeoAnalyticsView, TransactionsView } from './UnavailableViews';

export type PlatformTab =
  | 'overview'
  | 'assistant'
  | 'tenants'
  | 'subscriptions'
  | 'invoices'
  | 'transactions'
  | 'users'
  | 'domains'
  | 'billing'
  | 'packages'
  | 'coupons'
  | 'website'
  | 'forms'
  | 'seo'
  | 'activity'
  | 'support'
  | 'security'
  | 'roles'
  | 'settings'
  | 'profile'
  | 'account-security';

interface NavItem {
  id: PlatformTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Executive suite',
    items: [
      { id: 'overview', label: 'Command centre', icon: LayoutDashboard },
      { id: 'assistant', label: 'HQ copilot', icon: Bot, badge: 'AI' },
    ],
  },
  {
    title: 'Tenants & operations',
    items: [
      { id: 'tenants', label: 'Tenant workspaces', icon: Building2 },
      { id: 'users', label: 'User management', icon: Users },
      { id: 'domains', label: 'Domains & DNS', icon: Globe },
      { id: 'roles', label: 'Role templates', icon: ShieldCheck },
    ],
  },
  {
    title: 'Commercials',
    items: [
      { id: 'billing', label: 'Billing centre', icon: Receipt },
      { id: 'subscriptions', label: 'Subscriptions', icon: Receipt },
      { id: 'invoices', label: 'Invoices', icon: FileText },
      { id: 'transactions', label: 'Transactions', icon: BarChart3 },
      { id: 'packages', label: 'Packages & tiers', icon: Package },
      { id: 'coupons', label: 'Coupons', icon: Ticket },
    ],
  },
  {
    title: 'Website & marketing',
    items: [
      { id: 'website', label: 'CMS & SEO', icon: Layout },
      { id: 'forms', label: 'Form builder', icon: FileText },
      { id: 'seo', label: 'SEO analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Governance',
    items: [
      { id: 'activity', label: 'Activity log', icon: Activity },
      { id: 'support', label: 'Support tickets', icon: LifeBuoy },
      { id: 'security', label: 'Security & integrity', icon: Lock },
    ],
  },
  {
    title: 'Headquarters',
    items: [
      { id: 'settings', label: 'Global settings', icon: Sliders },
      { id: 'account-security', label: 'My account security', icon: KeyRound },
      { id: 'profile', label: 'My profile', icon: User },
    ],
  },
];

const TAB_TITLES: Record<PlatformTab, string> = NAV_SECTIONS.reduce(
  (titles, section) => {
    section.items.forEach((item) => {
      titles[item.id] = item.label;
    });
    return titles;
  },
  {} as Record<PlatformTab, string>,
);

const renderTab = (tab: PlatformTab): React.ReactNode => {
  switch (tab) {
    case 'overview':         return <CommandCentreView />;
    case 'assistant':        return <HqCopilotView />;
    case 'tenants':          return <TenantDirectoryView />;
    case 'users':            return <UserDirectoryView />;
    case 'domains':          return <DomainsView />;
    case 'roles':            return <RoleTemplatesView />;
    case 'billing':          return <BillingCentreView />;
    case 'subscriptions':    return <SubscriptionsView />;
    case 'invoices':         return <InvoicesView />;
    case 'transactions':     return <TransactionsView />;
    case 'packages':         return <PackagesView />;
    case 'coupons':          return <CouponsView />;
    case 'website':          return <WebsiteSettingsView />;
    case 'forms':            return <FormsView />;
    case 'seo':              return <SeoAnalyticsView />;
    case 'activity':         return <ActivityLogView />;
    case 'support':          return <SupportTicketsView />;
    case 'security':         return <SecurityView />;
    case 'settings':         return <GlobalSettingsView />;
    case 'account-security': return <PlatformAccountSecurityView />;
    case 'profile':          return <ProfileView />;
    default:                 return <CommandCentreView />;
  }
};

/** Reads the tab from the address bar (`#tab` or `#tab/<id>`) so console sections are linkable. */
const tabFromHash = (): PlatformTab => {
  const candidate = readHashRoute().section as PlatformTab;
  return candidate in TAB_TITLES ? candidate : 'overview';
};

export const PlatformConsoleView: React.FC = () => {
  const { admin, signOut } = usePlatformAuth();
  const [activeTab, setActiveTab] = useState<PlatformTab>(tabFromHash);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const syncFromHash = () => setActiveTab(tabFromHash());
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    document.title = `${TAB_TITLES[activeTab]} — Voogyo Platform HQ`;
  }, [activeTab]);

  const selectTab = (tab: PlatformTab) => {
    window.location.hash = tab;
    setActiveTab(tab);
    setIsNavOpen(false);
    // Move focus to the section heading so keyboard users land in the content.
    window.requestAnimationFrame(() => headingRef.current?.focus());
  };

  const navigation = (
    <nav aria-label="Platform sections" className="space-y-5">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="px-3 text-[10px] font-bold uppercase tracking-wider text-hq-subtle-foreground mb-1.5">
            {section.title}
          </h2>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => selectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring ${
                      isActive
                        ? 'bg-hq-primary text-hq-primary-foreground'
                        : 'text-hq-muted-foreground hover:text-hq-foreground hover:bg-hq-accent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${isActive ? 'text-hq-primary-foreground' : 'text-hq-subtle-foreground'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-black rounded-full shrink-0 ${
                          isActive ? 'bg-hq-primary-hover text-hq-primary-foreground' : 'bg-hq-primary/15 text-hq-link'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-hq-background text-hq-foreground flex flex-col">
      <a
        href="#platform-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-hq-primary focus:text-hq-primary-foreground focus:text-sm focus:font-bold"
      >
        Skip to content
      </a>

      <header className="h-16 border-b border-hq-border bg-hq-card sticky top-0 z-30">
        <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsNavOpen((open) => !open)}
              aria-expanded={isNavOpen}
              aria-controls="platform-nav"
              aria-label={isNavOpen ? 'Close navigation' : 'Open navigation'}
              className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg border border-hq-border text-hq-foreground/90 hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
            >
              {isNavOpen ? (
                <X className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Menu className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <div className="w-9 h-9 rounded-xl bg-hq-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-hq-foreground" aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-black tracking-tight truncate">Voogyo Platform HQ</p>
              <p className="text-[11px] text-hq-subtle-foreground truncate">
                Multi-tenant governance and licensing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden lg:block">
              <ThemeSwitch />
            </div>
            <div className="lg:hidden">
              <ThemeSwitch compact />
            </div>
            <div className="hidden sm:block text-right min-w-0">
              <p className="text-xs font-bold truncate max-w-[14rem]">{admin?.displayName}</p>
              <p className="text-[11px] text-hq-subtle-foreground truncate max-w-[14rem]">{admin?.role}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                setIsSigningOut(true);
                await signOut();
              }}
              disabled={isSigningOut}
              className="inline-flex items-center gap-2 px-3 h-9 text-xs font-bold rounded-lg border border-hq-border text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        <aside
          id="platform-nav"
          className={`${isNavOpen ? 'block' : 'hidden'} lg:block w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-hq-border bg-hq-card p-3 lg:sticky lg:top-16 lg:self-start lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto overscroll-contain`}
        >
          {navigation}
        </aside>

        <main id="platform-content" className="flex-1 min-w-0 p-4 sm:p-6 overflow-x-hidden">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-bold tracking-tight mb-5 focus:outline-none"
          >
            {TAB_TITLES[activeTab]}
          </h1>
          {renderTab(activeTab)}
        </main>
      </div>
    </div>
  );
};
