"use client";

import React from "react";
import { motion } from "framer-motion";

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  number?: number;
}

const springHover = {
  whileHover: { y: -2, boxShadow: "0 6px 20px rgba(0,0,0,0.2)" },
  whileTap: { scale: 0.99 },
  transition: { type: "spring" as const, stiffness: 400, damping: 25 },
};

export default function AnimatedCard({ children, className = "", style, number }: AnimatedCardProps) {
  return (
    <motion.div
      className={`relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 transition-all duration-200 will-change-transform ${className}`}
      style={{ ...style, willChange: "transform" }}
      layout
      {...springHover}
    >
      {number !== undefined && (
        <div className="absolute -top-2.5 -left-2.5 bg-[var(--amber)] text-[#221708] text-[11px] font-bold w-[22px] h-[22px] rounded-full flex items-center justify-center font-mono z-[1]">
          {number}
        </div>
      )}
      {children}
    </motion.div>
  );
}
