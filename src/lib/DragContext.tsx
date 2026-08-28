"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

interface DragState {
  widgetId: string;
  sourceView: string;
  sourceIndex: number;
}

interface DragContextValue {
  dragState: DragState | null;
  startDrag: (state: DragState) => void;
  endDrag: () => void;
}

const DragCtx = createContext<DragContextValue>({
  dragState: null,
  startDrag: () => {},
  endDrag: () => {},
});

export function DragProvider({ children }: { children: React.ReactNode }) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDrag = useCallback((state: DragState) => {
    setDragState(state);
  }, []);

  const endDrag = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDragState(null);
      timerRef.current = null;
    }, 100);
  }, []);

  // Cleanup pending timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <DragCtx.Provider value={{ dragState, startDrag, endDrag }}>
      {children}
    </DragCtx.Provider>
  );
}

export function useDragContext() {
  return useContext(DragCtx);
}
