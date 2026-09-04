"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Command, Flame, Clock, CheckCircle2, Circle, Volume2, BarChart3, Zap } from "lucide-react";
import TimerWidget from "@/components/ui/TimerWidget";
import type { Priority, TaskStatus, TaskCategory } from "@/types/studyos";
import { FOCUS_MODES, todayStr, uid } from "@/lib/utils";
import { useTimerContext } from "@/lib/TimerContext";
import { useStudyStore, computeStreak } from "@/lib/store";
import {
  getSharedAudioContext,
  FOCUS_FREQUENCIES,
  startFrequency,
  stopFrequency,
  setFrequencyVolume,
  isFrequencyActive,
} from "@/lib/audio";

const useSubjects = () => useStudyStore((s) => s.data.subjects);
const useSessions = () => useStudyStore((s) => s.data.sessions);
const useTasks = () => useStudyStore((s) => s.data.tasks);
const useSettings = () => useStudyStore((s) => s.data.settings);
const useSetData = () => useStudyStore((s) => s.setData);

/* -- Priority colors (matte, no glow) -- */
const PRIO: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: "CRIT", color: "var(--red)", bg: "color-mix(in srgb, var(--red) 12%, transparent)" },
  high:     { label: "HIGH", color: "var(--amber)", bg: "color-mix(in srgb, var(--amber) 12%, transparent)" },
  medium:   { label: "MED",  color: "var(--green)", bg: "color-mix(in srgb, var(--green) 12%, transparent)" },
  low:      { label: "LOW",  color: "var(--text-dim)", bg: "color-mix(in srgb, var(--text-dim) 12%, transparent)" },
};

/* -- Format stopwatch as HH:MM:SS -- */
function fmtStopwatch(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* -- Waveform indicator -- */
function WaveIndicator({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.rect
          key={i}
          x={i * 3.5}
          rx={1}
          width={2.5}
          fill={active ? color : "var(--text-dim)"}
          animate={
            active
              ? {
                  y: [4 + Math.sin(i) * 2, 2, 6, 1 + Math.cos(i) * 2, 4 + Math.sin(i) * 2],
                  height: [6, 10, 4, 11, 6],
                }
              : { y: 5.5, height: 3 }
          }
          transition={
            active
              ? { duration: 1 + i * 0.12, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      ))}
    </svg>
  );
}

/* -- Animated wave ring indicator for active frequency -- */
function ActiveRing({ color, active }: { color: string; active: boolean }) {
  if (!active) return null;
  return (
    <motion.div
      className="b-freq-ring"
      style={{ borderColor: color }}
      animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.08, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/* -- Spring-bounce checkbox -- */
function SpringCheck({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <motion.button
      className={`b-task-check ${checked ? "b-task-check-done" : ""}`}
      onClick={onToggle}
      whileTap={{ scale: 0.7 }}
      animate={checked ? { scale: [1, 1.3, 1] } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
    >
      {checked ? <CheckCircle2 size={14} /> : <Circle size={14} />}
    </motion.button>
  );
}

/* -- Pomodoro block indicator -- */
function PomBlocks({ count, max }: { count: number; max: number }) {
  const safeMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 4;
  return (
    <div className="b-pom-blocks">
      {Array.from({ length: safeMax }, (_, i) => (
        <div key={i} className={`b-pom-block ${i < count ? "b-pom-block-fill" : ""}`} />
      ))}
    </div>
  );
}

/* -- Mini progress bar -- */
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="b-mini-bar">
      <div className="b-mini-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export default function FocusView() {
  const subjects = useSubjects();
  const sessions = useSessions();
  const tasks = useTasks();
  const settings = useSettings();
  const setData = useSetData();
  const timer = useTimerContext();
  const safeLongBreakInterval = Number.isFinite(settings.longBreakInterval) && settings.longBreakInterval > 0 ? settings.longBreakInterval : 4;
  const today = useMemo(() => todayStr(), []);
  const todaySessions = useMemo(() => sessions.filter((s) => s.date === today), [sessions, today]);
  const completedTodayMin = useMemo(() => todaySessions.reduce((a, s) => a + s.minutes, 0), [todaySessions]);
  // Focus minutes are persisted live into `sessions` at each minute milestone,
  // so the store already includes the in-progress block — adding the stopwatch
  // value on top would double count.
  const focusedMin = completedTodayMin;
  const subject = useMemo(() => subjects.find((s) => s.id === timer.subjectId), [subjects, timer.subjectId]);
  const incompleteTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);

  const mode = timer._getMode();
  const pomBlocks = timer.sessionCount;
  const sessionNum = timer.sessionCount + (timer.running && timer.phase === "work" ? 1 : 0);

  const isLongBreak = useMemo(() => {
    if (timer.phase === "work") return false;
    if (mode.label === "Long session") return true;
    return todaySessions.length > 0 && todaySessions.length % safeLongBreakInterval === 0;
  }, [timer.phase, mode.label, todaySessions.length, safeLongBreakInterval]);

  const effectiveBreak = isLongBreak ? timer.longBreakDuration : timer.shortBreakDuration;

  const nextSessionCount = timer.sessionCount + 1;
  const nextIsLongBreak = nextSessionCount > 0 && nextSessionCount % safeLongBreakInterval === 0;
  const nextBreakDur = nextIsLongBreak ? timer.longBreakDuration * 60 : timer.shortBreakDuration * 60;

  const activeTasks = useMemo(
    () => incompleteTasks.filter((t) => !timer.subjectId || t.subjectId === timer.subjectId).slice(0, 6),
    [incompleteTasks, timer.subjectId]
  );

  const completedAllMin = useMemo(() => sessions.reduce((a, s) => a + s.minutes, 0), [sessions]);
  const liveTotalMin = Math.floor(timer.totalFocusMs / 60000);
  const totalFocusHrs = ((completedAllMin + liveTotalMin) / 60).toFixed(1);
  const { streak, streakActive } = useMemo(() => computeStreak(sessions), [sessions]);
  const efficiency = useMemo(() => {
    if (!sessions.length) return 0;
    const totalPlanned = sessions.length * mode.work;
    return Math.min(100, Math.round((focusedMin / Math.max(1, totalPlanned)) * 100));
  }, [sessions, focusedMin, mode.work]);

  // -- Completion callback --
  const getModeRef = useRef(timer._getMode);
  getModeRef.current = timer._getMode;
  const setDataRef = useRef(setData);
  setDataRef.current = setData;
  const todayRef = useRef(today);
  const subjectIdRef = useRef(timer.subjectId);
  subjectIdRef.current = timer.subjectId;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const prevModeKeyRef = useRef(timer.modeKey);
  const prevCustomWorkRef = useRef(timer.customWork);
  const prevCustomRestRef = useRef(timer.customRest);



  useEffect(() => {
    const modeKeyChanged = prevModeKeyRef.current !== timer.modeKey;
    const customChanged = prevCustomWorkRef.current !== timer.customWork || prevCustomRestRef.current !== timer.customRest;
    const shouldReset = !timer.running && (modeKeyChanged || customChanged);

    if (shouldReset) {
      let dur: number;
      if (timer.modeKey === "custom") {
        dur = (timer.phase === "work" ? timer.customWork : timer.customRest) * 60;
      } else {
        const m = timer._getMode();
        dur = timer.phase === "work"
          ? m.work * 60
          : effectiveBreak * 60;
      }
      timer.reset(dur);
    }

    prevModeKeyRef.current = timer.modeKey;
    prevCustomWorkRef.current = timer.customWork;
    prevCustomRestRef.current = timer.customRest;
  }, [timer.modeKey, timer.running, timer.reset, timer.phase, timer._getMode, timer.customWork, timer.customRest, effectiveBreak]);

  useEffect(() => {
    if (Number.isFinite(settings.shortBreak) && settings.shortBreak > 0 && settings.shortBreak !== timer.shortBreakDuration) {
      timer.setShortBreakDuration(settings.shortBreak);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.shortBreak]);

  useEffect(() => {
    if (Number.isFinite(settings.longBreak) && settings.longBreak > 0 && settings.longBreak !== timer.longBreakDuration) {
      timer.setLongBreakDuration(settings.longBreak);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.longBreak]);

  // -- Handlers --
  const handlePlayPause = useCallback(() => {
    if (timer.running) timer.pause(); else timer.start();
  }, [timer.running, timer.start, timer.pause]);

  const handleReset = useCallback(() => {
    timer.pause();
    timer.setPhase("work");
    const m = timer._getMode();
    timer.reset(m.work * 60);
  }, [timer.pause, timer.setPhase, timer.reset, timer._getMode]);

  const handleSkip = useCallback(() => {
    timer.pause();
    if (timer.phase === "work") {
      timer.setPhase("rest");
      timer.reset(effectiveBreak * 60);
    } else {
      timer.setPhase("work");
      const m = timer._getMode();
      timer.reset(m.work * 60);
    }
  }, [timer.pause, timer.setPhase, timer.reset, timer.phase, timer._getMode, timer.modeKey, effectiveBreak]);

  // -- Mode-switch confirmation popover --
  const [confirmModePopover, setConfirmModePopover] = useState(false);
  const [pendingModeKey, setPendingModeKey] = useState<string | null>(null);

  const handleMode = useCallback((key: string) => {
    if (key === timer.modeKey) return;
    if (timer.running) {
      setPendingModeKey(key);
      setConfirmModePopover(true);
    } else {
      timer.setModeKey(key);
    }
  }, [timer.running, timer.modeKey, timer.setModeKey]);

  const confirmModeSwitch = useCallback(() => {
    if (pendingModeKey) {
      if (timer.phase === "work" && timer.running && timer.sessionFocusMs > 0) {
        // Persist any focus accrued this block (deduped against minute-by-minute logs)
        timer.commitFocusMinutes();
      }
      timer.setSessionCount(timer.sessionCount + (timer.phase === "work" ? 1 : 0));
      timer.pause();
      timer.setPhase("work");
      timer.setModeKey(pendingModeKey);
    }
    setPendingModeKey(null);
    setConfirmModePopover(false);
  }, [pendingModeKey, timer, mode.label, setData, today]);

  const dismissModeSwitch = useCallback(() => {
    setPendingModeKey(null);
    setConfirmModePopover(false);
  }, []);

  const toggleTask = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => {
        if (t.id !== id) return t;
        const next: Record<TaskStatus, TaskStatus> = { todo: "in_progress", in_progress: "done", done: "todo" };
        return { ...t, status: next[t.status] };
      }),
    }));
  }, [setData]);

  // -- Quick task input --
  const [quickTask, setQuickTask] = useState("");
  const addQuickTask = useCallback(() => {
    const title = quickTask.trim();
    if (!title) return;
    setData((d) => ({
      ...d,
      tasks: [...d.tasks, { id: uid(), title, subjectId: timer.subjectId, priority: "medium" as Priority, status: "todo" as TaskStatus, estMin: 25, actualMin: 0, deadline: today, category: "core" as TaskCategory, subtasks: [], collapsed: false }],
    }));
    setQuickTask("");
  }, [quickTask, timer.subjectId, setData, today]);

  // -- Mounted guard for SSR-safe date rendering --
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // -- Cmd-K hotkey --
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // -- Keyboard hotkeys --
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = e.key;
      if (key === settings.hotkeyPlayPause || key === " ") {
        e.preventDefault(); handlePlayPause();
      } else if (key === settings.hotkeyReset || key === "r" || key === "R") {
        e.preventDefault(); handleReset();
      } else if (key === settings.hotkeySkip || key === "s" || key === "S") {
        e.preventDefault(); handleSkip();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settings.hotkeyPlayPause, settings.hotkeyReset, settings.hotkeySkip, handlePlayPause, handleReset, handleSkip]);

  // ── Focus Frequencies state ──
  const [activeFreqs, setActiveFreqs] = useState<Set<string>>(new Set());
  const [volume, setVolumeState] = useState(settings.audioVolume);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    setData((d) => ({ ...d, settings: { ...d.settings, audioVolume: v } }));
  }, [setData]);

  const toggleFrequency = useCallback((id: string) => {
    setActiveFreqs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        stopFrequency(id);
      } else {
        next.add(id);
        startFrequency(id, volume / 100);
      }
      return next;
    });
  }, [volume]);

  // Sync volume to active frequencies
  useEffect(() => {
    for (const id of activeFreqs) {
      setFrequencyVolume(id, volume / 100);
    }
  }, [volume, activeFreqs]);

  // Cleanup frequencies on unmount
  useEffect(() => {
    return () => {
      for (const id of activeFreqs) {
        stopFrequency(id);
      }
    };
  }, []);

  // -- Timer geometry --
  const totalSeconds = timer.phase === "work" ? mode.work * 60 : effectiveBreak * 60;

  const phaseLabel = timer.phase === "work" ? "FOCUS SESSION" : isLongBreak ? "LONG BREAK" : "SHORT BREAK";
  const accentColor = timer.phase === "work" ? "var(--amber)" : "var(--green)";

  return (
    <div className="b-root">
      {/* == LEFT SIDEBAR == */}
      <aside className="b-sidebar">
        <div className="b-sidebar-section" style={{ marginTop: 0 }}>
          <div className="b-sidebar-label">SESSION PROGRESS</div>
          <PomBlocks count={pomBlocks} max={Math.max(pomBlocks, safeLongBreakInterval)} />
          <div className="b-sidebar-hint">{pomBlocks} of {Math.max(pomBlocks, safeLongBreakInterval)} blocks today</div>
        </div>

        <div className="b-sidebar-section">
          <div className="b-sidebar-label">ACTIVE OBJECTIVES</div>
          <div className="b-sidebar-hint" style={{ marginBottom: 8 }}>{activeTasks.length} tasks pending</div>
          {activeTasks.map((task) => {
            const prio = PRIO[task.priority];
            const taskSubject = subjects.find((s) => s.id === task.subjectId);
            return (
              <div key={task.id} className="b-sidebar-task">
                <div className="b-sidebar-task-top">
                  <span className="b-sidebar-task-title">{task.title}</span>
                  <span className="b-tag" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>
                </div>
                {taskSubject && <div className="b-sidebar-task-sub">{taskSubject.name} / {task.estMin}m</div>}
                <MiniBar pct={(task.estMin / 60) * 100} color={prio.color} />
              </div>
            );
          })}
        </div>

        <div className="b-sidebar-section" style={{ marginTop: "auto", paddingTop: 16 }}>
          <div className="b-sidebar-label">SUBJECT</div>
          <select
            className="b-select"
            value={timer.subjectId}
            onChange={(e) => timer.setSubjectId(e.target.value)}
          >
            <option value="">No subject</option>
            {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </div>
      </aside>

      {/* == MAIN WORKSPACE == */}
      <main className="b-workspace">

        {/* -- TOP BAR -- */}
        <header className="b-topbar">
          <div className="b-topbar-left">
            <span className="b-topbar-title">FOCUS</span>
            <span className="b-topbar-sep">/</span>
            <span className="b-topbar-date" suppressHydrationWarning>{mounted ? new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : ""}</span>
          </div>
          <div className="b-topbar-right">
            <span className="b-topbar-stat">{focusedMin}m focused</span>
            <span className="b-topbar-sep">/</span>
            <span className="b-topbar-stat">{todaySessions.length} sessions</span>
          </div>
        </header>

        <div className="b-content">

          {/* == HERO TIMER == */}
          <div className="b-hero">

            {/* Mode Switcher */}
            <div className="b-segmented">
              {(["pomodoro", "short", "long"] as const).map((key) => (
                <button
                  key={key}
                  className={`b-seg-btn ${timer.modeKey === key ? "b-seg-btn-active" : ""}`}
                  onClick={() => handleMode(key)}
                >
                  {FOCUS_MODES[key]?.label ?? key}
                </button>
              ))}
            </div>

            {/* Timer Widget */}
            <TimerWidget
              remaining={timer.remaining}
              totalSeconds={totalSeconds}
              phase={timer.phase}
              isRunning={timer.running}
              sessionNum={sessionNum}
              focusMin={mode.work}
              breakMin={effectiveBreak}
              accentColor={accentColor}
              subjectName={subject?.name}
              totalFocusFormatted={fmtStopwatch(timer.totalFocusMs)}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              onSkip={handleSkip}
              phaseLabel={phaseLabel}
              longBreakMin={timer.longBreakDuration}
              onEditWorkDuration={timer.setWorkDuration}
              onEditShortBreak={(min) => {
                timer.setShortBreakDuration(min);
                setData((d) => ({ ...d, settings: { ...d.settings, shortBreak: min } }));
              }}
              onEditLongBreak={(min) => {
                timer.setLongBreakDuration(min);
                setData((d) => ({ ...d, settings: { ...d.settings, longBreak: min } }));
              }}
            />
          </div>

          {/* == RIGHT PANELS == */}
          <div className="b-panels">

            {/* -- Task Queue -- */}
            <div className="b-panel">
              <div className="b-panel-header">
                <span className="b-panel-title"><Command size={13} /> TASK QUEUE</span>
                <span className="b-panel-count">{incompleteTasks.length}</span>
              </div>

              <div className="b-quick-input-wrap">
                <input
                  ref={inputRef}
                  className="b-quick-input"
                  placeholder="Add task..."
                  value={quickTask}
                  onChange={(e) => setQuickTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addQuickTask()}
                />
                <span className="b-hotkey-hint">Cmd+K</span>
              </div>

              <div className="b-task-list">
                {incompleteTasks.slice(0, 8).map((task) => {
                  const prio = PRIO[task.priority];
                  const subj = subjects.find((s) => s.id === task.subjectId);
                  return (
                    <div key={task.id} className="b-task-row">
                      <SpringCheck checked={task.status === "done"} onToggle={() => toggleTask(task.id)} />
                      <div className="b-task-body">
                        <div className="b-task-title">{task.title}</div>
                        <div className="b-task-meta">
                          {subj && <span className="b-tag" style={{ color: subj.color, background: `color-mix(in srgb, ${subj.color} 10%, transparent)` }}>{subj.name}</span>}
                          <span className="b-tag" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>
                          <span className="b-task-est">{task.estMin}m</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {incompleteTasks.length === 0 && <div className="b-empty">No tasks -- press Cmd+K to add one.</div>}
              </div>
            </div>

            {/* -- Focus Frequencies & Binaural Noise -- */}
            <div className="b-panel">
              <div className="b-panel-header">
                <span className="b-panel-title"><Volume2 size={13} /> FOCUS FREQUENCIES</span>
              </div>
              <div className="b-audio-grid">
                {FOCUS_FREQUENCIES.map((freq) => {
                  const active = activeFreqs.has(freq.id);
                  return (
                    <motion.button
                      key={freq.id}
                      className={`b-audio-card ${active ? "b-audio-card-active" : ""}`}
                      onClick={() => toggleFrequency(freq.id)}
                      whileTap={{ scale: 0.95 }}
                      style={active ? { borderColor: freq.color, background: `color-mix(in srgb, ${freq.color} 8%, transparent)` } : {}}
                    >
                      <ActiveRing color={freq.color} active={active} />
                      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center" }}>
                        <WaveIndicator active={active} color={freq.color} />
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
                          <span className="b-audio-label">{freq.shortLabel}</span>
                          <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                            {freq.description}
                          </span>
                        </div>
                      </div>
                      {active && (
                        <motion.div
                          className="b-freq-active-dot"
                          style={{ background: freq.color }}
                          animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>
              <div className="b-volume-row">
                <Volume2 size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="b-volume-slider"
                />
                <span className="b-volume-val">{volume}%</span>
              </div>
            </div>

            {/* -- Live Analytics Footer -- */}
            <div className="b-panel b-analytics">
              <div className="b-panel-header">
                <span className="b-panel-title"><BarChart3 size={13} /> TODAY</span>
              </div>
              <div className="b-analytics-grid">
                <div className={`b-analytics-item b-streak-wrap ${streakActive ? "b-streak-active" : "b-streak-dimmed"}`}>
                  <Flame size={14} className={`b-streak-flame ${streakActive ? "b-streak-flame-active" : "b-streak-flame-dimmed"}`} />
                  <div>
                    <div className="b-analytics-val">{streak}</div>
                    <div className="b-analytics-label">Day Streak</div>
                  </div>
                </div>
                <div className="b-analytics-item">
                  <Clock size={14} style={{ color: "var(--amber)" }} />
                  <div>
                    <div className="b-analytics-val">{totalFocusHrs}h</div>
                    <div className="b-analytics-label">Total Focus</div>
                  </div>
                </div>
                <div className="b-analytics-item">
                  <Zap size={14} style={{ color: "var(--green)" }} />
                  <div>
                    <div className="b-analytics-val">{efficiency}%</div>
                    <div className="b-analytics-label">Efficiency</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* -- Mode-switch confirmation popover -- */}
      <AnimatePresence>
        {confirmModePopover && (
          <motion.div
            className="b-popover-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={dismissModeSwitch}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "color-mix(in srgb, #000 45%, transparent)",
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 6 }}
              transition={{ type: "spring", stiffness: 400, damping: 24 }}
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "24px 28px",
                maxWidth: 320,
                width: "90%",
                textAlign: "center",
                boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                Switch focus mode?
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.5 }}>
                Timer is running. Switching will reset the current countdown.
                {timer.phase === "work" && (
                  <span style={{ display: "block", marginTop: 4, color: "var(--amber)" }}>
                    Your focus time so far will be saved.
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <motion.button
                  onClick={dismissModeSwitch}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-dim)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={confirmModeSwitch}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "1px solid var(--amber)",
                    background: "color-mix(in srgb, var(--amber) 12%, transparent)",
                    color: "var(--amber)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Confirm
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
