import React from 'react';

const COPY: Record<'campaigns' | 'audience' | 'deliverability', { title: string; body: string }> = {
  campaigns: {
    title: 'Email campaigns are coming soon',
    body: 'One-off emails to many leads at once will use the same sending engine as drip sequences: the do-not-email list, unsubscribe links, mailbox limits and the sending log. Until then, use a drip sequence with a single email.',
  },
  audience: {
    title: 'Audiences and segments are coming soon',
    body: 'For now, choose who gets a drip sequence with its enrollment rules (by stage, source and lead details), or add leads from Lead Management.',
  },
  deliverability: {
    title: 'Deliverability reports are coming soon',
    body: 'Bounces and unsubscribes from drip sequences are already recorded: see Drip Sequences → Sending activity and the do-not-email list. Sending accounts are set up in Organization Settings and My email settings.',
  },
};

/** An Email & Marketing tab that isn't built yet: says so, and where to go instead. No sample data. */
export const ComingSoon: React.FC<{ tab: keyof typeof COPY }> = ({ tab }) => (
  <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#181724] p-8 text-center">
    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{COPY[tab].title}</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">{COPY[tab].body}</p>
  </div>
);
