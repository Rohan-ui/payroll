import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { MAX_LETTERHEAD_IMAGE_BYTES, documentsApi, type Letterhead, type LetterheadBox, type LetterheadElement, type LetterheadImageSlot, type LetterheadInput } from '../../api/documents.api';
import { fieldClass, labelClass } from '../onboarding/onboarding-format';
import { IMAGE_LABEL, LetterheadCanvas, effectiveBox, printedImages, type CanvasImage, type LetterheadDetails } from './LetterheadCanvas';
import { Field, ImagePicker, LayersPanel, MmInput, SelectionPanel, actionClass, type ElementSelection, type SlotSelection } from './LetterheadPanels';
import { MAX_ELEMENTS, WATERMARK_PRESETS, imageWatermark, layerLimits, moveLayer, onPage, textWatermark, withDuplicate, withElement, withGrid, type GridSpec, type LayerMove } from './letterhead-design';
import {
  BOX_OF, MARGIN_LIMITS, PAGE_SIZES, ZOOM, clampZoom, fitInside, fitLayout, fitZoom, footerLimits, headerLimits, imageSize, letterheadAreas, uniformMargins,
  type LetterheadLayout, type PageSizeName,
} from './letterhead-geometry';

const primaryClass = 'px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50';

const SLOTS: { slot: LetterheadImageSlot; label: string; hint: string }[] = [
  { slot: 'logo', label: 'Logo', hint: 'Shown beside or above the company details. A transparent PNG looks best.' },
  { slot: 'header', label: 'Header artwork', hint: 'A ready-made letterhead banner. Replaces the logo and details at the top of each page.' },
  { slot: 'footer', label: 'Footer artwork', hint: 'Replaces the footer text at the bottom of each page.' },
];

/** Why an image would be refused, before sending it; the server checks it again, by content. */
export function imageProblem(file: File): string | null {
  if (!['image/png', 'image/jpeg'].includes(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) return 'Choose a PNG or JPEG image.';
  if (file.size === 0) return 'That image is empty.';
  if (file.size > MAX_LETTERHEAD_IMAGE_BYTES) return 'That image is larger than 2 MB. Upload a smaller copy.';
  return null;
}

/** Company letterheads used by document templates. */
export const LetterheadsView: React.FC = () => {
  const { can } = useAuth();
  const [rows, setRows] = useState<Letterhead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Letterhead | 'new' | null>(null);

  const load = useCallback(() => {
    setError(null);
    documentsApi.listLetterheads().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (open) return <LetterheadEditor letterhead={open === 'new' ? null : open} onBack={() => { setOpen(null); load(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A letterhead puts your company’s logo and details on generated documents. Each template chooses its letterhead. Letters already sent keep the letterhead they were sent with.
        </p>
        {can('documents.templates.approve') && <button type="button" onClick={() => setOpen('new')} className={`${primaryClass} whitespace-nowrap`}>New letterhead</button>}
      </div>
      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The letterheads could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="h-32 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading letterheads</span></div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No letterheads yet</p>
          <p className="mt-1 text-sm text-slate-500">Until you add one, documents show your company name at the top of a plain page.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setOpen(l)} className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                <span className="block font-semibold text-slate-900 dark:text-slate-100 break-words">{l.name}</span>
                <span className="block text-xs text-slate-500 break-words">{l.companyName}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {l.isDefault && <Badge variant="success" size="sm">Default</Badge>}
                  {l.isArchived && <Badge variant="neutral" size="sm">Archived</Badge>}
                  <Badge variant="neutral" size="sm">{l.images.header ? 'Header artwork' : l.images.logo ? 'Logo' : 'No logo'}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

type EditorTab = 'layout' | 'selection' | 'layers' | 'images' | 'details';
const EDITOR_TABS: { id: EditorTab; label: string }[] = [
  { id: 'layout', label: 'Layout' },
  { id: 'selection', label: 'Selected' },
  { id: 'layers', label: 'Layers' },
  { id: 'images', label: 'Images' },
  { id: 'details', label: 'Company details' },
];
const isSlot = (key: string): key is LetterheadImageSlot => key === 'logo' || key === 'header' || key === 'footer';
const round1 = (n: number) => Math.round(n * 10) / 10;

type DetailKey = 'name' | 'companyName' | 'addressText' | 'phone' | 'email' | 'website' | 'registrationText' | 'footerText' | 'isDefault';

const toInput = (l: Letterhead | null): Record<DetailKey, string | boolean> => ({
  name: l?.name ?? 'Official letterhead',
  companyName: l?.companyName ?? '',
  addressText: l?.addressText ?? '',
  phone: l?.phone ?? '',
  email: l?.email ?? '',
  website: l?.website ?? '',
  registrationText: l?.registrationText ?? '',
  footerText: l?.footerText ?? '',
  isDefault: l?.isDefault ?? false,
});

export const toLayout = (l: Letterhead | null): LetterheadLayout => ({
  logoPosition: l?.logoPosition ?? 'LEFT',
  headerHeightMm: l?.headerHeightMm ?? 30,
  footerHeightMm: l?.footerHeightMm ?? 16,
  placement: l?.placement ?? null,
  logoBox: l?.logoBox ?? null,
  headerArtBox: l?.headerArtBox ?? null,
  footerArtBox: l?.footerArtBox ?? null,
  hiddenImages: l?.hiddenImages ?? [],
  lockedImages: l?.lockedImages ?? [],
  elements: l?.elements ?? [],
});

const sameLayout = (a: LetterheadLayout, b: LetterheadLayout) => JSON.stringify(a) === JSON.stringify(b);
const UNDO_LIMIT = 50;
/** Typing in the same field within this long is one undo step. */
const COALESCE_MS = 1000;

/** The letterhead's images, loaded once through the authenticated API for the page and the thumbnails, with their pixel sizes. */
export function useLetterheadImages(letterhead: Letterhead | null) {
  const [images, setImages] = useState<Partial<Record<LetterheadImageSlot, CanvasImage>>>({});
  const [errors, setErrors] = useState<Partial<Record<LetterheadImageSlot, string>>>({});
  const id = letterhead?.id;
  const updatedAt = letterhead?.updatedAt;
  const present = SLOTS.map((s) => Boolean(letterhead?.images[s.slot]));
  const [hasLogo, hasHeader, hasFooter] = present;
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setImages({});
    setErrors({});
    if (!id) return;
    SLOTS.forEach(({ slot }, i) => {
      if (![hasLogo, hasHeader, hasFooter][i]) return;
      documentsApi
        .letterheadImage(id, slot)
        .then((bytes) => {
          if (cancelled) return;
          const size = imageSize(bytes);
          const url = URL.createObjectURL(new Blob([bytes]));
          urls.push(url);
          setImages((all) => ({ ...all, [slot]: { url, width: size?.width ?? 0, height: size?.height ?? 0 } }));
        })
        .catch((e: Error) => !cancelled && setErrors((all) => ({ ...all, [slot]: e.message })));
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [id, updatedAt, hasLogo, hasHeader, hasFooter]);
  return { images, errors };
}

/**
 * The images of a letterhead's page elements, by image id: each loaded once
 * through the authenticated API, with its pixel size, while the page is open.
 */
export function useElementImages(letterheadId: string | undefined, imageIds: string[]) {
  const [images, setImages] = useState<Record<string, CanvasImage>>({});
  const requested = useRef(new Set<string>());
  const urls = useRef<string[]>([]);
  const wanted = [...new Set(imageIds)].sort().join(',');
  useEffect(() => {
    if (!letterheadId || !wanted) return;
    for (const id of wanted.split(',')) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      documentsApi
        .letterheadAsset(letterheadId, id)
        .then((bytes) => {
          const size = imageSize(bytes);
          const url = URL.createObjectURL(new Blob([bytes]));
          urls.current.push(url);
          setImages((all) => ({ ...all, [id]: { url, width: size?.width ?? 0, height: size?.height ?? 0 } }));
        })
        // Not loaded: the element shows an empty box, and the next change asks again.
        .catch(() => requested.current.delete(id));
    }
  }, [letterheadId, wanted]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  return images;
}

const LetterheadEditor: React.FC<{ letterhead: Letterhead | null; onBack: () => void }> = ({ letterhead, onBack }) => {
  const ids = useId();
  const { can } = useAuth();
  const [saved, setSaved] = useState<Letterhead | null>(letterhead);
  const [values, setValues] = useState(toInput(letterhead));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ArrayBuffer | null>(null);
  const canEdit = can('documents.templates.approve') && !saved?.isArchived;

  // The page the editor shows. Templates choose their own page size and margins.
  const [pageName, setPageName] = useState<PageSizeName>('A4');
  const [marginMm, setMarginMm] = useState(20);
  const page = PAGE_SIZES[pageName];
  const margins = uniformMargins(marginMm);
  const [zoom, setZoom] = useState(0.6);
  const stage = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    const width = stage.current?.clientWidth ?? 0;
    // Leave room for the stage's padding.
    if (width > 0) setZoom(fitZoom(width - 32, page));
  }, [page]);
  useEffect(fit, [fit]);

  // The layout, with undo and redo.
  const [edit, setEdit] = useState<{ layout: LetterheadLayout; past: LetterheadLayout[]; future: LetterheadLayout[] }>({ layout: toLayout(letterhead), past: [], future: [] });
  const current = useRef(edit);
  const lastChange = useRef<{ key: string; at: number } | null>(null);
  const commit = (next: typeof edit) => {
    current.current = next;
    setEdit(next);
  };
  const changeLayout = (patch: Partial<LetterheadLayout>, key: string) => {
    const e = current.current;
    const next = fitLayout({ ...e.layout, ...patch }, page, margins);
    if (sameLayout(next, e.layout)) return;
    const now = Date.now();
    const previous = lastChange.current;
    const sameStep = previous?.key === key && (key.startsWith('gesture:') || now - previous.at < COALESCE_MS);
    lastChange.current = { key, at: now };
    commit({ layout: next, past: sameStep ? e.past : [...e.past, e.layout].slice(-UNDO_LIMIT), future: [] });
  };
  const undo = () => {
    const e = current.current;
    if (!e.past.length) return;
    lastChange.current = null;
    commit({ layout: e.past[e.past.length - 1], past: e.past.slice(0, -1), future: [e.layout, ...e.future] });
  };
  const redo = () => {
    const e = current.current;
    if (!e.future.length) return;
    lastChange.current = null;
    commit({ layout: e.future[0], past: [...e.past, e.layout], future: e.future.slice(1) });
  };
  const resetLayout = (l: Letterhead) => commit({ ...current.current, layout: toLayout(l) });
  const layout = edit.layout;

  const { images, errors: imageErrors } = useLetterheadImages(saved);
  const placeable = Object.fromEntries(Object.entries(images).filter(([, i]) => i.width > 0 && i.height > 0)) as Partial<Record<LetterheadImageSlot, CanvasImage>>;
  const elementImages = useElementImages(saved?.id, layout.elements.flatMap((e) => (e.imageId ? [e.imageId] : [])));
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [removing, setRemoving] = useState<LetterheadImageSlot | null>(null);
  const [objectError, setObjectError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [preset, setPreset] = useState(WATERMARK_PRESETS[0]);
  const actions = useRef(0);
  /** A key for a one-off change: its own undo step. */
  const step = () => `action:${(actions.current += 1)}`;
  // A new letterhead starts with its details; an existing one with its layout.
  const [tab, setTab] = useState<EditorTab>(letterhead ? 'layout' : 'details');
  // An uploaded image, or an element of the layout.
  const exists = (key: string) => (isSlot(key) ? Boolean(placeable[key]) : layout.elements.some((e) => e.id === key));
  const selection = selected && exists(selected) ? selected : null;
  const select = (key: string | null, showSettings: boolean) => {
    setSelected(key);
    setObjectError(null);
    if (key && showSettings) setTab('selection');
  };

  const set = (name: DetailKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const input = (): LetterheadInput => {
    const text = (key: DetailKey) => String(values[key]).trim() || undefined;
    return {
      name: String(values.name).trim(),
      companyName: String(values.companyName).trim(),
      addressText: text('addressText'),
      phone: text('phone'),
      email: text('email'),
      website: text('website'),
      registrationText: text('registrationText'),
      footerText: text('footerText'),
      ...layout,
      elements: layout.elements.map(({ id, ...element }) => element),
      isDefault: Boolean(values.isDefault),
    };
  };
  const problem = () => {
    const i = input();
    if (!i.name) return 'Enter a name for the letterhead.';
    if (!i.companyName) return 'Enter the company name.';
    if (!(i.headerHeightMm >= 15 && i.headerHeightMm <= 70)) return 'The header is between 15 and 70 mm tall.';
    if (!(i.footerHeightMm >= 8 && i.footerHeightMm <= 50)) return 'The footer is between 8 and 50 mm tall.';
    if (i.placement && Object.values(i.placement).some((mm) => !(mm >= MARGIN_LIMITS.min && mm <= MARGIN_LIMITS.max))) return 'Distances from the page edges are between 0 and 60 mm.';
    return null;
  };

  /** Runs one server call at a time, showing a failure where it is given to (the page's alert unless said). */
  const act = async (run: () => Promise<void>, showError: (message: string | null) => void = setError) => {
    if (busy) return;
    setBusy(true);
    showError(null);
    try {
      await run();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const refused = problem();
    if (refused) {
      if (!String(values.name).trim() || !String(values.companyName).trim()) setTab('details');
      return setError(refused);
    }
    act(async () => {
      const result = saved ? await documentsApi.updateLetterhead(saved.id, input()) : await documentsApi.createLetterhead(input());
      setSaved(result);
      setValues(toInput(result));
      resetLayout(result);
      toast.success(saved ? 'Letterhead saved' : 'Letterhead created. You can add images now.');
    });
  };

  const showPreview = () => {
    const refused = problem();
    if (refused) return setError(refused);
    act(async () => setPreview(await documentsApi.previewLetterheadPdf(input(), saved?.id)));
  };

  // The selected object, as shown on the page.
  const areas = letterheadAreas(page, margins, layout);
  const slotImage = selection && isSlot(selection) ? placeable[selection] : undefined;
  const slotSelection: SlotSelection | null = (() => {
    if (!selection || !isSlot(selection) || !slotImage) return null;
    const area = selection === 'footer' ? areas.footer : areas.header;
    const { box, automatic } = effectiveBox(selection, layout, slotImage, area);
    return { kind: 'slot', slot: selection, box, automatic, area, hidden: layout.hiddenImages.includes(selection), locked: layout.lockedImages.includes(selection) };
  })();
  const selectedElement = selection && !isSlot(selection) ? layout.elements.find((e) => e.id === selection) ?? null : null;
  const elementSelection: ElementSelection | null = selectedElement ? { kind: 'element', element: selectedElement, page, ...layerLimits(layout.elements, selectedElement.id) } : null;
  const setBox = (patch: Partial<LetterheadBox>, field: string) => {
    if (!slotSelection || !slotImage) return;
    let next: LetterheadBox = { ...slotSelection.box, ...patch };
    // In proportion, a new width sets the height and a new height the width.
    if (!next.stretch && patch.width !== undefined) next.height = round1((patch.width * slotImage.height) / slotImage.width);
    if (!next.stretch && patch.height !== undefined) next.width = round1((patch.height * slotImage.width) / slotImage.height);
    next = fitInside(next, slotSelection.area);
    changeLayout({ [BOX_OF[slotSelection.slot]]: next }, `field:${slotSelection.slot}:${field}`);
  };
  const replaceElement = (id: string, next: LetterheadElement, key: string) => changeLayout({ elements: layout.elements.map((e) => (e.id === id ? onPage(next, page) : e)) }, key);
  const setElement = (patch: Partial<LetterheadElement>, field: string) => {
    if (!selectedElement) return;
    const next = { ...selectedElement, ...patch };
    // An image keeps its proportions: a new width sets the height and a new height the width.
    const image = selectedElement.imageId ? elementImages[selectedElement.imageId] : undefined;
    if (selectedElement.kind === 'IMAGE' && image && image.width > 0 && image.height > 0) {
      if (patch.width !== undefined) next.height = round1((patch.width * image.height) / image.width);
      if (patch.height !== undefined) next.width = round1((patch.height * image.width) / image.height);
    }
    replaceElement(selectedElement.id, next, `field:${selectedElement.id}:${field}`);
  };
  const toggle = (key: string, flag: 'hidden' | 'locked') => {
    if (isSlot(key)) {
      const list = flag === 'hidden' ? 'hiddenImages' : 'lockedImages';
      const current = layout[list];
      changeLayout({ [list]: current.includes(key) ? current.filter((s) => s !== key) : [...current, key] }, step());
    } else {
      changeLayout({ elements: layout.elements.map((e) => (e.id === key ? { ...e, [flag]: !e[flag] } : e)) }, step());
    }
  };
  const remove = (key: string) => {
    if (!canEdit) return;
    // The logo and artwork are removed from the server, so they are confirmed first; a watermark comes back with Undo.
    if (isSlot(key)) return setRemoving(key);
    changeLayout({ elements: layout.elements.filter((e) => e.id !== key) }, step());
    setSelected(null);
  };
  const confirmRemove = () => {
    const slot = removing;
    if (!slot || !saved) return;
    setRemoving(null);
    act(async () => {
      const result = await documentsApi.removeLetterheadImage(saved.id, slot);
      setSaved(result);
      setSelected(null);
      toast.success(`${IMAGE_LABEL[slot]} removed`);
    });
  };
  const replaceImage = (file: File) => {
    const refused = imageProblem(file);
    if (refused) return setObjectError(refused);
    if (!saved) return;
    if (slotSelection) {
      const slot = slotSelection.slot;
      act(async () => {
        setSaved(await documentsApi.uploadLetterheadImage(saved.id, slot, file));
        toast.success(`${IMAGE_LABEL[slot]} replaced`);
      }, setObjectError);
    } else if (selectedElement?.kind === 'IMAGE') {
      const element = selectedElement;
      act(async () => {
        const asset = await documentsApi.uploadLetterheadAsset(saved.id, file);
        // Same width, the new image's proportions.
        replaceElement(element.id, { ...element, imageId: asset.id, height: round1(Math.max(3, (element.width * asset.heightPx) / asset.widthPx)) }, step());
      }, setObjectError);
    }
  };
  const addElement = (element: LetterheadElement) => {
    if (layout.elements.length >= MAX_ELEMENTS) return setAddError(`A letterhead has at most ${MAX_ELEMENTS} elements. Delete one to add another.`);
    setAddError(null);
    changeLayout({ elements: withElement(layout.elements, element) }, step());
    select(element.id, true);
  };
  const addImageWatermark = (file: File) => {
    const refused = imageProblem(file);
    if (refused) return setAddError(refused);
    if (!saved) return;
    if (layout.elements.length >= MAX_ELEMENTS) return setAddError(`A letterhead has at most ${MAX_ELEMENTS} elements. Delete one to add another.`);
    act(async () => addElement(imageWatermark(await documentsApi.uploadLetterheadAsset(saved.id, file), page)), setAddError);
  };
  const duplicateSelected = () => {
    if (!selectedElement) return;
    if (layout.elements.length >= MAX_ELEMENTS) return setObjectError(`A letterhead has at most ${MAX_ELEMENTS} elements. Delete one to add another.`);
    const result = withDuplicate(layout.elements, selectedElement.id, page);
    if (!result) return;
    changeLayout({ elements: result.elements }, step());
    select(result.id, true);
  };
  const gridSelected = (spec: GridSpec) => {
    if (!selectedElement) return 'Select a watermark first.';
    const result = withGrid(layout.elements, selectedElement.id, spec, page);
    if (typeof result === 'string') return result;
    changeLayout({ elements: result }, step());
    return null;
  };
  const moveSelected = (id: string, move: LayerMove) => changeLayout({ elements: moveLayer(layout.elements, id, move) }, step());
  const printed = printedImages(placeable, layout);
  const layerSlots = SLOTS.filter((s) => placeable[s.slot]).map((s) => ({ slot: s.slot, hidden: layout.hiddenImages.includes(s.slot), locked: layout.lockedImages.includes(s.slot), printed: Boolean(printed[s.slot]) || layout.hiddenImages.includes(s.slot) }));
  const hLimits = headerLimits(page, margins, layout);
  const fLimits = footerLimits(page, margins, layout);
  const placement = layout.placement;
  const setPlacement = (patch: Partial<NonNullable<LetterheadLayout['placement']>>, field: string) => {
    if (placement) changeLayout({ placement: { ...placement, ...patch } }, `field:placement:${field}`);
  };
  const details: LetterheadDetails = {
    companyName: String(values.companyName),
    addressText: String(values.addressText),
    phone: String(values.phone),
    email: String(values.email),
    website: String(values.website),
    registrationText: String(values.registrationText),
    footerText: String(values.footerText),
  };
  const iconButton = 'p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} aria-label="Back to letterheads" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"><ArrowLeft className="w-4 h-4" aria-hidden="true" /></button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 break-words">{saved ? saved.name : 'New letterhead'}</h2>
            <p className="text-xs text-slate-500">{saved?.isArchived ? 'Archived: templates that use it keep it; it can’t be chosen for others.' : 'Changes show on documents generated from now on.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('documents.templates.manage') && <button type="button" disabled={busy} onClick={showPreview} className={actionClass}>Preview on a sample letter</button>}
          {saved && can('documents.templates.approve') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(async () => { const r = await documentsApi.archiveLetterhead(saved.id, !saved.isArchived); setSaved(r); setValues(toInput(r)); resetLayout(r); toast.success(r.isArchived ? 'Letterhead archived' : 'Letterhead restored'); })}
              className={actionClass}
            >
              {saved.isArchived ? 'Restore' : 'Archive'}
            </button>
          )}
          {canEdit && <button type="button" disabled={busy} onClick={save} className={primaryClass}>{busy ? 'Saving…' : saved ? 'Save letterhead' : 'Create letterhead'}</button>}
        </div>
      </div>
      {error && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <section aria-labelledby={`${ids}-page`} className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-[#2B293E]">
            <h3 id={`${ids}-page`} className="text-sm font-bold">Page</h3>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <div role="group" aria-label="Undo and redo" className="inline-flex items-center gap-0.5">
                  <button type="button" onClick={undo} disabled={!edit.past.length} aria-label="Undo layout change" title="Undo (Ctrl+Z)" className={iconButton}><Undo2 className="w-4 h-4" aria-hidden="true" /></button>
                  <button type="button" onClick={redo} disabled={!edit.future.length} aria-label="Redo layout change" title="Redo (Ctrl+Shift+Z)" className={iconButton}><Redo2 className="w-4 h-4" aria-hidden="true" /></button>
                </div>
              )}
              <div role="group" aria-label="Zoom" className="inline-flex items-center rounded-lg border border-slate-200 dark:border-[#2B293E]">
                <button type="button" onClick={() => setZoom((z) => clampZoom(z - ZOOM.step))} disabled={zoom <= ZOOM.min} aria-label="Zoom out" className={iconButton}><ZoomOut className="w-4 h-4" aria-hidden="true" /></button>
                <output aria-live="polite" aria-label="Zoom level" className="w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</output>
                <button type="button" onClick={() => setZoom((z) => clampZoom(z + ZOOM.step))} disabled={zoom >= ZOOM.max} aria-label="Zoom in" className={iconButton}><ZoomIn className="w-4 h-4" aria-hidden="true" /></button>
              </div>
              <button type="button" onClick={fit} className={actionClass}>Fit width</button>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
                Snap to guides
              </label>
            </div>
          </div>
          {/* Scrolls sideways only when zoomed past the width; the page itself scrolls normally. */}
          <div
            ref={stage}
            className="overflow-x-auto bg-slate-100 dark:bg-[#12111B] p-4"
            onKeyDown={(e) => {
              if (!canEdit || !(e.ctrlKey || e.metaKey)) return;
              const key = e.key.toLowerCase();
              if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
              else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
            }}
          >
            <LetterheadCanvas
              page={page}
              margins={margins}
              zoom={zoom}
              layout={layout}
              details={details}
              images={placeable}
              elementImages={elementImages}
              editable={canEdit}
              selected={selection}
              onSelect={(key) => select(key, true)}
              onChange={changeLayout}
              onDelete={remove}
              snap={snap}
            />
          </div>
          <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-200 dark:border-[#2B293E]">
            Drag the dashed lines to resize the header and footer. Select an image or watermark to move it, drag its corners to resize it (hold Shift to resize freely), or drag the round handle to turn it (hold Shift for 15° steps).
          </p>
        </section>

        <section aria-label="Letterhead settings" className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] min-w-0">
          <div role="tablist" aria-label="Letterhead settings" className="flex gap-1 px-2 border-b border-slate-200 dark:border-[#2B293E] overflow-x-auto">
            {EDITOR_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${ids}-tab-${t.id}`}
                aria-controls={`${ids}-panel-${t.id}`}
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-t-lg ${tab === t.id ? 'border-teal-500 text-teal-700 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`${ids}-panel-layout`} aria-labelledby={`${ids}-tab-layout`} hidden={tab !== 'layout'} className="p-4 space-y-4">
            <Field id={`${ids}-position`} label="Logo position">
              <select id={`${ids}-position`} value={layout.logoPosition} onChange={(e) => changeLayout({ logoPosition: e.target.value as LetterheadLayout['logoPosition'] }, 'field:position')} disabled={!canEdit} className={fieldClass}>
                <option value="LEFT">Left, details on the right</option>
                <option value="RIGHT">Right, details on the left</option>
                <option value="CENTER">Centred above the details</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <MmInput id={`${ids}-header-height`} label="Header height (mm)" hint={`${hLimits.min} to ${hLimits.max}`} value={layout.headerHeightMm} min={hLimits.min} max={hLimits.max} step={1} readOnly={!canEdit} onCommit={(n) => changeLayout({ headerHeightMm: n }, 'field:header')} />
              <MmInput id={`${ids}-footer-height`} label="Footer height (mm)" hint={`${fLimits.min} to ${fLimits.max}`} value={layout.footerHeightMm} min={fLimits.min} max={fLimits.max} step={1} readOnly={!canEdit} onCommit={(n) => changeLayout({ footerHeightMm: n }, 'field:footer')} />
            </div>

            <fieldset className="pt-4 border-t border-slate-200 dark:border-[#2B293E] space-y-2">
              <legend className="text-sm font-bold">Position on the page</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name={`${ids}-placement`} className="mt-1" checked={!placement} disabled={!canEdit} onChange={() => changeLayout({ placement: null }, 'field:placement')} />
                <span>
                  At the template’s margins
                  <span className="block text-xs text-slate-500">The header and footer sit inside the margins each template sets.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={`${ids}-placement`}
                  className="mt-1"
                  checked={Boolean(placement)}
                  disabled={!canEdit}
                  // Starts where it is now, so nothing moves until a distance is changed.
                  onChange={() => changeLayout({ placement: { headerOffsetMm: margins.top, footerOffsetMm: margins.bottom, sideOffsetMm: margins.left } }, 'field:placement')}
                />
                <span>
                  At set distances from the page edges
                  <span className="block text-xs text-slate-500">Use 0 to run the letterhead to the edge of the paper, such as a full-width banner. The letter text still keeps the template’s margins.</span>
                </span>
              </label>
              {placement && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <MmInput id={`${ids}-offset-top`} label="Header from top (mm)" hint="0 to 60" value={placement.headerOffsetMm} min={MARGIN_LIMITS.min} max={MARGIN_LIMITS.max} step={1} readOnly={!canEdit} onCommit={(n) => setPlacement({ headerOffsetMm: Math.round(n) }, 'top')} />
                  <MmInput id={`${ids}-offset-bottom`} label="Footer from bottom (mm)" hint="0 to 60" value={placement.footerOffsetMm} min={MARGIN_LIMITS.min} max={MARGIN_LIMITS.max} step={1} readOnly={!canEdit} onCommit={(n) => setPlacement({ footerOffsetMm: Math.round(n) }, 'bottom')} />
                  <MmInput id={`${ids}-offset-side`} label="Sides from edge (mm)" hint="0 to 60" value={placement.sideOffsetMm} min={MARGIN_LIMITS.min} max={MARGIN_LIMITS.max} step={1} readOnly={!canEdit} onCommit={(n) => setPlacement({ sideOffsetMm: Math.round(n) }, 'side')} />
                </div>
              )}
              {placement && Object.values(placement).some((mm) => mm < 5) && (
                <p className="text-xs text-slate-500">Most office printers leave the outer 3 to 5 mm blank, so anything that close to the edge may be cut off on paper. The PDF shows it in full.</p>
              )}
            </fieldset>

            <div className="pt-4 border-t border-slate-200 dark:border-[#2B293E] space-y-3">
              <h4 className="text-sm font-bold">Preview page</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${ids}-page-size`} className={labelClass}>Page size</label>
                  <select id={`${ids}-page-size`} value={pageName} onChange={(e) => setPageName(e.target.value as PageSizeName)} className={fieldClass}>
                    <option value="A4">A4</option>
                    <option value="LETTER">Letter</option>
                  </select>
                </div>
                <MmInput id={`${ids}-margins`} label="Margins (mm)" value={marginMm} min={MARGIN_LIMITS.min} max={MARGIN_LIMITS.max} step={1} onCommit={(n) => setMarginMm(Math.round(n))} />
              </div>
              <p className="text-xs text-slate-500">Only changes this view. Each template sets its own page size and margins. Images are placed within the header and footer, so their positions carry over.</p>
            </div>

            <label className="flex items-center gap-2 text-sm pt-4 border-t border-slate-200 dark:border-[#2B293E]">
              <input type="checkbox" checked={Boolean(values.isDefault)} onChange={set('isDefault')} disabled={!canEdit} />
              Use as the default for new templates
            </label>
          </div>

          <div role="tabpanel" id={`${ids}-panel-selection`} aria-labelledby={`${ids}-tab-selection`} hidden={tab !== 'selection'} className="p-4">
            <SelectionPanel
              id={`${ids}-object`}
              selection={slotSelection ?? elementSelection}
              editable={canEdit}
              busy={busy}
              error={objectError}
              onBox={setBox}
              onAutomatic={() => slotSelection && changeLayout({ [BOX_OF[slotSelection.slot]]: null }, `field:${slotSelection.slot}:reset`)}
              onElement={setElement}
              onLayer={(move) => selectedElement && moveSelected(selectedElement.id, move)}
              onDuplicate={duplicateSelected}
              onGrid={gridSelected}
              onToggle={(flag) => selection && toggle(selection, flag)}
              onReplace={replaceImage}
              onDelete={() => selection && remove(selection)}
            />
            {placeable.header && placeable.logo && !layout.hiddenImages.includes('header') && <p className="mt-4 text-xs text-slate-500">Header artwork is used, so the logo and company details aren’t printed. Hide the header artwork to print them.</p>}
          </div>

          <div role="tabpanel" id={`${ids}-panel-layers`} aria-labelledby={`${ids}-tab-layers`} hidden={tab !== 'layers'} className="p-4 space-y-4">
            {canEdit && (
              <div className="space-y-3">
                <h4 className="text-sm font-bold">Add a watermark</h4>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[8rem]">
                    <label htmlFor={`${ids}-preset`} className={labelClass}>Text</label>
                    <select id={`${ids}-preset`} value={preset} onChange={(e) => setPreset(e.target.value)} className={fieldClass}>
                      {WATERMARK_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => addElement(textWatermark(preset, page))} className={actionClass}>Add text watermark</button>
                </div>
                <div>
                  {saved ? (
                    <ImagePicker label={busy ? 'Uploading…' : 'Add image watermark'} disabled={busy} onFile={addImageWatermark} />
                  ) : (
                    <p className="text-xs text-slate-500">Create the letterhead first, then add image watermarks.</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">A company seal, logo or mark; PNG or JPEG up to 2 MB. Every watermark can be changed afterwards.</p>
                </div>
                {addError && <p role="alert" className="text-xs text-red-700">{addError}</p>}
              </div>
            )}
            <div className={canEdit ? 'pt-4 border-t border-slate-200 dark:border-[#2B293E]' : ''}>
              <h4 className="text-sm font-bold mb-2">Layers</h4>
              <LayersPanel
                elements={layout.elements}
                slots={layerSlots}
                selected={selection}
                editable={canEdit}
                onSelect={(key) => select(key, false)}
                onToggle={toggle}
                onLayer={moveSelected}
                onDelete={remove}
                limits={(id) => layerLimits(layout.elements, id)}
              />
            </div>
          </div>

          <div role="tabpanel" id={`${ids}-panel-images`} aria-labelledby={`${ids}-tab-images`} hidden={tab !== 'images'} className="p-4 space-y-3">
            <p className="text-xs text-slate-500">PNG or JPEG, up to 2 MB each.</p>
            {!saved ? (
              <p className="text-sm text-slate-500">Create the letterhead first, then add its logo or artwork.</p>
            ) : (
              <ul className="space-y-3">
                {SLOTS.map((s) => (
                  <li key={s.slot}>
                    <ImageSlot letterhead={saved} slot={s.slot} label={s.label} hint={s.hint} url={images[s.slot]?.url ?? null} loadError={imageErrors[s.slot] ?? null} canEdit={canEdit} onChanged={(l) => setSaved(l)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div role="tabpanel" id={`${ids}-panel-details`} aria-labelledby={`${ids}-tab-details`} hidden={tab !== 'details'} className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              <Field id={`${ids}-name`} label="Letterhead name *"><input id={`${ids}-name`} value={String(values.name)} onChange={set('name')} readOnly={!canEdit} maxLength={120} className={fieldClass} /></Field>
              <Field id={`${ids}-company`} label="Company name *"><input id={`${ids}-company`} value={String(values.companyName)} onChange={set('companyName')} readOnly={!canEdit} maxLength={200} className={fieldClass} /></Field>
              <div className="sm:col-span-2 xl:col-span-1">
                <Field id={`${ids}-address`} label="Registered or office address"><textarea id={`${ids}-address`} rows={2} value={String(values.addressText)} onChange={set('addressText')} readOnly={!canEdit} maxLength={500} className={fieldClass} /></Field>
              </div>
              <Field id={`${ids}-phone`} label="Phone"><input id={`${ids}-phone`} value={String(values.phone)} onChange={set('phone')} readOnly={!canEdit} maxLength={64} className={fieldClass} /></Field>
              <Field id={`${ids}-email`} label="Email"><input id={`${ids}-email`} type="email" value={String(values.email)} onChange={set('email')} readOnly={!canEdit} maxLength={320} className={fieldClass} /></Field>
              <Field id={`${ids}-website`} label="Website"><input id={`${ids}-website`} value={String(values.website)} onChange={set('website')} readOnly={!canEdit} maxLength={200} className={fieldClass} /></Field>
              <Field id={`${ids}-registration`} label="Registration details" hint="For example CIN, GSTIN or PAN. Printed in the footer.">
                <input id={`${ids}-registration`} value={String(values.registrationText)} onChange={set('registrationText')} readOnly={!canEdit} maxLength={300} className={fieldClass} />
              </Field>
              <div className="sm:col-span-2 xl:col-span-1">
                <Field id={`${ids}-footer`} label="Footer text"><input id={`${ids}-footer`} value={String(values.footerText)} onChange={set('footerText')} readOnly={!canEdit} maxLength={500} className={fieldClass} /></Field>
              </div>
            </div>
          </div>
        </section>
      </div>

      {removing && (
        <Dialog
          title={`Remove the ${IMAGE_LABEL[removing].toLowerCase()}?`}
          description={`It is removed from this letterhead now, and documents generated from now on print without it. Documents already sent keep it. Upload it again to put it back.`}
          onClose={() => setRemoving(null)}
          size="sm"
          footer={<><button type="button" onClick={() => setRemoving(null)} className={actionClass}>Keep it</button><button type="button" onClick={confirmRemove} className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">Remove {IMAGE_LABEL[removing].toLowerCase()}</button></>}
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">To keep it but not print it, hide it in Layers instead.</p>
        </Dialog>
      )}

      {preview && (
        <PdfViewer
          title={`Sample: ${String(values.name) || 'letterhead'}`}
          description="A made-up letter on this letterhead, including changes not yet saved"
          notice="Sample preview: made-up data, not a real document. Nothing is saved. Close it to keep editing."
          load={() => Promise.resolve(preview)}
          downloadName="letterhead-sample.pdf"
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
};

/** One of the letterhead's images: shown from the editor's loaded copy, uploaded or removed here. */
const ImageSlot: React.FC<{
  letterhead: Letterhead;
  slot: LetterheadImageSlot;
  label: string;
  hint: string;
  url: string | null;
  loadError: string | null;
  canEdit: boolean;
  onChanged: (l: Letterhead) => void;
}> = ({ letterhead, slot, label, hint, url, loadError, canEdit, onChanged }) => {
  const present = letterhead.images[slot];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (run: () => Promise<Letterhead>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await run());
      toast.success(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };
  const shownError = error ?? (present ? loadError : null);

  return (
    <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] flex gap-3">
      <div className="w-24 h-16 shrink-0 rounded-lg bg-slate-50 dark:bg-[#1E1D2D] border border-dashed border-slate-200 dark:border-[#2B293E] flex items-center justify-center overflow-hidden">
        {present && url ? <img src={url} alt={`${label} of ${letterhead.name}`} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-500">{present ? (loadError ? 'Not loaded' : 'Loading…') : 'None'}</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
        {shownError && <p role="alert" className="text-xs text-red-700">{shownError}</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <label className={`${actionClass} cursor-pointer focus-within:ring-2 focus-within:ring-teal-500 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {busy ? 'Working…' : present ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                disabled={busy}
                aria-label={`${present ? 'Replace' : 'Upload'} ${label.toLowerCase()}`}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const refused = imageProblem(file);
                  if (refused) return setError(refused);
                  change(() => documentsApi.uploadLetterheadImage(letterhead.id, slot, file), `${label} uploaded`);
                }}
              />
            </label>
            {present && (
              <button type="button" disabled={busy} onClick={() => change(() => documentsApi.removeLetterheadImage(letterhead.id, slot), `${label} removed`)} className={actionClass}>
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
