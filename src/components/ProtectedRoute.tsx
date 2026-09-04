import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthReady, useUser } from "@/lib/store";

/**
 * Guards the main app shell. Redirects unauthenticated visitors to /login
 * (remembering where they were headed) and renders nothing until the auth
 * state has been resolved.
 */
export default function ProtectedRoute() {
  const user = useUser();
  const authReady = useAuthReady();
  const location = useLocation();

  if (!authReady) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--bg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-dim)", fontSize: 12 }}>
          <span className="auth-spinner" aria-hidden />
          Restoring session…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}