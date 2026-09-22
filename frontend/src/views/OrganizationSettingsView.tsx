import React, { useEffect, useState } from 'react';
import { 
  Users, UserPlus, Search, Filter, ShieldCheck, Mail, Phone,
  Building2, Edit3, Trash2, CheckCircle2, X, RefreshCw, Key,
  UserCheck, Shield, Check, AlertCircle, Briefcase, Layers,
  Lock, ArrowRight, ExternalLink, Sparkles, ToggleLeft, ToggleRight,
  Plus, CheckSquare, Eye, EyeOff, Download, ShieldAlert, Cpu, HardDrive,
  MessageSquare, Server, Globe, Save, Smartphone, Activity, Radio
} from 'lucide-react';

import LeadIntegrationsCenter from '@/components/crm/LeadIntegrationsCenter';
import IndustriesMaster from '@/components/crm/IndustriesMaster';
import { PhoneInputWithCountryCode } from '@/components/crm/PhoneInputWithCountryCode';

export interface OrganizationSettingsViewProps {
  initialTab?: 'organization' | 'users' | 'roles' | 'modules' | 'integrations' | 'industries';
}

export const OrganizationSettingsView: React.FC<OrganizationSettingsViewProps> = ({ initialTab: propInitialTab }) => {
  const [activeTab, setActiveTab] = useState<'organization' | 'users' | 'roles' | 'modules' | 'integrations' | 'industries'>(() => {
    if (propInitialTab) return propInitialTab;
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'roles' || tab === 'modules' || tab === 'users' || tab === 'integrations' || tab === 'industries' || tab === 'organization') {
        return tab as any;
      }
    } catch {}
    return 'organization';
  });

  useEffect(() => {
    if (propInitialTab) {
      setActiveTab(propInitialTab);
    }
  }, [propInitialTab]);
  
  // Data states
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [modulesData, setModulesData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Organization & Tenant Settings State
  const [orgProfile, setOrgProfile] = useState({
    company_name: '',
    subdomain: '',
    custom_domain: '',
    primary_contact_name: '',
    primary_contact_email: '',
    primary_contact_phone: '',
    industry_type: 'DIGITAL_AGENCY',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    tax_gstin: '',
    company_address: '',
    website_url: ''
  });

  const [smtpSettings, setSmtpSettings] = useState({
    host: '',
    port: 587,
    username: '',
    password: '',
    hasPassword: false,
    senderName: '',
    senderEmail: '',
    replyToEmail: '',
    encryption: 'TLS',
    isActive: true
  });

  const [whatsAppSettings, setWhatsAppSettings] = useState({
    provider: 'META_CLOUD_API',
    wabaId: '',
    phoneNumberId: '',
    senderPhoneNumber: '',
    accessToken: '',
    hasAccessToken: false,
    webhookVerifyToken: 'voogyo_verify',
    isActive: true
  });

  const [tenantQuotas, setTenantQuotas] = useState<any>(null);

  // Organization Loading & Feedback states
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);

  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsAppTestResult, setWhatsAppTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showWhatsAppToken, setShowWhatsAppToken] = useState(false);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Roles & Permissions state
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState<any | null>(null);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleData, setNewRoleData] = useState({ name: '', code: '', description: '' });

  // User Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<any | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<any | null>(null);

  // In-app Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // User Form State
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    designation: 'Sales Executive',
    role_id: '',
    is_active: 1
  });

  const [submitting, setSubmitting] = useState(false);

  // Fetch all tenant user management and organization data
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, modulesRes, settingsRes] = await Promise.all([
        fetch('/api/v1/users'),
        fetch('/api/v1/tenant/roles'),
        fetch('/api/v1/tenant/modules'),
        fetch('/api/v1/tenant/settings')
      ]);

      const usersJson = await usersRes.json();
      const rolesJson = await rolesRes.json();
      const modulesJson = await modulesRes.json();
      const settingsJson = await settingsRes.json();

      if (usersJson.success) {
        setUsers(usersJson.data.users || []);
      }
      if (rolesJson.success) {
        const loadedRoles = rolesJson.data.roles || [];
        setRoles(loadedRoles);
        if (loadedRoles.length > 0 && !selectedRoleForPerms) {
          setSelectedRoleForPerms(loadedRoles[0]);
        } else if (selectedRoleForPerms) {
          const updated = loadedRoles.find((r: any) => r.id === selectedRoleForPerms.id);
          if (updated) setSelectedRoleForPerms(updated);
        }
      }
      if (modulesJson.success) {
        setModulesData(modulesJson.data);
      }
      if (settingsJson.success && settingsJson.data) {
        const t = settingsJson.data.tenant || {};
        setOrgProfile({
          company_name: t.company_name || '',
          subdomain: t.subdomain || '',
          custom_domain: t.custom_domain || '',
          primary_contact_name: t.primary_contact_name || '',
          primary_contact_email: t.primary_contact_email || '',
          primary_contact_phone: t.primary_contact_phone || '',
          industry_type: t.industry_type || 'DIGITAL_AGENCY',
          currency: t.currency || 'INR',
          timezone: t.timezone || 'Asia/Kolkata',
          tax_gstin: t.tax_gstin || '',
          company_address: t.company_address || '',
          website_url: t.website_url || ''
        });
        setTenantQuotas({
          max_seats: t.max_seats || 30,
          max_branches: t.max_branches || 5,
          storage_limit_mb: t.storage_limit_mb || 5120,
          monthly_ai_token_quota: t.monthly_ai_token_quota || 1000000,
          monthly_whatsapp_quota: t.monthly_whatsapp_quota || 10000
        });

        if (settingsJson.data.smtp) {
          const s = settingsJson.data.smtp;
          setSmtpSettings({
            host: s.host || '',
            port: s.port || 587,
            username: s.username || '',
            password: '',
            hasPassword: Boolean(s.hasPassword),
            senderName: s.senderName || '',
            senderEmail: s.senderEmail || '',
            replyToEmail: s.replyToEmail || '',
            encryption: s.encryption || 'TLS',
            isActive: s.isActive !== undefined ? s.isActive : true
          });
        }

        if (settingsJson.data.whatsapp) {
          const w = settingsJson.data.whatsapp;
          setWhatsAppSettings({
            provider: w.provider || 'META_CLOUD_API',
            wabaId: w.wabaId || '',
            phoneNumberId: w.phoneNumberId || '',
            senderPhoneNumber: w.senderPhoneNumber || '',
            accessToken: '',
            hasAccessToken: Boolean(w.hasAccessToken),
            webhookVerifyToken: w.webhookVerifyToken || 'voogyo_verify',
            isActive: w.isActive !== undefined ? w.isActive : true
          });
        }
      }
    } catch (err) {
      console.error('Error fetching tenant access data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Organization Settings Handlers
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgProfile.company_name.trim()) {
      showToast('Company Name is required', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/v1/tenant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_profile',
          ...orgProfile
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Organization profile updated successfully!');
        fetchAllData();
      } else {
        showToast(data.error || 'Failed to update profile', 'error');
      }
    } catch (err: any) {
      showToast('Error saving profile: ' + err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpSettings.host.trim() || !smtpSettings.senderEmail.trim()) {
      showToast('SMTP Host and Sender Email are required', 'error');
      return;
    }
    setSavingSmtp(true);
    try {
      const res = await fetch('/api/v1/tenant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_smtp',
          ...smtpSettings
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'SMTP settings saved successfully!');
        setSmtpSettings(prev => ({ ...prev, hasPassword: true, password: '' }));
      } else {
        showToast(data.error || 'Failed to save SMTP settings', 'error');
      }
    } catch (err: any) {
      showToast('Error saving SMTP settings: ' + err.message, 'error');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!smtpSettings.host.trim()) {
      showToast('SMTP Host is required to run test', 'error');
      return;
    }
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await fetch('/api/v1/tenant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_smtp',
          ...smtpSettings
        })
      });
      const data = await res.json();
      if (data.success) {
        setSmtpTestResult({ 
          success: true, 
          message: data.data?.message || 'SMTP Connection Verified successfully!',
          latencyMs: data.data?.latencyMs
        });
        showToast('SMTP Connection Verified!', 'success');
      } else {
        setSmtpTestResult({ 
          success: false, 
          message: data.error || 'SMTP Connection Failed. Please check credentials and port.'
        });
        showToast('SMTP Test Failed', 'error');
      }
    } catch (err: any) {
      setSmtpTestResult({ success: false, message: err.message });
      showToast('SMTP Test Error', 'error');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWhatsApp(true);
    try {
      const res = await fetch('/api/v1/tenant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_whatsapp',
          ...whatsAppSettings
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'WhatsApp API credentials saved successfully!');
        setWhatsAppSettings(prev => ({ ...prev, hasAccessToken: true, accessToken: '' }));
      } else {
        showToast(data.error || 'Failed to save WhatsApp credentials', 'error');
      }
    } catch (err: any) {
      showToast('Error saving WhatsApp settings: ' + err.message, 'error');
    } finally {
      setSavingWhatsApp(false);
    }
  };

  const handleTestWhatsApp = async () => {
    if (!whatsAppSettings.phoneNumberId.trim()) {
      showToast('Phone Number ID is required to run test', 'error');
      return;
    }
    setTestingWhatsApp(true);
    setWhatsAppTestResult(null);
    try {
      const res = await fetch('/api/v1/tenant/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_whatsapp',
          phoneNumberId: whatsAppSettings.phoneNumberId,
          accessToken: whatsAppSettings.accessToken
        })
      });
      const data = await res.json();
      if (data.success) {
        setWhatsAppTestResult({ success: true, message: data.message || 'WhatsApp Cloud API Handshake Verified!' });
        showToast('WhatsApp API Verified!', 'success');
      } else {
        setWhatsAppTestResult({ success: false, message: data.error || 'WhatsApp API Verification failed' });
        showToast('WhatsApp API Test Failed', 'error');
      }
    } catch (err: any) {
      setWhatsAppTestResult({ success: false, message: err.message });
      showToast('WhatsApp Test Error', 'error');
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleOpenAdd = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      designation: 'Sales Executive',
      role_id: roles[0]?.id || '',
      is_active: 1
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (u: any) => {
    setSelectedUserForEdit(u);
    setFormData({
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      email: u.email || '',
      phone: u.phone || '',
      designation: u.designation || '',
      role_id: u.role_id || roles[0]?.id || '',
      is_active: u.is_active !== undefined ? u.is_active : 1
    });
    setShowEditModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.first_name || !formData.email) {
      showToast('First Name and Email are required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Team member added successfully!');
        setShowAddModal(false);
        fetchAllData();
      } else {
        showToast(data.error || 'Failed to add user', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedUserForEdit.id, ...formData })
      });
      const data = await res.json();
      if (data.success) {
        showToast('User profile updated successfully!');
        setShowEditModal(false);
        setSelectedUserForEdit(null);
        fetchAllData();
      } else {
        showToast(data.error || 'Failed to update user', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      const res = await fetch(`/api/v1/users?id=${deleteConfirmUser.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('User account removed');
        setDeleteConfirmUser(null);
        fetchAllData();
      } else {
        showToast(data.error || 'Failed to delete user', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    }
  };

  // Toggle Granular Permission
  const handleTogglePermission = async (moduleId: string, action: string, currentVal: boolean) => {
    if (!selectedRoleForPerms) return;
    const newVal = !currentVal;

    // Optimistically update local state
    const updatedPerms = { ...selectedRoleForPerms.permissions };
    if (!updatedPerms[moduleId]) updatedPerms[moduleId] = {};
    updatedPerms[moduleId][action] = newVal;

    setSelectedRoleForPerms({
      ...selectedRoleForPerms,
      permissions: updatedPerms
    });

    try {
      const res = await fetch('/api/v1/tenant/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: selectedRoleForPerms.id,
          moduleId,
          action,
          isAllowed: newVal
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Updated ${action} permission for ${moduleId}`);
      } else {
        showToast(data.error || 'Failed to update permission', 'error');
        fetchAllData(); // rollback
      }
    } catch (err) {
      console.error(err);
      fetchAllData();
    }
  };

  // Create Custom Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleData.name) {
      showToast('Role name is required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/tenant/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRoleData)
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Role '${newRoleData.name}' created!`);
        setShowAddRoleModal(false);
        setNewRoleData({ name: '', code: '', description: '' });
        fetchAllData();
      } else {
        showToast(data.error || 'Failed to create role', 'error');
      }
    } catch (err: any) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Tenant Module
  const handleToggleModule = async (moduleId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      const res = await fetch('/api/v1/tenant/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, isEnabled: newVal })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Module status updated');
        fetchAllData();
      } else {
        showToast(data.error || 'Failed to update module', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.designation && u.designation.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === 'ALL' || u.role_code === roleFilter;
    return matchesSearch && matchesRole;
  });

  const tenant = modulesData?.tenant || {};
  const maxSeats = tenant.max_seats || 30;
  const seatsUsed = users.length;
  const seatPercentage = Math.min(100, Math.round((seatsUsed / maxSeats) * 100));

  const permissionModules = ['CRM', 'HRMS', 'PROJECTS', 'FINANCE', 'PAYROLL', 'AI'];
  const permissionActions = [
    { key: 'VIEW', label: 'View' },
    { key: 'CREATE', label: 'Create' },
    { key: 'EDIT', label: 'Edit' },
    { key: 'DELETE', label: 'Delete' },
    { key: 'EXPORT', label: 'Export' }
  ];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-top duration-200 ${
          toastMessage.type === 'success' 
            ? 'bg-emerald-600 text-white border-emerald-700' 
            : 'bg-red-600 text-white border-red-700'
        }`}>
          {toastMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 text-[11px] font-bold rounded-md border border-indigo-200 uppercase tracking-wider">
              {orgProfile.company_name || tenant.company_name || 'Tenant Workspace'}
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {activeTab === 'organization' ? 'Organization & Tenant Settings' : 'Organization & Access Control'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeTab === 'organization'
              ? 'Configure company profile, branding, outbound SMTP email server, and WhatsApp Business API settings'
              : 'Manage your team seats, custom roles & granular permissions, and workspace module subscriptions'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'users' && (
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Team Member</span>
            </button>
          )}

          {activeTab === 'roles' && (
            <button
              onClick={() => setShowAddRoleModal(true)}
              className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Custom Role</span>
            </button>
          )}

          <button
            onClick={fetchAllData}
            className="p-2 hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-500 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab Selector & Quota Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tab Buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setActiveTab('organization')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'organization'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Organization & Settings</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'users'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-teal-600" />
            <span>Team Members ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'roles'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Roles & Permissions ({roles.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('modules')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'modules'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Modules & Apps</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'integrations'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-indigo-600" />
            <span>Lead Channels & APIs</span>
          </button>

          <button
            onClick={() => setActiveTab('industries')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'industries'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>Industry Taxonomy</span>
          </button>
        </div>

        {/* Plan & Seat Quota Pill */}
        <div className="flex items-center gap-3 px-3.5 py-2 bg-white rounded-xl border border-slate-200 shadow-xs text-xs">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Seats Allocation</span>
            <span className="font-bold text-slate-900">{seatsUsed} of {maxSeats} Seats Used</span>
          </div>
          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#00B7A7] rounded-full" style={{ width: `${seatPercentage}%` }} />
          </div>
          <a
            href="#pricing"
            className="text-[11px] font-bold text-[#00B7A7] hover:underline flex items-center gap-0.5 ml-1"
          >
            <span>Upgrade</span>
            <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* TAB 0: ORGANIZATION & TENANT SETTINGS */}
      {activeTab === 'organization' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Quick Profile Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-indigo-900/40 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-400/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Tenant Organization HQ
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Enterprise Cloud Active
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-slate-200 font-mono">
                    ID: {tenant.id || 'tenant_rnd_001'}
                  </span>
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>{orgProfile.company_name || tenant.company_name || 'Organization Workspace'}</span>
                </h2>
                <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
                  Unified tenant configurations: Organization Profile, Domain Branding, Outbound SMTP Server, and Meta WhatsApp Business API integration.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-3.5 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Tenant Subdomain</span>
                  <span className="font-bold text-indigo-300 font-mono">{orgProfile.subdomain || 'rnd'}.voogyo.com</span>
                </div>
                <div className="px-3.5 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 text-xs">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Timezone & Currency</span>
                  <span className="font-bold text-amber-300 font-mono">{orgProfile.currency || 'INR'} • {orgProfile.timezone || 'Asia/Kolkata'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ------------------------------------------------------------- */}
            {/* SECTION 1: ORGANIZATION PROFILE & LEGAL IDENTITY               */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Organization Profile & Branding</h3>
                    <p className="text-[11px] text-slate-500">Legal entity name, commercial details, and primary contact</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded uppercase">
                  Profile
                </span>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>Company Name / Tenant Name</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgProfile.company_name}
                    onChange={(e) => setOrgProfile({ ...orgProfile, company_name: e.target.value })}
                    placeholder="e.g. RND Technosoft"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400">This company name is dynamically used across Outbound Marketing Funnels, Invoices, and Quotations.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Industry Classification</label>
                    <select
                      value={orgProfile.industry_type}
                      onChange={(e) => setOrgProfile({ ...orgProfile, industry_type: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="DIGITAL_AGENCY">Digital Marketing Agency</option>
                      <option value="IT_SERVICES">IT & Software Development</option>
                      <option value="CONSULTING">Management Consulting</option>
                      <option value="ECOMMERCE">E-Commerce & Retail</option>
                      <option value="HEALTHCARE">Healthcare & Diagnostics</option>
                      <option value="REAL_ESTATE">Real Estate & Construction</option>
                      <option value="MANUFACTURING">Manufacturing & Distribution</option>
                      <option value="FINANCE">Financial Services & Fintech</option>
                      <option value="OTHER">Other Enterprise Sector</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Tax ID / GSTIN</label>
                    <input
                      type="text"
                      value={orgProfile.tax_gstin}
                      onChange={(e) => setOrgProfile({ ...orgProfile, tax_gstin: e.target.value.toUpperCase() })}
                      placeholder="e.g. 24AAACR1234F1Z5"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Base Currency</label>
                    <select
                      value={orgProfile.currency}
                      onChange={(e) => setOrgProfile({ ...orgProfile, currency: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                    <label className="text-xs font-bold text-slate-700">Workspace Timezone</label>
                    <select
                      value={orgProfile.timezone}
                      onChange={(e) => setOrgProfile({ ...orgProfile, timezone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="America/New_York">America/New_York (EST/EDT)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                      <option value="UTC">UTC (Universal Coordinated Time)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Official Website URL</label>
                    <div className="relative">
                      <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="url"
                        value={orgProfile.website_url}
                        onChange={(e) => setOrgProfile({ ...orgProfile, website_url: e.target.value })}
                        placeholder="https://rndtechnosoft.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Subdomain Prefix</label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={orgProfile.subdomain}
                        readOnly
                        className="w-full bg-slate-100 border border-slate-200 rounded-l-xl px-3 py-2 text-xs font-mono font-bold text-slate-600 cursor-not-allowed"
                      />
                      <span className="bg-slate-200/80 border border-l-0 border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 rounded-r-xl font-mono">
                        .voogyo.com
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <div className="text-xs font-bold text-slate-800 mb-2">Primary Contact Details</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-600">Contact Person</label>
                      <input
                        type="text"
                        value={orgProfile.primary_contact_name}
                        onChange={(e) => setOrgProfile({ ...orgProfile, primary_contact_name: e.target.value })}
                        placeholder="Ravi Shah"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-600">Contact Email</label>
                      <input
                        type="email"
                        value={orgProfile.primary_contact_email}
                        onChange={(e) => setOrgProfile({ ...orgProfile, primary_contact_email: e.target.value })}
                        placeholder="ravi@rndtechnosoft.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-600">Contact Phone</label>
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
                  <label className="text-xs font-bold text-slate-700">Registered Office Address</label>
                  <textarea
                    value={orgProfile.company_address}
                    onChange={(e) => setOrgProfile({ ...orgProfile, company_address: e.target.value })}
                    rows={2}
                    placeholder="Enter full corporate address for invoice headers..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Save className={`w-3.5 h-3.5 ${savingProfile ? 'animate-spin' : ''}`} />
                    <span>{savingProfile ? 'Saving Profile...' : 'Save Organization Profile'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* SECTION 2: OUTBOUND EMAIL & SMTP SERVER SETTINGS               */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-600">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Email Gateway & SMTP Settings</h3>
                    <p className="text-[11px] text-slate-500">Outbound email server for Client Outreach, Quotations & Invoices</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                  smtpSettings.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {smtpSettings.isActive ? 'Active Gateway' : 'Inactive'}
                </span>
              </div>

              <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl text-xs text-purple-900 flex items-start gap-2">
                <Mail className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Emails from <strong>Client Outreach</strong>, quotations dispatched to clients, and system reminders are delivered directly via this authenticated SMTP relay.
                </p>
              </div>

              <form onSubmit={handleSaveSmtp} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>SMTP Host</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpSettings.host}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                      placeholder="e.g. smtp.gmail.com or mail.rndtechnosoft.com"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Port</label>
                    <input
                      type="number"
                      value={smtpSettings.port}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, port: Number(e.target.value) })}
                      placeholder="587"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">SMTP Username</label>
                    <input
                      type="text"
                      value={smtpSettings.username}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, username: e.target.value })}
                      placeholder="outreach@rndtechnosoft.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">SMTP Password</label>
                      {smtpSettings.hasPassword && (
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Stored securely
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showSmtpPassword ? 'text' : 'password'}
                        value={smtpSettings.password}
                        onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
                        placeholder={smtpSettings.hasPassword ? '•••••••••••• (Unchanged)' : 'Enter SMTP password...'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-9 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        {showSmtpPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Sender Display Name</label>
                    <input
                      type="text"
                      value={smtpSettings.senderName}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, senderName: e.target.value })}
                      placeholder="e.g. RND Sales Team"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>Sender Email (From)</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={smtpSettings.senderEmail}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, senderEmail: e.target.value })}
                      placeholder="outreach@rndtechnosoft.com"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Reply-To Email</label>
                    <input
                      type="email"
                      value={smtpSettings.replyToEmail}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, replyToEmail: e.target.value })}
                      placeholder="contact@rndtechnosoft.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Encryption Protocol</label>
                    <select
                      value={smtpSettings.encryption}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, encryption: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                      <option value="TLS">TLS / STARTTLS (Port 587 - Recommended)</option>
                      <option value="SSL">SSL / Direct SSL (Port 465)</option>
                      <option value="NONE">NONE / Unencrypted (Port 25)</option>
                    </select>
                  </div>
                </div>

                {/* SMTP Test Feedback Banner */}
                {smtpTestResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    smtpTestResult.success 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}>
                    {smtpTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-bold">{smtpTestResult.success ? 'SMTP Handshake Succeeded' : 'SMTP Test Failed'}</div>
                      <div className="text-[11px] mt-0.5">{smtpTestResult.message}</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleTestSmtp}
                    disabled={testingSmtp}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingSmtp ? 'animate-spin' : ''}`} />
                    <span>{testingSmtp ? 'Testing Handshake...' : '⚡ Test Connection'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingSmtp}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Save className={`w-3.5 h-3.5 ${savingSmtp ? 'animate-spin' : ''}`} />
                    <span>{savingSmtp ? 'Saving SMTP...' : 'Save SMTP Settings'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* SECTION 3: WHATSAPP BUSINESS CLOUD API SETTINGS               */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">WhatsApp Business API Settings</h3>
                    <p className="text-[11px] text-slate-500">Official Meta WhatsApp Cloud API credentials for outreach</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                  whatsAppSettings.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {whatsAppSettings.isActive ? 'API Active' : 'Inactive'}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  WhatsApp messages are dispatched directly via <strong>Meta WhatsApp Cloud API</strong> to prospect numbers. Credentials can be retrieved from your Meta for Developers App dashboard.
                </p>
              </div>

              <form onSubmit={handleSaveWhatsApp} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">API Provider</label>
                    <select
                      value={whatsAppSettings.provider}
                      onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, provider: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="META_CLOUD_API">Meta WhatsApp Cloud API (Official)</option>
                      <option value="GUPSHUP">GupShup Enterprise WhatsApp</option>
                      <option value="TWILIO">Twilio WhatsApp Messaging</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Sender WhatsApp Phone Number</label>
                    <PhoneInputWithCountryCode
                      isWhatsApp
                      value={whatsAppSettings.senderPhoneNumber}
                      onChange={(val) => setWhatsAppSettings({ ...whatsAppSettings, senderPhoneNumber: val })}
                      placeholder="98765 43210"
                      size="md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>Phone Number ID</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={whatsAppSettings.phoneNumberId}
                      onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, phoneNumberId: e.target.value })}
                      placeholder="e.g. 109876543210987"
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <p className="text-[10px] text-slate-400">Found in Meta Developer Portal under WhatsApp &gt; API Setup.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">WhatsApp Business Account ID (WABA)</label>
                    <input
                      type="text"
                      value={whatsAppSettings.wabaId}
                      onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, wabaId: e.target.value })}
                      placeholder="e.g. 209876543210987"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>Permanent System User Access Token</span>
                      <span className="text-red-500">*</span>
                    </label>
                    {whatsAppSettings.hasAccessToken && (
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Token stored securely
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showWhatsAppToken ? 'text' : 'password'}
                      value={whatsAppSettings.accessToken}
                      onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, accessToken: e.target.value })}
                      placeholder={whatsAppSettings.hasAccessToken ? '•••••••••••••••••••••••• (Unchanged)' : 'EAAG... (Permanent System User Token)'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-9 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWhatsAppToken(!showWhatsAppToken)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      {showWhatsAppToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">Generate a permanent token from Meta Business Manager &gt; System Users with `whatsapp_business_messaging` permission.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Webhook Verify Token</label>
                  <input
                    type="text"
                    value={whatsAppSettings.webhookVerifyToken}
                    onChange={(e) => setWhatsAppSettings({ ...whatsAppSettings, webhookVerifyToken: e.target.value })}
                    placeholder="voogyo_verify"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* WhatsApp Test Result Banner */}
                {whatsAppTestResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    whatsAppTestResult.success 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}>
                    {whatsAppTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-bold">{whatsAppTestResult.success ? 'WhatsApp Cloud API Verified' : 'WhatsApp API Handshake Failed'}</div>
                      <div className="text-[11px] mt-0.5">{whatsAppTestResult.message}</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleTestWhatsApp}
                    disabled={testingWhatsApp}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingWhatsApp ? 'animate-spin' : ''}`} />
                    <span>{testingWhatsApp ? 'Verifying API...' : '⚡ Test API Connection'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingWhatsApp}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Save className={`w-3.5 h-3.5 ${savingWhatsApp ? 'animate-spin' : ''}`} />
                    <span>{savingWhatsApp ? 'Saving Credentials...' : 'Save WhatsApp Settings'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* SECTION 4: TENANT PLAN & RESOURCE ALLOCATION                  */}
            {/* ------------------------------------------------------------- */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Tenant Plan & Quotas</h3>
                    <p className="text-[11px] text-slate-500">Resource quotas, user seat caps, and API limits</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded uppercase">
                  Enterprise Tier
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Team Seats</span>
                    <span className="font-mono font-bold text-slate-900">{seatsUsed} / {maxSeats}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${seatPercentage}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400 block">{maxSeats - seatsUsed} seats available</span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Storage Limit</span>
                    <span className="font-mono font-bold text-slate-900">{tenantQuotas?.storage_limit_mb || 5120} MB</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: '22%' }} />
                  </div>
                  <span className="text-[10px] text-slate-400 block">Encrypted document storage</span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Monthly AI Tokens</span>
                    <span className="font-mono font-bold text-purple-700">
                      {(tenantQuotas?.monthly_ai_token_quota || 1000000).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: '45%' }} />
                  </div>
                  <span className="text-[10px] text-slate-400 block">For AI Lead Copilot & Intelligence</span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">WhatsApp Credits</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {(tenantQuotas?.monthly_whatsapp_quota || 10000).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-50 rounded-full" style={{ width: '15%' }} />
                  </div>
                  <span className="text-[10px] text-slate-400 block">Multi-channel cadence dispatches</span>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 rounded-xl text-white flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Need higher quotas or custom domains?</div>
                  <div className="text-[11px] text-slate-300">Scale seats, dedicated IP SMTP, and high-volume WhatsApp quotas.</div>
                </div>
                <a
                  href="#pricing"
                  className="px-3.5 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 shadow-sm"
                >
                  <span>Explore Plans</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: TEAM MEMBERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, or designation..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
              >
                <option value="ALL">All Roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.code}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing {filteredUsers.length} of {users.length} members
            </div>
          </div>

          {/* Members Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Role & Access</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Assigned Leads</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400">
                        No team members match your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const initials = `${u.first_name[0] || ''}${u.last_name ? u.last_name[0] : ''}`.toUpperCase();
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-bold flex items-center justify-center text-xs shrink-0">
                                {initials}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-sm block">
                                  {u.first_name} {u.last_name}
                                </span>
                                <span className="text-[11px] text-slate-500 block">
                                  {u.designation || 'Team Member'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                              {u.role_name || 'Member'}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-600">
                            {u.email}
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            {u.phone || '—'}
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px]">
                              {u.assigned_leads_count || 0} Deals
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              u.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              <span>{u.is_active ? 'Active' : 'Inactive'}</span>
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(u)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                                title="Edit Profile"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => setDeleteConfirmUser(u)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                                title="Remove User"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ROLES & GRANULAR PERMISSIONS MATRIX */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Roles Selector Sidebar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tenant Roles</span>
              <button
                onClick={() => setShowAddRoleModal(true)}
                className="text-xs font-bold text-[#00B7A7] hover:underline cursor-pointer"
              >
                + New Role
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-2 space-y-1">
              {roles.map((r) => {
                const isSelected = selectedRoleForPerms?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoleForPerms(r)}
                    className={`w-full text-left p-3 rounded-xl text-xs transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#00B7A7] text-white font-bold shadow-xs'
                        : 'hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span>{r.name}</span>
                        {r.is_system === 1 && (
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                            isSelected ? 'bg-[#009E90] text-white' : 'bg-slate-100 text-slate-500'
                          }`}>System</span>
                        )}
                      </div>
                      <span className={`text-[10px] block mt-0.5 ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                        {r.users_count || 0} Members assigned
                      </span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Granular Permission Matrix Table */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm">
                    {selectedRoleForPerms ? selectedRoleForPerms.name : 'Select a Role'} — Feature Permissions Matrix
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    ({selectedRoleForPerms?.code})
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Checkboxes automatically save and enforce real-time access control for this role.
                </p>
              </div>

              {selectedRoleForPerms?.is_system === 1 && (
                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg border border-amber-200">
                  System Root Role
                </span>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Voogyo Module</th>
                      {permissionActions.map((act) => (
                        <th key={act.key} className="py-3 px-4 text-center font-bold">
                          {act.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {permissionModules.map((mod) => {
                      const modPerms = selectedRoleForPerms?.permissions?.[mod] || {};
                      return (
                        <tr key={mod} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#00B7A7]" />
                            <span>{mod}</span>
                          </td>

                          {permissionActions.map((act) => {
                            const isAllowed = modPerms[act.key] === true;
                            return (
                              <td key={act.key} className="py-3.5 px-4 text-center">
                                <label className="inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    onChange={() => handleTogglePermission(mod, act.key, isAllowed)}
                                    className="w-4 h-4 rounded text-[#00B7A7] focus:ring-[#00B7A7] accent-[#00B7A7] border-slate-300 transition-all cursor-pointer"
                                  />
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MODULE & APP MANAGEMENT */}
      {activeTab === 'modules' && (
        <div className="space-y-6">
          {/* Quota & Usage Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                <span>Subscribed Plan</span>
                <Sparkles className="w-4 h-4 text-[#00B7A7]" />
              </div>
              <div className="text-xl font-black text-slate-900">{tenant.plan_name || 'Growth Agency Suite'}</div>
              <div className="text-xs text-[#00B7A7] font-semibold mt-1">Tier Code: {tenant.plan_code || 'GROWTH'}</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                <span>Team Seats Capacity</span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-black text-slate-900">{seatsUsed} / {maxSeats} Seats</div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${seatPercentage}%` }} />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                <span>Storage Limit</span>
                <HardDrive className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-xl font-black text-slate-900">{Math.round((tenant.storage_limit_mb || 25600) / 1024)} GB</div>
              <div className="text-xs text-slate-400 mt-1">Document & Media Vault</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                <span>Monthly AI Tokens</span>
                <Cpu className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xl font-black text-slate-900">
                {((tenant.monthly_ai_token_quota || 500000) / 1000).toLocaleString()}k Tokens
              </div>
              <div className="text-xs text-purple-600 font-medium mt-1">Copilot & Digital Employees</div>
            </div>
          </div>

          {/* Modules Grid */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Workspace Installed Modules & Apps
              </h3>
              <span className="text-xs text-slate-500">
                Toggle modules on/off for your company workspace
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(modulesData?.modules || []).map((m: any) => {
                const isEnabled = m.is_enabled === 1;
                return (
                  <div 
                    key={m.id} 
                    className={`bg-white rounded-2xl p-5 border transition-all flex flex-col justify-between space-y-4 shadow-xs ${
                      isEnabled ? 'border-slate-200' : 'border-slate-200/60 opacity-60 bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                          {m.category}
                        </span>
                        {m.is_core === 1 && (
                          <span className="text-[10px] text-slate-400 font-semibold">Core ERP</span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-slate-900">{m.name}</h4>
                      <p className="text-xs text-slate-500 min-h-[36px]">{m.description}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isEnabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {isEnabled ? '● Active in Workspace' : '○ Disabled'}
                      </span>

                      <button
                        onClick={() => handleToggleModule(m.id, isEnabled)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isEnabled
                            ? 'bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700'
                            : 'bg-[#00B7A7] hover:bg-[#009E90] text-white'
                        }`}
                      >
                        {isEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB: LEAD CHANNELS & APIS INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <LeadIntegrationsCenter />
      )}

      {/* TAB: GLOBAL CRM INDUSTRY TAXONOMY */}
      {activeTab === 'industries' && (
        <IndustriesMaster />
      )}

      {/* MODAL: ADD TEAM MEMBER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#00B7A7] flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Team Member</h3>
                  <p className="text-[11px] text-slate-500">Provision workspace access & role</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                    placeholder="e.g. Neha"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                    placeholder="e.g. Sharma"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                  placeholder="neha@company.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <PhoneInputWithCountryCode
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val })}
                    placeholder="98765 43210"
                    size="sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                    placeholder="Sales Rep"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assign Role *</label>
                <select
                  value={formData.role_id}
                  onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Adding...' : 'Add Team Member'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#00B7A7] flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit Team Member</h3>
                  <p className="text-[11px] text-slate-500">Update profile, role, or status</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <PhoneInputWithCountryCode
                    value={formData.phone}
                    onChange={(val) => setFormData({ ...formData, phone: val })}
                    placeholder="98765 43210"
                    size="sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assign Role</label>
                  <select
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{submitting ? 'Updating...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE CUSTOM ROLE */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-[#00B7A7] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create Custom Role</h3>
                  <p className="text-[11px] text-slate-500">Define role title and security code</p>
                </div>
              </div>
              <button onClick={() => setShowAddRoleModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role Name *</label>
                <input
                  type="text"
                  required
                  value={newRoleData.name}
                  onChange={(e) => setNewRoleData({ ...newRoleData, name: e.target.value })}
                  placeholder="e.g. Sales Representative"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role Identifier Code</label>
                <input
                  type="text"
                  value={newRoleData.code}
                  onChange={(e) => setNewRoleData({ ...newRoleData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SALES_REP"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newRoleData.description}
                  onChange={(e) => setNewRoleData({ ...newRoleData, description: e.target.value })}
                  placeholder="Role description and responsibilities"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#00B7A7]/20 focus:border-[#00B7A7]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Creating...' : 'Create Role'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Remove Team Member?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to remove <strong>{deleteConfirmUser.first_name} {deleteConfirmUser.last_name}</strong>?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationSettingsView;
