"use client";

import { useRef, useCallback, useEffect, useState } from "react";

/**
 * A drift-free countdown hook using a single wall-clock anchor.
 *
 * The sole source of truth is `targetEndTime` (ms).  Remaining seconds
 * are derived every tick via:
 *
 *   remaining = Math.max(0, Math.ceil((targetEndTime − Date.now()) / 1000))
 *
 * This matches the formula used by the main TimerContext / worker so both
 * timers stay second-for-second aligned across tab switches and throttled
 * background intervals.
 *
 * Calling pause() or reset() immediately cancels the pending rAF before
 * computing the final snapshot, preventing phantom-second additions.
 */

interface UseStableTimerOptions {
  /** Total duration in seconds for the current phase */
  durationSeconds: number;
  /** Called every frame with the remaining seconds (wall-clock accurate) */
  onTick?: (remaining: number) => void;
  /** Called when the timer reaches zero */
  onComplete?: () => void;
}

interface UseStableTimerReturn {
  /** Current remaining seconds (wall-clock accurate) */
  remaining: number;
  /** Whether the timer is currently running */
  running: boolean;
  /** Start or resume the timer */
  start: () => void;
  /** Pause the timer */
  pause: () => void;
  /** Reset the timer to the full duration and stop */
  reset: (newDuration?: number) => void;
  /** Progress 0→1 */
  progress: number;
}

export function useStableTimer({
  durationSeconds,
  onTick,
  onComplete,
}: UseStableTimerOptions): UseStableTimerReturn {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [running, setRunning] = useState(false);

  const rafIdRef = useRef<number | null>(null);
  /** Wall-clock ms when the countdown hits zero. null = paused. */
  const targetEndTimeRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef(durationSeconds);
  const durationRef = useRef(durationSeconds);
  const onCompleteRef = useRef(onComplete);
  const onTickRef = useRef(onTick);

  onCompleteRef.current = onComplete;
  onTickRef.current = onTick;
  durationRef.current = durationSeconds;

  // ── rAF tick — single wall-clock anchor ──────────────────────────────────────

  const tick = useCallback(() => {
    if (targetEndTimeRef.current === null) return;

    const now = Date.now();
    const newRemaining = Math.max(0, Math.ceil((targetEndTimeRef.current - now) / 1000));

    setRemaining(newRemaining);
    onTickRef.current?.(newRemaining);

    if (newRemaining <= 0) {
      rafIdRef.current = null;
      targetEndTimeRef.current = null;
      setRunning(false);
      onCompleteRef.current?.();
      return;
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Controls ─────────────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (targetEndTimeRef.current !== null) return; // already running
    targetEndTimeRef.current = Date.now() + pausedRemainingRef.current * 1000;
    setRunning(true);
    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (targetEndTimeRef.current === null) return;

    // ① Immediately cancel pending rAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // ② Snapshot from wall-clock anchor (no tick in flight)
    const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
    pausedRemainingRef.current = rem;
    targetEndTimeRef.current = null;
    setRemaining(rem);
    setRunning(false);
  }, []);

  const reset = useCallback(
    (newDuration?: number) => {
      // ① Cancel pending rAF
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // ② Freeze
      targetEndTimeRef.current = null;
      const dur = newDuration ?? durationRef.current;
      pausedRemainingRef.current = dur;
      setRemaining(dur);
      setRunning(false);
    },
    []
  );

  // ── Visibility change — immediate re-sync ────────────────────────────────────
  /**
   * Re-derives remaining from the wall-clock anchor instantly when the tab
   * regains focus, ensuring second-for-second alignment after background
   * throttling.
   */

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      if (targetEndTimeRef.current === null) return;

      const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
      setRemaining(rem);
      pausedRemainingRef.current = rem;

      if (rem <= 0) {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        targetEndTimeRef.current = null;
        setRunning(false);
        onCompleteRef.current?.();
        return;
      }

      // Re-kick rAF from the corrected value
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(tick);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [tick]);

  // ── Sync remaining when duration changes externally (mode switch) ────────────

  useEffect(() => {
    if (!running) {
      pausedRemainingRef.current = durationSeconds;
      setRemaining(durationSeconds);
    }
  }, [durationSeconds, running]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      targetEndTimeRef.current = null;
    };
  }, []);

  const progress = durationSeconds > 0 ? 1 - remaining / durationSeconds : 0;

  return { remaining, running, start, pause, reset, progress };
}
