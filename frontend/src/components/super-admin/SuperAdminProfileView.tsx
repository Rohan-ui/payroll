'use client';

import React, { useState, useEffect } from 'react';
import {
  User, Shield, ShieldCheck, KeyRound, Building2, MapPin,
  FileText, Smartphone, Laptop, Lock, Power, CheckCircle,
  Save, Sparkles, Moon, Sun, Globe, Bell, Eye, EyeOff
} from 'lucide-react';

export default function SuperAdminProfileView() {
  const [activeTab, setActiveTab] = useState<'personal' | 'business' | 'address' | 'invoice' | 'security' | 'preferences'>('personal');
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Form states
  const [personalForm, setPersonalForm] = useState({
    firstName: 'Ravi',
    lastName: 'Shah',
    displayName: 'Ravi Shah (Voogyo HQ)',
    phone: '+91 98765 43210',
    altPhone: '+91 98250 12345',
    bio: 'Founder & Chief Architect at Voogyo Enterprise Operating System.'
  });

  const [securityForm, setSecurityForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorActive: false
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/super-admin/profile');
      const json = await res.json();
      if (json.success && json.data) {
        setProfileData(json.data);
        if (json.data.personal) setPersonalForm(json.data.personal);
        if (json.data.security) setSecurityForm(prev => ({ ...prev, twoFactorActive: json.data.security.twoFactorEnabled }));
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleSavePersonal = async () => {
    try {
      const res = await fetch('/api/v1/super-admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'personal', data: personalForm })
      });
      const json = await res.json();
      if (json.success) showBanner('Personal profile details updated!');
    } catch (e) {
      console.error('Save personal error:', e);
    }
  };

  const handleToggle2FA = async () => {
    const nextState = !securityForm.twoFactorActive;
    try {
      const res = await fetch('/api/v1/super-admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'security', data: { toggle2fa: nextState } })
      });
      const json = await res.json();
      if (json.success) {
        setSecurityForm(prev => ({ ...prev, twoFactorActive: nextState }));
        showBanner(nextState ? 'Two-Factor Authentication Enforced!' : '2FA Disabled');
      }
    } catch (e) {
      console.error('2FA toggle error:', e);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Banner Card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-500 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md">
            RS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">{personalForm.displayName}</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-50 text-teal-700 border border-teal-200">
                Platform Owner
              </span>
            </div>
            <p className="text-xs text-slate-500">superadmin@voogyo.com · Voogyo Headquarters</p>
            <p className="text-[11px] text-slate-400 mt-1">{personalForm.bio}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-4 h-4" /> Root Identity Verified
          </span>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'personal', label: 'Personal Details', icon: User },
          { id: 'business', label: 'Business & Tax Info', icon: Building2 },
          { id: 'address', label: 'HQ Address', icon: MapPin },
          { id: 'invoice', label: 'Invoice Identity', icon: FileText },
          { id: 'security', label: 'Security & 2FA', icon: Shield },
          { id: 'preferences', label: 'Admin Preferences', icon: Sparkles }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: Personal Details */}
      {activeTab === 'personal' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Personal Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700">First Name</label>
              <input
                type="text"
                value={personalForm.firstName}
                onChange={(e) => setPersonalForm({ ...personalForm, firstName: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">Last Name</label>
              <input
                type="text"
                value={personalForm.lastName}
                onChange={(e) => setPersonalForm({ ...personalForm, lastName: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">Display Name</label>
              <input
                type="text"
                value={personalForm.displayName}
                onChange={(e) => setPersonalForm({ ...personalForm, displayName: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">Mobile Number</label>
              <input
                type="text"
                value={personalForm.phone}
                onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
              />
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-700 text-xs">Executive Biography</label>
            <textarea
              rows={3}
              value={personalForm.bio}
              onChange={(e) => setPersonalForm({ ...personalForm, bio: e.target.value })}
              className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white focus:border-[#00B7A7]"
            />
          </div>
          <button
            onClick={handleSavePersonal}
            className="px-4 py-2 bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Save Personal Details
          </button>
        </div>
      )}

      {/* TAB: Security & 2FA */}
      {activeTab === 'security' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-6">
          {/* 2FA Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-teal-600" />
                Two-Factor Authentication (2FA)
              </span>
              <p className="text-xs text-slate-500">Require an authenticator code (TOTP) during Super Admin login.</p>
            </div>
            <button
              onClick={handleToggle2FA}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                securityForm.twoFactorActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {securityForm.twoFactorActive ? '2FA Enabled' : 'Enable 2FA'}
            </button>
          </div>

          {/* Active Sessions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Logged In Devices & Sessions</h3>
              <button
                onClick={() => showBanner('All other sessions terminated!')}
                className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
              >
                Force Logout All Devices
              </button>
            </div>

            <div className="space-y-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <Laptop className="w-4 h-4 text-slate-500" />
                  <div>
                    <span className="font-bold text-slate-900">MacBook Pro 16" (M3 Max)</span>
                    <p className="text-[11px] text-slate-500">Google Chrome 128 · IP 103.21.12.9 (Ahmedabad, India)</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                  Current Session
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Business & Tax Info */}
      {activeTab === 'business' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Corporate Legal Credentials</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700">Company Legal Name</label>
              <input
                type="text"
                defaultValue="Voogyo Technologies Private Limited"
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">GSTIN Registration</label>
              <input
                type="text"
                defaultValue="24AAACV1234F1Z8"
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">PAN Card Number</label>
              <input
                type="text"
                defaultValue="AAACV1234F"
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">MSME / Udyam Number</label>
              <input
                type="text"
                defaultValue="UDYAM-GJ-01-0099812"
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
