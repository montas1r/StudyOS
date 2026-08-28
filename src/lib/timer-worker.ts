/**
 * Timer Web Worker — unified wall-clock tick loop.
 *
 * Computes BOTH countdown remaining AND stopwatch elapsed in the exact
 * same tick and broadcasts them together in a single atomic payload:
 *
 *   remaining     = Math.ceil((targetEndTime − Date.now()) / 1000)
 *   stopwatchMs   = pausedStopwatchMs + (Date.now() − stopwatchStartMs)   [work phase only]
 *   sessionFocusMs / totalFocusMs use the same frozen+delta pattern.
 *
 * Messages in:
 *   { type: "start", targetEndTime, durationSeconds, phase,
 *     stopwatchStartMs, pausedStopwatchMs }
 *   { type: "stop" }            – immediately clears interval, no reply
 *   { type: "reset-session" }   – zeros per-session accumulator
 *   { type: "lap" }             – records cumulative stopwatch at this instant
 *   { type: "reset-stopwatch" } – zeros stopwatch + laps
 *
 * Messages out:
 *   { type: "tick",   remaining, progress, running, stopwatchElapsedMs,
 *                      sessionFocusMs, totalFocusMs }
 *   { type: "complete" }
 *   { type: "warn",   second }
 *   { type: "lap",    lapMs, stopwatchElapsedMs }
 *   { type: "stopwatch-reset" }
 *   { type: "session-reset", sessionFocusMs, totalFocusMs }
 */

// ── Internal state ────────────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Wall-clock ms when the countdown hits zero. 0 = no active countdown. */
let targetEndTime = 0;
/** Total duration in seconds — used only for progress bar. */
let durationSeconds = 1;
/** "work" | "rest" */
let currentPhase: "work" | "rest" = "work";
let warnedSecond = -1;

// ── Stopwatch (wall-clock anchor) ─────────────────────────────────────────────

/** Wall-clock ms when the stopwatch started ticking. 0 = paused. */
let stopwatchStartMs = 0;
/** Frozen stopwatch value captured at the last pause/start boundary. */
let pausedStopwatchMs = 0;

// ── Focus accumulators (same frozen+delta pattern) ────────────────────────────

let sessionFrozenMs = 0;
let sessionStartMs = 0;
let totalFrozenMs = 0;
let totalStartMs = 0;

// ── Derived getters ───────────────────────────────────────────────────────────

function getStopwatchMs(): number {
  if (currentPhase === "work" && stopwatchStartMs > 0) {
    return pausedStopwatchMs + (Date.now() - stopwatchStartMs);
  }
  return pausedStopwatchMs;
}

function getSessionFocusMs(): number {
  if (currentPhase === "work" && sessionStartMs > 0) {
    return sessionFrozenMs + (Date.now() - sessionStartMs);
  }
  return sessionFrozenMs;
}

function getTotalFocusMs(): number {
  if (currentPhase === "work" && totalStartMs > 0) {
    return totalFrozenMs + (Date.now() - totalStartMs);
  }
  return totalFrozenMs;
}

// ── Freeze / unfreeze helpers ─────────────────────────────────────────────────

function startAccumulators(now: number) {
  if (currentPhase !== "work") return;
  if (sessionStartMs === 0) sessionStartMs = now;
  if (totalStartMs === 0) totalStartMs = now;
  if (stopwatchStartMs === 0) stopwatchStartMs = now;
}

function freezeAccumulators() {
  if (sessionStartMs > 0) {
    sessionFrozenMs = sessionFrozenMs + (Date.now() - sessionStartMs);
    sessionStartMs = 0;
  }
  if (totalStartMs > 0) {
    totalFrozenMs = totalFrozenMs + (Date.now() - totalStartMs);
    totalStartMs = 0;
  }
  if (stopwatchStartMs > 0) {
    pausedStopwatchMs = pausedStopwatchMs + (Date.now() - stopwatchStartMs);
    stopwatchStartMs = 0;
  }
}

// ── Tick ──────────────────────────────────────────────────────────────────────

function tick() {
  if (targetEndTime === 0) return;

  const now = Date.now();

  // ── Unified wall-clock computation (single atomic snapshot) ──
  const remaining = Math.max(0, Math.ceil((targetEndTime - now) / 1000));
  const progress = durationSeconds > 0 ? 1 - remaining / durationSeconds : 0;
  const stopwatchMs = getStopwatchMs();
  const sessionMs = getSessionFocusMs();
  const totalMs = getTotalFocusMs();

  // Warning tick for the last 5 seconds
  if (remaining > 0 && remaining <= 5 && remaining !== warnedSecond) {
    warnedSecond = remaining;
    self.postMessage({ type: "warn", second: remaining });
  }

  // ── Completion ──
  if (remaining <= 0) {
    freezeAccumulators();
    const frozenSW = pausedStopwatchMs;
    const frozenSession = sessionFrozenMs;
    const frozenTotal = totalFrozenMs;
    stopInternal();

    self.postMessage({
      type: "tick",
      remaining: 0,
      progress: 1,
      running: false,
      stopwatchElapsedMs: frozenSW,
      sessionFocusMs: frozenSession,
      totalFocusMs: frozenTotal,
    });
    self.postMessage({ type: "complete" });
    return;
  }

  // ── Normal tick — atomic payload ──
  self.postMessage({
    type: "tick",
    remaining,
    progress,
    running: true,
    stopwatchElapsedMs: stopwatchMs,
    sessionFocusMs: sessionMs,
    totalFocusMs: totalMs,
  });
}

// ── Internal stop (clears interval, freezes accumulators, no reply) ───────────

function stopInternal() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  freezeAccumulators();
  targetEndTime = 0;
  warnedSecond = -1;
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;

  switch (msg.type) {
    case "start": {
      // Immediately cancel any previous tick loop
      if (intervalId !== null) clearInterval(intervalId);
      warnedSecond = -1;

      // Set wall-clock anchors
      targetEndTime = msg.targetEndTime || 0;
      durationSeconds = msg.durationSeconds || 1;
      currentPhase = msg.phase || "work";
      stopwatchStartMs = msg.stopwatchStartMs || 0;
      pausedStopwatchMs = msg.pausedStopwatchMs || 0;

      // Reset session accumulator (fresh session on each start)
      sessionFrozenMs = 0;
      sessionStartMs = 0;
      // Preserve total accumulator
      totalFrozenMs = msg.totalFocusMs || totalFrozenMs;
      totalStartMs = 0;

      // Start accumulators if in work phase
      const now = Date.now();
      if (currentPhase === "work") {
        if (sessionStartMs === 0) sessionStartMs = now;
        if (totalStartMs === 0) totalStartMs = now;
      }

      tick();
      intervalId = setInterval(tick, 250);
      break;
    }

    case "stop": {
      // Immediately cancel pending ticks — no reply sent.
      // The main thread computes the final snapshot from wall-clock refs.
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      freezeAccumulators();
      targetEndTime = 0;
      warnedSecond = -1;
      break;
    }

    case "reset-session": {
      sessionFrozenMs = 0;
      sessionStartMs = 0;
      if (currentPhase === "work" && targetEndTime > 0) {
        sessionStartMs = Date.now();
      }
      self.postMessage({
        type: "session-reset",
        sessionFocusMs: 0,
        totalFocusMs: getTotalFocusMs(),
      });
      break;
    }

    case "lap": {
      const swMs = getStopwatchMs();
      self.postMessage({
        type: "lap",
        lapMs: swMs,
        stopwatchElapsedMs: swMs,
      });
      break;
    }

    case "reset-stopwatch": {
      if (stopwatchStartMs > 0) {
        pausedStopwatchMs = getStopwatchMs();
      }
      stopwatchStartMs = 0;
      pausedStopwatchMs = 0;
      self.postMessage({ type: "stopwatch-reset" });
      break;
    }
  }
};
