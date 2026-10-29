import React, { useState } from 'react';
import { X, Check, Table2 } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { updateCellAttribute, setCellBorder } from './table-extension';

interface Props {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
  cellAttrs: Record<string, unknown> | null;
  rowCount: number;
  colCount: number;
}

const BORDER_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'none', label: 'None' },
];

const PRESET_COLORS = [
  '#000000',
  '#334155',
  '#64748b',
  '#94a3b8',
  '#cbd5e1',
  '#0d9488',
  '#2563eb',
  '#dc2626',
];

const BG_PRESET_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#f1f5f9',
  '#e2e8f0',
  '#ccfbf1',
  '#dbeafe',
  '#fef3c7',
  '#fee2e2',
];

export const TablePropertiesModal: React.FC<Props> = ({
  editor,
  isOpen,
  onClose,
  cellAttrs,
  rowCount,
  colCount,
}) => {
  if (!isOpen) return null;

  const [borderThickness, setBorderThickness] = useState(
    cellAttrs?.borderTop ? parseFloat(String(cellAttrs.borderTop)) || 0.75 : 0.75,
  );
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dashed' | 'dotted' | 'none'>('solid');
  const [borderColor, setBorderColor] = useState('#000000');
  const [bgColor, setBgColor] = useState(
    typeof cellAttrs?.backgroundColor === 'string' ? cellAttrs.backgroundColor : '#ffffff',
  );
  const [padding, setPadding] = useState(
    typeof cellAttrs?.padding === 'number' ? cellAttrs.padding : 4,
  );
  const [vAlign, setVAlign] = useState<'top' | 'middle' | 'bottom'>(
    (cellAttrs?.verticalAlign as 'top' | 'middle' | 'bottom') || 'middle',
  );
  const [tAlign, setTAlign] = useState<'left' | 'center' | 'right' | 'justify'>(
    (cellAttrs?.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
  );
  const [rowHeight, setRowHeight] = useState<string>(
    cellAttrs?.rowHeight ? String(cellAttrs.rowHeight) : '',
  );
  const [colWidth, setColWidth] = useState<string>(
    Array.isArray(cellAttrs?.colwidth) && cellAttrs.colwidth[0] ? String(cellAttrs.colwidth[0]) : '',
  );

  const applyChanges = () => {
    // 1. Shading
    updateCellAttribute(editor, 'backgroundColor', bgColor === '#ffffff' ? null : bgColor);
    // 2. Padding
    updateCellAttribute(editor, 'padding', padding);
    // 3. Alignments
    updateCellAttribute(editor, 'verticalAlign', vAlign);
    updateCellAttribute(editor, 'textAlign', tAlign);
    // 4. Dimensions
    if (rowHeight && !Number.isNaN(Number(rowHeight))) {
      updateCellAttribute(editor, 'rowHeight', Number(rowHeight));
    }
    if (colWidth && !Number.isNaN(Number(colWidth))) {
      updateCellAttribute(editor, 'colwidth', [Number(colWidth)]);
    }
    // 5. Borders
    setCellBorder(editor, {
      side: 'all',
      thickness: borderThickness,
      style: borderStyle,
      color: borderColor,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#181724] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#2B293E] p-6 text-slate-800 dark:text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/10 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Table2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Table & Cell Properties</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grid: {rowCount} rows × {colCount} cols
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Borders */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Cell Borders
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Thickness</label>
                <select
                  value={borderThickness}
                  onChange={(e) => setBorderThickness(Number(e.target.value))}
                  className="w-full text-xs h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] px-2"
                >
                  <option value={0}>No Border</option>
                  <option value={0.5}>0.5 pt (Thin)</option>
                  <option value={0.75}>0.75 pt (Standard)</option>
                  <option value={1}>1.0 pt</option>
                  <option value={1.5}>1.5 pt (Medium)</option>
                  <option value={2}>2.0 pt (Thick)</option>
                  <option value={3}>3.0 pt</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Style</label>
                <select
                  value={borderStyle}
                  onChange={(e) => setBorderStyle(e.target.value as any)}
                  className="w-full text-xs h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] px-2"
                >
                  {BORDER_STYLES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Border Color</label>
                <div className="flex items-center gap-1.5 h-8">
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="w-8 h-8 rounded border border-slate-200 dark:border-[#2B293E] cursor-pointer bg-transparent"
                  />
                  <span className="text-[11px] tabular-nums">{borderColor}</span>
                </div>
              </div>
            </div>
            {/* Preset Color Swatches */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500">Presets:</span>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBorderColor(c)}
                  style={{ backgroundColor: c }}
                  className="w-4 h-4 rounded-full border border-slate-300 dark:border-white/20 transition-transform hover:scale-110"
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Shading & Padding */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Shading & Spacing
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Cell Background</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-8 h-8 rounded border border-slate-200 dark:border-[#2B293E] cursor-pointer bg-transparent"
                  />
                  <span className="text-xs tabular-nums">{bgColor}</span>
                </div>
                <div className="flex items-center gap-1">
                  {BG_PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBgColor(c)}
                      style={{ backgroundColor: c }}
                      className="w-4 h-4 rounded border border-slate-300 dark:border-white/20 transition-transform hover:scale-110"
                      title={c}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Cell Padding (pt)</label>
                <select
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                  className="w-full text-xs h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] px-2 mb-2"
                >
                  <option value={1}>1 pt (Ultra-compact)</option>
                  <option value={2}>2 pt (Compact)</option>
                  <option value={4}>4 pt (Standard)</option>
                  <option value={6}>6 pt (Comfortable)</option>
                  <option value={8}>8 pt (Spacious)</option>
                </select>
                <p className="text-[10px] text-slate-500">Controls distance from cell borders.</p>
              </div>
            </div>
          </div>

          {/* Alignment */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Alignment
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Horizontal</label>
                <select
                  value={tAlign}
                  onChange={(e) => setTAlign(e.target.value as any)}
                  className="w-full text-xs h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] px-2"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                  <option value="justify">Justify</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Vertical</label>
                <select
                  value={vAlign}
                  onChange={(e) => setVAlign(e.target.value as any)}
                  className="w-full text-xs h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] px-2"
                >
                  <option value="top">Top</option>
                  <option value="middle">Middle</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dimensions */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Exact Dimensions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Column Width (px)</label>
                <input
                  type="number"
                  min={25}
                  max={800}
                  step={5}
                  placeholder="Auto"
                  value={colWidth}
                  onChange={(e) => setColWidth(e.target.value)}
                  className="w-full text-xs h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] px-2"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Row Height (pt)</label>
                <input
                  type="number"
                  min={10}
                  max={400}
                  step={2}
                  placeholder="Auto"
                  value={rowHeight}
                  onChange={(e) => setRowHeight(e.target.value)}
                  className="w-full text-xs h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] px-2"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyChanges}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            Apply to Selection
          </button>
        </div>
      </div>
    </div>
  );
};
