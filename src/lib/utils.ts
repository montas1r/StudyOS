import type { StudyData } from "@/types/studyos";

export const PALETTE = [
  "#E8A33D",
  "#6FA8DC",
  "#6FBF8B",
  "#A98FE0",
  "#4FBDBA",
  "#E1614B",
] as const;

export const MASTERY_LABELS = [
  "Never studied",
  "Familiar",
  "Basic",
  "Good",
  "Strong",
  "Mastered",
] as const;

export const PRIORITIES: { id: "critical" | "high" | "medium" | "low"; label: string; color: string }[] = [
  { id: "critical", label: "Critical", color: "#E1614B" },
  { id: "high", label: "High", color: "#E8A33D" },
  { id: "medium", label: "Medium", color: "#D8C15A" },
  { id: "low", label: "Low", color: "#6FBF8B" },
];

export const TASK_STATUSES: { id: "todo" | "in_progress" | "done"; label: string }[] = [
  { id: "todo", label: "Planned" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Completed" },
];

export const FOCUS_MODES: Record<string, { label: string; work: number; rest: number }> = {
  pomodoro: { label: "Pomodoro", work: 25, rest: 5 },
  short: { label: "Short focus", work: 15, rest: 5 },
  deep: { label: "Deep work", work: 50, rest: 10 },
  long: { label: "Long session", work: 90, rest: 20 },
};

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const TERMS: { id: "long" | "medium" | "short"; label: string }[] = [
  { id: "long", label: "Long-term" },
  { id: "medium", label: "Medium-term" },
  { id: "short", label: "Short-term" },
];

export function uid(): string {
  return crypto.randomUUID();
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isoWeekday(d: Date): number {
  const wd = d.getDay();
  return wd === 0 ? 6 : wd - 1;
}

export function fmtMin(mins: number): string {
  mins = Math.round(mins || 0);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function last7Days(): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dateStr(d));
  }
  return out;
}

export function currentWeekDates(): string[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - isoWeekday(now));
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(dateStr(d));
  }
  return out;
}

export function defaultData(): StudyData {
  const s1 = uid(),
    s2 = uid(),
    s3 = uid();
  return {
    subjects: [
      {
        id: s1,
        name: "Mathematics",
        color: PALETTE[0],
        mastery: 2,
        topics: [
          { id: uid(), name: "Integration", done: false },
          { id: uid(), name: "Algebra", done: true },
        ],
      },
      {
        id: s2,
        name: "Physics",
        color: PALETTE[1],
        mastery: 1,
        topics: [{ id: uid(), name: "Mechanics", done: false }],
      },
      {
        id: s3,
        name: "Biology",
        color: PALETTE[2],
        mastery: 3,
        topics: [{ id: uid(), name: "Genetics", done: false }],
      },
    ],
    tasks: [
      {
        id: uid(),
        title: "Finish integration problem set",
        subjectId: s1,
        priority: "high",
        status: "in_progress",
        estMin: 60,
        actualMin: 25,
        deadline: "",
        category: "dev" as const,
        subtasks: [
          { id: uid(), title: "Differentiation basics", done: true },
          { id: uid(), title: "Chain rule problems", done: true },
          { id: uid(), title: "Integration by parts", done: false },
          { id: uid(), title: "Definite integrals", done: false },
        ],
        collapsed: false,
      },
      {
        id: uid(),
        title: "Read mechanics chapter 4",
        subjectId: s2,
        priority: "medium",
        status: "todo",
        estMin: 45,
        actualMin: 0,
        deadline: "",
        category: "core" as const,
        subtasks: [],
        collapsed: false,
      },
    ],
    habits: [
      { id: uid(), name: "Study", freq: "daily", log: {} },
      { id: uid(), name: "Revision", freq: "daily", log: {} },
    ],
    goals: [
      {
        id: uid(),
        title: "Finish Mathematics syllabus",
        term: "medium",
        progress: 40,
        deadline: "",
      },
      {
        id: uid(),
        title: "University admission",
        term: "long",
        progress: 20,
        deadline: "",
      },
    ],
    sessions: [],
    settings: {
      dailyGoalMinutes: 300,
      focusWork: 25,
      shortBreak: 5,
      longBreak: 15,
      longBreakInterval: 4,
      autoStartFocus: false,
      autoStartBreak: false,
      audioVolume: 70,
      completionChime: true,
      warningTick: true,
      notificationsEnabled: true,
      theme: "dark" as const,
      hotkeyPlayPause: "Space",
      hotkeyReset: "r",
      hotkeySkip: "s",
    },
  };
}
