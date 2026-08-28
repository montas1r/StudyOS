"use client";

import React from "react";
import { type LucideIcon } from "lucide-react";

interface SectionTitleProps {
  icon: LucideIcon;
  children: React.ReactNode;
}

export default function SectionTitle({ icon: Icon, children }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} style={{ color: "var(--amber)" }} />
      <h2 className="font-serif font-semibold text-[22px] m-0 pb-1">{children}</h2>
    </div>
  );
}
