"use client";

import React, { Suspense } from "react";
import { useAppContext } from "@/context/AppContext";
import { FacultyDashboard } from "@/components/faculty/FacultyDashboard";
import { ExamConfigurator } from "@/components/faculty/ExamConfigurator";
import { QuestionGenerator } from "@/components/faculty/QuestionGenerator";
import { ReviewsAndGrading } from "@/components/faculty/ReviewsAndGrading";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";

function LecturerPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const {
    currentUser,
    exams,
    submissions,
    integrityLogs,
    grievances,
    handleSelectTab,
    setGrievances,
    setSubmissions,
    setIntegrityLogs,
    setExams,
    setFocusedGrievanceId,
  } = useAppContext();

  if (tabParam === "faculty_planner" || tabParam === "faculty_exams") {
    return (
      <ExamConfigurator
        exams={exams}
        facultyName={currentUser.displayName}
        onExamSaved={(exam) => {
          setExams((prev) => {
            const idx = prev.findIndex((e) => e.id === exam.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = exam;
              return copy;
            }
            return [exam, ...prev];
          });
        }}
      />
    );
  }

  if (tabParam === "faculty_syllabus_rag" || tabParam === "faculty_questions") {
    return (
      <QuestionGenerator
        exams={exams}
        onQuestionsAdded={(examId, newQuestions) => {
          setExams((prev) =>
            prev.map((e) =>
              e.id === examId
                ? { ...e, questionsCount: (e.questionsCount || 0) + newQuestions.length }
                : e
            )
          );
        }}
      />
    );
  }

  if (tabParam === "faculty_reviews" || tabParam === "faculty_grading") {
    return (
      <ReviewsAndGrading
        submissions={submissions}
        exams={exams}
        integrityLogs={integrityLogs}
        onSubmissionsUpdated={setSubmissions}
        onIntegrityLogsUpdated={setIntegrityLogs}
      />
    );
  }

  return (
    <FacultyDashboard
      exams={exams}
      submissions={submissions}
      integrityLogs={integrityLogs}
      grievances={grievances}
      onNavigate={(tab, contextId) => {
        if (contextId) setFocusedGrievanceId(contextId);
        handleSelectTab(tab);
      }}
      onNewExam={() => handleSelectTab("faculty_planner")}
      onGrievancesUpdated={setGrievances}
      onSubmissionsUpdated={setSubmissions}
    />
  );
}

export default function LecturerPage() {
  return (
    <AuthGuard allowedRoles={["LECTURER", "FACULTY", "SYSTEM_ADMIN"]}>
      <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500 font-serif">Loading Faculty Cockpit...</div>}>
        <LecturerPageContent />
      </Suspense>
    </AuthGuard>
  );
}
