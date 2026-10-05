import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../api/client';

interface Props {
  /** The workspace's today (YYYY-MM-DD), from the server. */
  today: string;
  mine: boolean;
  /** Opens the board on that date's touchpoints. */
  onPickDate: (date: string) => void;
}

interface Month {
  month: string;
  today: string;
  days: Record<string, number>;
  overdue: number;
  holidays: string[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * How many touchpoints fall due on each day of a month (workspace dates), to
 * plan the team's load. Weekends and holidays are marked; a day opens the board
 * on that day's touchpoints.
 */
export function OutreachCalendar({ today, mine, onPickDate }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<Month | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    apiFetch(`/api/v1/crm/cadence/calendar?month=${month}${mine ? '&mine=true' : ''}`, { feedback: { error: false } })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!live) return;
        if (res.ok && json?.success) setData(json.data);
        else setError(json?.message || 'The calendar could not be loaded. Try again.');
      })
      .catch(() => live && setError('The calendar could not be loaded. Try again.'));
    return () => { live = false; };
  }, [month, mine]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  const label = first.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
          <h3 className="text-sm font-bold text-slate-900 min-w-[9rem] text-center">{label}</h3>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        {data && data.overdue > 0 && (
          <button type="button" onClick={() => onPickDate(data.today)}
            className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">
            {`${data.overdue} overdue — open today's list`}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="grid grid-cols-7 gap-1 text-[11px]" role="grid" aria-label={`Touchpoints due in ${label}`}>
        {WEEKDAYS.map((d) => <div key={d} role="columnheader" className="text-center font-semibold text-slate-500 py-1">{d}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const count = data?.days[date] ?? 0;
          const weekend = i % 7 >= 5;
          const holiday = data?.holidays.includes(date);
          const isToday = date === today;
          return (
            <button key={date} type="button" role="gridcell" onClick={() => onPickDate(date)}
              aria-label={`${date}: ${count} ${count === 1 ? 'touchpoint' : 'touchpoints'} due${holiday ? ', holiday' : weekend ? ', weekend' : ''}`}
              className={`min-h-[64px] rounded-lg border p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 hover:border-indigo-400 ${
                isToday ? 'border-indigo-500 bg-indigo-50' : weekend || holiday ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className={`font-semibold ${isToday ? 'text-indigo-700' : ''}`}>{Number(date.slice(8))}</span>
                {holiday && <span className="text-[9px] font-semibold text-amber-700">Holiday</span>}
              </div>
              {count > 0 && <div className="mt-1 text-xs font-bold text-slate-800">{`${count} due`}</div>}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">Touchpoints are only scheduled on working days; weekends and holidays are greyed out.</p>
    </div>
  );
}
