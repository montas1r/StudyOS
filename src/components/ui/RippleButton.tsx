"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";

interface RippleButtonProps {
  children: React.ReactNode;
  debounceMs?: number;
  showRipple?: boolean;
  variant?: "default" | "amber" | "danger";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
}

export default function RippleButton({
  children,
  debounceMs = 300,
  showRipple = true,
  variant = "default",
  onClick,
  disabled,
  className = "",
  style,
  type = "button",
}: RippleButtonProps) {
  const [pending, setPending] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const idRef = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      for (const t of rippleTimersRef.current) clearTimeout(t);
      rippleTimersRef.current.clear();
    };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (pending || disabled) return;

    if (showRipple) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = ++idRef.current;
      setRipples((prev) => [...prev, { id, x, y }]);
      const t = setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
        rippleTimersRef.current.delete(t);
      }, 600);
      rippleTimersRef.current.add(t);
    }

    setPending(true);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPending(false);
      debounceRef.current = null;
    }, debounceMs);

    onClick?.(e);
  }, [pending, disabled, debounceMs, showRipple, onClick]);

  const variantStyles = {
    default: "",
    amber: "bg-[var(--amber)] border-[var(--amber)] text-[#221708]",
    danger: "bg-[var(--red)] border-[var(--red)] text-white hover:bg-[#c9503f] hover:border-[#c9503f]",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      transition={{ type: "spring" as const, stiffness: 500, damping: 30 }}
      className={`w-10 h-10 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)] flex items-center justify-center cursor-pointer b-transition ${variantStyles[variant]} ${className}`}
      onClick={handleClick}
      disabled={disabled || pending}
      type={type}
      style={{ position: "relative", overflow: "hidden", opacity: pending && !disabled ? 0.7 : 1, ...style }}
    >
      {children}
      {showRipple && ripples.map((r) => (
        <span
          key={r.id}
          style={{
            position: "absolute",
            left: r.x,
            top: r.y,
            width: 0,
            height: 0,
            borderRadius: "50%",
            background: "rgba(232, 163, 61, 0.3)",
            transform: "translate(-50%, -50%)",
            animation: "ripple-expand 0.5s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      ))}
    </motion.button>
  );
}
