import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { onboardingApi, type DocumentTypeItem } from '../../api/onboarding.api';

const actionClass =
  'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 transition-colors';
const primaryClass =
  'px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 transition-colors';
const dangerClass =
  'px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 transition-colors';

const inputClass =
  'w-full bg-slate-50 dark:bg-[#1E1D2D] border border-slate-200 dark:border-[#2B293E] rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:bg-slate-100 disabled:text-slate-500';
const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';

export const DocumentTypesMaster: React.FC = () => {
  const [items, setItems] = useState<DocumentTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; item: DocumentTypeItem } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DocumentTypeItem | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    onboardingApi
      .listDocumentTypes()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (item: DocumentTypeItem) => {
    setBusy(item.id);
    try {
      await onboardingApi.deleteDocumentType(item.id);
      toast.success(`${item.name} removed`);
      setDeleteConfirm(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete document type.');
    } finally {
      setBusy(null);
    }
  };

  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Candidate Document Types</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure dynamic upload limits, required slots (such as Front & Back), allowed formats, and verification rules for candidate onboarding.
          </p>
        </div>
        <button type="button" onClick={() => setModal({ mode: 'create' })} className={primaryClass}>
          + Add Document Type
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Document Types</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{items.length}</p>
        </div>
        <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Required by Default</p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400 mt-0.5">
            {items.filter((i) => i.isRequired).length}
          </p>
        </div>
        <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Slotted (Front/Back)</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {items.filter((i) => i.slots && i.slots.length > 0).length}
          </p>
        </div>
        <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Active Types</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {items.filter((i) => i.isActive).length}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Search document types by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} max-w-sm`}
        />
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline font-bold">
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="h-48 rounded-xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#2B293E] bg-slate-50/50 dark:bg-[#181724]/50">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No document types found</p>
          <p className="text-xs text-slate-500 mt-1">
            {search ? 'Try adjusting your search criteria.' : 'Create your first document type to configure candidate upload requirements.'}
          </p>
          {!search && (
            <button type="button" onClick={() => setModal({ mode: 'create' })} className={`${primaryClass} mt-3`}>
              + Add Document Type
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#2B293E] bg-slate-50/70 dark:bg-[#1E1D2D]/60 text-slate-600 dark:text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Document Name & Code</th>
                <th className="py-2.5 px-3">Requirement</th>
                <th className="py-2.5 px-3">Files Allowed</th>
                <th className="py-2.5 px-3">Slots / Structure</th>
                <th className="py-2.5 px-3">Formats & Size</th>
                <th className="py-2.5 px-3">Rules</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
              {filtered.map((item) => {
                const isSlotted = Array.isArray(item.slots) && item.slots.length > 0;
                const maxMb = Math.round(item.maxFileSizeBytes / (1024 * 1024));

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-3 px-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">{item.code}</p>
                      {item.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={item.isRequired ? 'danger' : 'neutral'} size="sm">
                        {item.isRequired ? 'Required' : 'Optional'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.minFiles === item.maxFiles
                          ? `${item.minFiles} file${item.minFiles > 1 ? 's' : ''}`
                          : `${item.minFiles}–${item.maxFiles} files`}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {isSlotted ? (
                        <div className="flex flex-wrap gap-1">
                          {item.slots?.map((s) => (
                            <span
                              key={s}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">
                          {item.maxFiles > 1 ? 'Generic multi-file' : 'Single file'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {item.allowPdf && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800">
                            PDF
                          </span>
                        )}
                        {item.allowImages && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800">
                            JPG / PNG
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 ml-1">Up to {maxMb} MB</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                      <p>{item.requiresVerification ? '✓ Requires HR review' : '✕ Auto-verified'}</p>
                      <p>{item.canReuploadRejected ? '✓ Candidate can replace' : '✕ Replacement disabled'}</p>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={item.isActive ? 'success' : 'neutral'} size="sm">
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setModal({ mode: 'edit', item })}
                          className={actionClass}
                          aria-label={`Edit ${item.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() => setDeleteConfirm(item)}
                          className={dangerClass}
                          aria-label={`Delete ${item.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create Modal */}
      {modal && (
        <DocumentTypeEditorModal
          initial={modal.mode === 'edit' ? modal.item : undefined}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <Dialog
          title={`Delete ${deleteConfirm.name}?`}
          description="If this document type is currently in use by candidate onboarding requests, it will be safely deactivated instead of deleted, preserving all existing documents and audit records."
          size="sm"
          onClose={() => setDeleteConfirm(null)}
          footer={
            <>
              <button type="button" onClick={() => setDeleteConfirm(null)} className={actionClass}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === deleteConfirm.id}
                onClick={() => handleDelete(deleteConfirm)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {busy === deleteConfirm.id ? 'Deleting…' : 'Delete Document Type'}
              </button>
            </>
          }
        >
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#1E1D2D] text-xs space-y-1">
            <p>
              <span className="font-semibold">Code:</span> {deleteConfirm.code}
            </p>
            <p>
              <span className="font-semibold">Requirement:</span> {deleteConfirm.isRequired ? 'Required' : 'Optional'}
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
};

interface EditorModalProps {
  initial?: DocumentTypeItem;
  onClose: () => void;
  onSaved: () => void;
}

const DocumentTypeEditorModal: React.FC<EditorModalProps> = ({ initial, onClose, onSaved }) => {
  const isEditing = Boolean(initial);

  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isRequired, setIsRequired] = useState(initial?.isRequired ?? true);
  const [minFiles, setMinFiles] = useState(initial?.minFiles ?? 1);
  const [maxFiles, setMaxFiles] = useState(initial?.maxFiles ?? 1);
  const [allowImages, setAllowImages] = useState(initial?.allowImages ?? true);
  const [allowPdf, setAllowPdf] = useState(initial?.allowPdf ?? true);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(
    initial?.maxFileSizeBytes ? Math.round(initial.maxFileSizeBytes / (1024 * 1024)) : 10,
  );
  const [requiresVerification, setRequiresVerification] = useState(initial?.requiresVerification ?? true);
  const [canReuploadRejected, setCanReuploadRejected] = useState(initial?.canReuploadRejected ?? true);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  // Slots
  const [mode, setMode] = useState<'slotted' | 'generic' | 'single'>(
    initial?.slots && initial.slots.length > 0 ? 'slotted' : initial?.maxFiles && initial.maxFiles > 1 ? 'generic' : 'single',
  );
  const [slots, setSlots] = useState<string[]>(initial?.slots ?? []);
  const [newSlot, setNewSlot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-generate code from name if creating
  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing) {
      setCode(val.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
    }
  };

  const applyPreset = (preset: 'aadhaar' | 'pan' | 'certificates' | 'letters') => {
    if (preset === 'aadhaar') {
      setName((prev) => prev || 'Aadhaar Card');
      setCode((prev) => prev || 'AADHAAR_CARD');
      setMode('slotted');
      setSlots(['Front Side', 'Back Side']);
      setMinFiles(2);
      setMaxFiles(2);
      setAllowImages(true);
      setAllowPdf(true);
    } else if (preset === 'pan') {
      setName((prev) => prev || 'PAN Card');
      setCode((prev) => prev || 'PAN_CARD');
      setMode('single');
      setSlots([]);
      setMinFiles(1);
      setMaxFiles(1);
      setAllowImages(true);
      setAllowPdf(true);
    } else if (preset === 'certificates') {
      setName((prev) => prev || 'Education Certificate');
      setCode((prev) => prev || 'EDUCATION_CERTIFICATE');
      setMode('generic');
      setSlots([]);
      setMinFiles(1);
      setMaxFiles(5);
      setAllowImages(true);
      setAllowPdf(true);
    } else if (preset === 'letters') {
      setName((prev) => prev || 'Experience Letter');
      setCode((prev) => prev || 'EXPERIENCE_LETTER');
      setMode('generic');
      setSlots([]);
      setMinFiles(1);
      setMaxFiles(5);
      setAllowImages(true);
      setAllowPdf(true);
    }
  };

  const addSlot = () => {
    const trimmed = newSlot.trim();
    if (!trimmed) return;
    if (slots.includes(trimmed)) {
      return setError(`Slot "${trimmed}" already exists.`);
    }
    const next = [...slots, trimmed];
    setSlots(next);
    setMinFiles(next.length);
    setMaxFiles(next.length);
    setNewSlot('');
    setError(null);
  };

  const removeSlot = (index: number) => {
    const next = slots.filter((_, i) => i !== index);
    setSlots(next);
    setMinFiles(Math.max(1, next.length));
    setMaxFiles(Math.max(1, next.length));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter a document name.');
    if (!code.trim()) return setError('Please enter a document code.');
    if (!allowImages && !allowPdf) return setError('Please allow either images or PDF documents (or both).');

    if (mode === 'slotted') {
      if (slots.length < 2) {
        return setError('Named slots mode requires at least 2 slots (e.g. Front Side, Back Side).');
      }
    }

    if (minFiles < 1) return setError('Minimum files must be at least 1.');
    if (maxFiles < minFiles) return setError('Maximum files cannot be less than minimum files.');

    const allowedFormats: string[] = [];
    if (allowPdf) allowedFormats.push('application/pdf');
    if (allowImages) allowedFormats.push('image/jpeg', 'image/png');

    const payload = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim() || undefined,
      isRequired,
      minFiles: mode === 'slotted' ? slots.length : minFiles,
      maxFiles: mode === 'slotted' ? slots.length : maxFiles,
      allowImages,
      allowPdf,
      allowedFormats,
      maxFileSizeBytes: Math.max(1, maxFileSizeMb) * 1024 * 1024,
      requiresFrontBack: mode === 'slotted' && slots.includes('Front Side') && slots.includes('Back Side'),
      allowMultiplePages: mode === 'generic' || maxFiles > 1,
      requiresVerification,
      canReuploadRejected,
      slots: mode === 'slotted' ? slots : [],
      isActive,
    };

    setSaving(true);
    setError(null);

    try {
      if (isEditing && initial) {
        await onboardingApi.updateDocumentType(initial.id, payload);
        toast.success(`${payload.name} updated`);
      } else {
        await onboardingApi.createDocumentType(payload);
        toast.success(`${payload.name} created`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save document type.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={isEditing ? `Edit ${initial?.name}` : 'New Document Type'}
      description="Configure document requirement rules, file limits, named slots, and format constraints."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} className={primaryClass}>
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Document Type'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
            {error}
          </div>
        )}

        {!isEditing && (
          <div className="p-3 rounded-xl border border-teal-100 bg-teal-50/50 dark:border-teal-900/40 dark:bg-teal-950/20">
            <p className="text-[11px] font-semibold text-teal-800 dark:text-teal-300">Quick Presets:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('aadhaar')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-teal-300 bg-white dark:bg-[#181724] text-teal-800 dark:text-teal-200 hover:bg-teal-50"
              >
                Aadhaar (Front + Back)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('pan')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-teal-300 bg-white dark:bg-[#181724] text-teal-800 dark:text-teal-200 hover:bg-teal-50"
              >
                PAN (1 Image)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('certificates')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-teal-300 bg-white dark:bg-[#181724] text-teal-800 dark:text-teal-200 hover:bg-teal-50"
              >
                Certificates (1–5 Files)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('letters')}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-teal-300 bg-white dark:bg-[#181724] text-teal-800 dark:text-teal-200 hover:bg-teal-50"
              >
                Letters (1–5 Files)
              </button>
            </div>
          </div>
        )}

        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Document Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Aadhaar Card, Degree Certificate"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Document Code *</label>
            <input
              type="text"
              required
              disabled={isEditing}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AADHAAR_CARD"
              className={`${inputClass} font-mono uppercase`}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Description / Instructions for Candidate</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Please provide clear photos or scanned copies of both sides."
            className={inputClass}
          />
        </div>

        {/* Upload Mode */}
        <div className="border border-slate-200 dark:border-[#2B293E] p-3.5 rounded-xl space-y-3 bg-slate-50/40 dark:bg-[#1E1D2D]/30">
          <label className={labelClass}>Upload Structure & File Limits *</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('single');
                setSlots([]);
                setMinFiles(1);
                setMaxFiles(1);
              }}
              className={`p-2 rounded-lg border text-left transition-colors ${
                mode === 'single'
                  ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200 font-semibold'
                  : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] text-slate-700 dark:text-slate-300'
              }`}
            >
              <p className="text-xs">Single File</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Exactly 1 image or PDF (e.g. PAN)</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('slotted');
                if (slots.length === 0) setSlots(['Front Side', 'Back Side']);
                setMinFiles(slots.length || 2);
                setMaxFiles(slots.length || 2);
              }}
              className={`p-2 rounded-lg border text-left transition-colors ${
                mode === 'slotted'
                  ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200 font-semibold'
                  : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] text-slate-700 dark:text-slate-300'
              }`}
            >
              <p className="text-xs">Named Upload Slots</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Front/Back, Passport pages, etc.</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('generic');
                setSlots([]);
                setMinFiles(1);
                setMaxFiles(5);
              }}
              className={`p-2 rounded-lg border text-left transition-colors ${
                mode === 'generic'
                  ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200 font-semibold'
                  : 'border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] text-slate-700 dark:text-slate-300'
              }`}
            >
              <p className="text-xs">Generic Multi-File</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Min–Max range (Certificates, etc.)</p>
            </button>
          </div>

          {/* Named Slots Manager */}
          {mode === 'slotted' && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-2.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Configured Slots ({slots.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s, idx) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSlot(idx)}
                      className="text-indigo-400 hover:text-indigo-700 font-bold"
                      title={`Remove ${s}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="e.g. Front Side, Back Side, Address Page…"
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSlot();
                    }
                  }}
                  className={`${inputClass} flex-1`}
                />
                <button type="button" onClick={addSlot} className={actionClass}>
                  + Add Slot
                </button>
              </div>
            </div>
          )}

          {/* Generic Multi-file min/max inputs */}
          {mode === 'generic' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className={labelClass}>Minimum Files Required</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={minFiles}
                  onChange={(e) => setMinFiles(parseInt(e.target.value, 10) || 1)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Maximum Files Allowed</label>
                <input
                  type="number"
                  min={minFiles}
                  max={20}
                  value={maxFiles}
                  onChange={(e) => setMaxFiles(parseInt(e.target.value, 10) || 1)}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>

        {/* Accepted Formats & File Size */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Accepted File Formats</label>
            <div className="flex items-center gap-4 pt-1 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPdf}
                  onChange={(e) => setAllowPdf(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>PDF Documents</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowImages}
                  onChange={(e) => setAllowImages(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Images (JPG, PNG)</span>
              </label>
            </div>
          </div>
          <div>
            <label className={labelClass}>Max Size Per File (MB)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxFileSizeMb}
              onChange={(e) => setMaxFileSizeMb(parseInt(e.target.value, 10) || 10)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="pt-2 border-t border-slate-100 dark:border-[#2B293E] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Required Document</span>
              <p className="text-[11px] text-slate-500">Must be verified before candidate is ready to join.</p>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresVerification}
              onChange={(e) => setRequiresVerification(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Requires HR Verification</span>
              <p className="text-[11px] text-slate-500">Files require explicit HR approval.</p>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={canReuploadRejected}
              onChange={(e) => setCanReuploadRejected(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Candidate Re-upload</span>
              <p className="text-[11px] text-slate-500">Allows uploading a replacement copy if rejected.</p>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Active</span>
              <p className="text-[11px] text-slate-500">Available to ask in onboarding requests.</p>
            </div>
          </label>
        </div>
      </form>
    </Dialog>
  );
};
