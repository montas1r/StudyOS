"use client";

import { useState, useMemo, useCallback } from "react";
import {
  BarChart2,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Flame,
  Zap,
} from "lucide-react";
import type { Session } from "@/types/studyos";
import { fmtMin } from "@/lib/utils";
import { useStudyStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

type DateRange = "today" | "7" | "30" | "custom";

const SHADE_TIERS = ["#161828", "#1e2133", "#3a3f58", "#e8a33d"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function dateRangeDates(range: DateRange, customStart?: string, customEnd?: string): string[] {
  const now = new Date();
  const out: string[] = [];
  if (range === "today") {
    out.push(now.toISOString().slice(0, 10));
  } else if (range === "custom" && customStart && customEnd) {
    const s = new Date(customStart);
    const e = new Date(customEnd);
    while (s <= e) {
      out.push(s.toISOString().slice(0, 10));
      s.setDate(s.getDate() + 1);
    }
  } else {
    const days = range === "7" ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

function exportCSV(sessions: Session[]) {
  const header = "Date,Start Time,Subject,Duration (min),Mode,Subtasks,Distractions\n";
  const rows = (sessions ?? [])
    .map(
      (s) =>
        `${s.date},${s.startTime || ""},${s.subjectId},${s.minutes},${s.mode},${s.subtasksCompleted || 0},${(s.distractionTags || []).join("|")}`
    )
    .join("\n");
  downloadFile("studyos-sessions.csv", header + rows, "text/csv");
}

function exportJSON(sessions: Session[]) {
  downloadFile("studyos-sessions.json", JSON.stringify(sessions, null, 2), "application/json");
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsView() {
  const { sessions: allSessions, subjects } = useStudyStore(
    useShallow((s) => ({
      sessions: s.data?.sessions,
      subjects: s.data?.subjects,
    }))
  );
  const [range, setRange] = useState<DateRange>("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dates = useMemo(() => dateRangeDates(range, customStart, customEnd), [range, customStart, customEnd]);
  const sessions = useMemo(() => (allSessions ?? []).filter((s) => dates?.includes(s.date)), [allSessions, dates]);
  const totalMin = useMemo(() => sessions?.reduce((a, s) => a + s.minutes, 0) ?? 0, [sessions]);
  const totalSessions = sessions?.length ?? 0;

  // Completed vs abandoned (sessions < 5 min considered abandoned)
  const completed = useMemo(() => sessions?.filter((s) => s.minutes >= 5).length ?? 0, [sessions]);
  const abandoned = totalSessions - completed;

  // ── Heatmap: daily totals ──
  const dailyMinutes = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of (dates ?? [])) map[d] = 0;
    for (const s of (sessions ?? [])) {
      if (map[s.date] !== undefined) map[s.date] += s.minutes;
    }
    return map;
  }, [sessions, dates]);

  const heatMax = useMemo(() => Math.max(1, ...Object.values(dailyMinutes)), [dailyMinutes]);

  const getShade = (min: number) => {
    if (min === 0) return SHADE_TIERS[0];
    const ratio = min / heatMax;
    if (ratio <= 0.33) return SHADE_TIERS[1];
    if (ratio <= 0.66) return SHADE_TIERS[2];
    return SHADE_TIERS[3];
  };

  // ── Hourly distribution ──
  const hourly = useMemo(() => {
    const arr = Array.from({ length: 24 }, () => 0);
    for (const s of (sessions ?? [])) {
      if (s.startTime) {
        const h = new Date(s.startTime).getHours();
        arr[h] += s.minutes;
      } else {
        arr[12] += s.minutes;
      }
    }
    return arr;
  }, [sessions]);

  const hourMax = useMemo(() => Math.max(1, ...hourly), [hourly]);

  // ── Category (subject) distribution ──
  const bySubject = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of (sessions ?? [])) {
      map[s.subjectId] = (map[s.subjectId] || 0) + s.minutes;
    }
    return (subjects ?? [])
      .map((sub) => ({
        ...sub,
        mins: map[sub.id] || 0,
        pct: totalMin > 0 ? ((map[sub.id] || 0) / totalMin) * 100 : 0,
      }))
      .filter((s) => s.mins > 0)
      .sort((a, b) => b.mins - a.mins);
  }, [sessions, subjects, totalMin]);

  // ── Session breakdown table (last 50) ──
  const tableSessions = useMemo(() => [...(sessions ?? [])].sort((a, b) => b.date.localeCompare(a.date) || (b.startTime || "").localeCompare(a.startTime || "")).slice(0, 50), [sessions]);

  // ── Streak ──
  const streak = useMemo(() => {
    let s = 0;
    for (const d of (dates ?? [])) {
      if ((dailyMinutes[d] || 0) > 0) s++;
      else break;
    }
    return s;
  }, [dailyMinutes, dates]);

  // ── Mode breakdown ──
  const modeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of (sessions ?? [])) map[s.mode] = (map[s.mode] || 0) + s.minutes;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  // ── Distraction tag frequency ──
  const distractionFreq = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of (sessions ?? [])) {
      for (const tag of s.distractionTags || []) {
        map[tag] = (map[tag] || 0) + 1;
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [sessions]);

  const handleExport = useCallback(
    (fmt: "csv" | "json") => {
      if (fmt === "csv") exportCSV(sessions ?? []);
      else exportJSON(sessions ?? []);
    },
    [sessions]
  );

  const rangeLabels: { id: DateRange; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "7", label: "7 Days" },
    { id: "30", label: "30 Days" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="b-analytics-dash" style={{ minHeight: 0 }}>
      {/* ── Top Control Bar ── */}
      <div className="b-a-header">
        <div className="b-a-header-left">
          <BarChart2 size={16} style={{ color: "#e8a33d" }} />
          <span className="b-a-title">ANALYTICS</span>
          <span className="b-a-session-count">{totalSessions} sessions</span>
        </div>
        <div className="b-a-header-right">
          <div className="b-a-range-group">
            {rangeLabels?.map((r) => (
              <button
                key={r.id}
                className={`b-a-range-btn ${range === r.id ? "b-a-range-btn-active" : ""}`}
                onClick={() => setRange(r.id)}
              >
                <Calendar size={10} />
                {r.label}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="b-a-custom-dates">
              <input
                type="date"
                className="b-a-date-input"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span className="b-a-date-sep">to</span>
              <input
                type="date"
                className="b-a-date-input"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          )}
          <div className="b-a-export-group">
            <button className="b-a-export-btn" onClick={() => handleExport("csv")}>
              <Download size={11} />
              CSV
            </button>
            <button className="b-a-export-btn" onClick={() => handleExport("json")}>
              <Download size={11} />
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Row ── */}
      <div className="b-a-summary-row">
        <div className="b-a-summary-card">
          <div className="b-a-summary-val">{fmtMin(totalMin)}</div>
          <div className="b-a-summary-label">TOTAL FOCUS</div>
        </div>
        <div className="b-a-summary-card">
          <div className="b-a-summary-val">{totalSessions}</div>
          <div className="b-a-summary-label">SESSIONS</div>
        </div>
        <div className="b-a-summary-card">
          <div className="b-a-summary-val">{streak}</div>
          <div className="b-a-summary-label">DAY STREAK</div>
        </div>
        <div className="b-a-summary-card">
          <div className="b-a-summary-val">{totalSessions > 0 ? Math.round(totalMin / totalSessions) : 0}m</div>
          <div className="b-a-summary-label">AVG SESSION</div>
        </div>
      </div>

      {/* ── Heatmap Grid ── */}
      <div className="b-a-section">
        <div className="b-a-section-header">
          <span className="b-a-section-title">FOCUS INTENSITY HEATMAP</span>
          <div className="b-a-legend">
            {SHADE_TIERS.map((c, i) => (
              <div key={i} className="b-a-legend-item">
                <div className="b-a-legend-swatch" style={{ background: c }} />
                <span className="b-a-legend-label">
                  {i === 0 ? "0" : i === 1 ? "Low" : i === 2 ? "Med" : "Peak"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="b-a-heatmap">
          {dates?.map((d) => {
            const mins = dailyMinutes[d] || 0;
            const dt = new Date(d + "T12:00:00");
            return (
              <div key={d} className="b-a-heat-cell-wrap" title={`${d}: ${mins}m`}>
                <div className="b-a-heat-cell" style={{ background: getShade(mins) }} />
                <span className="b-a-heat-daylabel" suppressHydrationWarning>
                  {dt.toLocaleDateString("en", { weekday: "short" }).charAt(0)}
                </span>
                <span className="b-a-heat-datenum">{dt.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Two-column row ── */}
      <div className="b-a-two-col">
        {/* Hourly Productivity Distribution */}
        <div className="b-a-section b-a-section-half">
          <div className="b-a-section-header">
            <span className="b-a-section-title">
              <Clock size={11} />
              HOURLY DISTRIBUTION
            </span>
          </div>
          <div className="b-a-hourly">
            {HOURS.map((h) => (
              <div key={h} className="b-a-hour-col" title={`${h}:00 - ${hourly[h]}m`}>
                <div className="b-a-hour-track">
                  <div
                    className="b-a-hour-fill"
                    style={{
                      height: `${(hourly[h] / hourMax) * 100}%`,
                      background: hourly[h] === hourMax && hourly[h] > 0 ? "#e8a33d" : "#3a3f58",
                    }}
                  />
                </div>
                {h % 3 === 0 && <span className="b-a-hour-label">{h}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Subject Distribution Donut */}
        <div className="b-a-section b-a-section-half">
          <div className="b-a-section-header">
            <span className="b-a-section-title">SUBJECT DISTRIBUTION</span>
          </div>
          <div className="b-a-donut-row">
            <div className="b-a-donut-wrap">
              <svg viewBox="0 0 120 120" width="120" height="120">
                {(() => {
                  let acc = 0;
                  const R = 45;
                  const C = 2 * Math.PI * R;
                  return (bySubject ?? []).map((sub) => {
                    const pct = sub.pct / 100;
                    const dash = C * pct;
                    const offset = C * acc;
                    acc += pct;
                    return (
                      <circle
                        key={sub.id}
                        cx="60"
                        cy="60"
                        r={R}
                        fill="none"
                        stroke={sub.color}
                        strokeWidth="18"
                        strokeDasharray={`${dash} ${C - dash}`}
                        strokeDashoffset={-offset}
                        transform="rotate(-90 60 60)"
                      />
                    );
                  });
                })()}
              </svg>
              <div className="b-a-donut-center">
                <span className="b-a-donut-val">{fmtMin(totalMin)}</span>
                <span className="b-a-donut-label">TOTAL</span>
              </div>
            </div>
            <div className="b-a-donut-legend">
              {bySubject?.map((sub) => (
                <div key={sub.id} className="b-a-donut-legend-row">
                  <div className="b-a-donut-dot" style={{ background: sub.color }} />
                  <span className="b-a-donut-name">{sub.name}</span>
                  <span className="b-a-donut-pct">{Math.round(sub.pct)}%</span>
                </div>
              ))}
              {(bySubject?.length ?? 0) === 0 && <span className="b-a-donut-empty">No data</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column row 2 ── */}
      <div className="b-a-two-col">
        {/* Completion vs Abandonment */}
        <div className="b-a-section b-a-section-half">
          <div className="b-a-section-header">
            <span className="b-a-section-title">
              <CheckCircle2 size={11} />
              SESSION OUTCOMES
            </span>
          </div>
          <div className="b-a-ratio-bar-wrap">
            <div className="b-a-ratio-bar">
              <div
                className="b-a-ratio-seg b-a-ratio-completed"
                style={{ width: totalSessions > 0 ? `${(completed / totalSessions) * 100}%` : "0%" }}
              />
              <div
                className="b-a-ratio-seg b-a-ratio-abandoned"
                style={{ width: totalSessions > 0 ? `${(abandoned / totalSessions) * 100}%` : "0%" }}
              />
            </div>
            <div className="b-a-ratio-legend">
              <div className="b-a-ratio-item">
                <CheckCircle2 size={10} style={{ color: "#6fbf8b" }} />
                <span className="b-a-ratio-count">{completed}</span>
                <span className="b-a-ratio-label">Completed</span>
              </div>
              <div className="b-a-ratio-item">
                <XCircle size={10} style={{ color: "#e1614b" }} />
                <span className="b-a-ratio-count">{abandoned}</span>
                <span className="b-a-ratio-label">Abandoned</span>
              </div>
            </div>
          </div>
          <div className="b-a-mode-breakdown">
            {modeBreakdown?.map(([mode, mins]) => (
              <div key={mode} className="b-a-mode-row">
                <span className="b-a-mode-name">{mode}</span>
                <div className="b-a-mode-bar-track">
                  <div
                    className="b-a-mode-bar-fill"
                    style={{ width: `${totalMin > 0 ? (mins / totalMin) * 100 : 0}%` }}
                  />
                </div>
                <span className="b-a-mode-val">{fmtMin(mins)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Distraction Tags */}
        <div className="b-a-section b-a-section-half">
          <div className="b-a-section-header">
            <span className="b-a-section-title">
              <Zap size={11} />
              DISTRACTION TAGS
            </span>
          </div>
          <div className="b-a-distraction-list">
            {distractionFreq?.map(([tag, count]) => (
              <div key={tag} className="b-a-distraction-row">
                <span className="b-a-distraction-tag">{tag}</span>
                <div className="b-a-distraction-bar-track">
                  <div
                    className="b-a-distraction-bar-fill"
                    style={{ width: `${(count / Math.max(1, distractionFreq[0]?.[1] || 1)) * 100}%` }}
                  />
                </div>
                <span className="b-a-distraction-count">{count}</span>
              </div>
            ))}
            {(distractionFreq?.length ?? 0) === 0 && (
              <span className="b-a-distraction-empty">No distractions logged</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Session Breakdown Table ── */}
      <div className="b-a-section">
        <div className="b-a-section-header">
          <span className="b-a-section-title">SESSION BREAKDOWN</span>
          <span className="b-a-table-count">Last {tableSessions?.length ?? 0} sessions</span>
        </div>
        {(tableSessions?.length ?? 0) > 0 ? (
          <div className="b-a-table-wrap">
            <table className="b-a-table">
              <thead>
                <tr className="b-a-table-head">
                  <th className="b-a-th">Date</th>
                  <th className="b-a-th">Start</th>
                  <th className="b-a-th">Subject</th>
                  <th className="b-a-th">Mode</th>
                  <th className="b-a-th b-a-th-num">Duration</th>
                  <th className="b-a-th b-a-th-num">Subtasks</th>
                  <th className="b-a-th">Distractions</th>
                </tr>
              </thead>
              <tbody>
                {tableSessions?.map((s) => {
                  const subj = (subjects ?? []).find((sub) => sub.id === s.subjectId);
                  return (
                    <tr key={s.id} className="b-a-table-row">
                      <td className="b-a-td">{s.date}</td>
                      <td className="b-a-td b-a-td-mono">
                        <span suppressHydrationWarning>
                        {s.startTime
                          ? new Date(s.startTime).toLocaleTimeString("en", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                          : "--:--"}
                        </span>
                      </td>
                      <td className="b-a-td">
                        {subj ? (
                          <span className="b-a-subj-tag" style={{ color: subj.color, borderColor: subj.color + "40" }}>
                            {subj.name}
                          </span>
                        ) : (
                          <span className="b-a-td-dim">--</span>
                        )}
                      </td>
                      <td className="b-a-td b-a-td-mono">{s.mode}</td>
                      <td className="b-a-td b-a-td-num">{s.minutes}m</td>
                      <td className="b-a-td b-a-td-num">{s.subtasksCompleted || 0}</td>
                      <td className="b-a-td">
                        {(s.distractionTags || []).length > 0 ? (
                          <div className="b-a-dist-tags">
                            {(s.distractionTags || []).map((tag, i) => (
                              <span key={i} className="b-a-dist-mini-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="b-a-td-dim">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="b-a-empty">No sessions in the selected date range.</div>
        )}
      </div>
    </div>
  );
}
