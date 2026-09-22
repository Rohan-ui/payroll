'use client';

import React, { useState, useEffect } from 'react';
import {
  KeyRound, Shield, ShieldCheck, Copy, Plus, Trash2, Check,
  Sparkles, Layers, Building2, Search, X, CheckCircle, Save,
  CheckSquare, Square, RefreshCw
} from 'lucide-react';

interface RoleTemplate {
  id: string;
  name: string;
  code: string;
  description: string;
  department: string;
  permissions_json: string;
  is_system: number;
}

export default function TenantRolesBuilderView({ tenantId }: { tenantId?: string }) {
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleTemplate | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New role form state
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleDept, setNewRoleDept] = useState('GENERAL');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  // Modules permission matrix
  const modulesList = [
    { id: 'crm', label: 'B2B Sales CRM', description: 'Leads, pipelines, deals, activities, client vault' },
    { id: 'hrms', label: 'Biometric HRMS & Payroll', description: 'Employee records, biometric attendance, leaves, Form 16 payroll' },
    { id: 'pm', label: 'Agile Projects & Sprints', description: 'Projects, milestones, Kanban boards, timesheets' },
    { id: 'finance', label: 'GST Invoicing & Finance', description: 'GST tax invoices, quotations, expense ledger, payment reconciliations' },
    { id: 'ai', label: 'Gemini AI Copilot', description: 'Autonomous lead qualification, meeting summaries, draft generator' },
    { id: 'api', label: 'Developer APIs & Webhooks', description: 'REST API tokens, webhook subscriptions, integration logs' }
  ];

  const permissionActions = [
    { key: 'view', label: 'View Pages' },
    { key: 'create', label: 'Create Records' },
    { key: 'edit', label: 'Edit Data' },
    { key: 'delete', label: 'Delete Records' },
    { key: 'export', label: 'Export CSV/PDF' },
    { key: 'import', label: 'Import Data' },
    { key: 'ai', label: 'AI Copilot' }
  ];

  useEffect(() => {
    fetchTemplates();
  }, []);

  // When selectedRole changes, parse and set permissions state
  useEffect(() => {
    if (selectedRole) {
      try {
        const raw = typeof selectedRole.permissions_json === 'string'
          ? JSON.parse(selectedRole.permissions_json || '{}')
          : (selectedRole.permissions_json || {});
        
        const norm: Record<string, string[]> = {};
        modulesList.forEach(m => {
          norm[m.id] = Array.isArray(raw[m.id]) ? [...raw[m.id]] : [];
        });
        setRolePermissions(norm);
      } catch (e) {
        console.error('Error parsing permissions json:', e);
        const empty: Record<string, string[]> = {};
        modulesList.forEach(m => { empty[m.id] = []; });
        setRolePermissions(empty);
      }
    }
  }, [selectedRole]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/super-admin/roles-templates');
      const json = await res.json();
      if (json.success) {
        const tpls: RoleTemplate[] = json.data.templates || [];
        setTemplates(tpls);
        if (tpls.length > 0 && !selectedRole) {
          setSelectedRole(tpls[0]);
        }
      }
    } catch (e) {
      console.error('Error loading role templates:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  // Toggle a single permission checkbox
  const togglePermission = (moduleId: string, actionKey: string) => {
    setRolePermissions(prev => {
      const current = prev[moduleId] || [];
      const hasAction = current.includes(actionKey);
      const updated = hasAction
        ? current.filter(a => a !== actionKey)
        : [...current, actionKey];
      return {
        ...prev,
        [moduleId]: updated
      };
    });
  };

  // Check all boxes for all modules
  const checkAllBoxes = () => {
    const allActions = permissionActions.map(a => a.key);
    const updated: Record<string, string[]> = {};
    modulesList.forEach(m => {
      updated[m.id] = [...allActions];
    });
    setRolePermissions(updated);
    showBanner(`All permission boxes checked for '${selectedRole?.name}'!`);
  };

  // Uncheck all boxes for all modules
  const uncheckAllBoxes = () => {
    const updated: Record<string, string[]> = {};
    modulesList.forEach(m => {
      updated[m.id] = [];
    });
    setRolePermissions(updated);
    showBanner(`All permission boxes cleared for '${selectedRole?.name}'.`);
  };

  // Toggle all boxes for a specific module
  const toggleModuleAll = (moduleId: string) => {
    const allActions = permissionActions.map(a => a.key);
    const current = rolePermissions[moduleId] || [];
    const isAllChecked = allActions.every(a => current.includes(a));

    setRolePermissions(prev => ({
      ...prev,
      [moduleId]: isAllChecked ? [] : [...allActions]
    }));
  };

  const isModuleAllChecked = (moduleId: string) => {
    const allActions = permissionActions.map(a => a.key);
    const current = rolePermissions[moduleId] || [];
    return allActions.every(a => current.includes(a));
  };

  const areAllBoxesChecked = () => {
    const allActions = permissionActions.map(a => a.key);
    return modulesList.every(m => {
      const current = rolePermissions[m.id] || [];
      return allActions.every(a => current.includes(a));
    });
  };

  const countTotalCheckedBoxes = () => {
    let count = 0;
    modulesList.forEach(m => {
      count += (rolePermissions[m.id] || []).length;
    });
    return count;
  };

  // Save permissions to MariaDB
  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    try {
      setIsSaving(true);
      const res = await fetch('/api/v1/super-admin/roles-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_permissions',
          id: selectedRole.id,
          permissions: rolePermissions
        })
      });
      const data = await res.json();
      if (data.success) {
        showBanner(`All permissions saved for role '${selectedRole.name}'!`);
        // Update local state so switching roles preserves edits
        const updatedJson = JSON.stringify(rolePermissions);
        setTemplates(prev => prev.map(t => t.id === selectedRole.id ? { ...t, permissions_json: updatedJson } : t));
        setSelectedRole(prev => prev ? { ...prev, permissions_json: updatedJson } : null);
      } else {
        showBanner(data.error || 'Failed to save permissions');
      }
    } catch (e) {
      console.error('Save permissions error:', e);
      showBanner('Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = (role: RoleTemplate) => {
    setNewRoleName(`${role.name} (Copy)`);
    setNewRoleCode(`${role.code}_COPY`);
    setNewRoleDept(role.department);
    setNewRoleDesc(`Duplicated custom configuration of ${role.name}`);
    setShowCreateModal(true);
  };

  const handleDeleteRole = async (role: RoleTemplate) => {
    if (role.is_system) {
      alert('System roles cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to delete role '${role.name}'?`)) return;

    try {
      const res = await fetch(`/api/v1/super-admin/roles-templates?id=${role.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showBanner(`Role '${role.name}' deleted successfully.`);
        if (selectedRole?.id === role.id) {
          setSelectedRole(null);
        }
        fetchTemplates();
      } else {
        showBanner(data.error || 'Could not delete role.');
      }
    } catch (e) {
      console.error('Delete role error:', e);
    }
  };

  const handleSaveNewRole = async () => {
    if (!newRoleName.trim()) return;

    try {
      const res = await fetch('/api/v1/super-admin/roles-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_template',
          name: newRoleName,
          code: newRoleCode || newRoleName.toUpperCase().replace(/\s+/g, '_'),
          description: newRoleDesc,
          department: newRoleDept,
          permissions: rolePermissions
        })
      });
      const data = await res.json();
      if (data.success) {
        showBanner(`Role template '${newRoleName}' created successfully!`);
        setShowCreateModal(false);
        fetchTemplates();
      }
    } catch (e) {
      console.error('Error saving role template:', e);
    }
  };

  const totalPossibleBoxes = modulesList.length * permissionActions.length;
  const totalChecked = countTotalCheckedBoxes();

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-50/70 via-white to-blue-50/70 border border-teal-200/80 flex items-center justify-between flex-wrap gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Tenant Roles & Granular Permission Matrix</h3>
            <p className="text-xs text-slate-500">
              Configure department-based roles, export permissions, and AI copilot actions for tenant workspaces.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setNewRoleName('');
              setNewRoleCode('');
              setNewRoleDept('GENERAL');
              setNewRoleDesc('');
              setShowCreateModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Custom Role</span>
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* 2-Column Layout: Roles List (Left) & Granular Matrix (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Role List */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search roles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#00B7A7]"
            />
          </div>

          <div className="space-y-2">
            {templates
              .filter(t => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((role) => {
                const isSelected = selectedRole?.id === role.id;
                return (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-50/80 border-[#00B7A7] shadow-sm ring-1 ring-[#00B7A7]/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{role.name}</span>
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-mono font-bold">
                        {role.code}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{role.description}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/80 text-[10px]">
                      <span className="text-teal-700 font-semibold">{role.department}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(role);
                          }}
                          title="Duplicate Role Template"
                          className="text-slate-400 hover:text-teal-600 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Clone</span>
                        </button>
                        {!role.is_system && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role);
                            }}
                            title="Delete Role Template"
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right Column: Permission Matrix */}
        <div className="md:col-span-2 space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          {selectedRole ? (
            <>
              {/* Role Header & Actions Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900">{selectedRole.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                      {selectedRole.department}
                    </span>
                    {selectedRole.is_system ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600">
                        System Template
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSavePermissions}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                    <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>

              {/* Global "Check All Boxes" Control Bar */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">Permission Matrix:</span>
                  <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold text-[11px]">
                    {totalChecked} / {totalPossibleBoxes} Boxes Checked
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={checkAllBoxes}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Check All Boxes</span>
                  </button>

                  <button
                    type="button"
                    onClick={uncheckAllBoxes}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>Uncheck All</span>
                  </button>
                </div>
              </div>

              {/* Module-by-Module Permission Matrix */}
              <div className="space-y-4">
                {modulesList.map((mod) => {
                  const modChecked = rolePermissions[mod.id] || [];
                  const isAllModChecked = isModuleAllChecked(mod.id);

                  return (
                    <div key={mod.id} className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{mod.label}</span>
                            <span className="text-[10px] text-teal-700 font-mono font-bold uppercase">({mod.id})</span>
                          </div>
                          <p className="text-[10px] text-slate-500">{mod.description}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleModuleAll(mod.id)}
                          className="px-2.5 py-1 rounded-md text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                        >
                          {isAllModChecked ? (
                            <>
                              <CheckSquare className="w-3 h-3 text-teal-600" />
                              <span>Deselect All</span>
                            </>
                          ) : (
                            <>
                              <Square className="w-3 h-3 text-slate-400" />
                              <span>Select All</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Action Checkboxes (Controlled) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200/60">
                        {permissionActions.map((act) => {
                          const isChecked = modChecked.includes(act.key);

                          return (
                            <label
                              key={act.key}
                              className={`flex items-center gap-2 p-2 rounded-lg border transition cursor-pointer text-xs select-none ${
                                isChecked
                                  ? 'bg-teal-50/70 border-teal-300 text-teal-900 font-semibold'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(mod.id, act.key)}
                                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                              />
                              <span className="text-[11px]">{act.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">Select a role to inspect or edit permissions.</div>
          )}
        </div>
      </div>

      {/* Create / Duplicate Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create Reusable Role Template</h3>
                  <p className="text-xs text-slate-500">Deployable across customer workspaces</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Role Title</label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Lead Developer"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Role Code</label>
                <input
                  type="text"
                  value={newRoleCode}
                  onChange={(e) => setNewRoleCode(e.target.value.toUpperCase())}
                  placeholder="e.g. LEAD_DEV"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Department</label>
                <select
                  value={newRoleDept}
                  onChange={(e) => setNewRoleDept(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                >
                  <option value="MANAGEMENT">Management & Strategy</option>
                  <option value="SALES">Sales & Business Development</option>
                  <option value="HR">Human Resources</option>
                  <option value="FINANCE">Finance & Accounts</option>
                  <option value="OPERATIONS">Operations & Logistics</option>
                  <option value="ENGINEERING">Software Engineering</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700">Description</label>
                <textarea
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Role scope and authority..."
                  rows={2}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewRole}
                className="px-4 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Create Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
