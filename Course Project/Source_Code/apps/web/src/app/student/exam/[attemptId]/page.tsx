"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppContext } from "@/context/AppContext";
import { ExamRunner } from "@/components/student/ExamRunner";
import { apiFetch } from "@/utils/apiClient";
import type { Exam, ExamSubmission } from "@/types/exam";
import { RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";

export default function OfficialExamPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params?.attemptId as string;
  const { currentUser, exams, handleFinishExam } = useAppContext();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [examData, setExamData] = useState<Exam | null>(null);
  const [serverDeadline, setServerDeadline] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!attemptId) return;

    let isMounted = true;
    async function loadAttemptData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/student/attempts?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load official examination attempt: HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!isMounted) return;

        const schedule = data.schedule || {};
        const att = data.attempt || {};

        const constructedExam: Exam = {
          id: schedule.scheduleId || "dddddddd-dddd-dddd-dddd-dddddddddddd",
          title: schedule.title || "Internal Assessment 1: Agentic AI Foundations (26ECAC401)",
          courseCode: schedule.courseCode || "26ECAC401",
          facultyId: "fac_authoritative",
          facultyName: "Department of Computer Science & Engineering",
          description: `Authoritative Monitored Examination for ${schedule.courseTitle || "Agentic AI"}`,
          durationMinutes: schedule.durationMinutes || 60,
          totalMarks: 50,
          passingScore: 20,
          type: "objective",
          isMockOrPractice: false,
          registrationStart: new Date(Date.now() - 86400000).toISOString(),
          registrationEnd: schedule.endTime || new Date(Date.now() + 86400000).toISOString(),
          examStart: schedule.startTime || new Date(Date.now() - 3600000).toISOString(),
          examEnd: schedule.endTime || new Date(Date.now() + 86400000).toISOString(),
          status: "published",
          proctoringRules: {
            requireWebcam: true,
            maxTabSwitches: 3,
            blockCopyPaste: true,
            fullscreenRequired: true,
            ambientAudioCheck: true,
          },
          questionsCount: data.questions?.length || 50,
          coeApproved: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setExamData(constructedExam);
        if (att.serverDeadline) {
          setServerDeadline(att.serverDeadline);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load examination attempt");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAttemptData();

    return () => {
      isMounted = false;
    };
  }, [attemptId]);

  const handleComplete = (sub: ExamSubmission) => {
    handleFinishExam(sub);
    router.push("/student/scorecard");
  };

  const handleExit = () => {
    router.push("/student");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-white flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        <h2 className="text-sm font-semibold tracking-wide">
          Loading Official Examination Environment...
        </h2>
        <p className="text-xs text-slate-400 font-mono">
          Attempt UUID: {attemptId}
        </p>
      </div>
    );
  }

  if (error || !examData) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <div className="p-6 bg-red-950/50 border border-red-800 rounded-xl max-w-md w-full text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <h2 className="text-base font-semibold text-red-200">
            Examination Launch Verification Failed
          </h2>
          <p className="text-xs text-red-300 leading-relaxed">
            {error || "Unable to establish secure session."}
          </p>
          <button
            onClick={handleExit}
            className="mt-4 px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-2 mx-auto cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Student Portal</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <ExamRunner
      exam={examData}
      currentUser={currentUser}
      attemptId={attemptId}
      serverDeadline={serverDeadline}
      onFinishExam={handleComplete}
      onExit={handleExit}
      verificationToken="PROCTOR_VERIFIED"
      isVirtualCamera={false}
      initialStream={null}
    />
  );
}
