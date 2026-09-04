"use client";
import { useDashboardData } from "@/lib/store";

import { useMemo, useCallback, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Play, Flame, Target, CheckCircle2, TrendingUp,
  Zap, ArrowRight, CalendarDays,
} from "lucide-react";
import type { Task, Priority, TaskStatus, Session } from "@/types/studyos";
import { todayStr, fmtMin, last7Days } from "@/lib/utils";
import { useTimerContext } from "@/lib/TimerContext";


/* ── Priority colors ── */
const PRIO: Record<Priority, { label: string; color: string; bg: string }> = {
  critical: { label: "CRIT", color: "#ef4444", bg: "rgba(239,68,68,0.10)" },
  high:     { label: "HIGH", color: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
  medium:   { label: "MED",  color: "#22c55e", bg: "rgba(34,197,94,0.10)" },
  low:      { label: "LOW",  color: "#71717a", bg: "rgba(113,113,122,0.10)" },
};

const STATUS_STYLE: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  in_progress: { label: "In Progress", color: "#f59e0b", bg: "rgba(245,158,11,0.10)" },
  todo:        { label: "Pending",     color: "#71717a", bg: "rgba(113,113,122,0.10)" },
  done:        { label: "Done",        color: "#22c55e", bg: "rgba(34,197,94,0.10)" },
};

/* ── Focus score: sessions completed today / target ── */
function computeFocusScore(sessionsToday: number, target: number): number {
  return Math.min(100, Math.round((sessionsToday / Math.max(1, target)) * 100));
}

/* ── Active streak: consecutive days with ≥1 session ── */
function computeStreak(allSessions: Session[]): number {
  let s = 0;
  for (let i = 0; ; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (allSessions?.some((sess) => sess.date === ds)) s++; else break;
    if (i > 365) break;
  }
  return s;
}

export default function Dashboard() {
  const { sessions, subjects, tasks, habits, goals, settings } = useDashboardData();
  const timer = useTimerContext();

  /* ── Derived data ── */
  const today = useMemo(() => todayStr(), []);
  const todaySessions = useMemo(() => sessions?.filter((s) => s.date === today) ?? [], [sessions, today]);
  const completedTodayMin = useMemo(() => todaySessions?.reduce((a, s) => a + s.minutes, 0) ?? 0, [todaySessions]);
  // Focus minutes are persisted live into `sessions` at each minute milestone,
  // so the store already includes the in-progress block.
  const studyMin = completedTodayMin;
  const goalMin = Number.isFinite(settings?.dailyGoalMinutes) ? settings.dailyGoalMinutes : 300;
  const tasksDone = useMemo(() => tasks?.filter((t) => t.status === "done").length ?? 0, [tasks]);
  const tasksTotal = tasks?.length ?? 0;
  const streak = useMemo(() => computeStreak(sessions ?? []), [sessions]);
  const focusScore = useMemo(() => computeFocusScore(todaySessions?.length ?? 0, 7), [todaySessions]);
  const sessionsCount = todaySessions?.length ?? 0;
  const incompleteTasks = useMemo(() => tasks?.filter((t) => t.status !== "done") ?? [], [tasks]);
  const recentSessions = useMemo(() => [...(sessions ?? [])].reverse().slice(0, 5), [sessions]);

  /* ── Weekly chart ── */
  const days7 = useMemo(() => last7Days(), []);
  const byDay = useMemo(() => days7.map((d) => (sessions ?? []).filter((s) => s.date === d).reduce((a, s) => a + s.minutes, 0)), [sessions, days7]);
  const maxDay = useMemo(() => Math.max(60, ...(byDay?.length ? byDay : [60])), [byDay]);
  const hourlyMarkers = useMemo(() => [0, 1, 2, 3, 4, 5], []);

  /* ── Handlers ── */
  const handleQuickStart = useCallback(() => {
    timer.setPhase("work");
    const m = timer._getMode();
    timer.reset(m.work * 60);
    timer.start();
  }, [timer]);

  const handleStartTask = useCallback((task: Task) => {
    const subj = (subjects ?? []).find((s) => s.id === task.subjectId);
    if (subj) timer.setSubjectId(subj.id);
    timer.setPhase("work");
    const m = timer._getMode();
    timer.reset(m.work * 60);
    timer.start();
  }, [timer, subjects]);

  /* ── Mounted guard for SSR-safe date rendering ── */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ── Today's date ── */
  const dateStr = useMemo(() => {
    if (!mounted) return "";
    const d = new Date();
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }, [mounted]);

  return (
    <div className="b-dash" style={{ minHeight: 0 }}>

      {/* ═══ HEADER ═══ */}
      <header className="b-dash-header">
        <div className="b-dash-header-left">
          <div className="b-dash-date-row">
            <CalendarDays size={13} style={{ color: "#9498b0" }} />
            <span className="b-dash-date" suppressHydrationWarning>{dateStr}</span>
          </div>
          <div className="b-dash-focus-row">
            <span className="b-dash-focus-actual">{fmtMin(studyMin)}</span>
            <span className="b-dash-focus-sep">/</span>
            <span className="b-dash-focus-target">{fmtMin(goalMin)}</span>
            <div className="b-dash-focus-bar">
              <div className="b-dash-focus-bar-fill" style={{ width: `${Math.min(100, (studyMin / Math.max(1, goalMin)) * 100)}%` }} />
            </div>
          </div>
        </div>
        <motion.button
          className="b-dash-quickstart"
          onClick={handleQuickStart}
          whileTap={{ scale: 0.95 }}
        >
          <Play size={14} />
          Quick Start
        </motion.button>
      </header>

      {/* ═══ KPI ROW ═══ */}
      <div className="b-kpi-row">
        <div className="b-kpi">
          <div className="b-kpi-icon" style={{ color: "#f59e0b" }}><TrendingUp size={16} /></div>
          <div className="b-kpi-body">
            <div className="b-kpi-value">{focusScore}<span className="b-kpi-unit">%</span></div>
            <div className="b-kpi-label">Focus Score</div>
          </div>
        </div>
        <div className="b-kpi">
          <div className="b-kpi-icon" style={{ color: "#22c55e" }}><CheckCircle2 size={16} /></div>
          <div className="b-kpi-body">
            <div className="b-kpi-value">{sessionsCount}</div>
            <div className="b-kpi-label">Sessions Done</div>
          </div>
        </div>
        <div className="b-kpi">
          <div className="b-kpi-icon" style={{ color: "#3b82f6" }}><Target size={16} /></div>
          <div className="b-kpi-body">
            <div className="b-kpi-value">{tasksDone}<span className="b-kpi-unit">/{tasksTotal}</span></div>
            <div className="b-kpi-label">Tasks Cleared</div>
          </div>
        </div>
        <div className="b-kpi">
          <div className="b-kpi-icon" style={{ color: "#ef4444" }}><Flame size={16} /></div>
          <div className="b-kpi-body">
            <div className="b-kpi-value">{streak}<span className="b-kpi-unit"> D</span></div>
            <div className="b-kpi-label">Active Streak</div>
          </div>
        </div>
      </div>

      {/* ═══ DUAL PANEL ═══ */}
      <div className="b-dash-panels">

        {/* ── LEFT: Weekly Chart ── */}
        <div className="b-dash-panel">
          <div className="b-dash-panel-header">
            <span className="b-dash-panel-title">WEEKLY FOCUS</span>
            <span className="b-dash-panel-sub">{fmtMin(byDay?.reduce((a, b) => a + b, 0) ?? 0)} total</span>
          </div>
          <div className="b-dash-chart">
            {/* Hourly grid lines */}
            <div className="b-dash-chart-grid">
              {hourlyMarkers?.map((h) => (
                <div key={h} className="b-dash-chart-gridline">
                  <span className="b-dash-chart-gridlabel">{h}h</span>
                </div>
              ))}
            </div>
            {/* Bars */}
            <div className="b-dash-chart-bars">
              {byDay?.map((m, i) => {
                const pct = maxDay > 0 ? (m / maxDay) * 100 : 0;
                const isToday = days7[i] === today;
                return (
                  <div key={i} className="b-dash-chart-col">
                    <div className="b-dash-chart-col-track">
                      <motion.div
                        className="b-dash-chart-col-fill"
                        initial={{ height: 0 }}
                        animate={{ height: `${pct}%` }}
                        transition={{ duration: 0.5, delay: i * 0.06, ease: "easeOut" }}
                        style={{ background: isToday ? "#f59e0b" : "#27272a" }}
                      />
                    </div>
                    <span className={`b-dash-chart-day ${isToday ? "b-dash-chart-day-active" : ""}`}>
                      {new Date(days7[i]).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}
                    </span>
                    <span className="b-dash-chart-val">{m > 0 ? `${Math.round(m / 60 * 10) / 10}h` : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Recent Activity ── */}
          <div className="b-dash-recent">
            <div className="b-dash-panel-header" style={{ marginTop: 16 }}>
              <span className="b-dash-panel-title">RECENT ACTIVITY</span>
            </div>
            {(recentSessions?.length ?? 0) === 0 && <div className="b-dash-empty">No sessions yet. Start focusing!</div>}
            {recentSessions?.map((s) => {
              const subj = (subjects ?? []).find((sub) => sub.id === s.subjectId);
              return (
                <div key={s.id} className="b-dash-activity-row">
                  <div className="b-dash-activity-dot" style={{ background: subj?.color ?? "#71717a" }} />
                  <div className="b-dash-activity-body">
                    <span className="b-dash-activity-name">{subj?.name ?? "Focus"}</span>
                    <span className="b-dash-activity-mode">{s.mode}</span>
                  </div>
                  <span className="b-dash-activity-time">{fmtMin(s.minutes)}</span>
                  <span className="b-dash-activity-date">{s.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Priority Agenda ── */}
        <div className="b-dash-panel">
          <div className="b-dash-panel-header">
            <span className="b-dash-panel-title">PRIORITY AGENDA</span>
            <span className="b-dash-panel-sub">{incompleteTasks?.length ?? 0} pending</span>
          </div>
          {(incompleteTasks?.length ?? 0) === 0 && <div className="b-dash-empty">All clear — no pending tasks.</div>}

          {/* Sort by priority weight */}
          {(() => {
            const prioWeight: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            const sorted = [...(incompleteTasks ?? [])].sort((a, b) => (prioWeight[a.priority] ?? 4) - (prioWeight[b.priority] ?? 4));
            return sorted.slice(0, 10).map((task) => {
              const prio = PRIO[task.priority];
              const status = STATUS_STYLE[task.status];
              const subj = (subjects ?? []).find((s) => s.id === task.subjectId);
              return (
                <div key={task.id} className="b-dash-agenda-row">
                  <div className="b-dash-agenda-top">
                    <span className="b-dash-agenda-title">{task.title}</span>
                    <span className="b-tag" style={{ color: prio.color, background: prio.bg }}>{prio.label}</span>
                  </div>
                  <div className="b-dash-agenda-meta">
                    {subj && <span className="b-tag" style={{ color: subj.color, background: `${subj.color}18` }}>{subj.name}</span>}
                    <span className="b-tag" style={{ color: status.color, background: status.bg }}>{status.label}</span>
                    <span className="b-dash-agenda-est">{task.estMin}m</span>
                  </div>
                  {task.status !== "done" && (
                    <motion.button
                      className="b-dash-agenda-start"
                      onClick={() => handleStartTask(task)}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Zap size={11} />
                      Start Focus
                      <ArrowRight size={11} />
                    </motion.button>
                  )}
                </div>
              );
            });
          })()}

          {/* ── Subject Summary ── */}
          <div className="b-dash-subjects">
            <div className="b-dash-panel-header" style={{ marginTop: 20 }}>
              <span className="b-dash-panel-title">SUBJECTS</span>
            </div>
            {(subjects?.length ?? 0) === 0 && <div className="b-dash-empty">No subjects added.</div>}
            {subjects?.map((s) => {
              const mins = (sessions ?? []).filter((sess) => sess.subjectId === s.id).reduce((a, b) => a + b.minutes, 0);
              const pct = (s.mastery / 5) * 100;
              return (
                <div key={s.id} className="b-dash-subject-row">
                  <div className="b-dash-subject-top">
                    <div className="b-dash-subject-dot" style={{ background: s.color }} />
                    <span className="b-dash-subject-name">{s.name}</span>
                    <span className="b-dash-subject-mins">{fmtMin(mins)}</span>
                  </div>
                  <div className="b-dash-subject-bar">
                    <div className="b-dash-subject-bar-fill" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
