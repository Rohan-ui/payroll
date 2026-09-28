import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { COLD_FUNNEL_PIPELINE_CODE, conversionDestination } from './pipelineBoard';

/**
 * The target pipeline (the Cold Funnel unless another is chosen) and the stage
 * a converted outreach lead starts in, with why it cannot be converted yet.
 */
export function ConvertDestination({
  destination,
  onPipelineChange,
  onStageChange,
}: {
  destination: ReturnType<typeof conversionDestination>;
  onPipelineChange: (pipelineId: string) => void;
  onStageChange: (stageId: string) => void;
}) {
  const { pipelines, pipeline, openStages, stage } = destination;
  const hasColdFunnel = pipelines.some((p) => p.isColdFunnel);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor="convert-pipeline" className="block text-xs font-bold text-slate-700 mb-1">Target Sales Pipeline</label>
        <select
          id="convert-pipeline"
          value={pipeline?.id ?? ''}
          onChange={(e) => onPipelineChange(e.target.value)}
          className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
        >
          {!pipeline && <option value="" disabled>Choose a pipeline</option>}
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.isColdFunnel ? ' (default)' : ''}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="convert-stage" className="block text-xs font-bold text-slate-700 mb-1">Initial Pipeline Stage</label>
        <select
          id="convert-stage"
          value={stage?.id ?? ''}
          disabled={!stage}
          onChange={(e) => onStageChange(e.target.value)}
          className="w-full px-3 py-2 text-xs border rounded-lg bg-white disabled:bg-slate-50 disabled:text-slate-500"
        >
          {!stage && <option value="">{pipeline ? 'No open stage' : 'Choose a pipeline first'}</option>}
          {openStages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {(!hasColdFunnel || (pipeline && !stage)) && (
        <div role="alert" className="sm:col-span-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs leading-relaxed flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          {pipeline && !stage ? (
            <p>
              <span className="font-bold">{pipeline.name}</span> has no open stage, so the lead cannot start there. Choose another pipeline, or add a
              stage to it in CRM Masters → Pipeline Stages.
            </p>
          ) : (
            <p>
              The Cold Funnel, where converted leads go by default, is not set up in this workspace. Choose a target pipeline, or in CRM Masters →
              Pipelines add a pipeline named <span className="font-bold">Cold Funnel</span> (its code becomes{' '}
              <span className="font-mono font-bold">{COLD_FUNNEL_PIPELINE_CODE}</span>) with at least one stage.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
