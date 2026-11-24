"use client";

import React from "react";
import { CoeDashboard } from "@/components/coe/CoeDashboard";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function CoeAcademicLifecyclePage() {
  const { exams, currentUser, handleSelectTab, handleRefreshExams, handleSwitchUser } = useAppContext();
  return (
    <AuthGuard allowedRoles={["COE_ADMIN", "SYSTEM_ADMIN"]}>
      <CoeDashboard
        exams={exams}
        currentUser={currentUser}
        onNavigateToTab={handleSelectTab}
        onRefreshExams={handleRefreshExams}
        onSwitchUser={handleSwitchUser}
      />
    </AuthGuard>
  );
}
