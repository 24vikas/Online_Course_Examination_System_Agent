"use client";

import React from "react";
import { CoeTimetablePublisher } from "@/components/coe/CoeTimetablePublisher";
import { ExamConfigurator } from "@/components/faculty/ExamConfigurator";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function CoeBlueprintsPage() {
  const { exams, setExams, currentUser } = useAppContext();
  return (
    <AuthGuard allowedRoles={["COE_ADMIN", "LECTURER", "FACULTY", "SYSTEM_ADMIN"]}>
      <CoeTimetablePublisher />
      <ExamConfigurator
        exams={exams}
        facultyName={currentUser.displayName || "COE / Faculty Lead"}
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
    </AuthGuard>
  );
}
