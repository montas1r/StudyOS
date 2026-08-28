"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import { GripVertical, Maximize2 } from "lucide-react";
import { useDragContext } from "@/lib/DragContext";
import type { CardSize, CardConstraints } from "@/lib/useCardOrder";

interface DraggableGridProps {
  children: React.ReactNode;
  viewId: string;
  editMode: boolean;
  dragOverIndex: number | null;
  order?: string[];
  sizeMap?: Record<string, CardSize>;
  cardConstraints?: Record<string, CardConstraints>;
  onMoveCard: (widgetId: string, toIndex: number) => void;
  onSetDropTarget: (index: number | null) => void;
  onSetCardSize?: (widgetId: string, cols: number, rows: number) => void;
  columns?: 1 | 2 | 3 | 4;
  gap?: number;
}

interface ResizeState {
  widgetId: string;
  startX: number;
  startY: number;
  startCols: number;
  startRows: number;
}

export default function DraggableGrid({
  children,
  viewId,
  editMode,
  dragOverIndex,
  order = [],
  sizeMap = {},
  cardConstraints,
  onMoveCard,
  onSetDropTarget,
  onSetCardSize,
  columns = 2,
  gap = 32,
}: DraggableGridProps) {
  const currentOrder = Array.isArray(order) ? order : [];
  const { dragState, startDrag, endDrag } = useDragContext();
  const gridRef = useRef<HTMLDivElement>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dragWidgetLabel, setDragWidgetLabel] = useState("");
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [resizePreview, setResizePreview] = useState<CardSize | null>(null);

  // Refs for values that change frequently during drag/resize to avoid stale closures
  const dragOverIndexRef = useRef(dragOverIndex);
  dragOverIndexRef.current = dragOverIndex;
  const resizePreviewRef = useRef<CardSize | null>(null);
  resizePreviewRef.current = resizePreview;

  // Global pointer move/up handlers during drag
  useEffect(() => {
    if (!dragState || dragState.sourceView !== viewId) return;

    const handleMove = (e: PointerEvent) => {
      setGhostPos({ x: e.clientX, y: e.clientY });

      if (!gridRef.current) return;
      const slots = gridRef.current.querySelectorAll<HTMLElement>("[data-slot-index]");
      let closestIdx: number | null = null;
      let closestDist = Infinity;

      slots.forEach((slot) => {
        const rect = slot.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const idx = parseInt(slot.dataset.slotIndex || "-1", 10);
        if (dist < closestDist && idx >= 0) {
          closestDist = dist;
          closestIdx = idx;
        }
      });

      onSetDropTarget(closestIdx);
    };

    const handleUp = () => {
      const currentOver = dragOverIndexRef.current;
      if (currentOver !== null && currentOver !== dragState.sourceIndex) {
        onMoveCard(dragState.widgetId, currentOver);
      }
      endDrag();
      setGhostPos(null);
      onSetDropTarget(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [dragState, viewId, onMoveCard, onSetDropTarget, endDrag]); // Removed dragOverIndex from deps — read via ref

  // Global pointer move/up handlers during resize — only registers once per resize session
  useEffect(() => {
    if (!resizeState || !gridRef.current || !onSetCardSize) return;

    const handleMove = (e: PointerEvent) => {
      const grid = gridRef.current;
      if (!grid) return;

      const gridRect = grid.getBoundingClientRect();
      const colWidth = (gridRect.width - (columns - 1) * gap) / columns;

      const slotEl = grid.querySelector<HTMLElement>("[data-widget-id=\"" + resizeState.widgetId + "\"]");
      const rowHeight = slotEl
        ? slotEl.getBoundingClientRect().height / resizeState.startRows
        : 180;

      const deltaX = e.clientX - resizeState.startX;
      const deltaY = e.clientY - resizeState.startY;
      const deltaCols = Math.round(deltaX / (colWidth + gap));
      const deltaRows = Math.round(deltaY / (rowHeight + gap));

      const c = cardConstraints?.[resizeState.widgetId];
      const maxW = c?.maxW ?? 2;
      const maxH = c?.maxH ?? 2;

      const newCols = Math.max(1, Math.min(maxW, resizeState.startCols + deltaCols));
      const newRows = Math.max(1, Math.min(maxH, resizeState.startRows + deltaRows));

      setResizePreview([newCols, newRows]);
    };

    const handleUp = () => {
      // Read latest preview from ref, not from closure
      const latest = resizePreviewRef.current;
      if (latest && onSetCardSize) {
        onSetCardSize(resizeState.widgetId, latest[0], latest[1]);
      }
      setResizeState(null);
      setResizePreview(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }, [resizeState, columns, gap, cardConstraints, onSetCardSize]); // Removed resizePreview from deps — read via ref

  const handleGripDown = useCallback((index: number, widgetId: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag({ widgetId, sourceView: viewId, sourceIndex: index });
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const card = (e.target as HTMLElement).closest("[data-slot-index]");
    const labelEl = card?.querySelector(".stat-label, .dial-phase");
    setDragWidgetLabel(labelEl?.textContent || widgetId);
    setGhostPos({ x: e.clientX, y: e.clientY });
  }, [startDrag, viewId]);

  const handleResizeDown = useCallback((widgetId: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentSize = sizeMap[widgetId] ?? [1, 1];
    setResizeState({
      widgetId,
      startX: e.clientX,
      startY: e.clientY,
      startCols: currentSize[0],
      startRows: currentSize[1],
    });
    setResizePreview(currentSize);
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  }, [sizeMap]);

  const isDragging = dragState?.sourceView === viewId;
  const isResizing = resizeState !== null;

  // Calculate total column span used by children to determine accurate empty slot count
  const usedColumns = React.Children.count(children);
  const totalSpanUsed = currentOrder.slice(0, usedColumns).reduce<number>((sum, wid) => {
    const sz = sizeMap[wid] ?? [1, 1];
    return sum + sz[0];
  }, 0);

  return (
    <>
      <div
        ref={gridRef}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridAutoRows: "minmax(0, auto)",
          gap,
          position: "relative",
        }}
      >
        {React.Children.map(children, (child, idx) => {
          const widgetId = currentOrder[idx] ?? `idx-${idx}`;
          const baseSize: CardSize = sizeMap[widgetId] ?? [1, 1];
          const previewSize = isResizing && resizeState?.widgetId === widgetId && resizePreview
            ? resizePreview
            : baseSize;
          const [spanCols, spanRows] = previewSize;

          return (
            <div
              key={widgetId}
              data-slot-index={idx}
              data-widget-id={widgetId}
              style={{
                position: "relative",
                gridColumn: `span ${Math.min(spanCols, columns)}`,
                gridRow: `span ${spanRows}`,
                transition: (dragOverIndex === idx || (isResizing && resizeState?.widgetId === widgetId))
                  ? "none"
                  : "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                opacity: isDragging && dragState?.sourceIndex === idx ? 0.4 : 1,
                transform: dragOverIndex === idx ? "scale(1.02)" : "scale(1)",
                outline: dragOverIndex === idx ? "2px dashed var(--amber)" : "none",
                outlineOffset: "4px",
                borderRadius: 12,
                minHeight: 0,
              }}
            >
              {editMode && (
                <>
                  <div
                    className="card-drag-handle"
                    onPointerDown={(e) => handleGripDown(idx, widgetId, e)}
                    style={{ position: "absolute", top: 10, right: 12, zIndex: 10, opacity: 1 }}
                  >
                    <GripVertical size={14} />
                  </div>
                  {onSetCardSize && (
                    <div
                      className="card-resize-handle"
                      onPointerDown={(e) => handleResizeDown(widgetId, e)}
                      title={`Resize (${previewSize[0]}×${previewSize[1]})`}
                    >
                      <Maximize2 size={10} />
                    </div>
                  )}
                  {(spanCols > 1 || spanRows > 1) && (
                    <div className="card-size-badge">{spanCols}×{spanRows}</div>
                  )}
                </>
              )}
              {child}
            </div>
          );
        })}
        {editMode && totalSpanUsed < columns && Array.from({ length: Math.min(columns as number - totalSpanUsed, columns as number) }).map((_, i) => {
          const slotIdx = usedColumns + i;
          return (
            <div
              key={`empty-${i}`}
              data-slot-index={slotIdx}
              className={`grid-empty-slot ${dragOverIndex === slotIdx ? "grid-empty-slot-active" : ""}`}
            >
              <span className="grid-empty-slot-label">Drop here</span>
            </div>
          );
        })}
      </div>

      {isDragging && ghostPos && (
        <div
          style={{
            position: "fixed",
            left: ghostPos.x + 12,
            top: ghostPos.y - 16,
            pointerEvents: "none",
            zIndex: 9999,
            background: "var(--amber)",
            color: "#221708",
            padding: "6px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "JetBrains Mono, monospace",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
            transition: "none",
          }}
        >
          {dragWidgetLabel}
        </div>
      )}

      {isResizing && resizePreview && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            pointerEvents: "none",
            zIndex: 9999,
            background: "var(--surface-2)",
            border: "1px solid var(--amber)",
            color: "var(--amber)",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "JetBrains Mono, monospace",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {resizePreview[0]}×{resizePreview[1]}
        </div>
      )}
    </>
  );
}
