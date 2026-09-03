export interface Topic {
  id: string;
  name: string;
  done: boolean;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  mastery: number;
  topics: Topic[];
}

export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskCategory = "dev" | "design" | "core";
export type GoalTerm = "long" | "medium" | "short";

export interface Task {
  id: string;
  title: string;
  subjectId: string;
  priority: Priority;
  status: TaskStatus;
  estMin: number;
  actualMin: number;
  deadline: string;
  category: TaskCategory;
  subtasks: { id: string; title: string; done: boolean }[];
  collapsed: boolean;
}

export interface Habit {
  id: string;
  name: string;
  freq: string;
  log: Record<string, boolean>;
}

export interface Goal {
  id: string;
  title: string;
  term: GoalTerm;
  progress: number;
  deadline: string;
}

export interface Session {
  id: string;
  date: string;
  startTime: string;
  subjectId: string;
  minutes: number;
  mode: string;
  subtasksCompleted: number;
  distractionTags: string[];
}

export interface Settings {
  dailyGoalMinutes: number;
  focusWork: number;
  shortBreak: number;
  longBreak: number;
  longBreakInterval: number;
  autoStartFocus: boolean;
  autoStartBreak: boolean;
  audioVolume: number;
  completionChime: boolean;
  warningTick: boolean;
  notificationsEnabled: boolean;
  theme: "dark" | "light" | "cyberpunk" | "matcha" | "midnight" | "forest" | "espresso";
  hotkeyPlayPause: string;
  hotkeyReset: string;
  hotkeySkip: string;
}

export interface StudyData {
  subjects: Subject[];
  tasks: Task[];
  habits: Habit[];
  goals: Goal[];
  sessions: Session[];
  settings: Settings;
}

export type ViewId =
  | "dashboard"
  | "focus"
  | "tasks"
  | "habits"
  | "goals"
  | "subjects"
  | "analytics"
  | "settings";

export interface FocusMode {
  label: string;
  work: number;
  rest: number;
}

export type FocusPhase = "work" | "rest";

export interface PriorityDef {
  id: Priority;
  label: string;
  color: string;
}

export interface TaskStatusDef {
  id: TaskStatus;
  label: string;
}

export interface TermDef {
  id: GoalTerm;
  label: string;
}
