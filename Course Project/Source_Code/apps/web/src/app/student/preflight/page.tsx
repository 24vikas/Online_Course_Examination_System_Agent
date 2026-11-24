"use client";

import React from "react";
import { ProctorPreflight } from "@/components/student/ProctorPreflight";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function StudentPreflightPage() {
  const { currentUser, exams, activeExamSession } = useAppContext();

  const currentExam = activeExamSession?.exam || exams[0] || {
    id: "exam-26ecac401",
    courseCode: "26ECAC401",
    title: "Course 26ECAC401: Agentic AI — Final Examination",
    durationMinutes: 180,
    totalMarks: 100,
  };

  return (
    <AuthGuard allowedRoles={["STUDENT", "SYSTEM_ADMIN"]}>
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <ProctorPreflight
          isOpen={true}
          exam={currentExam}
          currentUser={currentUser}
          attemptId="22222222-2222-2222-2222-222222222222"
          onPreflightComplete={(result) => {
            console.log("Preflight completed successfully:", result);
            if (typeof window !== "undefined") {
              window.location.href = "/student";
            }
          }}
          onClose={() => {
            if (typeof window !== "undefined") {
              window.location.href = "/student";
            }
          }}
        />
      </div>
    </AuthGuard>
  );
}
