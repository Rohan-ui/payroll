import React from 'react';
import { X, Command, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose }) => {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { key: `${modKey} + S`, description: 'Save Draft workflow changes' },
    { key: `${modKey} + Z`, description: 'Undo last node move or connection change' },
    { key: `${modKey} + Shift + Z`, description: 'Redo previously undone change' },
    { key: `${modKey} + Enter`, description: 'Open Publish Workflow confirmation' },
    { key: `${modKey} + Mouse Wheel`, description: 'Smooth zoom centered on mouse cursor' },
    { key: 'Space + Drag', description: 'Pan the canvas in any direction' },
    { key: 'Middle Click + Drag', description: 'Alternative quick pan across canvas' },
    { key: 'Delete / Backspace', description: 'Delete selected node or connection edge' },
    { key: 'Escape', description: 'Deselect, cancel connection line, or exit Full Screen' },
    { key: 'F', description: 'Toggle True Full-Screen editor mode' },
    { key: 'Double-Click Node', description: 'Open node properties and actions inspector' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1D2D] border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Keyboard className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Keyboard Shortcuts & Controls
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {shortcuts.map((sc, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80 text-xs"
            >
              <span className="text-slate-600 dark:text-slate-300">{sc.description}</span>
              <kbd className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 shadow-2xs">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
