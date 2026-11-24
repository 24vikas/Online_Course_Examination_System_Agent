"use client";

import React from "react";
import { DeepResearchStudio } from "@/components/research/DeepResearchStudio";

export default function DeepResearchPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <DeepResearchStudio
          initialQuery="Distributed Consensus and Spanner TrueTime API"
          courseCode="CS-301"
        />
      </div>
    </div>
  );
}
