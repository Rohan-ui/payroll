import React from 'react';
import { clsx } from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  error,
  id,
  className,
  required,
  ...props
}) => {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5"
      >
        {label}
        {required && <span className="text-red-600 ml-1" aria-hidden="true">*</span>}
      </label>

      <input
        id={inputId}
        className={clsx(
          'w-full min-h-[48px] px-3.5 py-2.5 rounded-lg border text-base text-slate-900 dark:text-slate-100 bg-white dark:bg-[#1E1D2D] placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500',
          error
            ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50/20'
            : 'border-slate-300 dark:border-[#2B293E]',
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        required={required}
        {...props}
      />

      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="mt-1.5 text-sm text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};
