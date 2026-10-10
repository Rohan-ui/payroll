import React from 'react';
import { attendanceToday, clockTime, formatDuration } from './duration';

interface LiveTimesProps {
  firstCheckInAt: string | null | undefined;
  lastCheckOutAt: string | null | undefined;
  /** The current time, from the parent's single live clock. */
  now: number;
  className?: string;
}

/** Whether someone checked in today (India time) and hasn't checked out. */
export const isInsideNow = (firstCheckInAt: string | null | undefined, lastCheckOutAt: string | null | undefined, now: number = Date.now()) =>
  !!firstCheckInAt && !lastCheckOutAt && attendanceToday(new Date(firstCheckInAt).getTime()) === attendanceToday(now);

/** Check-in and check-out to the second, and the time between them, counting up while still inside today. */
export const LiveTimes: React.FC<LiveTimesProps> = ({ firstCheckInAt, lastCheckOutAt, now, className }) => {
  if (!firstCheckInAt) return <span className={className ?? 'text-slate-400'}>No punch today</span>;
  const inside = isInsideNow(firstCheckInAt, lastCheckOutAt, now);
  const end = lastCheckOutAt ? new Date(lastCheckOutAt).getTime() : inside ? now : null;
  return (
    <span className={className}>
      <span className="font-mono tabular-nums">{clockTime(firstCheckInAt)} – {lastCheckOutAt ? clockTime(lastCheckOutAt) : inside ? 'inside' : 'no check-out'}</span>
      {end !== null && (
        <span className={`block font-mono tabular-nums text-[11px] ${inside ? 'font-semibold text-teal-700' : 'text-slate-500'}`}>
          {formatDuration(end - new Date(firstCheckInAt).getTime())}{inside ? ' · live' : ''}
        </span>
      )}
    </span>
  );
};
