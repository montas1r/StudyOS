"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Target, Plus, Trash2, Calendar } from "lucide-react";
import type { GoalTerm } from "@/types/studyos";
import { TERMS, uid, fmtMin } from "@/lib/utils";
import { useStudyStore } from "@/lib/store";

const useGoals = () => useStudyStore((s) => s.data.goals);
const useSubjects = () => useStudyStore((s) => s.data.subjects);
const useSetData = () => useStudyStore((s) => s.setData);

const TERM_COLORS: Record<string, string> = {
  long: "#e8a33d",
  medium: "#6fa8dc",
  short: "#6fbf8b",
};

export default function GoalsView() {
  const goals = useGoals();
  const subjects = useSubjects();
  const setData = useSetData();
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [addingFor, setAddingFor] = useState<GoalTerm | null>(null);
  const addPending = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const goalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of goals) counts[g.term] = (counts[g.term] || 0) + 1;
    return counts;
  }, [goals]);

  const addGoal = useCallback((term: GoalTerm) => {
    if (addingFor === term) {
      if (newGoalTitle.trim() && !addPending.current) {
        addPending.current = true;
        setData((d) => ({
          ...d,
          goals: [...d.goals, { id: uid(), title: newGoalTitle.trim(), term, progress: 0, deadline: "" }],
        }));
        setNewGoalTitle("");
        setAddingFor(null);
        setTimeout(() => { addPending.current = false; }, 300);
      }
    } else {
      setAddingFor(term);
      setNewGoalTitle("");
    }
  }, [addingFor, newGoalTitle, setData]);

  const updateProgress = useCallback((id: string, progress: number) =>
    setData((d) => ({ ...d, goals: d.goals.map((g) => g.id === id ? { ...g, progress: Number(progress) } : g) })),
    [setData]);
  const updateDeadline = useCallback((id: string, deadline: string) =>
    setData((d) => ({ ...d, goals: d.goals.map((g) => g.id === id ? { ...g, deadline } : g) })),
    [setData]);
  const removeGoal = useCallback((id: string) =>
    setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) })),
    [setData]);

  return (
    <div className="b-goals" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="b-goals-header">
        <div className="b-goals-header-left">
          <Target size={16} style={{ color: "#e8a33d" }} />
          <span className="b-goals-title">GOALS</span>
          <span className="b-goals-count">{goals.length}</span>
        </div>
      </div>

      {/* Term columns */}
      <div className="b-goals-columns">
        {TERMS.map((term) => {
          const color = TERM_COLORS[term.id] || "#9498b0";
          const termGoals = goals.filter((g) => g.term === term.id);
          const avgProgress = termGoals.length > 0
            ? Math.round(termGoals.reduce((a, g) => a + g.progress, 0) / termGoals.length)
            : 0;

          return (
            <div key={term.id} className="b-goals-col">
              <div className="b-goals-col-header">
                <div className="b-goals-col-header-top">
                  <div className="b-goals-col-dot" style={{ background: color }} />
                  <span className="b-goals-col-title">{term.label}</span>
                  <span className="b-goals-col-count">{termGoals.length}</span>
                </div>
                <div className="b-goals-col-bar-track">
                  <div className="b-goals-col-bar-fill" style={{ width: `${avgProgress}%`, background: color }} />
                </div>
                <span className="b-goals-col-avg">{avgProgress}% avg</span>
              </div>

              <div className="b-goals-col-body">
                {termGoals.map((g) => (
                  <div key={g.id} className="b-goals-card">
                    <div className="b-goals-card-top">
                      <span className="b-goals-card-title">{g.title}</span>
                      <motion.button className="b-goals-card-delete" onClick={() => removeGoal(g.id)} whileTap={{ scale: 0.8 }}>
                        <Trash2 size={11} />
                      </motion.button>
                    </div>
                    <div className="b-goals-card-bar-track">
                      <div className="b-goals-card-bar-fill" style={{ width: `${g.progress}%`, background: color }} />
                    </div>
                    <div className="b-goals-card-footer">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={g.progress}
                        onChange={(e) => updateProgress(g.id, Number(e.target.value))}
                        className="b-goals-slider"
                      />
                      <span className="b-goals-card-pct">{g.progress}%</span>
                    </div>
                    <div className="b-goals-card-deadline">
                      <Calendar size={10} style={{ color: "#3a3f58" }} />
                      <input
                        type="date"
                        className="b-goals-date-input"
                        value={g.deadline}
                        onChange={(e) => updateDeadline(g.id, e.target.value)}
                      />
                    </div>
                  </div>
                ))}

                {addingFor === term.id && (
                  <div className="b-goals-add-form">
                    <input
                      className="b-goals-add-input"
                      placeholder="Goal title..."
                      value={newGoalTitle}
                      onChange={(e) => setNewGoalTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addGoal(term.id)}
                      autoFocus
                    />
                  </div>
                )}

                <motion.button className="b-goals-add-btn" onClick={() => addGoal(term.id)} whileTap={{ scale: 0.95 }}>
                  <Plus size={12} />
                  {addingFor === term.id ? "Confirm" : "Add goal"}
                </motion.button>

                {termGoals.length === 0 && addingFor !== term.id && (
                  <div className="b-goals-empty">No goals yet</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
