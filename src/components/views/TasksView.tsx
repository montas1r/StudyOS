"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckSquare,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  List,
  LayoutGrid,
  Search,
  X,
  Clock,
  Pencil,
} from "lucide-react";
import type { Priority, TaskStatus, TaskCategory, Task } from "@/types/studyos";
import { PRIORITIES, TASK_STATUSES, uid, fmtMin } from "@/lib/utils";
import { useStudyStore } from "@/lib/store";

const useTasks = () => useStudyStore((s) => s.data.tasks);
const useSubjects = () => useStudyStore((s) => s.data.subjects);
const useSetData = () => useStudyStore((s) => s.setData);

const CATEGORIES: { id: TaskCategory; label: string; color: string }[] = [
  { id: "dev", label: "Dev", color: "#6FA8DC" },
  { id: "design", label: "Design", color: "#A98FE0" },
  { id: "core", label: "Core", color: "#6FBF8B" },
];

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const WIP_LIMITS: Record<string, number> = {
  todo: 12,
  in_progress: 4,
  done: 999,
};

function deadlineCountdown(deadline: string, now?: Date): string | null {
  if (!deadline) return null;
  const dl = new Date(deadline);
  const diffMs = dl.getTime() - (now ?? new Date()).getTime();
  if (diffMs < 0) return "Overdue";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days}d left`;
}

export default function TasksView() {
  const tasks = useTasks();
  const subjects = useSubjects();
  const setData = useSetData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Bumped on each "Add subtask" click so the inline input re-opens even for the same task
  const [subtaskFocusSignal, setSubtaskFocusSignal] = useState<{ taskId: string; n: number } | null>(null);

  // Quick-add state per column (kanban)
  const [quickAddCol, setQuickAddCol] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Drawer form state
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newCategory, setNewCategory] = useState<TaskCategory>("core");
  const [newEstMin, setNewEstMin] = useState(30);
  const [newDeadline, setNewDeadline] = useState("");
  const [newSubjectId, setNewSubjectId] = useState("");

  // SSR-safe "now" for deadline countdowns
  const nowRef = useRef<Date | null>(null);
  if (mounted && !nowRef.current) nowRef.current = new Date();
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const drawerRef = useRef(false);

  // Drag state for kanban
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => {
    drawerRef.current = drawerOpen;
  }, [drawerOpen]);

  // Keyboard shortcut for new task
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setDrawerOpen(true);
      }
      if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // Focus quick-add input
  useEffect(() => {
    if (quickAddCol && quickInputRef.current) {
      quickInputRef.current.focus();
    }
  }, [quickAddCol]);  
  // Filtered & sorted tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterStatus !== "all") {
      result = result.filter((t) => t.status === filterStatus);
    }
    if (filterCategory !== "all") {
      result = result.filter((t) => t.category === filterCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (subjects.find((s) => s.id === t.subjectId)?.name.toLowerCase().includes(q))
      );
    }
    return [...result].sort(
      (a, b) => (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9)
    );
  }, [tasks, filterStatus, filterCategory, searchQuery, subjects]);

  // Kanban columns
  const kanbanColumns = useMemo(() => {
    const cols: { id: TaskStatus; label: string; tasks: Task[] }[] = [
      { id: "todo", label: "To Do", tasks: [] },
      { id: "in_progress", label: "In Focus", tasks: [] },
      { id: "done", label: "Completed", tasks: [] },
    ];
    for (const t of filteredTasks) {
      const col = cols.find((c) => c.id === t.status);
      if (col) col.tasks.push(t);
    }
    return cols;
  }, [filteredTasks]);

  // ── Mutations ──

  const addTask = useCallback(
    (title: string, status?: TaskStatus, category?: TaskCategory) => {
      if (!title.trim()) return;
      const newTask: Task = {
        id: uid(),
        title: title.trim(),
        subjectId: newSubjectId,
        priority: newPriority,
        status: status ?? newStatus,
        estMin: newEstMin,
        actualMin: 0,
        deadline: newDeadline,
        category: category ?? newCategory,
        subtasks: [],
        collapsed: false,
      };
      setData((d) => ({ ...d, tasks: [...d.tasks, newTask] }));
    },
    [newSubjectId, newPriority, newEstMin, newDeadline, newCategory, newStatus, setData]
  );

  const cycleStatus = useCallback(
    (id: string) => {
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => {
          if (t.id !== id) return t;
          const idx = TASK_STATUSES.findIndex((s) => s.id === t.status);
          return { ...t, status: TASK_STATUSES[(idx + 1) % TASK_STATUSES.length].id };
        }),
      }));
    },
    [setData]
  );

  const removeTask = useCallback(
    (id: string) => setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) })),
    [setData]
  );

  const removeSelected = useCallback(() => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => !selectedIds.has(t.id)) }));
    setSelectedIds(new Set());
  }, [setData, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map((t) => t.id)));
    }
  }, [selectedIds.size, filteredTasks]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddSubtask = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setSubtaskFocusSignal((prev) => ({ taskId: id, n: (prev?.n ?? 0) + 1 }));
  }, []);

  const startEditTitle = useCallback((task: Task) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
  }, []);

  const commitEditTitle = useCallback(() => {
    if (editingId && editingTitle.trim()) {
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === editingId ? { ...t, title: editingTitle.trim() } : t
        ),
      }));
    }
    setEditingId(null);
  }, [editingId, editingTitle, setData]);

  const toggleSubtask = useCallback(
    (taskId: string, subId: string) => {
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            subtasks: t.subtasks.map((st) =>
              st.id === subId ? { ...st, done: !st.done } : st
            ),
          };
        }),
      }));
    },
    [setData]
  );

  const addSubtask = useCallback(
    (taskId: string, title: string) => {
      if (!title.trim()) return;
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            subtasks: [...t.subtasks, { id: uid(), title: title.trim(), done: false }],
          };
        }),
      }));
    },
    [setData]
  );

  const handleQuickAdd = useCallback(
    (col: TaskStatus) => {
      if (!quickAddTitle.trim()) return;
      addTask(quickAddTitle, col, undefined);
      setQuickAddTitle("");
    },
    [quickAddTitle, addTask]
  );

  // ── Drag handlers ──
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDragTaskId(taskId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colId);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, colId: TaskStatus) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData("text/plain");
      if (taskId) {
        setData((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, status: colId } : t)),
        }));
      }
      setDragTaskId(null);
      setDragOverCol(null);
    },
    [setData]
  );

  const handleDragEnd = useCallback(() => {
    setDragTaskId(null);
    setDragOverCol(null);
  }, []);

  // ── Submit drawer ──
  const submitDrawer = useCallback(() => {
    if (!newTitle.trim()) return;
    addTask(newTitle);
    setNewTitle("");
    setDrawerOpen(false);
  }, [newTitle, addTask]);

  // Helper: subtask completion ratio
  const subtaskProgress = (t: Task) => {
    if (!t.subtasks || t.subtasks.length === 0) return null;
    const done = t.subtasks.filter((s) => s.done).length;
    return { done, total: t.subtasks.length, pct: Math.round((done / t.subtasks.length) * 100) };
  };

  return (
    <div className="b-tasks" style={{ minHeight: 0 }}>
      {/* ── Header ── */}
      <div className="b-tasks-header">
        <div className="b-tasks-header-left">
          <div className="b-tasks-title-row">
            <span className="b-tasks-icon">
              <CheckSquare size={16} />
            </span>
            <span className="b-tasks-title">TASKS</span>
            <span className="b-tasks-count">{tasks.length}</span>
          </div>
        </div>
        <div className="b-tasks-header-right">
          <button
            className={`b-tasks-view-btn ${viewMode === "list" ? "b-tasks-view-btn-active" : ""}`}
            onClick={() => setViewMode("list")}
          >
            <List size={14} />
            List
          </button>
          <button
            className={`b-tasks-view-btn ${viewMode === "kanban" ? "b-tasks-view-btn-active" : ""}`}
            onClick={() => setViewMode("kanban")}
          >
            <LayoutGrid size={14} />
            Board
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="b-tasks-toolbar">
        <div className="b-tasks-toolbar-left">
          <div className="b-tasks-search-wrap">
            <Search size={13} className="b-tasks-search-icon" />
            <input
              className="b-tasks-search"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="b-tasks-search-clear" onClick={() => setSearchQuery("")}>
                <X size={11} />
              </button>
            )}
          </div>
          <div className="b-tasks-filter-group">
            <span className="b-tasks-filter-label">Status</span>
            {["all", ...TASK_STATUSES.map((s) => s.id)].map((f) => (
              <button
                key={f}
                className={`b-tasks-filter-btn ${filterStatus === f ? "b-tasks-filter-btn-active" : ""}`}
                onClick={() => setFilterStatus(f)}
              >
                {f === "all" ? "All" : TASK_STATUSES.find((s) => s.id === f)!.label}
              </button>
            ))}
          </div>
          <div className="b-tasks-filter-group">
            <span className="b-tasks-filter-label">Tag</span>
            <button
              className={`b-tasks-filter-btn ${filterCategory === "all" ? "b-tasks-filter-btn-active" : ""}`}
              onClick={() => setFilterCategory("all")}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`b-tasks-filter-btn ${filterCategory === c.id ? "b-tasks-filter-btn-active" : ""}`}
                onClick={() => setFilterCategory(c.id)}
              >
                <span className="b-tasks-cat-dot" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="b-tasks-toolbar-right">
          {selectedIds.size > 0 && (
            <button className="b-tasks-bulk-delete" onClick={removeSelected}>
              <Trash2 size={12} />
              Delete ({selectedIds.size})
            </button>
          )}
          <button className="b-tasks-new-btn" onClick={() => setDrawerOpen(true)}>
            <Plus size={13} />
            New Task
            <span className="b-tasks-hotkey">Cmd+N</span>
          </button>
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div className="b-tasks-list">
          {/* Table header */}
          <div className="b-tasks-table-header">
            <div className="b-tasks-th b-tasks-th-check">
              <button className="b-tasks-select-all" onClick={toggleSelectAll}>
                {selectedIds.size === filteredTasks.length && filteredTasks.length > 0 ? (
                  <Check size={11} />
                ) : selectedIds.size > 0 ? (
                  <span className="b-tasks-select-some" />
                ) : null}
              </button>
            </div>
            <div className="b-tasks-th b-tasks-th-expand" />
            <div className="b-tasks-th b-tasks-th-title">Task</div>
            <div className="b-tasks-th b-tasks-th-category">Tag</div>
            <div className="b-tasks-th b-tasks-th-priority">Pri</div>
            <div className="b-tasks-th b-tasks-th-est">Est</div>
            <div className="b-tasks-th b-tasks-th-pom">Pom</div>
            <div className="b-tasks-th b-tasks-th-deadline">Due</div>
            <div className="b-tasks-th b-tasks-th-status">Status</div>
            <div className="b-tasks-th b-tasks-th-actions" />
          </div>

          {/* Rows */}
          {filteredTasks.map((t) => {
            const subj = subjects.find((s) => s.id === t.subjectId);
            const pr = PRIORITIES.find((p) => p.id === t.priority);
            const cat = CATEGORIES.find((c) => c.id === t.category);
            const statusDef = TASK_STATUSES.find((s) => s.id === t.status);
            const prog = subtaskProgress(t);
            const dl = deadlineCountdown(t.deadline, nowRef.current ?? undefined);
            const hasSubtasks = t.subtasks && t.subtasks.length > 0;
            const isExpanded = expandedIds.has(t.id);
            const isEditing = editingId === t.id;
            const isDone = t.status === "done";
            const pomDone = t.estMin > 0 ? Math.floor(t.actualMin / 25) : 0;
            const pomTotal = t.estMin > 0 ? Math.ceil(t.estMin / 25) : 0;

            return (
              <div key={t.id} className="b-tasks-row-group">
                <div className={`b-tasks-row ${isDone ? "b-tasks-row-done" : ""} ${dragTaskId === t.id ? "b-tasks-row-dragging" : ""}`}>
                  {/* Checkbox */}
                  <div className="b-tasks-cell b-tasks-cell-check">
                    <button
                      className={`b-tasks-checkbox ${isDone ? "b-tasks-checkbox-done" : ""} ${selectedIds.has(t.id) ? "b-tasks-checkbox-selected" : ""}`}
                      onClick={() => toggleSelect(t.id)}
                    >
                      {isDone && <Check size={11} />}
                    </button>
                  </div>

                  {/* Expand toggle */}
                  <div className="b-tasks-cell b-tasks-cell-expand">
                    <button className="b-tasks-expand-btn" onClick={() => toggleExpand(t.id)}>
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  </div>

                  {/* Title */}
                  <div className="b-tasks-cell b-tasks-cell-title">
                    {isEditing ? (
                      <input
                        className="b-tasks-inline-edit"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={commitEditTitle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditTitle();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`b-tasks-task-name ${isDone ? "b-tasks-task-name-done" : ""}`}
                        onDoubleClick={() => startEditTitle(t)}
                      >
                        {t.title}
                      </span>
                    )}
                    {prog && (
                      <div className="b-tasks-sub-progress">
                        <div className="b-tasks-sub-bar">
                          <div
                            className="b-tasks-sub-bar-fill"
                            style={{ width: `${prog.pct}%`, background: isDone ? "#6fbf8b" : "#e8a33d" }}
                          />
                        </div>
                        <span className="b-tasks-sub-count">
                          {prog.done}/{prog.total}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Category tag */}
                  <div className="b-tasks-cell b-tasks-cell-category">
                    {cat && (
                      <span className="b-tasks-tag" style={{ background: cat.color + "18", color: cat.color }}>
                        {cat.label}
                      </span>
                    )}
                    {subj && !cat && (
                      <span className="b-tasks-tag" style={{ background: subj.color + "18", color: subj.color }}>
                        {subj.name}
                      </span>
                    )}
                  </div>

                  {/* Priority badge */}
                  <div className="b-tasks-cell b-tasks-cell-priority">
                    {pr && (
                      <span className="b-tasks-priority-badge" style={{ color: pr.color, borderColor: pr.color + "40" }}>
                        P{PRIORITY_WEIGHT[t.priority] + 1}
                      </span>
                    )}
                  </div>

                  {/* Estimated */}
                  <div className="b-tasks-cell b-tasks-cell-est">
                    <span className="b-tasks-pom-chip">{fmtMin(t.estMin)}</span>
                  </div>

                  {/* Pomodoro chips */}
                  <div className="b-tasks-cell b-tasks-cell-pom">
                    <div className="b-tasks-pom-blocks">
                      {Array.from({ length: Math.max(pomTotal, 1) }).map((_, i) => (
                        <div
                          key={i}
                          className={`b-tasks-pom-block ${i < pomDone ? "b-tasks-pom-block-fill" : ""}`}
                        />
                      ))}
                    </div>
                    <span className="b-tasks-pom-label">
                      {pomDone}/{pomTotal}
                    </span>
                  </div>

                  {/* Deadline */}
                  <div className="b-tasks-cell b-tasks-cell-deadline">
                    {dl && (
                      <span
                        className={`b-tasks-deadline ${dl === "Overdue" ? "b-tasks-deadline-overdue" : dl === "Today" ? "b-tasks-deadline-today" : ""}`}
                      >
                        <Clock size={10} />
                        {dl}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="b-tasks-cell b-tasks-cell-status">
                    <button
                      className={`b-tasks-status-pill b-tasks-status-${t.status}`}
                      onClick={() => cycleStatus(t.id)}
                    >
                      {statusDef?.label}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="b-tasks-cell b-tasks-cell-actions">
                    <button
                      className="b-tasks-action-btn b-tasks-action-btn-accent"
                      title="Add subtask"
                      onClick={() => handleAddSubtask(t.id)}
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      className="b-tasks-action-btn b-tasks-action-btn-accent"
                      title="Rename task"
                      onClick={() => startEditTitle(t)}
                    >
                      <Pencil size={12} />
                    </button>
                    <button className="b-tasks-action-btn" onClick={() => removeTask(t.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded subtasks */}
                {isExpanded && (
                  <div className="b-tasks-subtree">
                    {t.subtasks.map((st) => (
                      <div key={st.id} className="b-tasks-subtask-row">
                        <div className="b-tasks-cell b-tasks-cell-check" />
                        <div className="b-tasks-cell b-tasks-cell-expand" />
                        <div className="b-tasks-cell b-tasks-cell-title b-tasks-subtask-indent">
                          <button
                            className={`b-tasks-checkbox b-tasks-checkbox-sm ${st.done ? "b-tasks-checkbox-done" : ""}`}
                            onClick={() => toggleSubtask(t.id, st.id)}
                          >
                            {st.done && <Check size={9} />}
                          </button>
                          <span className={`b-tasks-subtask-name ${st.done ? "b-tasks-task-name-done" : ""}`}>
                            {st.title}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="b-tasks-subtask-add-row">
                      <div className="b-tasks-cell b-tasks-cell-check" />
                      <div className="b-tasks-cell b-tasks-cell-expand" />
                      <div className="b-tasks-cell b-tasks-cell-title b-tasks-subtask-indent">
                        <SubtaskAddInline
                          taskId={t.id}
                          onAdd={addSubtask}
                          focusSignal={subtaskFocusSignal?.taskId === t.id ? subtaskFocusSignal.n : 0}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredTasks.length === 0 && <div className="b-tasks-empty">No tasks match the current filters.</div>}
        </div>
      )}

      {/* ── KANBAN VIEW ── */}
      {viewMode === "kanban" && (
        <div className="b-tasks-kanban">
          {kanbanColumns.map((col) => {
            const atLimit = col.tasks.length >= WIP_LIMITS[col.id];
            const isOver = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                className={`b-tasks-kanban-col ${isOver ? "b-tasks-kanban-col-over" : ""}`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                <div className="b-tasks-kanban-col-header">
                  <span className="b-tasks-kanban-col-title">{col.label}</span>
                  <span className={`b-tasks-kanban-col-count ${atLimit ? "b-tasks-kanban-col-count-full" : ""}`}>
                    {col.tasks.length}/{WIP_LIMITS[col.id]}
                  </span>
                </div>
                <div className="b-tasks-kanban-col-body">
                  {col.tasks.map((t) => {
                    const subj = subjects.find((s) => s.id === t.subjectId);
                    const pr = PRIORITIES.find((p) => p.id === t.priority);
                    const cat = CATEGORIES.find((c) => c.id === t.category);
                    const prog = subtaskProgress(t);
                    const dl = deadlineCountdown(t.deadline, nowRef.current ?? undefined);
                    const pomDone = t.estMin > 0 ? Math.floor(t.actualMin / 25) : 0;
                    const pomTotal = t.estMin > 0 ? Math.ceil(t.estMin / 25) : 0;

                    return (
                      <div
                        key={t.id}
                        className={`b-tasks-kanban-card ${dragTaskId === t.id ? "b-tasks-kanban-card-dragging" : ""} ${t.status === "done" ? "b-tasks-kanban-card-done" : ""}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="b-tasks-kanban-card-top">
                          {cat && (
                            <span className="b-tasks-tag" style={{ background: cat.color + "18", color: cat.color }}>
                              {cat.label}
                            </span>
                          )}
                          {pr && (
                            <span className="b-tasks-priority-badge" style={{ color: pr.color, borderColor: pr.color + "40" }}>
                              P{PRIORITY_WEIGHT[t.priority] + 1}
                            </span>
                          )}
                        </div>
                        <div className="b-tasks-kanban-card-title">{t.title}</div>
                        {prog && (
                          <div className="b-tasks-kanban-card-prog">
                            <div className="b-tasks-sub-bar">
                              <div
                                className="b-tasks-sub-bar-fill"
                                style={{ width: `${prog.pct}%`, background: t.status === "done" ? "#6fbf8b" : "#e8a33d" }}
                              />
                            </div>
                            <span className="b-tasks-sub-count">
                              {prog.done}/{prog.total}
                            </span>
                          </div>
                        )}
                        <div className="b-tasks-kanban-card-footer">
                          <span className="b-tasks-kanban-card-est">{fmtMin(t.estMin)}</span>
                          <div className="b-tasks-pom-blocks b-tasks-pom-blocks-sm">
                            {Array.from({ length: Math.min(pomTotal, 8) }).map((_, i) => (
                              <div
                                key={i}
                                className={`b-tasks-pom-block b-tasks-pom-block-sm ${i < pomDone ? "b-tasks-pom-block-fill" : ""}`}
                              />
                            ))}
                          </div>
                          {dl && (
                            <span
                              className={`b-tasks-deadline b-tasks-deadline-sm ${dl === "Overdue" ? "b-tasks-deadline-overdue" : ""}`}
                            >
                              {dl}
                            </span>
                          )}
                        </div>
                        {subj && (
                          <div className="b-tasks-kanban-card-subj" style={{ color: subj.color }}>
                            {subj.name}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Quick add */}
                  {quickAddCol === col.id ? (
                    <div className="b-tasks-kanban-quick-add">
                      <input
                        ref={quickInputRef}
                        className="b-tasks-kanban-quick-input"
                        placeholder="Task title..."
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleQuickAdd(col.id);
                          if (e.key === "Escape") {
                            setQuickAddCol(null);
                            setQuickAddTitle("");
                          }
                        }}
                        onBlur={() => {
                          if (!quickAddTitle.trim()) {
                            setQuickAddCol(null);
                            setQuickAddTitle("");
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      className="b-tasks-kanban-add-btn"
                      onClick={() => {
                        setQuickAddCol(col.id);
                        setQuickAddTitle("");
                      }}
                    >
                      <Plus size={12} />
                      Add task
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Creation Drawer ── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="b-tasks-drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              className="b-tasks-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            >
              <div className="b-tasks-drawer-header">
                <span className="b-tasks-drawer-title">NEW TASK</span>
                <button className="b-tasks-drawer-close" onClick={() => setDrawerOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="b-tasks-drawer-body">
                <label className="b-tasks-drawer-label">Title</label>
                <input
                  className="b-tasks-drawer-input"
                  placeholder="What needs to be done?"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitDrawer()}
                  autoFocus
                />

                <label className="b-tasks-drawer-label">Priority</label>
                <div className="b-tasks-drawer-priority-row">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.id}
                      className={`b-tasks-drawer-pri-btn ${newPriority === p.id ? "b-tasks-drawer-pri-btn-active" : ""}`}
                      style={{ borderColor: newPriority === p.id ? p.color : "transparent", color: newPriority === p.id ? p.color : "#5a5e78" }}
                      onClick={() => setNewPriority(p.id)}
                    >
                      P{PRIORITY_WEIGHT[p.id] + 1}
                    </button>
                  ))}
                </div>

                <label className="b-tasks-drawer-label">Category</label>
                <div className="b-tasks-drawer-priority-row">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      className={`b-tasks-drawer-pri-btn ${newCategory === c.id ? "b-tasks-drawer-pri-btn-active" : ""}`}
                      style={{ borderColor: newCategory === c.id ? c.color : "transparent", color: newCategory === c.id ? c.color : "#5a5e78" }}
                      onClick={() => setNewCategory(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <label className="b-tasks-drawer-label">Subject</label>
                <select
                  className="b-tasks-drawer-select"
                  value={newSubjectId}
                  onChange={(e) => setNewSubjectId(e.target.value)}
                >
                  <option value="">No subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <label className="b-tasks-drawer-label">Status</label>
                <select
                  className="b-tasks-drawer-select"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <div className="b-tasks-drawer-row">
                  <div className="b-tasks-drawer-col">
                    <label className="b-tasks-drawer-label">Est. (min)</label>
                    <input
                      className="b-tasks-drawer-num"
                      type="number"
                      value={newEstMin}
                      onChange={(e) => setNewEstMin(Number(e.target.value))}
                    />
                  </div>
                  <div className="b-tasks-drawer-col">
                    <label className="b-tasks-drawer-label">Deadline</label>
                    <input
                      className="b-tasks-drawer-input"
                      type="date"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                    />
                  </div>
                </div>

                <button className="b-tasks-drawer-submit" onClick={submitDrawer}>
                  <Plus size={14} />
                  Create Task
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Inline subtask add ──
function SubtaskAddInline({
  taskId,
  onAdd,
  focusSignal = 0,
}: {
  taskId: string;
  onAdd: (taskId: string, title: string) => void;
  focusSignal?: number;
}) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (focusSignal > 0) setOpen(true);
  }, [focusSignal]);

  if (!open) {
    return (
      <button className="b-tasks-subtask-add-trigger" onClick={() => setOpen(true)}>
        <Plus size={10} />
        Add subtask
      </button>
    );
  }

  return (
    <input
      className="b-tasks-subtask-add-input"
      placeholder="Subtask title..."
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && val.trim()) {
          onAdd(taskId, val);
          setVal("");
        }
        if (e.key === "Escape") setOpen(false);
      }}
      onBlur={() => {
        if (!val.trim()) setOpen(false);
      }}
      autoFocus
    />
  );
}
