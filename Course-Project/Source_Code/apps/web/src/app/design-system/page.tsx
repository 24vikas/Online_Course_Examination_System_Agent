"use client";

import React from "react";
import { DesignSystemShowcase } from "@/components/ui/DesignSystemShowcase";

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto mb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">KLE Tech Institutional Design System Showcase</h1>
        <p className="text-sm text-slate-500">Atomic UI tokens, accessible components, status chips, proctor tiles, question palettes, and responsive layouts.</p>
      </div>
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <DesignSystemShowcase />
      </div>
    </div>
  );
}
