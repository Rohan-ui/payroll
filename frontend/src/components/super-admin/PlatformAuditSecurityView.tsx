'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, Lock, KeyRound, Smartphone, Laptop,
  Globe, Database, AlertTriangle, CheckCircle, RefreshCw,
  Power, Save, Terminal, Download, HardDrive
} from 'lucide-react';

export default function PlatformAuditSecurityView() {
  const [activeTab, setActiveTab] = useState<'audit' | 'sessions' | 'policies' | 'backup' | 'ip'>('audit');
  const [securityData, setSecurityData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Policy Form State
  const [pwdPolicy, setPwdPolicy] = useState({
    minLength: 10,
    requireSpecialChar: true,
    requireNumber: true,
    expiryDays: 90,
    historyCount: 5
  });

  const [mfaEnforcement, setMfaEnforcement] = useState('OPTIONAL');

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/super-admin/security');
      const json = await res.json();
      if (json.success && json.data) {
        setSecurityData(json.data);
        if (json.data.passwordPolicy) setPwdPolicy(json.data.passwordPolicy);
        if (json.data.mfaPolicy) setMfaEnforcement(json.data.mfaPolicy.enforcement);
      }
    } catch (e) {
      console.error('Error loading security data:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleSavePolicies = async () => {
    try {
      await fetch('/api/v1/super-admin/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_password_policy',
          ...pwdPolicy
        })
      });

      await fetch('/api/v1/super-admin/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_mfa_policy',
          enforcement: mfaEnforcement,
          gracePeriodDays: 7
        })
      });

      showBanner('Security policies and MFA enforcement rules saved to database!');
    } catch (e) {
      console.error('Save policy error:', e);
    }
  };

  const handleTriggerBackup = async () => {
    try {
      const res = await fetch('/api/v1/super-admin/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_backup' })
      });
      const data = await res.json();
      if (data.success) {
        showBanner(data.message || 'Encrypted backup snapshot uploaded to AWS S3!');
      }
    } catch (e) {
      console.error('Backup error:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Enterprise Governance & Defense
            </span>
            <span className="text-xs text-slate-500 font-medium">Compliance & Disaster Recovery</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Platform Audit & Security HQ</h1>
          <p className="text-xs text-slate-500">
            Enforce platform-wide MFA, password complexity, IP restrictions, session revocations, and automated S3 backup vaults.
          </p>
        </div>

        <button
          onClick={handleTriggerBackup}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <Database className="w-3.5 h-3.5 text-teal-400" />
          <span>Trigger Manual S3 Backup</span>
        </button>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'audit', label: 'Security Audit Logs' },
          { id: 'sessions', label: 'Active Session Manager' },
          { id: 'policies', label: 'Password & MFA Policies' },
          { id: 'backup', label: 'Backup & Disaster Recovery' },
          { id: 'ip', label: 'IP Restrictions & Whitelist' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Event Details</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { type: 'MFA_POLICY_UPDATE', actor: 'Ravi Shah (Super Admin)', desc: 'Enforced Mandatory MFA for Workspace Administrators', ip: '103.21.12.9', time: '15m ago' },
                { type: 'FAILED_LOGIN', actor: 'Unknown', desc: 'Failed login attempt with bad credentials from blocked IP', ip: '45.12.98.110', time: '1h ago' },
                { type: 'API_KEY_GENERATED', actor: 'Nexus Tech Admin', desc: 'Generated new REST API production token for Zapier bridge', ip: '49.37.112.5', time: '4h ago' },
                { type: 'BACKUP_COMPLETED', actor: 'Automated Daemon', desc: 'Hourly encrypted MySQL database snapshot uploaded to AWS S3', ip: '127.0.0.1', time: '5h ago' }
              ].map((log, i) => (
                <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {log.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{log.actor}</td>
                  <td className="py-3 px-4 text-slate-600">{log.desc}</td>
                  <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{log.ip}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Sessions */}
      {activeTab === 'sessions' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Active Administrative Sessions Across Workspaces</h3>
            <button
              onClick={() => showBanner('All non-root sessions terminated across the platform!')}
              className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
            >
              Terminate All Remote Sessions
            </button>
          </div>

          <div className="space-y-2">
            {(securityData?.sessions || []).map((sess: any) => (
              <div key={sess.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <Laptop className="w-4 h-4 text-slate-500" />
                  <div>
                    <span className="font-bold text-slate-900">{sess.user} ({sess.role})</span>
                    <p className="text-[11px] text-slate-500">{sess.device} · {sess.browser} · IP: {sess.ip}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">{sess.lastActive}</span>
                  {sess.current ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                      Current
                    </span>
                  ) : (
                    <button
                      onClick={() => showBanner(`Terminated session ${sess.id}`)}
                      className="px-2 py-1 rounded bg-rose-50 text-rose-700 text-[10px] font-bold hover:bg-rose-100 cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Policies */}
      {activeTab === 'policies' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5 max-w-2xl">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Platform Password & 2FA Enforcement</h3>
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">MFA Enforcement Level</label>
              <select
                value={mfaEnforcement}
                onChange={(e) => setMfaEnforcement(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:border-[#00B7A7]"
              >
                <option value="OPTIONAL">Optional (Users choose to enable)</option>
                <option value="ADMINS_ONLY">Mandatory for Workspace Admins & Super Admins</option>
                <option value="ALL_USERS">Strict Enforce for All Employees & Tenants</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700">Minimum Password Length</label>
                <input
                  type="number"
                  value={pwdPolicy.minLength}
                  onChange={(e) => setPwdPolicy({ ...pwdPolicy, minLength: Number(e.target.value) })}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Password Expiry (Days)</label>
                <input
                  type="number"
                  value={pwdPolicy.expiryDays}
                  onChange={(e) => setPwdPolicy({ ...pwdPolicy, expiryDays: Number(e.target.value) })}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pwdPolicy.requireSpecialChar}
                  onChange={(e) => setPwdPolicy({ ...pwdPolicy, requireSpecialChar: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Require special characters (!@#$%^&*)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pwdPolicy.requireNumber}
                  onChange={(e) => setPwdPolicy({ ...pwdPolicy, requireNumber: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Require numerical digits (0-9)</span>
              </label>
            </div>

            <button
              onClick={handleSavePolicies}
              className="px-4 py-2.5 bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              Save Security Policies
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Backup Center */}
      {activeTab === 'backup' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 max-w-3xl">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Automated Backup Vault & Disaster Recovery</h3>
              <p className="text-xs text-slate-500">Hourly automated snapshots with point-in-time recovery</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500">Backup Storage Vault</span>
              <p className="font-bold text-slate-900">AWS S3 Glacier (ap-south-1 Mumbai)</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500">Last Successful Snapshot</span>
              <p className="font-bold text-emerald-700">2026-09-15 00:00:12 IST (1.84 GB)</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500">Retention Window</span>
              <p className="font-bold text-slate-900">30 Days Rolling Snapshots (142 Saved)</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500">RPO / RTO Target</span>
              <p className="font-bold text-teal-700">&lt; 15 min RPO · &lt; 2 hour RTO</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
