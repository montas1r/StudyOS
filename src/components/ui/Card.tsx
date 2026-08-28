"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  number?: number;
}

export default function Card({ children, className = "", style, number }: CardProps) {
  return (
    <div
      className={`relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 transition-all duration-200 will-change-transform hover:border-[var(--border-strong)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] ${className}`}
      style={style}
    >
      {number !== undefined && (
        <div className="absolute -top-2.5 -left-2.5 bg-[var(--amber)] text-[#221708] text-[11px] font-bold w-[22px] h-[22px] rounded-full flex items-center justify-center font-mono z-[1]">
          {number}
        </div>
      )}
      {children}
    </div>
  );
}
