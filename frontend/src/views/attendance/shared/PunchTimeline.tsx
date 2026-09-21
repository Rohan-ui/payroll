import React from 'react';
import { LogIn, LogOut, Clock, Smartphone, Globe, Fingerprint } from 'lucide-react';
import { cn } from '../../../utils/cn';

export interface PunchItem {
  id: string;
  punchAt: string;
  punchType: 'IN' | 'OUT';
  source?: string;
  label?: string;
}

interface PunchTimelineProps {
  punches: PunchItem[];
  className?: string;
}

const getSourceIcon = (source?: string) => {
  const s = (source || '').toUpperCase();
  if (s.includes('BIO') || s.includes('THUMB')) return <Fingerprint className="w-3.5 h-3.5 text-teal-600" />;
  if (s.includes('MOB') || s.includes('APP')) return <Smartphone className="w-3.5 h-3.5 text-sky-600" />;
  if (s.includes('WEB') || s.includes('PORTAL')) return <Globe className="w-3.5 h-3.5 text-indigo-600" />;
  return <Clock className="w-3.5 h-3.5 text-slate-500" />;
};

export const PunchTimeline: React.FC<PunchTimelineProps> = ({ punches = [], className }) => {
  if (punches.length === 0) {
    return (
      <div className={cn('p-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50', className)}>
        <Clock className="w-5 h-5 text-slate-400 mx-auto mb-1 opacity-75" />
        <p className="text-xs font-medium text-slate-500">No punch timestamps logged for this date</p>
      </div>
    );
  }

  return (
    <div className={cn('relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200', className)}>
      {punches.map((p, idx) => {
        const isCheckIn = p.punchType === 'IN';
        const punchDate = new Date(p.punchAt);
        const timeStr = punchDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });

        // Label determination
        let stepLabel = isCheckIn ? 'Check In' : 'Check Out';
        if (punches.length > 2) {
          if (idx === 1 && !isCheckIn) stepLabel = 'Break / Lunch Out';
          else if (idx === 2 && isCheckIn) stepLabel = 'Lunch Resume / In';
          else if (idx === punches.length - 1 && !isCheckIn) stepLabel = 'Final Check Out';
        }

        return (
          <div key={p.id || idx} className="relative flex items-start justify-between gap-3 text-xs">
            {/* Timeline node */}
            <span
              className={cn(
                'absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white shadow-2xs',
                isCheckIn ? 'bg-teal-500 text-white' : 'bg-slate-500 text-white',
              )}
            >
              {isCheckIn ? <LogIn className="w-2.5 h-2.5" /> : <LogOut className="w-2.5 h-2.5" />}
            </span>

            {/* Event info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{stepLabel}</span>
                <span className="text-[11px] font-mono text-slate-500">{timeStr}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Session #{Math.floor(idx / 2) + 1} • {isCheckIn ? 'Authorized Entry' : 'Session Recorded'}
              </p>
            </div>

            {/* Source badge */}
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
              {getSourceIcon(p.source)}
              <span className="capitalize">{p.source?.toLowerCase().replace(/_/g, ' ') || 'Device'}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
