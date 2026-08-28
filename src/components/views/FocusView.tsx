"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Command, Flame, Clock, CheckCircle2, Circle, Volume2, BarChart3, Zap } from "lucide-react";
import TimerWidget from "@/components/ui/TimerWidget";
import type { Priority, TaskStatus, TaskCategory } from "@/types/studyos";
import { FOCUS_MODES, todayStr, uid } from "@/lib/utils";
import { useTimerContext } from "@/lib/TimerContext";
import { useStudyStore } from "@/lib/store";

const useSubjects = () => useStudyStore((s) => s.data.subjects);
const useSessions = () => useStudyStore((s) => s.data.sessions);
const useTasks = () => useStudyStore((s) => s.data.tasks);
const useSettings = () => useStudyStore((s) => s.data.settings);
const useSetData = () => useStudyStore((s) => s.setData);

/* -- Priority colors (matte, no glow) -- */
const PRIO: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: "CRIT", color: "#e1614b", bg: "rgba(225,97,75,0.12)" },
  high:     { label: "HIGH", color: "#e8a33d", bg: "rgba(232,163,61,0.12)" },
  medium:   { label: "MED",  color: "#6fbf8b", bg: "rgba(111,191,139,0.12)" },
  low:      { label: "LOW",  color: "#9498b0", bg: "rgba(148,152,176,0.12)" },
};

const AMBIENT_TRACKS = [
  { id: "rain", label: "Rain", icon: "~~" },
  { id: "forest", label: "Forest", icon: "//" },
  { id: "cafe", label: "Cafe", icon: "oo" },
  { id: "waves", label: "Waves", icon: "~~" },
];



/* -- Format stopwatch as HH:MM:SS -- */
function fmtStopwatch(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ================================================================
   AMBIENT SOUND SYNTHESIZER
   Generates synthetic ambient textures via Web Audio API.
   Each track type produces a distinct noise profile:
     rain   -- filtered white noise with occasional drip tones
     forest -- low brownian noise with random chirp tones
     cafe   -- bandpass-filtered noise with murmur texture
     waves  -- slow-oscillating low-pass filtered noise
   ================================================================ */

interface AmbientNode {
  gain: GainNode;
  stop: () => void;
}

const ambientNodesRef = new Map<string, AmbientNode>();

function createAmbientSource(type: string, ac: AudioContext, masterGain: GainNode): AmbientNode {
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);

  const bufferSize = ac.sampleRate * 4;
  const buffer = ac.createBuffer(2, bufferSize, ac.sampleRate);

  // Fill with noise
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  let filters: BiquadFilterNode[] = [];
  let lfoOsc: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  switch (type) {
    case "rain": {
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3000;
      lp.Q.value = 0.5;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;
      hp.Q.value = 0.3;
      source.connect(lp).connect(hp).connect(gain);
      filters = [lp, hp];
      // Random drip tones
      intervalId = setInterval(() => {
        if (ac.state === "closed") return;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = 800 + Math.random() * 2000;
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.03, ac.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
        osc.connect(g).connect(gain);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + 0.15);
      }, 300 + Math.random() * 600);
      break;
    }
    case "forest": {
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      lp.Q.value = 1;
      source.connect(lp).connect(gain);
      filters = [lp];
      // Random chirps
      intervalId = setInterval(() => {
        if (ac.state === "closed") return;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = 2000 + Math.random() * 3000;
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.02, ac.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
        osc.connect(g).connect(gain);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + 0.1);
      }, 1500 + Math.random() * 3000);
      break;
    }
    case "cafe": {
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 800;
      bp.Q.value = 0.8;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2000;
      source.connect(bp).connect(lp).connect(gain);
      filters = [bp, lp];
      break;
    }
    case "waves": {
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      lp.Q.value = 0.7;
      source.connect(lp).connect(gain);
      filters = [lp];
      // Slow LFO modulating the filter frequency
      lfoOsc = ac.createOscillator();
      lfoGain = ac.createGain();
      lfoOsc.type = "sine";
      lfoOsc.frequency.value = 0.1; // 10 second cycle
      lfoGain.gain.value = 400;
      lfoOsc.connect(lfoGain).connect(lp.frequency);
      lfoOsc.start();
      break;
    }
    default: {
      source.connect(gain);
      break;
    }
  }

  source.start();

  const stop = () => {
    try {
      source.stop();
      source.disconnect();
      lfoOsc?.stop();
      lfoOsc?.disconnect();
      lfoGain?.disconnect();
      filters.forEach((f) => f.disconnect());
      gain.disconnect();
      if (intervalId !== null) clearInterval(intervalId);
    } catch { /* already stopped */ }
  };

  return { gain, stop };
}

function startAmbient(id: string, volume01: number) {
  let ac: AudioContext;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac = new Ctx();
    if (ac.state === "suspended") ac.resume();
  } catch { return; }

  const masterGain = ac.createGain();
  masterGain.gain.value = volume01;
  masterGain.connect(ac.destination);

  const node = createAmbientSource(id, ac, masterGain);
  ambientNodesRef.set(id, { ...node, gain: node.gain });
  // Store ac reference on the node for volume updates
  (node as unknown as { _ac?: AudioContext })._ac = ac;
  (node as unknown as { _masterGain?: GainNode })._masterGain = masterGain;
}

function stopAmbient(id: string) {
  const node = ambientNodesRef.get(id);
  if (node) {
    node.stop();
    ambientNodesRef.delete(id);
  }
}

function setAmbientVolume(id: string, volume01: number) {
  const node = ambientNodesRef.get(id);
  if (node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const masterGain = (node as any)._masterGain as GainNode | undefined;
    if (masterGain) masterGain.gain.value = volume01;
  }
}

/* -- Equalizer bars (3-bar animated) -- */
function Equalizer({ active }: { active: boolean }) {
  return (
    <div className="b-eq">
      {[0.6, 1, 0.75].map((h, i) => (
        <motion.div
          key={i}
          className="b-eq-bar"
          animate={active ? { scaleY: [0.3, h, 0.5, h * 0.8, 0.3] } : { scaleY: 0.15 }}
          transition={active ? { duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" } : { duration: 0.3 }}
        />
      ))}
    </div>
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
  const safeShortBreak = Number.isFinite(settings.shortBreak) && settings.shortBreak > 0 ? settings.shortBreak : 5;
  const safeLongBreak = Number.isFinite(settings.longBreak) && settings.longBreak > 0 ? settings.longBreak : 15;
  const today = useMemo(() => todayStr(), []);
  const todaySessions = useMemo(() => sessions.filter((s) => s.date === today), [sessions, today]);
  // Live focused minutes = completed sessions today + current session elapsed
  const completedTodayMin = useMemo(() => todaySessions.reduce((a, s) => a + s.minutes, 0), [todaySessions]);
  const liveSessionMin = timer.phase === "work" && timer.running ? Math.floor(timer.sessionFocusMs / 60000) : 0;
  const focusedMin = completedTodayMin + liveSessionMin;
  const subject = useMemo(() => subjects.find((s) => s.id === timer.subjectId), [subjects, timer.subjectId]);
  const incompleteTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);

  // Session counter
  const mode = timer._getMode();
  const pomBlocks = useMemo(() => Math.min(todaySessions.length, 8), [todaySessions]);
  const sessionNum = todaySessions.length + (timer.running && timer.phase === "work" ? 1 : 0);
  const targetSessions = mode.label === "Custom" ? 4 : mode.label === "Pomodoro" ? safeLongBreakInterval : 2;

  // Determine if this should be a long break (after longBreakInterval sessions)
  const isLongBreak = useMemo(() => {
    if (timer.phase === "work") return false;
    if (mode.label === "Long session") return true;
    return todaySessions.length > 0 && todaySessions.length % safeLongBreakInterval === 0;
  }, [timer.phase, mode.label, todaySessions.length, safeLongBreakInterval]);

  // Effective break duration (long break after N sessions)
  const effectiveBreak = isLongBreak ? safeLongBreak : safeShortBreak;

  // Subtasks for active subject
  const activeTasks = useMemo(
    () => incompleteTasks.filter((t) => !timer.subjectId || t.subjectId === timer.subjectId).slice(0, 6),
    [incompleteTasks, timer.subjectId]
  );

  // Analytics — live totals include current in-progress session
  const completedAllMin = useMemo(() => sessions.reduce((a, s) => a + s.minutes, 0), [sessions]);
  const liveTotalMin = Math.floor(timer.totalFocusMs / 60000);
  const totalFocusHrs = ((completedAllMin + liveTotalMin) / 60).toFixed(1);
  const streak = useMemo(() => {
    let s = 0;
    for (let i = 0; ; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if (sessions.some((sess) => sess.date === ds)) s++; else break;
      if (i > 365) break;
    }
    return s;
  }, [sessions]);
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

  useEffect(() => {
    const unregister = timer.onTimerComplete(() => {
      const m = getModeRef.current!();
      const s = settingsRef.current;
      if (timer.phase === "work") {
        setDataRef.current((d) => ({
          ...d,
          sessions: [...d.sessions, { id: uid(), date: todayRef.current, startTime: new Date().toISOString(), subjectId: subjectIdRef.current, minutes: m.work, mode: m.label, subtasksCompleted: 0, distractionTags: [] }],
        }));
        timer.setPhase("rest");
        timer.reset(m.rest * 60);
        if (s.autoStartBreak) {
          queueMicrotask(() => timer.start());
        }
      } else {
        timer.setPhase("work");
        timer.reset(m.work * 60);
        if (s.autoStartFocus) {
          queueMicrotask(() => timer.start());
        }
      }
    });
    return unregister;
  }, [timer.onTimerComplete, timer.setPhase, timer.reset, timer.start, timer.phase]);

  useEffect(() => {
    if (timer.modeKey !== "custom" && !timer.running) {
      const m = timer._getMode();
      timer.reset((timer.phase === "work" ? m.work : m.rest) * 60);
    }
  }, [timer.modeKey, timer.running, timer.reset, timer.phase, timer._getMode]);

  useEffect(() => {
    if (timer.modeKey === "custom" && !timer.running) {
      const dur = (timer.phase === "work" ? timer.customWork : timer.customRest) * 60;
      timer.reset(dur);
    }
  }, [timer.customWork, timer.customRest, timer.modeKey, timer.running, timer.phase, timer.reset]);

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
      const m = timer._getMode();
      timer.reset(m.rest * 60);
    } else {
      timer.setPhase("work");
      const m = timer._getMode();
      timer.reset(m.work * 60);
    }
  }, [timer.pause, timer.setPhase, timer.reset, timer.phase, timer._getMode]);

  const handleMode = useCallback((key: string) => {
    if (timer.running) timer.pause();
    timer.setModeKey(key);
  }, [timer.running, timer.pause, timer.setModeKey]);

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

  // -- Keyboard hotkeys (Space, R, S) from settings --
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const key = e.key;
      if (key === settings.hotkeyPlayPause || key === " ") {
        e.preventDefault();
        handlePlayPause();
      } else if (key === settings.hotkeyReset || key === "r" || key === "R") {
        e.preventDefault();
        handleReset();
      } else if (key === settings.hotkeySkip || key === "s" || key === "S") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settings.hotkeyPlayPause, settings.hotkeyReset, settings.hotkeySkip, handlePlayPause, handleReset, handleSkip]);

  // -- Ambient audio state --
  const [activeAmbient, setActiveAmbient] = useState<Set<string>>(new Set());
  const [volume, setVolume] = useState(settings.audioVolume);
  const toggleAmbient = useCallback((id: string) => {
    setActiveAmbient((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        stopAmbient(id);
      } else {
        next.add(id);
        startAmbient(id, volume / 100);
      }
      return next;
    });
  }, [volume]);

  // Sync volume to active ambient sources
  useEffect(() => {
    for (const id of activeAmbient) {
      setAmbientVolume(id, volume / 100);
    }
  }, [volume, activeAmbient]);

  // Cleanup ambient on unmount
  useEffect(() => {
    return () => {
      for (const id of ambientNodesRef.keys()) {
        stopAmbient(id);
      }
    };
  }, []);

  // -- Timer geometry --
  const totalSeconds = (timer.phase === "work" ? mode.work : mode.rest) * 60;

  const phaseLabel = timer.phase === "work" ? "FOCUS SESSION" : isLongBreak ? "LONG BREAK" : "SHORT BREAK";
  const accentColor = timer.phase === "work" ? "#e8a33d" : "#6fbf8b";

  return (
    <div className="b-root">
      {/* == LEFT SIDEBAR == */}
      <aside className="b-sidebar">
        <div className="b-sidebar-section" style={{ marginTop: 0 }}>
          <div className="b-sidebar-label">SESSION PROGRESS</div>
          <PomBlocks count={pomBlocks} max={safeLongBreakInterval} />
          <div className="b-sidebar-hint">{pomBlocks} of {safeLongBreakInterval} blocks today</div>
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
              targetSessions={targetSessions}
              focusMin={mode.work}
              breakMin={effectiveBreak}
              accentColor={accentColor}
              subjectName={subject?.name}
              totalFocusFormatted={fmtStopwatch(timer.totalFocusMs)}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              onSkip={handleSkip}
              phaseLabel={phaseLabel}
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

              {/* Quick input */}
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
                          {subj && <span className="b-tag" style={{ color: subj.color, background: `${subj.color}18` }}>{subj.name}</span>}
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

            {/* -- Ambient Audio -- */}
            <div className="b-panel">
              <div className="b-panel-header">
                <span className="b-panel-title"><Volume2 size={13} /> AMBIENT</span>
              </div>
              <div className="b-audio-grid">
                {AMBIENT_TRACKS.map((track) => {
                  const active = activeAmbient.has(track.id);
                  return (
                    <motion.button
                      key={track.id}
                      className={`b-audio-card ${active ? "b-audio-card-active" : ""}`}
                      onClick={() => toggleAmbient(track.id)}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="b-audio-icon">{track.icon}</span>
                      <span className="b-audio-label">{track.label}</span>
                      <Equalizer active={active} />
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
                <div className="b-analytics-item">
                  <Flame size={14} style={{ color: "#e1614b" }} />
                  <div>
                    <div className="b-analytics-val">{streak}</div>
                    <div className="b-analytics-label">Day Streak</div>
                  </div>
                </div>
                <div className="b-analytics-item">
                  <Clock size={14} style={{ color: "#e8a33d" }} />
                  <div>
                    <div className="b-analytics-val">{totalFocusHrs}h</div>
                    <div className="b-analytics-label">Total Focus</div>
                  </div>
                </div>
                <div className="b-analytics-item">
                  <Zap size={14} style={{ color: "#6fbf8b" }} />
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
    </div>
  );
}
