"use client";

import React from "react";
import { PreDeploymentVerification } from "@/components/verification/PreDeploymentVerification";

export default function VerificationPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto mb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Institutional Pre-Deployment Verification Protocol</h1>
        <p className="text-sm text-slate-500">14-gate verification suite testing OPA eligibility, pgvector dense retrieval, BGE-M3 embeddings, parallel reviewer swarms, Reflexion self-correction, and human sign-off gates.</p>
      </div>
      <div className="max-w-7xl mx-auto">
        <PreDeploymentVerification />
      </div>
    </div>
  );
}
