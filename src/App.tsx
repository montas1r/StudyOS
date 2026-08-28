import { lazy, Suspense, useEffect, useCallback, Component, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { initStudyStore, useLoaded } from "@/lib/store";
import { resumeAudioContext } from "@/lib/audio";
import { DragProvider } from "@/lib/DragContext";
import { TimerProvider } from "@/lib/TimerContext";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import {
  DashboardSkeleton,
  FocusSkeleton,
  TasksSkeleton,
  AnalyticsSkeleton,
} from "@/components/ui/Skeleton";

/* ── Lazy-loaded views — safely resolve named, aliased, or default exports ── */
const Dashboard = lazy(() =>
  import("@/components/views/Dashboard").then((m: any) => ({ default: m.Dashboard || m.DashboardView || m.default })),
);
const FocusView = lazy(() =>
  import("@/components/views/FocusView").then((m: any) => ({ default: m.FocusView || m.Focus || m.default })),
);
const TasksView = lazy(() =>
  import("@/components/views/TasksView").then((m: any) => ({ default: m.TasksView || m.Tasks || m.default })),
);
const HabitsView = lazy(() =>
  import("@/components/views/HabitsView").then((m: any) => ({ default: m.HabitsView || m.Habits || m.default })),
);
const GoalsView = lazy(() =>
  import("@/components/views/GoalsView").then((m: any) => ({ default: m.GoalsView || m.Goals || m.default })),
);
const SubjectsView = lazy(() =>
  import("@/components/views/SubjectsView").then((m: any) => ({ default: m.SubjectsView || m.Subjects || m.default })),
);
const AnalyticsView = lazy(() =>
  import("@/components/views/AnalyticsView").then((m: any) => ({ default: m.AnalyticsView || m.Analytics || m.default })),
);
const SettingsView = lazy(() =>
  import("@/components/views/SettingsView").then((m: any) => ({ default: m.SettingsView || m.Settings || m.default })),
);

/* ── Loading spinner ── */
function ViewLoader({ skeleton: Skeleton = DashboardSkeleton }: { skeleton?: React.ComponentType }) {
  return (
    <div className="w-full h-full space-y-6">
      <Skeleton />
    </div>
  );
}

/* ── Error boundary for lazy-load failures ── */
class ViewErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: 48, textAlign: "center", color: "var(--text-dim)" }}>
          <p style={{ fontSize: 14 }}>Something went wrong loading this view.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{ marginTop: 12, padding: "6px 16px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Framer motion view transition config ── */
const viewTransition = {
  initial: { opacity: 0, y: 8, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.998 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

/* ── Suspense-wrapped view outlet ── */
function LazyView({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <ViewErrorBoundary>
      <Suspense fallback={fallback ?? <ViewLoader />}>
        {children}
      </Suspense>
    </ViewErrorBoundary>
  );
}

/* ── Main App ── */
export default function App() {
  const loaded = useLoaded();

  useEffect(() => { initStudyStore(); }, []);

  const handleShellClick = useCallback(() => {
    resumeAudioContext();
  }, []);

  if (!loaded) {
    return (
      <div className="studyos-root">
        <div className="main-column">
          <TopBar />
          <main className="main-panel">
            <ViewLoader />
          </main>
        </div>
      </div>
    );
  }

  return (
    <DragProvider>
      <TimerProvider>
        <div className="studyos-root" onClick={handleShellClick}>
          <Suspense fallback={<ViewLoader />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<LazyView fallback={<ViewLoader skeleton={DashboardSkeleton} />}><Dashboard /></LazyView>} />
                <Route path="focus" element={<LazyView fallback={<ViewLoader skeleton={FocusSkeleton} />}><FocusView /></LazyView>} />
                <Route path="tasks" element={<LazyView fallback={<ViewLoader skeleton={TasksSkeleton} />}><TasksView /></LazyView>} />
                <Route path="habits" element={<LazyView fallback={<ViewLoader skeleton={DashboardSkeleton} />}><HabitsView /></LazyView>} />
                <Route path="goals" element={<LazyView fallback={<ViewLoader skeleton={DashboardSkeleton} />}><GoalsView /></LazyView>} />
                <Route path="subjects" element={<LazyView fallback={<ViewLoader skeleton={DashboardSkeleton} />}><SubjectsView /></LazyView>} />
                <Route path="analytics" element={<LazyView fallback={<ViewLoader skeleton={AnalyticsSkeleton} />}><AnalyticsView /></LazyView>} />
                <Route path="settings" element={<LazyView fallback={<ViewLoader skeleton={DashboardSkeleton} />}><SettingsView /></LazyView>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </div>
      </TimerProvider>
    </DragProvider>
  );
}

function Layout() {
  return (
    <>
      <Sidebar />
      <div className="main-column">
        <TopBar />
        <main className="main-panel">
          <AnimatedOutlet />
        </main>
      </div>
    </>
  );
}

function AnimatedOutlet() {
  const location = useLocation();
  return (
    <Suspense fallback={<ViewLoader />}>
      <AnimatePresence mode="wait">
        <motion.div key={location.pathname} {...viewTransition}>
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </Suspense>
  );
}
