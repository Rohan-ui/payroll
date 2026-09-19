import React from 'react';
import { cn } from '../../utils/cn';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  className,
  children,
}) => {
  const variants: Record<BadgeVariant, string> = {
    success: 'bg-mint-100 text-[#0E5A47] border border-teal-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger:  'bg-red-50 text-red-700 border border-red-200',
    info:    'bg-teal-50 text-teal-700 border border-teal-200',
    neutral: 'bg-slate-100 text-slate-600 border border-slate-200',
    purple:  'bg-purple-50 text-purple-700 border border-purple-200',
  };

  const sizes = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-0.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold rounded-full',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
};
