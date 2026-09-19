import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export interface StatutoryTooltipProps {
  term: string;
  explanation: string;
  children?: React.ReactNode;
}

export const StatutoryTooltip: React.FC<StatutoryTooltipProps> = ({
  term,
  explanation,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center gap-1 group">
      <span className="border-b border-dotted border-slate-400 font-medium">
        {children || term}
      </span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="text-slate-400 hover:text-slate-700 focus:outline-none p-0.5 rounded"
        aria-label={`Explanation for ${term}`}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white text-xs sm:text-sm rounded-xl shadow-xl z-50 pointer-events-none"
        >
          <p className="font-semibold text-emerald-400 mb-1">{term}</p>
          <p className="leading-relaxed text-slate-100">{explanation}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </span>
  );
};
