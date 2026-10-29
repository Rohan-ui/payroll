import React, { useState, useEffect } from 'react';
import { X, Table2, BadgePercent, Sparkles } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInsertTable: (rows: number, cols: number, withHeader: boolean) => void;
  onInsertSalaryStructure: () => void;
}

export const InsertTableModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onInsertTable,
  onInsertSalaryStructure,
}) => {
  const [hoveredRow, setHoveredRow] = useState(0);
  const [hoveredCol, setHoveredCol] = useState(0);
  const [customRows, setCustomRows] = useState(4);
  const [customCols, setCustomCols] = useState(4);
  const [withHeader, setWithHeader] = useState(true);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const GRID_ROWS = 8;
  const GRID_COLS = 8;

  const handleGridClick = (r: number, c: number) => {
    onInsertTable(r, c, withHeader);
    onClose();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = Math.max(1, Math.min(40, customRows));
    const c = Math.max(1, Math.min(15, customCols));
    onInsertTable(r, c, withHeader);
    onClose();
  };

  const handleSalaryStructureInsert = () => {
    onInsertSalaryStructure();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="insert-table-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] shadow-2xl p-6 text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#2B293E]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="insert-table-title" className="text-base font-semibold">
                Insert Table
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose dimensions or insert an official HR template
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 pt-5">
          {/* Quick Grid Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Grid Dimension Selector
              </span>
              <span className="text-xs font-mono font-medium text-teal-600 dark:text-teal-400">
                {hoveredRow > 0 && hoveredCol > 0 ? `${hoveredRow} × ${hoveredCol} Table` : 'Hover to select size'}
              </span>
            </div>

            <div
              className="inline-grid p-2.5 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#12111B] gap-1"
              style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
              onMouseLeave={() => {
                setHoveredRow(0);
                setHoveredCol(0);
              }}
            >
              {Array.from({ length: GRID_ROWS }).map((_, rIdx) => {
                const r = rIdx + 1;
                return Array.from({ length: GRID_COLS }).map((__, cIdx) => {
                  const c = cIdx + 1;
                  const isHovered = r <= hoveredRow && c <= hoveredCol;
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      aria-label={`${r} rows by ${c} columns`}
                      onMouseEnter={() => {
                        setHoveredRow(r);
                        setHoveredCol(c);
                      }}
                      onClick={() => handleGridClick(r, c)}
                      className={`w-6 h-6 rounded transition-all duration-75 border ${
                        isHovered
                          ? 'bg-teal-500 border-teal-600 dark:bg-teal-600 dark:border-teal-500 scale-105'
                          : 'bg-white dark:bg-[#1F1E2E] border-slate-200 dark:border-[#38354D] hover:border-slate-400'
                      }`}
                    />
                  );
                });
              })}
            </div>
          </div>

          {/* Exact Rows and Columns Form */}
          <form onSubmit={handleCustomSubmit} className="space-y-4 pt-2 border-t border-slate-100 dark:border-[#2B293E]">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Custom Dimensions
            </span>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">
                  Rows
                </label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={customRows}
                  onChange={(e) => setCustomRows(parseInt(e.target.value, 10) || 1)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">
                  Columns
                </label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={customCols}
                  onChange={(e) => setCustomCols(parseInt(e.target.value, 10) || 1)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={withHeader}
                  onChange={(e) => setWithHeader(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-[#2B293E]"
                />
                Format first row as table header
              </label>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors"
              >
                Insert Custom Table
              </button>
            </div>
          </form>

          {/* Official HR Template: Annexure-A Salary Structure */}
          <div className="pt-4 border-t border-slate-100 dark:border-[#2B293E]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Official HR Templates
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <Sparkles className="w-3.5 h-3.5" /> Word-grade Layout
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-slate-50/60 dark:bg-[#141320] flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <BadgePercent className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-sm font-semibold">Salary Structure (Annexure - A)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-configured layout with Income (A), PF (B), Deductions (C), Net Take-Home, and CTC columns with placeholders.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSalaryStructureInsert}
                className="shrink-0 px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
              >
                Insert Annexure - A
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
