"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import {
  ShieldCheck,
  BarChart3,
  Users,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Send,
  FileSpreadsheet,
  RefreshCw,
  Award,
  Lock
} from "lucide-react";
import Link from "next/link";

interface CohortStatistics {
  totalCandidates: number;
  averageScore: number;
  minimumScore: number;
  maximumScore: number;
  standardDeviation: number;
  passCount: number;
  passRate: number;
  moderatedCount: number;
  releasedCount: number;
}

interface CandidateRow {
  attemptId: string;
  usn: string;
  studentName: string;
  status: string;
  objectiveScore: number;
  subjectiveScore: number;
  rawTotalScore: number;
  moderatedScore: number | null;
  moderationNotes: string | null;
}

export default function CoeModerationPage() {
  const [stats, setStats] = useState<CohortStatistics | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Moderation form state
  const [moderationDelta, setModerationDelta] = useState<number>(2.0);
  const [moderationNotes, setModerationNotes] = useState<string>(
    "COE Board statistical moderation approved across examination cohort."
  );
  const [applyingModeration, setApplyingModeration] = useState(false);
  const [publishingResults, setPublishingResults] = useState(false);

  const fetchModerationData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const scheduleIdParam = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("scheduleId")
        : null;

      const url = scheduleIdParam
        ? `/api/coe/moderation?scheduleId=${encodeURIComponent(scheduleIdParam)}`
        : `/api/coe/moderation`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load moderation records (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.statistics);
        setCandidates(data.candidates || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load moderation data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModerationData();
  }, [fetchModerationData]);

  const handleApplyModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplyingModeration(true);
    setActionSuccess(null);
    setError(null);

    try {
      const scheduleIdParam = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("scheduleId")
        : null;

      const res = await fetch("/api/coe/moderate-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: scheduleIdParam || undefined,
          moderationDelta: Number(moderationDelta),
          moderationNotes: moderationNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to apply statistical moderation");
      }

      setActionSuccess(`Moderation Applied: ${data.message || `Updated ${data.affectedRows} candidate records.`}`);
      await fetchModerationData();
    } catch (err: any) {
      setError(err.message || "Failed to commit score moderation");
    } finally {
      setApplyingModeration(false);
    }
  };

  const handlePublishResults = async () => {
    if (!confirm("Confirm Statutory Result Publication: Once authorized, final marks will become immediately visible on student scorecards. Proceed?")) {
      return;
    }

    setPublishingResults(true);
    setActionSuccess(null);
    setError(null);

    try {
      const scheduleIdParam = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("scheduleId")
        : null;

      const res = await fetch("/api/coe/results/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: scheduleIdParam || undefined,
          reason: "Formal COE Board statutory release after score moderation.",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to publish examination results");
      }

      setActionSuccess(`Statutory Release Confirmed: Results published for ${data.releasedAttemptsCount} candidate attempts.`);
      await fetchModerationData();
    } catch (err: any) {
      setError(err.message || "Failed to publish examination results");
    } finally {
      setPublishingResults(false);
    }
  };

  return (
    <AuthGuard allowedRoles={["COE_ADMIN", "SYSTEM_ADMIN"]}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-red-800" />
              <h1 className="text-2xl font-bold font-serif text-slate-900 tracking-tight">
                COE Statistical Moderation &amp; Result Authority
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Authoritative post-examination moderation, score distribution analysis, and immutable statutory result release.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchModerationData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Cohort
            </button>
            <Link
              href="/coe/results"
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-md transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              CSV Export Center
            </Link>
          </div>
        </div>

        {/* Action Alerts */}
        {actionSuccess && (
          <div
            id="moderation-success-banner"
            role="alert"
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center gap-2.5 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
        )}

        {error && (
          <div
            id="moderation-error-banner"
            role="alert"
            className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm flex items-center gap-2.5 shadow-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Statistical Metrics Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">Total Candidates</span>
              <span id="stat-total-candidates" className="text-2xl font-bold text-slate-900 mt-1 block">
                {stats.totalCandidates}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">Cohort Average</span>
              <span id="stat-avg-score" className="text-2xl font-bold text-slate-900 mt-1 block">
                {stats.averageScore.toFixed(1)}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">Standard Dev (σ)</span>
              <span id="stat-stddev-score" className="text-2xl font-bold text-slate-900 mt-1 block">
                {stats.standardDeviation.toFixed(2)}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">Pass Rate</span>
              <span id="stat-pass-rate" className="text-2xl font-bold text-emerald-600 mt-1 block">
                {stats.passRate}%
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">Moderated</span>
              <span id="stat-moderated-count" className="text-2xl font-bold text-blue-600 mt-1 block">
                {stats.moderatedCount}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">Released</span>
              <span id="stat-released-count" className="text-2xl font-bold text-purple-600 mt-1 block">
                {stats.releasedCount}
              </span>
            </div>
          </div>
        )}

        {/* Action Panel: Moderation + Statutory Release */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Moderation Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-slate-900">Statistical Cohort Moderation</h2>
            </div>
            <p className="text-xs text-slate-500">
              Apply uniform mark adjustment across the active cohort to normalize standard deviation or correct curriculum rubric variations.
            </p>

            <form onSubmit={handleApplyModeration} className="space-y-4">
              <div>
                <label htmlFor="input-moderation-delta" className="block text-xs font-medium text-slate-700 mb-1">
                  Mark Adjustment (Delta)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="input-moderation-delta"
                    type="number"
                    step="0.5"
                    value={moderationDelta}
                    onChange={(e) => setModerationDelta(parseFloat(e.target.value) || 0)}
                    required
                    className="w-28 px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <span className="text-xs text-slate-500">marks per candidate (clamped between 0 and max marks)</span>
                </div>
              </div>

              <div>
                <label htmlFor="input-moderation-notes" className="block text-xs font-medium text-slate-700 mb-1">
                  Statutory Justification &amp; Minute Reference
                </label>
                <input
                  id="input-moderation-notes"
                  type="text"
                  value={moderationNotes}
                  onChange={(e) => setModerationNotes(e.target.value)}
                  required
                  placeholder="e.g. Approved under KLE Tech COE Resolution 2026/04"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <button
                id="btn-apply-moderation"
                type="submit"
                disabled={applyingModeration || loading}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold text-xs rounded-md shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                {applyingModeration ? "Committing Moderation..." : "Apply Statistical Moderation"}
              </button>
            </form>
          </div>

          {/* Statutory Release Panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Lock className="w-5 h-5 text-red-800" />
                <h2 className="font-semibold text-slate-900">Authoritative Statutory Release</h2>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Under the KLE Technological University deterministic examination charter, result release requires explicit, audited manual transaction by the Controller of Examinations.
              </p>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  Irrevocable Publication Seal
                </div>
                <p>
                  Releasing results updates attempt records to <code>RELEASED</code>, unseals scorecards on student portals, and writes a non-repudiation audit event to the institutional ledger.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                id="btn-publish-results"
                onClick={handlePublishResults}
                disabled={publishingResults || loading}
                className="w-full px-5 py-3 bg-[#8B1D24] hover:bg-[#73171D] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-md shadow transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Award className="w-4 h-4" />
                {publishingResults ? "Authorizing Publication..." : "Authorize & Release Results"}
              </button>
            </div>
          </div>
        </div>

        {/* Candidate Breakdown Ledger */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Cohort Candidate Roster &amp; Scores</h3>
            <span className="text-xs text-slate-500">{candidates.length} Candidate Records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">USN</th>
                  <th className="py-3 px-4">Candidate Name</th>
                  <th className="py-3 px-4">Objective Score</th>
                  <th className="py-3 px-4">Subjective Score</th>
                  <th className="py-3 px-4">Raw Total</th>
                  <th className="py-3 px-4">Moderated Score</th>
                  <th className="py-3 px-4">Lifecycle Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No candidate submissions recorded for this schedule yet.
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => (
                    <tr key={c.attemptId} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{c.usn}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{c.studentName}</td>
                      <td className="py-3 px-4 font-mono">{c.objectiveScore.toFixed(1)}</td>
                      <td className="py-3 px-4 font-mono">{c.subjectiveScore.toFixed(1)}</td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{c.rawTotalScore.toFixed(1)}</td>
                      <td className="py-3 px-4 font-mono font-semibold text-blue-700">
                        {c.moderatedScore !== null ? c.moderatedScore.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            c.status === "RELEASED" || c.status === "RESULT_PUBLISHED"
                              ? "bg-purple-100 text-purple-800"
                              : c.status === "OBJECTIVE_SCORED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
