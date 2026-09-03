"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Timer,
  Volume2,
  Bell,
  Monitor,
  Database,
  ChevronUp,
  ChevronDown,
  Trash2,
  Download,
  Upload,
} from "lucide-react";
import type { StudyData } from "@/types/studyos";
import { FOCUS_MODES } from "@/lib/utils";
import { useStudyStore } from "@/lib/store";
import { THEMES, applyTheme, type ThemeId } from "@/lib/themes";

const useSettings = () => useStudyStore((s) => s.data.settings);
const useSubjects = () => useStudyStore((s) => s.data.subjects);
const useSessions = () => useStudyStore((s) => s.data.sessions);
const useTasks = () => useStudyStore((s) => s.data.tasks);
const useHabits = () => useStudyStore((s) => s.data.habits);
const useGoals = () => useStudyStore((s) => s.data.goals);
const useSetData = () => useStudyStore((s) => s.setData);
const useFullData = () => useStudyStore((s) => s.data);

type SettingsTab = "timer" | "audio" | "notifications" | "theme" | "data";

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "timer", label: "Focus Timer", icon: Timer },
  { id: "audio", label: "Audio & Sound", icon: Volume2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "theme", label: "Theme & Display", icon: Monitor },
  { id: "data", label: "Data Management", icon: Database },
];

function Stepper({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const safe = Number.isFinite(value) ? value : min;
  return (
    <div className="b-s-stepper">
      <button
        className="b-s-stepper-btn"
        onClick={() => onChange(Math.max(min, safe - step))}
        disabled={safe <= min}
      >
        <ChevronDown size={14} />
      </button>
      <div className="b-s-stepper-value">
        <span className="b-s-stepper-num" style={{ fontVariantNumeric: "tabular-nums" }}>{safe}</span>
        <span className="b-s-stepper-unit">{unit}</span>
      </div>
      <button
        className="b-s-stepper-btn"
        onClick={() => onChange(Math.min(max, safe + step))}
        disabled={safe >= max}
      >
        <ChevronUp size={14} />
      </button>
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="b-s-toggle-row" onClick={() => onChange(!enabled)}>
      <div className="b-s-toggle-info">
        <span className="b-s-toggle-label">{label}</span>
        {description && <span className="b-s-toggle-desc">{description}</span>}
      </div>
      <button className={`b-s-toggle ${enabled ? "b-s-toggle-on" : ""}`}>
        <div className="b-s-toggle-thumb" />
      </button>
    </div>
  );
}

function HotkeyInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let key = e.key;
      if (key === " ") key = "Space";
      else if (key === "Escape") {
        setListening(false);
        return;
      }
      else if (key.length === 1) key = key.toUpperCase();
      else if (key === "Control") key = "Ctrl";
      else key = key.charAt(0).toUpperCase() + key.slice(1);

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.metaKey) parts.push("Meta");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (!["Control", "Meta", "Alt", "Shift"].includes(e.key)) parts.push(key);

      onChange(parts.join("+"));
      setListening(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [listening, onChange]);

  return (
    <div className="b-s-hotkey-row">
      <span className="b-s-hotkey-label">{label}</span>
      <button
        ref={inputRef}
        className={`b-s-hotkey-input ${listening ? "b-s-hotkey-listening" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setListening(!listening);
        }}
      >
        {listening ? "Press a key..." : value}
      </button>
    </div>
  );
}

export default function SettingsView() {
  const settings = useSettings();
  const subjects = useSubjects();
  const sessions = useSessions();
  const tasks = useTasks();
  const habits = useHabits();
  const goals = useGoals();
  const setData = useSetData();
  const data = useFullData();
  const [activeTab, setActiveTab] = useState<SettingsTab>("timer");
  const s = settings;

  const update = useCallback(
    (patch: Partial<typeof settings>) => {
      setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
    },
    [setData]
  );

  // Audio test helpers
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = useCallback(() => {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
      return audioCtxRef.current;
    }
    audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  }, []);

  const playTestTone = useCallback(
    (freq: number, duration: number) => {
      try {
        const ac = getAudioCtx();
        const now = ac.currentTime + 0.01;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime((s.audioVolume / 100) * 0.3, now + 0.02);
        gain.gain.setValueAtTime((s.audioVolume / 100) * 0.3, now + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(now);
        osc.stop(now + duration);
      } catch {
        /* Web Audio unavailable */
      }
    },
    [getAudioCtx, s.audioVolume]
  );

  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studyos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const importData = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as StudyData;
          if (parsed && parsed.subjects && parsed.tasks) {
            setData(parsed);
          }
        } catch {
          /* invalid JSON */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setData]);

  const clearAllData = useCallback(() => {
    setData({
      subjects: [],
      tasks: [],
      habits: [],
      goals: [],
      sessions: [],
      settings: settings,
    });
  }, [setData, settings]);

  const clearCache = useCallback(() => {
    localStorage.removeItem("studyos_data");
    window.location.reload();
  }, []);

  const STORAGE_KEY = "studyos_data";
  const cacheSize = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY)?.length ?? 0 : 0;
  const cacheSizeKB = (cacheSize * 2 / 1024).toFixed(1);

  return (
    <div className="b-s" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="b-s-header">
        <div className="b-s-header-left">
          <Settings size={16} style={{ color: "#e8a33d" }} />
          <span className="b-s-title">SETTINGS</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="b-s-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`b-s-tab ${activeTab === tab.id ? "b-s-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="b-s-content">

        {/* ═══ FOCUS TIMER ═══ */}
        {activeTab === "timer" && (
          <div className="b-s-panel">
            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">TIMER DURATIONS</span>
                <span className="b-s-section-sub">Customize work and break intervals</span>
              </div>
              <div className="b-s-grid">
                <div className="b-s-field">
                  <label className="b-s-label">Focus Duration</label>
                  <Stepper value={s.focusWork} min={5} max={120} step={5} unit="min" onChange={(v) => update({ focusWork: v })} />
                </div>
                <div className="b-s-field">
                  <label className="b-s-label">Short Break</label>
                  <Stepper value={s.shortBreak} min={1} max={30} step={1} unit="min" onChange={(v) => update({ shortBreak: v })} />
                </div>
                <div className="b-s-field">
                  <label className="b-s-label">Long Break</label>
                  <Stepper value={s.longBreak} min={5} max={60} step={5} unit="min" onChange={(v) => update({ longBreak: v })} />
                </div>
                <div className="b-s-field">
                  <label className="b-s-label">Long Break Interval</label>
                  <Stepper value={s.longBreakInterval} min={2} max={10} step={1} unit="sessions" onChange={(v) => update({ longBreakInterval: v })} />
                </div>
              </div>
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">AUTO-START</span>
              </div>
              <Toggle
                label="Auto-start focus sessions"
                description="Automatically begin the next focus session after a break"
                enabled={s.autoStartFocus}
                onChange={(v) => update({ autoStartFocus: v })}
              />
              <Toggle
                label="Auto-start breaks"
                description="Automatically begin the break after a focus session completes"
                enabled={s.autoStartBreak}
                onChange={(v) => update({ autoStartBreak: v })}
              />
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">PRESET MODES</span>
                <span className="b-s-section-sub">Built-in timer configurations</span>
              </div>
              <div className="b-s-preset-grid">
                {Object.entries(FOCUS_MODES).map(([key, mode]) => (
                  <div key={key} className="b-s-preset-card">
                    <span className="b-s-preset-name">{mode.label}</span>
                    <span className="b-s-preset-detail">{mode.work}m work / {mode.rest}m break</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ AUDIO & SOUND ═══ */}
        {activeTab === "audio" && (
          <div className="b-s-panel">
            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">VOLUME</span>
              </div>
              <div className="b-s-volume-row">
                <Volume2 size={14} style={{ color: "#5a5e78", flexShrink: 0 }} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={s.audioVolume}
                  onChange={(e) => update({ audioVolume: Number(e.target.value) })}
                  className="b-s-slider"
                />
                <span className="b-s-volume-val">{Number.isFinite(s.audioVolume) ? s.audioVolume : 70}%</span>
              </div>
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">SOUND EFFECTS</span>
              </div>
              <Toggle
                label="Completion chime"
                description="Play a chime when a focus or break session ends"
                enabled={s.completionChime}
                onChange={(v) => update({ completionChime: v })}
              />
              <Toggle
                label="Warning tick"
                description="Play a tick for the last 5 seconds of each session"
                enabled={s.warningTick}
                onChange={(v) => update({ warningTick: v })}
              />
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">TEST TONES</span>
                <span className="b-s-section-sub">Click to preview synthesized sounds</span>
              </div>
              <div className="b-s-tone-grid">
                {[
                  { label: "Low", freq: 220, desc: "220 Hz" },
                  { label: "Mid", freq: 440, desc: "440 Hz" },
                  { label: "High", freq: 880, desc: "880 Hz" },
                  { label: "Bell", freq: 1319, desc: "1319 Hz" },
                ].map((tone) => (
                  <button
                    key={tone.label}
                    className="b-s-tone-card"
                    onClick={() => playTestTone(tone.freq, 0.4)}
                  >
                    <span className="b-s-tone-label">{tone.label}</span>
                    <span className="b-s-tone-freq">{tone.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ NOTIFICATIONS ═══ */}
        {activeTab === "notifications" && (
          <div className="b-s-panel">
            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">DESKTOP NOTIFICATIONS</span>
              </div>
              <Toggle
                label="Enable notifications"
                description="Show system notifications when sessions complete while the tab is in the background"
                enabled={s.notificationsEnabled}
                onChange={(v) => {
                  update({ notificationsEnabled: v });
                  if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
                    Notification.requestPermission();
                  }
                }}
              />
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">PERMISSION STATUS</span>
              </div>
              <div className="b-s-permission-row">
                <span className="b-s-permission-label">Notification.permission</span>
                <span className={`b-s-permission-badge b-s-permission-${typeof Notification !== "undefined" ? Notification.permission : "unavailable"}`}>
                  {typeof Notification !== "undefined" ? Notification.permission : "unavailable"}
                </span>
              </div>
              {typeof Notification !== "undefined" && Notification.permission === "default" && (
                <button
                  className="b-s-action-btn"
                  onClick={() => Notification.requestPermission()}
                >
                  Request Permission
                </button>
              )}
              {typeof Notification !== "undefined" && Notification.permission === "denied" && (
                <div className="b-s-hint">
                  Notifications are blocked. Enable them in your browser settings for this site.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ THEME & DISPLAY ═══ */}
        {activeTab === "theme" && (
          <div className="b-s-panel">
            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">APPEARANCE</span>
                <span className="b-s-section-sub">Select a study-focused theme</span>
              </div>
              <div className="b-s-theme-grid b-s-theme-grid-expanded">
                {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                  const t = THEMES[id];
                  const isActive = s.theme === id;
                  return (
                    <button
                      key={id}
                      className={`b-s-theme-card ${isActive ? "b-s-theme-card-active" : ""}`}
                      onClick={() => {
                        update({ theme: id });
                        applyTheme(id);
                      }}
                    >
                      <div
                        className="b-s-theme-preview"
                        style={{ background: t.preview.bg }}
                      >
                        <div className="b-s-theme-preview-row">
                          <div className="b-s-theme-swatch" style={{ background: t.preview.accent }} />
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                            <div className="b-s-theme-bar" style={{ background: t.preview.surface, width: "100%" }} />
                            <div className="b-s-theme-bar" style={{ background: t.preview.surface, width: "60%" }} />
                          </div>
                        </div>
                        <div className="b-s-theme-preview-bottom">
                          <div className="b-s-theme-bar" style={{ background: t.preview.accent, width: 24, height: 3 }} />
                          <div className="b-s-theme-bar" style={{ background: t.preview.surface, width: 40, height: 3 }} />
                        </div>
                      </div>
                      <div className="b-s-theme-meta">
                        <span className="b-s-theme-label" style={isActive ? { color: t.preview.accent } : undefined}>{t.label}</span>
                        <span className="b-s-theme-desc">{t.description}</span>
                      </div>
                      {isActive && <div className="b-s-theme-active-dot" style={{ background: t.preview.accent }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ DATA MANAGEMENT ═══ */}
        {activeTab === "data" && (
          <div className="b-s-panel">
            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">EXPORT</span>
                <span className="b-s-section-sub">Back up your study data</span>
              </div>
              <motion.button className="b-s-action-btn b-s-action-primary" onClick={exportData} whileTap={{ scale: 0.96 }}>
                <Download size={13} />
                Export as JSON
              </motion.button>
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">IMPORT</span>
                <span className="b-s-section-sub">Restore from a backup file</span>
              </div>
              <motion.button className="b-s-action-btn" onClick={importData} whileTap={{ scale: 0.96 }}>
                <Upload size={13} />
                Import JSON
              </motion.button>
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">CACHE</span>
              </div>
              <div className="b-s-cache-info">
                <span className="b-s-cache-label">Local storage used</span>
                <span className="b-s-cache-val">{cacheSizeKB} KB</span>
              </div>
              <motion.button className="b-s-action-btn b-s-action-danger" onClick={clearCache} whileTap={{ scale: 0.96 }}>
                <Trash2 size={13} />
                Clear Local Cache
              </motion.button>
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">DANGER ZONE</span>
              </div>
              <div className="b-s-danger-box">
                <span className="b-s-danger-text">
                  This will remove all sessions, tasks, habits, goals, and subjects.
                  This action cannot be undone.
                </span>
                <motion.button className="b-s-action-btn b-s-action-danger" onClick={clearAllData} whileTap={{ scale: 0.96 }}>
                  <Trash2 size={13} />
                  Clear All Data
                </motion.button>
              </div>
            </div>

            <div className="b-s-section">
              <div className="b-s-section-header">
                <span className="b-s-section-title">STORAGE INFO</span>
              </div>
              <div className="b-s-info-grid">
                <div className="b-s-info-row">
                  <span className="b-s-info-label">Subjects</span>
                  <span className="b-s-info-val">{subjects.length}</span>
                </div>
                <div className="b-s-info-row">
                  <span className="b-s-info-label">Tasks</span>
                  <span className="b-s-info-val">{tasks.length}</span>
                </div>
                <div className="b-s-info-row">
                  <span className="b-s-info-label">Sessions</span>
                  <span className="b-s-info-val">{sessions.length}</span>
                </div>
                <div className="b-s-info-row">
                  <span className="b-s-info-label">Habits</span>
                  <span className="b-s-info-val">{habits.length}</span>
                </div>
                <div className="b-s-info-row">
                  <span className="b-s-info-label">Goals</span>
                  <span className="b-s-info-val">{goals.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
