import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { cn } from '../../../utils/cn';
import { INTERVIEW_STATUS_META, type InterviewListItem } from '../../../api/onboarding.api';
import { INTERVIEW_TYPE_LABELS } from '../onboarding-format';
import { TYPE_ICON } from './InterviewCard';
import { feedbackCount, STAGE_BY_ID, stageOf, timeLabel } from './interview-utils';

type SortKey = 'when' | 'candidate' | 'round' | 'stage';
type Sort = { key: SortKey; asc: boolean };

// Outside the table so a click keeps focus on the same button instead of remounting it.
const Header: React.FC<{ id: SortKey; sort: Sort; onSort: (sort: Sort) => void; children: React.ReactNode; className?: string }> = ({ id, sort, onSort, children, className }) => {
  const isOn = sort.key === id;
  const Icon = !isOn ? ChevronsUpDown : sort.asc ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={isOn ? (sort.asc ? 'ascending' : 'descending') : 'none'} className={cn('px-4 py-2.5 font-medium', className)}>
      <button type="button" onClick={() => onSort({ key: id, asc: isOn ? !sort.asc : true })} className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
        {children} <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </th>
  );
};

const STAGE_ORDER = { awaiting: 0, upcoming: 1, passed: 2, failed: 3, cancelled: 4 } as const;

/** Every interview in the period as a sortable table; earliest first unless another column is picked. */
export const InterviewTable: React.FC<{ rows: InterviewListItem[]; now: number; onOpen: (candidateId: string) => void }> = ({ rows, now, onOpen }) => {
  const [sort, setSort] = useState<Sort>({ key: 'when', asc: true });
  const compare = (a: InterviewListItem, b: InterviewListItem) => {
    const by: Record<SortKey, number> = {
      when: a.startsAt.localeCompare(b.startsAt),
      candidate: a.candidate.name.localeCompare(b.candidate.name),
      round: a.roundNumber - b.roundNumber,
      stage: STAGE_ORDER[stageOf(a, now)] - STAGE_ORDER[stageOf(b, now)],
    };
    return (by[sort.key] || a.startsAt.localeCompare(b.startsAt)) * (sort.asc ? 1 : -1);
  };
  const sorted = [...rows].sort(compare);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] overflow-x-auto">
      <table className="w-full text-sm text-left">
        <caption className="sr-only">Interviews, sortable by column</caption>
        <thead className="bg-slate-50 dark:bg-[#1E1D2D] text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#2B293E]">
          <tr>
            <Header id="when" sort={sort} onSort={setSort}>When</Header>
            <Header id="candidate" sort={sort} onSort={setSort}>Candidate</Header>
            <Header id="round" sort={sort} onSort={setSort} className="hidden md:table-cell">Round</Header>
            <th scope="col" className="px-4 py-2.5 font-medium hidden lg:table-cell">Type</th>
            <th scope="col" className="px-4 py-2.5 font-medium hidden lg:table-cell">Panel</th>
            <Header id="stage" sort={sort} onSort={setSort}>Status</Header>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
          {sorted.map((row) => {
            const stage = STAGE_BY_ID[stageOf(row, now)];
            const fb = feedbackCount(row);
            const Icon = TYPE_ICON[row.interviewType];
            return (
              <tr key={row.id} onClick={() => onOpen(row.candidate.id)} className={cn('cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5', row.status === 'CANCELLED' && 'opacity-60')}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="block font-medium text-slate-900 dark:text-slate-100">{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(row.startsAt))}</span>
                  <span className="block text-xs text-slate-500 tabular-nums">{timeLabel(row.startsAt)} · {row.durationMinutes} min</span>
                </td>
                <td className="px-4 py-3 max-w-[16rem]">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(row.candidate.id); }} className="block max-w-full truncate text-left font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
                    {row.candidate.name}
                  </button>
                  <span className="block text-xs text-slate-500 truncate">{row.candidate.position}</span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-700 dark:text-slate-300">
                  {row.roundNumber}{row.roundName && <span className="block text-xs text-slate-500">{row.roundName}</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-700 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />{INTERVIEW_TYPE_LABELS[row.interviewType]}</span>
                  {(row.location || row.meetingLink) && <span className="block text-xs text-slate-500 truncate max-w-[12rem]">{row.location ?? 'Meeting link set'}</span>}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-700 dark:text-slate-300">
                  <span className="block truncate max-w-[14rem]" title={row.panel.map((p) => p.name).join(', ')}>{row.panel.map((p) => p.name).join(', ') || '—'}</span>
                  {fb.total > 0 && <span className="block text-xs text-slate-500">{fb.done} of {fb.total} feedback in</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span className={cn('w-2 h-2 rounded-full', stage.dot)} aria-hidden="true" />{stage.label}
                  </span>
                  {row.status === 'RESCHEDULED' && <Badge variant={INTERVIEW_STATUS_META.RESCHEDULED.variant} size="sm" className="mt-1">Rescheduled</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
