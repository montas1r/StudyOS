"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { FOCUS_MODES, fmtClock } from "@/lib/utils";
import { playCompletionChime, playWarningTick } from "@/lib/audio";
import { sendCompletionNotification, requestNotificationPermission } from "@/lib/notifications";

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
  onTimerComplete: (cb: () => void) => () => void;
  lap: () => void;
  resetStopwatch: () => void;
  resetSession: () => void;
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

  // ── rAF fallback frozen+delta refs ───────────────────────────────────────────
  /** Wall-clock ms when the stopwatch (and focus accumulators) started ticking.
   *  null = paused.  Used only by the rAF fallback path. */
  const stopwatchStartTimeRef = useRef<number | null>(null);
  /** Frozen stopwatch value captured at the last pause/start boundary. */
  const stopwatchFrozenMsRef = useRef(0);
  /** Frozen session-focus value at last start boundary. */
  const sessionFrozenMsRef = useRef(0);
  /** Frozen total-focus value at last start boundary. */
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

  // Keep refs fresh
  phaseRef.current = phase;
  durationRef.current = durationSeconds;
  modeKeyRef.current = modeKey;
  customWorkRef.current = customWork;
  customRestRef.current = customRest;
  remainingRef.current = remaining;
  runningRef.current = running;

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
    () => modeKeyRef.current === "custom"
      ? { label: "Custom", work: customWorkRef.current, rest: customRestRef.current }
      : FOCUS_MODES[modeKeyRef.current],
    []
  );

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
      targetEndTimeRef.current = null;
      stopwatchStartTimeRef.current = null;
      try { channel?.close(); channel = null; } catch { /* noop */ }
    };
  }, [stopSyncInterval, stopLocalTick]);

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
            if (!runningRef.current) return; // already handled
            targetEndTimeRef.current = null;
            stopwatchStartTimeRef.current = null;
            runningRef.current = false;
            setRunning(false);
            warnedSecondRef.current = -1;
            stopTitleSync();
            stopSyncInterval();
            playCompletionChime();
            sendCompletionNotification(phaseRef.current, getMode().label);
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
            for (const cb of completeCallbacksRef.current) cb();
            setSessionFocusMs(0);
            sessionFocusMsRef.current = 0;
            if (workerRef.current) workerRef.current.postMessage({ type: "reset-session" });
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
            break;
          }
        }
      };

      w.onerror = () => {
        useWorkerRef.current = false;
        workerRef.current = null;
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

    setRemaining(rem);
    remainingRef.current = rem;

    // Warning tick for the last 5 seconds
    if (rem > 0 && rem <= 5 && rem !== warnedSecondRef.current) {
      warnedSecondRef.current = rem;
      playWarningTick();
    }

    if (rem <= 0) {
      rafIdRef.current = null;
      // Freeze accumulators at completion
      if (phaseRef.current === "work" && stopwatchStartTimeRef.current !== null) {
        const dt = now - stopwatchStartTimeRef.current;
        stopwatchElapsedMsRef.current = stopwatchFrozenMsRef.current + dt;
        sessionFocusMsRef.current = sessionFrozenMsRef.current + dt;
        totalFocusMsRef.current = totalFrozenMsRef.current + dt;
      }
      targetEndTimeRef.current = null;
      stopwatchStartTimeRef.current = null;
      runningRef.current = false;
      setRunning(false);
      warnedSecondRef.current = -1;
      stopTitleSync();
      stopSyncInterval();
      playCompletionChime();
      sendCompletionNotification(phaseRef.current, getMode().label);
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
      for (const cb of completeCallbacksRef.current) cb();
      setSessionFocusMs(0);
      sessionFocusMsRef.current = 0;
      if (workerRef.current) workerRef.current.postMessage({ type: "reset-session" });
      return;
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, [getMode, broadcast, stopTitleSync, stopSyncInterval]);

  // ── Visibility change — immediate re-sync for both timers ────────────────────
  /**
   * When the tab regains focus we re-derive BOTH countdown remaining
   * AND stopwatch elapsed from their wall-clock anchors instantly,
   * ensuring second-for-second alignment across tab switches.
   */

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;

      // ── Re-derive countdown from wall-clock anchor ──
      if (targetEndTimeRef.current !== null) {
        const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        setRemaining(rem);
        remainingRef.current = rem;
        pausedRemainingRef.current = rem;
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

      // ── Handle timer expiry while hidden ──
      if (targetEndTimeRef.current !== null) {
        const rem = Math.max(0, Math.ceil((targetEndTimeRef.current - Date.now()) / 1000));
        if (rem <= 0) {
          if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
          if (workerRef.current) { workerRef.current.postMessage({ type: "stop" }); }
          targetEndTimeRef.current = null;
          stopwatchStartTimeRef.current = null;
          runningRef.current = false;
          setRunning(false);
          warnedSecondRef.current = -1;
          stopTitleSync();
          stopSyncInterval();
          playCompletionChime();
          sendCompletionNotification(phaseRef.current, getMode().label);
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
          for (const cb of completeCallbacksRef.current) cb();
          setSessionFocusMs(0);
          sessionFocusMsRef.current = 0;
          if (workerRef.current) workerRef.current.postMessage({ type: "reset-session" });
          return;
        }
      }

      // Restart title-sync with the corrected targetEndTime
      if (targetEndTimeRef.current !== null) {
        startTitleSync(phaseRef.current, targetEndTimeRef.current);
      }

      // Re-kick the rAF loop from the corrected value
      if (isLeaderRef.current && targetEndTimeRef.current !== null) {
        if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [tick, startTitleSync, stopTitleSync, getMode, broadcast, stopSyncInterval]);

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
  }, [tick, startTitleSync, startSyncInterval, broadcast]);

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
    remoteRunningRef.current = false;

    broadcast({ type: "pause", senderId: TAB_ID, remaining: rem, sentAt: Date.now() });
  }, [computeRemaining, stopTitleSync, stopSyncInterval, stopLocalTick, broadcast]);

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
    const dur = newDuration ?? durationRef.current;
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
  }, [stopTitleSync, stopSyncInterval, stopLocalTick, broadcast]);

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
    remoteRunningRef.current = false;
  }, [stopTitleSync, stopSyncInterval, stopLocalTick]);

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

  // ── Progress ─────────────────────────────────────────────────────────────────

  const progress = durationSeconds > 0 ? 1 - remaining / durationSeconds : 0;

  const value: TimerContextValue = {
    remaining, running, phase, modeKey, customWork, customRest,
    subjectId, showCustomPanel, progress,
    stopwatchElapsedMs, sessionFocusMs, totalFocusMs, laps,
    start, pause, reset, lap, resetStopwatch, resetSession,
    setModeKey: syncModeKey,
    setCustomWork: syncCustomWork,
    setCustomRest: syncCustomRest,
    setSubjectId, setPhase: syncPhase,
    setShowCustomPanel, onTimerComplete,
    _getMode: getMode,
  };

  return <TimerCtx.Provider value={value}>{children}</TimerCtx.Provider>;
}
