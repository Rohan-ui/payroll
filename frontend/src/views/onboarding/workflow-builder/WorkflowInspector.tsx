import React, { useState } from 'react';
import type {
  WorkflowStage,
  WorkflowTransition,
  WorkflowSummary,
  WorkflowValidationResult,
  WorkflowStageType,
} from '../../../api/onboarding-workflows.api';
import {
  STAGE_TYPE_OPTIONS,
  APP_MODULES,
  REQUIRED_ACTION_OPTIONS,
  COLOR_PALETTE,
  type SelectedElement,
} from './workflow-builder.types';
import {
  X,
  Play,
  Zap,
  ArrowRight,
  ShieldCheck,
  GitBranch,
  Clock,
  Hourglass,
  Mail,
  CheckCircle2,
  XCircle,
  Slash,
  Trash2,
  Plus,
  AlertCircle,
  Check,
  Sparkles,
  Copy,
  Info,
  Sliders,
  Settings,
  Layers,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface WorkflowInspectorProps {
  workflow: WorkflowSummary | null;
  stages: WorkflowStage[];
  transitions: WorkflowTransition[];
  selectedElement: SelectedElement;
  validationResult: WorkflowValidationResult | null;
  onSelectElement: (element: SelectedElement) => void;
  onUpdateStage: (stageId: string, updates: Partial<WorkflowStage>) => void;
  onDeleteStage: (stageId: string) => void;
  onAddTransition: (fromStageId: string, toStageId: string, name?: string) => void;
  onDeleteTransition: (fromStageId: string, toStageId: string) => void;
  onUpdateTransition: (
    fromStageId: string,
    toStageId: string,
    updates: Partial<WorkflowTransition>,
  ) => void;
  onUpdateWorkflowMeta: (updates: {
    name?: string;
    description?: string;
    module?: string;
    triggerType?: string;
    isActive?: boolean;
    isDefault?: boolean;
  }) => void;
  onAutoLayout: () => void;
  onDuplicateWorkflow?: () => void;
  isReadOnly?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const WorkflowInspector: React.FC<WorkflowInspectorProps> = ({
  workflow,
  stages,
  transitions,
  selectedElement,
  validationResult,
  onSelectElement,
  onUpdateStage,
  onDeleteStage,
  onAddTransition,
  onDeleteTransition,
  onUpdateTransition,
  onUpdateWorkflowMeta,
  onAutoLayout,
  onDuplicateWorkflow,
  isReadOnly = false,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [newTargetStageId, setNewTargetStageId] = useState('');

  // Active module meta
  const currentModule = APP_MODULES.find((m) => m.code === (workflow?.module || 'ONBOARDING')) || APP_MODULES[0];

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-4 bg-white dark:bg-[#1E1D2D] border-l border-slate-200 dark:border-slate-800 w-12 z-20">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand Properties Panel"
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="[writing-mode:vertical-rl] text-xs font-semibold text-slate-400 mt-6 tracking-wider uppercase">
          Properties
        </span>
      </div>
    );
  }

  // 1. STAGE / NODE INSPECTOR
  if (selectedElement?.type === 'STAGE') {
    const stage = stages.find((s) => s.id === selectedElement.stageId);
    if (!stage) {
      return (
        <div className="p-4 text-sm text-slate-500 w-80 lg:w-96 border-l border-slate-200 dark:border-slate-800">
          Selected node could not be found.
        </div>
      );
    }

    const outgoing = transitions.filter((t) => t.fromStageId === stage.id);
    const potentialTargets = stages.filter(
      (s) => s.id !== stage.id && !outgoing.some((o) => o.toStageId === s.id),
    );

    const handleStageTypeChange = (newType: WorkflowStageType) => {
      const typeOption = STAGE_TYPE_OPTIONS.find((t) => t.type === newType);
      const isInitial = newType === 'START' || newType === 'TRIGGER';
      const isTerminal = typeOption?.isTerminalDefault ?? stage.isTerminal;
      const color = typeOption?.defaultColor || stage.colorCode;

      onUpdateStage(stage.id, {
        stageType: newType,
        isInitial,
        isTerminal,
        colorCode: color,
      });
    };

    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#1E1D2D] border-l border-slate-200 dark:border-slate-800 w-80 lg:w-96 overflow-y-auto z-20">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#1E1D2D] z-10">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: stage.colorCode || '#3B82F6' }}
            />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Node Properties
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse Panel"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectElement({ type: 'WORKFLOW' })}
              title="Close"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* Node Name */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Node Name *
            </label>
            <input
              type="text"
              value={stage.name}
              disabled={isReadOnly}
              onChange={(e) => onUpdateStage(stage.id, { name: e.target.value })}
              placeholder="e.g. Schedule Interview"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Node Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-700 dark:text-slate-300">
                System Identifier (Key) *
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Stable ID</span>
            </div>
            <input
              type="text"
              value={stage.stageKey}
              disabled={isReadOnly}
              onChange={(e) => {
                const stageKey = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9_]/g, '_')
                  .slice(0, 64);
                onUpdateStage(stage.id, { stageKey });
              }}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 font-mono text-[11px] text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Node Category & Type */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Node Category & Type
            </label>
            <select
              value={stage.stageType}
              disabled={isReadOnly}
              onChange={(e) => handleStageTypeChange(e.target.value as WorkflowStageType)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {STAGE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.type} value={opt.type}>
                  [{opt.category}] {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              {STAGE_TYPE_OPTIONS.find((t) => t.type === stage.stageType)?.description}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={stage.description || ''}
              disabled={isReadOnly}
              onChange={(e) => onUpdateStage(stage.id, { description: e.target.value })}
              placeholder="What this step achieves in the workflow..."
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Switches */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Initial Start Node
                </span>
                <p className="text-[11px] text-slate-400">Entry point for new workflows</p>
              </div>
              <input
                type="checkbox"
                checked={stage.isInitial}
                disabled={isReadOnly}
                onChange={(e) => {
                  const isInitial = e.target.checked;
                  onUpdateStage(stage.id, {
                    isInitial,
                    stageType: isInitial ? 'START' : stage.stageType,
                  });
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Terminal End Node
                </span>
                <p className="text-[11px] text-slate-400">Workflow execution ends here</p>
              </div>
              <input
                type="checkbox"
                checked={stage.isTerminal}
                disabled={isReadOnly}
                onChange={(e) => onUpdateStage(stage.id, { isTerminal: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-300">Active</span>
                <p className="text-[11px] text-slate-400">Enable or disable this step</p>
              </div>
              <input
                type="checkbox"
                checked={stage.isActive}
                disabled={isReadOnly}
                onChange={(e) => onUpdateStage(stage.id, { isActive: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>

          {/* Color Picker */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Node Accent Color
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.name}
                  onClick={() => onUpdateStage(stage.id, { colorCode: c.value })}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    stage.colorCode === c.value ? 'scale-125 ring-2 ring-blue-500' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>

          {/* Module-Specific Action Rules */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
              <Sliders className="w-3.5 h-3.5 text-blue-500" />
              <span>{currentModule.name} Actions</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Module checks required before transitioning out of this step.
            </p>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Required Module Action
              </label>
              <select
                value={stage.stageConfig?.requiredAction || 'NONE'}
                disabled={isReadOnly}
                onChange={(e) =>
                  onUpdateStage(stage.id, {
                    stageConfig: {
                      ...stage.stageConfig,
                      requiredAction: e.target.value as any,
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="NONE">None (Standard Progression)</option>
                {currentModule.actions.map((action) => (
                  <option key={action.code} value={action.code}>
                    {action.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={!!stage.stageConfig?.requiredNotes}
                disabled={isReadOnly}
                onChange={(e) =>
                  onUpdateStage(stage.id, {
                    stageConfig: {
                      ...stage.stageConfig,
                      requiredNotes: e.target.checked,
                    },
                  })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-600 dark:text-slate-400">
                Require audit notes on transition
              </span>
            </label>
          </div>

          {/* Permitted Outgoing Transitions */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Outgoing Connections ({outgoing.length})
              </span>
              <span className="text-[10px] text-slate-400">Allowed next steps</span>
            </div>

            <div className="space-y-1 max-h-36 overflow-y-auto">
              {outgoing.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">
                  {stage.isTerminal ? 'Terminal node (no outgoing paths)' : 'No outgoing paths connected.'}
                </p>
              ) : (
                outgoing.map((t) => {
                  const target = stages.find((s) => s.id === t.toStageId);
                  return (
                    <div
                      key={t.toStageId}
                      className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <ArrowRight className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          {target?.name || t.toStageKey || 'Unknown'}
                        </span>
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => onDeleteTransition(t.fromStageId, t.toStageId)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          title="Remove transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Accessible connect dropdown */}
            {!isReadOnly && !stage.isTerminal && potentialTargets.length > 0 && (
              <div className="flex items-center gap-1 pt-1">
                <select
                  value={newTargetStageId}
                  onChange={(e) => setNewTargetStageId(e.target.value)}
                  className="flex-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                >
                  <option value="">Connect to node...</option>
                  {potentialTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!newTargetStageId}
                  onClick={() => {
                    if (newTargetStageId) {
                      onAddTransition(stage.id, newTargetStageId);
                      setNewTargetStageId('');
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Delete Node */}
          {!isReadOnly && !stage.isInitial && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => onDeleteStage(stage.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Node
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. TRANSITION / EDGE INSPECTOR
  if (selectedElement?.type === 'TRANSITION') {
    const transition = transitions.find(
      (t) =>
        t.fromStageId === selectedElement.fromStageId &&
        t.toStageId === selectedElement.toStageId,
    );
    const fromStage = stages.find((s) => s.id === selectedElement.fromStageId);
    const toStage = stages.find((s) => s.id === selectedElement.toStageId);

    if (!transition || !fromStage || !toStage) {
      return (
        <div className="p-4 text-sm text-slate-500 w-80 lg:w-96 border-l border-slate-200 dark:border-slate-800">
          Selected connection could not be found.
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#1E1D2D] border-l border-slate-200 dark:border-slate-800 w-80 lg:w-96 overflow-y-auto z-20">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#1E1D2D] z-10">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Connector Settings
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onSelectElement({ type: 'WORKFLOW' })}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between text-slate-500">
              <span>Source Node</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{fromStage.name}</span>
            </div>
            <div className="flex items-center justify-center py-0.5">
              <ArrowRight className="w-4 h-4 text-blue-500 rotate-90" />
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Target Node</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{toStage.name}</span>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Connector Label (Displayed on curve)
            </label>
            <input
              type="text"
              value={transition.name || ''}
              disabled={isReadOnly}
              onChange={(e) =>
                onUpdateTransition(fromStage.id, toStage.id, { name: e.target.value })
              }
              placeholder="e.g. Approved / Cleared / Yes"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Branch Condition
            </label>
            <select
              value={transition.conditionType || 'STANDARD'}
              disabled={isReadOnly}
              onChange={(e) =>
                onUpdateTransition(fromStage.id, toStage.id, { conditionType: e.target.value })
              }
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="STANDARD">Standard Forward Path</option>
              <option value="APPROVE">Approval / Success Path</option>
              <option value="REJECT">Rejection / Disqualification Path</option>
              <option value="HOLD">Hold / Waitlist Path</option>
            </select>
          </div>

          {!isReadOnly && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => onDeleteTransition(fromStage.id, toStage.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove Connector
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. WORKFLOW METADATA & GRAPH INTEGRITY
  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1E1D2D] border-l border-slate-200 dark:border-slate-800 w-80 lg:w-96 overflow-y-auto z-20">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#1E1D2D] z-10">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            Workflow Configuration
          </h3>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Panel"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4 text-xs">
        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Workflow Name
          </label>
          <input
            type="text"
            value={workflow?.name || ''}
            disabled={isReadOnly}
            onChange={(e) => onUpdateWorkflowMeta({ name: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Application Module Selector */}
        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Application Module
          </label>
          <select
            value={workflow?.module || 'ONBOARDING'}
            disabled={isReadOnly}
            onChange={(e) => onUpdateWorkflowMeta({ module: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {APP_MODULES.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            {currentModule.description}
          </p>
        </div>

        {/* Trigger Type */}
        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Initial Trigger Type
          </label>
          <select
            value={workflow?.triggerType || 'MANUAL'}
            disabled={isReadOnly}
            onChange={(e) => onUpdateWorkflowMeta({ triggerType: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {currentModule.triggers.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description
          </label>
          <textarea
            rows={2}
            value={workflow?.description || ''}
            disabled={isReadOnly}
            onChange={(e) => onUpdateWorkflowMeta({ description: e.target.value })}
            placeholder="Workflow purpose or notes..."
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Defaults & Status */}
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="font-medium text-slate-700 dark:text-slate-300">Default for Module</span>
              <p className="text-[11px] text-slate-400">Used for new module records by default</p>
            </div>
            <input
              type="checkbox"
              checked={!!workflow?.isDefault}
              disabled={isReadOnly}
              onChange={(e) => onUpdateWorkflowMeta({ isDefault: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="font-medium text-slate-700 dark:text-slate-300">Active</span>
              <p className="text-[11px] text-slate-400">Enable or disable this workflow</p>
            </div>
            <input
              type="checkbox"
              checked={!!workflow?.isActive}
              disabled={isReadOnly}
              onChange={(e) => onUpdateWorkflowMeta({ isActive: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
        </div>

        {/* Validation Status */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Graph Integrity
            </span>
            {validationResult ? (
              validationResult.isValid ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  <Check className="w-3 h-3" /> Valid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-3 h-3" /> Errors
                </span>
              )
            ) : null}
          </div>

          {validationResult?.errors && validationResult.errors.length > 0 && (
            <div className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 space-y-1">
              <span className="font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Validation Errors:
              </span>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                {validationResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <span className="font-medium text-slate-700 dark:text-slate-300 mb-2 block">
            Metrics
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 block">Total Nodes</span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                {stages.length}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 block">Connections</span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                {transitions.length}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={onAutoLayout}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Auto Arrange Nodes
          </button>

          {onDuplicateWorkflow && (
            <button
              type="button"
              onClick={onDuplicateWorkflow}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-blue-500" />
              Duplicate Workflow
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
