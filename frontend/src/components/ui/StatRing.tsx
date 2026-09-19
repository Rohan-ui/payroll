import React from 'react';
import { cn } from '../../utils/cn';

interface StatRingProps {
  label: string;
  total: number;
  used: number;
  color: 'teal' | 'amber' | 'violet' | 'sky';
  size?: number; // SVG width/height in px
  className?: string;
}

const colorMap = {
  teal:   { track: '#E6F7F2', fill: '#2FB898', text: '#0E5A47' },
  amber:  { track: '#FFF7ED', fill: '#F59E0B', text: '#92400E' },
  violet: { track: '#F5F3FF', fill: '#7C3AED', text: '#4C1D95' },
  sky:    { track: '#E0F2FE', fill: '#0EA5E9', text: '#075985' },
};

export const StatRing: React.FC<StatRingProps> = ({
  label,
  total,
  used,
  color,
  size = 96,
  className,
}) => {
  const r = (size - 14) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = total === 0 ? 0 : Math.min(used / total, 1);
  const strokeDashoffset = circumference * (1 - pct);
  const remaining = total - used;
  const { track, fill, text } = colorMap[color];

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label}: ${remaining} of ${total} remaining`}
        >
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={track}
            strokeWidth={10}
          />
          {/* Fill */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={fill}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        {/* Centre text */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span className="text-base font-bold leading-tight" style={{ color: text }}>
            {remaining}
          </span>
          <span className="text-[10px] font-medium" style={{ color: text }}>
            /{total}
          </span>
        </div>
      </div>
      <span className="text-xs text-slate-500 font-medium text-center leading-tight">{label}</span>
    </div>
  );
};
