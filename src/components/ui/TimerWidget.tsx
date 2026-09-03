"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

export interface TimerWidgetProps {
  /** Current countdown seconds */
  remaining: number;
  /** Total phase duration in seconds */
  totalSeconds: number;
  /** Current phase */
  phase: "work" | "rest";
  /** Whether timer is running */
  isRunning: boolean;
  /** Session number (1-indexed, unbounded) */
  sessionNum: number;
  /** Focus minutes for current mode */
  focusMin: number;
  /** Break minutes for current mode */
  breakMin: number;
  /** Accent color */
  accentColor: string;
  /** Subject name (optional) */
  subjectName?: string;
  /** Total focus time formatted string */
  totalFocusFormatted: string;
  /** Play/Pause callback */
  onPlayPause: () => void;
  /** Reset callback */
  onReset: () => void;
  /** Skip callback */
  onSkip: () => void;
  /** Phase label */
  phaseLabel: string;
  /** Long break duration in minutes */
  longBreakMin: number;
  /** Callback when work duration is edited */
  onEditWorkDuration: (minutes: number) => void;
  /** Callback when short break duration is edited */
  onEditShortBreak: (minutes: number) => void;
  /** Callback when long break duration is edited */
  onEditLongBreak: (minutes: number) => void;
}

function AnimatedDigit({ digit, color }: { digit: string; color: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={digit}
        layout
        initial={{ y: -12, opacity: 0, filter: "blur(4px)" }}
        animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
        exit={{ y: 12, opacity: 0, filter: "blur(4px)" }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        style={{ display: "inline-block", minWidth: "0.6em", textAlign: "center", color }}
      >
        {digit}
      </motion.span>
    </AnimatePresence>
  );
}

function AnimatedColon({ color }: { color: string }) {
  return (
    <motion.span
      animate={{ opacity: [0.8, 0.2] }}
      transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
      style={{ display: "inline-block", minWidth: "0.3em", textAlign: "center", color }}
    >
      :
    </motion.span>
  );
}

function EditableDuration({
  value,
  color,
  disabled,
  onSave,
}: {
  value: number;
  color: string;
  disabled: boolean;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= 1) onSave(n);
    else setDraft(String(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="tw-metric-input"
        type="number"
        min={1}
        max={180}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        style={{ color, border: `1px solid ${color}` }}
      />
    );
  }

  return (
    <span
      className="tw-metric-val tw-metric-val-editable"
      style={{ color }}
      data-disabled={disabled || undefined}
      onClick={() => { if (!disabled) setEditing(true); }}
    >
      {value}m
    </span>
  );
}

export default function TimerWidget({
  remaining,
  totalSeconds,
  phase,
  isRunning,
  sessionNum,
  focusMin,
  breakMin,
  accentColor,
  subjectName,
  totalFocusFormatted,
  onPlayPause,
  onReset,
  onSkip,
  phaseLabel,
  longBreakMin,
  onEditWorkDuration,
  onEditShortBreak,
  onEditLongBreak,
}: TimerWidgetProps) {
  const progress = totalSeconds > 0 ? 1 - remaining / totalSeconds : 0;
  const pct = Math.min(100, Math.max(0, progress * 100));

  const minutes = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(remaining % 60)
    .toString()
    .padStart(2, "0");

  const minDigits = useMemo(() => minutes.split(""), [minutes]);
  const secDigits = useMemo(() => seconds.split(""), [seconds]);

  const pomBlocks = useMemo(() => {
    const max = 8;
    const count = Math.min(sessionNum, max);
    return Array.from({ length: max }, (_, i) => i < count);
  }, [sessionNum]);

  return (
    <LayoutGroup>
      <motion.div
        className="tw-card"
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        {/* ── Top bar: phase label + session pill ── */}
        <div className="tw-header">
          <div className="tw-phase-row">
            <motion.span
              className="tw-phase-label"
              key={phase}
              initial={{ x: -8, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 24 }}
              style={{ color: accentColor }}
            >
              {phaseLabel}
            </motion.span>
            <div className="tw-session-pill" style={{ borderColor: accentColor }}>
              <span style={{ color: accentColor }}>SESSION</span>
              <span className="tw-session-num" style={{ color: accentColor }}>{sessionNum}</span>
            </div>
          </div>

          {/* ── Pom block indicators ── */}
          <div className="tw-pom-blocks">
            {pomBlocks.map((filled, i) => (
              <motion.div
                key={i}
                className="tw-pom-block"
                animate={{
                  backgroundColor: filled ? accentColor : "#1a1d2e",
                  scaleX: filled ? 1.1 : 1,
                }}
                transition={{ type: "spring", stiffness: 500, damping: 20, delay: i * 0.04 }}
              />
            ))}
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="tw-progress-track">
          <motion.div
            className="tw-progress-fill"
            style={{ backgroundColor: accentColor }}
            animate={{ width: `${pct}%` }}
            transition={{ type: "tween", duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* ── Main countdown ── */}
        <div className="tw-countdown-wrap">
          <div className="tw-countdown" style={{ color: accentColor }}>
            {minDigits.map((d, i) => (
              <AnimatedDigit key={`m${i}`} digit={d} color={accentColor} />
            ))}
            <AnimatedColon color={accentColor} />
            {secDigits.map((d, i) => (
              <AnimatedDigit key={`s${i}`} digit={d} color={accentColor} />
            ))}
          </div>
        </div>

        {/* ── Phase metrics row ── */}
        <div className="tw-metrics-row">
          <div className="tw-metric">
            <div className="tw-metric-dot" style={{ backgroundColor: accentColor }} />
            <EditableDuration
              value={focusMin}
              color={accentColor}
              disabled={isRunning}
              onSave={onEditWorkDuration}
            />
            <span className="tw-metric-lbl">FOCUS</span>
          </div>
          <div className="tw-metric-sep" />
          <div className="tw-metric">
            <div className="tw-metric-dot" style={{ backgroundColor: "#6fbf8b" }} />
            <EditableDuration
              value={breakMin}
              color="#6fbf8b"
              disabled={isRunning}
              onSave={onEditShortBreak}
            />
            <span className="tw-metric-lbl">BREAK</span>
          </div>
          <div className="tw-metric-sep" />
          <div className="tw-metric">
            <div className="tw-metric-dot" style={{ backgroundColor: "#4fbdba" }} />
            <EditableDuration
              value={longBreakMin}
              color="#4fbdba"
              disabled={isRunning}
              onSave={onEditLongBreak}
            />
            <span className="tw-metric-lbl">LONG BREAK</span>
          </div>
        </div>

        {/* ── Subject + total focus ── */}
        {(subjectName || totalFocusFormatted) && (
          <div className="tw-footer-info">
            {subjectName && (
              <motion.span
                className="tw-subject-name"
                key={subjectName}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ color: accentColor }}
              >
                {subjectName}
              </motion.span>
            )}
            {totalFocusFormatted && (
              <span className="tw-total-focus">
                TOTAL <span style={{ color: "#edebe2" }}>{totalFocusFormatted}</span>
              </span>
            )}
          </div>
        )}

        {/* ── Controls ── */}
        <div className="tw-controls">
          <motion.button
            className="tw-ctrl-btn"
            onClick={onReset}
            whileHover={{ scale: 1.08, borderColor: "#e8a33d" }}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M3 12a9 9 0 1 1 3 6.93" />
              <polyline points="3 22 3 16 9 16" />
            </svg>
          </motion.button>

          <motion.button
            className="tw-ctrl-main"
            onClick={onPlayPause}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            style={{
              backgroundColor: isRunning ? "#1e2133" : accentColor,
              borderColor: accentColor,
              color: isRunning ? accentColor : "#0d0f18",
            }}
          >
            {isRunning ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            )}
          </motion.button>

          <motion.button
            className="tw-ctrl-btn"
            onClick={onSkip}
            whileHover={{ scale: 1.08, borderColor: "#e8a33d" }}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </motion.button>
        </div>

        {/* ── Keyboard hints ── */}
        <div className="tw-hotkeys">
          <span className="tw-hotkey">SPACE</span>
          <span className="tw-hotkey">R</span>
          <span className="tw-hotkey">S</span>
        </div>
      </motion.div>
    </LayoutGroup>
  );
}
