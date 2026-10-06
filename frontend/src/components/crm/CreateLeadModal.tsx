'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Sparkles,
  X,
  RefreshCw,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Flame,
  Sun,
  Snowflake,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Check,
  UserPlus,
  Globe,
  MessageSquare
} from 'lucide-react';
import { CADENCE_INDUSTRIES } from '@/lib/coldMarketingCadence';
import {
  useTenantIndustries,
  getIndustries,
  getSubIndustries,
  getIndustryLabel,
  getSubIndustryLabel
} from '@/lib/industryTaxonomy';
import { PhoneInputWithCountryCode } from './PhoneInputWithCountryCode';

import { LINKEDIN_INVALID, normalizeLinkedInUrl } from '../../lib/outreachChannels';
import { apiFetch } from '../../api/client';
interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the created lead, so the caller can say where it went. */
  onSuccess: (lead: any) => void;
  sources: any[];
  services: any[];
  pipelines: any[];
  stages: any[];
  salesPersons: any[];
  clients: any[];
}

export default function CreateLeadModal({
  isOpen,
  onClose,
  onSuccess,
  sources,
  services,
  pipelines,
  stages,
  salesPersons,
  clients
}: CreateLeadModalProps) {
  const { industries, getSubIndustries } = useTenantIndustries();

  const [formData, setFormData] = useState({
    companyName: '',
    industry: '',
    sub_industry: '',
    firstName: '',
    lastName: '',
    designation: '',
    email: '',
    phone: '',
    whatsappNumber: '',
    linkedinUrl: '',
    websiteUrl: '',
    city: '',
    state: '',
    gstin: '',
    panNumber: '',
    sourceId: '',
    primaryService: '',
    budgetAmount: 0,
    pipelineId: '',
    stageId: '',
    assignedUserId: '',
    temperature: 'WARM',
    urgency: 'MEDIUM',
    requirementBrief: '',
    isExistingClient: false,
    clientId: '',
    enrollInCadence: false,
    cadenceIndustry: 'general'
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTaxDetails, setShowTaxDetails] = useState(false);

  // Initialize default selections when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        companyName: '',
        // Only what the user chooses is saved; nothing is preselected for them.
        industry: '',
        sub_industry: '',
        firstName: '',
        lastName: '',
        designation: '',
        email: '',
        phone: '',
        whatsappNumber: '',
        linkedinUrl: '',
        websiteUrl: '',
        city: '',
        state: '',
        gstin: '',
        panNumber: '',
        sourceId: '',
        primaryService: '',
        budgetAmount: 0,
        pipelineId: pipelines[0]?.id || '',
        stageId: stages[0]?.id || '',
        assignedUserId: '',
        temperature: 'WARM',
        urgency: 'MEDIUM',
        requirementBrief: '',
        isExistingClient: false,
        clientId: '',
        enrollInCadence: false,
        cadenceIndustry: 'general'
      });
      setErrorMsg(null);
      setShowTaxDetails(false);
    }
  }, [isOpen, sources, services, pipelines, stages, salesPersons]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const handleSelectExistingClient = (targetClient: any) => {
    if (!targetClient) return;
    const nameParts = (targetClient.contact_person || targetClient.company_name || '').trim().split(' ');
    const fName = nameParts[0] || targetClient.company_name;
    const lName = nameParts.slice(1).join(' ') || '';

    setFormData({
      ...formData,
      isExistingClient: true,
      clientId: targetClient.id,
      companyName: targetClient.company_name,
      industry: targetClient.industry || '',
      sub_industry: targetClient.sub_industry || '',
      firstName: fName,
      lastName: lName,
      email: targetClient.email || '',
      phone: targetClient.phone || '',
      city: targetClient.city || '',
      state: targetClient.state || 'Maharashtra',
      gstin: targetClient.gstin || '',
      panNumber: targetClient.pan_number || '',
      temperature: 'HOT',
      urgency: 'HIGH',
      requirementBrief: formData.requirementBrief || `Repeat business / expansion project for ${targetClient.company_name}`,
      sourceId: formData.sourceId
    });

    if (targetClient.gstin || targetClient.pan_number) {
      setShowTaxDetails(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName.trim() || !formData.firstName.trim() || !formData.email.trim()) {
      setErrorMsg('Company Name, Contact First Name, and Business Email are required.');
      return;
    }
    // Checked again (and normalized) by the server.
    if (formData.linkedinUrl.trim() && !normalizeLinkedInUrl(formData.linkedinUrl)) {
      setErrorMsg(`${LINKEDIN_INVALID} Use the address of the person's LinkedIn page, such as https://www.linkedin.com/in/name.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/v1/crm/leads', {
        // The caller announces where the lead went instead of a generic "created" toast.
        feedback: { success: false },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.data);
        onClose();
      } else {
        setErrorMsg(data.message || data.error || 'Failed to create lead');
      }
    } catch (err: any) {
      setErrorMsg('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in-50 zoom-in-95 duration-200"
      >
        {/* Sticky Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                Add New Lead
              </h3>
              <p className="text-xs text-slate-500">
                Capture prospect details or initiate an expansion project for repeat business
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-700">
            {/* Lead Origin Selector (Cards) */}
            <div className="space-y-3">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Lead Origin & Type <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option 1: New Prospect */}
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      isExistingClient: false,
                      clientId: ''
                    });
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex items-start gap-3 ${
                    !formData.isExistingClient
                      ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${!formData.isExistingClient ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 text-slate-600'}`}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${!formData.isExistingClient ? 'text-blue-950' : 'text-slate-800'}`}>
                        New Inbound Prospect
                      </span>
                      {!formData.isExistingClient && (
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      First-time inquiry or new company prospect
                    </p>
                  </div>
                </button>

                {/* Option 2: Repeat Customer */}
                <button
                  type="button"
                  onClick={() => {
                    const target = clients.find(c => c.id === formData.clientId) || clients[0];
                    if (target) {
                      handleSelectExistingClient(target);
                    } else {
                      setFormData({ ...formData, isExistingClient: true });
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex items-start gap-3 ${
                    formData.isExistingClient
                      ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${formData.isExistingClient ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-200 text-slate-600'}`}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${formData.isExistingClient ? 'text-emerald-950' : 'text-slate-800'}`}>
                        Repeat Customer
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-700">
                          {clients.length}
                        </span>
                        {formData.isExistingClient && (
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      Existing client contract expansion or follow-on deal
                    </p>
                  </div>
                </button>
              </div>

              {/* If Repeat Customer selected */}
              {formData.isExistingClient && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/80 to-teal-50/40 border border-emerald-200/90 space-y-3 animate-in fade-in-50 duration-150">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <span>Select Client / Account</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Verified Billing Auto-Fill Active
                    </span>
                  </div>
                  <select
                    value={formData.clientId}
                    onChange={(e) => {
                      const selected = clients.find(c => c.id === e.target.value);
                      if (selected) {
                        handleSelectExistingClient(selected);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-emerald-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-300/40 cursor-pointer shadow-xs"
                  >
                    {clients.length === 0 ? (
                      <option value="">No existing clients found</option>
                    ) : (
                      clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          🏢 {c.company_name} — {c.contact_person} ({c.city || 'India'})
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-[11px] text-emerald-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Opportunity linked to existing account history. AI qualification score boosted to 85%+.</span>
                  </p>
                </div>
              )}
            </div>

            {/* Section 1: Organization & Primary Contact */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Organization & Primary Contact
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Company Name */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Company Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="e.g. Acme FinTech Technologies Ltd."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                    />
                  </div>
                </div>

                {/* Industry Sector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Industry Sector <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) => {
                      const newInd = e.target.value;
                      const subList = getSubIndustries(newInd);
                      setFormData({
                        ...formData,
                        industry: newInd,
                        sub_industry: subList[0]?.name || subList[0]?.key || '',
                        cadenceIndustry: newInd
                      });
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900 cursor-pointer"
                  >
                    <option value="">Not specified</option>
                    {industries.map((ind) => (
                      <option key={ind.id || ind.key} value={ind.name}>{ind.name}</option>
                    ))}
                  </select>
                </div>

                {/* Sub-Industry Specialization */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Sub-Industry Specialization
                  </label>
                  <select
                    value={formData.sub_industry}
                    onChange={(e) => setFormData({ ...formData, sub_industry: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900 cursor-pointer"
                  >
                    <option value="">Not specified</option>
                    {getSubIndustries(formData.industry).map((sub) => (
                      <option key={sub.id || sub.key} value={sub.name}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                {/* Contact First Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="e.g. Rahul"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                    />
                  </div>
                </div>

                {/* Contact Last Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Last Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="e.g. Sharma"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                    />
                  </div>
                </div>

                {/* Designation */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Designation / Role
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      placeholder="e.g. VP Engineering / Director"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                    />
                  </div>
                </div>

                {/* Business Email */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Business Email <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="rahul@acmefintech.com"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                    />
                  </div>
                </div>

                {/* Phone & WhatsApp */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Phone / Mobile
                    </label>
                    <PhoneInputWithCountryCode
                      value={formData.phone}
                      onChange={(val) => {
                        setFormData({ 
                          ...formData, 
                          phone: val,
                          whatsappNumber: formData.whatsappNumber === formData.phone || !formData.whatsappNumber ? val : formData.whatsappNumber
                        });
                      }}
                      placeholder="98765 43210"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-emerald-600" />
                      <span>WhatsApp Number</span>
                    </label>
                    <PhoneInputWithCountryCode
                      value={formData.whatsappNumber}
                      onChange={(val) => setFormData({ ...formData, whatsappNumber: val })}
                      placeholder="98765 43210"
                      isWhatsApp={true}
                    />
                  </div>
                </div>

                {/* LinkedIn URL & Website URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-blue-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-blue-600" />
                      <span>LinkedIn Profile URL</span>
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="url"
                        value={formData.linkedinUrl}
                        onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                        placeholder="https://linkedin.com/in/prospect"
                        className="w-full pl-9 pr-3 py-2 text-xs bg-blue-50/30 border border-blue-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Company Website URL
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="url"
                        value={formData.websiteUrl}
                        onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                        placeholder="https://company.com"
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {/* City & State */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      City
                    </label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Mumbai"
                        className="w-full pl-8 pr-2.5 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      State
                    </label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="Maharashtra"
                        className="w-full pl-8 pr-2.5 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Deal & Commercials */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Briefcase className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Deal & Commercials
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Service */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Primary Service <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.primaryService}
                    onChange={(e) => {
                      const sel = services.find(s => s.name === e.target.value);
                      setFormData({ 
                        ...formData, 
                        primaryService: e.target.value,
                        budgetAmount: sel?.default_rate ? Number(sel.default_rate) : formData.budgetAmount
                      });
                    }}
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900 cursor-pointer"
                  >
                    <option value="">Not specified</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} — {formatCurrency(s.default_rate)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Deal Budget */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Deal Budget (INR ₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₹</span>
                    <input
                      type="number"
                      required
                      value={formData.budgetAmount}
                      onChange={(e) => setFormData({ ...formData, budgetAmount: Number(e.target.value) })}
                      placeholder="350000"
                      className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-slate-900"
                    />
                  </div>
                </div>

                {/* Initial Stage */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Initial Pipeline Stage <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.stageId}
                    onChange={(e) => setFormData({ ...formData, stageId: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900 cursor-pointer"
                  >
                    {stages.map((stg) => (
                      <option key={stg.id} value={stg.id}>{stg.name}</option>
                    ))}
                  </select>
                </div>

                {/* Assignee (Salesperson) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Assignee <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.assignedUserId}
                    onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900 cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {salesPersons.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.first_name} {sp.last_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lead Source */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Lead Source <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.sourceId}
                    onChange={(e) => setFormData({ ...formData, sourceId: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900 cursor-pointer"
                  >
                    <option value="">Not specified</option>
                    {sources.map((src) => (
                      <option key={src.id} value={src.id}>{src.name} ({src.channel})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: Priority & Intelligence */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Priority & Scope
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Temperature Segmented Buttons */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Deal Temperature
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, temperature: 'HOT' })}
                      className={`py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        formData.temperature === 'HOT'
                          ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-200 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5 text-rose-500" />
                      <span>Hot</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, temperature: 'WARM' })}
                      className={`py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        formData.temperature === 'WARM'
                          ? 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-200 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                      <span>Warm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, temperature: 'COLD', enrollInCadence: true })}
                      className={`py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        formData.temperature === 'COLD'
                          ? 'bg-sky-50 border-sky-300 text-sky-800 ring-2 ring-sky-200 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Snowflake className="w-3.5 h-3.5 text-sky-500" />
                      <span>Cold</span>
                    </button>
                  </div>
                </div>

                {/* Urgency Segmented Buttons */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Closing Urgency
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, urgency: 'HIGH' })}
                      className={`py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        formData.urgency === 'HIGH'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-200 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>⚡ High</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, urgency: 'MEDIUM' })}
                      className={`py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        formData.urgency === 'MEDIUM'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-200 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>⏱️ Medium</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, urgency: 'LOW' })}
                      className={`py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                        formData.urgency === 'LOW'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-200 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>📅 Low</span>
                    </button>
                  </div>
                </div>

                {/* RND Gold Funnel Cold Marketing Cadence Auto-Enroll Box */}
                <div className={`sm:col-span-2 p-3.5 rounded-xl border transition-all ${
                  formData.enrollInCadence 
                    ? 'bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200 shadow-2xs' 
                    : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enrollInCadence}
                        onChange={(e) => setFormData({ ...formData, enrollInCadence: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Auto-enroll in 30-Day Multi-Channel Client Outreach Funnel
                      </span>
                    </label>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200/60 shrink-0">
                      LinkedIn + Email + WhatsApp + Call
                    </span>
                  </div>

                  {formData.enrollInCadence && (
                    <div className="mt-3 pt-3 border-t border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in">
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-900 uppercase tracking-wider mb-1">
                          Target Industry (Layer 2 Personalization):
                        </label>
                        <select
                          value={formData.cadenceIndustry}
                          onChange={(e) => setFormData({ ...formData, cadenceIndustry: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          {industries.map((ind) => (
                            <option key={ind.id || ind.key} value={ind.name}>{ind.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="text-[11px] text-indigo-800/80 flex items-center">
                        ⚡ Day 1 Triple Launch (LinkedIn, Email, WhatsApp) will be scheduled automatically and show up on the BDE Pending Radar!
                      </div>
                    </div>
                  )}
                </div>

                {/* Requirement Brief */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Requirement Brief & Scope Notes
                  </label>
                  <textarea
                    rows={2}
                    value={formData.requirementBrief}
                    onChange={(e) => setFormData({ ...formData, requirementBrief: e.target.value })}
                    placeholder="Enter project specifications, tech stack requirements, deliverables, or client notes..."
                    className="w-full px-3 py-2 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Tax & Compliance (Collapsible Accordion) */}
            <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-slate-50/30 transition-all">
              <button
                type="button"
                onClick={() => setShowTaxDetails(!showTaxDetails)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-100/50 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">
                    Tax & Statutory Compliance
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-full">
                    Optional
                  </span>
                  {(formData.gstin || formData.panNumber) && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Details Added
                    </span>
                  )}
                </div>
                {showTaxDetails ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showTaxDetails && (
                <div className="p-4 pt-2 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white animate-in fade-in-50 duration-150">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      GSTIN (15 Alphanumeric)
                    </label>
                    <input
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                      placeholder="27AAAAA0000A1Z5"
                      maxLength={15}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      PAN Number (10 Alphanumeric)
                    </label>
                    <input
                      type="text"
                      value={formData.panNumber}
                      onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
            <span className="text-[11px] text-slate-400">
              Fields marked with <span className="text-rose-500 font-bold">*</span> are required
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Lead...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save & Qualify Lead</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
