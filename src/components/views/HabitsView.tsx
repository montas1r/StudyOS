"use client";

import React, { useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Flame, Plus, Trash2, Check } from "lucide-react";
import { DAY_LABELS, currentWeekDates, todayStr, uid } from "@/lib/utils";
import { useStudyStore } from "@/lib/store";

const useHabits = () => useStudyStore((s) => s.data.habits);
const useSetData = () => useStudyStore((s) => s.setData);

export default function HabitsView() {
  const habits = useHabits();
  const setData = useSetData();
  const [name, setName] = useState("");
  const addPending = useRef(false);
  const togglePending = useRef<Set<string>>(new Set());

  const week = useMemo(() => currentWeekDates(), []);
  const today = useMemo(() => todayStr(), []);

  const habitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of habits) counts[h.id] = week.filter((ds) => h.log[ds]).length;
    return counts;
  }, [habits, week]);

  const totalDone = useMemo(
    () => habits.reduce((a, h) => a + (h.log[today] ? 1 : 0), 0),
    [habits, today]
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
    [setData]
  );

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

      {/* Habit grid */}
      {habits.length > 0 ? (
        <div className="b-habits-grid-wrap">
          <div className="b-habits-grid" style={{ gridTemplateColumns: `140px repeat(7, 32px) 60px 36px` }}>
            {/* Header row */}
            <div className="b-habits-grid-header" />
            {DAY_LABELS.map((d) => (
              <div key={d} className="b-habits-grid-header">{d}</div>
            ))}
            <div className="b-habits-grid-header">Count</div>
            <div className="b-habits-grid-header" />

            {/* Habit rows */}
            {habits.map((h) => (
              <React.Fragment key={h.id}>
                <div className="b-habits-name">{h.name}</div>
                {week.map((ds) => {
                  const done = h.log[ds];
                  const isFuture = ds > today;
                  return (
                    <div key={ds} className="b-habits-cell-wrap">
                      <motion.button
                        className={`b-habits-cell ${done ? "b-habits-cell-done" : ""} ${isFuture ? "b-habits-cell-future" : ""}`}
                        onClick={() => !isFuture && toggle(h.id, ds)}
                        disabled={isFuture}
                        whileTap={!isFuture ? { scale: 0.7 } : {}}
                        animate={done ? { scale: 1.1 } : { scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      >
                        {done && <Check size={10} />}
                      </motion.button>
                    </div>
                  );
                })}
                <div className="b-habits-count-cell">{Number(habitCounts[h.id] ?? 0)}/7</div>
                <div className="b-habits-delete-cell">
                  <motion.button className="b-habits-delete-btn" onClick={() => removeHabit(h.id)} whileTap={{ scale: 0.8 }}>
                    <Trash2 size={11} />
                  </motion.button>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : (
        <div className="b-habits-empty">No habits yet. Add one above to start tracking.</div>
      )}

      {/* Weekly summary */}
      {habits.length > 0 && (
        <div className="b-habits-summary">
          <div className="b-habits-summary-row">
            <span className="b-habits-summary-label">Total habits</span>
            <span className="b-habits-summary-val">{habits.length}</span>
          </div>
          <div className="b-habits-summary-row">
            <span className="b-habits-summary-label">Done today</span>
            <span className="b-habits-summary-val">{totalDone}</span>
          </div>
          <div className="b-habits-summary-row">
            <span className="b-habits-summary-label">Weekly completion</span>
            <span className="b-habits-summary-val">
              {(() => {
                const total = habits.reduce((a, h) => a + Number(habitCounts[h.id] ?? 0), 0);
                const max = (habits.length || 1) * 7;
                return Math.round((total / max) * 100) || 0;
              })()}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
