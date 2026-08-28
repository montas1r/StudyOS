"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DigitProps {
  value: string;
  className?: string;
}

function Digit({ value, className = "" }: DigitProps) {
  return (
    <span className={`relative inline-flex overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: -20, opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: 20, opacity: 0, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="inline-block will-change-transform"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Separator() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setVisible((v) => !v), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.span
      animate={{ opacity: visible ? 0.6 : 0.15 }}
      transition={{ duration: 0.25 }}
      className="inline-flex items-center justify-center w-[8px] text-center font-mono"
    >
      :
    </motion.span>
  );
}

export default function TopBar() {
  const [now, setNow] = useState(() => new Date());
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    ref.current = setInterval(() => setNow(new Date()), 1000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, []);

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  const s = now.getSeconds().toString().padStart(2, "0");

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-label">StudyOS</span>
      </div>
      <div className="topbar-right">
        <span suppressHydrationWarning className="text-[11px] text-[var(--text-dim)] tabular-nums">
          {dateStr}
        </span>
        <div className="flex items-center text-[var(--text)] font-mono text-sm tabular-nums tracking-widest select-none">
          <Digit value={h[0]} className="w-[0.55em] h-[1.2em]" />
          <Digit value={h[1]} className="w-[0.55em] h-[1.2em]" />
          <Separator />
          <Digit value={m[0]} className="w-[0.55em] h-[1.2em]" />
          <Digit value={m[1]} className="w-[0.55em] h-[1.2em]" />
          <Separator />
          <Digit value={s[0]} className="w-[0.55em] h-[1.2em]" />
          <Digit value={s[1]} className="w-[0.55em] h-[1.2em]" />
        </div>
      </div>
    </div>
  );
}
