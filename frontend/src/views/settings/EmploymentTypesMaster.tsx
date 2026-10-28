import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  employmentTypesApi,
  type CreateEmploymentTypeInput,
  type EmploymentTypeItem,
  type UpdateEmploymentTypeInput,
} from '../../api/employment-types.api';
import { toast } from '../../lib/toast';

interface Props {
  canEdit?: boolean;
}

export const EmploymentTypesMaster: React.FC<Props> = ({ canEdit = true }) => {
  const [types, setTypes] = useState<EmploymentTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EmploymentTypeItem | null>(null);
  const [modalForm, setModalForm] = useState<{
    name: string;
    code: string;
    description: string;
    status: 'ACTIVE' | 'INACTIVE';
  }>({
    name: '',
    code: '',
    description: '',
    status: 'ACTIVE',
  });
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<EmploymentTypeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await employmentTypesApi.list({
        search: search.trim() || undefined,
        status: statusFilter,
      });
      setTypes(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load employment types.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setModalForm({
      name: '',
      code: '',
      description: '',
      status: 'ACTIVE',
    });
    setModalError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (item: EmploymentTypeItem) => {
    setEditingItem(item);
    setModalForm({
      name: item.name,
      code: item.code,
      description: item.description || '',
      status: item.status,
    });
    setModalError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = modalForm.name.trim();
    if (!trimmedName) {
      setModalError('Please enter an employment type name.');
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      if (editingItem) {
        const updateInput: UpdateEmploymentTypeInput = {
          name: trimmedName,
          description: modalForm.description.trim() || undefined,
          status: modalForm.status,
        };
        const updated = await employmentTypesApi.update(editingItem.id, updateInput);
        toast.success(`Employment type "${updated.name}" updated`);
      } else {
        const createInput: CreateEmploymentTypeInput = {
          name: trimmedName,
          code: modalForm.code.trim() || undefined,
          description: modalForm.description.trim() || undefined,
          status: modalForm.status,
        };
        const created = await employmentTypesApi.create(createInput);
        toast.success(`Employment type "${created.name}" created`);
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setModalError(err?.message || 'Could not save employment type.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: EmploymentTypeItem) => {
    const nextStatus: 'ACTIVE' | 'INACTIVE' = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await employmentTypesApi.setStatus(item.id, nextStatus);
      toast.success(`"${item.name}" is now ${nextStatus === 'ACTIVE' ? 'active' : 'inactive'}`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || `Failed to update status.`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await employmentTypesApi.delete(deleteTarget.id);
      toast.success(`Employment type "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete employment type.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            Employment Types
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage contract categories offered across hiring, candidates, and team members.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            aria-label="Refresh employment types"
            className="p-2 rounded-xl border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add employment type
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {error}
          </span>
          <button type="button" onClick={loadData} className="font-bold underline">
            Try again
          </button>
        </div>
      )}

      {/* Filter and search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employment types by name, code or description..."
            className="w-full bg-slate-50 dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#181724] p-1 rounded-xl border border-slate-200 dark:border-[#2B293E]">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-2 flex items-center gap-1">
            <Filter className="w-3 h-3" aria-hidden="true" /> Filter:
          </span>
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                statusFilter === status
                  ? 'bg-white dark:bg-[#2B293E] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {status === 'ALL' ? 'All' : status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      {/* Main List Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1E1D2D] border-b border-slate-200 dark:border-[#2B293E] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th scope="col" className="px-4 py-3">Employment Type</th>
                <th scope="col" className="px-4 py-3">Code</th>
                <th scope="col" className="px-4 py-3">Description</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">In Use By</th>
                <th scope="col" className="px-4 py-3">Created</th>
                {canEdit && <th scope="col" className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]/60 text-slate-700 dark:text-slate-300">
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-28" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-16" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-44" /></td>
                    <td className="px-4 py-3.5"><div className="h-5 bg-slate-200 dark:bg-white/10 rounded-full w-14" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-20" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded w-20" /></td>
                    {canEdit && <td className="px-4 py-3.5 text-right"><div className="h-6 bg-slate-200 dark:bg-white/10 rounded w-12 ml-auto" /></td>}
                  </tr>
                ))
              ) : types.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                        <Briefcase className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {search ? 'No matching employment types' : 'No employment types have been configured'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {search
                            ? 'Try refining your search term or clearing the status filter.'
                            : 'Set up employment types such as Full-time, Part-time, Contract, or Internship for candidates and employees.'}
                        </p>
                      </div>
                      {canEdit && !search && (
                        <button
                          type="button"
                          onClick={handleOpenAdd}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Add your first employment type
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                types.map((item) => {
                  const isActive = item.status === 'ACTIVE';
                  const totalRefs = item.candidatesCount + item.offersCount + item.employeesCount;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {item.name}
                      </td>
                      <td className="px-4 py-3">
                        <code className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                          {item.code}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={item.description || undefined}>
                        {item.description || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            isActive
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                              : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10'
                          }`}
                        >
                          {isActive ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          ) : (
                            <XCircle className="w-3 h-3 text-slate-400" aria-hidden="true" />
                          )}
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {totalRefs > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium" title={`${item.candidatesCount} candidates, ${item.offersCount} offers, ${item.employeesCount} employees`}>
                            <Users className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                            {totalRefs} {totalRefs === 1 ? 'record' : 'records'}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                          {formatDate(item.createdAt)}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(item)}
                              title={isActive ? 'Deactivate employment type' : 'Activate employment type'}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                isActive
                                  ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              }`}
                            >
                              {isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              aria-label={`Edit ${item.name}`}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              aria-label={`Delete ${item.name}`}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="employment-type-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-[#2B293E] flex items-center justify-between">
              <h3 id="employment-type-modal-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {editingItem ? `Edit ${editingItem.name}` : 'Add Employment Type'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {modalError && (
                <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label htmlFor="employment-type-name" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Name *
                </label>
                <input
                  id="employment-type-name"
                  type="text"
                  required
                  maxLength={120}
                  value={modalForm.name}
                  onChange={(e) => setModalForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Full-time, Internship, Contract"
                  className="w-full bg-slate-50 dark:bg-[#1E1D2D] border border-slate-200 dark:border-[#2B293E] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              {!editingItem && (
                <div>
                  <label htmlFor="employment-type-code" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Code <span className="text-slate-400 font-normal">(optional, auto-generated if blank)</span>
                  </label>
                  <input
                    id="employment-type-code"
                    type="text"
                    maxLength={64}
                    value={modalForm.code}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. FULL_TIME"
                    className="w-full bg-slate-50 dark:bg-[#1E1D2D] border border-slate-200 dark:border-[#2B293E] rounded-xl px-3 py-2 text-xs font-mono font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              )}

              <div>
                <label htmlFor="employment-type-desc" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="employment-type-desc"
                  rows={3}
                  maxLength={500}
                  value={modalForm.description}
                  onChange={(e) => setModalForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this contract or employment arrangement..."
                  className="w-full bg-slate-50 dark:bg-[#1E1D2D] border border-slate-200 dark:border-[#2B293E] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
                />
              </div>

              <div>
                <label htmlFor="employment-type-status" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Status
                </label>
                <select
                  id="employment-type-status"
                  value={modalForm.status}
                  onChange={(e) => setModalForm((prev) => ({ ...prev, status: e.target.value as 'ACTIVE' | 'INACTIVE' }))}
                  className="w-full bg-slate-50 dark:bg-[#1E1D2D] border border-slate-200 dark:border-[#2B293E] rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  <option value="ACTIVE">Active (available for selection)</option>
                  <option value="INACTIVE">Inactive (hidden for new candidates)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Saving…' : editingItem ? 'Save changes' : 'Create employment type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] rounded-2xl shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 id="delete-dialog-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Delete &ldquo;{deleteTarget.name}&rdquo;?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {deleteTarget.isReferenced
                    ? `This employment type is currently referenced by ${
                        deleteTarget.candidatesCount + deleteTarget.offersCount + deleteTarget.employeesCount
                      } records. Deleting it is prevented to protect historical records. You can deactivate it instead.`
                    : 'This employment type has no existing records referencing it. Are you sure you want to permanently delete it?'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              {deleteTarget.isReferenced ? (
                <button
                  type="button"
                  onClick={async () => {
                    await handleToggleStatus(deleteTarget);
                    setDeleteTarget(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
                >
                  Deactivate instead
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete permanently'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmploymentTypesMaster;
