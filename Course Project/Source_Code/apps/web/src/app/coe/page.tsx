"use client";

import React from "react";
import { useAppContext } from "@/context/AppContext";
import { CoeDashboard } from "@/components/coe/CoeDashboard";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function CoePage() {
  const {
    currentUser,
    exams,
    handleSelectTab,
    handleRefreshExams,
  } = useAppContext();

  return (
    <AuthGuard allowedRoles={["COE_ADMIN", "SYSTEM_ADMIN"]}>
      <CoeDashboard
        exams={exams}
        currentUser={currentUser}
        onNavigateToTab={handleSelectTab}
        onRefreshExams={handleRefreshExams}
      />
    </AuthGuard>
  );
}
