"use client";

import React from "react";
import { CoeDocumentAgentStudio } from "@/components/coe/CoeDocumentAgentStudio";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function CoeDocumentsPage() {
  const { currentUser, handleSwitchUser } = useAppContext();
  return (
    <AuthGuard allowedRoles={["COE_ADMIN", "LECTURER", "FACULTY", "SYSTEM_ADMIN"]}>
      <CoeDocumentAgentStudio currentUser={currentUser} onSwitchUser={handleSwitchUser} />
    </AuthGuard>
  );
}
