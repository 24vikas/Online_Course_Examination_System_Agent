"use client";

import { LiveProctoringConsole } from "@/components/coe/LiveProctoringConsole";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function InvigilatorLivePage() {
  return (
    <AuthGuard allowedRoles={["INVIGILATOR", "COE_ADMIN", "SYSTEM_ADMIN"]}>
      <div className="h-screen w-full overflow-hidden bg-slate-900">
        <LiveProctoringConsole role="INVIGILATOR" baseRoute="/invigilator/live" />
      </div>
    </AuthGuard>
  );
}
