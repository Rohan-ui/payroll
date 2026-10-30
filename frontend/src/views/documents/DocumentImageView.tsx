import React, { useCallback, useRef, useState, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Lock, Move } from 'lucide-react';
import type { DocumentImageAttrs, PositionMode } from './document-image-extension';
import { snap } from './letterhead-geometry';

const PX_PER_MM = 96 / 25.4;
const PAGE_HEIGHT_MM = 297; // Standard A4 height

type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_CURSORS: Record<HandleType, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

export const DocumentImageView: React.FC<NodeViewProps> = (props) => {
  const { node, updateAttributes, selected, editor, getPos } = props;
  const attrs = node.attrs as DocumentImageAttrs;
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);

  // Helper to get current zoom factor from DOM
  const getZoom = useCallback(() => {
    if (!containerRef.current) return 1;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetW = containerRef.current.offsetWidth || 1;
    const z = rect.width / offsetW;
    return Number.isFinite(z) && z > 0.1 ? z : 1;
  }, []);

  // Select node on click
  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (typeof getPos === 'function') {
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.commands.setNodeSelection(pos);
        }
      }
    },
    [editor, getPos]
  );

  // Drag-to-move handler (for free-position modes: behind and front)
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (attrs.isLocked) return;
      if (attrs.positionMode !== 'front' && attrs.positionMode !== 'behind') return;
      if ((e.target as HTMLElement).dataset.handle) return; // Don't drag when clicking a resize handle

      e.preventDefault();
      e.stopPropagation();
      handleSelect(e);

      const zoom = getZoom();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialTotalY = (attrs.page - 1) * PAGE_HEIGHT_MM + attrs.yMm;
      const initialX = attrs.xMm;

      setIsDragging(true);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaXScreen = moveEvent.clientX - startX;
        const deltaYScreen = moveEvent.clientY - startY;

        const deltaXMm = deltaXScreen / (zoom * PX_PER_MM);
        const deltaYMm = deltaYScreen / (zoom * PX_PER_MM);

        const currentTotalY = Math.max(0, initialTotalY + deltaYMm);
        const currentX = Math.max(-20, Math.min(250, initialX + deltaXMm));

        const newPage = Math.max(1, Math.floor(currentTotalY / PAGE_HEIGHT_MM) + 1);
        const newYMm = Math.max(0, currentTotalY - (newPage - 1) * PAGE_HEIGHT_MM);

        updateAttributes({
          page: newPage,
          xMm: snap(currentX),
          yMm: snap(newYMm),
        });
      };

      const onPointerUp = () => {
        setIsDragging(false);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [attrs.isLocked, attrs.positionMode, attrs.page, attrs.yMm, attrs.xMm, getZoom, handleSelect, updateAttributes]
  );

  // Resize handler with 8 handles
  const handleResizeStart = useCallback(
    (handle: HandleType, e: React.PointerEvent) => {
      if (attrs.isLocked) return;
      e.preventDefault();
      e.stopPropagation();
      handleSelect(e);

      const zoom = getZoom();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialWidth = attrs.widthMm;
      const initialHeight = attrs.heightMm;
      const initialXMm = attrs.xMm;
      const initialYMm = attrs.yMm;
      const ratio = attrs.aspectRatio || initialWidth / initialHeight;
      const lockRatio = attrs.lockAspectRatio;

      setActiveHandle(handle);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaX = (moveEvent.clientX - startX) / (zoom * PX_PER_MM);
        const deltaY = (moveEvent.clientY - startY) / (zoom * PX_PER_MM);

        let newW = initialWidth;
        let newH = initialHeight;
        let newX = initialXMm;
        let newY = initialYMm;

        switch (handle) {
          case 'e':
            newW = Math.max(8, initialWidth + deltaX);
            if (lockRatio) newH = newW / ratio;
            break;
          case 'w':
            newW = Math.max(8, initialWidth - deltaX);
            if (lockRatio) newH = newW / ratio;
            newX = initialXMm + (initialWidth - newW);
            break;
          case 's':
            newH = Math.max(8, initialHeight + deltaY);
            if (lockRatio) newW = newH * ratio;
            break;
          case 'n':
            newH = Math.max(8, initialHeight - deltaY);
            if (lockRatio) newW = newH * ratio;
            newY = initialYMm + (initialHeight - newH);
            break;
          case 'se':
            if (lockRatio) {
              const d = Math.max(deltaX, deltaY);
              newW = Math.max(8, initialWidth + d);
              newH = newW / ratio;
            } else {
              newW = Math.max(8, initialWidth + deltaX);
              newH = Math.max(8, initialHeight + deltaY);
            }
            break;
          case 'sw':
            if (lockRatio) {
              const d = Math.max(-deltaX, deltaY);
              newW = Math.max(8, initialWidth + d);
              newH = newW / ratio;
            } else {
              newW = Math.max(8, initialWidth - deltaX);
              newH = Math.max(8, initialHeight + deltaY);
            }
            newX = initialXMm + (initialWidth - newW);
            break;
          case 'ne':
            if (lockRatio) {
              const d = Math.max(deltaX, -deltaY);
              newW = Math.max(8, initialWidth + d);
              newH = newW / ratio;
            } else {
              newW = Math.max(8, initialWidth + deltaX);
              newH = Math.max(8, initialHeight - deltaY);
            }
            newY = initialYMm + (initialHeight - newH);
            break;
          case 'nw':
            if (lockRatio) {
              const d = Math.max(-deltaX, -deltaY);
              newW = Math.max(8, initialWidth + d);
              newH = newW / ratio;
            } else {
              newW = Math.max(8, initialWidth - deltaX);
              newH = Math.max(8, initialHeight - deltaY);
            }
            newX = initialXMm + (initialWidth - newW);
            newY = initialYMm + (initialHeight - newH);
            break;
        }

        updateAttributes({
          widthMm: snap(Math.min(210, Math.max(8, newW))),
          heightMm: snap(Math.min(297, Math.max(8, newH))),
          ...(attrs.positionMode === 'front' || attrs.positionMode === 'behind'
            ? { xMm: snap(newX), yMm: snap(newY) }
            : {}),
        });
      };

      const onPointerUp = () => {
        setActiveHandle(null);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [attrs, getZoom, handleSelect, updateAttributes]
  );

  // Compute CSS styling based on positionMode
  const isFree = attrs.positionMode === 'front' || attrs.positionMode === 'behind';
  const computedTopMm = isFree ? (attrs.page - 1) * PAGE_HEIGHT_MM + attrs.yMm : 0;

  const modeStyles: React.CSSProperties = isFree
    ? {
        position: 'absolute',
        left: `${attrs.xMm}mm`,
        top: `${computedTopMm}mm`,
        zIndex: attrs.positionMode === 'front' ? 100 + attrs.zIndex : Math.max(1, attrs.zIndex),
      }
    : attrs.positionMode === 'square'
    ? {
        float: attrs.alignment === 'right' ? 'right' : 'left',
        margin: attrs.alignment === 'right' ? '0 0 10pt 14pt' : '0 14pt 10pt 0',
      }
    : attrs.positionMode === 'topBottom'
    ? {
        display: 'block',
        clear: 'both',
        margin:
          attrs.alignment === 'center'
            ? '12pt auto'
            : attrs.alignment === 'right'
            ? '12pt 0 12pt auto'
            : '12pt auto 12pt 0',
      }
    : {
        // inline
        display: 'inline-block',
        verticalAlign: 'middle',
        margin: '4pt 8pt',
      };

  return (
    <NodeViewWrapper
      ref={containerRef}
      className={`document-image-wrapper relative select-none transition-shadow ${
        isFree ? 'pointer-events-auto' : ''
      }`}
      style={{
        ...modeStyles,
        width: `${attrs.widthMm}mm`,
        height: `${attrs.heightMm}mm`,
      }}
      onClick={handleSelect}
      onPointerDown={isFree ? handleDragStart : undefined}
    >
      <div
        className={`w-full h-full relative group transition-all duration-75 ${
          selected
            ? 'ring-2 ring-teal-500 shadow-md rounded'
            : 'hover:ring-1 hover:ring-teal-300'
        } ${isDragging ? 'opacity-85 cursor-grabbing' : isFree ? (attrs.isLocked ? 'cursor-not-allowed' : 'cursor-grab') : ''}`}
        style={{ opacity: attrs.opacity ?? 1 }}
      >
        <img
          src={attrs.src}
          alt={attrs.alt || 'Document image'}
          draggable={false}
          className="w-full h-full object-contain pointer-events-none select-none rounded"
        />

        {/* Locked badge */}
        {attrs.isLocked && (
          <div
            title="Image locked"
            className="absolute top-1 right-1 p-1 bg-amber-500 text-white rounded-full shadow pointer-events-none"
          >
            <Lock className="w-3 h-3" />
          </div>
        )}

        {/* Selected badge and dimensions */}
        {selected && (
          <div className="absolute -top-6 left-0 flex items-center gap-1.5 px-1.5 py-0.5 bg-teal-800 text-white text-[10px] rounded shadow pointer-events-none whitespace-nowrap z-50">
            {isFree && <Move className="w-2.5 h-2.5" />}
            <span>{attrs.category === 'AUTHORIZED_SIGNATURE' ? 'Signature' : attrs.category === 'STAMP_SEAL' ? 'Stamp' : 'Image'}</span>
            <span className="opacity-75">
              {Math.round(attrs.widthMm)} × {Math.round(attrs.heightMm)} mm
            </span>
            {isFree && <span className="opacity-75">· P{attrs.page}</span>}
          </div>
        )}

        {/* 8 Resize Handles (NW, N, NE, E, SE, S, SW, W) */}
        {selected && !attrs.isLocked && (
          <>
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleType[]).map((handle) => {
              const isCorner = handle.length === 2;
              const posClass =
                handle === 'nw'
                  ? '-top-1.5 -left-1.5'
                  : handle === 'n'
                  ? '-top-1.5 left-1/2 -translate-x-1/2'
                  : handle === 'ne'
                  ? '-top-1.5 -right-1.5'
                  : handle === 'e'
                  ? 'top-1/2 -right-1.5 -translate-y-1/2'
                  : handle === 'se'
                  ? '-bottom-1.5 -right-1.5'
                  : handle === 's'
                  ? '-bottom-1.5 left-1/2 -translate-x-1/2'
                  : handle === 'sw'
                  ? '-bottom-1.5 -left-1.5'
                  : 'top-1/2 -left-1.5 -translate-y-1/2';

              return (
                <div
                  key={handle}
                  data-handle={handle}
                  onPointerDown={(e) => handleResizeStart(handle, e)}
                  title={`Resize (${handle.toUpperCase()})`}
                  className={`absolute ${posClass} w-2.5 h-2.5 bg-white border-2 border-teal-600 rounded-sm shadow-sm z-30 transition-transform hover:scale-125 ${
                    activeHandle === handle ? 'bg-teal-500 scale-125' : ''
                  }`}
                  style={{ cursor: HANDLE_CURSORS[handle] }}
                />
              );
            })}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};
