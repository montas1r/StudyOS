"use client";

import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  User,
  LogOut,
  Download,
  Upload,
  Trash2,
  Database,
  Flame,
  Timer,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Copy,
  Check,
  UserPlus,
} from "lucide-react";
import { useStudyStore, useDashboardData, useUser, useSignOut, computeStreak } from "@/lib/store";
import { fmtMin } from "@/lib/utils";
import type { StudyData } from "@/types/studyos";

export default function ProfileView() {
  const { sessions, tasks } = useDashboardData();
  const user = useUser();
  const signOut = useSignOut();
  const [copied, setCopied] = useState(false);

  /* ── Stats ── */
  const totalFocusMin = useMemo(() => sessions?.reduce((a, s) => a + s.minutes, 0) ?? 0, [sessions]);
  const sessionsCount = sessions?.length ?? 0;
  const tasksDone = tasks?.filter((t) => t.status === "done").length ?? 0;
  const tasksTotal = tasks?.length ?? 0;
  const streak = useMemo(() => computeStreak(sessions ?? []), [sessions]);

  /* ── Storage used by this account's local data ── */
  const storageKB = useMemo(() => {
    if (typeof window === "undefined") return "0.0";
    let bytes = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("studyos_")) {
        bytes += (window.localStorage.getItem(k)?.length ?? 0) * 2;
      }
    }
    return (bytes / 1024).toFixed(1);
  }, [sessions]);

  /* ── Data management ── */
  const exportData = useCallback(() => {
    const data = useStudyStore.getState().data;
    const blob = new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studyos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

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
          if (parsed && Array.isArray(parsed.subjects) && Array.isArray(parsed.tasks)) {
            useStudyStore.getState().setData(parsed);
          }
        } catch {
          /* invalid JSON */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const clearAllData = useCallback(() => {
    useStudyStore.getState().setData((d) => ({
      subjects: [],
      tasks: [],
      habits: [],
      goals: [],
      sessions: [],
      settings: d.settings,
    }));
  }, []);

  const clearCache = useCallback(() => {
    if (typeof window === "undefined") return;
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("studyos_")) window.localStorage.removeItem(k);
    }
    window.location.reload();
  }, []);

  const copyId = useCallback(async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [user]);

  const providerLabel =
    user?.provider && user.provider !== "email"
      ? user.provider.charAt(0).toUpperCase() + user.provider.slice(1)
      : "Password";

  return (
    <div className="b-p" style={{ minHeight: 0 }}>
      {/* ═══ HEADER ═══ */}
      <div className="b-p-header">
        <div className="b-p-header-left">
          <User size={16} style={{ color: "var(--amber)" }} />
          <span className="b-p-title">PROFILE</span>
        </div>
        {user && (
          <span className="b-p-header-badge">
            <ShieldCheck size={12} />
            {user.provider ? "Synced account" : "Local account"}
          </span>
        )}
      </div>

      {/* ═══ PROFILE CARD ═══ */}
      <div className="b-p-card b-p-profile">
        {user ? (
          <>
            <div className="b-p-avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name ?? "avatar"} />
              ) : (
                <span>{(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="b-p-profile-info">
              <div className="b-p-profile-top">
                <span className="b-p-name">{user.name ?? "No name set"}</span>
                <span className="b-p-chip">{providerLabel}</span>
              </div>
              <span className="b-p-email">{user.email ?? "No email on file"}</span>
              <button type="button" className="b-p-id" onClick={copyId} title="Copy user ID">
                <span className="b-p-id-mono">{user.id.slice(0, 8)}…{user.id.slice(-4)}</span>
                {copied ? <Check size={11} style={{ color: "var(--green)" }} /> : <Copy size={11} />}
              </button>
            </div>
            <div className="b-p-profile-action">
              <motion.button
                className="b-p-btn b-p-btn-danger"
                onClick={() => { void signOut(); }}
                whileTap={{ scale: 0.96 }}
              >
                <LogOut size={13} />
                Sign Out
              </motion.button>
            </div>
          </>
        ) : (
          <>
            <div className="b-p-avatar">
              <span>◈</span>
            </div>
            <div className="b-p-profile-info">
              <div className="b-p-profile-top">
                <span className="b-p-name">Local mode</span>
                <span className="b-p-chip">Guest</span>
              </div>
              <span className="b-p-email">No account — data stays on this device only</span>
              <span className="b-p-isolation">
                Sign in to keep this device's data under your own account and keep it separate from other accounts.
              </span>
            </div>
            <div className="b-p-profile-action">
              <Link to="/login" className="b-p-btn b-p-btn-primary">
                <UserPlus size={13} />
                Sign in / Create account
              </Link>
            </div>
          </>
        )}
      </div>

      {/* ═══ STATS ═══ */}
      <div className="b-p-section-title">FOCUS STATS</div>
      <div className="b-p-stats">
        <div className="b-p-stat">
          <div className="b-p-stat-icon" style={{ color: "#f59e0b" }}><TrendingUp size={15} /></div>
          <div className="b-p-stat-body">
            <div className="b-p-stat-value">{fmtMin(totalFocusMin)}</div>
            <div className="b-p-stat-label">Total Focus</div>
          </div>
        </div>
        <div className="b-p-stat">
          <div className="b-p-stat-icon" style={{ color: "#22c55e" }}><CheckCircle2 size={15} /></div>
          <div className="b-p-stat-body">
            <div className="b-p-stat-value">{sessionsCount}</div>
            <div className="b-p-stat-label">Sessions</div>
          </div>
        </div>
        <div className="b-p-stat">
          <div className="b-p-stat-icon" style={{ color: "#ef4444" }}><Flame size={15} /></div>
          <div className="b-p-stat-body">
            <div className="b-p-stat-value">
              {streak.streak}
              <span className="b-p-stat-unit"> D</span>
            </div>
            <div className="b-p-stat-label">Active Streak</div>
          </div>
        </div>
        <div className="b-p-stat">
          <div className="b-p-stat-icon" style={{ color: "#3b82f6" }}><Timer size={15} /></div>
          <div className="b-p-stat-body">
            <div className="b-p-stat-value">
              {tasksDone}
              <span className="b-p-stat-unit">/{tasksTotal}</span>
            </div>
            <div className="b-p-stat-label">Tasks Cleared</div>
          </div>
        </div>
      </div>

      {/* ═══ STORAGE ═══ */}
      <div className="b-p-section-title">STORAGE</div>
      <div className="b-p-card b-p-storage">
        <div className="b-p-storage-row">
          <Database size={14} style={{ color: "var(--text-dim)" }} />
          <span className="b-p-storage-label">Local data used by this account</span>
          <span className="b-p-storage-val">{storageKB} KB</span>
        </div>
        <div className="b-p-storage-row">
          <CheckCircle2 size={14} style={{ color: "var(--text-dim)" }} />
          <span className="b-p-storage-label">Session records (IndexedDB)</span>
          <span className="b-p-storage-val">{sessionsCount}</span>
        </div>
        <span className="b-p-isolation">
          Your data is stored under {user ? "your account" : "guest mode"} and stays separate from other accounts on
          this device.
        </span>
      </div>

      {/* ═══ DATA & PRIVACY ═══ */}
      <div className="b-p-section-title">DATA &amp; PRIVACY</div>
      <div className="b-p-card b-p-actions">
        <div className="b-p-actions-grid">
          <motion.button className="b-p-btn b-p-btn-primary" onClick={exportData} whileTap={{ scale: 0.96 }}>
            <Download size={13} />
            Export JSON
          </motion.button>
          <motion.button className="b-p-btn" onClick={importData} whileTap={{ scale: 0.96 }}>
            <Upload size={13} />
            Import JSON
          </motion.button>
        </div>
        <div className="b-p-danger-box">
          <span className="b-p-danger-text">
            Clear all sessions, tasks, habits, goals, and subjects for {user ? "this account" : "guest mode"}.
            This cannot be undone.
          </span>
          <motion.button className="b-p-btn b-p-btn-danger" onClick={clearAllData} whileTap={{ scale: 0.96 }}>
            <Trash2 size={13} />
            Clear All Data
          </motion.button>
        </div>
        <motion.button className="b-p-btn b-p-btn-danger b-p-clear-cache" onClick={clearCache} whileTap={{ scale: 0.96 }}>
          <Trash2 size={13} />
          Clear Local Cache
        </motion.button>
      </div>
    </div>
  );
}