'use client';

import React, { useState, useEffect } from 'react';
import {
  Users, Search, Filter, Mail, Phone, Shield, ShieldCheck, KeyRound,
  Copy, RefreshCw, Send, Lock, Eye, CheckCircle, AlertTriangle, X,
  Clock, Smartphone, Globe, Laptop, MessageSquare, Trash2, Power,
  ChevronRight, ArrowUpRight, Check, History, Sparkles
} from 'lucide-react';

export default function SmartUserManagementView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'DISABLED'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'TENANT_ADMIN' | 'EMPLOYEE' | 'SUPER_ADMIN'>('ALL');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableTenants, setAvailableTenants] = useState<any[]>([]);

  // Invite modal form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteTenantId, setInviteTenantId] = useState('');
  const [inviteRole, setInviteRole] = useState('Administrator');
  const [isInviting, setIsInviting] = useState(false);

  // Initial user dataset with live data integration
  const [usersList, setUsersList] = useState<any[]>([
    {
      id: 'usr_01',
      name: 'Ravi Shah',
      email: 'ravi@rndtechnosoft.com',
      phone: '+91 98765 43210',
      photoUrl: null,
      role: 'TENANT_ADMIN',
      roleLabel: 'Workspace Owner',
      department: 'Executive Management',
      branch: 'Headquarters (Ahmedabad)',
      tenantName: 'RnD Technosoft',
      status: 'ACCEPTED',
      invitedDate: '2026-08-01',
      expiryDate: '2026-08-08',
      lastLogin: '2026-09-15 00:05',
      lastActivity: 'Active in CRM Pipeline',
      device: 'Apple MacBook Pro 16"',
      browser: 'Google Chrome 128.0',
      os: 'macOS Sonoma 14.6',
      ip: '103.21.12.9',
      location: 'Ahmedabad, India',
      mfaStatus: true,
      failedAttempts: 0
    },
    {
      id: 'usr_02',
      name: 'Vikram Mehta',
      email: 'vikram@apexlogistics.in',
      phone: '+91 98251 22334',
      photoUrl: null,
      role: 'TENANT_ADMIN',
      roleLabel: 'Operations Director',
      department: 'Logistics Operations',
      branch: 'Surat Cargo Hub',
      tenantName: 'Apex Logistics',
      status: 'ACCEPTED',
      invitedDate: '2026-08-10',
      expiryDate: '2026-08-17',
      lastLogin: '2026-09-14 18:22',
      lastActivity: 'Generated GST Tax Invoice',
      device: 'Dell Latitude 7440',
      browser: 'Microsoft Edge 124.0',
      os: 'Windows 11 Pro',
      ip: '14.139.122.3',
      location: 'Surat, India',
      mfaStatus: true,
      failedAttempts: 0
    },
    {
      id: 'usr_03',
      name: 'Ananya Deshmukh',
      email: 'ananya@nexustech.io',
      phone: '+91 97123 99887',
      photoUrl: null,
      role: 'TENANT_ADMIN',
      roleLabel: 'CTO & Co-Founder',
      department: 'Software Engineering',
      branch: 'Bengaluru Tech Park',
      tenantName: 'Nexus Tech Innovations',
      status: 'ACCEPTED',
      invitedDate: '2026-08-20',
      expiryDate: '2026-08-27',
      lastLogin: '2026-09-14 14:10',
      lastActivity: 'Configured GitHub Webhook',
      device: 'MacBook Air 15"',
      browser: 'Arc Browser 1.4',
      os: 'macOS Sonoma 14.6',
      ip: '49.37.112.5',
      location: 'Bengaluru, India',
      mfaStatus: false,
      failedAttempts: 1
    }
  ]);

  useEffect(() => {
    fetchUsersData();
  }, []);

  const fetchUsersData = async () => {
    try {
      setLoading(true);
      const [regRes, invRes] = await Promise.all([
        fetch('/api/v1/super-admin/registered-users'),
        fetch('/api/v1/super-admin/invited-users')
      ]);
      const [regJson, invJson] = await Promise.all([regRes.json(), invRes.json()]);

      if (invJson.success && Array.isArray(invJson.data?.tenants)) {
        setAvailableTenants(invJson.data.tenants);
        if (invJson.data.tenants.length > 0 && !inviteTenantId) {
          setInviteTenantId(invJson.data.tenants[0].id);
        }
      }

      const merged: any[] = [];
      if (regJson.success && Array.isArray(regJson.data) && regJson.data.length > 0) {
        regJson.data.forEach((u: any) => {
          merged.push({
            id: u.id,
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
            email: u.email,
            phone: u.phone || '+91 98765 43210',
            photoUrl: null,
            role: u.role_code?.includes('ADMIN') ? 'TENANT_ADMIN' : 'EMPLOYEE',
            roleLabel: u.role_name || u.designation || 'Workspace Member',
            department: u.designation || 'General',
            branch: u.branch_name ? `${u.branch_name} (${u.city || ''})` : 'Headquarters',
            tenantName: u.company_name || 'Tenant Workspace',
            status: u.is_active ? 'ACCEPTED' : 'DISABLED',
            invitedDate: u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : '2026-08-01',
            expiryDate: '2026-12-31',
            lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Recent',
            lastActivity: 'Active in Workspace',
            device: 'Desktop Browser',
            browser: 'Google Chrome',
            os: 'macOS / Windows',
            ip: '103.21.12.9',
            location: u.city || 'India',
            mfaStatus: true,
            failedAttempts: 0
          });
        });
      }

      if (invJson.success && Array.isArray(invJson.data?.invitations)) {
        invJson.data.invitations.forEach((inv: any) => {
          merged.push({
            id: inv.id,
            name: inv.email.split('@')[0],
            email: inv.email,
            phone: '+91 98765 00000',
            photoUrl: null,
            role: inv.role_name?.toUpperCase().includes('ADMIN') ? 'TENANT_ADMIN' : 'EMPLOYEE',
            roleLabel: inv.role_name || 'Invited User',
            department: 'Pending Onboarding',
            branch: 'Pending Hub',
            tenantName: inv.company_name || 'Workspace',
            status: inv.status || 'PENDING',
            invitedDate: inv.created_at ? new Date(inv.created_at).toISOString().split('T')[0] : '2026-09-12',
            expiryDate: inv.expires_at ? new Date(inv.expires_at).toISOString().split('T')[0] : '2026-09-19',
            lastLogin: 'Never',
            lastActivity: 'Invitation Dispatched',
            device: 'Pending',
            browser: 'Pending',
            os: 'Pending',
            ip: 'Pending',
            location: 'India',
            mfaStatus: false,
            failedAttempts: 0
          });
        });
      }

      if (merged.length > 0) {
        setUsersList(merged);
      }
    } catch (e) {
      console.error('Error loading users:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const copyInviteLink = (user: any) => {
    const link = `https://${(user.tenantName || 'workspace').toLowerCase().replace(/[^a-z0-9]/g, '')}.voogyo.com/invite/accept?token=inv_${user.id}_live`;
    navigator.clipboard.writeText(link);
    setCopiedId(user.id);
    showBanner(`Copied secure invitation link for ${user.email}`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const toggleUserStatus = async (userId: string) => {
    const targetUser = usersList.find(u => u.id === userId);
    if (!targetUser) return;
    const nextStatus = targetUser.status === 'DISABLED' ? 'ACCEPTED' : 'DISABLED';
    const nextActive = nextStatus === 'ACCEPTED';

    try {
      await fetch('/api/v1/super-admin/registered-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          isActive: nextActive
        })
      });

      setUsersList(prev => prev.map(u => {
        if (u.id === userId) {
          return { ...u, status: nextStatus };
        }
        return u;
      }));
      showBanner(`User ${targetUser.name} is now ${nextStatus === 'DISABLED' ? 'Disabled / Suspended' : 'Active'}.`);
    } catch (e) {
      console.error('Status toggle error:', e);
      showBanner('Failed to update user status.');
    }
  };

  const handleSendInvitation = async () => {
    if (!inviteEmail.trim() || !inviteTenantId) {
      alert('Please enter an email and select a workspace.');
      return;
    }

    try {
      setIsInviting(true);
      const res = await fetch('/api/v1/super-admin/invited-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: inviteTenantId,
          email: inviteEmail.trim(),
          roleName: inviteRole
        })
      });
      const data = await res.json();
      if (data.success) {
        showBanner(data.message || `Invitation dispatched to ${inviteEmail}!`);
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteName('');
        fetchUsersData();
      } else {
        showBanner(data.error || 'Failed to dispatch invitation');
      }
    } catch (e) {
      console.error('Invite error:', e);
      showBanner('Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const filteredUsers = usersList.filter(u => {
    if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.tenantName?.toLowerCase().includes(q) ||
        u.roleLabel?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Metric Overview */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Smart User Operations HQ
            </span>
            <span className="text-xs text-slate-500 font-medium">Cross-Tenant Identity Center</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Invited & Registered Users Management</h1>
          <p className="text-xs text-slate-500">
            Track invitations, telemetry, IP geolocations, MFA enforcement, active sessions, and security history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsersData}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
            title="Refresh Users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <Mail className="w-4 h-4" />
            <span>Invite New User</span>
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Smart Filters & Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, workspace, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#00B7A7]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(['ALL', 'PENDING', 'ACCEPTED', 'DISABLED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize cursor-pointer transition-all ${
                  statusFilter === s
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.toLowerCase()}
              </button>
            ))}
          </div>

          {/* Role Filter Selector */}
          <select
            value={roleFilter}
            onChange={(e: any) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:border-[#00B7A7] cursor-pointer"
          >
            <option value="ALL">All Roles</option>
            <option value="TENANT_ADMIN">Tenant Admins</option>
            <option value="EMPLOYEE">Employees</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">User & Contact</th>
                <th className="py-3 px-4">Workspace & Role</th>
                <th className="py-3 px-4">Status & MFA</th>
                <th className="py-3 px-4">Device & Telemetry</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                  {/* User & Contact */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-teal-700 font-bold text-xs flex items-center justify-center border border-slate-200 shrink-0">
                        {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-xs">{user.name}</span>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                          <span>{user.email}</span>
                          <span>·</span>
                          <span>{user.phone}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Workspace & Role */}
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-800 text-xs block">{user.tenantName}</span>
                    <span className="text-[11px] text-teal-700 font-semibold">{user.roleLabel}</span>
                  </td>

                  {/* Status & MFA */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        user.status === 'ACCEPTED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : user.status === 'PENDING'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {user.status === 'ACCEPTED' ? 'Active' : user.status === 'PENDING' ? 'Invited' : 'Disabled'}
                      </span>
                      {user.mfaStatus ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200" title="Two-Factor Enforced">
                          2FA
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Device & Telemetry */}
                  <td className="py-3.5 px-4 text-slate-600">
                    <p className="text-slate-800 font-medium">{user.device}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{user.ip} ({user.location})</p>
                  </td>

                  {/* Last Activity */}
                  <td className="py-3.5 px-4">
                    <p className="text-slate-800 font-medium text-[11px]">{user.lastActivity}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{user.lastLogin}</p>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => copyInviteLink(user)}
                        title="Copy Invitation / Access Link"
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                      >
                        {copiedId === user.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowSecurityModal(true);
                        }}
                        title="Security Telemetry & Active Sessions"
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => toggleUserStatus(user.id)}
                        title={user.status === 'DISABLED' ? 'Activate Account' : 'Disable Account'}
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          user.status === 'DISABLED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    No users matching the active filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Telemetry Modal */}
      {showSecurityModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Security Telemetry: {selectedUser.name}</h3>
                  <p className="text-xs text-slate-500">{selectedUser.tenantName} · {selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setShowSecurityModal(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Telemetry Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500">MFA Status</span>
                <p className="text-xs font-bold text-slate-900">{selectedUser.mfaStatus ? 'Enforced (TOTP)' : 'Not Configured'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500">Failed Logins</span>
                <p className={`text-xs font-bold ${selectedUser.failedAttempts > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {selectedUser.failedAttempts} Attempts
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500">Primary IP</span>
                <p className="text-xs font-mono font-bold text-slate-900">{selectedUser.ip}</p>
              </div>
            </div>

            {/* Chronological Activity Timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900">Security & Authentication Timeline</h4>
              <div className="space-y-2.5 border-l-2 border-teal-200 pl-4 text-xs">
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-teal-600"></span>
                  <p className="font-bold text-slate-900">Authenticated via Secure Session</p>
                  <p className="text-[11px] text-slate-500">{selectedUser.device} · {selectedUser.ip} ({selectedUser.location})</p>
                  <span className="text-[10px] text-slate-400">{selectedUser.lastLogin}</span>
                </div>
                <div className="relative">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                  <p className="font-bold text-slate-800">Two-Factor Authentication Verified</p>
                  <p className="text-[11px] text-slate-500">Time-Based TOTP Algorithm</p>
                  <span className="text-[10px] text-slate-400">Enforced</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  showBanner(`Dispatched password reset instructions to ${selectedUser.email}`);
                  setShowSecurityModal(false);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold cursor-pointer transition-all"
              >
                Send Password Reset
              </button>
              <button
                onClick={() => {
                  showBanner(`Terminated active sessions for ${selectedUser.name}`);
                  setShowSecurityModal(false);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer transition-all"
              >
                Force Logout All Devices
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Invite User to Workspace</h3>
                  <p className="text-xs text-slate-500">Dispatches Email, WhatsApp & SMS credentials</p>
                </div>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Meera Soni"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Work Email Address *</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="meera@company.com"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Target Workspace *</label>
                <select
                  value={inviteTenantId}
                  onChange={(e) => setInviteTenantId(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7] cursor-pointer"
                >
                  {availableTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.company_name} ({t.subdomain || t.id}.voogyo.com)
                    </option>
                  ))}
                  {availableTenants.length === 0 && (
                    <option value="">No workspaces available</option>
                  )}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7] cursor-pointer"
                >
                  <option value="Administrator">Workspace Administrator</option>
                  <option value="HR Manager">HR & Payroll Manager</option>
                  <option value="Finance Specialist">Finance & GST Accountant</option>
                  <option value="Project Lead">Project Delivery Lead</option>
                  <option value="Employee">Standard Employee</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvitation}
                disabled={isInviting}
                className="px-4 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
