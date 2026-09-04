"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { FOCUS_MODES, fmtClock, uid, todayStr } from "@/lib/utils";
import { playCompletionChime, playWarningTick } from "@/lib/audio";
import { sendCompletionNotification, requestNotificationPermission } from "@/lib/notifications";
import { useStudyStore } from "@/lib/store";
import { flushStorage } from "@/lib/storage";
import type { Session } from "@/types/studyos";

// ── BroadcastChannel multi-tab sync ──────────────────────────────────────────

type ChannelMessage =
  | {
      type: "sync";
      senderId: string;
      targetEndTime: number | null;
      sentAt: number;
      phase: "work" | "rest";
      modeKey: string;
      durationSeconds: number;
      customWork: number;
      customRest: number;
      running: boolean;
      pausedRemaining: number;
    }
  | {
      type: "pause";
      senderId: string;
      remaining: number;
      sentAt: number;
    }
  | {
      type: "reset";
      senderId: string;
      remaining: number;
      durationSeconds: number;
      phase: "work" | "rest";
      modeKey: string;
      sentAt: number;
      customWork: number;
      customRest: number;
    }
  | { type: "request-state"; senderId: string }
  | {
      type: "state-response";
      senderId: string;
      targetEndTime: number | null;
      sentAt: number;
      phase: "work" | "rest";
      modeKey: string;
      durationSeconds: number;
      customWork: number;
      customRest: number;
      running: boolean;
      pausedRemaining: number;
    };

const TAB_ID = crypto.randomUUID();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
  if (!channel) channel = new BroadcastChannel("timer_channel");
  return channel;
}

// ── Timing constants ─────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 1000;
const LEADER_CHECK_MS = 2000;
const LEADER_TIMEOUT_MS = 6000;
const HEARTBEAT_MS = 1000;

// ── Offscreen canvas favicon helpers ─────────────────────────────────────────

let _faviconEl: HTMLLinkElement | null = null;

function ensureFaviconLink(): HTMLLinkElement {
  if (_faviconEl) return _faviconEl;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  _faviconEl = link;
  return _faviconEl;
}

let _htmlCanvas: HTMLCanvasElement | null = null;
let _htmlCtx: CanvasRenderingContext2D | null = null;

function drawFaviconToCanvas(
  progress: number,
  remainingSeconds: number,
  phase: "work" | "rest",
) {
  if (!_htmlCanvas) {
    _htmlCanvas = document.createElement("canvas");
    _htmlCanvas.width = 64;
    _htmlCanvas.height = 64;
    _htmlCtx = _htmlCanvas.getContext("2d");
  }
  const ctx = _htmlCtx!;
  const size = 64;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 26;
  const lineWidth = 5;
  const mins = Math.max(0, Math.ceil(remainingSeconds / 60));

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(30,33,51,0.8)";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * Math.min(progress, 1);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = phase === "work" ? "#e8a33d" : "#6fbf8b";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.fillStyle = phase === "work" ? "#e8a33d" : "#6fbf8b";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(mins), cx, cy + 1);

  const link = ensureFaviconLink();
  link.href = _htmlCanvas.toDataURL("image/png");
}

function updateFavicon(
  progress: number,
  remainingSeconds: number,
  phase: "work" | "rest",
) {
  drawFaviconToCanvas(progress, remainingSeconds, phase);
}

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface TimerState {
  remaining: number;
  running: boolean;
  phase: "work" | "rest";
  modeKey: string;
  customWork: number;
  customRest: number;
  subjectId: string;
  showCustomPanel: boolean;
  progress: number;
  stopwatchElapsedMs: number;
  sessionFocusMs: number;
  totalFocusMs: number;
  sessionCount: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  laps: { id: string; elapsedMs: number; label: string }[];
}

export interface TimerContextValue extends TimerState {
  start: () => void;
  pause: () => void;
  reset: (durationSeconds?: number) => void;
  setModeKey: (key: string) => void;
  setCustomWork: (v: number) => void;
  setCustomRest: (v: number) => void;
  setSubjectId: (id: string) => void;
  setPhase: (p: "work" | "rest") => void;
  setShowCustomPanel: (v: boolean) => void;
  setSessionCount: (v: number) => void;
  setWorkDuration: (minutes: number) => void;
  setShortBreakDuration: (minutes: number) => void;
  setLongBreakDuration: (minutes: number) => void;
  onTimerComplete: (cb: () => void) => () => void;
  lap: () => void;
  resetStopwatch: () => void;
  resetSession: () => void;
  /** Persist the current work block's focus minutes; returns total elapsed minutes. */
  commitFocusMinutes: () => number;
  _getMode: () => { label: string; work: number; rest: number };
}

const TimerCtx = createContext<TimerContextValue | null>(null);

export function useTimerContext() {
  const ctx = useContext(TimerCtx);
  if (!ctx) throw new Error("useTimerContext must be used within <TimerProvider>");
  return ctx;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  // ── React state ──────────────────────────────────────────────────────────────
  const [modeKey, setModeKey] = useState("pomodoro");
  const [customWork, setCustomWork] = useState(45);
  const [customRest, setCustomRest] = useState(10);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [phase, setPhase] = useState<"work" | "rest">("work");
  const [subjectId, setSubjectId] = useState("");
  const [remaining, setRemaining] = useState(FOCUS_MODES.pomodoro.work * 60);
  const [running, setRunning] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(FOCUS_MODES.pomodoro.work * 60);
  const remainingRef = useRef(FOCUS_MODES.pomodoro.work * 60);
  const runningRef = useRef(false);
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState(0);
  const [sessionFocusMs, setSessionFocusMs] = useState(0);
  const [totalFocusMs, setTotalFocusMs] = useState(0);
  const [laps, setLaps] = useState<{ id: string; elapsedMs: number; label: string }[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [shortBreakDuration, setShortBreakDurationState] = useState(1);
  const [longBreakDuration, setLongBreakDurationState] = useState(15);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const rafIdRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const useWorkerRef = useRef(false);

  /** Wall-clock ms when the countdown hits zero. null = paused/stopped. */
  const targetEndTimeRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef(FOCUS_MODES.pomodoro.work * 60);
  const phaseRef = useRef(phase);
  const completeCallbacksRef = useRef<Set<() => void>>(new Set());
  const warnedSecondRef = useRef<number>(-1);
  const stopwatchElapsedMsRef = useRef(0);
  const sessionFocusMsRef = useRef(0);
  const totalFocusMsRef = useRef(0);
  const lapCountRef = useRef(0);
  const durationRef = useRef(durationSeconds);
  const modeKeyRef = useRef(modeKey);
  const customWorkRef = useRef(customWork);
  const customRestRef = useRef(customRest);
  const modeWorkOverridesRef = useRef<Record<string, number>>({});
  const shortBreakDurationRef = useRef(shortBreakDuration);
  const longBreakDurationRef = useRef(longBreakDuration);
  const sessionCountRef = useRef(0);
  const subjectIdRef = useRef("");
  /** Whole focus minutes already persisted to the store for the current work block. */
  const loggedFocusMinRef = useRef(0);
  /** Store id of the live (in-progress) work block so accrued minutes update in place. */
  const activeSessionIdRef = useRef<string | null>(null);

  // ── rAF fallback frozen+delta refs ───────────────────────────────────────────
  const stopwatchStartTimeRef = useRef<number | null>(null);
  const stopwatchFrozenMsRef = useRef(0);
  const sessionFrozenMsRef = useRef(0);
  const totalFrozenMsRef = useRef(0);

  // ── Multi-tab sync refs ──────────────────────────────────────────────────────
  const isLeaderRef = useRef(true);
  const leaderIdRef = useRef<string>(TAB_ID);
  const lastLeaderBeatRef = useRef<number>(Date.now());
  const remoteRunningRef = useRef(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localTickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastReceivedSentAtRef = useRef<number>(0);

  // ── Title-sync refs ──────────────────────────────────────────────────────────
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Heartbeat (main-thread failsafe) refs ────────────────────────────────────
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep refs fresh
  phaseRef.current = phase;
  durationRef.current = durationSeconds;
  modeKeyRef.current = modeKey;
  customWorkRef.current = customWork;
  customRestRef.current = customRest;
  remainingRef.current = remaining;
  runningRef.current = running;
  shortBreakDurationRef.current = shortBreakDuration;
  longBreakDurationRef.current = longBreakDuration;
  sessionCountRef.current = sessionCount;
  subjectIdRef.current = subjectId;

  // ── computeRemaining ─────────────────────────────────────────────────────────

  const computeRemaining = useCallback((): number => {
    if (targetEndTimeRef.current === null) return remainingRef.current;
    return Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
  }, []);

  // ── BroadcastChannel helpers ─────────────────────────────────────────────────

  const broadcast = useCallback((msg: ChannelMessage) => {
    try { getChannel().postMessage(msg); } catch { /* channel closed */ }
  }, []);

  // ── Title sync ───────────────────────────────────────────────────────────────

  const startTitleSync = useCallback((phaseVal: "work" | "rest", tgtEndTime: number | null) => {
    if (titleIntervalRef.current !== null) clearInterval(titleIntervalRef.current);

    const update = () => {
      const rem = tgtEndTime !== null
        ? Math.max(0, Math.ceil((tgtEndTime - Date.now()) / 1000))
        : 0;
      const curLabel = phaseRef.current === "work" ? "Focus" : "Break";
      document.title = `(${fmtClock(rem)}) ${curLabel} Session — StudyOS`;
      const curProgress = durationRef.current > 0 ? 1 - rem / durationRef.current : 0;
      updateFavicon(curProgress, rem, phaseRef.current);
      if (rem <= 0) {
        if (titleIntervalRef.current !== null) {
          clearInterval(titleIntervalRef.current);
          titleIntervalRef.current = null;
        }
        document.title = "StudyOS";
      }
    };

    update();
    titleIntervalRef.current = setInterval(update, 1000);
  }, []);

  const stopTitleSync = useCallback(() => {
    if (titleIntervalRef.current !== null) { clearInterval(titleIntervalRef.current); titleIntervalRef.current = null; }
    document.title = "StudyOS";
    updateFavicon(0, 0, "work");
  }, []);

  // ── getMode ──────────────────────────────────────────────────────────────────

  const getMode = useCallback(
    () => {
      if (modeKeyRef.current === "custom") {
        return { label: "Custom", work: customWorkRef.current, rest: customRestRef.current };
      }
      const base = FOCUS_MODES[modeKeyRef.current];
      const workOverride = modeWorkOverridesRef.current[modeKeyRef.current];
      return { ...base, work: workOverride ?? base.work };
    },
    []
  );

  // ── Minute-milestone focus logging ──────────────────────────────────────────
  // Every full 60 seconds of focus is appended to the live work-block entry and
  // flushed to storage immediately, so accrued focus survives pause / cancel /
  // reset / tab close. Minutes accumulate incrementally instead of only being
  // recorded when a session completes.

  const syncMinuteProgress = useCallback(() => {
    if (phaseRef.current !== "work") return;
    const wholeMin = Math.floor(sessionFocusMsRef.current / 60000);
    if (wholeMin <= loggedFocusMinRef.current) return;
    const m = getMode();
    const store = useStudyStore.getState();
    const now = new Date();
    store.setData((d) => {
      let sessions = d.sessions;
      if (activeSessionIdRef.current && sessions.some((s) => s.id === activeSessionIdRef.current)) {
        // Live block already exists — bump its accrued minutes in place
        sessions = sessions.map((s) =>
          s.id === activeSessionIdRef.current ? { ...s, minutes: wholeMin } : s
        );
      } else {
        // First milestone of a new work block → create the entry
        const entry: Session = {
          id: uid(),
          date: todayStr(),
          startTime: now.toISOString(),
          subjectId: subjectIdRef.current,
          minutes: wholeMin,
          mode: m.label,
          subtasksCompleted: 0,
          distractionTags: [],
        };
        activeSessionIdRef.current = entry.id;
        sessions = [...sessions, entry];
      }
      loggedFocusMinRef.current = wholeMin;
      const next = { ...d, sessions };
      // Persist immediately so a crash / tab close can't lose accrued focus
      flushStorage(next);
      return next;
    });
  }, [getMode]);

  /**
   * Finalize the current work block with its rounded total (used on mode-switch
   * confirms and work-phase completion). Returns the total elapsed minutes.
   */
  const commitFocusMinutes = useCallback((): number => {
    if (phaseRef.current !== "work") return 0;
    syncMinuteProgress();
    const elapsedMin = Math.max(1, Math.round(sessionFocusMsRef.current / 60000));
    const delta = Math.max(0, elapsedMin - loggedFocusMinRef.current);
    if (delta > 0 && activeSessionIdRef.current) {
      const store = useStudyStore.getState();
      store.setData((d) => {
        const sessions = d.sessions.map((s) =>
          s.id === activeSessionIdRef.current ? { ...s, minutes: elapsedMin } : s
        );
        const next = { ...d, sessions };
        flushStorage(next);
        return next;
      });
      loggedFocusMinRef.current = elapsedMin;
    }
    return elapsedMin;
  }, [syncMinuteProgress]);

  // ── Leader sync interval ─────────────────────────────────────────────────────

  const broadcastSync = useCallback(() => {
    if (!isLeaderRef.current) return;
    const now = Date.now();
    lastSentAtRef.current = now;
    broadcast({
      type: "sync",
      senderId: TAB_ID,
      targetEndTime: targetEndTimeRef.current,
      sentAt: now,
      phase: phaseRef.current,
      modeKey: modeKeyRef.current,
      durationSeconds: durationRef.current,
      customWork: customWorkRef.current,
      customRest: customRestRef.current,
      running: targetEndTimeRef.current !== null,
      pausedRemaining: pausedRemainingRef.current,
    });
  }, [broadcast]);

  const startSyncInterval = useCallback(() => {
    if (syncIntervalRef.current !== null) return;
    broadcastSync();
    syncIntervalRef.current = setInterval(broadcastSync, SYNC_INTERVAL_MS);
  }, [broadcastSync]);

  const stopSyncInterval = useCallback(() => {
    if (syncIntervalRef.current !== null) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  // ── Non-leader local tick ────────────────────────────────────────────────────

  const startLocalTick = useCallback(() => {
    if (localTickIntervalRef.current !== null) return;
    localTickIntervalRef.current = setInterval(() => {
      if (isLeaderRef.current || targetEndTimeRef.current === null || !runningRef.current) return;
      const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
      setRemaining(rem);
      remainingRef.current = rem;
      pausedRemainingRef.current = rem;
    }, 250);
  }, []);

  const stopLocalTick = useCallback(() => {
    if (localTickIntervalRef.current !== null) {
      clearInterval(localTickIntervalRef.current);
      localTickIntervalRef.current = null;
    }
  }, []);

  // ── Heartbeat (main-thread failsafe) ─────────────────────────────────────────
  // A 1-second setInterval on the main thread that re-computes remaining from
  // the wall-clock anchor.  This catches expiry even when both the Web Worker
  // interval and rAF are killed by browser background-tab throttling.

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current !== null) return;
    heartbeatIntervalRef.current = setInterval(() => {
      if (targetEndTimeRef.current === null || !runningRef.current) return;
      const now = Date.now();
      const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - now) / 1000));

      // Keep display in sync
      setRemaining(rem);
      remainingRef.current = rem;

      // Keep stopwatch / focus accumulators in sync (work phase only)
      if (phaseRef.current === "work" && stopwatchStartTimeRef.current !== null) {
        const dt = now - stopwatchStartTimeRef.current;
        const sw = stopwatchFrozenMsRef.current + dt;
        setStopwatchElapsedMs(sw);
        stopwatchElapsedMsRef.current = sw;
        const sf = sessionFrozenMsRef.current + dt;
        setSessionFocusMs(sf);
        sessionFocusMsRef.current = sf;
        const tf = totalFrozenMsRef.current + dt;
        setTotalFocusMs(tf);
        totalFocusMsRef.current = tf;
      }
      syncMinuteProgress();

      // Fire completion if the target has passed
      if (rem <= 0) {
        handleCompletionRef.current();
      }
    }, HEARTBEAT_MS);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // ── Consolidated completion handler (ref-stable) ─────────────────────────────
  // Every code-path that needs to "complete" a session calls this single
  // function so the logic is never duplicated or accidentally divergent.

  const handleCompletionRef = useRef<() => void>(() => {});
  handleCompletionRef.current = () => {
    // Guard: only complete once
    if (targetEndTimeRef.current === null && !runningRef.current) return;

    // 1. Immediately cancel any in-flight tick sources
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    if (workerRef.current) { try { workerRef.current.postMessage({ type: "stop" }); } catch { /* noop */ } }

    // 2. Freeze accumulators at the exact completion instant
    if (phaseRef.current === "work" && stopwatchStartTimeRef.current !== null) {
      const dt = Date.now() - stopwatchStartTimeRef.current;
      stopwatchElapsedMsRef.current = stopwatchFrozenMsRef.current + dt;
      sessionFocusMsRef.current = sessionFrozenMsRef.current + dt;
      totalFocusMsRef.current = totalFrozenMsRef.current + dt;
    }
    syncMinuteProgress();

    // 3. Clear wall-clock anchors
    targetEndTimeRef.current = null;
    stopwatchStartTimeRef.current = null;
    warnedSecondRef.current = -1;

    // 4. Update React state
    setRemaining(0);
    remainingRef.current = 0;
    pausedRemainingRef.current = 0;
    setRunning(false);
    runningRef.current = false;
    setStopwatchElapsedMs(stopwatchElapsedMsRef.current);
    setSessionFocusMs(sessionFocusMsRef.current);
    setTotalFocusMs(totalFocusMsRef.current);

    // 5. Stop auxiliary intervals
    stopTitleSync();
    stopSyncInterval();
    stopHeartbeat();
    stopLocalTick();

    // 6. Audio & notifications
    try { playCompletionChime(); } catch { /* audio ctx may be suspended */ }
    try { sendCompletionNotification(phaseRef.current, getMode().label); } catch { /* noop */ }

    // 7. Broadcast to other tabs
    broadcast({
      type: "sync",
      senderId: TAB_ID,
      targetEndTime: null,
      sentAt: Date.now(),
      phase: phaseRef.current,
      modeKey: modeKeyRef.current,
      durationSeconds: durationRef.current,
      customWork: customWorkRef.current,
      customRest: customRestRef.current,
      running: false,
      pausedRemaining: 0,
    });
    remoteRunningRef.current = false;

    // 8. Session logging & automatic phase transition
    const completedPhase = phaseRef.current;
    const store = useStudyStore.getState();
    const s = store.data.settings;

    if (completedPhase === "work") {
      // ── Finalize the live focus block ──
      // Whole minutes were already persisted minute-by-minute while the timer
      // ran; this only writes the fractional remainder so accrued focus is never
      // lost and nothing is double counted.
      const m = getMode();
      const elapsedMs = sessionFocusMsRef.current > 0 ? sessionFocusMsRef.current : m.work * 60000;
      const elapsedMin = Math.max(1, Math.round(elapsedMs / 60000));
      const delta = Math.max(0, elapsedMin - loggedFocusMinRef.current);
      if (delta > 0) {
        const now = new Date();
        store.setData((d) => {
          let sessions = d.sessions;
          if (activeSessionIdRef.current && sessions.some((s) => s.id === activeSessionIdRef.current)) {
            sessions = sessions.map((s) =>
              s.id === activeSessionIdRef.current ? { ...s, minutes: elapsedMin } : s
            );
          } else {
            const entry: Session = {
              id: uid(),
              date: todayStr(),
              startTime: now.toISOString(),
              subjectId: subjectIdRef.current,
              minutes: elapsedMin,
              mode: m.label,
              subtasksCompleted: 0,
              distractionTags: [],
            };
            activeSessionIdRef.current = entry.id;
            sessions = [...sessions, entry];
          }
          loggedFocusMinRef.current = elapsedMin;
          const next = { ...d, sessions };
          flushStorage(next);
          return next;
        });
      }

      // ── Increment session count ──
      const newCount = sessionCountRef.current + 1;
      sessionCountRef.current = newCount;
      setSessionCount(newCount);

      // ── Compute break duration ──
      const longInterval = Number.isFinite(s.longBreakInterval) && s.longBreakInterval > 0 ? s.longBreakInterval : 4;
      const isLong = newCount > 0 && newCount % longInterval === 0;
      let breakDur: number;
      if (modeKeyRef.current === "short") {
        breakDur = shortBreakDurationRef.current * 60;
      } else {
        breakDur = isLong ? longBreakDurationRef.current * 60 : shortBreakDurationRef.current * 60;
      }

      // ── Transition to rest phase ──
      setPhase("rest");
      phaseRef.current = "rest";
      pausedRemainingRef.current = breakDur;
      setRemaining(breakDur);
      remainingRef.current = breakDur;
      setDurationSeconds(breakDur);

      broadcast({
        type: "sync",
        senderId: TAB_ID,
        targetEndTime: null,
        sentAt: Date.now(),
        phase: "rest",
        modeKey: modeKeyRef.current,
        durationSeconds: breakDur,
        customWork: customWorkRef.current,
        customRest: customRestRef.current,
        running: false,
        pausedRemaining: breakDur,
      });

      if (s.autoStartBreak) {
        queueMicrotask(() => { start(); });
      }
    } else {
      // ── Break completed — transition back to work ──
      const m = getMode();
      setPhase("work");
      phaseRef.current = "work";
      pausedRemainingRef.current = m.work * 60;
      setRemaining(m.work * 60);
      remainingRef.current = m.work * 60;
      setDurationSeconds(m.work * 60);

      broadcast({
        type: "sync",
        senderId: TAB_ID,
        targetEndTime: null,
        sentAt: Date.now(),
        phase: "work",
        modeKey: modeKeyRef.current,
        durationSeconds: m.work * 60,
        customWork: customWorkRef.current,
        customRest: customRestRef.current,
        running: false,
        pausedRemaining: m.work * 60,
      });

      if (s.autoStartFocus) {
        queueMicrotask(() => { start(); });
      }
    }

    // 9. Fire any remaining consumer callbacks (extensibility)
    for (const cb of completeCallbacksRef.current) {
      try { cb(); } catch { /* don't let one callback block others */ }
    }

    // 10. Reset per-session accumulator
    setSessionFocusMs(0);
    sessionFocusMsRef.current = 0;
    loggedFocusMinRef.current = 0;
    activeSessionIdRef.current = null;
    if (workerRef.current) {
      try { workerRef.current.postMessage({ type: "reset-session" }); } catch { /* noop */ }
    }
  };

  // ── BroadcastChannel message handler ─────────────────────────────────────────

  useEffect(() => {
    const ch = getChannel();

    const handler = (ev: MessageEvent<ChannelMessage>) => {
      const msg = ev.data;
      if (!msg || msg.senderId === TAB_ID) return;

      if ("sentAt" in msg && typeof (msg as Record<string, unknown>).sentAt === "number") {
        const sat = (msg as Record<string, unknown>).sentAt as number;
        if (sat <= lastReceivedSentAtRef.current) return;
        lastReceivedSentAtRef.current = sat;
      }

      switch (msg.type) {
        case "sync": {
          remoteRunningRef.current = msg.running;
          leaderIdRef.current = msg.senderId;
          lastLeaderBeatRef.current = Date.now();
          isLeaderRef.current = false;
          stopLocalTick();

          targetEndTimeRef.current = msg.targetEndTime;
          phaseRef.current = msg.phase;
          modeKeyRef.current = msg.modeKey;
          durationRef.current = msg.durationSeconds;
          customWorkRef.current = msg.customWork;
          customRestRef.current = msg.customRest;
          pausedRemainingRef.current = msg.pausedRemaining;

          const rem = msg.targetEndTime !== null
            ? Math.max(0, Math.ceil((msg.targetEndTime - Date.now()) / 1000))
            : msg.pausedRemaining;

          setRemaining(rem);
          setPhase(msg.phase);
          setModeKey(msg.modeKey);
          setDurationSeconds(msg.durationSeconds);
          setCustomWork(msg.customWork);
          setCustomRest(msg.customRest);
          setRunning(msg.running);

          if (msg.running && rem > 0) {
            startTitleSync(msg.phase, msg.targetEndTime);
            startLocalTick();
          } else {
            stopTitleSync();
          }
          break;
        }
        case "pause": {
          remoteRunningRef.current = false;
          pausedRemainingRef.current = msg.remaining;
          targetEndTimeRef.current = null;
          setRemaining(msg.remaining);
          setRunning(false);
          stopTitleSync();
          stopLocalTick();
          break;
        }
        case "reset": {
          remoteRunningRef.current = false;
          pausedRemainingRef.current = msg.remaining;
          phaseRef.current = msg.phase;
          modeKeyRef.current = msg.modeKey;
          durationRef.current = msg.durationSeconds;
          customWorkRef.current = msg.customWork;
          customRestRef.current = msg.customRest;
          targetEndTimeRef.current = null;
          setRemaining(msg.remaining);
          setPhase(msg.phase);
          setModeKey(msg.modeKey);
          setDurationSeconds(msg.durationSeconds);
          setCustomWork(msg.customWork);
          setCustomRest(msg.customRest);
          setRunning(false);
          stopTitleSync();
          stopLocalTick();
          break;
        }
        case "request-state": {
          broadcast({
            type: "state-response",
            senderId: TAB_ID,
            targetEndTime: targetEndTimeRef.current,
            sentAt: Date.now(),
            phase: phaseRef.current,
            modeKey: modeKeyRef.current,
            durationSeconds: durationRef.current,
            customWork: customWorkRef.current,
            customRest: customRestRef.current,
            running: targetEndTimeRef.current !== null,
            pausedRemaining: pausedRemainingRef.current,
          });
          break;
        }
        case "state-response": {
          if (!remoteRunningRef.current) {
            targetEndTimeRef.current = msg.targetEndTime;
            phaseRef.current = msg.phase;
            modeKeyRef.current = msg.modeKey;
            durationRef.current = msg.durationSeconds;
            customWorkRef.current = msg.customWork;
            customRestRef.current = msg.customRest;
            pausedRemainingRef.current = msg.pausedRemaining;

            const rem = msg.targetEndTime !== null
              ? Math.max(0, Math.ceil((msg.targetEndTime - Date.now()) / 1000))
              : msg.pausedRemaining;

            setRemaining(rem);
            setPhase(msg.phase);
            setModeKey(msg.modeKey);
            setDurationSeconds(msg.durationSeconds);
            setCustomWork(msg.customWork);
            setCustomRest(msg.customRest);
            setRunning(msg.running);

            if (msg.running && rem > 0) {
              startTitleSync(msg.phase, msg.targetEndTime);
              startLocalTick();
            }
          }
          break;
        }
      }
    };

    ch.addEventListener("message", handler);
    broadcast({ type: "request-state", senderId: TAB_ID });

    return () => { ch.removeEventListener("message", handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Leader takeover when current leader disappears ───────────────────────────

  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (isLeaderRef.current) return;
      const elapsed = Date.now() - lastLeaderBeatRef.current;
      if (elapsed > LEADER_TIMEOUT_MS) {
        isLeaderRef.current = true;
        leaderIdRef.current = TAB_ID;
        stopLocalTick();

        if (remoteRunningRef.current && targetEndTimeRef.current !== null) {
          if (useWorkerRef.current && workerRef.current) {
            workerRef.current.postMessage({
              type: "start",
              targetEndTime: targetEndTimeRef.current,
              durationSeconds: durationRef.current,
              phase: phaseRef.current,
              stopwatchStartMs: 0,
              pausedStopwatchMs: stopwatchElapsedMsRef.current,
            });
          } else {
            rafIdRef.current = requestAnimationFrame(tick);
          }
          startSyncInterval();
          startHeartbeat();
        }
        remoteRunningRef.current = false;
      }
    }, LEADER_CHECK_MS);
    return () => clearInterval(checkInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
      if (titleIntervalRef.current !== null) { clearInterval(titleIntervalRef.current); titleIntervalRef.current = null; }
      stopSyncInterval();
      stopLocalTick();
      stopHeartbeat();
      targetEndTimeRef.current = null;
      stopwatchStartTimeRef.current = null;
      try { channel?.close(); channel = null; } catch { /* noop */ }
    };
  }, [stopSyncInterval, stopLocalTick, stopHeartbeat]);

  // ── Worker setup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const w = new Worker(new URL("./timer-worker.ts", import.meta.url), { type: "module" });
      workerRef.current = w;
      useWorkerRef.current = true;

      w.onmessage = (ev: MessageEvent) => {
        const msg = ev.data;
        switch (msg.type) {
          case "tick": {
            // ── Guard: ignore stale ticks after pause/skip/reset ──
            if (!runningRef.current) return;

            // Use the worker's atomic payload directly
            setRemaining(msg.remaining);
            remainingRef.current = msg.remaining;

            if (typeof msg.stopwatchElapsedMs === "number") {
              setStopwatchElapsedMs(msg.stopwatchElapsedMs);
              stopwatchElapsedMsRef.current = msg.stopwatchElapsedMs;
            }
            if (typeof msg.sessionFocusMs === "number") {
              setSessionFocusMs(msg.sessionFocusMs);
              sessionFocusMsRef.current = msg.sessionFocusMs;
            }
            if (typeof msg.totalFocusMs === "number") {
              setTotalFocusMs(msg.totalFocusMs);
              totalFocusMsRef.current = msg.totalFocusMs;
            }
            syncMinuteProgress();
            break;
          }
          case "warn": {
            if (msg.second !== warnedSecondRef.current) {
              warnedSecondRef.current = msg.second;
              playWarningTick();
            }
            break;
          }
          case "lap": {
            if (typeof msg.stopwatchElapsedMs === "number") {
              setStopwatchElapsedMs(msg.stopwatchElapsedMs);
              stopwatchElapsedMsRef.current = msg.stopwatchElapsedMs;
            }
            lapCountRef.current += 1;
            const lapNum = lapCountRef.current;
            const lapMins = Math.floor((msg.lapMs || 0) / 60000);
            const lapSecs = Math.floor(((msg.lapMs || 0) % 60000) / 1000);
            setLaps((prev) => [
              ...prev,
              { id: crypto.randomUUID(), elapsedMs: msg.lapMs || 0, label: `Lap ${lapNum} -- ${lapMins}m ${lapSecs}s` },
            ]);
            break;
          }
          case "stopwatch-reset": {
            setStopwatchElapsedMs(0);
            stopwatchElapsedMsRef.current = 0;
            setLaps([]);
            lapCountRef.current = 0;
            break;
          }
          case "complete": {
            handleCompletionRef.current();
            break;
          }
          case "session-reset": {
            if (typeof msg.sessionFocusMs === "number") {
              setSessionFocusMs(msg.sessionFocusMs);
              sessionFocusMsRef.current = msg.sessionFocusMs;
            }
            if (typeof msg.totalFocusMs === "number") {
              setTotalFocusMs(msg.totalFocusMs);
              totalFocusMsRef.current = msg.totalFocusMs;
            }
            loggedFocusMinRef.current = 0;
            activeSessionIdRef.current = null;
            break;
          }
        }
      };

      w.onerror = () => {
        // Worker crashed — fall back to rAF for the remainder of the session
        useWorkerRef.current = false;
        workerRef.current = null;
        if (runningRef.current && targetEndTimeRef.current !== null) {
          rafIdRef.current = requestAnimationFrame(tick);
          startHeartbeat();
        }
      };
    } catch {
      useWorkerRef.current = false;
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    }; // eslint-disable-line react-hooks/exhaustive-deps
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── rAF tick loop (fallback when Worker unavailable) ─────────────────────────

  const tick = useCallback(() => {
    if (targetEndTimeRef.current === null) return;

    const now = Date.now();

    // Countdown — single wall-clock anchor
    const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - now) / 1000));

    // Stopwatch + focus accumulators — frozen+delta pattern (work phase only)
    if (phaseRef.current === "work" && stopwatchStartTimeRef.current !== null) {
      const dt = now - stopwatchStartTimeRef.current;
      const sw = stopwatchFrozenMsRef.current + dt;
      setStopwatchElapsedMs(sw);
      stopwatchElapsedMsRef.current = sw;
      const sf = sessionFrozenMsRef.current + dt;
      setSessionFocusMs(sf);
      sessionFocusMsRef.current = sf;
      const tf = totalFrozenMsRef.current + dt;
      setTotalFocusMs(tf);
      totalFocusMsRef.current = tf;
    }
    syncMinuteProgress();

    setRemaining(rem);
    remainingRef.current = rem;

    // Warning tick for the last 5 seconds
    if (rem > 0 && rem <= 5 && rem !== warnedSecondRef.current) {
      warnedSecondRef.current = rem;
      playWarningTick();
    }

    if (rem <= 0) {
      rafIdRef.current = null;
      handleCompletionRef.current();
      return;
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility change — immediate re-sync for both timers ────────────────────

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;

      // ── Re-derive countdown from wall-clock anchor ──
      if (targetEndTimeRef.current !== null) {
        const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        setRemaining(rem);
        remainingRef.current = rem;
        pausedRemainingRef.current = rem;

        // ── Handle timer expiry while hidden ──
        if (rem <= 0) {
          handleCompletionRef.current();
          return;
        }
      }

      // ── Re-derive stopwatch from wall-clock anchor ──
      if (phaseRef.current === "work" && stopwatchStartTimeRef.current !== null) {
        const dt = Date.now() - stopwatchStartTimeRef.current;
        const sw = stopwatchFrozenMsRef.current + dt;
        setStopwatchElapsedMs(sw);
        stopwatchElapsedMsRef.current = sw;
        const sf = sessionFrozenMsRef.current + dt;
        setSessionFocusMs(sf);
        sessionFocusMsRef.current = sf;
        const tf = totalFrozenMsRef.current + dt;
        setTotalFocusMs(tf);
        totalFocusMsRef.current = tf;
      }
      syncMinuteProgress();

      // Restart title-sync with the corrected targetEndTime
      if (targetEndTimeRef.current !== null) {
        startTitleSync(phaseRef.current, targetEndTimeRef.current);
      }

      // ── Re-kick the active tick source ──
      if (isLeaderRef.current && targetEndTimeRef.current !== null) {
        if (useWorkerRef.current && workerRef.current) {
          // Nudge the worker: re-post start so its interval is definitely alive.
          // The worker's start handler clears the old interval and creates a new one,
          // but we preserve accumulated state via the frozen+delta refs.
          try {
            workerRef.current.postMessage({
              type: "start",
              targetEndTime: targetEndTimeRef.current,
              durationSeconds: durationRef.current,
              phase: phaseRef.current,
              stopwatchStartMs: stopwatchStartTimeRef.current ?? 0,
              pausedStopwatchMs: stopwatchElapsedMsRef.current,
              totalFocusMs: totalFocusMsRef.current,
            });
          } catch { /* worker may have crashed — heartbeat covers it */ }
        } else {
          if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = requestAnimationFrame(tick);
        }
        // Always ensure the main-thread heartbeat is running as a failsafe
        startHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, startTitleSync, stopTitleSync, getMode, broadcast, stopSyncInterval, startHeartbeat]);

  // ── Timer controls ───────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (targetEndTimeRef.current !== null) return;
    if (remoteRunningRef.current) return;
    isLeaderRef.current = true;
    warnedSecondRef.current = -1;

    const now = Date.now();

    // Anchor the countdown on wall-clock endpoint
    targetEndTimeRef.current = now + pausedRemainingRef.current * 1000;

    // Anchor the rAF-fallback stopwatch
    stopwatchStartTimeRef.current = phaseRef.current === "work" ? now : null;
    stopwatchFrozenMsRef.current = stopwatchElapsedMsRef.current;
    sessionFrozenMsRef.current = sessionFocusMsRef.current;
    totalFrozenMsRef.current = totalFocusMsRef.current;

    setRunning(true);
    runningRef.current = true;

    if (useWorkerRef.current && workerRef.current) {
      workerRef.current.postMessage({
        type: "start",
        targetEndTime: targetEndTimeRef.current,
        durationSeconds: durationRef.current,
        phase: phaseRef.current,
        stopwatchStartMs: phaseRef.current === "work" ? now : 0,
        pausedStopwatchMs: stopwatchElapsedMsRef.current,
        totalFocusMs: totalFocusMsRef.current,
      });
    } else {
      rafIdRef.current = requestAnimationFrame(tick);
    }

    startTitleSync(phaseRef.current, targetEndTimeRef.current);
    startSyncInterval();
    startHeartbeat();
    requestNotificationPermission();

    broadcast({
      type: "sync",
      senderId: TAB_ID,
      targetEndTime: targetEndTimeRef.current,
      sentAt: Date.now(),
      phase: phaseRef.current,
      modeKey: modeKeyRef.current,
      durationSeconds: durationRef.current,
      customWork: customWorkRef.current,
      customRest: customRestRef.current,
      running: true,
      pausedRemaining: pausedRemainingRef.current,
    });
  }, [tick, startTitleSync, startSyncInterval, broadcast, startHeartbeat]);

  const pause = useCallback(() => {
    if (targetEndTimeRef.current === null) return;

    // ① Immediately cancel worker ticks and rAF before any snapshot
    if (workerRef.current) { workerRef.current.postMessage({ type: "stop" }); }
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }

    // ② Snapshot remaining from the wall-clock anchor (no tick in flight)
    const rem = computeRemaining();

    // ③ Snapshot stopwatch + focus from frozen+delta (work phase only)
    if (phaseRef.current === "work" && stopwatchStartTimeRef.current !== null) {
      const dt = Date.now() - stopwatchStartTimeRef.current;
      const sw = stopwatchFrozenMsRef.current + dt;
      stopwatchElapsedMsRef.current = sw;
      setStopwatchElapsedMs(sw);
      sessionFocusMsRef.current = sessionFrozenMsRef.current + dt;
      setSessionFocusMs(sessionFocusMsRef.current);
      totalFocusMsRef.current = totalFrozenMsRef.current + dt;
      setTotalFocusMs(totalFocusMsRef.current);
    }
    syncMinuteProgress();

    // ④ Freeze all refs
    targetEndTimeRef.current = null;
    stopwatchStartTimeRef.current = null;
    pausedRemainingRef.current = rem;

    // ⑤ Update state
    setRemaining(rem);
    remainingRef.current = rem;
    setRunning(false);
    runningRef.current = false;

    // ⑥ Cleanup
    stopTitleSync();
    stopSyncInterval();
    stopLocalTick();
    stopHeartbeat();
    remoteRunningRef.current = false;

    broadcast({ type: "pause", senderId: TAB_ID, remaining: rem, sentAt: Date.now() });
  }, [computeRemaining, stopTitleSync, stopSyncInterval, stopLocalTick, broadcast, stopHeartbeat]);

  const reset = useCallback((newDuration?: number) => {
    // ① Immediately cancel worker ticks and rAF
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      workerRef.current.postMessage({ type: "reset-session" });
    }

    // ② Freeze
    targetEndTimeRef.current = null;
    stopwatchStartTimeRef.current = null;
    warnedSecondRef.current = -1;
    let dur = newDuration ?? durationRef.current;
    // Sync to user-defined short break when entering rest in short mode
    if (phaseRef.current === "rest" && modeKeyRef.current === "short") {
      dur = shortBreakDurationRef.current * 60;
    }
    pausedRemainingRef.current = dur;
    setRemaining(dur);
    remainingRef.current = dur;
    setDurationSeconds(dur);
    setRunning(false);
    runningRef.current = false;

    // ③ Cleanup
    stopTitleSync();
    stopSyncInterval();
    stopLocalTick();
    stopHeartbeat();
    remoteRunningRef.current = false;

    broadcast({
      type: "reset",
      senderId: TAB_ID,
      remaining: dur,
      durationSeconds: dur,
      phase: phaseRef.current,
      modeKey: modeKeyRef.current,
      sentAt: Date.now(),
      customWork: customWorkRef.current,
      customRest: customRestRef.current,
    });
  }, [stopTitleSync, stopSyncInterval, stopLocalTick, broadcast, stopHeartbeat]);

  const complete = useCallback(() => {
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    if (workerRef.current) { workerRef.current.postMessage({ type: "stop" }); }
    targetEndTimeRef.current = null;
    stopwatchStartTimeRef.current = null;
    runningRef.current = false;
    setRunning(false);
    stopTitleSync();
    stopSyncInterval();
    stopLocalTick();
    stopHeartbeat();
    remoteRunningRef.current = false;
  }, [stopTitleSync, stopSyncInterval, stopLocalTick, stopHeartbeat]);

  const onTimerComplete = useCallback((cb: () => void) => {
    completeCallbacksRef.current.add(cb);
    return () => { completeCallbacksRef.current.delete(cb); };
  }, []);

  // ── Stopwatch controls ───────────────────────────────────────────────────────

  const lap = useCallback(() => {
    if (workerRef.current && useWorkerRef.current) {
      workerRef.current.postMessage({ type: "lap" });
    } else {
      // rAF fallback — compute from frozen+delta
      const now = Date.now();
      let elapsed = stopwatchElapsedMsRef.current;
      if (phaseRef.current === "work" && stopwatchStartTimeRef.current !== null) {
        elapsed = stopwatchFrozenMsRef.current + (now - stopwatchStartTimeRef.current);
        stopwatchElapsedMsRef.current = elapsed;
        setStopwatchElapsedMs(elapsed);
      }
      lapCountRef.current += 1;
      const lapNum = lapCountRef.current;
      const lapMins = Math.floor(elapsed / 60000);
      const lapSecs = Math.floor((elapsed % 60000) / 1000);
      setLaps((prev) => [
        ...prev,
        { id: crypto.randomUUID(), elapsedMs: elapsed, label: `Lap ${lapNum} -- ${lapMins}m ${lapSecs}s` },
      ]);
    }
  }, []);

  const resetStopwatch = useCallback(() => {
    if (workerRef.current && useWorkerRef.current) {
      workerRef.current.postMessage({ type: "reset-stopwatch" });
    } else {
      setStopwatchElapsedMs(0);
      stopwatchElapsedMsRef.current = 0;
      stopwatchFrozenMsRef.current = 0;
      setLaps([]);
      lapCountRef.current = 0;
    }
  }, []);

  const resetSession = useCallback(() => {
    if (workerRef.current && useWorkerRef.current) {
      workerRef.current.postMessage({ type: "reset-session" });
    } else {
      setSessionFocusMs(0);
      sessionFocusMsRef.current = 0;
      sessionFrozenMsRef.current = 0;
      loggedFocusMinRef.current = 0;
      activeSessionIdRef.current = null;
    }
  }, []);

  // ── Sync helpers for state setters ───────────────────────────────────────────

  const syncModeKey = useCallback((v: string) => {
    setModeKey(v);
    modeKeyRef.current = v;
  }, []);

  const syncCustomWork = useCallback((v: number) => {
    setCustomWork(v);
    customWorkRef.current = v;
  }, []);

  const syncCustomRest = useCallback((v: number) => {
    setCustomRest(v);
    customRestRef.current = v;
  }, []);

  const syncPhase = useCallback((p: "work" | "rest") => {
    setPhase(p);
    phaseRef.current = p;
  }, []);

  // ── Duration editing setters ─────────────────────────────────────────────

  const setWorkDuration = useCallback((minutes: number) => {
    const clamped = Math.max(1, Math.min(180, Math.round(minutes)));
    modeWorkOverridesRef.current = { ...modeWorkOverridesRef.current, [modeKeyRef.current]: clamped };
    if (!runningRef.current && phaseRef.current === "work") {
      pausedRemainingRef.current = clamped * 60;
      setRemaining(clamped * 60);
      remainingRef.current = clamped * 60;
      setDurationSeconds(clamped * 60);
    }
  }, []);

  const setShortBreakDuration = useCallback((minutes: number) => {
    const clamped = Math.max(1, Math.min(60, Math.round(minutes)));
    setShortBreakDurationState(clamped);
    if (!runningRef.current && phaseRef.current === "rest") {
      pausedRemainingRef.current = clamped * 60;
      setRemaining(clamped * 60);
      remainingRef.current = clamped * 60;
      setDurationSeconds(clamped * 60);
    }
  }, []);

  const setLongBreakDuration = useCallback((minutes: number) => {
    const clamped = Math.max(1, Math.min(120, Math.round(minutes)));
    setLongBreakDurationState(clamped);
  }, []);

  // ── Progress ─────────────────────────────────────────────────────────────────

  const progress = durationSeconds > 0 ? 1 - remaining / durationSeconds : 0;

  const value: TimerContextValue = {
    remaining, running, phase, modeKey, customWork, customRest,
    subjectId, showCustomPanel, progress,
    stopwatchElapsedMs, sessionFocusMs, totalFocusMs, sessionCount, laps,
    start, pause, reset, lap, resetStopwatch, resetSession, commitFocusMinutes,
    setModeKey: syncModeKey,
    setCustomWork: syncCustomWork,
    setCustomRest: syncCustomRest,
    setSubjectId, setPhase: syncPhase,
    setShowCustomPanel,    setSessionCount, setWorkDuration, setShortBreakDuration, setLongBreakDuration,
    shortBreakDuration, longBreakDuration,
    onTimerComplete,
    _getMode: getMode,
  };

  return <TimerCtx.Provider value={value}>{children}</TimerCtx.Provider>;
}
