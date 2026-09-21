import React from 'react';
import { cn } from '../../../utils/cn';
import type { AttendanceStatus } from '../../../api/attendance.api';

interface StatusPillProps {
  status: AttendanceStatus | string;
  size?: 'xs' | 'sm' | 'md';
  showGlyph?: boolean;
  className?: string;
}

export const STATUS_CONFIG: Record<
  string,
  { label: string; glyph: string; bg: string; text: string; border: string; desc: string }
> = {
  PRESENT: {
    label: 'Present',
    glyph: '✓',
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-200',
    desc: 'Full day attended',
  },
  HALF_DAY: {
    label: 'Half Day',
    glyph: '½',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    desc: '0.5 day payable',
  },
  ABSENT: {
    label: 'Absent',
    glyph: '×',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    desc: 'Unapproved absence',
  },
  PAID_LEAVE: {
    label: 'Paid Leave',
    glyph: 'L',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    desc: 'Authorized paid leave',
  },
  UNPAID_LEAVE: {
    label: 'Unpaid (LOP)',
    glyph: 'LOP',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
    desc: 'Loss of pay',
  },
  HOLIDAY: {
    label: 'Holiday',
    glyph: 'H',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    desc: 'Public holiday',
  },
  WEEKEND: {
    label: 'Weekly Off',
    glyph: 'W',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    desc: 'Scheduled day off',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  size = 'md',
  showGlyph = true,
  className,
}) => {
  const config = STATUS_CONFIG[status] || {
    label: status || 'Unknown',
    glyph: '•',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    desc: 'Unrecorded',
  };

  const sizeStyles = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-md border shadow-2xs select-none',
        config.bg,
        config.text,
        config.border,
        sizeStyles[size],
        className,
      )}
      title={`${config.label} — ${config.desc}`}
      role="status"
    >
      {showGlyph && (
        <span
          className="font-bold opacity-85 leading-none flex items-center justify-center"
          aria-hidden="true"
        >
          {config.glyph}
        </span>
      )}
      <span>{config.label}</span>
    </span>
  );
};
