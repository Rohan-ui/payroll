import React from 'react';
import { LogIn, LogOut, Clock, Smartphone, Globe, Fingerprint } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getPunchSessions, type AttendancePunch } from './punches';
import { attendanceToday, clockTime, formatDuration, useNow } from './duration';

interface PunchTimelineProps {
  punches: AttendancePunch[];
  /** The day (YYYY-MM-DD): an open check-in today counts up live. */
  date?: string;
  className?: string;
}

const getSourceIcon = (source?: string) => {
  const s = (source || '').toUpperCase();
  if (s.includes('BIO') || s.includes('THUMB') || s.includes('COSEC')) return <Fingerprint className="w-3.5 h-3.5 text-teal-600" />;
  if (s.includes('MOB') || s.includes('APP')) return <Smartphone className="w-3.5 h-3.5 text-sky-600" />;
  if (s.includes('WEB') || s.includes('PORTAL')) return <Globe className="w-3.5 h-3.5 text-indigo-600" />;
  return <Clock className="w-3.5 h-3.5 text-slate-500" />;
};

export const PunchTimeline: React.FC<PunchTimelineProps> = ({ punches, date, className }) => {
  const last = punches[punches.length - 1];
  const openToday = !!last && last.direction === 'IN' && !!date && date === attendanceToday();
  const now = useNow(openToday);
  if (punches.length === 0) {
    return (
      <div className={cn('p-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50', className)}>
        <Clock className="w-5 h-5 text-slate-400 mx-auto mb-1 opacity-75" />
        <p className="text-xs font-medium text-slate-500">No punch timestamps logged for this date</p>
      </div>
    );
  }

  const sessionLength = new Map(getPunchSessions(punches).map((s) => [s.number, s.ms]));

  return (
    <ol className={cn('relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200', className)}>
      {punches.map((p) => {
        const isCheckIn = p.direction === 'IN';
        const timeStr = clockTime(p.punchAt);
        const length = sessionLength.get(p.session);
        const running = openToday && p === last;

        return (
          <li key={p.raw.id || p.number} className="relative flex items-start justify-between gap-3 text-xs">
            {/* Timeline node */}
            <span
              aria-hidden="true"
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
                <span className="font-semibold text-slate-800">{isCheckIn ? 'Check In' : 'Check Out'}</span>
                <span className="text-[11px] font-mono text-slate-500 font-medium">{timeStr}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Punch #{p.number} • Session #{p.session}
                {!isCheckIn && length != null && ` • ${formatDuration(length)}`}
              </p>
              {running && (
                <p className="mt-0.5 text-[11px] font-semibold text-teal-700" aria-live="off">
                  Inside for <span className="font-mono tabular-nums">{formatDuration(now - new Date(p.punchAt).getTime())}</span>
                </p>
              )}
            </div>

            {/* Source badge */}
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
              {getSourceIcon(p.raw.source)}
              <span className="capitalize">{p.raw.source?.toLowerCase().replace(/_/g, ' ') || 'Device'}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
