import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps {
  className?: string;
  highlight?: boolean;
  padded?: boolean;
  /** @deprecated use children directly */ title?: string;
  /** @deprecated use children directly */ subtitle?: string;
  /** @deprecated use children directly */ action?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  className,
  highlight = false,
  padded = true,
  title,
  subtitle,
  action,
  children,
  onClick,
}) => {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn(
        'bg-white rounded-3xl shadow-card border border-slate-100',
        highlight && 'border-l-4 border-l-teal-500',
        padded && 'p-5',
        onClick && 'cursor-pointer hover:shadow-card-hover transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
        className,
      )}
    >
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {title && <h2 className="text-base font-bold text-slate-800">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
