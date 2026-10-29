import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  onboardingWorkflowsApi,
  type WorkflowSummary,
  type WorkflowVersion,
  type WorkflowStage,
  type WorkflowTransition,
  type WorkflowValidationResult,
  type WorkflowStageType,
} from '../../../api/onboarding-workflows.api';
import { WorkflowCanvas } from './WorkflowCanvas';
import { WorkflowInspector } from './WorkflowInspector';
import { WorkflowPreviewModal } from './WorkflowPreviewModal';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import {
  type SelectedElement,
  NODE_WIDTH,
  NODE_HEIGHT,
  APP_MODULES,
  STAGE_TYPE_OPTIONS,
} from './workflow-builder.types';
import {
  Layers,
  Save,
  Send,
  Eye,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  RotateCw,
  Sparkles,
  ChevronDown,
  Check,
  X,
  FileCheck2,
  FolderGit2,
  Maximize2,
  Minimize2,
  Grid,
  Keyboard,
  Filter,
} from 'lucide-react';

export const WorkflowBuilderView: React.FC = () => {
  // Full-Screen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Module filter
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('ALL');

  // Workflows list & selection
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Workflow version mode being viewed/edited
  const [activeVersionMode, setActiveVersionMode] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowSummary | null>(null);
  const [draftVersion, setDraftVersion] = useState<WorkflowVersion | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<WorkflowVersion | null>(null);

  // Editable stages & transitions for current version
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [transitions, setTransitions] = useState<WorkflowTransition[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Undo & Redo History Stack
  const [undoStack, setUndoStack] = useState<
    Array<{ stages: WorkflowStage[]; transitions: WorkflowTransition[] }>
  >([]);
  const [redoStack, setRedoStack] = useState<
    Array<{ stages: WorkflowStage[]; transitions: WorkflowTransition[] }>
  >([]);

  // Selection & UI options
  const [selectedElement, setSelectedElement] = useState<SelectedElement>({ type: 'WORKFLOW' });
  const [gridSnapEnabled, setGridSnapEnabled] = useState(true);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [publishSummary, setPublishSummary] = useState('');

  // New Workflow form fields
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');
  const [newWorkflowModule, setNewWorkflowModule] = useState('ONBOARDING');
  const [newWorkflowTrigger, setNewWorkflowTrigger] = useState('MANUAL');

  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);

  // Push current state to undo history before mutations
  const pushHistorySnapshot = useCallback(
    (nextStages: WorkflowStage[], nextTransitions: WorkflowTransition[]) => {
      setUndoStack((prev) => [
        ...prev.slice(-30), // keep last 30 snapshots
        { stages, transitions },
      ]);
      setRedoStack([]); // clear redo on new action
      setStages(nextStages);
      setTransitions(nextTransitions);
      setHasUnsavedChanges(true);
    },
    [stages, transitions],
  );

  // Undo
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || activeVersionMode === 'PUBLISHED') return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, { stages, transitions }]);
    setStages(previous.stages);
    setTransitions(previous.transitions);
    setHasUnsavedChanges(true);
  }, [undoStack, stages, transitions, activeVersionMode]);

  // Redo
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || activeVersionMode === 'PUBLISHED') return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, { stages, transitions }]);
    setStages(next.stages);
    setTransitions(next.transitions);
    setHasUnsavedChanges(true);
  }, [redoStack, stages, transitions, activeVersionMode]);

  // Full-Screen Toggle
  const toggleFullscreen = useCallback(async () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Fallback to application-level full-screen layout
      }
    } else {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch {
        // Ignore exit failure
      }
    }
  }, [isFullscreen]);

  // Listen to browser native fullscreen change (e.g. Esc pressed natively)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isFullscreen]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is inside an input/textarea/select
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !saving && activeVersionMode === 'DRAFT') {
          handleSaveDraft();
        }
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (activeVersionMode === 'DRAFT') {
          setShowPublishModal(true);
        }
      } else if (e.key === 'f' && !mod && !e.altKey) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal(true);
      } else if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    hasUnsavedChanges,
    saving,
    activeVersionMode,
    isFullscreen,
    handleUndo,
    handleRedo,
    toggleFullscreen,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load all workflows (optionally filtered by module)
  const loadWorkflows = useCallback(
    async (moduleFilter = selectedModuleFilter) => {
      try {
        setLoading(true);
        setError(null);
        const list = await onboardingWorkflowsApi.listWorkflows(
          moduleFilter === 'ALL' ? undefined : moduleFilter,
        );
        setWorkflows(list);
        if (list.length > 0) {
          const match = list.find((w) => w.id === selectedWorkflowId);
          if (!match) {
            const defaultWf = list.find((w) => w.isDefault) || list[0];
            setSelectedWorkflowId(defaultWf.id);
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load workflows.');
      } finally {
        setLoading(false);
      }
    },
    [selectedModuleFilter, selectedWorkflowId],
  );

  useEffect(() => {
    loadWorkflows(selectedModuleFilter);
  }, [selectedModuleFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load selected workflow details
  const loadWorkflowDetails = useCallback(
    async (workflowId: string) => {
      try {
        setError(null);
        const data = await onboardingWorkflowsApi.getWorkflow(workflowId);
        setCurrentWorkflow(data.workflow);
        setDraftVersion(data.draftVersion);
        setPublishedVersion(data.publishedVersion);

        const targetVersion =
          activeVersionMode === 'PUBLISHED' && data.publishedVersion
            ? data.publishedVersion
            : data.draftVersion || data.publishedVersion;

        if (targetVersion) {
          setStages(targetVersion.stages || []);
          setTransitions(targetVersion.transitions || []);
        } else {
          setStages([]);
          setTransitions([]);
        }
        setHasUnsavedChanges(false);
        setUndoStack([]);
        setRedoStack([]);

        try {
          const val = await onboardingWorkflowsApi.validateWorkflow(workflowId);
          setValidationResult(val);
        } catch {
          // ignore
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load workflow details.');
      }
    },
    [activeVersionMode],
  );

  useEffect(() => {
    if (selectedWorkflowId) {
      loadWorkflowDetails(selectedWorkflowId);
    }
  }, [selectedWorkflowId, activeVersionMode, loadWorkflowDetails]);

  // Stage updates
  const handleUpdateStagePosition = useCallback(
    (stageId: string, x: number, y: number) => {
      setStages((prev) =>
        prev.map((s) => (s.id === stageId ? { ...s, positionX: x, positionY: y } : s)),
      );
      setHasUnsavedChanges(true);
    },
    [],
  );

  const handleUpdateStage = useCallback(
    (stageId: string, updates: Partial<WorkflowStage>) => {
      const nextStages = stages.map((s) => {
        if (updates.isInitial) {
          return s.id === stageId
            ? { ...s, ...updates, isInitial: true }
            : { ...s, isInitial: false };
        }
        return s.id === stageId ? { ...s, ...updates } : s;
      });
      pushHistorySnapshot(nextStages, transitions);
    },
    [stages, transitions, pushHistorySnapshot],
  );

  const handleAddStage = useCallback(() => {
    const existingKeys = new Set(stages.map((s) => s.stageKey));
    let baseKey = 'STEP';
    let counter = stages.length + 1;
    while (existingKeys.has(`${baseKey}_${counter}`)) {
      counter++;
    }

    const maxX = stages.length > 0 ? Math.max(...stages.map((s) => s.positionX)) : 60;
    const newStage: WorkflowStage = {
      id: `stage-${Date.now()}`,
      stageKey: `${baseKey}_${counter}`,
      name: `Step ${stages.length + 1}`,
      description: '',
      stageType: 'STANDARD',
      isInitial: stages.length === 0,
      isTerminal: false,
      colorCode: '#3B82F6',
      iconName: 'ArrowRight',
      positionX: maxX + 290,
      positionY: 100,
      displayOrder: stages.length + 1,
      isActive: true,
      stageConfig: { requiredAction: 'NONE' },
    };

    const nextStages = [...stages, newStage];
    pushHistorySnapshot(nextStages, transitions);
    setSelectedElement({ type: 'STAGE', stageId: newStage.id });
  }, [stages, transitions, pushHistorySnapshot]);

  const handleDeleteStage = useCallback(
    (stageId: string) => {
      const stage = stages.find((s) => s.id === stageId);
      if (stage?.isInitial) {
        setError('Cannot delete the starting initial node of the workflow.');
        return;
      }
      const nextStages = stages.filter((s) => s.id !== stageId);
      const nextTransitions = transitions.filter(
        (t) => t.fromStageId !== stageId && t.toStageId !== stageId,
      );
      pushHistorySnapshot(nextStages, nextTransitions);
      setSelectedElement({ type: 'WORKFLOW' });
    },
    [stages, transitions, pushHistorySnapshot],
  );

  // Transition updates
  const handleAddTransition = useCallback(
    (fromStageId: string, toStageId: string, name?: string) => {
      if (fromStageId === toStageId) return;
      const exists = transitions.some(
        (t) => t.fromStageId === fromStageId && t.toStageId === toStageId,
      );
      if (exists) return;

      const fromStage = stages.find((s) => s.id === fromStageId);
      const toStage = stages.find((s) => s.id === toStageId);

      const newTransition: WorkflowTransition = {
        fromStageId,
        toStageId,
        fromStageKey: fromStage?.stageKey,
        toStageKey: toStage?.stageKey,
        name: name || undefined,
        conditionType: 'STANDARD',
      };

      const nextTransitions = [...transitions, newTransition];
      pushHistorySnapshot(stages, nextTransitions);
    },
    [transitions, stages, pushHistorySnapshot],
  );

  const handleDeleteTransition = useCallback(
    (fromStageId: string, toStageId: string) => {
      const nextTransitions = transitions.filter(
        (t) => !(t.fromStageId === fromStageId && t.toStageId === toStageId),
      );
      pushHistorySnapshot(stages, nextTransitions);
      if (
        selectedElement?.type === 'TRANSITION' &&
        selectedElement.fromStageId === fromStageId &&
        selectedElement.toStageId === toStageId
      ) {
        setSelectedElement({ type: 'WORKFLOW' });
      }
    },
    [selectedElement, stages, transitions, pushHistorySnapshot],
  );

  const handleUpdateTransition = useCallback(
    (fromStageId: string, toStageId: string, updates: Partial<WorkflowTransition>) => {
      const nextTransitions = transitions.map((t) =>
        t.fromStageId === fromStageId && t.toStageId === toStageId ? { ...t, ...updates } : t,
      );
      pushHistorySnapshot(stages, nextTransitions);
    },
    [stages, transitions, pushHistorySnapshot],
  );

  // Auto Layout Algorithm: Topological DAG Columns
  const handleAutoLayout = useCallback(() => {
    if (stages.length === 0) return;

    const initialStages = stages.filter((s) => s.isInitial);
    const depths = new Map<string, number>();
    const queue: Array<{ id: string; depth: number }> = [];

    initialStages.forEach((s) => {
      depths.set(s.id, 0);
      queue.push({ id: s.id, depth: 0 });
    });

    const adj = new Map<string, string[]>();
    transitions.forEach((t) => {
      const list = adj.get(t.fromStageId) || [];
      list.push(t.toStageId);
      adj.set(t.fromStageId, list);
    });

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const neighbors = adj.get(id) || [];
      neighbors.forEach((nbrId) => {
        const currentDepth = depths.get(nbrId) ?? -1;
        if (depth + 1 > currentDepth) {
          depths.set(nbrId, depth + 1);
          queue.push({ id: nbrId, depth: depth + 1 });
        }
      });
    }

    let maxDepth = 0;
    depths.forEach((d) => {
      if (d > maxDepth) maxDepth = d;
    });

    stages.forEach((s) => {
      if (!depths.has(s.id)) {
        maxDepth++;
        depths.set(s.id, maxDepth);
      }
    });

    const columns = new Map<number, WorkflowStage[]>();
    stages.forEach((s) => {
      const col = depths.get(s.id) || 0;
      const list = columns.get(col) || [];
      list.push(s);
      columns.set(col, list);
    });

    const updatedStages = stages.map((s) => {
      const col = depths.get(s.id) || 0;
      const colStages = columns.get(col) || [];
      const rowIdx = colStages.findIndex((item) => item.id === s.id);
      const x = 60 + col * 310;
      const y = 80 + rowIdx * 160;
      return { ...s, positionX: x, positionY: y };
    });

    pushHistorySnapshot(updatedStages, transitions);
  }, [stages, transitions, pushHistorySnapshot]);

  // Save Draft
  const handleSaveDraft = async () => {
    if (!selectedWorkflowId) return;
    try {
      setSaving(true);
      setError(null);
      await onboardingWorkflowsApi.saveDraft(selectedWorkflowId, {
        stages,
        transitions,
      });
      setHasUnsavedChanges(false);
      setSuccessMessage('Draft saved successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);

      const val = await onboardingWorkflowsApi.validateWorkflow(selectedWorkflowId);
      setValidationResult(val);
    } catch (err: any) {
      setError(err?.message || 'Failed to save workflow draft.');
    } finally {
      setSaving(false);
    }
  };

  // Publish Workflow
  const handlePublishConfirm = async () => {
    if (!selectedWorkflowId) return;
    try {
      setPublishing(true);
      setError(null);
      await onboardingWorkflowsApi.publishWorkflow(selectedWorkflowId, {
        changeSummary: publishSummary.trim() || undefined,
      });
      setShowPublishModal(false);
      setPublishSummary('');
      setHasUnsavedChanges(false);
      setSuccessMessage('Workflow published successfully! Active across the organization.');
      setTimeout(() => setSuccessMessage(null), 4000);

      await loadWorkflows();
      await loadWorkflowDetails(selectedWorkflowId);
    } catch (err: any) {
      setError(err?.message || 'Failed to publish workflow.');
    } finally {
      setPublishing(false);
    }
  };

  // Duplicate Workflow
  const handleDuplicate = async () => {
    if (!selectedWorkflowId) return;
    try {
      setLoading(true);
      const res = await onboardingWorkflowsApi.duplicateWorkflow(selectedWorkflowId);
      setSuccessMessage(`Duplicated workflow as "${res.workflow.name}".`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadWorkflows();
      setSelectedWorkflowId(res.workflow.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to duplicate workflow.');
    } finally {
      setLoading(false);
    }
  };

  // Create New Workflow
  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkflowName.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const res = await onboardingWorkflowsApi.createWorkflow({
        name: newWorkflowName.trim(),
        description: newWorkflowDesc.trim() || undefined,
        module: newWorkflowModule,
        triggerType: newWorkflowTrigger,
        isDefault: workflows.length === 0,
      });
      setShowCreateModal(false);
      setNewWorkflowName('');
      setNewWorkflowDesc('');
      setSuccessMessage(`Created workflow "${res.workflow.name}".`);
      setTimeout(() => setSuccessMessage(null), 3000);

      await loadWorkflows();
      setSelectedWorkflowId(res.workflow.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to create new workflow.');
    } finally {
      setLoading(false);
    }
  };

  const currentModuleDef =
    APP_MODULES.find((m) => m.code === (currentWorkflow?.module || 'ONBOARDING')) ||
    APP_MODULES[0];

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150'
          : 'space-y-4'
      }
    >
      {/* Top Banner Alerts */}
      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workflow Builder Box */}
      <div
        className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1E1D2D] shadow-sm overflow-hidden flex flex-col ${
          isFullscreen ? 'h-full flex-1 rounded-none border-none' : ''
        }`}
      >
        {/* Editor Top Navigation & Action Toolbar */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/70 dark:bg-slate-900/60 z-30">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Module Filter */}
            <div className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
              <select
                value={selectedModuleFilter}
                onChange={(e) => setSelectedModuleFilter(e.target.value)}
                className="bg-transparent font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL">All Modules</option>
                {APP_MODULES.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Workflow Picker */}
            <div className="relative">
              <select
                value={selectedWorkflowId || ''}
                onChange={(e) => {
                  setSelectedWorkflowId(e.target.value);
                  setActiveVersionMode('DRAFT');
                }}
                className="pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none cursor-pointer appearance-none shadow-2xs"
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    [{w.module}] {w.name} {w.isDefault ? '★ (Default)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Module Badge */}
            {currentWorkflow && (
              <span
                style={{ backgroundColor: `${currentModuleDef.color}15`, color: currentModuleDef.color }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-current/20 hidden sm:inline-flex items-center gap-1"
              >
                {currentModuleDef.name}
              </span>
            )}

            {/* Version Switcher */}
            <div className="flex items-center p-0.5 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setActiveVersionMode('DRAFT')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  activeVersionMode === 'DRAFT'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Draft (v{draftVersion?.versionNumber || 1})
              </button>
              {publishedVersion && (
                <button
                  type="button"
                  onClick={() => setActiveVersionMode('PUBLISHED')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    activeVersionMode === 'PUBLISHED'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Published (v{publishedVersion.versionNumber})
                </button>
              )}
            </div>

            {hasUnsavedChanges && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-900">
                • Unsaved
              </span>
            )}
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Undo / Redo */}
            {activeVersionMode === 'DRAFT' && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  disabled={undoStack.length === 0}
                  onClick={handleUndo}
                  title="Undo (Ctrl+Z)"
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={redoStack.length === 0}
                  onClick={handleRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Grid Snap Toggle */}
            <button
              type="button"
              onClick={() => setGridSnapEnabled(!gridSnapEnabled)}
              title={gridSnapEnabled ? 'Disable Grid Snapping' : 'Enable Grid Snapping'}
              className={`p-1.5 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors ${
                gridSnapEnabled
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>

            {/* Keyboard Shortcuts Dialog */}
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              title="Keyboard Shortcuts (?)"
              className="p-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            {/* New Workflow */}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>

            {/* Preview Simulator */}
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              Simulator
            </button>

            {/* Save Draft */}
            {activeVersionMode === 'DRAFT' && (
              <>
                <button
                  type="button"
                  disabled={saving || !hasUnsavedChanges}
                  onClick={handleSaveDraft}
                  title="Save Draft (Ctrl+S)"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-2xs disabled:opacity-40 transition-colors"
                >
                  <Save className="w-3.5 h-3.5 text-blue-500" />
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowPublishModal(true)}
                  title="Publish Workflow (Ctrl+Enter)"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Publish
                </button>
              </>
            )}

            {/* Full-Screen Toggle Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Full Screen (Esc / F)' : 'Enter Full Screen Mode (F)'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                isFullscreen
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  Exit Full Screen
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  Full Screen
                </>
              )}
            </button>
          </div>
        </div>

        {/* Builder Body: Canvas + Collapsible Inspector */}
        <div className="flex flex-col lg:flex-row h-full flex-1 overflow-hidden relative">
          <div className="flex-1 p-2.5 h-full overflow-hidden flex flex-col">
            <WorkflowCanvas
              stages={stages}
              transitions={transitions}
              selectedElement={selectedElement}
              onSelectElement={setSelectedElement}
              onUpdateStagePosition={handleUpdateStagePosition}
              onAddTransition={handleAddTransition}
              onDeleteTransition={handleDeleteTransition}
              onAddStage={handleAddStage}
              onAutoLayout={handleAutoLayout}
              onDeleteStage={handleDeleteStage}
              isReadOnly={activeVersionMode === 'PUBLISHED'}
              isFullscreen={isFullscreen}
              gridSnapEnabled={gridSnapEnabled}
            />
          </div>

          <WorkflowInspector
            workflow={currentWorkflow}
            stages={stages}
            transitions={transitions}
            selectedElement={selectedElement}
            validationResult={validationResult}
            onSelectElement={setSelectedElement}
            onUpdateStage={handleUpdateStage}
            onDeleteStage={handleDeleteStage}
            onAddTransition={handleAddTransition}
            onDeleteTransition={handleDeleteTransition}
            onUpdateTransition={handleUpdateTransition}
            onUpdateWorkflowMeta={(updates) => {
              if (selectedWorkflowId) {
                onboardingWorkflowsApi
                  .updateWorkflow(selectedWorkflowId, updates)
                  .then((res) => setCurrentWorkflow(res.workflow));
              }
            }}
            onAutoLayout={handleAutoLayout}
            onDuplicateWorkflow={handleDuplicate}
            isReadOnly={activeVersionMode === 'PUBLISHED'}
            isCollapsed={isInspectorCollapsed}
            onToggleCollapse={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
          />
        </div>
      </div>

      {/* Simulator Modal */}
      {showPreviewModal && (
        <WorkflowPreviewModal
          stages={stages}
          transitions={transitions}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {/* Keyboard Shortcuts Cheat-sheet Modal */}
      {showShortcutsModal && (
        <KeyboardShortcutsModal onClose={() => setShowShortcutsModal(false)} />
      )}

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1D2D] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">
                Create Visual Workflow
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkflow} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Application Module *
                </label>
                <select
                  value={newWorkflowModule}
                  onChange={(e) => {
                    setNewWorkflowModule(e.target.value);
                    const mod = APP_MODULES.find((m) => m.code === e.target.value);
                    if (mod && mod.triggers.length > 0) {
                      setNewWorkflowTrigger(mod.triggers[0].code);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {APP_MODULES.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Workflow Name *
                </label>
                <input
                  type="text"
                  required
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="e.g. Leave Approval Multi-tier Flow"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Initial Trigger
                </label>
                <select
                  value={newWorkflowTrigger}
                  onChange={(e) => setNewWorkflowTrigger(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  {(APP_MODULES.find((m) => m.code === newWorkflowModule) || APP_MODULES[0]).triggers.map(
                    (t) => (
                      <option key={t.code} value={t.code}>
                        {t.label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newWorkflowDesc}
                  onChange={(e) => setNewWorkflowDesc(e.target.value)}
                  placeholder="Objective of this automated workflow..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newWorkflowName.trim()}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50"
                >
                  Create Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1E1D2D] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <span className="p-2.5 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400">
                <Send className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold">
                  Publish Workflow
                </h3>
                <p className="text-xs text-slate-500">
                  Deploy this configuration across {currentModuleDef.name}.
                </p>
              </div>
            </div>

            {validationResult && !validationResult.isValid && (
              <div className="mb-4 p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Cannot Publish: Validation Errors
                </span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {validationResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Publishing will validate the graph, generate an immutable version record, and update
                active transition rules. Existing historical records remain associated with their
                prior versions.
              </p>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Change Summary (Optional)
                </label>
                <input
                  type="text"
                  value={publishSummary}
                  onChange={(e) => setPublishSummary(e.target.value)}
                  placeholder="e.g. Added manager approval and conditional rejection branch"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={publishing || (validationResult !== null && !validationResult.isValid)}
                  onClick={handlePublishConfirm}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold disabled:opacity-40"
                >
                  {publishing ? 'Publishing...' : 'Confirm & Publish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
