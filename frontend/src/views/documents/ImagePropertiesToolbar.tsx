import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import {
  Trash2,
  Copy,
  RefreshCw,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
  BringToFront,
  SendToBack,
  Sliders,
  Type,
  Maximize,
  Move,
  Layers,
  FileText,
} from 'lucide-react';
import type { DocumentImageAttrs, PositionMode, ImageAlignment } from './document-image-extension';
import { snap } from './letterhead-geometry';

interface Props {
  editor: Editor;
  imageAttrs: DocumentImageAttrs;
  onOpenReplaceModal: () => void;
}

const buttonClass =
  'inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-40';
const activeBtnClass =
  'bg-teal-50 text-teal-800 ring-1 ring-teal-300 dark:bg-teal-500/20 dark:text-teal-200';
const inputClass =
  'h-7 rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50 tabular-nums';

const POSITION_MODES: { value: PositionMode; label: string; hint: string }[] = [
  { value: 'front', label: 'In front of text', hint: 'Free dragging above page text' },
  { value: 'behind', label: 'Behind text', hint: 'Free dragging behind page text (watermark/seal)' },
  { value: 'inline', label: 'Inline with text', hint: 'Flows within the text flow' },
  { value: 'square', label: 'Square wrap', hint: 'Text wraps cleanly around the image' },
  { value: 'topBottom', label: 'Top & bottom', hint: 'Text stays above and below only' },
];

export const ImagePropertiesToolbar: React.FC<Props> = ({
  editor,
  imageAttrs,
  onOpenReplaceModal,
}) => {
  const [showMore, setShowMore] = useState(false);

  const updateAttrs = (partial: Partial<DocumentImageAttrs>) => {
    editor.commands.updateAttributes('documentImage', partial);
  };

  const handleDelete = () => {
    const { selection } = editor.state;
    if (selection instanceof NodeSelection) {
      editor.commands.deleteSelection();
    }
  };

  const handleDuplicate = () => {
    const duplicated: Partial<DocumentImageAttrs> & { src: string } = {
      ...imageAttrs,
      id: crypto.randomUUID(),
      xMm: imageAttrs.xMm + 10,
      yMm: imageAttrs.yMm + 10,
    };
    editor.commands.insertDocumentImage(duplicated);
  };

  const handleWidthChange = (w: number) => {
    const newW = snap(Math.max(5, Math.min(300, w)));
    if (imageAttrs.lockAspectRatio) {
      const ratio = imageAttrs.aspectRatio || imageAttrs.widthMm / imageAttrs.heightMm;
      updateAttrs({ widthMm: newW, heightMm: snap(newW / ratio) });
    } else {
      updateAttrs({ widthMm: newW });
    }
  };

  const handleHeightChange = (h: number) => {
    const newH = snap(Math.max(5, Math.min(400, h)));
    if (imageAttrs.lockAspectRatio) {
      const ratio = imageAttrs.aspectRatio || imageAttrs.widthMm / imageAttrs.heightMm;
      updateAttrs({ heightMm: newH, widthMm: snap(newH * ratio) });
    } else {
      updateAttrs({ heightMm: newH });
    }
  };

  const handleBringForward = () => {
    updateAttrs({ zIndex: Math.min(1000, (imageAttrs.zIndex || 10) + 5) });
  };

  const handleSendBackward = () => {
    updateAttrs({ zIndex: Math.max(1, (imageAttrs.zIndex || 10) - 5) });
  };

  const isFree = imageAttrs.positionMode === 'front' || imageAttrs.positionMode === 'behind';

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-t border-slate-200 dark:border-[#2B293E] bg-teal-50/50 dark:bg-teal-950/20 text-xs">
      {/* Category / Title Badge */}
      <span className="font-semibold text-teal-800 dark:text-teal-300 flex items-center gap-1 mr-1">
        <Layers className="w-3.5 h-3.5" />
        {imageAttrs.category === 'AUTHORIZED_SIGNATURE'
          ? 'Signature'
          : imageAttrs.category === 'STAMP_SEAL'
          ? 'Stamp & Seal'
          : imageAttrs.category === 'COMPANY_LOGO'
          ? 'Logo'
          : 'Image'}
      </span>

      <span className="w-px h-5 bg-slate-200 dark:bg-[#2B293E]" />

      {/* Wrapping / Position Mode dropdown */}
      <div className="flex items-center gap-1">
        <label htmlFor="img-pos-mode" className="text-slate-500 font-medium sr-only">
          Position Mode
        </label>
        <select
          id="img-pos-mode"
          value={imageAttrs.positionMode}
          onChange={(e) => updateAttrs({ positionMode: e.target.value as PositionMode })}
          className={`${inputClass} font-medium`}
          title="Image positioning mode"
        >
          {POSITION_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </div>

      <span className="w-px h-5 bg-slate-200 dark:bg-[#2B293E]" />

      {/* Dimensions & Aspect Ratio */}
      <div className="flex items-center gap-1">
        <span className="text-slate-500">W:</span>
        <input
          type="number"
          min={5}
          max={300}
          step={1}
          value={Math.round(imageAttrs.widthMm)}
          onChange={(e) => handleWidthChange(Number(e.target.value))}
          className={`${inputClass} w-14`}
          title="Width in mm"
        />
        <span className="text-slate-400">×</span>
        <span className="text-slate-500">H:</span>
        <input
          type="number"
          min={5}
          max={400}
          step={1}
          value={Math.round(imageAttrs.heightMm)}
          onChange={(e) => handleHeightChange(Number(e.target.value))}
          className={`${inputClass} w-14`}
          title="Height in mm"
        />
        <span className="text-slate-400 text-[10px]">mm</span>

        <button
          type="button"
          onClick={() => updateAttrs({ lockAspectRatio: !imageAttrs.lockAspectRatio })}
          title={imageAttrs.lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          className={`${buttonClass} ${imageAttrs.lockAspectRatio ? activeBtnClass : ''}`}
        >
          {imageAttrs.lockAspectRatio ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      </div>

      <span className="w-px h-5 bg-slate-200 dark:bg-[#2B293E]" />

      {/* Free positioning coordinates (X, Y, Page) */}
      {isFree ? (
        <div className="flex items-center gap-1">
          <span className="text-slate-500">Page:</span>
          <select
            value={imageAttrs.page}
            onChange={(e) => updateAttrs({ page: Number(e.target.value) })}
            className={`${inputClass} w-12`}
            title="Target page"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <span className="text-slate-500 ml-1">X:</span>
          <input
            type="number"
            min={-50}
            max={300}
            step={1}
            value={Math.round(imageAttrs.xMm)}
            onChange={(e) => updateAttrs({ xMm: snap(Number(e.target.value)) })}
            className={`${inputClass} w-12`}
            title="Horizontal position (mm)"
          />

          <span className="text-slate-500">Y:</span>
          <input
            type="number"
            min={0}
            max={350}
            step={1}
            value={Math.round(imageAttrs.yMm)}
            onChange={(e) => updateAttrs({ yMm: snap(Number(e.target.value)) })}
            className={`${inputClass} w-12`}
            title="Vertical position (mm)"
          />

          {/* Layering Z-Index */}
          <button
            type="button"
            onClick={handleBringForward}
            title="Bring forward"
            className={buttonClass}
          >
            <BringToFront className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleSendBackward}
            title="Send backward"
            className={buttonClass}
          >
            <SendToBack className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* Flow alignment */
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => updateAttrs({ alignment: 'left' })}
            title="Align Left"
            className={`${buttonClass} ${imageAttrs.alignment === 'left' ? activeBtnClass : ''}`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => updateAttrs({ alignment: 'center' })}
            title="Align Center"
            className={`${buttonClass} ${imageAttrs.alignment === 'center' ? activeBtnClass : ''}`}
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => updateAttrs({ alignment: 'right' })}
            title="Align Right"
            className={`${buttonClass} ${imageAttrs.alignment === 'right' ? activeBtnClass : ''}`}
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <span className="w-px h-5 bg-slate-200 dark:bg-[#2B293E]" />

      {/* Lock position toggle */}
      <button
        type="button"
        onClick={() => updateAttrs({ isLocked: !imageAttrs.isLocked })}
        title={imageAttrs.isLocked ? 'Unlock position' : 'Lock position'}
        className={`${buttonClass} ${imageAttrs.isLocked ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-300' : ''}`}
      >
        <Lock className="w-3.5 h-3.5" />
        <span>{imageAttrs.isLocked ? 'Locked' : 'Lock'}</span>
      </button>

      {/* More properties button */}
      <button
        type="button"
        onClick={() => setShowMore(!showMore)}
        title="More image options (Opacity, Alt text)"
        className={`${buttonClass} ${showMore ? activeBtnClass : ''}`}
      >
        <Sliders className="w-3.5 h-3.5" />
        <span>More</span>
      </button>

      {/* Action buttons: Replace, Duplicate, Delete */}
      <button
        type="button"
        onClick={onOpenReplaceModal}
        title="Replace image"
        className={buttonClass}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Replace</span>
      </button>

      <button
        type="button"
        onClick={handleDuplicate}
        title="Duplicate image"
        className={buttonClass}
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={handleDelete}
        title="Delete image"
        className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Secondary dropdown row for Opacity and Alt Text */}
      {showMore && (
        <div className="w-full flex flex-wrap items-center gap-4 pt-1.5 mt-1 border-t border-slate-200/60 dark:border-[#2B293E]/60 text-xs">
          {/* Opacity slider */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Opacity:</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={imageAttrs.opacity ?? 1}
              onChange={(e) => updateAttrs({ opacity: Number(e.target.value) })}
              className="w-20 accent-teal-600"
            />
            <span className="text-slate-600 dark:text-slate-400 tabular-nums">
              {Math.round((imageAttrs.opacity ?? 1) * 100)}%
            </span>
          </div>

          {/* Alt text */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <span className="text-slate-500 whitespace-nowrap">Alt text:</span>
            <input
              type="text"
              placeholder="Description for accessibility"
              value={imageAttrs.alt || ''}
              onChange={(e) => updateAttrs({ alt: e.target.value })}
              className={`${inputClass} flex-1`}
            />
          </div>
        </div>
      )}
    </div>
  );
};
