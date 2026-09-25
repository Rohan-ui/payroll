import React from 'react';
import { humanize } from '../format';
import { labelClass } from './form-styles';

/** Shared pieces of the portal's forms: field layout, the client-side format rules and the choice lists. */

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Browsers list some zones under legacy ICU names; show the current IANA ones (both are valid). */
export const CURRENT_ZONE_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
};

/** Every timezone the browser knows, always including the one currently chosen. */
export const timezones = (current: string): string[] => {
  const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  const zones = new Set(list.map((zone) => CURRENT_ZONE_NAMES[zone] ?? zone));
  zones.add(current);
  return [...zones].sort();
};

const INDUSTRY_LABELS: Record<string, string> = {
  DIGITAL_AGENCY: 'Digital agency',
  IT_SERVICES: 'IT services',
  CONSULTING: 'Consulting',
  ECOMMERCE: 'E-commerce',
  HEALTHCARE: 'Healthcare',
  REAL_ESTATE: 'Real estate',
  MANUFACTURING: 'Manufacturing',
  FINANCE: 'Finance',
  OTHER: 'Other',
};
export const industryLabel = (code: string) => INDUSTRY_LABELS[code] ?? humanize(code);

/** Today in the viewer's timezone, as YYYY-MM-DD. */
export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE = /^\+?[0-9][0-9 ()-]{5,23}$/;

/** One labelled input with its hint and error, wired for screen readers. */
export const Field: React.FC<{
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}> = ({ id, label, required, hint, error, children }) => {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} <span className="font-normal text-hq-subtle-foreground">{required ? '(required)' : '(optional)'}</span>
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[11px] text-hq-subtle-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[11px] text-hq-danger">
          {error}
        </p>
      )}
    </div>
  );
};
