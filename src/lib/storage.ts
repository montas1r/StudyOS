import { get, set, del } from "idb-keyval";
import type { StudyData, Settings, Session, Task, Subject, Habit, Goal } from "@/types/studyos";
import { defaultData } from "./utils";

const LS_KEY = "studyos_light";
const IDB_SESSIONS_KEY = "studyos_sessions";

// ── Validators ──

function sanitizeSettings(raw: Partial<Settings> | undefined): Settings {
  const defaults = defaultData().settings;
  if (!raw) return defaults;
  return {
    dailyGoalMinutes: Number.isFinite(raw.dailyGoalMinutes) ? raw.dailyGoalMinutes! : defaults.dailyGoalMinutes,
    focusWork: Number.isFinite(raw.focusWork) ? raw.focusWork! : defaults.focusWork,
    shortBreak: Number.isFinite(raw.shortBreak) ? raw.shortBreak! : defaults.shortBreak,
    longBreak: Number.isFinite(raw.longBreak) ? raw.longBreak! : defaults.longBreak,
    longBreakInterval: Number.isFinite(raw.longBreakInterval) && raw.longBreakInterval! > 0 ? raw.longBreakInterval! : defaults.longBreakInterval,
    autoStartFocus: typeof raw.autoStartFocus === "boolean" ? raw.autoStartFocus : defaults.autoStartFocus,
    autoStartBreak: typeof raw.autoStartBreak === "boolean" ? raw.autoStartBreak : defaults.autoStartBreak,
    audioVolume: Number.isFinite(raw.audioVolume) ? raw.audioVolume! : defaults.audioVolume,
    completionChime: typeof raw.completionChime === "boolean" ? raw.completionChime : defaults.completionChime,
    warningTick: typeof raw.warningTick === "boolean" ? raw.warningTick : defaults.warningTick,
    notificationsEnabled: typeof raw.notificationsEnabled === "boolean" ? raw.notificationsEnabled : defaults.notificationsEnabled,
    theme: raw.theme === "dark" || raw.theme === "light" ? raw.theme : defaults.theme,
    hotkeyPlayPause: typeof raw.hotkeyPlayPause === "string" ? raw.hotkeyPlayPause : defaults.hotkeyPlayPause,
    hotkeyReset: typeof raw.hotkeyReset === "string" ? raw.hotkeyReset : defaults.hotkeyReset,
    hotkeySkip: typeof raw.hotkeySkip === "string" ? raw.hotkeySkip : defaults.hotkeySkip,
  };
}

function sanitizeSessions(raw: unknown): Session[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) => ({
    id: String(s?.id ?? ""),
    date: String(s?.date ?? ""),
    startTime: String(s?.startTime ?? ""),
    subjectId: String(s?.subjectId ?? ""),
    minutes: Number.isFinite(s?.minutes) ? Number(s.minutes) : 0,
    mode: String(s?.mode ?? "Pomodoro"),
    subtasksCompleted: Number.isFinite(s?.subtasksCompleted) ? Number(s.subtasksCompleted) : 0,
    distractionTags: Array.isArray(s?.distractionTags) ? s.distractionTags : [],
  }));
}

function sanitizeTasks(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t: any) => ({
    id: String(t?.id ?? ""),
    title: String(t?.title ?? ""),
    subjectId: String(t?.subjectId ?? ""),
    priority: ["critical", "high", "medium", "low"].includes(t?.priority) ? t.priority : "medium",
    status: ["todo", "in_progress", "done"].includes(t?.status) ? t.status : "todo",
    estMin: Number.isFinite(t?.estMin) ? Number(t.estMin) : 25,
    actualMin: Number.isFinite(t?.actualMin) ? Number(t.actualMin) : 0,
    deadline: String(t?.deadline ?? ""),
    category: ["dev", "design", "core"].includes(t?.category) ? t.category : "core",
    subtasks: Array.isArray(t?.subtasks)
      ? t.subtasks.map((st: any) => ({ id: String(st?.id ?? ""), title: String(st?.title ?? ""), done: Boolean(st?.done) }))
      : [],
    collapsed: Boolean(t?.collapsed),
  }));
}

function sanitizeSubjects(raw: unknown): Subject[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) => ({
    id: String(s?.id ?? ""),
    name: String(s?.name ?? ""),
    color: String(s?.color ?? "#9498b0"),
    mastery: Number.isFinite(s?.mastery) ? Number(s.mastery) : 0,
    topics: Array.isArray(s?.topics)
      ? s.topics.map((t: any) => ({ id: String(t?.id ?? ""), name: String(t?.name ?? ""), done: Boolean(t?.done) }))
      : [],
  }));
}

function sanitizeHabits(raw: unknown): Habit[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((h: any) => ({
    id: String(h?.id ?? ""),
    name: String(h?.name ?? ""),
    freq: String(h?.freq ?? "daily"),
    log: h?.log && typeof h.log === "object" ? h.log : {},
  }));
}

function sanitizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((g: any) => ({
    id: String(g?.id ?? ""),
    title: String(g?.title ?? ""),
    term: ["long", "medium", "short"].includes(g?.term) ? g.term : "medium",
    progress: Number.isFinite(g?.progress) ? Number(g.progress) : 0,
    deadline: String(g?.deadline ?? ""),
  }));
}

// ── localStorage (lightweight tier) ──

interface LightPayload {
  subjects: Subject[];
  tasks: Task[];
  habits: Habit[];
  goals: Goal[];
  settings: Settings;
}

function loadLight(): LightPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const defaults = defaultData();
    return {
      subjects: sanitizeSubjects(parsed.subjects ?? defaults.subjects),
      tasks: sanitizeTasks(parsed.tasks ?? defaults.tasks),
      habits: sanitizeHabits(parsed.habits ?? defaults.habits),
      goals: sanitizeGoals(parsed.goals ?? defaults.goals),
      settings: sanitizeSettings(parsed.settings as Partial<Settings> | undefined),
    };
  } catch {
    return null;
  }
}

function saveLight(data: LightPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

// ── IndexedDB (heavy tier) ──

async function loadSessions(): Promise<Session[]> {
  try {
    const raw = await get<unknown>(IDB_SESSIONS_KEY);
    return sanitizeSessions(raw);
  } catch {
    return [];
  }
}

async function saveSessions(sessions: Session[]): Promise<void> {
  try {
    await set(IDB_SESSIONS_KEY, sessions);
  } catch { /* quota exceeded */ }
}

// ── Public API ──

/**
 * Synchronous initial load — reads only localStorage (settings + entities).
 * Sessions are fetched async and merged after mount.
 */
export function loadStudyDataSync(): Omit<StudyData, "sessions"> | null {
  return loadLight();
}

/**
 * Full async load — reads localStorage synchronously, then IndexedDB for sessions.
 * Used during store initialization.
 */
export async function loadStudyData(): Promise<StudyData> {
  const light = loadLight();
  const sessions = await loadSessions();
  const defaults = defaultData();
  return {
    subjects: light?.subjects ?? defaults.subjects,
    tasks: light?.tasks ?? defaults.tasks,
    habits: light?.habits ?? defaults.habits,
    goals: light?.goals ?? defaults.goals,
    sessions,
    settings: light?.settings ?? defaults.settings,
  };
}

let lightTimer: ReturnType<typeof setTimeout> | null = null;
let sessionTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist study data — debounced writes split across tiers.
 * Light data (settings, subjects, tasks, habits, goals) → localStorage.
 * Heavy data (sessions) → IndexedDB.
 */
export function saveStudyData(data: StudyData): void {
  if (typeof window === "undefined") return;

  // Debounced localStorage write (400 ms)
  if (lightTimer) clearTimeout(lightTimer);
  lightTimer = setTimeout(() => {
    saveLight({
      subjects: data.subjects,
      tasks: data.tasks,
      habits: data.habits,
      goals: data.goals,
      settings: data.settings,
    });
  }, 400);

  // Debounced IndexedDB write (600 ms — slightly longer to avoid thrashing on rapid updates)
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    saveSessions(data.sessions);
  }, 600);
}

/**
 * Force-flush all pending writes immediately (e.g. on beforeunload).
 */
export function flushStorage(data: StudyData): void {
  if (lightTimer) { clearTimeout(lightTimer); lightTimer = null; }
  if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null; }
  saveLight({
    subjects: data.subjects,
    tasks: data.tasks,
    habits: data.habits,
    goals: data.goals,
    settings: data.settings,
  });
  saveSessions(data.sessions);
}
