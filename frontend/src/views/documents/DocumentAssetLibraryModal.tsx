import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Check,
  Trash2,
  Edit2,
  X,
  FileCheck,
  Search,
  Sparkles,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../lib/toast';
import {
  documentsApi,
  type DocumentAssetItem,
  type DocumentAssetCategory,
} from '../../api/documents.api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: {
    src: string;
    assetId: string;
    name: string;
    category: DocumentAssetCategory;
    widthPx: number;
    heightPx: number;
  }) => void;
  initialCategory?: DocumentAssetCategory | 'ALL';
  isSignatureOnly?: boolean;
}

const CATEGORIES: { id: DocumentAssetCategory | 'ALL'; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'ALL', label: 'All Assets', icon: Layers },
  { id: 'AUTHORIZED_SIGNATURE', label: 'Signatures', icon: FileCheck },
  { id: 'STAMP_SEAL', label: 'Stamps & Seals', icon: Sparkles },
  { id: 'COMPANY_LOGO', label: 'Company Logos', icon: ImageIcon },
  { id: 'OTHER', label: 'Other Images', icon: ImageIcon },
];

export const DocumentAssetLibraryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSelect,
  initialCategory = 'ALL',
  isSignatureOnly = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<DocumentAssetCategory | 'ALL'>(
    isSignatureOnly ? 'AUTHORIZED_SIGNATURE' : initialCategory
  );
  const [assets, setAssets] = useState<DocumentAssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState<DocumentAssetCategory>(
    isSignatureOnly ? 'AUTHORIZED_SIGNATURE' : initialCategory === 'ALL' ? 'OTHER' : initialCategory
  );
  const [uploadDimensions, setUploadDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rename state
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Fetch assets
  const loadAssets = async () => {
    try {
      setLoading(true);
      const cat = selectedCategory === 'ALL' ? undefined : selectedCategory;
      const res = await documentsApi.listAssets(cat);
      setAssets(res);
    } catch (e) {
      toast.error('Failed to load asset library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAssets();
    }
  }, [isOpen, selectedCategory]);

  useEffect(() => {
    if (isSignatureOnly) {
      setSelectedCategory('AUTHORIZED_SIGNATURE');
      setUploadCategory('AUTHORIZED_SIGNATURE');
    }
  }, [isSignatureOnly]);

  // Handle file selection for upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      toast.error('Only PNG, JPG, JPEG, and WebP images are supported.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5 MB limit.');
      return;
    }

    setUploadFile(file);
    const defaultName = file.name.replace(/\.[^/.]+$/, '');
    setUploadName(defaultName);

    // Read preview and dimensions
    const reader = new FileReader();
    reader.onload = (readEvent) => {
      const dataUrl = readEvent.target?.result as string;
      setUploadPreview(dataUrl);

      const img = new Image();
      img.onload = () => {
        setUploadDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Perform upload
  const handleUploadSubmit = async (autoInsert = false) => {
    if (!uploadFile) return;

    try {
      setIsUploading(true);
      const uploaded = await documentsApi.uploadAsset(uploadFile, {
        name: uploadName.trim() || uploadFile.name,
        category: uploadCategory,
        widthPx: uploadDimensions.width,
        heightPx: uploadDimensions.height,
      });

      toast.success('Asset uploaded successfully');
      setUploadFile(null);
      setUploadPreview(null);
      setUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      await loadAssets();

      if (autoInsert) {
        onSelect({
          src: documentsApi.assetFileUrl(uploaded.id),
          assetId: uploaded.id,
          name: uploaded.name,
          category: uploaded.category,
          widthPx: uploaded.widthPx || 300,
          heightPx: uploaded.heightPx || 100,
        });
        onClose();
      }
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete asset
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from the asset library?`)) {
      return;
    }

    try {
      await documentsApi.deleteAsset(id);
      toast.success('Asset deleted');
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete asset');
    }
  };

  // Rename asset
  const handleRenameSubmit = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      const updated = await documentsApi.renameAsset(id, editingName.trim());
      setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setEditingAssetId(null);
      toast.success('Asset renamed');
    } catch (e: any) {
      toast.error(e.message || 'Failed to rename asset');
    }
  };

  if (!isOpen) return null;

  const filteredAssets = assets.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog
      title={isSignatureOnly ? 'Insert Authorized Signature' : 'Document Image & Signature Library'}
      description={
        isSignatureOnly
          ? 'Choose a saved authorized signature or upload a transparent signature image.'
          : 'Insert signatures, stamps, company logos, or upload custom images.'
      }
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        {/* Category Tabs */}
        {!isSignatureOnly && (
          <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#2B293E] pb-2">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Upload Box */}
        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          {!uploadFile ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {isSignatureOnly
                      ? 'Upload Handwritten Signature'
                      : 'Upload New Image or Signature'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    PNG (transparent recommended), JPG, WebP up to 5 MB
                  </p>
                </div>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white shadow-sm"
                >
                  Browse File
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Checkerboard Preview Box */}
                <div
                  className="w-24 h-20 rounded-lg border border-slate-200 dark:border-[#2B293E] overflow-hidden flex items-center justify-center relative shrink-0"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                    backgroundSize: '12px 12px',
                    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                  }}
                >
                  {uploadPreview && (
                    <img
                      src={uploadPreview}
                      alt="Upload preview"
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                </div>

                {/* Upload Fields */}
                <div className="flex-1 w-full space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Asset name"
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      className="flex-1 h-8 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs px-2.5"
                    />
                    {!isSignatureOnly && (
                      <select
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value as DocumentAssetCategory)}
                        className="h-8 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs px-2"
                      >
                        <option value="AUTHORIZED_SIGNATURE">Signature</option>
                        <option value="STAMP_SEAL">Stamp / Seal</option>
                        <option value="COMPANY_LOGO">Company Logo</option>
                        <option value="OTHER">Other Image</option>
                      </select>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {uploadDimensions.width > 0 && (
                      <span>
                        Original dimensions: {uploadDimensions.width} × {uploadDimensions.height} px
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload actions */}
              <div className="flex justify-end gap-2 pt-1 border-t border-slate-200 dark:border-[#2B293E]">
                <button
                  type="button"
                  onClick={() => {
                    setUploadFile(null);
                    setUploadPreview(null);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => handleUploadSubmit(false)}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-teal-500 text-teal-600 dark:text-teal-400 hover:bg-teal-50 disabled:opacity-50"
                >
                  Save to Library
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => handleUploadSubmit(true)}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
                >
                  {isUploading ? 'Uploading…' : 'Upload & Insert'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search saved assets…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs"
          />
        </div>

        {/* Assets Grid */}
        <div className="max-h-72 overflow-y-auto pr-1">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-slate-100 dark:bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No assets found. Upload an image above to get started.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredAssets.map((asset) => {
                const fileUrl = documentsApi.assetFileUrl(asset.id);
                return (
                  <div
                    key={asset.id}
                    className="group relative rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] p-2 hover:border-teal-400 transition-shadow hover:shadow-md flex flex-col justify-between"
                  >
                    {/* Checkerboard Image Container */}
                    <div
                      className="w-full h-24 rounded-lg overflow-hidden flex items-center justify-center relative cursor-pointer"
                      onClick={() => {
                        onSelect({
                          src: fileUrl,
                          assetId: asset.id,
                          name: asset.name,
                          category: asset.category,
                          widthPx: asset.widthPx || 300,
                          heightPx: asset.heightPx || 100,
                        });
                        onClose();
                      }}
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)',
                        backgroundSize: '10px 10px',
                        backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                      }}
                    >
                      <img
                        src={fileUrl}
                        alt={asset.name}
                        className="max-w-full max-h-full object-contain p-1 pointer-events-none"
                      />
                    </div>

                    {/* Metadata & Actions */}
                    <div className="mt-2 space-y-1">
                      {editingAssetId === asset.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 h-6 text-xs px-1.5 rounded border border-teal-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSubmit(asset.id);
                              if (e.key === 'Escape') setEditingAssetId(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameSubmit(asset.id)}
                            className="text-teal-600 hover:text-teal-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate flex-1"
                            title={asset.name}
                          >
                            {asset.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAssetId(asset.id);
                              setEditingName(asset.name);
                            }}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100"
                            title="Rename"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(asset.id, asset.name)}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>
                          {asset.widthPx} × {asset.heightPx} px
                        </span>
                        <Badge variant="neutral" size="sm">
                          {asset.category === 'AUTHORIZED_SIGNATURE'
                            ? 'Signature'
                            : asset.category === 'STAMP_SEAL'
                            ? 'Stamp'
                            : asset.category === 'COMPANY_LOGO'
                            ? 'Logo'
                            : 'Other'}
                        </Badge>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onSelect({
                            src: fileUrl,
                            assetId: asset.id,
                            name: asset.name,
                            category: asset.category,
                            widthPx: asset.widthPx || 300,
                            heightPx: asset.heightPx || 100,
                          });
                          onClose();
                        }}
                        className="w-full mt-1.5 py-1 text-center text-xs font-semibold rounded bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100"
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
