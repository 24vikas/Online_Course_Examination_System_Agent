"use client";

import React, { useEffect } from "react";
import { FacultyGrievanceQueue } from "@/components/faculty/FacultyGrievanceQueue";
import { useAppContext } from "@/context/AppContext";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function FacultyGrievancesPage() {
  const {
    currentUser,
    grievances,
    submissions,
    exams,
    setGrievances,
    setSubmissions,
  } = useAppContext();

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/coe/grievances");
        if (res.ok) {
          const data = await res.json();
          if (data.grievances && data.grievances.length > 0) {
            setGrievances(data.grievances);
          }
        }
      } catch (err) {
        console.warn("Using shared grievances:", err);
      }
    }
    loadData();
  }, [setGrievances]);

  return (
    <AuthGuard allowedRoles={["LECTURER", "FACULTY", "COE_ADMIN", "SYSTEM_ADMIN"]}>
      <div className="p-6">
        <div className="max-w-7xl mx-auto mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Faculty Academic Grievance &amp; Revaluation Queue</h1>
              <p className="text-sm text-slate-500">Review candidate scoring disputes with syllabus provenance, rubric evaluation, and deterministic faculty sign-off.</p>
            </div>
            <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
              72-Hour Resolution SLA
            </span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <FacultyGrievanceQueue
            grievances={grievances}
            submissions={submissions}
            exams={exams}
            currentUser={currentUser}
            onGrievancesUpdated={setGrievances}
            onSubmissionsUpdated={setSubmissions}
          />
        </div>
      </div>
    </AuthGuard>
  );
}
