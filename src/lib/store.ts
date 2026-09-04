import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { StudyData, Session } from "@/types/studyos";
import { loadStudyDataSync, loadStudyData, saveStudyData, flushStorage, setStorageScope } from "@/lib/storage";
import { signOutUser, type AuthUser } from "@/lib/supabase";
import { defaultData, todayStr } from "@/lib/utils";

interface StudyStore {
  data: StudyData;
  loaded: boolean;
  user: AuthUser | null;
  authReady: boolean;
  setData: (action: StudyData | ((prev: StudyData) => StudyData)) => void;
  /** Sync the authenticated user. Changing user swaps the storage scope and reloads that user's data. */
  setAuthUser: (user: AuthUser | null) => void;
  signOut: () => Promise<void>;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

const lightData = loadStudyDataSync();
const defaults = defaultData();

/* Stable module-level fallback references — never create new refs inline */
const EMPTY_SESSIONS = defaults.sessions ?? [];
const EMPTY_SUBJECTS = defaults.subjects;
const EMPTY_TASKS = defaults.tasks;
const EMPTY_HABITS = defaults.habits;
const EMPTY_GOALS = defaults.goals;
const EMPTY_SETTINGS = defaults.settings;

export const useStudyStore = create<StudyStore>((set, get) => ({
  data: {
    subjects: lightData?.subjects ?? defaults.subjects,
    tasks: lightData?.tasks ?? defaults.tasks,
    habits: lightData?.habits ?? defaults.habits,
    goals: lightData?.goals ?? defaults.goals,
    sessions: [],
    settings: lightData?.settings ?? defaults.settings,
  },
  loaded: false,
  user: null,
  authReady: false,

  setData: (action) => {
    set((state) => ({
      data: typeof action === "function" ? (action as (prev: StudyData) => StudyData)(state.data) : action,
    }));
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => saveStudyData(get().data), 400);
  },

  setAuthUser: (user) => {
    const prev = get().user;
    const sameScope = (prev?.id ?? null) === (user?.id ?? null);
    if (sameScope) {
      // Same account (or both signed out) — no data swap, just sync the user.
      set({ user, authReady: true });
      return;
    }
    // Account changed — flush the outgoing scope's pending writes, switch
    // storage keys, then reload the new scope's data.
    flushStorage(get().data);
    set({ user, authReady: true, loaded: false });
    setStorageScope(user?.id ?? null);
    loadStudyData()
      .then((full) => {
        const normalized = { ...full, habits: normalizeHabits(full.habits) };
        useStudyStore.setState({ data: normalized, loaded: true });
      })
      .catch(() => useStudyStore.setState({ loaded: true }));
  },

  signOut: async () => {
    try {
      await signOutUser();
    } catch { /* ignore — still drop the local session */ }
    get().setAuthUser(null);
  },
}));

/* ── Habit log normalization ──────────────────────────────────────────────────
 * One-time pass run at init.  Ensures every key in a habit's `log` is a valid
 * YYYY-MM-DD string and that no stale / corrupt entries survive.  This makes
 * the old 7-day checks seamlessly visible inside the new 30-day grid.         */

const YYYYMMDD_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeHabits(habits: StudyData["habits"]): StudyData["habits"] {
  let changed = false;
  const out = habits.map((h) => {
    const keys = Object.keys(h.log);
    const cleanLog: Record<string, boolean> = {};
    for (const k of keys) {
      if (YYYYMMDD_RE.test(k)) {
        cleanLog[k] = !!h.log[k];
      } else {
        changed = true; // drop invalid key silently
      }
    }
    return changed ? { ...h, log: cleanLog } : h;
  });
  return changed ? out : habits;
}

export async function initStudyStore() {
  const full = await loadStudyData();

  // Normalize habit logs once on startup
  const normalized = { ...full, habits: normalizeHabits(full.habits) };

  useStudyStore.setState({ data: normalized, loaded: true });

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => flushStorage(useStudyStore.getState().data));
  }
}

/* ── Atomic selectors with defensive fallback defaults ── */
export const useSubjects = () => useStudyStore((s) => s.data?.subjects ?? EMPTY_SUBJECTS);
export const useTasks = () => useStudyStore((s) => s.data?.tasks ?? EMPTY_TASKS);
export const useHabits = () => useStudyStore((s) => s.data?.habits ?? EMPTY_HABITS);
export const useGoals = () => useStudyStore((s) => s.data?.goals ?? EMPTY_GOALS);
export const useSessions = () => useStudyStore((s) => s.data?.sessions ?? EMPTY_SESSIONS);
export const useSettings = () => useStudyStore((s) => s.data?.settings ?? EMPTY_SETTINGS);
export const useLoaded = () => useStudyStore((s) => s.loaded);
export const useSetData = () => useStudyStore((s) => s.setData);
export const useUser = () => useStudyStore((s) => s.user);
export const useAuthReady = () => useStudyStore((s) => s.authReady);
export const useSignOut = () => useStudyStore((s) => s.signOut);

/* ── Compound selectors – wrapped with useShallow for referential stability ── */
export const useTaskData = () => useStudyStore(
  useShallow((s) => ({
    tasks: s.data?.tasks ?? EMPTY_TASKS,
    subjects: s.data?.subjects ?? EMPTY_SUBJECTS,
  }))
);
export const useGoalData = () => useStudyStore(
  useShallow((s) => ({
    goals: s.data?.goals ?? EMPTY_GOALS,
    subjects: s.data?.subjects ?? EMPTY_SUBJECTS,
  }))
);
export const useHabitData = () => useStudyStore(
  useShallow((s) => ({
    habits: s.data?.habits ?? EMPTY_HABITS,
  }))
);
export const useSubjectData = () => useStudyStore(
  useShallow((s) => ({
    subjects: s.data?.subjects ?? EMPTY_SUBJECTS,
    sessions: s.data?.sessions ?? EMPTY_SESSIONS,
  }))
);
export const useAnalyticsData = () => useStudyStore(
  useShallow((s) => ({
    sessions: s.data?.sessions ?? EMPTY_SESSIONS,
    subjects: s.data?.subjects ?? EMPTY_SUBJECTS,
    tasks: s.data?.tasks ?? EMPTY_TASKS,
  }))
);
export const useSettingsData = () => useStudyStore(
  useShallow((s) => ({
    settings: s.data?.settings ?? EMPTY_SETTINGS,
    subjects: s.data?.subjects ?? EMPTY_SUBJECTS,
  }))
);
export const useDashboardData = () => useStudyStore(
  useShallow((s) => ({
    sessions: s.data?.sessions ?? EMPTY_SESSIONS,
    subjects: s.data?.subjects ?? EMPTY_SUBJECTS,
    tasks: s.data?.tasks ?? EMPTY_TASKS,
    habits: s.data?.habits ?? EMPTY_HABITS,
    goals: s.data?.goals ?? EMPTY_GOALS,
    settings: s.data?.settings ?? EMPTY_SETTINGS,
  }))
);

/* ── Day Streak helpers ── */

/** Count consecutive days of sessions ending at `endDate` (inclusive). */
function countConsecutiveFrom(sessions: Session[], endDate: Date): number {
  let s = 0;
  for (let i = 0; ; i++) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (sessions.some((sess) => sess.date === ds)) s++; else break;
    if (i > 365) break;
  }
  return s;
}

/** Find the offset (0 = today) of the most recent day that has sessions. */
function offsetOfMostRecentSession(sessions: Session[]): number {
  for (let i = 0; i <= 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (sessions.some((sess) => sess.date === ds)) return i;
  }
  return 366;
}

/** Compute streak & activation state for the FocusView.
 *  – If today has sessions → active streak (count includes today).
 *  – Otherwise → retain the streak count from the most recent
 *    day that *did* have sessions, displayed dimmed. */
export function computeStreak(sessions: Session[]): { streak: number; streakActive: boolean } {
  const today = todayStr();
  const todayHasSession = sessions.some((s) => s.date === today);
  if (todayHasSession) {
    return { streak: countConsecutiveFrom(sessions, new Date()), streakActive: true };
  }
  const offset = offsetOfMostRecentSession(sessions);
  if (offset > 365) return { streak: 0, streakActive: false };
  const anchor = new Date();
  anchor.setDate(anchor.getDate() - offset);
  return { streak: countConsecutiveFrom(sessions, anchor), streakActive: false };
}
