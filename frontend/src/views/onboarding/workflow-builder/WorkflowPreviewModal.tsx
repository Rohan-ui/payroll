import React, { useState } from 'react';
import type {
  WorkflowStage,
  WorkflowTransition,
} from '../../../api/onboarding-workflows.api';
import {
  X,
  Play,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Slash,
  ShieldCheck,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';

interface WorkflowPreviewModalProps {
  stages: WorkflowStage[];
  transitions: WorkflowTransition[];
  onClose: () => void;
}

export const WorkflowPreviewModal: React.FC<WorkflowPreviewModalProps> = ({
  stages,
  transitions,
  onClose,
}) => {
  const initialStage = stages.find((s) => s.isInitial) || stages[0];
  const [currentStageId, setCurrentStageId] = useState<string>(initialStage?.id || '');
  const [history, setHistory] = useState<
    Array<{ stageId: string; stageName: string; timestamp: Date }>
  >(
    initialStage
      ? [{ stageId: initialStage.id, stageName: initialStage.name, timestamp: new Date() }]
      : [],
  );

  const currentStage = stages.find((s) => s.id === currentStageId);
  const outgoingTransitions = transitions.filter((t) => t.fromStageId === currentStageId);
  const nextStages = outgoingTransitions
    .map((t) => ({
      transition: t,
      stage: stages.find((s) => s.id === t.toStageId),
    }))
    .filter((item): item is { transition: WorkflowTransition; stage: WorkflowStage } => !!item.stage);

  const handleStepTo = (targetStage: WorkflowStage) => {
    setCurrentStageId(targetStage.id);
    setHistory((prev) => [
      ...prev,
      { stageId: targetStage.id, stageName: targetStage.name, timestamp: new Date() },
    ]);
  };

  const handleReset = () => {
    if (initialStage) {
      setCurrentStageId(initialStage.id);
      setHistory([
        { stageId: initialStage.id, stageName: initialStage.name, timestamp: new Date() },
      ]);
    }
  };

  const getStageIcon = (type: string) => {
    switch (type) {
      case 'START':
        return <Play className="w-4 h-4 text-emerald-500 fill-emerald-500" />;
      case 'APPROVAL':
        return <ShieldCheck className="w-4 h-4 text-purple-500" />;
      case 'WAITING':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'COMPLETED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'REJECTED':
        return <XCircle className="w-4 h-4 text-rose-500" />;
      case 'WITHDRAWN':
        return <Slash className="w-4 h-4 text-slate-500" />;
      default:
        return <ArrowRight className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#1E1D2D] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Interactive Workflow Simulator
              </h2>
              <p className="text-xs text-slate-500">
                Simulate candidate onboarding transitions through this workflow graph.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Breadcrumb Path */}
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Simulation Path ({history.length} steps)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {history.map((step, idx) => (
                <React.Fragment key={idx}>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                      idx === history.length - 1
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 font-bold'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {step.stageName}
                  </span>
                  {idx < history.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Current Stage Card */}
          {currentStage ? (
            <div
              className="p-5 rounded-2xl border bg-slate-50/50 dark:bg-slate-900/30 space-y-4"
              style={{
                borderColor: currentStage.colorCode || '#3B82F6',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm">
                    {getStageIcon(currentStage.stageType)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {currentStage.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {currentStage.stageKey}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      Type: {currentStage.stageType} • {currentStage.isInitial ? 'Start Stage' : currentStage.isTerminal ? 'Terminal Stage' : 'Standard Stage'}
                    </span>
                  </div>
                </div>

                {currentStage.isTerminal && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    Terminal Exit
                  </span>
                )}
              </div>

              {currentStage.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {currentStage.description}
                </p>
              )}

              {currentStage.stageConfig?.requiredAction &&
                currentStage.stageConfig.requiredAction !== 'NONE' && (
                  <div className="p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                    <Info className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Required Action before leaving:{' '}
                      <strong className="font-semibold">
                        {currentStage.stageConfig.requiredAction}
                      </strong>
                    </span>
                  </div>
                )}
            </div>
          ) : (
            <div className="text-center p-6 text-slate-400">No active stage selected.</div>
          )}

          {/* Permitted Next Stages / Actions */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Valid Outgoing Transitions ({nextStages.length})
            </span>

            {nextStages.length === 0 ? (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {currentStage?.isTerminal
                    ? 'Candidate reached a terminal stage.'
                    : 'No valid outgoing transitions configured from this stage.'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {currentStage?.isTerminal
                    ? 'The onboarding lifecycle concludes at this point.'
                    : 'Connect this stage to other stages in the visual builder.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {nextStages.map(({ transition, stage }) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => handleStepTo(stage)}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:border-blue-500 hover:shadow-md transition-all text-left flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/60 transition-colors">
                        {getStageIcon(stage.stageType)}
                      </span>
                      <div className="min-w-0">
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 block truncate">
                          {stage.name}
                        </span>
                        {transition.name ? (
                          <span className="text-[11px] text-slate-400 truncate block">
                            via {transition.name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 truncate block">
                            {stage.stageType}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Simulation
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
          >
            Close Simulator
          </button>
        </div>
      </div>
    </div>
  );
};
