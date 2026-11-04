import type React from 'react';
import {
  LayoutDashboard,
  Target,
  Sparkles,
  Kanban,
  ListChecks,
  Mail,
  Clock,
  FileText,
  MessageSquare,
  BarChart2,
  Settings2,
  ShieldCheck,
  Building2,
  Contact,
  Users,
  CalendarDays,
  Landmark,
  Banknote,
  BookOpen,
  Settings,
  HelpCircle,
  UserPlus,
  UserMinus,
  Award,
} from 'lucide-react';
import type { NavigationEntry } from '../../api/auth.api';
import type { AppView, CrmTab } from '../../types/payroll.types';

/**
 * How each server navigation id is drawn and which view it opens. Which items
 * a member sees, their labels, their grouping under business modules and their
 * order all come from the server (access.navigation, built from the backend
 * access catalog); nothing here decides access or structure. A group has no
 * view of its own and opens its first item.
 */
export interface NavPresentation {
  icon: React.ElementType;
  view?: AppView;
  tab?: CrmTab;
  badge?: string;
  hasPlus?: boolean;
}

export const NAV_PRESENTATION: Record<string, NavPresentation> = {
  dashboard: { icon: LayoutDashboard, view: 'dashboard' },
  crm: { icon: Target },
  'crm.cold-funnel': { icon: Sparkles, view: 'crm', tab: 'cold-funnel', badge: '30D', hasPlus: true },
  'crm.pipeline': { icon: Kanban, view: 'crm', tab: 'pipeline', hasPlus: true },
  'crm.leads': { icon: ListChecks, view: 'crm', tab: 'leads' },
  'crm.emails': { icon: Mail, view: 'emails', badge: 'New', hasPlus: true },
  'crm.activities': { icon: Clock, view: 'crm', tab: 'activities', hasPlus: true },
  'crm.proposals': { icon: FileText, view: 'crm', tab: 'proposals', hasPlus: true },
  'crm.whatsapp': { icon: MessageSquare, view: 'crm', tab: 'whatsapp', hasPlus: true },
  'crm.reports': { icon: BarChart2, view: 'crm', tab: 'reports' },
  'crm.audit-trail': { icon: ShieldCheck, view: 'crm', tab: 'audit-trail' },
  'crm.masters': { icon: Settings2, view: 'crm', tab: 'masters' },

  organization: { icon: Building2, view: 'organization' },
  hrms: { icon: Contact },
  people: { icon: Users, view: 'people' },
  attendance: { icon: CalendarDays, view: 'attendance' },
  onboarding: { icon: UserPlus, view: 'onboarding' },
  offboarding: { icon: UserMinus, view: 'offboarding' },
  performance: { icon: Award, view: 'performance' },
  finance: { icon: Landmark },
  payroll: { icon: Banknote, view: 'payroll' },
  payslips: { icon: FileText, view: 'payslips' },
  bookkeeping: { icon: BookOpen, view: 'bookkeeping' },
  reports: { icon: BarChart2, view: 'reports' },
  settings: { icon: Settings, view: 'settings' },
  help: { icon: HelpCircle, view: 'help' },
};

/**
 * The navigation item each view belongs to. App refuses a view whose item the
 * member may not open, and the sidebar highlights it.
 */
export const VIEW_NAVIGATION: Record<string, string> = {
  dashboard: 'dashboard',
  crm: 'crm',
  emails: 'crm.emails',
  organization: 'organization',
  users: 'organization',
  people: 'people',
  'add-employee': 'people',
  'edit-employee': 'people',
  'employee-detail': 'people',
  payroll: 'payroll',
  attendance: 'attendance',
  'clock-in': 'attendance',
  onboarding: 'onboarding',
  offboarding: 'offboarding',
  performance: 'performance',
  payslips: 'payslips',
  bookkeeping: 'bookkeeping',
  reports: 'reports',
  settings: 'settings',
  help: 'help',
};

/** The sidebar item for what is on screen; each CRM tab is an item of its own. */
export function currentNavigationId(view: AppView, crmTab: CrmTab): string {
  return view === 'crm' ? `crm.${crmTab}` : (VIEW_NAVIGATION[view] ?? 'dashboard');
}

export interface SidebarItem {
  entry: NavigationEntry;
  presentation: NavPresentation;
  /** A group's items in server order; empty for a plain item. */
  children: SidebarItem[];
}

/**
 * Arranges the server's entries into the sidebar: top-level items in order,
 * each group holding its items. Items whose module is switched off are left
 * out, and so is a group left with nothing to open.
 */
export function sidebarTree(entries: readonly NavigationEntry[]): SidebarItem[] {
  const crmItem = entries.find((e) => e.id === 'crm' || e.parent === 'crm');
  const augmented: NavigationEntry[] = [...entries];
  if (crmItem && !augmented.some((e) => e.id === 'crm.whatsapp')) {
    const idx = augmented.findIndex((e) => e.id === 'crm.proposals');
    const whatsappEntry: NavigationEntry = {
      id: 'crm.whatsapp' as any,
      label: 'WhatsApp Templates',
      parent: 'crm' as any,
      module: 'CRM' as any,
      moduleName: 'CRM',
      moduleEnabled: crmItem.moduleEnabled,
    };
    if (idx !== -1) {
      augmented.splice(idx + 1, 0, whatsappEntry);
    } else {
      augmented.push(whatsappEntry);
    }
  }

  const shown = augmented.filter((entry) => entry.moduleEnabled && NAV_PRESENTATION[entry.id]);
  const toItem = (entry: NavigationEntry): SidebarItem => ({
    entry,
    presentation: NAV_PRESENTATION[entry.id],
    children: shown.filter((child) => child.parent === entry.id).map(toItem),
  });

  return shown
    .filter((entry) => entry.parent === null)
    .map(toItem)
    .filter((item) => item.presentation.view !== undefined || item.children.length > 0);
}
