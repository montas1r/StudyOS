"use client";

import React, { useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Flame, Plus, Trash2, Check, X, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { todayStr, uid } from "@/lib/utils";
import { useStudyStore } from "@/lib/store";

const useHabits = () => useStudyStore((s) => s.data.habits);
const useSetData = () => useStudyStore((s) => s.setData);

type RangePreset = "week" | "month" | "15d" | "30d" | "next15" | "custom";

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "15d", label: "Last 15 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "next15", label: "Next 15 Days" },
  { key: "custom", label: "Custom Range" },
];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildRange(preset: RangePreset, customStart: string, customEnd: string, refDate: Date): string[] {
  const out: string[] = [];
  let start: Date;
  let end: Date;

  switch (preset) {
    case "week": {
      start = startOfWeek(refDate);
      end = addDays(start, 6);
      break;
    }
    case "month": {
      start = startOfMonth(refDate);
      end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
      break;
    }
    case "15d": {
      end = refDate;
      start = addDays(refDate, -14);
      break;
    }
    case "30d": {
      end = refDate;
      start = addDays(refDate, -29);
      break;
    }
    case "next15": {
      start = refDate;
      end = addDays(refDate, 14);
      break;
    }
    case "custom": {
      start = customStart ? new Date(customStart + "T00:00:00") : addDays(refDate, -6);
      end = customEnd ? new Date(customEnd + "T00:00:00") : refDate;
      if (start > end) [start, end] = [end, start];
      break;
    }
  }

  const cur = new Date(start);
  while (cur <= end) {
    out.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dayNum(ds: string): string {
  return ds.slice(8, 10);
}

function monthLabel(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleString("en-US", { month: "short" });
}

function monthBoundary(a: string, b: string): boolean {
  return a.slice(0, 7) !== b.slice(0, 7);
}

export default function HabitsView() {
  const habits = useHabits();
  const setData = useSetData();
  const [name, setName] = useState("");
  const addPending = useRef(false);
  const togglePending = useRef<Set<string>>(new Set());

  const today = useMemo(() => todayStr(), []);
  const refDate = useMemo(() => new Date(), []);

  /* ── Range state ── */
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const days = useMemo(
    () => buildRange(rangePreset, customStart, customEnd, refDate),
    [rangePreset, customStart, customEnd, refDate],
  );

  const rangeLabel = useMemo(() => {
    if (days.length === 0) return "";
    return `${days[0]} → ${days[days.length - 1]}`;
  }, [days]);

  /* Streak per habit — consecutive done days ending at today (or most recent). */
  const habitStreaks = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of habits) {
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 365; i++) {
        const ds = d.toISOString().slice(0, 10);
        if (h.log[ds]) streak++;
        else break;
        d.setDate(d.getDate() - 1);
      }
      out[h.id] = streak;
    }
    return out;
  }, [habits]);

  /* Completion count per habit within the active range. */
  const habitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of habits) counts[h.id] = days.filter((ds) => h.log[ds]).length;
    return counts;
  }, [habits, days]);

  const totalDone = useMemo(
    () => habits.reduce((a, h) => a + (h.log[today] ? 1 : 0), 0),
    [habits, today],
  );

  const addHabit = useCallback(() => {
    if (!name.trim() || addPending.current) return;
    addPending.current = true;
    setData((d) => ({
      ...d,
      habits: [...d.habits, { id: uid(), name: name.trim(), freq: "daily", log: {} }],
    }));
    setName("");
    setTimeout(() => { addPending.current = false; }, 300);
  }, [name, setData]);

  const toggle = useCallback((habitId: string, ds: string) => {
    const key = `${habitId}-${ds}`;
    if (togglePending.current.has(key)) return;
    togglePending.current.add(key);
    setData((d) => ({
      ...d,
      habits: d.habits.map((h) =>
        h.id === habitId ? { ...h, log: { ...h.log, [ds]: !h.log[ds] } } : h
      ),
    }));
    setTimeout(() => { togglePending.current.delete(key); }, 150);
  }, [setData]);

  const removeHabit = useCallback(
    (id: string) => setData((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) })),
    [setData],
  );

  /* Completion % relative to the active range */
  const overallPct = useMemo(() => {
    const totalCells = (habits.length || 1) * days.length;
    const done = habits.reduce((a, h) => a + (habitCounts[h.id] ?? 0), 0);
    return Math.round((done / totalCells) * 100) || 0;
  }, [habits, days, habitCounts]);

  const totalPossible = habits.length * days.length;
  const totalCompleted = habits.reduce((a, h) => a + (habitCounts[h.id] ?? 0), 0);

  return (
    <div className="b-habits" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="b-habits-header">
        <div className="b-habits-header-left">
          <Flame size={16} style={{ color: "#e8a33d" }} />
          <span className="b-habits-title">HABITS</span>
          <span className="b-habits-count">{habits.length}</span>
        </div>
        <div className="b-habits-header-right">
          <span className="b-habits-today-label">Today</span>
          <span className="b-habits-today-val">{totalDone}/{habits.length}</span>
        </div>
      </div>

      {/* Quick add */}
      <div className="b-habits-add-row">
        <input
          className="b-habits-add-input"
          placeholder="New habit..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addHabit()}
        />
        <motion.button className="b-habits-add-btn" onClick={addHabit} whileTap={{ scale: 0.95 }}>
          <Plus size={13} />
          Add
        </motion.button>
      </div>

      {/* ── Range selector bar ── */}
      <div className="b-habits-range-bar">
        <Calendar size={13} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
        <div className="b-habits-range-presets">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              className={`b-habits-range-btn ${rangePreset === p.key ? "b-habits-range-btn-active" : ""}`}
              onClick={() => setRangePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {rangePreset === "custom" && (
          <div className="b-habits-range-custom">
            <input
              type="date"
              className="b-habits-range-date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span className="b-habits-range-sep">→</span>
            <input
              type="date"
              className="b-habits-range-date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}
        <span className="b-habits-range-label">{rangeLabel}</span>
      </div>

      {/* ── Range stats bar ── */}
      {habits.length > 0 && days.length > 0 && (
        <div className="b-habits-range-stats">
          <span className="b-habits-range-stat">
            {totalCompleted}/{totalPossible} completed
          </span>
          <span className="b-habits-range-stat">{days.length} days</span>
          <span className="b-habits-range-stat b-habits-range-stat-pct">{overallPct}%</span>
        </div>
      )}

      {/* Tracking grid */}
      {habits.length > 0 && days.length > 0 ? (
        <div className="b-habits-grid-wrap">
          <div className="b-habits-grid-scroll">
            {/* ── Month / Day header row ── */}
            <div className="b-habits-row b-habits-row-header">
              <div className="b-habits-name-cell b-habits-name-cell-header">Habit</div>
              {days.map((ds, i) => {
                const showMonth = i === 0 || monthBoundary(days[i - 1], ds);
                const isToday = ds === today;
                return (
                  <div key={ds} className="b-habits-day-header">
                    {showMonth && <span className="b-habits-month-label">{monthLabel(ds)}</span>}
                    <span className={`b-habits-day-num ${isToday ? "b-habits-day-num-today" : ""}`}>
                      {dayNum(ds)}
                    </span>
                  </div>
                );
              })}
              <div className="b-habits-streak-cell b-habits-streak-cell-header">Streak</div>
              <div className="b-habits-pct-cell b-habits-pct-cell-header">%</div>
              <div className="b-habits-del-cell" />
            </div>

            {/* ── Habit rows ── */}
            {habits.map((h) => {
              const streak = habitStreaks[h.id] ?? 0;
              const pct = days.length > 0 ? Math.round(((habitCounts[h.id] ?? 0) / days.length) * 100) : 0;
              return (
                <div key={h.id} className="b-habits-row">
                  <div className="b-habits-name-cell" title={h.name}>
                    {h.name}
                    {streak >= 3 && (
                      <span className="b-habits-streak-badge" title={`${streak}-day streak`}>
                        🔥{streak}
                      </span>
                    )}
                  </div>
                  {days.map((ds) => {
                    const done = !!h.log[ds];
                    const isPast = ds < today;
                    const isToday = ds === today;
                    const isFuture = ds > today;
                    const missed = isPast && !done;

                    let cellClass = "b-habits-cell";
                    if (done) cellClass += " b-habits-cell-done";
                    else if (missed) cellClass += " b-habits-cell-missed";
                    if (isFuture) cellClass += " b-habits-cell-future";
                    if (isToday) cellClass += " b-habits-cell-today";

                    return (
                      <div key={ds} className="b-habits-cell-wrap">
                        <motion.button
                          className={cellClass}
                          onClick={() => toggle(h.id, ds)}
                          disabled={isFuture}
                          whileTap={!isFuture ? { scale: 0.7 } : {}}
                          animate={done ? { scale: 1.1 } : { scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 20 }}
                        >
                          {done && <Check size={9} />}
                          {missed && <X size={9} />}
                        </motion.button>
                      </div>
                    );
                  })}
                  <div className="b-habits-streak-cell">
                    {streak > 0 ? `${streak}d` : "—"}
                  </div>
                  <div className="b-habits-pct-cell">{pct}%</div>
                  <div className="b-habits-del-cell">
                    <motion.button className="b-habits-delete-btn" onClick={() => removeHabit(h.id)} whileTap={{ scale: 0.8 }}>
                      <Trash2 size={11} />
                    </motion.button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : habits.length > 0 ? (
        <div className="b-habits-empty">No days in selected range.</div>
      ) : (
        <div className="b-habits-empty">No habits yet. Add one above to start tracking.</div>
      )}

      {/* Summary */}
      {habits.length > 0 && (
        <div className="b-habits-summary">
          <div className="b-habits-summary-row">
            <span className="b-habits-summary-label">Total habits</span>
            <span className="b-habits-summary-val">{habits.length}</span>
          </div>
          <div className="b-habits-summary-row">
            <span className="b-habits-summary-label">Done today</span>
            <span className="b-habits-summary-val">{totalDone}/{habits.length}</span>
          </div>
          <div className="b-habits-summary-row">
            <span className="b-habits-summary-label">Range completion</span>
            <span className="b-habits-summary-val">{overallPct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
