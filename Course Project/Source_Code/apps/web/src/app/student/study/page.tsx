"use client";

import React from "react";
import { AcademicStudyPortal } from "@/components/student/AcademicStudyPortal";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function AcademicStudyPage() {
  const { currentUser, exams, handleStartExamOnboarding } = useAppContext();

  return (
    <AuthGuard allowedRoles={["STUDENT", "SYSTEM_ADMIN"]}>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Academic Course Material &amp; Study Hub</h1>
          <p className="text-sm text-slate-500">Curated syllabus chunks, Bloom taxonomy breakdown, course outcome articulation, and past examination papers.</p>
        </div>
        <AcademicStudyPortal
          userRole={currentUser.role}
          initialCourseCode="CS-301"
          onNavigateToExam={(examId) => {
            const target = exams.find((e) => e.id === examId);
            if (target) handleStartExamOnboarding(target);
          }}
        />
      </div>
    </AuthGuard>
  );
}
