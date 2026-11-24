"use client";

import React from "react";
import { QuestionGenerator } from "@/components/faculty/QuestionGenerator";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function QuestionBankPage() {
  const { exams, setExams } = useAppContext();
  return (
    <AuthGuard allowedRoles={["LECTURER", "FACULTY", "COE_ADMIN", "SYSTEM_ADMIN"]}>
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
    </AuthGuard>
  );
}
