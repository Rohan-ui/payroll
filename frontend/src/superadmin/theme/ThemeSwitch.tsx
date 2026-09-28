import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference, usePlatformTheme } from './PlatformThemeContext';

const OPTIONS: { value: ThemePreference; label: string; icon: React.ElementType }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Light / Dark / System, as a radio group. */
export const ThemeSwitch: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { preference, setPreference } = usePlatformTheme();

  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex items-center rounded-lg border border-hq-border bg-hq-muted p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={compact ? label : undefined}
            title={label}
            onClick={() => setPreference(value)}
            className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring ${
              selected ? 'bg-hq-card text-hq-foreground shadow-sm' : 'text-hq-muted-foreground hover:text-hq-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
};
