"use client";

import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Timer,
  CheckSquare,
  Flame,
  Target,
  BookOpen,
  BarChart2,
  Settings,
  CircleUser,
} from "lucide-react";

const NAV_ITEMS: { path: string; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/focus", label: "Focus", icon: Timer },
  { path: "/tasks", label: "Tasks", icon: CheckSquare },
  { path: "/habits", label: "Habits", icon: Flame },
  { path: "/goals", label: "Goals", icon: Target },
  { path: "/subjects", label: "Subjects", icon: BookOpen },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/profile", label: "Profile", icon: CircleUser },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <span className="brand-text">StudyOS</span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((it) => {
          const active = isActive(it.path);
          return (
            <motion.div key={it.path} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
              <Link
                to={it.path}
                className={`nav-item ${active ? "nav-item-active" : ""}`}
                style={{ display: "flex", textDecoration: "none" }}
              >
                <it.icon size={17} />
                <span>{it.label}</span>
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 3,
                      height: 20,
                      borderRadius: "0 4px 4px 0",
                      background: "var(--amber)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>
    </div>
  );
}
