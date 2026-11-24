"use client";

import React from "react";
import { ReviewsAndGrading } from "@/components/faculty/ReviewsAndGrading";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function MarkingQueuePage() {
  const { submissions, exams, integrityLogs, setSubmissions, setIntegrityLogs } = useAppContext();
  return (
    <AuthGuard allowedRoles={["LECTURER", "FACULTY", "COE_ADMIN", "SYSTEM_ADMIN"]}>
      <ReviewsAndGrading
        submissions={submissions}
        exams={exams}
        integrityLogs={integrityLogs}
        onSubmissionsUpdated={setSubmissions}
        onIntegrityLogsUpdated={setIntegrityLogs}
      />
    </AuthGuard>
  );
}
