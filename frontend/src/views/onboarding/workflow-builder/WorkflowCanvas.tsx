import React, { useState, useRef, useEffect, useCallback } from 'react';
import type {
  WorkflowStage,
  WorkflowTransition,
} from '../../../api/onboarding-workflows.api';
import {
  NODE_WIDTH,
  NODE_HEIGHT,
  MIN_ZOOM,
  MAX_ZOOM,
  STAGE_TYPE_OPTIONS,
  type CanvasTransform,
  type SelectedElement,
} from './workflow-builder.types';
import {
  Play,
  Zap,
  ArrowRight,
  Cpu,
  ShieldCheck,
  GitBranch,
  Clock,
  Hourglass,
  Mail,
  CheckCircle2,
  Square,
  XCircle,
  Slash,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Sparkles,
  Trash2,
  FileCheck2,
  Map as MapIcon,
  Grid,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';

interface WorkflowCanvasProps {
  stages: WorkflowStage[];
  transitions: WorkflowTransition[];
  selectedElement: SelectedElement;
  onSelectElement: (element: SelectedElement) => void;
  onUpdateStagePosition: (stageId: string, x: number, y: number) => void;
  onAddTransition: (fromStageId: string, toStageId: string) => void;
  onDeleteTransition: (fromStageId: string, toStageId: string) => void;
  onAddStage: () => void;
  onAutoLayout: () => void;
  onDeleteStage: (stageId: string) => void;
  isReadOnly?: boolean;
  isFullscreen?: boolean;
  gridSnapEnabled?: boolean;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  stages,
  transitions,
  selectedElement,
  onSelectElement,
  onUpdateStagePosition,
  onAddTransition,
  onDeleteTransition,
  onAddStage,
  onAutoLayout,
  onDeleteStage,
  isReadOnly = false,
  isFullscreen = false,
  gridSnapEnabled = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas Pan & Zoom transform
  const [transform, setTransform] = useState<CanvasTransform>({
    zoom: 1,
    panX: 60,
    panY: 60,
  });

  // State for dragging nodes
  const [draggingNode, setDraggingNode] = useState<{
    stageId: string;
    startX: number;
    startY: number;
    initialNodeX: number;
    initialNodeY: number;
  } | null>(null);

  // State for panning canvas
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  // Spacebar pan mode
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // State for creating a new connection from an output port
  const [connectingFrom, setConnectingFrom] = useState<{
    stageId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Hovered target port during connection drag
  const [hoveredInputPortStageId, setHoveredInputPortStageId] = useState<string | null>(null);

  // Mini-map visibility toggle
  const [showMinimap, setShowMinimap] = useState(true);

  // Helper to get stage icon component
  const getStageIcon = (type: string) => {
    switch (type) {
      case 'START':
        return <Play className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />;
      case 'TRIGGER':
        return <Zap className="w-3.5 h-3.5 text-emerald-500" />;
      case 'ACTION':
        return <Cpu className="w-3.5 h-3.5 text-blue-500" />;
      case 'APPROVAL':
        return <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />;
      case 'CONDITION':
        return <GitBranch className="w-3.5 h-3.5 text-indigo-500" />;
      case 'WAITING':
        return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      case 'DELAY':
        return <Hourglass className="w-3.5 h-3.5 text-amber-600" />;
      case 'NOTIFICATION':
        return <Mail className="w-3.5 h-3.5 text-cyan-500" />;
      case 'COMPLETED':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      case 'TERMINAL':
        return <Square className="w-3.5 h-3.5 text-slate-500" />;
      case 'REJECTED':
        return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
      case 'WITHDRAWN':
        return <Slash className="w-3.5 h-3.5 text-slate-500" />;
      default:
        return <ArrowRight className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  // Convert screen coordinates to canvas space
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      return {
        x: (clientX - rect.left - transform.panX) / transform.zoom,
        y: (clientY - rect.top - transform.panY) / transform.zoom,
      };
    },
    [transform],
  );

  // Spacebar tracking for hand/pan tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle canvas background mouse down for panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Middle click (button 1) or Left click on background or Space+Click
    if (e.button === 1 || isSpacePressed || e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setPanning({
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: transform.panX,
        initialPanY: transform.panY,
      });
      if (!isSpacePressed && e.button !== 1) {
        onSelectElement({ type: 'WORKFLOW' });
      }
    }
  };

  // Handle node mouse down for dragging
  const handleNodeMouseDown = (e: React.MouseEvent, stage: WorkflowStage) => {
    if (isSpacePressed) return;
    e.stopPropagation();
    onSelectElement({ type: 'STAGE', stageId: stage.id });
    if (isReadOnly) return;

    setDraggingNode({
      stageId: stage.id,
      startX: e.clientX,
      startY: e.clientY,
      initialNodeX: stage.positionX,
      initialNodeY: stage.positionY,
    });
  };

  // Start connection drag from output port
  const handleOutputPortMouseDown = (e: React.MouseEvent, stage: WorkflowStage) => {
    e.stopPropagation();
    if (isReadOnly) return;
    const portX = stage.positionX + NODE_WIDTH;
    const portY = stage.positionY + NODE_HEIGHT / 2;
    setConnectingFrom({
      stageId: stage.id,
      startX: portX,
      startY: portY,
      currentX: portX,
      currentY: portY,
    });
  };

  // Complete connection on input port
  const handleInputPortMouseUp = (e: React.MouseEvent, targetStage: WorkflowStage) => {
    e.stopPropagation();
    if (!connectingFrom || isReadOnly) return;
    if (connectingFrom.stageId !== targetStage.id) {
      onAddTransition(connectingFrom.stageId, targetStage.id);
    }
    setConnectingFrom(null);
    setHoveredInputPortStageId(null);
  };

  // Global mouse move & mouse up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (panning) {
        setTransform((prev) => ({
          ...prev,
          panX: panning.initialPanX + (e.clientX - panning.startX),
          panY: panning.initialPanY + (e.clientY - panning.startY),
        }));
      } else if (draggingNode) {
        const deltaX = (e.clientX - draggingNode.startX) / transform.zoom;
        const deltaY = (e.clientY - draggingNode.startY) / transform.zoom;
        const step = gridSnapEnabled ? 20 : 1;
        const newX = Math.round((draggingNode.initialNodeX + deltaX) / step) * step;
        const newY = Math.round((draggingNode.initialNodeY + deltaY) / step) * step;
        onUpdateStagePosition(draggingNode.stageId, newX, newY);
      } else if (connectingFrom) {
        const canvasCoords = screenToCanvas(e.clientX, e.clientY);
        setConnectingFrom((prev) =>
          prev ? { ...prev, currentX: canvasCoords.x, currentY: canvasCoords.y } : null,
        );
      }
    };

    const handleMouseUp = () => {
      if (panning) setPanning(null);
      if (draggingNode) setDraggingNode(null);
      if (connectingFrom) {
        setConnectingFrom(null);
        setHoveredInputPortStageId(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    panning,
    draggingNode,
    connectingFrom,
    transform.zoom,
    gridSnapEnabled,
    screenToCanvas,
    onUpdateStagePosition,
  ]);

  // Smooth Cursor-Centered Zooming (Ctrl+Wheel, Cmd+Wheel, or vertical pan)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Check if Ctrl or Meta is held for Zooming, OR trackpad pinch
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      setTransform((prev) => {
        const nextZoom = Math.min(Math.max(prev.zoom * zoomFactor, MIN_ZOOM), MAX_ZOOM);
        // Anchor zoom strictly at cursor position!
        const nextPanX = cursorX - (cursorX - prev.panX) * (nextZoom / prev.zoom);
        const nextPanY = cursorY - (cursorY - prev.panY) * (nextZoom / prev.zoom);
        return { zoom: nextZoom, panX: nextPanX, panY: nextPanY };
      });
    } else if (e.shiftKey) {
      // Horizontal pan with Shift + Wheel
      setTransform((prev) => ({
        ...prev,
        panX: prev.panX - (e.deltaX || e.deltaY),
      }));
    } else {
      // Vertical pan with normal mouse wheel
      setTransform((prev) => ({
        ...prev,
        panY: prev.panY - e.deltaY,
      }));
    }
  };

  // Zoom controls (anchored at center of container)
  const handleZoomStep = (factor: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setTransform((prev) => {
      const nextZoom = Math.min(Math.max(prev.zoom * factor, MIN_ZOOM), MAX_ZOOM);
      const nextPanX = centerX - (centerX - prev.panX) * (nextZoom / prev.zoom);
      const nextPanY = centerY - (centerY - prev.panY) * (nextZoom / prev.zoom);
      return { zoom: nextZoom, panX: nextPanX, panY: nextPanY };
    });
  };

  // Fit view to all stages
  const handleFitView = useCallback(() => {
    if (stages.length === 0 || !containerRef.current) return;
    const minX = Math.min(...stages.map((s) => s.positionX));
    const maxX = Math.max(...stages.map((s) => s.positionX + NODE_WIDTH));
    const minY = Math.min(...stages.map((s) => s.positionY));
    const maxY = Math.max(...stages.map((s) => s.positionY + NODE_HEIGHT));

    const rect = containerRef.current.getBoundingClientRect();
    const width = maxX - minX + 160;
    const height = maxY - minY + 160;

    const zoomX = rect.width / width;
    const zoomY = rect.height / height;
    const nextZoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.3), 1.2);

    const panX = (rect.width - (maxX - minX) * nextZoom) / 2 - minX * nextZoom;
    const panY = (rect.height - (maxY - minY) * nextZoom) / 2 - minY * nextZoom;

    setTransform({ zoom: nextZoom, panX, panY });
  }, [stages]);

  // Center on mount or when stages arrive
  useEffect(() => {
    if (stages.length > 0) {
      handleFitView();
    }
  }, [stages.length === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut for deleting selected element or cancelling connection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'Escape') {
        if (connectingFrom) {
          setConnectingFrom(null);
          setHoveredInputPortStageId(null);
        } else {
          onSelectElement(null);
        }
      } else if (!isReadOnly && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedElement?.type === 'STAGE') {
          const stage = stages.find((s) => s.id === selectedElement.stageId);
          if (stage && !stage.isInitial) {
            onDeleteStage(stage.id);
          }
        } else if (selectedElement?.type === 'TRANSITION') {
          onDeleteTransition(selectedElement.fromStageId, selectedElement.toStageId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, stages, isReadOnly, connectingFrom, onDeleteStage, onDeleteTransition, onSelectElement]);

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  // Calculate mini-map bounds
  const minX = stages.length > 0 ? Math.min(...stages.map((s) => s.positionX)) - 50 : 0;
  const maxX = stages.length > 0 ? Math.max(...stages.map((s) => s.positionX + NODE_WIDTH)) + 50 : 1000;
  const minY = stages.length > 0 ? Math.min(...stages.map((s) => s.positionY)) - 50 : 0;
  const maxY = stages.length > 0 ? Math.max(...stages.map((s) => s.positionY + NODE_HEIGHT)) + 50 : 800;
  const mapSpanX = Math.max(maxX - minX, 500);
  const mapSpanY = Math.max(maxY - minY, 400);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
      className={`relative w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#13121D] overflow-hidden select-none shadow-inner transition-all ${
        isFullscreen ? 'h-full flex-1 rounded-none border-none' : 'h-[660px] lg:h-[740px]'
      } ${isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      style={{
        backgroundImage: `radial-gradient(circle, rgba(148, 163, 184, 0.28) 1.2px, transparent 1.2px)`,
        backgroundSize: `${24 * transform.zoom}px ${24 * transform.zoom}px`,
        backgroundPosition: `${transform.panX}px ${transform.panY}px`,
      }}
    >
      {/* SVG Canvas for Bezier connection curves */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          <marker
            id="workflow-arrow-default"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#64748B" />
          </marker>
          <marker
            id="workflow-arrow-selected"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#3B82F6" />
          </marker>
          <marker
            id="workflow-arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#10B981" />
          </marker>
        </defs>

        {/* Existing Connections */}
        {transitions.map((t) => {
          const fromStage = stageMap.get(t.fromStageId);
          const toStage = stageMap.get(t.toStageId);
          if (!fromStage || !toStage) return null;

          const x1 = fromStage.positionX + NODE_WIDTH;
          const y1 = fromStage.positionY + NODE_HEIGHT / 2;
          const x2 = toStage.positionX;
          const y2 = toStage.positionY + NODE_HEIGHT / 2;

          const dx = Math.max(Math.abs(x2 - x1) * 0.48, 60);
          const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

          const isSelected =
            selectedElement?.type === 'TRANSITION' &&
            selectedElement.fromStageId === t.fromStageId &&
            selectedElement.toStageId === t.toStageId;

          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <g key={`${t.fromStageId}-${t.toStageId}`} className="pointer-events-auto group">
              {/* Invisible wide stroke for forgiving click & hover target */}
              <path
                d={pathData}
                fill="none"
                stroke="transparent"
                strokeWidth={24}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElement({
                    type: 'TRANSITION',
                    fromStageId: t.fromStageId,
                    toStageId: t.toStageId,
                  });
                }}
              />

              {/* Glowing Aura when selected */}
              {isSelected && (
                <path
                  d={pathData}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth={8}
                  strokeOpacity={0.25}
                />
              )}

              {/* Visible Bézier curve line */}
              <path
                d={pathData}
                fill="none"
                stroke={isSelected ? '#3B82F6' : '#64748B'}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={t.conditionType === 'REJECT' ? '5,5' : undefined}
                markerEnd={isSelected ? 'url(#workflow-arrow-selected)' : 'url(#workflow-arrow-default)'}
                className="transition-colors group-hover:stroke-blue-500"
              />

              {/* Midpoint Label Badge & Quick Delete */}
              <foreignObject
                x={midX - 55}
                y={midY - 14}
                width={110}
                height={28}
                className="overflow-visible"
              >
                <div className="flex items-center justify-center gap-1">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectElement({
                        type: 'TRANSITION',
                        fromStageId: t.fromStageId,
                        toStageId: t.toStageId,
                      });
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shadow-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-blue-400'
                    }`}
                  >
                    <span className="truncate max-w-[70px]">
                      {t.name || (t.conditionType === 'REJECT' ? 'Rejected' : 'Next')}
                    </span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        title="Delete transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTransition(t.fromStageId, t.toStageId);
                        }}
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors ml-0.5"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Temporary connecting line when dragging from output port */}
        {connectingFrom && (
          <path
            d={`M ${connectingFrom.startX} ${connectingFrom.startY} C ${
              connectingFrom.startX + Math.max(Math.abs(connectingFrom.currentX - connectingFrom.startX) * 0.48, 50)
            } ${connectingFrom.startY}, ${
              connectingFrom.currentX - Math.max(Math.abs(connectingFrom.currentX - connectingFrom.startX) * 0.48, 50)
            } ${connectingFrom.currentY}, ${connectingFrom.currentX} ${connectingFrom.currentY}`}
            fill="none"
            stroke="#10B981"
            strokeWidth={2.8}
            strokeDasharray="6,4"
            markerEnd="url(#workflow-arrow-active)"
          />
        )}
      </svg>

      {/* HTML Nodes Container */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {stages.map((stage) => {
          const isSelected =
            selectedElement?.type === 'STAGE' && selectedElement.stageId === stage.id;
          const stageTypeMeta = STAGE_TYPE_OPTIONS.find((t) => t.type === stage.stageType);
          const color = stage.colorCode || stageTypeMeta?.defaultColor || '#3B82F6';

          const isConnectingActive = Boolean(connectingFrom);
          const isSourceOfConnecting = connectingFrom?.stageId === stage.id;
          const isValidTargetForConnecting =
            isConnectingActive &&
            !isSourceOfConnecting &&
            !stage.isInitial &&
            !transitions.some((t) => t.fromStageId === connectingFrom?.stageId && t.toStageId === stage.id);

          return (
            <div
              key={stage.id}
              style={{
                left: stage.positionX,
                top: stage.positionY,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, stage)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectElement({ type: 'STAGE', stageId: stage.id });
              }}
              className={`absolute pointer-events-auto rounded-xl bg-white dark:bg-[#1E1D2D] border transition-all cursor-move flex flex-col justify-between overflow-visible shadow-sm ${
                isSelected
                  ? 'border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/40 shadow-xl'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
              } ${isSourceOfConnecting ? 'ring-2 ring-emerald-500/50' : ''}`}
            >
              {/* Input Port (Left Handle) */}
              {!stage.isInitial && (
                <div
                  onMouseEnter={() => {
                    if (isConnectingActive && isValidTargetForConnecting) {
                      setHoveredInputPortStageId(stage.id);
                    }
                  }}
                  onMouseLeave={() => setHoveredInputPortStageId(null)}
                  onMouseUp={(e) => handleInputPortMouseUp(e, stage)}
                  title="Incoming transition port (drop connection here)"
                  className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center cursor-crosshair z-30 group/inport"
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all shadow-xs flex items-center justify-center ${
                      hoveredInputPortStageId === stage.id || isValidTargetForConnecting
                        ? 'bg-emerald-500 border-white ring-4 ring-emerald-400/50 scale-125 animate-pulse'
                        : 'bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-500 group-hover/inport:border-emerald-500 group-hover/inport:scale-125'
                    }`}
                  >
                    <div className="w-1 h-1 rounded-full bg-slate-400 group-hover/inport:bg-emerald-500" />
                  </div>
                </div>
              )}

              {/* Output Port (Right Handle) */}
              {!stage.isTerminal && (
                <div
                  onMouseDown={(e) => handleOutputPortMouseDown(e, stage)}
                  title="Outgoing transition port (click or drag to connect next stage)"
                  className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center cursor-crosshair z-30 group/outport"
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 group-hover/outport:border-blue-500 group-hover/outport:ring-4 group-hover/outport:ring-blue-400/40 group-hover/outport:scale-125 transition-all flex items-center justify-center shadow-xs">
                    <div className="w-1 h-1 rounded-full bg-slate-400 group-hover/outport:bg-blue-500" />
                  </div>
                </div>
              )}

              {/* Header Accent Strip */}
              <div
                className="h-1.5 w-full rounded-t-xl"
                style={{ backgroundColor: color }}
              />

              {/* Card Body */}
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="p-1 rounded-md bg-slate-100 dark:bg-slate-800/80">
                        {getStageIcon(stage.stageType)}
                      </span>
                      <span className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">
                        {stage.name}
                      </span>
                    </div>

                    {stage.isInitial ? (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        START
                      </span>
                    ) : stage.isTerminal ? (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        END
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-slate-100 dark:bg-slate-800/60 text-slate-500">
                        {stageTypeMeta?.category || 'ACTION'}
                      </span>
                    )}
                  </div>

                  {/* Stage Key & Description */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate">
                      {stage.stageKey}
                    </span>
                  </div>
                  {stage.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                      {stage.description}
                    </p>
                  )}
                </div>

                {/* Footer Tag */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60 mt-1 text-[10px]">
                  {stage.stageConfig?.requiredAction && stage.stageConfig.requiredAction !== 'NONE' ? (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                      <FileCheck2 className="w-3 h-3" />
                      Req Action
                    </span>
                  ) : (
                    <span className="text-slate-400 truncate max-w-[150px]">
                      {stageTypeMeta?.label || stage.stageType}
                    </span>
                  )}

                  {!stage.isActive && (
                    <span className="text-rose-500 font-semibold">Inactive</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Canvas Controls Toolbar */}
      <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1 p-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md text-xs">
        <button
          type="button"
          onClick={() => handleZoomStep(1.2)}
          title="Zoom In (Ctrl + Wheel)"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <span
          title="Current Zoom Level (Click to reset to 100%)"
          onClick={() => setTransform((prev) => ({ ...prev, zoom: 1 }))}
          className="px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:text-blue-600"
        >
          {Math.round(transform.zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => handleZoomStep(0.83)}
          title="Zoom Out (Ctrl + Wheel)"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleFitView}
          title="Fit to Screen"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setTransform({ zoom: 1, panX: 60, panY: 60 })}
          title="Reset View (100%)"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />

        <button
          type="button"
          onClick={onAutoLayout}
          title="Auto-Arrange Workflow Nodes (Topological DAG Layout)"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Auto Layout
        </button>

        <button
          type="button"
          onClick={() => setShowMinimap(!showMinimap)}
          title={showMinimap ? 'Hide Mini-Map' : 'Show Mini-Map'}
          className={`p-1.5 rounded-lg transition-colors ${
            showMinimap
              ? 'bg-slate-200/80 dark:bg-slate-800 text-blue-600 dark:text-blue-400'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MapIcon className="w-4 h-4" />
        </button>

        {!isReadOnly && (
          <button
            type="button"
            onClick={onAddStage}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors shadow-sm ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Node
          </button>
        )}
      </div>

      {/* Interactive Mini-Map Component (Bottom-Right) */}
      {showMinimap && stages.length > 0 && (
        <div className="absolute bottom-4 right-4 z-30 w-44 h-32 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-lg p-2 select-none overflow-hidden">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span>Mini-Map</span>
            <span>{stages.length} nodes</span>
          </div>

          <div className="relative w-full h-[90px] rounded-lg bg-slate-100/60 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Render Node Dots */}
            {stages.map((stg) => {
              const relX = ((stg.positionX - minX) / mapSpanX) * 100;
              const relY = ((stg.positionY - minY) / mapSpanY) * 100;
              return (
                <div
                  key={stg.id}
                  style={{
                    left: `${Math.min(Math.max(relX, 2), 90)}%`,
                    top: `${Math.min(Math.max(relY, 2), 85)}%`,
                    backgroundColor: stg.colorCode || '#3b82f6',
                  }}
                  className="absolute w-2 h-1.5 rounded-xs"
                />
              );
            })}

            {/* Viewport Frame Box */}
            {containerRef.current && (
              <div
                style={{
                  left: `${Math.min(Math.max(((-transform.panX / transform.zoom - minX) / mapSpanX) * 100, 0), 90)}%`,
                  top: `${Math.min(Math.max(((-transform.panY / transform.zoom - minY) / mapSpanY) * 100, 0), 85)}%`,
                  width: `${Math.min(Math.max(((containerRef.current.clientWidth / transform.zoom) / mapSpanX) * 100, 10), 100)}%`,
                  height: `${Math.min(Math.max(((containerRef.current.clientHeight / transform.zoom) / mapSpanY) * 100, 10), 100)}%`,
                }}
                className="absolute border border-blue-500 bg-blue-500/15 rounded-xs pointer-events-none"
              />
            )}
          </div>
        </div>
      )}

      {/* Helpful Canvas Navigation Hint */}
      <div className="absolute top-3 left-4 z-20 pointer-events-none text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
        <span>Space+Drag or Middle-Click to pan • Ctrl+Wheel to zoom • Drag port to connect</span>
      </div>
    </div>
  );
};
