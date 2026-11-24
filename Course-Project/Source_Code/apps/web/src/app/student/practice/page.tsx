"use client";

import React from "react";
import { PracticeTests } from "@/components/student/PracticeTests";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function StudentPracticePage() {
  const {
    currentUser,
    exams,
    handleStartExamOnboarding,
    handleFinishExam,
  } = useAppContext();

  return (
    <AuthGuard allowedRoles={["STUDENT", "SYSTEM_ADMIN"]}>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Student Practice Testing Hall &amp; Mock Exams</h1>
          <p className="text-sm text-slate-500">Practice with syllabus-grounded formative assessments, instantaneous rubrics, and zero penalty on official GPA.</p>
        </div>
        <PracticeTests
          practiceExams={exams.filter((e) => e.status === "published" || e.isMockOrPractice)}
          currentUser={currentUser}
          onStartPracticeExam={handleStartExamOnboarding}
          onSubmissionComplete={handleFinishExam}
        />
      </div>
    </AuthGuard>
  );
}
