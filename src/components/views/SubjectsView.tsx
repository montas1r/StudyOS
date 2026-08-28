"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { BookOpen, Plus, Trash2, Check } from "lucide-react";
import { PALETTE, MASTERY_LABELS, uid, fmtMin } from "@/lib/utils";
import { useStudyStore } from "@/lib/store";

const useSubjects = () => useStudyStore((s) => s.data.subjects);
const useSessions = () => useStudyStore((s) => s.data.sessions);
const useSetData = () => useStudyStore((s) => s.setData);

export default function SubjectsView() {
  const subjects = useSubjects();
  const sessions = useSessions();
  const setData = useSetData();
  const [name, setName] = useState("");
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [topicName, setTopicName] = useState("");
  const addPending = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const subjectStats = useMemo(() => {
    const stats: Record<string, { mins: number; doneTopics: number }> = {};
    for (const s of subjects) {
      stats[s.id] = {
        mins: sessions.filter((sess) => sess.subjectId === s.id).reduce((a, b) => a + b.minutes, 0),
        doneTopics: s.topics.filter((t) => t.done).length,
      };
    }
    return stats;
  }, [subjects, sessions]);

  const totalMinutes = useMemo(
    () => sessions.reduce((a, s) => a + s.minutes, 0),
    [sessions]
  );

  const addSubject = useCallback(() => {
    if (!name.trim() || addPending.current) return;
    addPending.current = true;
    setData((d) => ({
      ...d,
      subjects: [
        ...d.subjects,
        { id: uid(), name: name.trim(), color: PALETTE[d.subjects.length % PALETTE.length], mastery: 0, topics: [] },
      ],
    }));
    setName("");
    setTimeout(() => { addPending.current = false; }, 300);
  }, [name, setData]);

  const setMastery = useCallback(
    (id: string, mastery: number) =>
      setData((d) => ({ ...d, subjects: d.subjects.map((s) => (s.id === id ? { ...s, mastery } : s)) })),
    [setData]
  );
  const removeSubject = useCallback(
    (id: string) => setData((d) => ({ ...d, subjects: d.subjects.filter((s) => s.id !== id) })),
    [setData]
  );

  const addTopic = useCallback((id: string) => {
    if (addingTopicFor === id) {
      if (topicName.trim() && !addPending.current) {
        addPending.current = true;
        setData((d) => ({
          ...d,
          subjects: d.subjects.map((s) =>
            s.id === id ? { ...s, topics: [...s.topics, { id: uid(), name: topicName.trim(), done: false }] } : s
          ),
        }));
        setTopicName("");
        setAddingTopicFor(null);
        setTimeout(() => { addPending.current = false; }, 300);
      }
    } else {
      setAddingTopicFor(id);
      setTopicName("");
    }
  }, [addingTopicFor, topicName, setData]);

  const toggleTopic = useCallback(
    (subjId: string, topicId: string) =>
      setData((d) => ({
        ...d,
        subjects: d.subjects.map((s) =>
          s.id !== subjId ? s : { ...s, topics: s.topics.map((t) => (t.id === topicId ? { ...t, done: !t.done } : t)) }
        ),
      })),
    [setData]
  );

  return (
    <div className="b-subjects" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="b-subjects-header">
        <div className="b-subjects-header-left">
          <BookOpen size={16} style={{ color: "#e8a33d" }} />
          <span className="b-subjects-title">SUBJECTS</span>
          <span className="b-subjects-count">{subjects.length}</span>
        </div>
        <div className="b-subjects-header-right">
          <span className="b-subjects-stat">{fmtMin(totalMinutes)} total</span>
        </div>
      </div>

      {/* Quick add */}
      <div className="b-subjects-add-row">
        <input
          className="b-subjects-add-input"
          placeholder="New subject..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSubject()}
        />
        <motion.button className="b-subjects-add-btn" onClick={addSubject} whileTap={{ scale: 0.95 }}>
          <Plus size={13} />
          Add
        </motion.button>
      </div>

      {/* Subject cards */}
      <div className="b-subjects-grid">
        {subjects.map((s) => {
          const stats = subjectStats[s.id] || { mins: 0, doneTopics: 0 };
          const topicPct = s.topics.length > 0 ? Math.round((stats.doneTopics / s.topics.length) * 100) : 0;
          const pctTotal = totalMinutes > 0 ? Math.round((stats.mins / totalMinutes) * 100) : 0;

          return (
            <div key={s.id} className="b-subjects-card">
              <div className="b-subjects-card-header">
                <div className="b-subjects-card-title-row">
                  <div className="b-subjects-card-dot" style={{ background: s.color }} />
                  <span className="b-subjects-card-name">{s.name}</span>
                </div>
                <motion.button className="b-subjects-card-delete" onClick={() => removeSubject(s.id)} whileTap={{ scale: 0.8 }}>
                  <Trash2 size={11} />
                </motion.button>
              </div>

              {/* Stats row */}
              <div className="b-subjects-card-stats">
                <div className="b-subjects-card-stat">
                  <span className="b-subjects-card-stat-val">{fmtMin(stats.mins)}</span>
                  <span className="b-subjects-card-stat-label">studied</span>
                </div>
                <div className="b-subjects-card-stat">
                  <span className="b-subjects-card-stat-val">{stats.doneTopics}/{s.topics.length}</span>
                  <span className="b-subjects-card-stat-label">topics</span>
                </div>
                <div className="b-subjects-card-stat">
                  <span className="b-subjects-card-stat-val">{pctTotal}%</span>
                  <span className="b-subjects-card-stat-label">of total</span>
                </div>
              </div>

              {/* Time bar */}
              <div className="b-subjects-card-bar-track">
                <div className="b-subjects-card-bar-fill" style={{ width: `${pctTotal}%`, background: s.color }} />
              </div>

              {/* Mastery */}
              <div className="b-subjects-mastery-row">
                <span className="b-subjects-mastery-label">{MASTERY_LABELS[s.mastery]}</span>
                <div className="b-subjects-mastery-dots">
                  {MASTERY_LABELS.map((_, i) => (
                    <button
                      key={i}
                      className={`b-subjects-mastery-dot ${s.mastery >= i ? "b-subjects-mastery-dot-active" : ""}`}
                      onClick={() => setMastery(s.id, i)}
                      style={{
                        borderColor: s.color,
                        background: s.mastery >= i ? s.color : "transparent",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Topics */}
              <div className="b-subjects-topics">
                {s.topics.map((t) => (
                  <button key={t.id} className="b-subjects-topic" onClick={() => toggleTopic(s.id, t.id)}>
                    <span
                      className={`b-subjects-topic-check ${t.done ? "b-subjects-topic-check-done" : ""}`}
                      style={{ borderColor: t.done ? s.color : "#2a2e42" }}
                    >
                      {t.done && <Check size={9} style={{ color: s.color }} />}
                    </span>
                    <span className={`b-subjects-topic-name ${t.done ? "b-subjects-topic-name-done" : ""}`}>
                      {t.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Topic progress bar */}
              {s.topics.length > 0 && (
                <div className="b-subjects-topic-bar-track">
                  <div className="b-subjects-topic-bar-fill" style={{ width: `${topicPct}%`, background: s.color }} />
                </div>
              )}

              {/* Add topic */}
              {addingTopicFor === s.id ? (
                <div className="b-subjects-topic-add-form">
                  <input
                    className="b-subjects-topic-add-input"
                    placeholder="Topic name..."
                    value={topicName}
                    onChange={(e) => setTopicName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTopic(s.id)}
                    autoFocus
                  />
                </div>
              ) : (
                <button className="b-subjects-topic-add-btn" onClick={() => addTopic(s.id)}>
                  <Plus size={10} />
                  Topic
                </button>
              )}
            </div>
          );
        })}

        {subjects.length === 0 && (
          <div className="b-subjects-empty">No subjects yet. Add one above.</div>
        )}
      </div>
    </div>
  );
}
