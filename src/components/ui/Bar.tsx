"use client";

import type React from "react";

interface BarProps {
  pct: number;
  color?: string;
}

export default function Bar({ pct, color = "var(--amber)" }: BarProps) {
  return (
    <div className="w-full h-1.5 rounded bg-[var(--surface-2)] mt-2 overflow-hidden">
      <div
        className="h-full rounded-[transition:width_0.4s_ease]"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color,
        }}
      />
    </div>
  );
}
