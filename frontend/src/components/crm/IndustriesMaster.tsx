'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Edit3, Trash2, RefreshCw, Layers, CheckCircle2, X } from 'lucide-react';

export default function IndustriesMaster() {
  const [industries, setIndustries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'industry' | 'sub_industry'>('industry');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{ name: string; industry_id?: string }>({ name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const normalizeIndustries = (raw: any): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((item, idx) => ({
        id: item.id || item.key || `ind-${idx}`,
        key: item.key || item.id,
        name: item.name || item.industry_name || item.title || item.key || 'Industry',
        sub_industries: Array.isArray(item.sub_industries)
          ? item.sub_industries
          : Array.isArray(item.subIndustries)
          ? item.subIndustries
          : [],
        ...item,
      }));
    }
    if (typeof raw === 'object') {
      const source = raw.industries && (Array.isArray(raw.industries) || typeof raw.industries === 'object')
        ? raw.industries
        : raw;
      if (Array.isArray(source)) {
        return normalizeIndustries(source);
      }
      return Object.entries(source).map(([key, val]: [string, any], idx) => {
        const itemObj = typeof val === 'object' && val !== null ? val : { name: String(val) };
        return {
          id: itemObj.id || itemObj.key || key || `ind-${idx}`,
          key: itemObj.key || key,
          name: itemObj.name || key.replace(/_/g, ' ').toUpperCase(),
          sub_industries: Array.isArray(itemObj.sub_industries)
            ? itemObj.sub_industries
            : Array.isArray(itemObj.subIndustries)
            ? itemObj.subIndustries
            : [],
          ...itemObj,
        };
      });
    }
    return [];
  };

  const fetchIndustries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/crm/masters/industries');
      const json = await res.json();
      if (json && json.success) {
        setIndustries(normalizeIndustries(json.data));
      } else if (Array.isArray(json)) {
        setIndustries(normalizeIndustries(json));
      } else if (json && json.data) {
        setIndustries(normalizeIndustries(json.data));
      } else {
        setIndustries(normalizeIndustries(json));
      }
    } catch (err: any) {
      console.error(err);
      showToast('Failed to load industries', 'error');
      setIndustries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndustries();
  }, []);

  const handleOpenAddIndustry = () => {
    setModalType('industry');
    setEditingId(null);
    setFormData({ name: '' });
    setShowModal(true);
  };

  const handleOpenEditIndustry = (ind: any) => {
    setModalType('industry');
    setEditingId(ind.id);
    setFormData({ name: ind.name });
    setShowModal(true);
  };

  const handleOpenAddSubIndustry = (indId: string) => {
    setModalType('sub_industry');
    setEditingId(null);
    setFormData({ name: '', industry_id: indId });
    setShowModal(true);
  };

  const handleOpenEditSubIndustry = (sub: any) => {
    setModalType('sub_industry');
    setEditingId(sub.id);
    setFormData({ name: sub.name, industry_id: sub.industry_id });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    
    setSubmitting(true);
    try {
      let url = '/api/v1/crm/masters/industries';
      if (modalType === 'sub_industry') {
        url = '/api/v1/crm/masters/industries/sub';
      }

      const method = editingId ? 'PUT' : 'POST';
      const body = { ...formData, id: editingId };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      
      if (json.success) {
        showToast(`${modalType === 'industry' ? 'Industry' : 'Sub-Industry'} saved successfully`);
        setShowModal(false);
        fetchIndustries();
      } else {
        showToast(json.error || 'Failed to save', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, type: 'industry' | 'sub_industry') => {
    if (!confirm(`Are you sure you want to delete this ${type.replace('_', ' ')}?`)) return;

    try {
      const url = type === 'industry' 
        ? `/api/v1/crm/masters/industries?id=${id}` 
        : `/api/v1/crm/masters/industries/sub?id=${id}`;

      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      
      if (json.success) {
        showToast('Deleted successfully');
        fetchIndustries();
      } else {
        showToast(json.error || 'Failed to delete', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }

  const safeIndustries = Array.isArray(industries) ? industries : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 uppercase tracking-wider">
              Global CRM Setting
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
              Leads • Accounts • Customers
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Global Industry & Sub-Industry Taxonomy
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Common classification taxonomy applied universally across all CRM modules (Cold Outreach, Sales Pipeline, Quotations, and future Customer Accounts).
          </p>
        </div>
        <button
          onClick={handleOpenAddIndustry}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Main Industry
        </button>
      </div>

      {/* List */}
      <div className="bg-white dark:bg-[#181724] rounded-2xl border border-slate-200 dark:border-[#2B293E] overflow-hidden shadow-sm">
        {safeIndustries.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <Layers className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p>No industries found. Add your first industry above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {safeIndustries.map((ind: any) => (
              <div key={ind.id} className="p-6 hover:bg-slate-50/50 dark:hover:bg-[#1E1D2D]/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                      {ind.name}
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#252336] text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        {ind.sub_industries?.length || 0} Sub-sectors
                      </span>
                    </h3>
                    {ind.tagline && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{ind.tagline}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenAddSubIndustry(ind.id)}
                      className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Add Sub-Industry"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEditIndustry(ind)}
                      className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Edit Industry"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(ind.id, 'industry')}
                      className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Delete Industry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-industries tags */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {ind.sub_industries?.map((sub: any) => (
                    <div
                      key={sub.id || sub.name}
                      className="group flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#15141F] border border-slate-200 dark:border-[#2B293E] rounded-lg shadow-xs text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:shadow-sm transition-all"
                    >
                      <span>{sub.name}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 border-l border-slate-200 dark:border-[#2B293E] pl-1.5">
                        <button
                          onClick={() => handleOpenEditSubIndustry(sub)}
                          className="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(sub.id, 'sub_industry')}
                          className="p-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!ind.sub_industries || ind.sub_industries.length === 0) && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 italic">No sub-industries defined</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#181724] max-w-md w-full rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-[#2B293E] animate-in zoom-in-95">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              {editingId ? 'Edit' : 'Add'} {modalType === 'industry' ? 'Industry' : 'Sub-Industry'}
            </h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={`e.g. ${modalType === 'industry' ? 'Manufacturing' : 'Chemicals'}`}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#15141F] border border-slate-200 dark:border-[#2B293E] rounded-xl text-sm font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1E1D2D] rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-70 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold animate-in slide-in-from-top ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
