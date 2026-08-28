"use client";

import React from "react";

const SKELETON_HEIGHTS = [60, 45, 90, 110, 50, 75, 65];

const shimmer: React.CSSProperties = {
  background: "linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.5s ease-in-out infinite",
  borderRadius: 8,
};

function SkeletonLine({ width = "100%", height = 14 }: { width?: string | number; height?: number }) {
  return <div style={{ ...shimmer, width, height, flexShrink: 0 }} />;
}

function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <div style={{ ...shimmer, width: size, height: size, borderRadius: "50%", flexShrink: 0 }} />;
}

const cardBase = "relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6";

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={`${cardBase} flex flex-col gap-3`}>
      <SkeletonLine width="40%" height={10} />
      <SkeletonLine width="60%" height={28} />
      <SkeletonLine width="100%" height={6} />
    </div>
  );
}

export function SkeletonStatRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
      {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function SkeletonChartRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
      <div className={`${cardBase} flex flex-col gap-3`}>
        <SkeletonLine width="50%" height={10} />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
          {SKELETON_HEIGHTS.map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              <SkeletonLine width="100%" height={h} />
              <SkeletonLine width="20px" height={10} />
            </div>
          ))}
        </div>
      </div>
      <div className={`${cardBase} flex flex-col gap-3`}>
        <SkeletonLine width="45%" height={10} />
        <SkeletonLine width="80px" height={36} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SkeletonLine width="70%" height={10} />
            <SkeletonLine width="100%" height={6} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Dashboard skeleton ── */
export function DashboardSkeleton() {
  return (
    <div className="w-full h-full space-y-6 overflow-y-auto">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <SkeletonCircle size={18} />
        <SkeletonLine width={120} height={22} />
      </div>
      <SkeletonStatRow />
      <SkeletonChartRow />
    </div>
  );
}

/* ── Focus / Timer skeleton ── */
export function FocusSkeleton() {
  return (
    <div className="w-full h-full overflow-y-auto" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
      <div className={`${cardBase} flex flex-col items-center gap-5 p-8`}>
        <SkeletonLine width="100%" height={36} />
        <SkeletonCircle size={240} />
        <div style={{ display: "flex", gap: 12 }}>
          <SkeletonLine width="80px" height={40} />
          <SkeletonLine width="80px" height={40} />
          <SkeletonLine width="80px" height={40} />
        </div>
      </div>
      <div className={`${cardBase} flex flex-col gap-4`}>
        <SkeletonLine width="40%" height={10} />
        <SkeletonLine width="60px" height={28} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SkeletonLine width="80%" height={10} />
            <SkeletonLine width="100%" height={6} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tasks skeleton ── */
export function TasksSkeleton() {
  return (
    <div className="w-full h-full space-y-6 overflow-y-auto">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <SkeletonLine width={140} height={22} />
        <SkeletonLine width={80} height={32} />
      </div>
      <SkeletonStatRow />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`${cardBase}`} style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <SkeletonCircle size={18} />
              <SkeletonLine width={`${50 + i * 5}%`} height={14} />
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <SkeletonLine width={50} height={22} />
                <SkeletonLine width={70} height={22} />
              </div>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 12 }}>
              <SkeletonLine width={90} height={8} />
              <SkeletonLine width={60} height={8} />
              <SkeletonLine width={40} height={8} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Analytics skeleton ── */
export function AnalyticsSkeleton() {
  return (
    <div className="w-full h-full space-y-6 overflow-y-auto">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <SkeletonCircle size={18} />
        <SkeletonLine width={120} height={22} />
      </div>
      <SkeletonStatRow />
      {/* Heatmap */}
      <div className={`${cardBase}`} style={{ marginTop: 24 }}>
        <SkeletonLine width="45%" height={10} />
        <div style={{ display: "flex", gap: 4, marginTop: 14, height: 64 }}>
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <SkeletonLine width="100%" height={SKELETON_HEIGHTS[i % SKELETON_HEIGHTS.length]} />
            </div>
          ))}
        </div>
      </div>
      <SkeletonChartRow />
    </div>
  );
}

/* ── Generic timer skeleton (kept for backward compat) ── */
export function TimerSkeleton() {
  return <FocusSkeleton />;
}
