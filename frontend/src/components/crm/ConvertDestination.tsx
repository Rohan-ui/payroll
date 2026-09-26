import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { COLD_FUNNEL_PIPELINE_CODE, coldFunnelDestination } from './pipelineBoard';

/** Shows where a converted outreach lead will go, or why it cannot be converted yet. */
export function ConvertDestination({ destination }: { destination: ReturnType<typeof coldFunnelDestination> }) {
  if (!destination) {
    return (
      <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs leading-relaxed flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          The Cold Funnel is not set up in this workspace, so this lead cannot be converted yet. In CRM Masters → Pipelines, add a pipeline
          named <span className="font-bold">Cold Funnel</span> (its code becomes <span className="font-mono font-bold">{COLD_FUNNEL_PIPELINE_CODE}</span>)
          with at least one stage.
        </p>
      </div>
    );
  }
  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Goes to</span>
      <span className="inline-flex flex-wrap items-center gap-1.5 font-bold text-slate-900">
        Sales Pipeline <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        {destination.pipeline.name} <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        {destination.stage.name}
      </span>
    </div>
  );
}
