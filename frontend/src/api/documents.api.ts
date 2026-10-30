import { apiClient, apiFetch } from './client';
import { fetchFile, postForPdf, uploadForm } from './onboarding.api';

/**
 * Documents & letterheads: the organization's document templates (offer
 * letters, quotations, appraisal letters) and the letterheads they print on.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

const BASE = '/documents';
const qs = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value) search.set(key, value); });
  const text = search.toString();
  return text ? `?${text}` : '';
};

export type TemplateKind = 'OFFER_LETTER' | 'QUOTATION' | 'APPRAISAL_LETTER';

export interface TemplateSummary {
  id: string;
  kind: string;
  name: string;
  isArchived: boolean;
  approvedVersion: { id: string; number: number; title: string } | null;
  draftVersion: { id: string; number: number } | null;
}

/**
 * A formatted letter: the document editor's (Tiptap / ProseMirror) JSON, the one
 * source of truth that the editor shows and the PDF prints.
 */
export interface LetterDocument {
  type: string;
  attrs?: Record<string, unknown>;
  content?: LetterDocument[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** How documents print, from the server: the fonts the PDF can show, and how unformatted text looks. */
export interface DocumentFormat {
  style: {
    fontFamily: string;
    fontSize: number;
    color: string;
    lineHeight: number;
    paragraph: { spaceBefore: number; spaceAfter: number };
    listParagraph: { spaceBefore: number; spaceAfter: number };
    headings: Record<'1' | '2' | '3' | '4', { fontSize: number; bold: boolean; italic: boolean; color: string; spaceBefore: number; spaceAfter: number }>;
    headingLineHeight: number;
    listIndentMm: number;
    rule: { spaceBefore: number; spaceAfter: number; thickness: number; color: string };
    table: { spaceBefore: number; spaceAfter: number };
    script: { scale: number; raise: number; drop: number };
  };
  fonts: { key: string; label: string; css: string }[];
  fontSizes: { min: number; max: number; presets: number[] };
}

export interface TemplateDetail {
  id: string;
  kind: string;
  name: string;
  isArchived: boolean;
  placeholders: { key: string; description: string }[];
  format: DocumentFormat;
  versions: {
    id: string;
    number: number;
    status: 'DRAFT' | 'APPROVED' | 'RETIRED';
    title: string;
    body: string;
    /** PLAIN: plain text from before formatting, shown converted; saving it makes it FORMATTED. */
    format: 'FORMATTED' | 'PLAIN';
    document: LetterDocument;
    layout: TemplateLayout & { letterheadName: string | null };
    createdBy: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    updatedAt: string;
  }[];
}

/** How a template's documents are laid out; fixed with the wording when a version is approved. */
export interface TemplateLayout {
  letterheadId: string | null;
  pageSize: 'A4' | 'LETTER';
  marginsMm: PageMargins;
  showPageNumbers: boolean;
}

/** A page's margins in whole millimetres (0 to 60): the letter text stays inside them. */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Where a letterhead sits, in whole millimetres (0 to 60): its header from the
 * page's top edge, its footer from the bottom edge, and both from the side
 * edges. 0 is the edge of the paper.
 */
export interface LetterheadPlacement {
  headerOffsetMm: number;
  footerOffsetMm: number;
  sideOffsetMm: number;
}

export interface Letterhead {
  id: string;
  name: string;
  companyName: string;
  addressText: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationText: string | null;
  footerText: string | null;
  logoPosition: 'LEFT' | 'CENTER' | 'RIGHT';
  headerHeightMm: number;
  footerHeightMm: number;
  /** Null: at each template's margins. */
  placement: LetterheadPlacement | null;
  logoBox: LetterheadBox | null;
  headerArtBox: LetterheadBox | null;
  footerArtBox: LetterheadBox | null;
  /** Images kept but not printed, and images that can't be moved until unlocked. */
  hiddenImages: LetterheadImageSlot[];
  lockedImages: LetterheadImageSlot[];
  /** Page elements such as watermarks, in paint order (first is drawn first). */
  elements: LetterheadElement[];
  isDefault: boolean;
  isArchived: boolean;
  images: Record<LetterheadImageSlot, boolean>;
  updatedAt: string;
}

export type LetterheadImageSlot = 'logo' | 'header' | 'footer';

/**
 * Where an image sits, in millimetres from the top-left of the header or footer
 * area. Stretch fills the box exactly;
 * otherwise the image keeps its proportions inside it.
 */
export interface LetterheadBox {
  x: number;
  y: number;
  width: number;
  height: number;
  stretch: boolean;
  /** Degrees clockwise about the box's centre; left out: upright. */
  rotation?: number;
}

export type ElementAlign = 'left' | 'center' | 'right';
export type ElementFont = 'helvetica' | 'times' | 'courier';

/**
 * A design element on every page, such as a text or image watermark: a box in
 * millimetres from the page's top-left, turned clockwise about its centre, at
 * an opacity from 0 to 1, drawn behind the letter text unless `aboveText`.
 * An IMAGE shows an image uploaded for the letterhead, in proportion inside
 * its box; a TEXT shows its text, broken into lines only where it has line breaks.
 */
export interface LetterheadElement {
  /** The server's id once saved; a temporary one before. Not sent. */
  id: string;
  kind: 'IMAGE' | 'TEXT';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  aboveText: boolean;
  hidden: boolean;
  locked: boolean;
  imageId: string | null;
  text: string | null;
  fontFamily: ElementFont | null;
  fontSizePt: number | null;
  bold: boolean;
  italic: boolean;
  color: string | null;
  align: ElementAlign | null;
}

/** An image uploaded for a letterhead's elements. */
export interface LetterheadAsset {
  id: string;
  widthPx: number;
  heightPx: number;
}

export interface LetterheadInput {
  name: string;
  companyName: string;
  addressText?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationText?: string;
  footerText?: string;
  logoPosition: 'LEFT' | 'CENTER' | 'RIGHT';
  headerHeightMm: number;
  footerHeightMm: number;
  /** Null: at each template's margins. */
  placement: LetterheadPlacement | null;
  /** Null: placed automatically. */
  logoBox: LetterheadBox | null;
  headerArtBox: LetterheadBox | null;
  footerArtBox: LetterheadBox | null;
  hiddenImages: LetterheadImageSlot[];
  lockedImages: LetterheadImageSlot[];
  /** Every element, in paint order, without ids; replaces those saved. */
  elements: Omit<LetterheadElement, 'id'>[];
  isDefault: boolean;
}

/** Letterhead images larger than this are refused by the server. */
export const MAX_LETTERHEAD_IMAGE_BYTES = 2 * 1024 * 1024;

export type DocumentAssetCategory =
  | 'COMPANY_LOGO'
  | 'AUTHORIZED_SIGNATURE'
  | 'STAMP_SEAL'
  | 'OTHER';

export interface DocumentAssetItem {
  id: string;
  category: DocumentAssetCategory;
  name: string;
  mimeType: string;
  fileSizeBytes: number;
  widthPx: number;
  heightPx: number;
  createdAt: string;
  updatedAt: string;
}

export const documentsApi = {
  listTemplates: (kind?: string) => apiClient.get<Envelope<TemplateSummary[]>>(`${BASE}/templates${qs({ kind })}`).then((r) => r.data),
  placeholders: () =>
    apiClient.get<Envelope<{ kind: string; available: boolean; placeholders: { key: string; description: string }[] }[]>>(`${BASE}/templates/placeholders`).then((r) => r.data),
  getTemplate: (id: string) => apiClient.get<Envelope<TemplateDetail>>(`${BASE}/templates/${id}`).then((r) => r.data),
  createTemplate: (input: { kind: string; name: string; document?: LetterDocument } & Partial<TemplateLayout>) => apiClient.post<Envelope<TemplateDetail>>(`${BASE}/templates`, input).then((r) => r.data),
  saveTemplateDraft: (id: string, input: { document: LetterDocument } & Partial<TemplateLayout>) => apiClient.put<Envelope<TemplateDetail>>(`${BASE}/templates/${id}/draft`, input).then((r) => r.data),
  approveTemplate: (id: string) => apiClient.post<Envelope<TemplateDetail>>(`${BASE}/templates/${id}/approve`).then((r) => r.data),
  archiveTemplate: (id: string, archived: boolean) => apiClient.post<Envelope<TemplateDetail>>(`${BASE}/templates/${id}/${archived ? 'archive' : 'restore'}`).then((r) => r.data),
  previewTemplatePdf: (input: { kind: string; document: LetterDocument } & TemplateLayout) => postForPdf(`${BASE}/templates/preview-pdf`, input),
  listLetterheads: () => apiClient.get<Envelope<Letterhead[]>>(`${BASE}/letterheads`).then((r) => r.data),
  getLetterhead: (id: string) => apiClient.get<Envelope<Letterhead>>(`${BASE}/letterheads/${id}`).then((r) => r.data),
  createLetterhead: (input: LetterheadInput) => apiClient.post<Envelope<Letterhead>>(`${BASE}/letterheads`, input).then((r) => r.data),
  updateLetterhead: (id: string, input: LetterheadInput) => apiClient.put<Envelope<Letterhead>>(`${BASE}/letterheads/${id}`, input).then((r) => r.data),
  archiveLetterhead: (id: string, archived: boolean) => apiClient.post<Envelope<Letterhead>>(`${BASE}/letterheads/${id}/${archived ? 'archive' : 'restore'}`).then((r) => r.data),
  letterheadImage: (id: string, slot: LetterheadImageSlot) => fetchFile(`/api/v1${BASE}/letterheads/${id}/images/${slot}`),
  uploadLetterheadImage: (id: string, slot: LetterheadImageSlot, file: File) => uploadForm<Letterhead>(`${BASE}/letterheads/${id}/images/${slot}`, file, 'The image is larger than 2 MB. Upload a smaller copy.'),
  letterheadAsset: (id: string, assetId: string) => fetchFile(`/api/v1${BASE}/letterheads/${id}/assets/${assetId}`),
  uploadLetterheadAsset: (id: string, file: File) => uploadForm<LetterheadAsset>(`${BASE}/letterheads/${id}/assets`, file, 'The image is larger than 2 MB. Upload a smaller copy.'),
  removeLetterheadImage: (id: string, slot: LetterheadImageSlot) => apiClient.delete<Envelope<Letterhead>>(`${BASE}/letterheads/${id}/images/${slot}`).then((r) => r.data),
  previewLetterheadPdf: (input: LetterheadInput, letterheadId?: string) => postForPdf(`${BASE}/letterheads/preview-pdf`, { ...input, ...(letterheadId ? { letterheadId } : {}) }),
  listAssets: (category?: DocumentAssetCategory) => apiClient.get<Envelope<DocumentAssetItem[]>>(`${BASE}/assets${qs({ category })}`).then((r) => r.data),
  getAsset: (id: string) => apiClient.get<Envelope<DocumentAssetItem>>(`${BASE}/assets/${id}`).then((r) => r.data),
  uploadAsset: async (file: File, meta?: { category?: DocumentAssetCategory; name?: string; widthPx?: number; heightPx?: number }): Promise<DocumentAssetItem> => {
    const form = new FormData();
    form.append('file', file);
    if (meta?.category) form.append('category', meta.category);
    if (meta?.name) form.append('name', meta.name);
    if (meta?.widthPx) form.append('widthPx', String(meta.widthPx));
    if (meta?.heightPx) form.append('heightPx', String(meta.heightPx));
    const res = await apiFetch(`/api/v1${BASE}/assets`, {
      method: 'POST',
      body: form,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = body?.message;
      throw new Error(Array.isArray(message) ? message.join(', ') : message || 'The image could not be uploaded.');
    }
    return body.data as DocumentAssetItem;
  },
  renameAsset: (id: string, name: string, category?: DocumentAssetCategory) => apiClient.patch<Envelope<DocumentAssetItem>>(`${BASE}/assets/${id}`, { name, category }).then((r) => r.data),
  deleteAsset: (id: string) => apiClient.delete<Envelope<{ deleted: boolean }>>(`${BASE}/assets/${id}`).then((r) => r.data),
  assetFileUrl: (id: string) => `/api/v1${BASE}/assets/${id}/file`,
};
