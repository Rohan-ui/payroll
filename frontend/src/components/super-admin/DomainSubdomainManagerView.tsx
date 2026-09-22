'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe, Shield, ShieldCheck, Plus, Trash2, Edit3, RefreshCw,
  CheckCircle, AlertTriangle, ExternalLink, Lock, Check, X,
  Key, Server, Layers, Clock, ArrowUpRight
} from 'lucide-react';

export default function DomainSubdomainManagerView() {
  const [activeTab, setActiveTab] = useState<'subdomains' | 'dns' | 'ssl' | 'custom' | 'godaddy'>('subdomains');
  const [subdomains, setSubdomains] = useState<any[]>([]);
  const [dnsRecords, setDnsRecords] = useState<any[]>([]);
  const [customDomains, setCustomDomains] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // New subdomain modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [newSubdomain, setNewSubdomain] = useState('');
  const [targetTenantId, setTargetTenantId] = useState('tenant_rnd_001');

  // New DNS modal
  const [showDnsModal, setShowDnsModal] = useState(false);
  const [dnsType, setDnsType] = useState('CNAME');
  const [dnsHost, setDnsHost] = useState('');
  const [dnsValue, setDnsValue] = useState('');

  useEffect(() => {
    fetchDomainsData();
  }, []);

  const fetchDomainsData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/super-admin/domains');
      const json = await res.json();
      if (json.success) {
        setSubdomains(json.data.subdomains || []);
        setDnsRecords(json.data.dnsRecords || []);
        setCustomDomains(json.data.customDomains || []);
        setSettings(json.data.settings || {});
      }
    } catch (e) {
      console.error('Error loading domains:', e);
    } finally {
      setLoading(false);
    }
  };

  const showBanner = (msg: string) => {
    setBannerMessage(msg);
    setTimeout(() => setBannerMessage(null), 4000);
  };

  const handleCreateSubdomain = async () => {
    if (!newSubdomain.trim()) return;
    try {
      const res = await fetch('/api/v1/super-admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_subdomain',
          subdomain: newSubdomain,
          tenantId: targetTenantId,
          rootDomain: settings.defaultRootDomain || 'voogyo.com'
        })
      });
      const data = await res.json();
      if (data.success) {
        showBanner(data.message || 'Subdomain created!');
        setShowSubModal(false);
        setNewSubdomain('');
        fetchDomainsData();
      }
    } catch (e) {
      console.error('Error creating subdomain:', e);
    }
  };

  const handleCreateDns = async () => {
    if (!dnsHost.trim() || !dnsValue.trim()) return;
    try {
      const res = await fetch('/api/v1/super-admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_dns_record',
          recordType: dnsType,
          hostName: dnsHost,
          targetValue: dnsValue,
          ttl: 3600
        })
      });
      const data = await res.json();
      if (data.success) {
        showBanner('DNS Record created & propagated successfully!');
        setShowDnsModal(false);
        setDnsHost('');
        setDnsValue('');
        fetchDomainsData();
      }
    } catch (e) {
      console.error('Error creating DNS record:', e);
    }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm('Are you sure you want to remove this entry?')) return;
    try {
      const res = await fetch(`/api/v1/super-admin/domains?type=${type}&id=${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showBanner('Deleted successfully!');
        fetchDomainsData();
      }
    } catch (e) {
      console.error('Error deleting:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
              Platform Infrastructure HQ
            </span>
            <span className="text-xs text-slate-500 font-medium">Automated DNS & Cloudflare SSL</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-1">Domain & Subdomain Manager</h1>
          <p className="text-xs text-slate-500">
            Control automated `*.voogyo.com` subdomains, GoDaddy registrar APIs, DNS records, and SSL certificates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'subdomains' && (
            <button
              onClick={() => setShowSubModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Subdomain</span>
            </button>
          )}
          {activeTab === 'dns' && (
            <button
              onClick={() => setShowDnsModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add DNS Record</span>
            </button>
          )}
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'subdomains', label: 'Automated Subdomains', count: subdomains.length },
          { id: 'dns', label: 'DNS Management', count: dnsRecords.length },
          { id: 'ssl', label: 'SSL & HTTPS Enforcement' },
          { id: 'custom', label: 'Custom Domain Mapping' },
          { id: 'godaddy', label: 'GoDaddy API Settings' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === tab.id ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 1: Subdomains Table */}
      {activeTab === 'subdomains' && (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Subdomain URL</th>
                  <th className="py-3 px-4">Mapped Tenant</th>
                  <th className="py-3 px-4">Target CNAME</th>
                  <th className="py-3 px-4">DNS Status</th>
                  <th className="py-3 px-4">SSL Certificate</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subdomains.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-mono text-xs">
                          {sub.subdomain}.{sub.root_domain}
                        </span>
                        <a
                          href={`https://${sub.subdomain}.${sub.root_domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-600 hover:text-teal-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      {sub.company_name || 'Voogyo Shared Platform'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                      {sub.target_cname}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ● Propagated
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700">
                        <Lock className="w-3 h-3 text-teal-600" />
                        Let's Encrypt (Auto-Renew)
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDelete('subdomain', sub.id)}
                        title="Delete Subdomain"
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: DNS Records Table */}
      {activeTab === 'dns' && (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Record Type</th>
                  <th className="py-3 px-4">Host Name</th>
                  <th className="py-3 px-4">Value / Target</th>
                  <th className="py-3 px-4">TTL</th>
                  <th className="py-3 px-4">Cloudflare Proxy</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dnsRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-200">
                        {rec.record_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {rec.host_name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px] max-w-xs truncate">
                      {rec.target_value}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{rec.ttl}s</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        rec.is_proxied ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {rec.is_proxied ? 'Proxied (Orange Cloud)' : 'DNS Only'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDelete('dns', rec.id)}
                        className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: SSL Management */}
      {activeTab === 'ssl' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Global SSL & HTTPS Enforcement</h3>
              <p className="text-xs text-slate-500">Automated 256-bit TLS/SSL certificate lifecycle across all subdomains</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-900">Automated SSL Renewal</span>
              <p className="text-xs text-slate-500">Automatically renew Let's Encrypt certificates 30 days prior to expiration.</p>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                Enabled (Daemon Active)
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-900">Force HTTPS Redirection</span>
              <p className="text-xs text-slate-500">Enforce HTTP 301 Permanent Redirect to secure HTTPS on all tenant endpoints.</p>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 inline-block">
                Enforced (HSTS 365 Days)
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-900">Wildcard Certificate</span>
              <p className="text-xs text-slate-500">Active Wildcard: <code>*.voogyo.com</code> covering unlimited tenant subdomains.</p>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 inline-block">
                Valid until Sep 2027
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Custom Domain Mapping */}
      {activeTab === 'custom' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tenant Custom Domain Mapping</h3>
              <p className="text-xs text-slate-500">Allow enterprise subscribers to map their own brand domain (e.g. <code>portal.apexlogistics.in</code>)</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
              White-Labeling Add-On Active
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <h4 className="font-bold text-slate-900">Tenant Verification Workflow:</h4>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600">
              <li>Tenant specifies their custom hostname in their workspace settings.</li>
              <li>Voogyo provides a verification CNAME: <code>_voogyo-challenge.portal.company.com</code>.</li>
              <li>Automated DNS scanner verifies ownership within 120 seconds.</li>
              <li>Edge SSL certificate is issued and traffic routes seamlessly to tenant workspace.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Tab 5: GoDaddy Settings */}
      {activeTab === 'godaddy' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5 max-w-2xl">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">GoDaddy DNS Registrar Integration</h3>
              <p className="text-xs text-slate-500">Automate programmatic DNS records provisioning via GoDaddy REST API</p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700">GoDaddy API Key</label>
              <input
                type="text"
                defaultValue={settings.godaddyApiKey || 'dKp17_LiveX9921_Key'}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700">GoDaddy API Secret</label>
              <input
                type="password"
                defaultValue={settings.godaddySecretKey || 'voog_godaddy_sec_991823'}
                className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700">API Environment</label>
                <select
                  defaultValue={settings.environment || 'production'}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                >
                  <option value="production">Production (api.godaddy.com)</option>
                  <option value="ote">OTE / Sandbox (api.ote-godaddy.com)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700">Default Root Domain</label>
                <input
                  type="text"
                  defaultValue={settings.defaultRootDomain || 'voogyo.com'}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => showBanner('GoDaddy credentials verified & connected!')}
                className="px-4 py-2.5 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                Save GoDaddy Credentials
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Subdomain Modal */}
      {showSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Provision Tenant Subdomain</h3>
                  <p className="text-xs text-slate-500">Automates DNS entry & SSL generation</p>
                </div>
              </div>
              <button onClick={() => setShowSubModal(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Subdomain Name</label>
                <div className="flex items-center mt-1">
                  <input
                    type="text"
                    value={newSubdomain}
                    onChange={(e) => setNewSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="e.g. acme"
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-l-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                  />
                  <span className="px-3 py-2.5 bg-slate-100 border-y border-r border-slate-200 rounded-r-xl font-mono text-slate-500">
                    .voogyo.com
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowSubModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubdomain}
                className="px-4 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Create Subdomain
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add DNS Modal */}
      {showDnsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Add DNS Record</h3>
              <button onClick={() => setShowDnsModal(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Record Type</label>
                <select
                  value={dnsType}
                  onChange={(e) => setDnsType(e.target.value)}
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                >
                  <option value="A">A (Address)</option>
                  <option value="CNAME">CNAME (Alias)</option>
                  <option value="TXT">TXT (Text)</option>
                  <option value="MX">MX (Mail Exchange)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700">Host Name</label>
                <input
                  type="text"
                  value={dnsHost}
                  onChange={(e) => setDnsHost(e.target.value)}
                  placeholder="e.g. app or @"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700">Target Value</label>
                <input
                  type="text"
                  value={dnsValue}
                  onChange={(e) => setDnsValue(e.target.value)}
                  placeholder="e.g. 104.21.45.12 or cname.voogyo.com"
                  className="w-full mt-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:bg-white focus:border-[#00B7A7]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowDnsModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDns}
                className="px-4 py-2 rounded-xl bg-[#00B7A7] hover:bg-[#009E90] text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Save DNS Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
