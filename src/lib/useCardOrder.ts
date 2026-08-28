"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export type CardSize = [number, number]; // [cols, rows]

export interface CardConstraints {
  maxW: number;
  maxH: number;
}

const STORAGE_PREFIX = "studyos_cards_";
const SIZE_PREFIX = "studyos_sizes_";

function loadOrder(viewId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + viewId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function saveOrder(viewId: string, order: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + viewId, JSON.stringify(order));
  } catch { /* ignore */ }
}

function loadSizeMap(viewId: string): Record<string, CardSize> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SIZE_PREFIX + viewId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return null;
  } catch { return null; }
}

function saveSizeMap(viewId: string, sizeMap: Record<string, CardSize>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIZE_PREFIX + viewId, JSON.stringify(sizeMap));
  } catch { /* ignore */ }
}

export function useCardOrder(
  viewId: string,
  defaultIds: string[],
  constraints?: Record<string, CardConstraints>,
) {
  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = loadOrder(viewId);
      if (saved) {
        const merged = [...saved];
        for (const id of defaultIds) {
          if (!merged.includes(id)) merged.push(id);
        }
        return merged.filter((id) => defaultIds.includes(id));
      }
    }
    return defaultIds;
  });

  const [sizeMap, setSizeMap] = useState<Record<string, CardSize>>(() => {
    if (typeof window !== "undefined") {
      const saved = loadSizeMap(viewId);
      if (saved) return saved;
    }
    return {};
  });

  const [editMode, setEditMode] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) saveOrder(viewId, order);
  }, [order, viewId]);

  useEffect(() => {
    if (mountedRef.current) saveSizeMap(viewId, sizeMap);
  }, [sizeMap, viewId]);

  useEffect(() => {
    mountedRef.current = true;
    setMounted(true);
  }, []);

  const toggleEditMode = useCallback(() => setEditMode((v) => !v), []);

  const resetOrder = useCallback(() => {
    setOrder(defaultIds);
    setSizeMap({});
    setEditMode(false);
  }, [defaultIds]);

  const moveCard = useCallback((fromIndex: number, toIndex: number) => {
    setOrder((prev) => {
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      const arr = [...prev];
      const [moved] = arr.splice(fromIndex, 1);
      const insertAt = toIndex > fromIndex ? Math.max(0, toIndex - 1) : toIndex;
      arr.splice(Math.min(insertAt, arr.length), 0, moved);
      return arr;
    });
  }, []);

  const moveWidget = useCallback((widgetId: string, toIndex: number) => {
    setOrder((prev) => {
      const idx = prev.indexOf(widgetId);
      if (idx === -1) return prev;
      const arr = [...prev];
      arr.splice(idx, 1);
      arr.splice(Math.min(toIndex, arr.length), 0, widgetId);
      return arr;
    });
  }, []);

  const setCardSize = useCallback((widgetId: string, cols: number, rows: number) => {
    const c = constraints?.[widgetId];
    const clampedCols = Math.max(1, Math.min(c?.maxW ?? 2, cols));
    const clampedRows = Math.max(1, Math.min(c?.maxH ?? 2, rows));
    setSizeMap((prev) => {
      const prevSize = prev[widgetId] ?? [1, 1];
      if (prevSize[0] === clampedCols && prevSize[1] === clampedRows) return prev;
      return { ...prev, [widgetId]: [clampedCols, clampedRows] };
    });
  }, [constraints]);

  const setDropTarget = useCallback((index: number | null) => setDragOverIndex(index), []);

  const getCardSize = useCallback((widgetId: string): CardSize => {
    return sizeMap[widgetId] ?? [1, 1];
  }, [sizeMap]);

  return {
    order,
    sizeMap,
    editMode,
    dragOverIndex,
    toggleEditMode,
    resetOrder,
    moveCard,
    moveWidget,
    setCardSize,
    getCardSize,
    setDropTarget,
    mounted,
  };
}
