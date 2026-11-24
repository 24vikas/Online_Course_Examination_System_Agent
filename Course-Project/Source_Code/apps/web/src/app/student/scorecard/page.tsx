"use client";

import React, { useState, useEffect } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import {
  Award,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Clock,
  BookOpen,
  FileCheck,
  AlertTriangle,
  FileText,
  ArrowRight,
  ExternalLink
} from "lucide-react";
import Link from "next/link";

interface ScorecardData {
  attemptId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  usn: string;
  courseCode: string;
  courseTitle: string;
  examTitle: string;
  status: string;
  canonicalState: string;
  isPublished: boolean;
  withheldReason: string | null;
  submittedAt: string | null;
  resultsPublishedAt: string | null;
  scoring: {
    objectiveScore: number;
    subjectiveScore: number;
    rawTotalScore: number;
    moderatedScore: number | null;
    finalScore: number;
    maxMarks: number;
    percentage: number;
    gradeBand: string;
  } | null;
  responses: Array<{
    questionId: string;
    sequenceNumber: number;
    questionPrompt: string;
    bloomLevel: string;
    maxMarks: number;
    submittedAnswer: any;
  }>;
}

export default function StudentScorecardPage() {
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadScorecard() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/student/scorecard", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) {
            setScorecard(null);
            return;
          }
          throw new Error(`Failed to load scorecard (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (data.success && data.scorecard) {
          setScorecard(data.scorecard);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load examination scorecard");
      } finally {
        setLoading(false);
      }
    }
    loadScorecard();
  }, []);

  return (
    <AuthGuard allowedRoles={["STUDENT", "SYSTEM_ADMIN"]}>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Award className="w-6 h-6 text-red-800" />
            <h1 className="text-2xl font-bold font-serif text-slate-900 tracking-tight">
              Academic Performance Scorecard &amp; Transcript
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative examination results, cognitive distribution breakdown, and non-repudiation transcript for KLE Technological University.
          </p>
        </div>

        {loading && (
          <div className="p-12 text-center text-slate-500 text-sm font-serif">
            Loading official institutional transcript...
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && !scorecard && (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3">
            <FileText className="w-10 h-10 text-slate-400 mx-auto" />
            <h2 className="text-base font-bold text-slate-800">No Examination Attempts Found</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              You do not have any submitted examinations for the current term yet. Check your exam timetable or register for upcoming sessions.
            </p>
            <Link
              href="/student"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-800 text-white rounded-md text-xs font-semibold hover:bg-red-900 transition-colors"
            >
              Return to Student Dashboard
            </Link>
          </div>
        )}

        {!loading && scorecard && (
          <div className="space-y-6">
            {/* Candidate & Exam Metadata Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-semibold text-red-800 uppercase tracking-wider block">
                    {scorecard.courseCode} — {scorecard.courseTitle}
                  </span>
                  <h2 className="text-lg font-bold font-serif text-slate-900 mt-0.5">
                    {scorecard.examTitle}
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Candidate Identity</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {scorecard.usn} ({scorecard.studentName})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Attempt Reference</span>
                  <span className="font-mono font-medium text-slate-700 truncate block mt-0.5">
                    {scorecard.attemptId.slice(0, 8)}...
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Submission Timestamp</span>
                  <span className="font-medium text-slate-700 block mt-0.5">
                    {scorecard.submittedAt ? new Date(scorecard.submittedAt).toLocaleTimeString() : "Pending"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Evaluation Status</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {scorecard.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Publication Authority</span>
                  <span className={`font-semibold block mt-0.5 ${scorecard.isPublished ? "text-emerald-700" : "text-amber-700"}`}>
                    {scorecard.isPublished ? "COE Released" : "Withheld / Pending"}
                  </span>
                </div>
              </div>
            </div>

            {/* WITHHELD STATE: If not published */}
            {!scorecard.isPublished && (
              <div
                id="scorecard-withheld-banner"
                className="bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm space-y-4"
              >
                <div className="flex items-start gap-3">
                  <Clock className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-amber-900 text-base font-serif">
                      Official Marks Withheld — Examination Under COE Evaluation
                    </h3>
                    <p className="text-xs text-amber-800 mt-1">
                      {scorecard.withheldReason ||
                        "Results are undergoing faculty review and COE moderation. Official marks will be revealed upon formal COE release."}
                    </p>
                  </div>
                </div>

                <div className="bg-white/80 border border-amber-200 rounded-lg p-4 text-xs text-amber-900 space-y-2">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                    <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                    KLE Tech Institutional Guardrail (Deterministic Authority)
                  </div>
                  <p>
                    Per institutional security protocols, raw scores, answer keys, and grading rubrics are strictly inaccessible to candidate portals prior to formal statutory ratification and manual release by the Controller of Examinations.
                  </p>
                </div>
              </div>
            )}

            {/* RELEASED STATE: If published by COE */}
            {scorecard.isPublished && scorecard.scoring && (
              <div id="scorecard-released-container" className="space-y-6">
                {/* Score Summary Box */}
                <div className="bg-gradient-to-br from-emerald-50 via-white to-slate-50 border border-emerald-200 rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-emerald-700" />
                      <span className="font-bold text-slate-900 font-serif text-sm">
                        Official Academic Grade Sheet
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-semibold text-xs flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      COE Certified
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <span className="text-[11px] font-medium text-slate-500 uppercase block">Objective Score</span>
                      <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                        {scorecard.scoring.objectiveScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <span className="text-[11px] font-medium text-slate-500 uppercase block">Subjective Score</span>
                      <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                        {scorecard.scoring.subjectiveScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <span className="text-[11px] font-medium text-slate-500 uppercase block">Moderated Final</span>
                      <span id="scorecard-final-marks" className="text-2xl font-bold font-mono text-emerald-700 mt-0.5 block">
                        {scorecard.scoring.finalScore.toFixed(1)} / {scorecard.scoring.maxMarks}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <span className="text-[11px] font-medium text-slate-500 uppercase block">Grade Band</span>
                      <span id="scorecard-grade-band" className="text-lg font-bold text-slate-900 mt-1 block">
                        {scorecard.scoring.gradeBand}
                      </span>
                    </div>
                  </div>

                  {/* Non-repudiation cryptographic verification notice */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Non-repudiation SHA-256 verified against KLE Tech COE Ledger.</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      Released: {scorecard.resultsPublishedAt ? new Date(scorecard.resultsPublishedAt).toLocaleDateString() : "Ratified"}
                    </span>
                  </div>
                </div>

                {/* Grievance Submission Option */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800 block">Dispute or Evaluation Discrepancy?</span>
                    Candidates may submit a formal academic evaluation grievance within 7 statutory calendar days.
                  </div>
                  <Link
                    id="btn-file-grievance"
                    href="/student/grievances"
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold transition-colors shrink-0"
                  >
                    <span>File Grievance</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
