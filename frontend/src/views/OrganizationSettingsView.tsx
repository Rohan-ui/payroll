import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EmailPolicyPanel } from './settings/EmailPolicyPanel';
import { 
  Users, UserPlus, Search, ShieldCheck, Mail,
  Building2, Edit3, Trash2, CheckCircle2, X, RefreshCw,
  Check, AlertCircle, Layers,
  Plus, Eye, EyeOff, Cpu, HardDrive,
  MessageSquare, Server, Globe, Save, Smartphone, Radio, Copy, FileText, Briefcase, FileCheck, ChevronDown, Loader2, Lock
} from 'lucide-react';

import LeadIntegrationsCenter from '@/components/crm/LeadIntegrationsCenter';
import IndustriesMaster from '@/components/crm/IndustriesMaster';
import { DocumentsView } from './documents/DocumentsView';
import { DocumentTypesMaster } from './settings/DocumentTypesMaster';
import { PhoneInputWithCountryCode } from '@/components/crm/PhoneInputWithCountryCode';
import { EmploymentTypesMaster } from './settings/EmploymentTypesMaster';
import { WorkflowBuilderView } from './onboarding/workflow-builder/WorkflowBuilderView';

import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { WorkspaceModule } from '../api/auth.api';

type SettingsTab =
  | 'organization'
  | 'users'
  | 'roles'
  | 'modules'
  | 'documents'
  | 'employment-types'
  | 'document-types'
  | 'onboarding-workflow'
  | 'integrations'
  | 'industries';

export interface OrganizationSettingsViewProps {
  initialTab?: SettingsTab;
}

interface OrgProfileForm {
  company_name: string;
  industry_type: string;
  currency: string;
  timezone: string;
  tax_gstin: string;
  website_url: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  company_address: string;
}

interface WorkspaceInfo {
  id: string;
  tenant_code: string;
  subdomain: string;
  legal_name: string;
  contact_is_workspace_owner: boolean;
}

interface TenantQuotas {
  user_seats_limit: number;
  branch_limit: number;
  storage_limit_mb: number;
  monthly_ai_tokens: number;
  monthly_whatsapp_credits: number;
}

interface SmtpForm {
  host: string;
  port: number;
  username: string;
  password: string;
  hasPassword: boolean;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  encryption: 'TLS' | 'SSL' | 'NONE';
  isActive: boolean;
}

interface WhatsAppForm {
  provider: string;
  apiBaseUrl?: string;
  vendorUid?: string;
  wabaId: string;
  phoneNumberId: string;
  senderPhoneNumber: string;
  accessToken: string;
  hasAccessToken: boolean;
  webhookVerifyToken: string;
  hasWebhookVerifyToken: boolean;
  isActive: boolean;
}

interface SettingsPayload {
  tenant: WorkspaceInfo & Record<keyof OrgProfileForm, string | null>;
  smtp: (Omit<SmtpForm, 'password'> & { username: string | null; senderName: string | null; senderEmail: string | null; replyToEmail: string | null }) | null;
  whatsapp: (Omit<WhatsAppForm, 'accessToken' | 'webhookVerifyToken'> & { wabaId: string | null; senderPhoneNumber: string | null }) | null;
  quotas: TenantQuotas | null;
}

interface TeamMember {
  id: string;
  member_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role_id: string | null;
  role_code: string | null;
  role_name: string | null;
  membership_status: 'ACTIVE' | 'SUSPENDED';
  is_active: boolean;
  employee_code: string | null;
  employee_status: string | null;
}

/** Active in the workspace and, when linked to an employee, an active employee. */
const isActiveMember = (u: TeamMember) => u.is_active && (u.employee_status === null || u.employee_status === 'ACTIVE');

/** An active HRMS employee who has no sign-in yet. */
interface EmployeeWithoutSignIn {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface RoleOption {
  id: string;
  code: string;
  name: string;
  is_admin: boolean;
}

/** From GET /users: the server says which roles this member may assign. */
interface AssignableRoleOption extends RoleOption {
  assignable: boolean;
}

interface TenantRole extends RoleOption {
  description: string | null;
  is_system: boolean;
  users_count: number;
  permissions: string[];
}

/** From GET /permissions: the catalog grouped by sidebar section, then feature. */
interface PermissionSection {
  section: string;
  module: WorkspaceModule | null;
  groups: { group: string; permissions: { key: string; name: string }[] }[];
}

interface ModuleCard {
  id: WorkspaceModule;
  name: string;
  description: string;
  /** The screens this switch hides and whose API it refuses, as the server defines the module. */
  features: string[];
  requires: WorkspaceModule[];
  is_enabled: boolean;
}

interface ModulesPayload {
  tenant: {
    plan_name: string | null;
    plan_code: string | null;
    seats_used: number;
    max_seats: number | null;
    storage_limit_mb: number | null;
    monthly_ai_token_quota: number | null;
  };
  modules: ModuleCard[];
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string | string[];
  error?: string;
}

/** Reads an API response, treating both HTTP errors and `{ success: false }` as failures. */
/** A checkbox that also shows "some selected" (indeterminate), for select-all controls. */
function TriStateCheckbox({ checked, indeterminate, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} aria-checked={indeterminate ? 'mixed' : checked} {...rest} />;
}

async function readResponse<T>(response: Response): Promise<{ ok: boolean; data?: T; message?: string }> {
  let body: ApiEnvelope<T> = {};
  try {
    body = await response.json();
  } catch {
    // A non-JSON error page carries no usable message.
  }
  const raw = body.message ?? body.error;
  return {
    ok: response.ok && body.success !== false,
    data: body.data,
    message: Array.isArray(raw) ? raw.join(' ') : raw,
  };
}

const EMPTY_PROFILE: OrgProfileForm = {
  company_name: '',
  industry_type: '',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  tax_gstin: '',
  website_url: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
  company_address: '',
};

const EMPTY_SMTP: SmtpForm = {
  host: '',
  port: 587,
  username: '',
  password: '',
  hasPassword: false,
  senderName: '',
  senderEmail: '',
  replyToEmail: '',
  encryption: 'TLS',
  isActive: true,
};

const EMPTY_WHATSAPP: WhatsAppForm = {
  provider: 'OTOMAT',
  apiBaseUrl: 'https://otomat.in/api',
  vendorUid: '',
  wabaId: '',
  phoneNumberId: '',
  senderPhoneNumber: '',
  accessToken: '',
  hasAccessToken: false,
  webhookVerifyToken: '',
  hasWebhookVerifyToken: false,
  isActive: true,
};

const EMPTY_MEMBER_FORM = { first_name: '', last_name: '', email: '', phone: '', role_id: '', is_active: true, employee_id: '' };

/** Sections grouped by the job the admin is doing, in sidebar order. */
const TAB_GROUPS: { label: string; tabs: SettingsTab[] }[] = [
  { label: 'Workspace', tabs: ['organization', 'modules', 'employment-types'] },
  { label: 'People & access', tabs: ['users', 'roles'] },
  { label: 'Hiring & documents', tabs: ['documents', 'document-types', 'onboarding-workflow'] },
  { label: 'CRM', tabs: ['integrations', 'industries'] },
];

const TAB_ORDER: SettingsTab[] = [
  'organization',
  'users',
  'roles',
  'modules',
  'documents',
  'employment-types',
  'onboarding-workflow',
  'integrations',
  'industries',
];

export const OrganizationSettingsView: React.FC<OrganizationSettingsViewProps> = ({ initialTab: propInitialTab }) => {
  const { can, accessLoaded, isModuleEnabled, refreshAccess, user } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (propInitialTab) return propInitialTab;
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab && (TAB_ORDER as string[]).includes(tab)) return tab as SettingsTab;
    } catch {
      // Location is unavailable outside the browser.
    }
    return 'organization';
  });

  useEffect(() => {
    if (propInitialTab) {
      setActiveTab(propInitialTab);
    }
  }, [propInitialTab]);

  // What this member may see and do. The API enforces the same rules.
  const canViewOrg = can('organization.view');
  const canEditOrg = can('organization.update');
  const canViewUsers = can('users.view');
  const canCreateUsers = can('users.create');
  const canUpdateUsers = can('users.update');
  const canDeleteUsers = can('users.delete');
  const canViewRoles = can('roles.view');
  const canCreateRoles = can('roles.create');
  const canUpdateRoles = can('roles.update');
  const canDeleteRoles = can('roles.delete');
  const canViewPermissions = can('permissions.view');
  const canViewModules = can('modules.view');
  const canUpdateModules = can('modules.update');
  const crmEnabled = isModuleEnabled('CRM');

  const visibleTabs = TAB_ORDER.filter((tab) => {
    if (tab === 'organization') return canViewOrg;
    if (tab === 'users') return canViewUsers;
    if (tab === 'roles') return canViewRoles;
    if (tab === 'modules') return canViewModules;
    if (tab === 'documents') return can('documents.view');
    if (tab === 'employment-types') return canViewOrg;
    if (tab === 'onboarding-workflow') return canViewOrg || can('onboarding.candidates.manage');
    if (tab === 'industries') return crmEnabled && can('masters.industries.view');
    return crmEnabled && canViewOrg;
  });
  const currentTab: SettingsTab | null = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0] ?? null;

  useEffect(() => {
    if (!currentTab) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') === currentTab) return;
    url.searchParams.set('tab', currentTab);
    window.history.replaceState(window.history.state, '', url);
  }, [currentTab]);

  // Data
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [roleOptions, setRoleOptions] = useState<AssignableRoleOption[]>([]);
  const [employeesWithoutSignIn, setEmployeesWithoutSignIn] = useState<EmployeeWithoutSignIn[]>([]);
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionSection[]>([]);
  const [modulesData, setModulesData] = useState<ModulesPayload | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [orgProfile, setOrgProfile] = useState<OrgProfileForm>(EMPTY_PROFILE);
  const [smtpSettings, setSmtpSettings] = useState<SmtpForm>(EMPTY_SMTP);
  const [whatsAppSettings, setWhatsAppSettings] = useState<WhatsAppForm>(EMPTY_WHATSAPP);
  const [tenantQuotas, setTenantQuotas] = useState<TenantQuotas | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<Partial<Record<'settings' | 'users' | 'roles' | 'modules', string>>>({});
  const [accessRetry, setAccessRetry] = useState<'idle' | 'retrying' | 'failed'>('idle');

  // Feedback
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsAppTestResult, setWhatsAppTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showWhatsAppToken, setShowWhatsAppToken] = useState(false);
  const [togglingModule, setTogglingModule] = useState<WorkspaceModule | null>(null);
  const [pendingPermission, setPendingPermission] = useState<string | null>(null);

  // Team filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');

  // Roles
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [showGrantedOnly, setShowGrantedOnly] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleData, setNewRoleData] = useState({ name: '', code: '', description: '' });
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<TenantRole | null>(null);

  // Team member modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<TeamMember | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState(EMPTY_MEMBER_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [issuedCredential, setIssuedCredential] = useState<{ email: string; temporaryPassword: string } | null>(null);

  // In-app toast for transient confirmations; failures are also shown in context.
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const applySettings = (data: SettingsPayload) => {
    const t = data.tenant;
    setWorkspace({
      id: t.id,
      tenant_code: t.tenant_code,
      subdomain: t.subdomain,
      legal_name: t.legal_name,
      contact_is_workspace_owner: t.contact_is_workspace_owner,
    });
    setOrgProfile({
      company_name: t.company_name ?? '',
      industry_type: t.industry_type ?? '',
      currency: t.currency ?? 'INR',
      timezone: t.timezone ?? 'Asia/Kolkata',
      tax_gstin: t.tax_gstin ?? '',
      website_url: t.website_url ?? '',
      primary_contact_name: t.primary_contact_name ?? '',
      primary_contact_email: t.primary_contact_email ?? '',
      primary_contact_phone: t.primary_contact_phone ?? '',
      company_address: t.company_address ?? '',
    });
    setTenantQuotas(data.quotas);
    setSmtpSettings(
      data.smtp
        ? {
            ...EMPTY_SMTP,
            host: data.smtp.host,
            port: data.smtp.port,
            username: data.smtp.username ?? '',
            hasPassword: data.smtp.hasPassword,
            senderName: data.smtp.senderName ?? '',
            senderEmail: data.smtp.senderEmail ?? '',
            replyToEmail: data.smtp.replyToEmail ?? '',
            encryption: data.smtp.encryption,
            isActive: data.smtp.isActive,
          }
        : EMPTY_SMTP,
    );
    setWhatsAppSettings(
      data.whatsapp
        ? {
            ...EMPTY_WHATSAPP,
            provider: data.whatsapp.provider || 'OTOMAT',
            apiBaseUrl: (data.whatsapp as any).apiBaseUrl ?? 'https://otomat.in/api',
            vendorUid: (data.whatsapp as any).vendorUid ?? '',
            wabaId: data.whatsapp.wabaId ?? '',
            phoneNumberId: data.whatsapp.phoneNumberId ?? '',
            senderPhoneNumber: data.whatsapp.senderPhoneNumber ?? '',
            hasAccessToken: data.whatsapp.hasAccessToken,
            hasWebhookVerifyToken: data.whatsapp.hasWebhookVerifyToken,
            isActive: data.whatsapp.isActive,
          }
        : EMPTY_WHATSAPP,
    );
  };

  // Loads only what this member may see; every request is scoped to the session's workspace by the API.
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const errors: Partial<Record<'settings' | 'users' | 'roles' | 'modules', string>> = {};

    const load = async <T,>(
      key: 'settings' | 'users' | 'roles' | 'modules',
      url: string,
      apply: (data: T) => void,
      fallback: string,
    ) => {
      try {
        const result = await readResponse<T>(await apiFetch(url));
        if (result.ok && result.data !== undefined) {
          apply(result.data);
        } else {
          errors[key] = result.message || fallback;
        }
      } catch {
        errors[key] = fallback;
      }
    };

    await Promise.all([
      canViewOrg
        ? load<SettingsPayload>('settings', '/api/v1/tenant/settings', applySettings, 'Could not load organization settings.')
        : Promise.resolve(),
      canViewUsers
        ? load<{ users: TeamMember[]; roles: AssignableRoleOption[]; employeesWithoutSignIn?: EmployeeWithoutSignIn[] }>('users', '/api/v1/users', (data) => {
            setUsers(data.users);
            setRoleOptions(data.roles);
            setEmployeesWithoutSignIn(data.employeesWithoutSignIn ?? []);
          }, 'Could not load team members.')
        : Promise.resolve(),
      canViewRoles
        ? load<{ roles: TenantRole[] }>('roles', '/api/v1/tenant/roles', (data) => setRoles(data.roles), 'Could not load roles.')
        : Promise.resolve(),
      canViewPermissions
        ? load<PermissionSection[]>('roles', '/api/v1/permissions', setPermissionCatalog, 'Could not load the permission list.')
        : Promise.resolve(),
      canViewModules
        ? load<ModulesPayload>('modules', '/api/v1/tenant/modules', setModulesData, 'Could not load workspace modules.')
        : Promise.resolve(),
    ]);

    setLoadErrors(errors);
    setLoading(false);
  }, [canViewOrg, canViewUsers, canViewRoles, canViewPermissions, canViewModules]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const send = (url: string, method: string, body?: unknown) =>
    apiFetch(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).then(readResponse);

  // Organization profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgProfile.company_name.trim()) {
      showToast('Company name is required', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const result = await send('/api/v1/tenant/settings/profile', 'PUT', orgProfile);
      if (result.ok) {
        showToast(result.message || 'Organization profile saved.');
        fetchAllData();
      } else {
        showToast(result.message || 'Could not save the organization profile.', 'error');
      }
    } catch {
      showToast('Could not reach the server. Your changes were not saved.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // SMTP
  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      const { hasPassword: _hasPassword, password, ...rest } = smtpSettings;
      const result = await send('/api/v1/tenant/settings/smtp', 'PUT', { ...rest, ...(password ? { password } : {}) });
      if (result.ok) {
        showToast(result.message || 'SMTP settings saved.');
        setSmtpSettings((prev) => ({ ...prev, password: '', hasPassword: prev.hasPassword || Boolean(password) }));
      } else {
        showToast(result.message || 'Could not save SMTP settings.', 'error');
      }
    } catch {
      showToast('Could not reach the server. SMTP settings were not saved.', 'error');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      // Without a newly typed password the server tests the saved configuration.
      const draft = smtpSettings.password
        ? {
            host: smtpSettings.host,
            port: smtpSettings.port,
            username: smtpSettings.username,
            password: smtpSettings.password,
            encryption: smtpSettings.encryption,
          }
        : {};
      const response = await apiFetch('/api/v1/tenant/settings/smtp/test', { method: 'POST', body: JSON.stringify(draft) });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string | string[];
        data?: { message?: string };
      };
      const success = response.ok && body.success === true;
      const failure = body.error ?? (Array.isArray(body.message) ? body.message.join(' ') : body.message);
      setSmtpTestResult({
        success,
        message: success ? body.data?.message || 'Connected.' : failure || 'The SMTP server could not be reached.',
      });
    } catch {
      setSmtpTestResult({ success: false, message: 'Could not reach the server to run the test.' });
    } finally {
      setTestingSmtp(false);
    }
  };

  // WhatsApp
  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWhatsApp(true);
    try {
      const { hasAccessToken, hasWebhookVerifyToken, accessToken, webhookVerifyToken, ...rest } = whatsAppSettings;
      const result = await send('/api/v1/tenant/settings/whatsapp', 'PUT', {
        ...rest,
        ...(accessToken ? { accessToken } : {}),
        ...(webhookVerifyToken ? { webhookVerifyToken } : {}),
      });
      if (result.ok) {
        showToast(result.message || 'WhatsApp settings saved.');
        setWhatsAppSettings((prev) => ({
          ...prev,
          accessToken: '',
          webhookVerifyToken: '',
          hasAccessToken: hasAccessToken || Boolean(accessToken),
          hasWebhookVerifyToken: hasWebhookVerifyToken || Boolean(webhookVerifyToken),
        }));
      } else {
        showToast(result.message || 'Could not save WhatsApp settings.', 'error');
      }
    } catch {
      showToast('Could not reach the server. WhatsApp settings were not saved.', 'error');
    } finally {
      setSavingWhatsApp(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWhatsAppTestResult(null);
    try {
      const draft: Record<string, any> = {
        provider: whatsAppSettings.provider,
        apiBaseUrl: whatsAppSettings.apiBaseUrl,
        vendorUid: whatsAppSettings.vendorUid,
        phoneNumberId: whatsAppSettings.phoneNumberId,
      };
      if (whatsAppSettings.accessToken) {
        draft.accessToken = whatsAppSettings.accessToken;
      }
      const response = await apiFetch('/api/v1/tenant/settings/whatsapp/test', { method: 'POST', body: JSON.stringify(draft) });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string | string[] };
      const success = response.ok && body.success === true;
      const text = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      setWhatsAppTestResult({
        success,
        message: success ? text || 'Connected.' : body.error || text || 'The WhatsApp API could not be reached.',
      });
    } catch {
      setWhatsAppTestResult({ success: false, message: 'Could not reach the server to run the test.' });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  // Team members
  const handleOpenAdd = (employee?: EmployeeWithoutSignIn) => {
    const assignable = roleOptions.filter((r) => r.assignable);
    setFormData({
      ...EMPTY_MEMBER_FORM,
      ...(employee && {
        employee_id: employee.id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email ?? '',
        phone: employee.phone ?? '',
      }),
      role_id: assignable.find((r) => !r.is_admin)?.id ?? assignable[0]?.id ?? '',
    });
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (member: TeamMember) => {
    setSelectedUserForEdit(member);
    setFormData({
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email,
      phone: member.phone ?? '',
      role_id: member.role_id ?? '',
      is_active: member.membership_status === 'ACTIVE',
      employee_id: '',
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await send('/api/v1/users', 'POST', {
        email: formData.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        role_id: formData.role_id,
        ...(formData.employee_id ? { employee_id: formData.employee_id } : {}),
      });
      const created = result.data as { email?: string; temporaryPassword?: string | null } | undefined;
      if (result.ok) {
        setShowAddModal(false);
        if (created?.temporaryPassword && created.email) {
          setIssuedCredential({ email: created.email, temporaryPassword: created.temporaryPassword });
        } else {
          showToast(result.message || 'Team member added.');
        }
        fetchAllData();
      } else {
        setFormError(result.message || 'Could not add this team member.');
      }
    } catch {
      setFormError('Could not reach the server. The team member was not added.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const isSelf = selectedUserForEdit.email === user?.email;
      const result = await send(`/api/v1/users/${selectedUserForEdit.id}`, 'PATCH', {
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        ...(isSelf ? {} : { role_id: formData.role_id || undefined, is_active: formData.is_active }),
      });
      if (result.ok) {
        showToast(result.message || 'Team member saved.');
        setShowEditModal(false);
        setSelectedUserForEdit(null);
        fetchAllData();
      } else {
        setFormError(result.message || 'Could not save this team member.');
      }
    } catch {
      setFormError('Could not reach the server. Changes were not saved.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    setSubmitting(true);
    try {
      const result = await send(`/api/v1/users/${deleteConfirmUser.id}`, 'DELETE');
      if (result.ok) {
        showToast(result.message || 'Team member removed.');
        setDeleteConfirmUser(null);
        fetchAllData();
      } else {
        showToast(result.message || 'Could not remove this team member.', 'error');
      }
    } catch {
      showToast('Could not reach the server. Nobody was removed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Roles and permissions: saved on the server before the checkbox changes.
  const handleTogglePermission = async (role: TenantRole, permissionKey: string, granted: boolean) => {
    setPendingPermission(permissionKey);
    try {
      const result = await send(`/api/v1/tenant/roles/${role.id}/permissions`, 'PUT', { permissionKey, granted });
      if (result.ok) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id === role.id
              ? { ...r, permissions: granted ? [...r.permissions, permissionKey] : r.permissions.filter((p) => p !== permissionKey) }
              : r,
          ),
        );
        showToast(result.message || 'Permission updated.');
      } else {
        showToast(result.message || 'Could not update this permission.', 'error');
      }
    } catch {
      showToast('Could not reach the server. The permission was not changed.', 'error');
    } finally {
      setPendingPermission(null);
    }
  };

  /** Grant or remove many permissions in one request; only keys this member holds and that would change. */
  const handleBulkPermissions = async (role: TenantRole, keys: string[], granted: boolean) => {
    const changing = keys.filter((key) => can(key) && role.permissions.includes(key) !== granted);
    if (changing.length === 0) return;
    setPendingPermission('__bulk__');
    try {
      const result = await send(`/api/v1/tenant/roles/${role.id}/permissions/bulk`, 'PUT', { permissionKeys: changing, granted });
      const updated = (result.data as { permissions?: string[] } | undefined)?.permissions;
      if (result.ok) {
        setRoles((prev) => prev.map((r) => (r.id === role.id
          ? { ...r, permissions: updated ?? (granted ? [...new Set([...r.permissions, ...changing])] : r.permissions.filter((k) => !changing.includes(k))) }
          : r)));
        showToast(result.message || 'Permissions updated.');
      } else {
        showToast(result.message || 'Could not update these permissions.', 'error');
      }
    } catch {
      showToast('Could not reach the server. The permissions were not changed.', 'error');
    } finally {
      setPendingPermission(null);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await send('/api/v1/tenant/roles', 'POST', newRoleData);
      if (result.ok) {
        showToast(result.message || `Role '${newRoleData.name}' created.`);
        setShowAddRoleModal(false);
        setNewRoleData({ name: '', code: '', description: '' });
        setSelectedRoleId((result.data as { id?: string } | undefined)?.id ?? null);
        fetchAllData();
      } else {
        setFormError(result.message || 'Could not create this role.');
      }
    } catch {
      setFormError('Could not reach the server. The role was not created.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteConfirmRole) return;
    setSubmitting(true);
    try {
      const result = await send(`/api/v1/tenant/roles/${deleteConfirmRole.id}`, 'DELETE');
      if (result.ok) {
        showToast(result.message || 'Role deleted.');
        setDeleteConfirmRole(null);
        setSelectedRoleId(null);
        fetchAllData();
      } else {
        showToast(result.message || 'Could not delete this role.', 'error');
      }
    } catch {
      showToast('Could not reach the server. The role was not deleted.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Modules
  const handleToggleModule = async (module: ModuleCard) => {
    setTogglingModule(module.id);
    try {
      const result = await send(`/api/v1/tenant/modules/${module.id}`, 'PUT', { enabled: !module.is_enabled });
      if (result.ok) {
        showToast(result.message || 'Module updated.');
        // Navigation and module gating read the refreshed switches.
        await Promise.all([fetchAllData(), refreshAccess()]);
      } else {
        showToast(result.message || 'Could not change this module.', 'error');
      }
    } catch {
      showToast('Could not reach the server. The module was not changed.', 'error');
    } finally {
      setTogglingModule(null);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Copied to clipboard.');
    } catch {
      showToast('Copy failed. Select the text and copy it manually.', 'error');
    }
  };

  const filteredUsers = users.filter((u) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
    const matchesRole = roleFilter === 'ALL' || u.role_code === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE') === isActiveMember(u);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const seatsUsed = modulesData?.tenant.seats_used ?? users.length;
  const maxSeats = tenantQuotas?.user_seats_limit ?? modulesData?.tenant.max_seats ?? null;
  const seatPercentage = maxSeats ? Math.min(100, Math.round((seatsUsed / maxSeats) * 100)) : 0;
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0] ?? null;
  const editingSelf = selectedUserForEdit !== null && selectedUserForEdit.email === user?.email;

  // Escape closes the open dialog. The one-time password dialog stays until it is dismissed on purpose.
  const dialogOpen = showAddModal || showEditModal || showAddRoleModal || Boolean(deleteConfirmUser) || Boolean(deleteConfirmRole);
  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowAddModal(false);
      setShowEditModal(false);
      setShowAddRoleModal(false);
      setDeleteConfirmUser(null);
      setDeleteConfirmRole(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const renderDialog = (labelId: string, content: React.ReactNode, maxWidth = 'max-w-md') => (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`bg-white rounded-2xl ${maxWidth} w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto`}
      >
        {content}
      </div>
    </div>
  );

  // Which roles this member may hand out is decided by the server (GET /users).
  const assignableRoles = roleOptions.filter((r) => r.assignable);

  const TAB_META: Record<SettingsTab, { label: string; description: string; count?: number; icon: React.ReactNode }> = {
    organization: { label: 'Organization', description: 'Company profile, email (SMTP) and WhatsApp settings for this workspace.', icon: <Building2 className="w-4 h-4" aria-hidden="true" /> },
    modules: { label: 'Modules & apps', description: 'Switch business modules on or off and see usage against your plan.', icon: <Layers className="w-4 h-4" aria-hidden="true" /> },
    'employment-types': { label: 'Employment types', description: 'Kinds of employment you hire for, such as full-time, contract or intern.', icon: <Briefcase className="w-4 h-4" aria-hidden="true" /> },
    users: { label: 'Team members', description: 'People who can sign in to this workspace, and the role each one has.', count: users.filter(isActiveMember).length, icon: <Users className="w-4 h-4" aria-hidden="true" /> },
    roles: { label: 'Roles & permissions', description: 'What each role may see and do. Changes apply on the member’s next request.', count: roles.length, icon: <ShieldCheck className="w-4 h-4" aria-hidden="true" /> },
    documents: { label: 'Documents & letterheads', description: 'Letterheads and HR document templates used for offers and letters.', icon: <FileText className="w-4 h-4" aria-hidden="true" /> },
    'document-types': { label: 'Candidate document types', description: 'Documents candidates are asked to upload during onboarding.', icon: <FileCheck className="w-4 h-4" aria-hidden="true" /> },
    'onboarding-workflow': { label: 'Onboarding workflow', description: 'The steps a new hire goes through, from offer to first day.', icon: <Layers className="w-4 h-4" aria-hidden="true" /> },
    integrations: { label: 'Lead channels & APIs', description: 'Where CRM leads come from, and the API keys that send them.', icon: <Radio className="w-4 h-4" aria-hidden="true" /> },
    industries: { label: 'Industry taxonomy', description: 'Industries used to classify CRM leads and accounts.', icon: <Layers className="w-4 h-4" aria-hidden="true" /> },
  };
  const navGroups = TAB_GROUPS
    .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => visibleTabs.includes(tab)) }))
    .filter((group) => group.tabs.length > 0);

  const inputClass =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500';

  const errorBanner = (message: string | undefined) =>
    message ? (
      <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {message}
        </span>
        <button type="button" onClick={fetchAllData} className="font-bold underline">
          Try again
        </button>
      </div>
    ) : null;

  if (!accessLoaded) {
    // Unknown is not the same as denied: say so and let the member retry.
    return (
      <div role="alert" className="max-w-xl mx-auto mt-10 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <h1 className="text-lg font-bold text-slate-900">Your permissions for this workspace couldn’t be loaded</h1>
        <p className="text-sm text-slate-500">
          Try again. If this keeps happening, sign out and back in, or ask your administrator to check that the server is up to date.
        </p>
        <button
          type="button"
          disabled={accessRetry === 'retrying'}
          onClick={async () => {
            setAccessRetry('retrying');
            try {
              await refreshAccess();
              // Still unknown means the server did not report permissions at all.
              setAccessRetry('failed');
            } catch {
              setAccessRetry('failed');
            }
          }}
          className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] disabled:opacity-50 text-white rounded-xl text-xs font-bold"
        >
          {accessRetry === 'retrying' ? 'Trying again…' : 'Try again'}
        </button>
        {accessRetry === 'failed' && (
          <p className="text-xs text-red-700">Still unable to load your permissions.</p>
        )}
      </div>
    );
  }

  if (!currentTab) {
    return (
      <div role="status" className="max-w-xl mx-auto mt-10 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-lg font-bold text-slate-900">You don’t have access to organization settings</h1>
        <p className="text-sm text-slate-500 mt-1">Ask a workspace administrator if you need to view or change them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role={toastMessage.type === 'error' ? 'alert' : 'status'}
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold flex items-center gap-2 ${
            toastMessage.type === 'success' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-red-600 text-white border-red-700'
          }`}
        >
          {toastMessage.type === 'success' ? <Check className="w-4 h-4" aria-hidden="true" /> : <AlertCircle className="w-4 h-4" aria-hidden="true" />}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-80" aria-label="Dismiss notification">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 truncate">
            Settings{orgProfile.company_name ? ` · ${orgProfile.company_name}` : ''}
          </p>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">
            {currentTab ? TAB_META[currentTab].label : 'Settings'}
          </h1>
          {currentTab && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{TAB_META[currentTab].description}</p>}
        </div>

        <div className="flex items-center gap-2">
          {currentTab === 'users' && canCreateUsers && (
            <button
              onClick={() => handleOpenAdd()}
              className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              <span>Add member</span>
            </button>
          )}

          {currentTab === 'roles' && canCreateRoles && (
            <button
              onClick={() => {
                setFormError(null);
                setShowAddRoleModal(true);
              }}
              className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New role</span>
            </button>
          )}

          <button
            onClick={fetchAllData}
            className="p-2 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-500 transition-colors cursor-pointer"
            title="Refresh"
            aria-label="Refresh settings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6 lg:items-start">
        {/* Section navigation: a picker on small screens, a grouped sidebar from lg up */}
        <div className="lg:hidden mb-4">
          <label htmlFor="settings-section" className="block text-xs font-bold text-slate-700 mb-1">Section</label>
          <select
            id="settings-section"
            value={currentTab ?? ''}
            onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/30 focus:border-[#00B7A7]"
          >
            {navGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.tabs.map((tab) => (
                  <option key={tab} value={tab}>{TAB_META[tab].label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <nav aria-label="Settings sections" className="hidden lg:block sticky top-4 bg-white rounded-2xl border border-slate-200 shadow-xs p-2">
          {navGroups.map((group) => (
            <div key={group.label} className="py-1.5 first:pt-0.5 last:pb-0.5">
              <p className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
              <ul className="space-y-0.5">
                {group.tabs.map((tab) => {
                  const isCurrent = currentTab === tab;
                  const meta = TAB_META[tab];
                  return (
                    <li key={tab}>
                      <button
                        type="button"
                        aria-current={isCurrent ? 'page' : undefined}
                        onClick={() => setActiveTab(tab)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7A7]/40 ${
                          isCurrent ? 'bg-teal-50 text-teal-900 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className={isCurrent ? 'text-[#00897D]' : 'text-slate-400'}>{meta.icon}</span>
                        <span className="flex-1 min-w-0 truncate">{meta.label}</span>
                        {meta.count !== undefined && (
                          <span className={`text-[11px] font-semibold tabular-nums px-1.5 rounded-md ${isCurrent ? 'bg-white text-teal-800' : 'bg-slate-100 text-slate-500'}`}>
                            {meta.count}
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

        <div className="min-w-0 space-y-6">
      {/* TAB 0: ORGANIZATION & TENANT SETTINGS */}
      {currentTab === 'organization' && (
        <div className="space-y-6">
          {errorBanner(loadErrors.settings)}

          {workspace && (
            <section aria-label="Workspace summary" className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs font-semibold text-slate-500">Company</dt>
                  <dd className="font-bold text-slate-900 break-words">{orgProfile.company_name || workspace.legal_name}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-semibold text-slate-500">Legal entity</dt>
                  <dd className="text-slate-800 break-words">{workspace.legal_name}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-semibold text-slate-500">Workspace address</dt>
                  <dd className="font-mono text-slate-800 break-all">{workspace.subdomain}.voogyo.com</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-semibold text-slate-500">Currency &amp; timezone</dt>
                  <dd className="text-slate-800">{orgProfile.currency} · {orgProfile.timezone}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-slate-400 font-mono break-all">Workspace ID {workspace.id}</p>
            </section>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* SECTION 1: ORGANIZATION PROFILE */}
            <section aria-labelledby="org-profile-heading" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600">
                    <Building2 className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 id="org-profile-heading" className="text-sm font-bold text-slate-900">Organization Profile</h3>
                    <p className="text-[11px] text-slate-500">Company identity, tax details and primary contact</p>
                  </div>
                </div>
                {!canEditOrg && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded uppercase">View only</span>
                )}
              </div>

              <form onSubmit={handleSaveProfile}>
                <fieldset disabled={!canEditOrg || savingProfile} className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="org-company-name" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>Company name</span>
                      <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="org-company-name"
                      type="text"
                      value={orgProfile.company_name}
                      onChange={(e) => setOrgProfile({ ...orgProfile, company_name: e.target.value })}
                      placeholder="e.g. Acme Advisory Pvt Ltd"
                      required
                      minLength={2}
                      maxLength={200}
                      className={inputClass}
                    />
                    <p className="text-[10px] text-slate-400">Shown on quotations, invoices and outbound email for this workspace.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="org-industry" className="text-xs font-bold text-slate-700">Industry</label>
                      <select
                        id="org-industry"
                        value={orgProfile.industry_type}
                        onChange={(e) => setOrgProfile({ ...orgProfile, industry_type: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Not specified</option>
                        <option value="DIGITAL_AGENCY">Digital Marketing Agency</option>
                        <option value="IT_SERVICES">IT & Software Development</option>
                        <option value="CONSULTING">Management Consulting</option>
                        <option value="ECOMMERCE">E-Commerce & Retail</option>
                        <option value="HEALTHCARE">Healthcare & Diagnostics</option>
                        <option value="REAL_ESTATE">Real Estate & Construction</option>
                        <option value="MANUFACTURING">Manufacturing & Distribution</option>
                        <option value="FINANCE">Financial Services & Fintech</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="org-tax-id" className="text-xs font-bold text-slate-700">Tax ID / GSTIN <span className="font-normal text-slate-400">(optional)</span></label>
                      <input
                        id="org-tax-id"
                        type="text"
                        value={orgProfile.tax_gstin}
                        onChange={(e) => setOrgProfile({ ...orgProfile, tax_gstin: e.target.value.toUpperCase() })}
                        placeholder="15-character GSTIN"
                        maxLength={20}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="org-currency" className="text-xs font-bold text-slate-700">Base currency</label>
                      <select
                        id="org-currency"
                        value={orgProfile.currency}
                        onChange={(e) => setOrgProfile({ ...orgProfile, currency: e.target.value })}
                        className={inputClass}
                      >
                        <option value="INR">INR (₹) - Indian Rupee</option>
                        <option value="USD">USD ($) - US Dollar</option>
                        <option value="EUR">EUR (€) - Euro</option>
                        <option value="GBP">GBP (£) - British Pound</option>
                        <option value="AED">AED (د.إ) - UAE Dirham</option>
                        <option value="SGD">SGD ($) - Singapore Dollar</option>
                        <option value="CAD">CAD ($) - Canadian Dollar</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="org-timezone" className="text-xs font-bold text-slate-700">Workspace timezone</label>
                      <select
                        id="org-timezone"
                        value={orgProfile.timezone}
                        onChange={(e) => setOrgProfile({ ...orgProfile, timezone: e.target.value })}
                        className={inputClass}
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                        <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                        <option value="Europe/London">Europe/London (GMT/BST)</option>
                        <option value="America/New_York">America/New_York (EST/EDT)</option>
                        <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                        <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="org-website" className="text-xs font-bold text-slate-700">Website <span className="font-normal text-slate-400">(optional)</span></label>
                      <div className="relative">
                        <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                        <input
                          id="org-website"
                          type="url"
                          value={orgProfile.website_url}
                          onChange={(e) => setOrgProfile({ ...orgProfile, website_url: e.target.value })}
                          placeholder="https://www.example.com"
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="org-subdomain" className="text-xs font-bold text-slate-700">Workspace address</label>
                      <div className="flex items-center">
                        <input
                          id="org-subdomain"
                          type="text"
                          value={workspace?.subdomain ?? ''}
                          readOnly
                          aria-describedby="org-subdomain-hint"
                          className="w-full bg-slate-100 border border-slate-200 rounded-l-xl px-3 py-2 text-xs font-mono font-bold text-slate-600"
                        />
                        <span className="bg-slate-200/80 border border-l-0 border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 rounded-r-xl font-mono">
                          .voogyo.com
                        </span>
                      </div>
                      <p id="org-subdomain-hint" className="text-[10px] text-slate-400">Set from your workspace code; contact support to change it.</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-xs font-bold text-slate-800 mb-1">Primary contact</div>
                    {workspace?.contact_is_workspace_owner && (
                      <p className="text-[11px] text-slate-500 mb-2">
                        Showing the workspace owner’s details until you save an organization contact.
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label htmlFor="org-contact-name" className="text-[11px] font-medium text-slate-600">Contact person</label>
                        <input
                          id="org-contact-name"
                          type="text"
                          value={orgProfile.primary_contact_name}
                          onChange={(e) => setOrgProfile({ ...orgProfile, primary_contact_name: e.target.value })}
                          placeholder="Full name"
                          maxLength={160}
                          className={inputClass}
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="org-contact-email" className="text-[11px] font-medium text-slate-600">Contact email</label>
                        <input
                          id="org-contact-email"
                          type="email"
                          value={orgProfile.primary_contact_email}
                          onChange={(e) => setOrgProfile({ ...orgProfile, primary_contact_email: e.target.value })}
                          placeholder="contact@company.com"
                          className={inputClass}
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-600">Contact phone</span>
                        <PhoneInputWithCountryCode
                          value={orgProfile.primary_contact_phone}
                          onChange={(val) => setOrgProfile({ ...orgProfile, primary_contact_phone: val })}
                          placeholder="98765 43210"
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="org-address" className="text-xs font-bold text-slate-700">Registered office address <span className="font-normal text-slate-400">(optional)</span></label>
                    <textarea
                      id="org-address"
                      value={orgProfile.company_address}
                      onChange={(e) => setOrgProfile({ ...orgProfile, company_address: e.target.value })}
                      rows={2}
                      maxLength={500}
                      placeholder="Full registered address, used on invoice headers"
                      className={inputClass}
                    />
                  </div>

                  {canEditOrg && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{savingProfile ? 'Saving…' : 'Save organization profile'}</span>
                      </button>
                    </div>
                  )}
                </fieldset>
              </form>
            </section>

            {/* SECTION 2: SMTP */}
            <section aria-labelledby="org-smtp-heading" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-600">
                    <Server className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 id="org-smtp-heading" className="text-sm font-bold text-slate-900">Email (SMTP) settings</h3>
                    <p className="text-[11px] text-slate-500">Outbound mail server for this workspace</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                  smtpSettings.host && smtpSettings.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {!smtpSettings.host ? 'Not configured' : smtpSettings.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <form onSubmit={handleSaveSmtp}>
                <fieldset disabled={!canEditOrg || savingSmtp} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label htmlFor="smtp-host" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <span>SMTP host</span>
                        <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="smtp-host"
                        type="text"
                        value={smtpSettings.host}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                        placeholder="e.g. smtp.gmail.com"
                        required
                        className={`${inputClass} font-mono`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="smtp-port" className="text-xs font-bold text-slate-700">Port</label>
                      <select
                        id="smtp-port"
                        value={smtpSettings.port}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, port: Number(e.target.value) })}
                        className={`${inputClass} font-mono`}
                      >
                        <option value={587}>587</option>
                        <option value={465}>465</option>
                        <option value={2525}>2525</option>
                        <option value={25}>25</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="smtp-username" className="text-xs font-bold text-slate-700">SMTP username</label>
                      <input
                        id="smtp-username"
                        type="text"
                        autoComplete="off"
                        value={smtpSettings.username}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, username: e.target.value })}
                        placeholder="Usually the mailbox address"
                        className={`${inputClass} font-mono`}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor="smtp-password" className="text-xs font-bold text-slate-700">SMTP password</label>
                        {smtpSettings.hasPassword && (
                          <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                            <Check className="w-3 h-3" aria-hidden="true" /> Stored encrypted
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          id="smtp-password"
                          type={showSmtpPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={smtpSettings.password}
                          onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
                          placeholder={smtpSettings.hasPassword ? 'Leave blank to keep the stored password' : 'Enter the SMTP password'}
                          className={`${inputClass} font-mono pr-9`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                          aria-label={showSmtpPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          {showSmtpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="smtp-sender-name" className="text-xs font-bold text-slate-700">Sender name</label>
                      <input
                        id="smtp-sender-name"
                        type="text"
                        value={smtpSettings.senderName}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, senderName: e.target.value })}
                        placeholder="e.g. Sales Team"
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="smtp-sender-email" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <span>Sender email (From)</span>
                        <span className="text-red-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="smtp-sender-email"
                        type="email"
                        value={smtpSettings.senderEmail}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, senderEmail: e.target.value })}
                        placeholder="sales@company.com"
                        required
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="smtp-reply-to" className="text-xs font-bold text-slate-700">Reply-to email <span className="font-normal text-slate-400">(optional)</span></label>
                      <input
                        id="smtp-reply-to"
                        type="email"
                        value={smtpSettings.replyToEmail}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, replyToEmail: e.target.value })}
                        placeholder="replies@company.com"
                        className={`${inputClass} font-mono`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="smtp-encryption" className="text-xs font-bold text-slate-700">Encryption</label>
                      <select
                        id="smtp-encryption"
                        value={smtpSettings.encryption}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, encryption: e.target.value as SmtpForm['encryption'] })}
                        className={inputClass}
                      >
                        <option value="TLS">TLS / STARTTLS (port 587, recommended)</option>
                        <option value="SSL">SSL (port 465)</option>
                        <option value="NONE">None (port 25, unencrypted)</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={smtpSettings.isActive}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, isActive: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Use this server for outbound email
                  </label>

                  {smtpTestResult && (
                    <div
                      role="status"
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                        smtpTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      {smtpTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                      )}
                      <div className="flex-1">
                        <div className="font-bold">{smtpTestResult.success ? 'Connection succeeded' : 'Connection failed'}</div>
                        <div className="text-[11px] mt-0.5 break-words">{smtpTestResult.message}</div>
                      </div>
                    </div>
                  )}

                  {canEditOrg && (
                    <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleTestSmtp}
                        disabled={testingSmtp || (!smtpSettings.password && !smtpSettings.hasPassword && !smtpSettings.host)}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingSmtp ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                        <span>
                          {testingSmtp ? 'Testing…' : smtpSettings.password ? 'Test these values' : 'Test saved settings'}
                        </span>
                      </button>

                      <button
                        type="submit"
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{savingSmtp ? 'Saving…' : 'Save SMTP settings'}</span>
                      </button>
                    </div>
                  )}
                </fieldset>
              </form>
            </section>

            <EmailPolicyPanel />

            {/* SECTION 3: WHATSAPP */}
            <section aria-labelledby="org-whatsapp-heading" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
                    <MessageSquare className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 id="org-whatsapp-heading" className="text-sm font-bold text-slate-900">WhatsApp Business API</h3>
                    <p className="text-[11px] text-slate-500">WhatsApp Gateway credentials for this workspace (Otomat, Meta, Twilio, Gupshup)</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                  (whatsAppSettings.phoneNumberId || whatsAppSettings.vendorUid) && whatsAppSettings.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {!(whatsAppSettings.phoneNumberId || whatsAppSettings.vendorUid) ? 'Not configured' : whatsAppSettings.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">
                  {whatsAppSettings.provider === 'OTOMAT'
                    ? 'Otomat WhatsApp Gateway: Messages are dispatched to https://otomat.in/api/{{VendorId}}/contact/send-message?token=... and synchronized with your CRM WhatsApp Templates.'
                    : 'Find these values in your Meta for Developers app under WhatsApp → API Setup.'}
                </p>
              </div>

              <form onSubmit={handleSaveWhatsApp}>
                <fieldset disabled={!canEditOrg || savingWhatsApp} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="wa-provider" className="text-xs font-bold text-slate-700">API provider</label>
                      <select
                        id="wa-provider"
                        value={whatsAppSettings.provider}
                        onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, provider: e.target.value })}
                        className={inputClass}
                      >
                        <option value="OTOMAT">Otomat (https://otomat.in/api)</option>
                        <option value="META_CLOUD_API">Meta WhatsApp Cloud API</option>
                        <option value="GUPSHUP">Gupshup</option>
                        <option value="TWILIO">Twilio</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-bold text-slate-700">Sender WhatsApp number</span>
                      <PhoneInputWithCountryCode
                        isWhatsApp
                        value={whatsAppSettings.senderPhoneNumber}
                        onChange={(val) => setWhatsAppSettings({ ...whatsAppSettings, senderPhoneNumber: val })}
                        placeholder="98765 43210"
                        size="md"
                      />
                    </div>
                  </div>

                  {whatsAppSettings.provider === 'OTOMAT' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="wa-api-base-url" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <span>API Base URL</span>
                            <span className="text-red-500" aria-hidden="true">*</span>
                          </label>
                          <input
                            id="wa-api-base-url"
                            type="text"
                            value={whatsAppSettings.apiBaseUrl || 'https://otomat.in/api'}
                            onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, apiBaseUrl: e.target.value })}
                            placeholder="https://otomat.in/api"
                            required
                            className={`${inputClass} font-mono`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label htmlFor="wa-vendor-uid" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <span>Vendor ID (VendorId)</span>
                            <span className="text-red-500" aria-hidden="true">*</span>
                          </label>
                          <input
                            id="wa-vendor-uid"
                            type="text"
                            value={whatsAppSettings.vendorUid || ''}
                            onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, vendorUid: e.target.value.trim() })}
                            placeholder="e.g. 20182 or your Otomat vendor UID"
                            required
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="wa-token" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <span>API Token / Bearer Token (token=...)</span>
                            {!whatsAppSettings.hasAccessToken && <span className="text-red-500" aria-hidden="true">*</span>}
                          </label>
                          {whatsAppSettings.hasAccessToken && (
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                              <Check className="w-3 h-3" aria-hidden="true" /> Stored encrypted
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            id="wa-token"
                            type={showWhatsAppToken ? 'text' : 'password'}
                            autoComplete="off"
                            value={whatsAppSettings.accessToken}
                            onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, accessToken: e.target.value })}
                            placeholder={whatsAppSettings.hasAccessToken ? 'Leave blank to keep stored token' : 'Paste your Otomat bearer token'}
                            required={!whatsAppSettings.hasAccessToken}
                            className={`${inputClass} font-mono pr-9`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowWhatsAppToken(!showWhatsAppToken)}
                            aria-label={showWhatsAppToken ? 'Hide access token' : 'Show access token'}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            {showWhatsAppToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="wa-phone-id-opt" className="text-xs font-bold text-slate-700">
                          From Phone Number ID (Optional)
                        </label>
                        <input
                          id="wa-phone-id-opt"
                          type="text"
                          value={whatsAppSettings.phoneNumberId}
                          onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, phoneNumberId: e.target.value.replace(/\D/g, '') })}
                          placeholder="Optional; uses Otomat default if empty"
                          className={`${inputClass} font-mono`}
                        />
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Generated API Endpoint:</div>
                        <div className="text-emerald-600 dark:text-emerald-400 break-all">
                          {(whatsAppSettings.apiBaseUrl || 'https://otomat.in/api').replace(/\/+$/, '')}/{whatsAppSettings.vendorUid || '{{VendorId}}'}/contact/send-message?token={whatsAppSettings.hasAccessToken || whatsAppSettings.accessToken ? '••••••••' : '{{token}}'}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label htmlFor="wa-phone-id" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <span>Phone number ID</span>
                            <span className="text-red-500" aria-hidden="true">*</span>
                          </label>
                          <input
                            id="wa-phone-id"
                            type="text"
                            inputMode="numeric"
                            value={whatsAppSettings.phoneNumberId}
                            onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, phoneNumberId: e.target.value.replace(/\D/g, '') })}
                            placeholder="Digits only"
                            required
                            className={`${inputClass} font-mono`}
                          />
                        </div>

                        <div className="space-y-1">
                          <label htmlFor="wa-waba" className="text-xs font-bold text-slate-700">Business account ID (WABA)</label>
                          <input
                            id="wa-waba"
                            type="text"
                            inputMode="numeric"
                            value={whatsAppSettings.wabaId}
                            onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, wabaId: e.target.value.replace(/\D/g, '') })}
                            placeholder="Digits only"
                            className={`${inputClass} font-mono`}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="wa-token" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <span>Permanent access token</span>
                            {!whatsAppSettings.hasAccessToken && <span className="text-red-500" aria-hidden="true">*</span>}
                          </label>
                          {whatsAppSettings.hasAccessToken && (
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                              <Check className="w-3 h-3" aria-hidden="true" /> Stored encrypted
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            id="wa-token"
                            type={showWhatsAppToken ? 'text' : 'password'}
                            autoComplete="off"
                            value={whatsAppSettings.accessToken}
                            onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, accessToken: e.target.value })}
                            placeholder={whatsAppSettings.hasAccessToken ? 'Leave blank to keep the stored token' : 'System user token from Meta Business Manager'}
                            required={!whatsAppSettings.hasAccessToken}
                            className={`${inputClass} font-mono pr-9`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowWhatsAppToken(!showWhatsAppToken)}
                            aria-label={showWhatsAppToken ? 'Hide access token' : 'Show access token'}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            {showWhatsAppToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label htmlFor="wa-verify-token" className="text-xs font-bold text-slate-700">Webhook verify token</label>
                          {whatsAppSettings.hasWebhookVerifyToken && (
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                              <Check className="w-3 h-3" aria-hidden="true" /> Stored encrypted
                            </span>
                          )}
                        </div>
                        <input
                          id="wa-verify-token"
                          type="password"
                          autoComplete="off"
                          value={whatsAppSettings.webhookVerifyToken}
                          onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, webhookVerifyToken: e.target.value })}
                          placeholder={whatsAppSettings.hasWebhookVerifyToken ? 'Leave blank to keep the stored token' : 'At least 8 characters; enter the same value in Meta'}
                          minLength={8}
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                    </>
                  )}

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={whatsAppSettings.isActive}
                      onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, isActive: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Use this account for WhatsApp messages
                  </label>

                  {whatsAppTestResult && (
                    <div
                      role="status"
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                        whatsAppTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      {whatsAppTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                      )}
                      <div className="flex-1">
                        <div className="font-bold">{whatsAppTestResult.success ? 'Connection succeeded' : 'Connection failed'}</div>
                        <div className="text-[11px] mt-0.5 break-words">{whatsAppTestResult.message}</div>
                      </div>
                    </div>
                  )}

                  {canEditOrg && (
                    <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleTestWhatsApp}
                        disabled={testingWhatsApp || (!whatsAppSettings.accessToken && !whatsAppSettings.hasAccessToken)}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingWhatsApp ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                        <span>
                          {testingWhatsApp ? 'Testing…' : whatsAppSettings.accessToken ? 'Test these values' : 'Test saved settings'}
                        </span>
                      </button>

                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{savingWhatsApp ? 'Saving…' : 'Save WhatsApp settings'}</span>
                      </button>
                    </div>
                  )}
                </fieldset>
              </form>
            </section>

            {/* SECTION 4: PLAN QUOTAS */}
            <section aria-labelledby="org-quotas-heading" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600">
                  <Layers className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="org-quotas-heading" className="text-sm font-bold text-slate-900">Plan quotas</h3>
                  <p className="text-[11px] text-slate-500">Limits set for this workspace by your platform administrator</p>
                </div>
              </div>

              {tenantQuotas ? (
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    { label: 'Team seats', value: `${seatsUsed} of ${tenantQuotas.user_seats_limit} used` },
                    { label: 'Branches', value: tenantQuotas.branch_limit.toLocaleString() },
                    { label: 'Storage', value: `${tenantQuotas.storage_limit_mb.toLocaleString()} MB` },
                    { label: 'AI tokens / month', value: tenantQuotas.monthly_ai_tokens.toLocaleString() },
                    { label: 'WhatsApp credits / month', value: tenantQuotas.monthly_whatsapp_credits.toLocaleString() },
                  ].map((quota) => (
                    <div key={quota.label} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <dt className="font-bold text-slate-700">{quota.label}</dt>
                      <dd className="font-mono font-bold text-slate-900 mt-1">{quota.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-slate-500">
                  No quotas are assigned to this workspace yet. Your platform administrator sets seat and usage limits.
                </p>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 1: TEAM MEMBERS */}
      {currentTab === 'users' && (
        <div className="space-y-4">
          {errorBanner(loadErrors.users)}

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-1 min-w-[14rem]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or email"
                  aria-label="Search team members"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                aria-label="Filter by status"
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ALL">All statuses</option>
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by role"
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
              >
                <option value="ALL">All roles</option>
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.code}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
              <span aria-live="polite">Showing {filteredUsers.length} of {users.length}</span>
              {maxSeats !== null ? (
                <span className="flex items-center gap-2" title="Signed-in members count against your plan's seats">
                  <span className="font-semibold text-slate-700">{seatsUsed}/{maxSeats} seats</span>
                  <span className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
                    <span className={`block h-full rounded-full ${seatPercentage >= 90 ? 'bg-amber-500' : 'bg-[#00B7A7]'}`} style={{ width: `${seatPercentage}%` }} />
                  </span>
                </span>
              ) : (
                <span>No seat limit</span>
              )}
            </div>
          </div>

          {(() => {
            const nameOf = (u: TeamMember) => `${u.first_name} ${u.last_name}`.trim();
            const initialsOf = (first: string, last: string) => `${first[0] || ''}${last ? last[0] : ''}`.toUpperCase() || '?';
            const statusBadge = (u: TeamMember) => {
              const active = isActiveMember(u);
              const label = !u.is_active ? 'Suspended' : active ? 'Active' : 'Inactive employee';
              return (
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : !u.is_active ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : !u.is_active ? 'bg-amber-500' : 'bg-slate-400'}`} aria-hidden="true" />
                  {label}
                </span>
              );
            };
            const actions = (u: TeamMember) => {
              const isSelf = u.email === user?.email;
              return (
                <div className="flex items-center justify-end gap-1">
                  {canUpdateUsers && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(u)}
                      className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7A7]/40"
                      aria-label={`Edit ${nameOf(u)}`}
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  {canDeleteUsers && !isSelf && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmUser(u)}
                      className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                      aria-label={`Remove ${nameOf(u)} from this workspace`}
                      title="Remove from workspace"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            };
            const identity = (u: TeamMember) => {
              const isSelf = u.email === user?.email;
              return (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-bold flex items-center justify-center text-xs shrink-0" aria-hidden="true">
                    {initialsOf(u.first_name, u.last_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm break-words">
                      {nameOf(u)}
                      {isSelf && <span className="ml-1.5 text-[11px] font-medium text-slate-400">(you)</span>}
                    </p>
                    <p className="text-xs text-slate-500 break-all">{u.email}</p>
                  </div>
                </div>
              );
            };
            const emptyText = users.length === 0
              ? 'No team members yet. Add people, or give an employee access below, so they can sign in.'
              : 'No team members match these filters.';

            return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                {loading && users.length === 0 ? (
                  <ul className="divide-y divide-slate-100" aria-busy="true" aria-label="Loading team members">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                        <span className="w-9 h-9 rounded-full bg-slate-100 animate-pulse motion-reduce:animate-none" />
                        <span className="flex-1 space-y-1.5">
                          <span className="block h-3 w-40 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                          <span className="block h-2.5 w-56 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Users className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
                    <p className="text-sm text-slate-600 mt-2">{emptyText}</p>
                  </div>
                ) : (
                  <>
                    {/* Cards on small screens */}
                    <ul className="md:hidden divide-y divide-slate-100">
                      {filteredUsers.map((u) => (
                        <li key={u.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            {identity(u)}
                            {(canUpdateUsers || canDeleteUsers) && actions(u)}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pl-12">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">{u.role_name || 'No role'}</span>
                            {statusBadge(u)}
                            {u.employee_code && <span className="text-[11px] text-slate-500">Emp. {u.employee_code}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {/* Table from md up */}
                    <table className="hidden md:table w-full text-left text-sm">
                      <caption className="sr-only">Team members of this workspace</caption>
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th scope="col" className="py-2.5 px-4">Member</th>
                          <th scope="col" className="py-2.5 px-4">Role</th>
                          <th scope="col" className="py-2.5 px-4 hidden xl:table-cell">Employee</th>
                          <th scope="col" className="py-2.5 px-4 hidden 2xl:table-cell">Phone</th>
                          <th scope="col" className="py-2.5 px-4">Status</th>
                          {(canUpdateUsers || canDeleteUsers) && <th scope="col" className="py-2.5 px-4 text-right"><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className={`hover:bg-slate-50/60 transition-colors ${isActiveMember(u) ? '' : 'opacity-75'}`}>
                            <td className="py-3 px-4 max-w-[22rem]">{identity(u)}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 whitespace-nowrap">{u.role_name || 'No role'}</span>
                            </td>
                            <td className="py-3 px-4 hidden xl:table-cell text-xs text-slate-600 font-mono">{u.employee_code || <span className="text-slate-400 font-sans">Not linked</span>}</td>
                            <td className="py-3 px-4 hidden 2xl:table-cell text-xs text-slate-600">{u.phone || '—'}</td>
                            <td className="py-3 px-4">{statusBadge(u)}</td>
                            {(canUpdateUsers || canDeleteUsers) && <td className="py-2 px-3">{actions(u)}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            );
          })()}

          {canCreateUsers && employeesWithoutSignIn.length > 0 && (() => {
            const term = employeeSearch.trim().toLowerCase();
            const shown = employeesWithoutSignIn.filter((emp) =>
              !term || `${emp.first_name} ${emp.last_name} ${emp.employee_code} ${emp.email ?? ''}`.toLowerCase().includes(term));
            return (
              <section aria-labelledby="employees-without-sign-in" className="bg-white rounded-xl border border-slate-200 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
                  <div className="min-w-0">
                    <h2 id="employees-without-sign-in" className="text-sm font-bold text-slate-900">
                      Employees without sign-in <span className="text-slate-400 font-semibold">({employeesWithoutSignIn.length})</span>
                    </h2>
                    <p className="text-xs text-slate-500">Active HRMS employees who can’t use the portal yet. Give access and choose their role.</p>
                  </div>
                  <div className="relative sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                    <input
                      type="search"
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      placeholder="Find an employee"
                      aria-label="Search employees without sign-in"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                    />
                  </div>
                </div>
                {shown.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-500">No employees match “{employeeSearch}”.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                    {shown.map((emp) => (
                      <li key={emp.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-[11px] shrink-0" aria-hidden="true">
                            {`${emp.first_name[0] || ''}${emp.last_name ? emp.last_name[0] : ''}`.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 break-words">
                              {emp.first_name} {emp.last_name}
                              <span className="ml-1.5 text-xs font-mono font-normal text-slate-500">{emp.employee_code}</span>
                            </p>
                            <p className={`text-xs break-all ${emp.email ? 'text-slate-500' : 'text-amber-700'}`}>
                              {emp.email || 'No work email: you’ll enter one when giving access'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenAdd(emp)}
                          className="shrink-0 px-3 py-2 rounded-lg border border-teal-200 text-xs font-bold text-teal-800 hover:bg-teal-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7A7]/40"
                        >
                          Give access<span className="sr-only"> to {emp.first_name} {emp.last_name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })()}
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSIONS */}
      {currentTab === 'roles' && (() => {
        const totalPermissions = permissionCatalog.reduce((n, sec) => n + sec.groups.reduce((m, g) => m + g.permissions.length, 0), 0);
        const term = permissionSearch.trim().toLowerCase();
        const isGranted = (key: string) => Boolean(selectedRole?.is_admin || selectedRole?.permissions.includes(key));
        // Filtered view of the catalog; empty groups and sections drop out.
        const visibleSections = permissionCatalog
          .map((section) => ({
            ...section,
            groups: section.groups
              .map((group) => ({
                ...group,
                permissions: group.permissions.filter((p) =>
                  (!term || p.name.toLowerCase().includes(term) || p.key.toLowerCase().includes(term) || group.group.toLowerCase().includes(term) || section.section.toLowerCase().includes(term))
                  && (!showGrantedOnly || isGranted(p.key))),
              }))
              .filter((group) => group.permissions.length > 0),
          }))
          .filter((section) => section.groups.length > 0);
        const roleBadge = (r: TenantRole) =>
          r.is_admin ? 'Admin' : r.is_system ? 'Built-in' : 'Custom';

        return (
        <div className="space-y-4">
          {errorBanner(loadErrors.roles)}

          <div className="xl:grid xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-6 xl:items-start space-y-4 xl:space-y-0">
            {/* Role picker: a select below xl, a list from xl up */}
            <div className="xl:hidden">
              <label htmlFor="role-picker" className="block text-xs font-bold text-slate-700 mb-1">Role</label>
              <select
                id="role-picker"
                value={selectedRole?.id ?? ''}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/30 focus:border-[#00B7A7]"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · {r.users_count} {r.users_count === 1 ? 'member' : 'members'}</option>
                ))}
              </select>
            </div>

            <section aria-labelledby="roles-list-heading" className="hidden xl:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden xl:sticky xl:top-4">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h2 id="roles-list-heading" className="text-sm font-bold text-slate-900">Roles <span className="text-slate-400 font-semibold">({roles.length})</span></h2>
              </div>
              {roles.length === 0 ? (
                <p className="px-4 py-6 text-xs text-slate-500">{loading ? 'Loading roles…' : 'No roles yet.'}</p>
              ) : (
                <ul className="p-2 space-y-0.5 max-h-[70vh] overflow-y-auto">
                  {roles.map((r) => {
                    const isSelected = selectedRole?.id === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRoleId(r.id)}
                          aria-current={isSelected ? 'true' : undefined}
                          className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7A7]/40 ${
                            isSelected ? 'bg-teal-50 border-teal-200' : 'border-transparent hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className={`text-sm truncate ${isSelected ? 'font-bold text-teal-900' : 'font-semibold text-slate-800'}`}>{r.name}</span>
                            <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                              r.is_admin ? 'bg-indigo-50 text-indigo-700' : r.is_system ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'
                            }`}>{roleBadge(r)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            {r.users_count} {r.users_count === 1 ? 'member' : 'members'}
                            <span aria-hidden="true">·</span>
                            {r.is_admin ? 'All' : r.permissions.length} permissions
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <div className="min-w-0 space-y-4">
              {selectedRole ? (
                <>
                  {/* Role summary */}
                  <section aria-labelledby="role-title" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 id="role-title" className="font-bold text-slate-900 text-base break-words">{selectedRole.name}</h2>
                          <span className="text-[11px] text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded px-1.5">{selectedRole.code}</span>
                          <span className="text-[11px] font-semibold text-slate-600">{roleBadge(selectedRole)} role</span>
                        </div>
                        {selectedRole.description && <p className="text-sm text-slate-600 mt-1">{selectedRole.description}</p>}
                      </div>
                      {canDeleteRoles && !selectedRole.is_system && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmRole(selectedRole)}
                          disabled={selectedRole.users_count > 0}
                          aria-describedby={selectedRole.users_count > 0 ? 'role-delete-hint' : undefined}
                          className="px-3 py-2 rounded-lg text-xs font-bold border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Delete role
                        </button>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <dt className="text-[11px] font-semibold text-slate-500">Members</dt>
                        <dd className="font-bold text-slate-900 tabular-nums">{selectedRole.users_count}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <dt className="text-[11px] font-semibold text-slate-500">Permissions granted</dt>
                        <dd className="font-bold text-slate-900 tabular-nums">
                          {selectedRole.is_admin ? 'All' : `${selectedRole.permissions.length}${totalPermissions ? ` of ${totalPermissions}` : ''}`}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 col-span-2 sm:col-span-1">
                        <dt className="text-[11px] font-semibold text-slate-500">Editing</dt>
                        <dd className="font-semibold text-slate-800">
                          {selectedRole.is_admin ? 'Locked' : canUpdateRoles ? 'Saved on each change' : 'View only'}
                        </dd>
                      </div>
                    </dl>

                    {selectedRole.users_count > 0 && canDeleteRoles && !selectedRole.is_system && (
                      <p id="role-delete-hint" className="mt-3 text-xs text-slate-500">Move its members to another role before deleting it.</p>
                    )}
                    {selectedRole.is_admin && (
                      <p className="mt-3 flex items-start gap-2 text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
                        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        Administrators always hold every permission, so the workspace can never lock itself out.
                      </p>
                    )}
                  </section>

                  {permissionCatalog.length === 0 ? (
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 text-sm text-slate-500">
                      {canViewPermissions ? 'Loading the permission list…' : 'You can see roles but not the permission list.'}
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const editable = !selectedRole.is_admin && canUpdateRoles;
                        const busy = pendingPermission !== null;
                        const allKeys = permissionCatalog.flatMap((sec) => sec.groups.flatMap((g) => g.permissions.map((p) => p.key)));
                        // Bulk controls act on what is on screen, so a search narrows "select all".
                        const shownKeys = visibleSections.flatMap((sec) => sec.groups.flatMap((g) => g.permissions.map((p) => p.key)));
                        const holdable = (keys: string[]) => keys.filter((k) => can(k));
                        const stateOf = (keys: string[]) => {
                          const n = keys.filter(isGranted).length;
                          return { all: keys.length > 0 && n === keys.length, some: n > 0 && n < keys.length, n };
                        };
                        const bulkBox = (keys: string[], label: string, size = 'w-4 h-4') => {
                          const st = stateOf(keys);
                          const usable = holdable(keys);
                          return (
                            <TriStateCheckbox
                              checked={st.all}
                              indeterminate={st.some}
                              disabled={!editable || busy || usable.length === 0}
                              onChange={() => handleBulkPermissions(selectedRole, usable, !st.all)}
                              aria-label={`${st.all ? 'Remove' : 'Grant'} all ${label} permissions`}
                              title={st.all ? `Remove all in ${label}` : `Grant all in ${label}`}
                              className={`${size} rounded border-slate-300 accent-[#00B7A7] disabled:cursor-not-allowed cursor-pointer shrink-0`}
                            />
                          );
                        };
                        const shownState = stateOf(shownKeys);
                        const allCollapsed = visibleSections.every((sec) => collapsedSections.has(sec.section));
                        const toggleSection = (name: string) => setCollapsedSections((prev) => {
                          const next = new Set(prev);
                          if (next.has(name)) next.delete(name); else next.add(name);
                          return next;
                        });

                        return (
                          <>
                            {/* Toolbar: find, filter, bulk actions */}
                            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3 xl:sticky xl:top-4 z-10">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="relative flex-1 min-w-[14rem]">
                                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                                  <input
                                    type="search"
                                    value={permissionSearch}
                                    onChange={(e) => setPermissionSearch(e.target.value)}
                                    placeholder="Search permissions, e.g. payroll or leads"
                                    aria-label="Search permissions"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                                  />
                                </div>
                                <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
                                  {[{ v: false, l: 'All' }, { v: true, l: 'Granted' }].map((opt) => (
                                    <button
                                      key={opt.l}
                                      type="button"
                                      aria-pressed={showGrantedOnly === opt.v}
                                      onClick={() => setShowGrantedOnly(opt.v)}
                                      className={`px-3 py-1.5 rounded-md cursor-pointer ${showGrantedOnly === opt.v ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                      {opt.l}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                <span className="text-xs text-slate-600" aria-live="polite">
                                  <span className="font-semibold text-slate-900 tabular-nums">{stateOf(allKeys).n}</span> of {allKeys.length} granted
                                  {term && <> · showing {shownKeys.length} matching</>}
                                  {busy && pendingPermission === '__bulk__' && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Saving…</span>
                                  )}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  {editable && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={busy || shownState.all || holdable(shownKeys).length === 0}
                                        onClick={() => handleBulkPermissions(selectedRole, holdable(shownKeys), true)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00B7A7] hover:bg-[#009E90] text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                      >
                                        {term || showGrantedOnly ? 'Select shown' : 'Select all'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy || shownState.n === 0}
                                        onClick={() => (term || showGrantedOnly ? handleBulkPermissions(selectedRole, holdable(shownKeys), false) : setConfirmClearAll(true))}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                      >
                                        {term || showGrantedOnly ? 'Deselect shown' : 'Deselect all'}
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setCollapsedSections(allCollapsed ? new Set() : new Set(visibleSections.map((sec) => sec.section)))}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                                  >
                                    {allCollapsed ? 'Expand all' : 'Collapse all'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {visibleSections.length === 0 ? (
                              <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
                                <p className="text-sm font-semibold text-slate-800">No permissions match</p>
                                <p className="text-xs text-slate-500 mt-1">Try another word, or switch the view back to “All”.</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {visibleSections.map((section) => {
                                  const full = permissionCatalog.find((sec) => sec.section === section.section);
                                  const sectionKeys = full ? full.groups.flatMap((g) => g.permissions.map((p) => p.key)) : [];
                                  const st = stateOf(sectionKeys);
                                  const pct = sectionKeys.length ? Math.round((st.n / sectionKeys.length) * 100) : 0;
                                  const open = !collapsedSections.has(section.section);
                                  const panelId = `perm-section-${section.section.replace(/[^a-z0-9]+/gi, '-')}`;
                                  return (
                                    <section key={section.section} aria-label={section.section} className="bg-white rounded-2xl border border-slate-200 shadow-xs">
                                      <div className="flex items-center gap-3 px-4 py-3">
                                        {bulkBox(sectionKeys, section.section)}
                                        <button
                                          type="button"
                                          aria-expanded={open}
                                          aria-controls={panelId}
                                          onClick={() => toggleSection(section.section)}
                                          className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7A7]/40"
                                        >
                                          <h3 className="text-sm font-bold text-slate-900 flex-1 min-w-0 truncate">{section.section}</h3>
                                          <span className={`text-xs tabular-nums whitespace-nowrap ${st.all ? 'text-teal-700 font-semibold' : 'text-slate-500'}`}>
                                            {st.all ? 'All granted' : st.n === 0 ? 'None granted' : `${st.n} of ${sectionKeys.length}`}
                                          </span>
                                          <span className="hidden sm:block w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
                                            <span className="block h-full bg-[#00B7A7] rounded-full" style={{ width: `${pct}%` }} />
                                          </span>
                                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform motion-reduce:transition-none ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
                                        </button>
                                      </div>
                                      {open && (
                                        <div id={panelId} className="grid grid-cols-1 2xl:grid-cols-2 gap-3 px-4 pb-4">
                                          {section.groups.map((group) => {
                                            const fullGroup = full?.groups.find((g) => g.group === group.group);
                                            const groupKeys = (fullGroup ?? group).permissions.map((p) => p.key);
                                            return (
                                              <fieldset key={group.group} className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3">
                                                <legend className="sr-only">{group.group}</legend>
                                                <div className="flex items-center gap-2.5 pb-2 mb-1 border-b border-slate-200/70">
                                                  {bulkBox(groupKeys, group.group, 'w-3.5 h-3.5')}
                                                  <span className="text-xs font-bold text-slate-700 flex-1">{group.group}</span>
                                                  <span className="text-[11px] text-slate-500 tabular-nums">{stateOf(groupKeys).n}/{groupKeys.length}</span>
                                                </div>
                                                <ul>
                                                  {group.permissions.map((permission) => {
                                                    const granted = isGranted(permission.key);
                                                    const notHeld = editable && !can(permission.key);
                                                    // The owner role's grants are locked so a workspace keeps its administration.
                                                    const disabled = !editable || busy || notHeld;
                                                    const saving = pendingPermission === permission.key;
                                                    return (
                                                      <li key={permission.key}>
                                                        <label
                                                          className={`flex items-center gap-3 px-1.5 py-2 rounded-lg text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white'}`}
                                                          title={notHeld ? 'You can only grant permissions you hold yourself.' : permission.key}
                                                        >
                                                          <input
                                                            type="checkbox"
                                                            checked={granted}
                                                            disabled={disabled}
                                                            onChange={() => handleTogglePermission(selectedRole, permission.key, !granted)}
                                                            className="w-4 h-4 rounded border-slate-300 accent-[#00B7A7] disabled:cursor-not-allowed shrink-0"
                                                          />
                                                          <span className={`flex-1 min-w-0 ${granted ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{permission.name}</span>
                                                          {notHeld && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label="You don't hold this permission" />}
                                                          {saving && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin motion-reduce:animate-none shrink-0" aria-label="Saving" />}
                                                        </label>
                                                      </li>
                                                    );
                                                  })}
                                                </ul>
                                              </fieldset>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </section>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </>
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                  <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-800 mt-2">{loading ? 'Loading roles…' : 'No roles yet'}</p>
                  {!loading && (
                    <p className="text-xs text-slate-500 mt-1">Create a role to decide what its members can see and do.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* TAB 3: MODULES & APPS */}
      {currentTab === 'modules' && (
        <div className="space-y-6">
          {errorBanner(loadErrors.modules)}

          {modulesData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="text-xs font-semibold text-slate-400 mb-1">Plan</div>
                <div className="text-lg font-black text-slate-900">{modulesData.tenant.plan_name ?? 'No plan assigned'}</div>
                {modulesData.tenant.plan_code && (
                  <div className="text-xs text-[#00B7A7] font-semibold mt-1">Code: {modulesData.tenant.plan_code}</div>
                )}
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                  <span>Team seats</span>
                  <Users className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                </div>
                <div className="text-lg font-black text-slate-900">
                  {modulesData.tenant.max_seats !== null ? `${modulesData.tenant.seats_used} / ${modulesData.tenant.max_seats}` : `${modulesData.tenant.seats_used} · no limit set`}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                  <span>Storage limit</span>
                  <HardDrive className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                </div>
                <div className="text-lg font-black text-slate-900">
                  {modulesData.tenant.storage_limit_mb !== null ? `${(modulesData.tenant.storage_limit_mb / 1024).toFixed(1)} GB` : 'Not set'}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                  <span>AI tokens / month</span>
                  <Cpu className="w-4 h-4 text-purple-600" aria-hidden="true" />
                </div>
                <div className="text-lg font-black text-slate-900">
                  {modulesData.tenant.monthly_ai_token_quota !== null ? modulesData.tenant.monthly_ai_token_quota.toLocaleString() : 'Not set'}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3 px-1 gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Workspace modules</h2>
              <span className="text-xs text-slate-500">
                {canUpdateModules ? 'Turning a module off hides it and blocks its API for everyone in this workspace.' : 'Only administrators can change modules.'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(modulesData?.modules ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`bg-white rounded-2xl p-5 border flex flex-col justify-between space-y-4 shadow-xs ${
                    m.is_enabled ? 'border-slate-200' : 'border-slate-200/60 bg-slate-50/50'
                  }`}
                >
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-900">{m.name}</h3>
                    <p className="text-xs text-slate-500">{m.description}</p>
                    {m.features.length > 0 && (
                      <p className="text-[11px] text-slate-600">
                        <span className="font-semibold">Includes</span> {m.features.join(', ')}
                      </p>
                    )}
                    {m.requires.length > 0 && (
                      <p className="text-[11px] text-slate-400">
                        Needs {m.requires.map((code) => modulesData?.modules.find((x) => x.id === code)?.name ?? code).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className={`text-xs font-semibold flex items-center gap-1.5 ${m.is_enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${m.is_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                      {m.is_enabled ? 'On' : 'Off'}
                    </span>

                    {canUpdateModules && (
                      <button
                        onClick={() => handleToggleModule(m)}
                        disabled={togglingModule !== null}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                          m.is_enabled
                            ? 'bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700'
                            : 'bg-[#00B7A7] hover:bg-[#009E90] text-white'
                        }`}
                      >
                        {togglingModule === m.id ? 'Saving…' : m.is_enabled ? `Turn off` : `Turn on`}
                        <span className="sr-only"> {m.name}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CRM configuration tabs */}
      {currentTab === 'integrations' && <LeadIntegrationsCenter />}
      {currentTab === 'industries' && <IndustriesMaster />}
      {currentTab === 'documents' && <DocumentsView />}
      {currentTab === 'employment-types' && <EmploymentTypesMaster canEdit={canEditOrg} />}
      {currentTab === 'document-types' && <DocumentTypesMaster />}
      {currentTab === 'onboarding-workflow' && <WorkflowBuilderView />}
        </div>
      </div>

      {/* DIALOG: ADD TEAM MEMBER */}
      {showAddModal &&
        renderDialog(
          'add-member-title',
          <>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#00B7A7] flex items-center justify-center" aria-hidden="true">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="add-member-title" className="text-sm font-bold text-slate-900">Add team member</h3>
                  <p className="text-[11px] text-slate-500">They get access to {orgProfile.company_name || 'this workspace'} only</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              {employeesWithoutSignIn.length > 0 && (
                <div>
                  <label htmlFor="member-employee" className="block text-xs font-bold text-slate-700 mb-1">HRMS employee</label>
                  <select
                    id="member-employee"
                    value={formData.employee_id}
                    onChange={(e) => {
                      const emp = employeesWithoutSignIn.find((x) => x.id === e.target.value);
                      setFormData(emp
                        ? { ...formData, employee_id: emp.id, first_name: emp.first_name, last_name: emp.last_name, email: emp.email ?? formData.email, phone: emp.phone ?? formData.phone }
                        : { ...formData, employee_id: '' });
                    }}
                    className={inputClass}
                  >
                    <option value="">Not an employee</option>
                    {employeesWithoutSignIn.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">Links this sign-in to the employee, so attendance and self-service use the same person.</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="member-first-name" className="block text-xs font-bold text-slate-700 mb-1">First name <span className="text-red-500" aria-hidden="true">*</span></label>
                  <input
                    id="member-first-name"
                    type="text"
                    required
                    autoFocus
                    maxLength={80}
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="member-last-name" className="block text-xs font-bold text-slate-700 mb-1">Last name</label>
                  <input
                    id="member-last-name"
                    type="text"
                    maxLength={80}
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="member-email" className="block text-xs font-bold text-slate-700 mb-1">Email address <span className="text-red-500" aria-hidden="true">*</span></label>
                <input
                  id="member-email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@company.com"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="block text-xs font-bold text-slate-700 mb-1">Phone</span>
                  <PhoneInputWithCountryCode
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val })}
                    placeholder="98765 43210"
                    size="sm"
                  />
                </div>
                <div>
                  <label htmlFor="member-role" className="block text-xs font-bold text-slate-700 mb-1">Role <span className="text-red-500" aria-hidden="true">*</span></label>
                  <select
                    id="member-role"
                    required
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="" disabled>Choose a role</option>
                    {assignableRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                If this email has no account yet, you’ll get a one-time temporary password to share with them.
              </p>

              {formError && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{formError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                  <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{submitting ? 'Adding…' : 'Add team member'}</span>
                </button>
              </div>
            </form>
          </>,
        )}

      {/* DIALOG: ONE-TIME CREDENTIAL */}
      {issuedCredential &&
        renderDialog(
          'credential-title',
          <>
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center" aria-hidden="true">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 id="credential-title" className="text-sm font-bold text-slate-900">Team member added</h3>
                <p className="text-[11px] text-slate-500">Share these sign-in details with them securely</p>
              </div>
            </div>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="font-bold text-slate-700">Email</dt>
                <dd className="font-mono text-slate-900 break-all">{issuedCredential.email}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-700">Temporary password</dt>
                <dd className="flex items-center gap-2 mt-1">
                  <code className="flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
                    {issuedCredential.temporaryPassword}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(issuedCredential.temporaryPassword)}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                    aria-label="Copy temporary password"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </dd>
              </div>
            </dl>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              This password is shown only once. Ask them to change it after they first sign in.
            </p>
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setIssuedCredential(null)} className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold">
                I’ve shared it
              </button>
            </div>
          </>,
        )}

      {/* DIALOG: EDIT TEAM MEMBER */}
      {showEditModal &&
        selectedUserForEdit &&
        renderDialog(
          'edit-member-title',
          <>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#00B7A7] flex items-center justify-center" aria-hidden="true">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="edit-member-title" className="text-sm font-bold text-slate-900">Edit team member</h3>
                  <p className="text-[11px] text-slate-500 break-all">{selectedUserForEdit.email}</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-first-name" className="block text-xs font-bold text-slate-700 mb-1">First name <span className="text-red-500" aria-hidden="true">*</span></label>
                  <input
                    id="edit-first-name"
                    type="text"
                    required
                    autoFocus
                    maxLength={80}
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="edit-last-name" className="block text-xs font-bold text-slate-700 mb-1">Last name</label>
                  <input
                    id="edit-last-name"
                    type="text"
                    maxLength={80}
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Phone</span>
                <PhoneInputWithCountryCode
                  value={formData.phone}
                  onChange={(val) => setFormData({ ...formData, phone: val })}
                  placeholder="98765 43210"
                  size="sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-role" className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                  <select
                    id="edit-role"
                    value={formData.role_id}
                    disabled={editingSelf}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                    className={inputClass}
                  >
                    {!formData.role_id && <option value="">No role</option>}
                    {roleOptions.filter((r) => r.assignable || r.id === formData.role_id).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-status" className="block text-xs font-bold text-slate-700 mb-1">Workspace access</label>
                  <select
                    id="edit-status"
                    value={formData.is_active ? 'ACTIVE' : 'SUSPENDED'}
                    disabled={editingSelf}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'ACTIVE' })}
                    className={inputClass}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                {editingSelf
                  ? 'You cannot change your own role or access. Ask another administrator.'
                  : 'Suspending ends their access to this workspace immediately. Their account and other workspaces are not affected.'}
              </p>

              {formError && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{formError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50">
                  {submitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </>,
        )}

      {/* DIALOG: CREATE ROLE */}
      {showAddRoleModal &&
        renderDialog(
          'create-role-title',
          <>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#00B7A7] flex items-center justify-center" aria-hidden="true">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="create-role-title" className="text-sm font-bold text-slate-900">Create role</h3>
                  <p className="text-[11px] text-slate-500">New roles start with no permissions</p>
                </div>
              </div>
              <button onClick={() => setShowAddRoleModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-3">
              <div>
                <label htmlFor="role-name" className="block text-xs font-bold text-slate-700 mb-1">Role name <span className="text-red-500" aria-hidden="true">*</span></label>
                <input
                  id="role-name"
                  type="text"
                  required
                  autoFocus
                  minLength={2}
                  maxLength={120}
                  value={newRoleData.name}
                  onChange={(e) => setNewRoleData({ ...newRoleData, name: e.target.value })}
                  placeholder="e.g. Sales Manager"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="role-code" className="block text-xs font-bold text-slate-700 mb-1">Role code <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  id="role-code"
                  type="text"
                  maxLength={64}
                  value={newRoleData.code}
                  onChange={(e) => setNewRoleData({ ...newRoleData, code: e.target.value.toUpperCase() })}
                  placeholder="Generated from the name, e.g. SALES_MANAGER"
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div>
                <label htmlFor="role-description" className="block text-xs font-bold text-slate-700 mb-1">Description <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  id="role-description"
                  rows={2}
                  maxLength={500}
                  value={newRoleData.description}
                  onChange={(e) => setNewRoleData({ ...newRoleData, description: e.target.value })}
                  placeholder="What people with this role do"
                  className={`${inputClass} resize-none`}
                />
              </div>

              {formError && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{formError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddRoleModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{submitting ? 'Creating…' : 'Create role'}</span>
                </button>
              </div>
            </form>
          </>,
        )}

      {/* DIALOG: REMOVE TEAM MEMBER */}
      {deleteConfirmUser &&
        renderDialog(
          'remove-member-title',
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0" aria-hidden="true">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 id="remove-member-title" className="text-sm font-bold text-slate-900">
                  Remove {deleteConfirmUser.first_name} {deleteConfirmUser.last_name} from {orgProfile.company_name || 'this workspace'}?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  They lose access to this workspace immediately. Their account, any other workspaces and the history they created are kept.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setDeleteConfirmUser(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">
                Cancel
              </button>
              <button onClick={handleDeleteUser} disabled={submitting} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50">
                {submitting ? 'Removing…' : 'Remove from workspace'}
              </button>
            </div>
          </>,
          'max-w-sm',
        )}

      {/* DIALOG: DELETE ROLE */}
      {confirmClearAll && selectedRole &&
        renderDialog(
          'clear-permissions-title',
          <>
            <div>
              <h3 id="clear-permissions-title" className="text-sm font-bold text-slate-900">Remove every permission from “{selectedRole.name}”?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Its {selectedRole.users_count} {selectedRole.users_count === 1 ? 'member loses' : 'members lose'} access to everything this role allowed on their next request. You can grant permissions again at any time.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" autoFocus onClick={() => setConfirmClearAll(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmClearAll(false);
                  await handleBulkPermissions(selectedRole, selectedRole.permissions, false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
              >
                Remove all permissions
              </button>
            </div>
          </>,
          'max-w-sm',
        )}

      {deleteConfirmRole &&
        renderDialog(
          'delete-role-title',
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0" aria-hidden="true">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-role-title" className="text-sm font-bold text-slate-900">Delete the role “{deleteConfirmRole.name}”?</h3>
                <p className="text-xs text-slate-500 mt-1">Its permission settings are removed. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setDeleteConfirmRole(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">
                Cancel
              </button>
              <button onClick={handleDeleteRole} disabled={submitting} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50">
                {submitting ? 'Deleting…' : 'Delete role'}
              </button>
            </div>
          </>,
          'max-w-sm',
        )}
    </div>
  );
};

export default OrganizationSettingsView;
