import React, { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Rows,
  Columns,
  Trash2,
  Combine,
  Split,
  PaintBucket,
  Settings,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronDown,
  Grid,
  Check,
  Maximize2,
} from 'lucide-react';
import {
  pmAddRowBefore,
  pmAddRowAfter,
  pmDeleteRow,
  pmAddColumnBefore,
  pmAddColumnAfter,
  pmDeleteColumn,
  pmDeleteTable,
  pmMergeCells,
  pmSplitCell,
  updateCellAttribute,
  setCellBorder,
  distributeColumnsEqually,
  getTableSelectionInfo,
  type BorderConfig,
} from './table-extension';

interface Props {
  editor: Editor;
  onOpenProperties: () => void;
}

const BG_COLORS = [
  { label: 'White', color: '#ffffff' },
  { label: 'Slate 50', color: '#f8fafc' },
  { label: 'Slate 100', color: '#f1f5f9' },
  { label: 'Slate 200', color: '#e2e8f0' },
  { label: 'Teal 50', color: '#f0fdfa' },
  { label: 'Teal 100', color: '#ccfbf1' },
  { label: 'Blue 50', color: '#eff6ff' },
  { label: 'Blue 100', color: '#dbeafe' },
  { label: 'Amber 50', color: '#fffbeb' },
  { label: 'Amber 100', color: '#fef3c7' },
  { label: 'Rose 50', color: '#fff1f2' },
  { label: 'Rose 100', color: '#fee2e2' },
];

export const TableToolbar: React.FC<Props> = ({ editor, onOpenProperties }) => {
  const [showBordersMenu, setShowBordersMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showPaddingMenu, setShowPaddingMenu] = useState(false);

  const [borderThickness, setBorderThickness] = useState(0.75);
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [borderColor, setBorderColor] = useState('#000000');

  const bordersRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const paddingRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (bordersRef.current && !bordersRef.current.contains(target)) {
        setShowBordersMenu(false);
      }
      if (colorRef.current && !colorRef.current.contains(target)) {
        setShowColorMenu(false);
      }
      if (paddingRef.current && !paddingRef.current.contains(target)) {
        setShowPaddingMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const info = getTableSelectionInfo(editor.state);
  if (!info.isInTable) return null;

  const currentAttrs = info.cellAttrs || {};
  const currentBg = (currentAttrs.backgroundColor as string) || '#ffffff';
  const currentTextAlign = (currentAttrs.textAlign as string) || 'left';
  const currentVAlign = (currentAttrs.verticalAlign as string) || 'top';
  const currentPadding = (currentAttrs.padding as number) ?? 4;

  const applyBorder = (side: BorderConfig['side']) => {
    setCellBorder(editor, {
      side,
      thickness: borderThickness,
      style: borderStyle,
      color: borderColor,
    });
  };

  const handleMerge = () => {
    pmMergeCells(editor.state, editor.view.dispatch);
    editor.view.focus();
  };

  const handleSplit = () => {
    pmSplitCell(editor.state, editor.view.dispatch);
    editor.view.focus();
  };

  const btnClass =
    'inline-flex items-center justify-center h-7 px-2 rounded text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500';
  const iconBtnClass =
    'inline-flex items-center justify-center h-7 w-7 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500';
  const activeBtnClass =
    'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 ring-1 ring-teal-400 dark:ring-teal-700';

  return (
    <div
      role="toolbar"
      aria-label="Table editing controls"
      className="flex flex-wrap items-center gap-1 px-3 py-1 bg-slate-100/90 dark:bg-[#12111B]/95 border-b border-slate-200 dark:border-[#2B293E] text-slate-800 dark:text-slate-100 text-xs shadow-inner animate-in fade-in duration-100"
    >
      <span className="font-semibold text-teal-700 dark:text-teal-400 pr-1 flex items-center gap-1 select-none">
        <Grid className="w-3.5 h-3.5" /> Table:
      </span>

      {/* Row Operations */}
      <div role="group" aria-label="Row actions" className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            pmAddRowBefore(editor.state, editor.view.dispatch);
            editor.view.focus();
          }}
          title="Insert row above"
          aria-label="Insert row above"
          className={btnClass}
        >
          <Rows className="w-3.5 h-3.5 mr-1 text-slate-500" /> + Above
        </button>
        <button
          type="button"
          onClick={() => {
            pmAddRowAfter(editor.state, editor.view.dispatch);
            editor.view.focus();
          }}
          title="Insert row below"
          aria-label="Insert row below"
          className={btnClass}
        >
          <Rows className="w-3.5 h-3.5 mr-1 text-slate-500" /> + Below
        </button>
        <button
          type="button"
          onClick={() => {
            pmDeleteRow(editor.state, editor.view.dispatch);
            editor.view.focus();
          }}
          title="Delete row"
          aria-label="Delete row"
          className={`${btnClass} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30`}
        >
          - Row
        </button>
      </div>

      <span aria-hidden="true" className="w-px h-5 bg-slate-300 dark:bg-[#2B293E] mx-1" />

      {/* Column Operations */}
      <div role="group" aria-label="Column actions" className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            pmAddColumnBefore(editor.state, editor.view.dispatch);
            editor.view.focus();
          }}
          title="Insert column left"
          aria-label="Insert column left"
          className={btnClass}
        >
          <Columns className="w-3.5 h-3.5 mr-1 text-slate-500" /> + Left
        </button>
        <button
          type="button"
          onClick={() => {
            pmAddColumnAfter(editor.state, editor.view.dispatch);
            editor.view.focus();
          }}
          title="Insert column right"
          aria-label="Insert column right"
          className={btnClass}
        >
          <Columns className="w-3.5 h-3.5 mr-1 text-slate-500" /> + Right
        </button>
        <button
          type="button"
          onClick={() => {
            pmDeleteColumn(editor.state, editor.view.dispatch);
            editor.view.focus();
          }}
          title="Delete column"
          aria-label="Delete column"
          className={`${btnClass} text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30`}
        >
          - Col
        </button>
      </div>

      <span aria-hidden="true" className="w-px h-5 bg-slate-300 dark:bg-[#2B293E] mx-1" />

      {/* Merge / Split / Distribute */}
      <div role="group" aria-label="Cell layout actions" className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={handleMerge}
          disabled={!info.canMerge}
          title={info.canMerge ? 'Merge selected cells' : 'Select multiple cells to merge'}
          aria-label="Merge cells"
          className={`${btnClass} ${info.canMerge ? 'text-teal-700 dark:text-teal-300 font-semibold' : ''}`}
        >
          <Combine className="w-3.5 h-3.5 mr-1" /> Merge
        </button>
        <button
          type="button"
          onClick={handleSplit}
          disabled={!info.canSplit}
          title={info.canSplit ? 'Split merged cell' : 'Only merged cells can be split'}
          aria-label="Split cell"
          className={btnClass}
        >
          <Split className="w-3.5 h-3.5 mr-1" /> Split
        </button>
        <button
          type="button"
          onClick={() => distributeColumnsEqually(editor)}
          title="Distribute columns evenly"
          aria-label="Distribute columns evenly"
          className={btnClass}
        >
          <Maximize2 className="w-3.5 h-3.5 mr-1" /> Distribute
        </button>
      </div>

      <span aria-hidden="true" className="w-px h-5 bg-slate-300 dark:bg-[#2B293E] mx-1" />

      {/* Alignment */}
      <div role="group" aria-label="Cell text alignment" className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => updateCellAttribute(editor, 'textAlign', 'left')}
          title="Align Left"
          aria-label="Align Left"
          className={`${iconBtnClass} ${currentTextAlign === 'left' ? activeBtnClass : ''}`}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => updateCellAttribute(editor, 'textAlign', 'center')}
          title="Align Center"
          aria-label="Align Center"
          className={`${iconBtnClass} ${currentTextAlign === 'center' ? activeBtnClass : ''}`}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => updateCellAttribute(editor, 'textAlign', 'right')}
          title="Align Right"
          aria-label="Align Right"
          className={`${iconBtnClass} ${currentTextAlign === 'right' ? activeBtnClass : ''}`}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => updateCellAttribute(editor, 'textAlign', 'justify')}
          title="Justify"
          aria-label="Justify"
          className={`${iconBtnClass} ${currentTextAlign === 'justify' ? activeBtnClass : ''}`}
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
      </div>

      <span aria-hidden="true" className="w-px h-5 bg-slate-300 dark:bg-[#2B293E] mx-1" />

      {/* Vertical Alignment */}
      <div role="group" aria-label="Cell vertical alignment" className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => updateCellAttribute(editor, 'verticalAlign', 'top')}
          title="Vertical Align Top"
          aria-label="Vertical Align Top"
          className={`${iconBtnClass} ${currentVAlign === 'top' ? activeBtnClass : ''}`}
        >
          <ArrowUpToLine className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => updateCellAttribute(editor, 'verticalAlign', 'middle')}
          title="Vertical Align Middle"
          aria-label="Vertical Align Middle"
          className={`${iconBtnClass} ${currentVAlign === 'middle' ? activeBtnClass : ''}`}
        >
          <span className="font-mono font-bold text-[10px]">MID</span>
        </button>
        <button
          type="button"
          onClick={() => updateCellAttribute(editor, 'verticalAlign', 'bottom')}
          title="Vertical Align Bottom"
          aria-label="Vertical Align Bottom"
          className={`${iconBtnClass} ${currentVAlign === 'bottom' ? activeBtnClass : ''}`}
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>
      </div>

      <span aria-hidden="true" className="w-px h-5 bg-slate-300 dark:bg-[#2B293E] mx-1" />

      {/* Borders Dropdown */}
      <div ref={bordersRef} className="relative">
        <button
          type="button"
          onClick={() => setShowBordersMenu(!showBordersMenu)}
          title="Borders and styling"
          aria-expanded={showBordersMenu}
          className={`${btnClass} gap-1 border border-slate-300 dark:border-[#38354D] bg-white dark:bg-[#1A1926]`}
        >
          <span>Borders</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {showBordersMenu && (
          <div className="absolute top-full left-0 mt-1 z-30 w-64 p-3 bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] rounded-xl shadow-xl text-slate-800 dark:text-slate-100 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Apply Borders to Selection
            </div>

            {/* Quick Border Presets */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => applyBorder('all')}
                className="px-2 py-1.5 text-xs text-left rounded bg-slate-50 dark:bg-white/5 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-[#2B293E] transition-colors"
              >
                ⊞ All Borders
              </button>
              <button
                type="button"
                onClick={() => applyBorder('outside')}
                className="px-2 py-1.5 text-xs text-left rounded bg-slate-50 dark:bg-white/5 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-[#2B293E] transition-colors"
              >
                ⊡ Outside Only
              </button>
              <button
                type="button"
                onClick={() => applyBorder('top')}
                className="px-2 py-1.5 text-xs text-left rounded bg-slate-50 dark:bg-white/5 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-[#2B293E] transition-colors"
              >
                ▔ Top Border
              </button>
              <button
                type="button"
                onClick={() => applyBorder('bottom')}
                className="px-2 py-1.5 text-xs text-left rounded bg-slate-50 dark:bg-white/5 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-[#2B293E] transition-colors"
              >
                 Bottom Border
              </button>
              <button
                type="button"
                onClick={() => applyBorder('left')}
                className="px-2 py-1.5 text-xs text-left rounded bg-slate-50 dark:bg-white/5 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-[#2B293E] transition-colors"
              >
                ▏ Left Border
              </button>
              <button
                type="button"
                onClick={() => applyBorder('right')}
                className="px-2 py-1.5 text-xs text-left rounded bg-slate-50 dark:bg-white/5 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-[#2B293E] transition-colors"
              >
                ▕ Right Border
              </button>
              <button
                type="button"
                onClick={() => applyBorder('none')}
                className="col-span-2 px-2 py-1.5 text-xs text-center font-medium rounded bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 hover:bg-rose-100 transition-colors"
              >
                No Borders (Clear)
              </button>
            </div>

            {/* Thickness and Style options */}
            <div className="pt-2 border-t border-slate-100 dark:border-[#2B293E] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span>Thickness</span>
                <select
                  value={borderThickness}
                  onChange={(e) => setBorderThickness(parseFloat(e.target.value))}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs"
                >
                  <option value={0.5}>0.5 pt</option>
                  <option value={0.75}>0.75 pt (Standard)</option>
                  <option value={1}>1.0 pt</option>
                  <option value={1.5}>1.5 pt (Bold)</option>
                  <option value={2}>2.0 pt</option>
                </select>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span>Style</span>
                <select
                  value={borderStyle}
                  onChange={(e) => setBorderStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
                  className="px-2 py-1 rounded border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs"
                >
                  <option value="solid">Solid ───</option>
                  <option value="dashed">Dashed - - -</option>
                  <option value="dotted">Dotted ·····</option>
                </select>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span>Color</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 inline-block shadow-inner"
                    style={{ backgroundColor: borderColor }}
                  />
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Shading / Background Color */}
      <div ref={colorRef} className="relative">
        <button
          type="button"
          onClick={() => setShowColorMenu(!showColorMenu)}
          title="Cell background shading"
          aria-expanded={showColorMenu}
          className={`${btnClass} gap-1 border border-slate-300 dark:border-[#38354D] bg-white dark:bg-[#1A1926]`}
        >
          <PaintBucket className="w-3.5 h-3.5" style={{ color: currentBg !== '#ffffff' ? currentBg : undefined }} />
          <span>Shading</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {showColorMenu && (
          <div className="absolute top-full left-0 mt-1 z-30 w-52 p-3 bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] rounded-xl shadow-xl text-slate-800 dark:text-slate-100 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Cell Background
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {BG_COLORS.map((item) => (
                <button
                  key={item.color}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    updateCellAttribute(editor, 'backgroundColor', item.color);
                    setShowColorMenu(false);
                  }}
                  className={`w-10 h-7 rounded border transition-transform hover:scale-105 flex items-center justify-center ${
                    currentBg.toLowerCase() === item.color.toLowerCase()
                      ? 'border-teal-500 ring-2 ring-teal-400/50'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                  style={{ backgroundColor: item.color }}
                >
                  {currentBg.toLowerCase() === item.color.toLowerCase() && (
                    <Check className="w-3.5 h-3.5 text-teal-600 drop-shadow" />
                  )}
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-[#2B293E] flex items-center justify-between">
              <label className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                Custom Color
              </label>
              <input
                type="color"
                value={currentBg}
                onChange={(e) => updateCellAttribute(editor, 'backgroundColor', e.target.value)}
                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
              />
            </div>
          </div>
        )}
      </div>

      {/* Padding Selector */}
      <div ref={paddingRef} className="relative">
        <button
          type="button"
          onClick={() => setShowPaddingMenu(!showPaddingMenu)}
          title="Cell Padding"
          aria-expanded={showPaddingMenu}
          className={`${btnClass} gap-1 border border-slate-300 dark:border-[#38354D] bg-white dark:bg-[#1A1926]`}
        >
          <span>Padding: {currentPadding}pt</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {showPaddingMenu && (
          <div className="absolute top-full left-0 mt-1 z-30 w-44 p-2 bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] rounded-xl shadow-xl space-y-1">
            <button
              type="button"
              onClick={() => {
                updateCellAttribute(editor, 'padding', 2);
                setShowPaddingMenu(false);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between"
            >
              <span>Compact (2 pt)</span>
              {currentPadding === 2 && <Check className="w-3.5 h-3.5 text-teal-600" />}
            </button>
            <button
              type="button"
              onClick={() => {
                updateCellAttribute(editor, 'padding', 4);
                setShowPaddingMenu(false);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between"
            >
              <span>Standard (4 pt)</span>
              {currentPadding === 4 && <Check className="w-3.5 h-3.5 text-teal-600" />}
            </button>
            <button
              type="button"
              onClick={() => {
                updateCellAttribute(editor, 'padding', 6);
                setShowPaddingMenu(false);
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between"
            >
              <span>Spacious (6 pt)</span>
              {currentPadding === 6 && <Check className="w-3.5 h-3.5 text-teal-600" />}
            </button>
          </div>
        )}
      </div>

      <span aria-hidden="true" className="w-px h-5 bg-slate-300 dark:bg-[#2B293E] mx-1" />

      {/* Advanced Properties Modal button */}
      <button
        type="button"
        onClick={onOpenProperties}
        title="Table & Cell Properties (exact dimensions, borders, and margins)"
        aria-label="Table & Cell Properties"
        className={`${btnClass} text-teal-700 dark:text-teal-300 font-semibold bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 border border-teal-200 dark:border-teal-800`}
      >
        <Settings className="w-3.5 h-3.5 mr-1" /> Properties
      </button>

      {/* Delete Table */}
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Delete this entire table?')) {
            pmDeleteTable(editor.state, editor.view.dispatch);
            editor.view.focus();
          }
        }}
        title="Delete entire table"
        aria-label="Delete entire table"
        className={`${iconBtnClass} text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/40 ml-auto`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
