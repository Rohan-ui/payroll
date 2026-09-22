import React from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** @deprecated put icon inside children instead */ icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none';

  const variants = {
    primary:
      'bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white shadow-sm',
    secondary:
      'bg-white dark:bg-[#1E1D2D] hover:bg-mint-50 dark:hover:bg-teal-950/40 active:bg-mint-100 text-[#0E5A47] dark:text-teal-300 border border-teal-300 dark:border-teal-700/50 shadow-sm',
    danger:
      'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
    ghost:
      'bg-transparent hover:bg-teal-50 dark:hover:bg-teal-950/40 active:bg-teal-100 text-teal-600 dark:text-teal-400',
    outline:
      'bg-white dark:bg-[#1E1D2D] hover:bg-slate-50 dark:hover:bg-[#252336] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#2B293E] shadow-sm',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base min-w-touch',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
