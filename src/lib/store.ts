import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { StudyData } from "@/types/studyos";
import { loadStudyDataSync, loadStudyData, saveStudyData, flushStorage } from "@/lib/storage";
import { defaultData } from "@/lib/utils";

interface StudyStore {
  data: StudyData;
  loaded: boolean;
  setData: (action: StudyData | ((prev: StudyData) => StudyData)) => void;
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

  setData: (action) => {
    set((state) => ({
      data: typeof action === "function" ? (action as (prev: StudyData) => StudyData)(state.data) : action,
    }));
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => saveStudyData(get().data), 400);
  },
}));

export async function initStudyStore() {
  const full = await loadStudyData();
  useStudyStore.setState({ data: full, loaded: true });

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
