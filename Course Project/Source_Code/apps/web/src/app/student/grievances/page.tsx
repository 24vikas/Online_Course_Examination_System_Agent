"use client";

import React, { useEffect } from "react";
import { GrievanceTracker } from "@/components/student/GrievanceTracker";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function StudentGrievancePage() {
  const {
    currentUser,
    submissions,
    grievances,
    setGrievances,
  } = useAppContext();

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/student/grievances");
        if (res.ok) {
          const data = await res.json();
          if (data.grievances && data.grievances.length > 0) {
            setGrievances(data.grievances);
          }
        }
      } catch (err) {
        console.warn("Using shared grievance state:", err);
      }
    }
    loadData();
  }, [setGrievances]);

  return (
    <AuthGuard allowedRoles={["STUDENT", "SYSTEM_ADMIN"]}>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Candidate Grievance &amp; Revaluation Portal</h1>
          <p className="text-sm text-slate-500">File official revaluation petitions with syllabus citations, evidence references, and real-time faculty audit tracking.</p>
        </div>
        <GrievanceTracker
          currentUser={currentUser}
          submissions={submissions}
          grievances={grievances}
          onGrievanceAdded={(newGrievance) => {
            setGrievances((prev) => [newGrievance, ...prev]);
            fetch("/api/student/grievances", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                attemptId: newGrievance.submissionId,
                questionId: newGrievance.questionId,
                subject: newGrievance.subject,
                reason: newGrievance.reason,
                syllabusCitation: newGrievance.syllabusReference,
                currentMarks: newGrievance.currentMarks,
                requestedMarks: newGrievance.requestedMarks,
                examTitle: newGrievance.examTitle,
              }),
            }).catch(console.error);
          }}
        />
      </div>
    </AuthGuard>
  );
}
