import React, { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  Award,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  FileText,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { StatusChip } from "../ui/StatusChip";

export type PostSubmissionState =
  | "SUBMITTED"
  | "OBJECTIVE_SCORING"
  | "AWAITING_SUBJECTIVE_MARKING"
  | "AWAITING_MODERATION"
  | "RESULT_PUBLISHED";

interface StepDetail {
  id: PostSubmissionState;
  label: string;
  isCompleted: boolean;
  isCurrent: boolean;
  description: string;
  isHumanGate?: boolean;
  score?: number;
  timestamp?: string | null;
}

interface SubmissionStatusData {
  success: boolean;
  attemptId: string;
  canonicalState: PostSubmissionState;
  status: string;
  rawStatus: string;
  examScheduleId: string;
  examTitle: string;
  courseCode: string;
  courseTitle: string;
  studentId: string;
  studentName: string;
  usn: string;
  submittedAt: string | null;
  resultsPublishedAt: string | null;
  isPublished: boolean;
  scoring: {
    objectiveScore: number;
    subjectiveScore: number | null;
    moderatedScore: number | null;
    totalScore: number;
    finalScore: number;
    maxMarks: number;
  };
  receiptHash: string;
  steps: StepDetail[];
  polledAt: string;
}

interface StudentSubmissionStatusTrackerProps {
  attemptId?: string;
  onResultPublished?: (data: SubmissionStatusData) => void;
  onOpenGrievance?: (attemptId: string) => void;
  className?: string;
}

export const StudentSubmissionStatusTracker: React.FC<StudentSubmissionStatusTrackerProps> = ({
  attemptId,
  onResultPublished,
  onOpenGrievance,
  className = "",
}) => {
  const [data, setData] = useState<SubmissionStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [pollCount, setPollCount] = useState<number>(0);

  const fetchStatus = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setLoading(true);
      const url = attemptId
        ? `/api/student/exam/submit?attemptId=${encodeURIComponent(attemptId)}`
        : `/api/student/exam/submit`;

      const res = await fetch(url, {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const json: SubmissionStatusData = await res.json();
      if (json && json.success) {
        setData(json);
        setError(null);
        setPollCount((prev) => prev + 1);

        // If results are officially published, stop polling and notify parent
        if (json.canonicalState === "RESULT_PUBLISHED" || json.isPublished) {
          setIsPolling(false);
          onResultPublished?.(json);
        }
      } else {
        throw new Error(json?.status || "Failed to parse submission state");
      }
    } catch (err: any) {
      console.warn("Status polling notice:", err.message);
      // Don't wipe previous data on transient network hiccup
      setData((prev) => {
        if (!prev) {
          setError(err.message || "Failed to load submission state");
        }
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [attemptId, onResultPublished]);

  // Initial fetch and automatic polling interval (every 3 seconds)
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (isPolling) {
        fetchStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchStatus, isPolling]);

  const copyReceiptHash = () => {
    if (data?.receiptHash) {
      navigator.clipboard.writeText(data.receiptHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2500);
    }
  };

  const getStatusBadge = (state: PostSubmissionState) => {
    switch (state) {
      case "RESULT_PUBLISHED":
        return <StatusChip status="success" label="Results Published" />;
      case "AWAITING_MODERATION":
        return <StatusChip status="warning" label="Awaiting COE Moderation" />;
      case "AWAITING_SUBJECTIVE_MARKING":
        return <StatusChip status="warning" label="Faculty Review Pending" />;
      case "OBJECTIVE_SCORING":
        return <StatusChip status="info" label="Auto-Scoring Objective" />;
      case "SUBMITTED":
      default:
        return <StatusChip status="info" label="Sealed & Submitted" />;
    }
  };

  if (loading && !data) {
    return (
      <Card className={`p-8 text-center space-y-4 ${className}`}>
        <div className="w-8 h-8 border-2 border-[#0F4C81] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-medium text-[#475569]">
          Connecting to authoritative evaluation ledger...
        </p>
      </Card>
    );
  }

  if (error && !data) {
    if (error.includes("404") || error.includes("No attempt found")) {
      return null;
    }
    return (
      <Card className={`p-6 border-red-200 bg-red-50/50 space-y-3 ${className}`}>
        <div className="flex items-center gap-2 text-red-700 text-sm font-semibold">
          <AlertCircle className="w-4 h-4" />
          <span>Status Ledger Unreachable</span>
        </div>
        <p className="text-xs text-red-600">{error}</p>
        <Button size="sm" variant="secondary" onClick={() => fetchStatus(true)}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          <span>Retry Connection</span>
        </Button>
      </Card>
    );
  }

  const currentState = data?.canonicalState || "SUBMITTED";
  const steps = data?.steps || [];

  return (
    <Card className={`p-6 space-y-6 ${className}`}>
      {/* 1. Header & Current Lifecycle State */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-[#0F4C81] bg-[#E8F0F8] px-2 py-0.5 rounded border border-[#CBD5E1]">
              {data?.courseCode || "CS-301"}
            </span>
            <span className="text-xs text-[#64748B]">
              Candidate: <strong className="text-[#0B2545]">{data?.studentName}</strong> ({data?.usn})
            </span>
          </div>
          <h2 className="text-lg font-bold text-[#0B2545] mt-1">
            {data?.examTitle || "Examination Submission Dossier"}
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Submitted at:{" "}
            {data?.submittedAt ? new Date(data.submittedAt).toLocaleString() : "Recently submitted"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <div className="flex items-center gap-2">
            {/* Live Polling Indicator */}
            {isPolling ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#0F4C81] bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live polling (3s)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Released & Ratified</span>
              </span>
            )}
            {getStatusBadge(currentState)}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchStatus(true)}
            title="Refresh submission status manually"
            className="cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2. 5-Stage Visual Progression Pipeline */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
          Evaluation & Ratification Lifecycle
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 pt-2">
          {steps.map((st, idx) => {
            const isCompleted = st.isCompleted;
            const isCurrent = st.isCurrent;

            return (
              <div
                key={st.id}
                className={`p-3.5 rounded-xl border text-xs transition-all relative ${
                  isCurrent
                    ? "bg-[#F0F7FF] border-[#0F4C81] ring-2 ring-[#0F4C81]/20 shadow-xs"
                    : isCompleted
                    ? "bg-[#F6FAF7] border-[#86EFAC] text-[#166534]"
                    : "bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B] opacity-75"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 border border-black/5">
                    Step {idx + 1}
                  </span>
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : isCurrent ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0F4C81] animate-ping shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </div>

                <div className="font-semibold text-xs text-[#0B2545] leading-tight mb-1">
                  {st.label}
                </div>

                <p className="text-[11px] text-[#475569] leading-snug">
                  {st.description}
                </p>

                {st.isHumanGate && (
                  <span className="inline-block mt-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    Human gate
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Non-Repudiation Cryptographic Receipt */}
      {data?.receiptHash && (
        <div className="p-4 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="font-semibold text-[#0B2545] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#0F4C81]" />
              Non-Repudiation Submission Receipt (SHA-256)
            </span>
            <div className="font-mono text-[11px] text-[#475569] break-all select-all">
              {data.receiptHash}
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={copyReceiptHash}
            className="shrink-0 cursor-pointer"
          >
            {copiedHash ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Receipt</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* 4. Real-time Scorecard Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        {/* Objective Score */}
        <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white text-xs space-y-1">
          <span className="text-[#64748B]">Objective Auto-Score:</span>
          <div className="text-xl font-bold font-mono text-[#0B2545]">
            {data?.scoring?.objectiveScore ?? 0} marks
          </div>
          <span className="text-[11px] text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Deterministic auto-graded
          </span>
        </div>

        {/* Subjective Score */}
        <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white text-xs space-y-1">
          <span className="text-[#64748B]">Subjective Section:</span>
          <div className="text-xl font-bold font-mono text-[#0B2545]">
            {data?.scoring?.subjectiveScore !== null && data?.scoring?.subjectiveScore !== undefined
              ? `${data.scoring.subjectiveScore} marks`
              : "Pending review"}
          </div>
          <span className="text-[11px] text-[#475569]">
            {data?.scoring?.subjectiveScore !== null
              ? "Faculty marked & signed"
              : "Awaiting lecturer sign-off"}
          </span>
        </div>

        {/* Total Score & Moderation */}
        <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white text-xs space-y-1">
          <span className="text-[#64748B]">Total Awarded / Max:</span>
          <div className="text-xl font-bold font-mono text-[#0B2545]">
            {data?.scoring?.finalScore ?? data?.scoring?.totalScore ?? 0} /{" "}
            {data?.scoring?.maxMarks || 50} marks
          </div>
          <span className="text-[11px] text-[#475569]">
            {data?.scoring?.moderatedScore !== null && data?.scoring?.moderatedScore !== undefined
              ? `Moderated score: ${data.scoring.moderatedScore}`
              : currentState === "RESULT_PUBLISHED"
              ? "Official final result"
              : "Provisional calculation"}
          </span>
        </div>
      </div>

      {/* 5. Published State Notice with Redressal Petitions */}
      {currentState === "RESULT_PUBLISHED" && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="font-semibold text-emerald-900 flex items-center gap-1.5 text-sm">
              <Award className="w-4 h-4 text-emerald-700" />
              Official Examination Results Released
            </span>
            <p className="text-emerald-800">
              Results have been ratified by the Controller of Examinations. Formal 72-hour grievance window is active.
            </p>
          </div>

          {onOpenGrievance && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onOpenGrievance(data.attemptId)}
              className="shrink-0 cursor-pointer"
            >
              <span>Submit Revaluation Petition</span>
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};
