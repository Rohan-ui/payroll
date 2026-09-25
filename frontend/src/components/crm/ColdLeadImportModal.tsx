'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Trash2, 
  Filter, 
  ArrowRight, 
  Check, 
  Sparkles,
  Layers,
  ChevronDown,
  User,
  Globe,
  MapPin,
  DollarSign,
  Phone,
  Building2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTenantIndustries } from '@/lib/industryTaxonomy';
import { PhoneInputWithCountryCode } from './PhoneInputWithCountryCode';
import { SORTED_COUNTRY_CODES, parsePhoneWithCountryCode, combinePhoneWithCountryCode, extractDialCode } from '@/lib/countryCodes';

import { apiFetch } from '../../api/client';
interface ColdLeadImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export interface ParsedLeadRow {
  id: string;
  dateCreated: string;
  companyName: string;
  firstName: string;
  lastName: string;
  designation: string;
  email: string;
  secondaryEmail: string;
  countryCode: string;
  phone: string;
  alternatePhone: string;
  whatsappNumber: string;
  industry: string;
  subIndustry: string;
  websiteUrl: string;
  linkedinCompanyUrl: string;
  personalLinkedInUrl: string;
  city: string;
  state: string;
  country: string;
  address: string;
  pincode: string;
  websiteStatus: 'ACTIVE' | 'INACTIVE' | 'NO_WEBSITE' | 'UNDER_CONSTRUCTION' | 'REDIRECT';
  assignedTo: string;
  leadSource: string;
  budgetAmount: string | number;
  internalNotes: string;
  temperature: 'HOT' | 'WARM' | 'COLD';
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  errors: string[];
}

export function ColdLeadImportModal({ isOpen, onClose, onSuccess }: ColdLeadImportModalProps) {
  const { industries, getSubIndustries } = useTenantIndustries();
  const [sources, setSources] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'success'>('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [skippedRows, setSkippedRows] = useState<{ row: number; reason: string }[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedLeadRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch action state
  const [batchIndustry, setBatchIndustry] = useState('');
  const [batchSource, setBatchSource] = useState('');
  const [batchCountryCode, setBatchCountryCode] = useState('');
  const [batchAssignee, setBatchAssignee] = useState('');
  const [batchStatus, setBatchStatus] = useState('');

  // Fetch tenant sources & users
  useEffect(() => {
    async function loadMasterData() {
      try {
        const [srcRes, usrRes] = await Promise.all([
          apiFetch('/api/v1/crm/masters/sources'),
          apiFetch('/api/v1/users')
        ]);
        const srcJson = await srcRes.json();
        if (srcJson.success && Array.isArray(srcJson.data)) {
          setSources(srcJson.data);
        }
        const usrJson = await usrRes.json();
        if (usrJson.success) {
          const userList = Array.isArray(usrJson.data) ? usrJson.data : (usrJson.data?.users || []);
          setUsers(userList);
        }
      } catch (err) {
        console.warn('Could not load import masters:', err);
      }
    }
    if (isOpen) {
      loadMasterData();
    }
  }, [isOpen]);

  // Download real Excel (.xlsx) template with in-cell dropdown validations
  const downloadSample = async () => {
    try {
      setDownloadingTemplate(true);
      setError(null);
      const res = await apiFetch('/api/v1/crm/leads/import/template');
      if (!res.ok) throw new Error('Failed to generate template from server');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Voogyo_Leads_Import_Template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Error downloading template:', err);
      setError('Could not download template: ' + err.message);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // Handle uploaded file and transition to Step 2 (Preview with Dropdowns)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
    if (!isExcel) {
      setError('Please upload a valid Excel (.xlsx, .xls) or CSV file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        // Prioritize data sheet over master sheet
        const wsname = wb.SheetNames.find(n => !n.toLowerCase().includes('master')) || wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (rawData.length === 0) {
          setError('The uploaded Excel file contains no data rows.');
          return;
        }

        const rows: ParsedLeadRow[] = rawData.map((row: any, idx: number) => {
          const dateCreated = String(row['Date Created'] || row['date_created'] || row['dateCreated'] || '').trim();
          const companyName = String(row['Company Name *'] || row['Company Name'] || row['companyName'] || row['Company'] || '').trim();
          const firstName = String(row['First Name *'] || row['First Name'] || row['firstName'] || '').trim();
          const lastName = String(row['Last Name'] || row['lastName'] || '').trim();
          const designation = String(row['Designation'] || row['designation'] || 'Decision Maker').trim();
          const email = String(row['Email *'] || row['Email'] || row['email'] || '').trim();
          const secondaryEmail = String(row['Secondary Email'] || row['secondaryEmail'] || row['secondary_email'] || row['alternate_email'] || '').trim();

          const rawCountryCode = String(row['Country Code *'] || row['Country Code'] || row['countryCode'] || row['country_code'] || '').trim();
          const dialCode = extractDialCode(rawCountryCode, '+91');

          let phone = String(row['Phone'] || row['phone'] || row['Phone Number'] || '').trim();
          let alternatePhone = String(row['Alternate Phone'] || row['alternatePhone'] || row['alternate_phone'] || '').trim();
          let whatsappNumber = String(row['WhatsApp Number'] || row['whatsappNumber'] || row['whatsapp_number'] || '').trim();

          if (phone && !phone.startsWith('+')) {
            phone = combinePhoneWithCountryCode(dialCode, phone);
          }
          if (alternatePhone && !alternatePhone.startsWith('+')) {
            alternatePhone = combinePhoneWithCountryCode(dialCode, alternatePhone);
          }
          if (whatsappNumber && !whatsappNumber.startsWith('+')) {
            whatsappNumber = combinePhoneWithCountryCode(dialCode, whatsappNumber);
          } else if (!whatsappNumber && phone) {
            whatsappNumber = phone;
          }

          const rawInd = String(row['Industry *'] || row['Industry'] || row['industry'] || '').trim();
          const rawSub = String(row['Sub Industry'] || row['subIndustry'] || row['Sub-Industry'] || '').trim();
          const websiteUrl = String(row['Website URL'] || row['websiteUrl'] || row['website_url'] || '').trim();
          const linkedinCompanyUrl = String(row['LinkedIn Company URL'] || row['linkedinCompanyUrl'] || row['linkedin_company_url'] || '').trim();
          const personalLinkedInUrl = String(row['Personal LinkedIn URL'] || row['personalLinkedInUrl'] || row['LinkedIn URL'] || row['linkedin_url'] || '').trim();
          const city = String(row['City'] || row['city'] || '').trim();
          const state = String(row['State'] || row['state'] || '').trim();
          const country = String(row['Country'] || row['country'] || 'India').trim();
          const address = String(row['Address'] || row['address'] || '').trim();
          const pincode = String(row['Pincode'] || row['pincode'] || row['Postal Code'] || row['postal_code'] || '').trim();
          
          const rawStatus = String(row['Website Status'] || row['websiteStatus'] || row['website_status'] || 'ACTIVE').toUpperCase().trim();
          const websiteStatus = (['ACTIVE', 'INACTIVE', 'NO_WEBSITE', 'UNDER_CONSTRUCTION', 'REDIRECT'].includes(rawStatus) ? rawStatus : 'ACTIVE') as any;

          const assignedTo = String(row['Assigned To'] || row['assignedTo'] || row['assigned_to'] || '').trim();
          const rawSource = String(row['Lead Source'] || row['leadSource'] || row['lead_source'] || row['Source'] || '').trim();
          const budgetAmount = row['Budget Amount'] || row['Budget Amount (INR)'] || row['budgetAmount'] || row['budget_amount'] || 350000;
          const internalNotes = String(row['Internal Notes'] || row['internalNotes'] || row['internal_notes'] || row['Requirement Brief'] || row['requirementBrief'] || '').trim();

          // Fuzzy-match Industry
          let matchedIndustry = industries[0]?.name || 'Manufacturing';
          if (rawInd) {
            const found = industries.find(i => 
              i.name.toLowerCase() === rawInd.toLowerCase() || 
              i.key === rawInd.toLowerCase().replace(/[^a-z0-9]+/g, '_')
            );
            if (found) matchedIndustry = found.name;
          }

          // Fuzzy-match Sub-Industry
          let matchedSubIndustry = '';
          const availableSubs = getSubIndustries(matchedIndustry);
          if (rawSub) {
            const foundSub = availableSubs.find(s => 
              s.name.toLowerCase() === rawSub.toLowerCase() || 
              s.key === rawSub.toLowerCase().replace(/[^a-z0-9]+/g, '_')
            );
            if (foundSub) matchedSubIndustry = foundSub.name;
            else matchedSubIndustry = rawSub;
          } else if (availableSubs.length > 0) {
            matchedSubIndustry = availableSubs[0].name;
          }

          // Fuzzy-match Source
          let matchedSource = sources[0]?.name || 'Cold Outreach (Outbound SOP)';
          if (rawSource) {
            const foundSrc = sources.find(s => 
              s.name.toLowerCase() === rawSource.toLowerCase() || 
              s.id === rawSource || 
              s.name.toLowerCase().includes(rawSource.toLowerCase())
            );
            if (foundSrc) matchedSource = foundSrc.name;
          }

          const errors: string[] = [];
          if (!companyName) errors.push('Missing Company Name');
          if (!firstName) errors.push('Missing First Name');
          if (!email) errors.push('Missing Email');

          return {
            id: `row_${idx}_${Date.now().toString(36)}`,
            dateCreated,
            companyName,
            firstName,
            lastName,
            designation,
            email,
            secondaryEmail,
            countryCode: dialCode,
            phone,
            alternatePhone,
            whatsappNumber,
            industry: matchedIndustry,
            subIndustry: matchedSubIndustry,
            websiteUrl,
            linkedinCompanyUrl,
            personalLinkedInUrl,
            city,
            state,
            country,
            address,
            pincode,
            websiteStatus,
            assignedTo: assignedTo || (users[0] ? `${users[0].first_name} ${users[0].last_name || ''}`.trim() : ''),
            leadSource: matchedSource,
            budgetAmount,
            internalNotes,
            temperature: 'HOT',
            urgency: 'HIGH',
            errors
          };
        });

        setParsedRows(rows);
        setStep('preview');
      } catch (err: any) {
        console.error('Error parsing file:', err);
        setError('Failed to parse the file: ' + err.message);
      }
    };

    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Update a single field in a row
  const handleUpdateRow = (id: string, field: keyof ParsedLeadRow, value: any) => {
    setParsedRows(prev => prev.map(row => {
      if (row.id !== id) return row;

      const updated = { ...row, [field]: value };

      // If industry changed, auto-update sub-industry to first valid option
      if (field === 'industry') {
        const subs = getSubIndustries(value);
        updated.subIndustry = subs[0]?.name || '';
      }

      // Revalidate errors
      const errors: string[] = [];
      if (!updated.companyName) errors.push('Missing Company Name');
      if (!updated.firstName) errors.push('Missing First Name');
      if (!updated.email) errors.push('Missing Email');
      updated.errors = errors;

      return updated;
    }));
  };

  // Delete a row from preview
  const handleDeleteRow = (id: string) => {
    setParsedRows(prev => prev.filter(r => r.id !== id));
  };

  // Apply batch field to all rows
  const handleApplyBatchIndustry = (indName: string) => {
    if (!indName) return;
    setBatchIndustry(indName);
    const subs = getSubIndustries(indName);
    const defaultSub = subs[0]?.name || '';
    setParsedRows(prev => prev.map(r => ({
      ...r,
      industry: indName,
      subIndustry: defaultSub
    })));
  };

  const handleApplyBatchSource = (srcName: string) => {
    if (!srcName) return;
    setBatchSource(srcName);
    setParsedRows(prev => prev.map(r => ({ ...r, leadSource: srcName })));
  };

  const handleApplyBatchCountryCode = (code: string) => {
    if (!code) return;
    setBatchCountryCode(code);
    setParsedRows(prev => prev.map(r => {
      const parsed = parsePhoneWithCountryCode(r.phone, code);
      const newPhone = combinePhoneWithCountryCode(code, parsed.number);
      return {
        ...r,
        phone: newPhone,
        alternatePhone: r.alternatePhone 
          ? combinePhoneWithCountryCode(code, parsePhoneWithCountryCode(r.alternatePhone, code).number) 
          : '',
        whatsappNumber: r.whatsappNumber 
          ? combinePhoneWithCountryCode(code, parsePhoneWithCountryCode(r.whatsappNumber, code).number) 
          : newPhone
      };
    }));
  };

  const handleApplyBatchAssignee = (userName: string) => {
    if (!userName) return;
    setBatchAssignee(userName);
    setParsedRows(prev => prev.map(r => ({ ...r, assignedTo: userName })));
  };

  const handleApplyBatchStatus = (status: any) => {
    if (!status) return;
    setBatchStatus(status);
    setParsedRows(prev => prev.map(r => ({ ...r, websiteStatus: status })));
  };

  // Final Submit to Backend API
  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;

    const validRows = parsedRows.filter(r => r.companyName && r.firstName && r.email);
    if (validRows.length === 0) {
      setError('Cannot import: All rows are missing required fields (Company Name, First Name, Email).');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const payload = validRows.map(r => ({
        dateCreated: r.dateCreated,
        companyName: r.companyName,
        firstName: r.firstName,
        lastName: r.lastName,
        designation: r.designation,
        email: r.email,
        secondaryEmail: r.secondaryEmail,
        countryCode: r.countryCode,
        phone: r.phone,
        alternatePhone: r.alternatePhone,
        whatsappNumber: r.whatsappNumber,
        industry: r.industry,
        subIndustry: r.subIndustry,
        websiteUrl: r.websiteUrl,
        linkedinCompanyUrl: r.linkedinCompanyUrl,
        personalLinkedInUrl: r.personalLinkedInUrl,
        city: r.city,
        state: r.state,
        country: r.country,
        address: r.address,
        pincode: r.pincode,
        websiteStatus: r.websiteStatus,
        assignedTo: r.assignedTo,
        leadSource: r.leadSource,
        budgetAmount: Number(r.budgetAmount) || 350000,
        internalNotes: r.internalNotes,
        temperature: r.temperature,
        urgency: r.urgency
      }));

      const res = await apiFetch('/api/v1/crm/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: payload })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessCount(json.data?.successCount ?? json.data?.importedCount ?? 0);
        setSkippedRows(Array.isArray(json.data?.skipped) ? json.data.skipped : []);
        setStep('success');
        onSuccess();
      } else {
        setError(json.message || json.error || 'Failed to import leads');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setParsedRows([]);
    setError(null);
    setSuccessCount(null);
    setSkippedRows([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className={`bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden transition-all duration-300 ${
        step === 'preview' ? 'w-full max-w-6xl max-h-[92vh]' : 'w-full max-w-xl max-h-[90vh]'
      }`}>
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {step === 'upload' && 'Import Leads from Excel'}
                {step === 'preview' && 'Review & Map Dynamic Dropdowns (26 Fields)'}
                {step === 'success' && 'Import Complete'}
              </h2>
              <p className="text-xs text-slate-500">
                {step === 'upload' && 'Upload leads with error-free in-cell dropdown validation'}
                {step === 'preview' && `${parsedRows.length} leads parsed • Verify and batch assign dropdowns`}
                {step === 'success' && 'Leads enrolled directly in the Outreach SOP cadence'}
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 1: UPLOAD SCREEN                                         */}
          {/* ------------------------------------------------------------- */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Feature highlight banner */}
              <div className="p-4 bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-slate-50 rounded-xl border border-indigo-100/80 space-y-2">
                <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>26 Complete Import Fields with Dynamic Dropdowns</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Download our official sample template. It features native in-cell dropdowns for 
                  <strong className="text-slate-800"> Country Code, Industry, Sub-Industry, State, Country, Website Status, Assigned To,</strong> and <strong className="text-slate-800">Lead Source</strong>, completely preventing typos.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={downloadSample}
                    disabled={downloadingTemplate}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                  >
                    {downloadingTemplate ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download Official 26-Field Excel Template (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
              >
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  Click to browse or drag & drop your Excel sheet
                </h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Supports Microsoft Excel (.xlsx, .xls) and CSV. Headers will be matched automatically.
                </p>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 2: INTERACTIVE PREVIEW & DROPDOWN MAPPING TABLE          */}
          {/* ------------------------------------------------------------- */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Batch Actions Toolbar */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-indigo-700">
                    <Filter className="w-3.5 h-3.5" />
                    <span>Quick Batch Actions (Apply to all rows)</span>
                  </span>
                  <span className="text-slate-400 font-normal">
                    {parsedRows.filter(r => r.errors.length === 0).length} valid of {parsedRows.length} rows
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Batch Country Code */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Country Code:</span>
                    <select
                      value={batchCountryCode}
                      onChange={(e) => handleApplyBatchCountryCode(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Apply Code to All...</option>
                      {SORTED_COUNTRY_CODES.map(c => (
                        <option key={`${c.iso}-${c.code}`} value={c.code}>
                          {c.flag} {c.code} ({c.name})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Batch Industry */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Industry:</span>
                    <select
                      value={batchIndustry}
                      onChange={(e) => handleApplyBatchIndustry(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Choose Industry...</option>
                      {industries.map(ind => (
                        <option key={ind.key} value={ind.name}>{ind.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Batch Source */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Lead Source:</span>
                    <select
                      value={batchSource}
                      onChange={(e) => handleApplyBatchSource(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Choose Source...</option>
                      {sources.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Batch Assignee */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Assignee:</span>
                    <select
                      value={batchAssignee}
                      onChange={(e) => handleApplyBatchAssignee(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Assign To All...</option>
                      {users.map(u => (
                        <option key={u.id} value={`${u.first_name} ${u.last_name || ''}`.trim()}>
                          {u.first_name} {u.last_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Batch Status */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Website Status:</span>
                    <select
                      value={batchStatus}
                      onChange={(e) => handleApplyBatchStatus(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">Set Status...</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="NO_WEBSITE">NO_WEBSITE</option>
                      <option value="UNDER_CONSTRUCTION">UNDER_CONSTRUCTION</option>
                      <option value="REDIRECT">REDIRECT</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Editable Table Covering All 26 Fields */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[52vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/95 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10 whitespace-nowrap">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[170px]">Company Name *</th>
                        <th className="py-2.5 px-3 min-w-[160px]">Contact Person *</th>
                        <th className="py-2.5 px-3 min-w-[140px]">Designation</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Email Address *</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Secondary Email</th>
                        <th className="py-2.5 px-3 min-w-[210px]">Phone & Country Code</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Alternate Phone</th>
                        <th className="py-2.5 px-3 min-w-[180px]">WhatsApp Number</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Industry (Dropdown) *</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Sub-Industry (Dropdown)</th>
                        <th className="py-2.5 px-3 min-w-[170px]">Website URL</th>
                        <th className="py-2.5 px-3 min-w-[150px]">Website Status</th>
                        <th className="py-2.5 px-3 min-w-[170px]">Assigned To (Dropdown)</th>
                        <th className="py-2.5 px-3 min-w-[170px]">Lead Source (Dropdown)</th>
                        <th className="py-2.5 px-3 min-w-[160px]">City / State</th>
                        <th className="py-2.5 px-3 min-w-[130px]">Country</th>
                        <th className="py-2.5 px-3 min-w-[180px]">Address & Pincode</th>
                        <th className="py-2.5 px-3 min-w-[140px]">Budget Amount</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Internal Notes</th>
                        <th className="py-2.5 px-3 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-700">
                      {parsedRows.map((row, idx) => {
                        const rowSubs = getSubIndustries(row.industry);
                        const hasErrors = row.errors.length > 0;

                        return (
                          <tr key={row.id} className={`hover:bg-slate-50/80 transition-colors ${hasErrors ? 'bg-amber-50/40' : ''}`}>
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>

                            {/* Company Name */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.companyName}
                                onChange={(e) => handleUpdateRow(row.id, 'companyName', e.target.value)}
                                placeholder="Company Name *"
                                className={`w-full px-2 py-1 bg-white border rounded-lg text-xs font-semibold text-slate-800 ${
                                  !row.companyName ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200'
                                }`}
                              />
                            </td>

                            {/* Contact Person */}
                            <td className="py-2 px-3">
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={row.firstName}
                                  onChange={(e) => handleUpdateRow(row.id, 'firstName', e.target.value)}
                                  placeholder="First *"
                                  className={`w-1/2 px-2 py-1 bg-white border rounded-lg text-xs font-medium ${
                                    !row.firstName ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200'
                                  }`}
                                />
                                <input
                                  type="text"
                                  value={row.lastName}
                                  onChange={(e) => handleUpdateRow(row.id, 'lastName', e.target.value)}
                                  placeholder="Last"
                                  className="w-1/2 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                                />
                              </div>
                            </td>

                            {/* Designation */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.designation}
                                onChange={(e) => handleUpdateRow(row.id, 'designation', e.target.value)}
                                placeholder="Director"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                              />
                            </td>

                            {/* Email */}
                            <td className="py-2 px-3">
                              <input
                                type="email"
                                value={row.email}
                                onChange={(e) => handleUpdateRow(row.id, 'email', e.target.value)}
                                placeholder="Email Address *"
                                className={`w-full px-2 py-1 bg-white border rounded-lg text-xs font-medium ${
                                  !row.email ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200'
                                }`}
                              />
                            </td>

                            {/* Secondary Email */}
                            <td className="py-2 px-3">
                              <input
                                type="email"
                                value={row.secondaryEmail}
                                onChange={(e) => handleUpdateRow(row.id, 'secondaryEmail', e.target.value)}
                                placeholder="Secondary Email"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600"
                              />
                            </td>

                            {/* Phone & Country Code */}
                            <td className="py-2 px-3 min-w-[210px]">
                              <PhoneInputWithCountryCode
                                value={row.phone}
                                onChange={(val) => {
                                  handleUpdateRow(row.id, 'phone', val);
                                  if (!row.whatsappNumber || row.whatsappNumber === row.phone) {
                                    handleUpdateRow(row.id, 'whatsappNumber', val);
                                  }
                                }}
                                placeholder="98765 43210"
                                size="sm"
                              />
                            </td>

                            {/* Alternate Phone */}
                            <td className="py-2 px-3 min-w-[180px]">
                              <PhoneInputWithCountryCode
                                value={row.alternatePhone}
                                onChange={(val) => handleUpdateRow(row.id, 'alternatePhone', val)}
                                placeholder="Alt Phone"
                                size="sm"
                              />
                            </td>

                            {/* WhatsApp Number */}
                            <td className="py-2 px-3 min-w-[180px]">
                              <PhoneInputWithCountryCode
                                isWhatsApp
                                value={row.whatsappNumber}
                                onChange={(val) => handleUpdateRow(row.id, 'whatsappNumber', val)}
                                placeholder="WhatsApp"
                                size="sm"
                              />
                            </td>

                            {/* Industry Dropdown */}
                            <td className="py-2 px-3">
                              <select
                                value={row.industry}
                                onChange={(e) => handleUpdateRow(row.id, 'industry', e.target.value)}
                                className="w-full px-2 py-1.5 bg-indigo-50/40 border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              >
                                {industries.map(ind => (
                                  <option key={ind.key} value={ind.name}>{ind.name}</option>
                                ))}
                              </select>
                            </td>

                            {/* Sub-Industry Dropdown */}
                            <td className="py-2 px-3">
                              <select
                                value={row.subIndustry}
                                onChange={(e) => handleUpdateRow(row.id, 'subIndustry', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              >
                                <option value="">Select Sub-Industry...</option>
                                {rowSubs.map(s => (
                                  <option key={s.key} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            </td>

                            {/* Website URL */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.websiteUrl}
                                onChange={(e) => handleUpdateRow(row.id, 'websiteUrl', e.target.value)}
                                placeholder="https://..."
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                              />
                            </td>

                            {/* Website Status Dropdown */}
                            <td className="py-2 px-3">
                              <select
                                value={row.websiteStatus}
                                onChange={(e) => handleUpdateRow(row.id, 'websiteStatus', e.target.value as any)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                              >
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="INACTIVE">INACTIVE</option>
                                <option value="NO_WEBSITE">NO_WEBSITE</option>
                                <option value="UNDER_CONSTRUCTION">UNDER_CONSTRUCTION</option>
                                <option value="REDIRECT">REDIRECT</option>
                              </select>
                            </td>

                            {/* Assigned To Dropdown */}
                            <td className="py-2 px-3">
                              <select
                                value={row.assignedTo}
                                onChange={(e) => handleUpdateRow(row.id, 'assignedTo', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
                              >
                                <option value="">Default (Sales Head)</option>
                                {users.map(u => (
                                  <option key={u.id} value={`${u.first_name} ${u.last_name || ''}`.trim()}>
                                    {u.first_name} {u.last_name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Lead Source Dropdown */}
                            <td className="py-2 px-3">
                              <select
                                value={row.leadSource}
                                onChange={(e) => handleUpdateRow(row.id, 'leadSource', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              >
                                {sources.map(s => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            </td>

                            {/* City / State */}
                            <td className="py-2 px-3">
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={row.city}
                                  onChange={(e) => handleUpdateRow(row.id, 'city', e.target.value)}
                                  placeholder="City"
                                  className="w-1/2 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                                />
                                <input
                                  type="text"
                                  value={row.state}
                                  onChange={(e) => handleUpdateRow(row.id, 'state', e.target.value)}
                                  placeholder="State"
                                  className="w-1/2 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                                />
                              </div>
                            </td>

                            {/* Country */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.country}
                                onChange={(e) => handleUpdateRow(row.id, 'country', e.target.value)}
                                placeholder="India"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                              />
                            </td>

                            {/* Address & Pincode */}
                            <td className="py-2 px-3">
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={row.address}
                                  onChange={(e) => handleUpdateRow(row.id, 'address', e.target.value)}
                                  placeholder="Address"
                                  className="w-2/3 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                                />
                                <input
                                  type="text"
                                  value={row.pincode}
                                  onChange={(e) => handleUpdateRow(row.id, 'pincode', e.target.value)}
                                  placeholder="Pincode"
                                  className="w-1/3 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                                />
                              </div>
                            </td>

                            {/* Budget Amount */}
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                value={row.budgetAmount}
                                onChange={(e) => handleUpdateRow(row.id, 'budgetAmount', e.target.value)}
                                placeholder="350000"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                              />
                            </td>

                            {/* Internal Notes */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.internalNotes}
                                onChange={(e) => handleUpdateRow(row.id, 'internalNotes', e.target.value)}
                                placeholder="Internal Notes"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                              />
                            </td>

                            {/* Action */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row.id)}
                                className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* STEP 3: SUCCESS SCREEN                                        */}
          {/* ------------------------------------------------------------- */}
          {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Import finished</h3>
              <p className="text-sm text-slate-600 max-w-sm">
                Imported <strong className="text-emerald-700 font-bold">{successCount} leads</strong>.
                {skippedRows.length > 0 && ` ${skippedRows.length} rows were skipped.`}
              </p>
              {skippedRows.length > 0 && (
                <ul className="max-h-40 overflow-y-auto w-full max-w-md text-left text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  {skippedRows.map((skipped) => (
                    <li key={skipped.row}>
                      Row {skipped.row}: {skipped.reason}
                    </li>
                  ))}
                </ul>
              )}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  View Active Cadence Dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {step === 'preview' && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              Back to Upload
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Ready to import {parsedRows.filter(r => r.errors.length === 0).length} of {parsedRows.length} leads
              </span>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isUploading || parsedRows.filter(r => r.errors.length === 0).length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing to CRM...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Import Leads</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
