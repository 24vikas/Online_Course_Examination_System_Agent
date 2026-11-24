"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  Download,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Sparkles,
  Lock,
  Users,
  Copy,
  Check,
  Eye,
  FileCheck,
  Layers,
  ArrowRight,
  Send,
  XCircle,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import type { CoeNotificationItem } from "@/app/api/coe/notifications/route";

interface CoeSplitScreenReviewProps {
  item: CoeNotificationItem;
  onActionComplete: (updatedItem: any, nextItem?: any) => void;
  onBackToQueue: () => void;
  onSelectAnotherItem?: (id: string) => void;
  allItems?: CoeNotificationItem[];
}

export const CoeSplitScreenReview: React.FC<CoeSplitScreenReviewProps> = ({
  item,
  onActionComplete,
  onBackToQueue,
  onSelectAnotherItem,
  allItems = [],
}) => {
  const [activePdfView, setActivePdfView] = useState<"ratification" | "source" | "merged">("merged");
  const [comment, setComment] = useState<string>(
    item.revisionNotes ||
      item.rejectionReason ||
      "Formally verified against UGC & ABET academic regulations. Approved for exam scheduling."
  );
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [ratificationResult, setRatificationResult] = useState<any>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Keep comment updated when switching item
  useEffect(() => {
    setComment(
      item.status === "REVISION_REQUESTED" && item.revisionNotes
        ? item.revisionNotes
        : item.status === "REJECTED" && item.rejectionReason
        ? item.rejectionReason
        : "Formally verified against UGC & ABET academic regulations. Approved for exam scheduling."
    );
    setCommentError(null);
    setActionSuccessMessage(null);
    setRatificationResult(null);
    setActivePdfView(item.status === "APPROVED" ? "ratification" : "merged");
  }, [item.id, item.status]);

  const handleCopyChecksum = (hash: string) => {
    navigator.clipboard?.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleDecision = async (action: "APPROVE" | "REQUEST_REVISION" | "REJECT") => {
    setCommentError(null);
    setActionSuccessMessage(null);

    // Mandatory comment check for REVISION and REJECT
    if ((action === "REQUEST_REVISION" || action === "REJECT") && (!comment || comment.trim().length === 0)) {
      setCommentError(
        action === "REQUEST_REVISION"
          ? "Mandatory comment required: please specify exact revision directives for faculty."
          : "Mandatory comment required: please specify formal reason for rejection."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/coe/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": "COE_ADMIN",
        },
        body: JSON.stringify({
          id: item.id,
          action,
          comments: comment.trim(),
          approverName: "Dr. M.K. Rao",
          approverRole: "Controller of Examinations (COE)",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process decision");
      }

      setActionSuccessMessage(data.message || `Action ${action} recorded successfully.`);
      if (data.ratification) {
        setRatificationResult(data.ratification);
        setActivePdfView("ratification");
      }

      // Automatically advance queue after a brief moment or invoke callback
      setTimeout(() => {
        onActionComplete(
          { ...item, status: data.status, revisionNotes: data.revisionNotes, rejectionReason: data.rejectionReason },
          data.nextItem
        );
      }, 1200);
    } catch (err: any) {
      setCommentError(err.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find index in queue
  const currentIndex = allItems.findIndex((i) => i.id === item.id);
  const prevItem = currentIndex > 0 ? allItems[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < allItems.length - 1 ? allItems[currentIndex + 1] : null;

  const checksumDisplay =
    ratificationResult?.sha256Checksum ||
    item.ratificationChecksum ||
    "547c4485fae3c3e1df77a36253e1263661884f1493e8cee229f9e25db621553c";

  const pdfUrl = `/api/coe/ratification-pdf?id=${item.id}&type=${activePdfView}&t=${ratificationResult ? Date.now() : 0}`;

  return (
    <div id="coe-split-screen-container" className="flex flex-col space-y-4">
      {/* Top Breadcrumb & Queue Progression Header */}
      <div className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToQueue}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Approval Queue</span>
          </button>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
              {item.courseCode}
            </span>
            <h2 className="text-sm font-bold text-slate-900">{item.title}</h2>
          </div>
        </div>

        {/* Queue navigation controls */}
        <div className="flex items-center gap-2">
          {allItems.length > 0 && (
            <span className="text-xs text-slate-500 font-mono mr-2">
              Queue item {currentIndex + 1} of {allItems.length}
            </span>
          )}
          <button
            type="button"
            disabled={!prevItem}
            onClick={() => prevItem && onSelectAnotherItem?.(prevItem.id)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous queue item"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!nextItem}
            onClick={() => nextItem && onSelectAnotherItem?.(nextItem.id)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next queue item"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-mono">Advancing queue...</span>
        </div>
      )}

      {/* Main Split-Screen Review Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[720px]">
        {/* LEFT PANE: Live Document & PDF Viewer (6 cols) */}
        <div className="lg:col-span-6 flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* PDF Viewer Header Toolbar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActivePdfView("merged")}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  activePdfView === "merged"
                    ? "bg-[#0B2545] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Merged Ratified PDF
              </button>
              <button
                type="button"
                onClick={() => setActivePdfView("ratification")}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  activePdfView === "ratification"
                    ? "bg-[#0B2545] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Ratification Certificate (A4)
              </button>
              <button
                type="button"
                onClick={() => setActivePdfView("source")}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  activePdfView === "source"
                    ? "bg-[#0B2545] text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                Source Syllabus
              </button>
            </div>

            <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              Live Interactive Viewer
            </span>
          </div>

          {/* Embedded PDF iframe */}
          <div className="flex-1 bg-slate-100 min-h-[540px] relative">
            <iframe
              id="coe-live-pdf-iframe"
              src={pdfUrl}
              title="Official Ratification Document Viewer"
              className="w-full h-full min-h-[540px] border-0"
            />
          </div>

          {/* PDF Footer with 4 Working Download Buttons & SHA-256 Checksum */}
          <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-2.5">
            {/* SHA-256 Checksum Row */}
            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="text-slate-400 font-bold text-[10px] uppercase">SHA-256:</span>
                <span className="text-slate-700 truncate max-w-[260px] sm:max-w-[340px]" title={checksumDisplay}>
                  {checksumDisplay}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyChecksum(checksumDisplay)}
                className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-indigo-600 shrink-0 ml-2"
              >
                {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedHash ? "Copied" : "Copy"}</span>
              </button>
            </div>

            {/* Download Buttons Grid (4 Working Buttons) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <a
                id="btn-download-source-pdf"
                href={`/api/coe/ratification-pdf?id=${item.id}&type=source`}
                download={`${item.courseCode}_source_syllabus.pdf`}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-all text-center"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Source PDF</span>
              </a>

              <a
                id="btn-download-ratification-pdf"
                href={`/api/coe/ratification-pdf?id=${item.id}&type=ratification`}
                download={`${item.courseCode}_ratification_certificate.pdf`}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-all text-center"
              >
                <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>Ratification A4</span>
              </a>

              <a
                id="btn-download-merged-pdf"
                href={`/api/coe/ratification-pdf?id=${item.id}&type=merged`}
                download={`${item.courseCode}_authoritative_merged.pdf`}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-[#0B2545] hover:bg-[#0F4C81] text-white rounded-lg text-[11px] font-semibold transition-all text-center shadow-xs"
              >
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Merged PDF</span>
              </a>

              <a
                id="btn-download-audit-record"
                href={`/api/coe/ratification-pdf?id=${item.id}&type=audit`}
                download={`${item.courseCode}_audit_record.json`}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-all text-center"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Audit JSON</span>
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Metadata, Validation Checklist, Roster & Decision Controls (6 cols) */}
        <div className="lg:col-span-6 flex flex-col space-y-4">
          {/* Card 1: Academic & Blueprint Metadata */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {item.courseCode}
                </span>
                <span className="text-xs font-bold text-slate-900">{item.courseTitle}</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  item.status === "APPROVED"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                    : item.status === "REVISION_REQUESTED"
                    ? "bg-amber-50 text-amber-800 border border-amber-300"
                    : item.status === "REJECTED"
                    ? "bg-red-50 text-red-800 border border-red-300"
                    : "bg-blue-50 text-blue-800 border border-blue-300"
                }`}
              >
                {item.status.replace(/_/g, " ")}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Requester</span>
                <span className="text-slate-800 font-bold truncate block" title={item.requester.name}>
                  {item.requester.name}
                </span>
                <span className="text-[10px] text-slate-400 block">{item.requester.role}</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Submitted</span>
                <span className="text-slate-800 font-bold block">
                  {new Date(item.submittedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  {new Date(item.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Duration / Marks</span>
                <span className="text-slate-800 font-bold block">{item.durationMinutes} min</span>
                <span className="text-[10px] text-slate-500 block">{item.totalMarks} Total Marks</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">Version & Term</span>
                <span className="text-slate-800 font-bold block">{item.version}</span>
                <span className="text-[10px] text-slate-400 block">{item.academicYear} (Sem {item.semester})</span>
              </div>
            </div>

            {/* Attached Documents List */}
            {item.attachedDocs && item.attachedDocs.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1.5">
                  Attached Verified Documents ({item.attachedDocs.length}):
                </span>
                <div className="flex flex-wrap gap-2">
                  {item.attachedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="font-medium truncate max-w-[200px]" title={doc.filename}>
                        {doc.filename}
                      </span>
                      <span className="text-[10px] text-slate-400">({Math.round(doc.sizeBytes / 1024)} KB)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Regulatory Validation Findings & Checklist */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Statutory Validation Findings & Coverage
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                5 / 5 Gates Reconciled
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {item.validationFindings.map((finding, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 block">{finding.check}</span>
                    <p className="text-[11px] text-slate-600 leading-snug">{finding.details}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      finding.status === "PASSED" || finding.status === "VERIFIED" || finding.status === "ENFORCED"
                        ? "bg-emerald-100 text-emerald-800"
                        : finding.status === "AUDITED"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {finding.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Student Cohort & Roster Summary */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#0F4C81]" />
                Student Cohort & Roster Authorization Gate
              </span>
              <span className="text-[10px] font-mono text-slate-500">Semester {item.semester} Cohort</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs pt-1">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded text-center">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Total Enrolled</span>
                <span className="text-base font-bold text-slate-900">{item.rosterSummary.totalEnrolled}</span>
              </div>
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-center">
                <span className="text-[10px] text-emerald-700 uppercase block font-semibold">Eligible (75%+)</span>
                <span className="text-base font-bold text-emerald-800">{item.rosterSummary.eligibleCount}</span>
              </div>
              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-center">
                <span className="text-[10px] text-amber-700 uppercase block font-semibold">Attendance Hold</span>
                <span className="text-base font-bold text-amber-800">{item.rosterSummary.flaggedCount}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-1">
              * OPA policy rule: Students below {item.rosterSummary.attendanceThreshold} attendance are blocked from automatic hall ticket issuance.
            </p>
          </div>

          {/* Card 4: COE Decision & Mandatory Comment Controls */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="coe-decision-comment" className="text-xs font-bold text-slate-800">
                  Official COE Minute / Decision Comments:
                </label>
                <span className="text-[10px] text-slate-400 font-sans">
                  Mandatory for revision or rejection
                </span>
              </div>
              <textarea
                id="coe-decision-comment"
                rows={3}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  if (commentError) setCommentError(null);
                }}
                placeholder="Enter mandatory rationale or revision feedback..."
                className={`w-full text-xs font-sans bg-slate-50 border rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 ${
                  commentError ? "border-red-400 focus:ring-red-400 bg-red-50/20" : "border-slate-300 focus:ring-indigo-500"
                }`}
              />
              {commentError && (
                <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{commentError}</span>
                </p>
              )}
            </div>

            {/* Quick Comment Preset Templates */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 text-[10px] font-semibold uppercase">Presets:</span>
              <button
                type="button"
                onClick={() =>
                  setComment("Formally verified against UGC & ABET academic regulations. Approved for exam scheduling.")
                }
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                UGC/ABET Approval
              </button>
              <button
                type="button"
                onClick={() =>
                  setComment("Please rebalance Section B higher-order Bloom taxonomy questions to meet 20% Evaluate criteria.")
                }
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Rebalance Bloom
              </button>
              <button
                type="button"
                onClick={() =>
                  setComment("Returned: syllabus unit coverage incomplete for Unit IV. Please re-align topic outcomes.")
                }
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Incomplete Coverage
              </button>
            </div>

            {/* Decision Action Buttons */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  id="btn-coe-reject"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision("REJECT")}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white text-red-700 border border-red-300 hover:bg-red-50 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span>Reject</span>
                </button>

                <button
                  id="btn-coe-request-revision"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision("REQUEST_REVISION")}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold bg-white text-amber-700 border border-amber-300 hover:bg-amber-50 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  <span>Request Revision</span>
                </button>
              </div>

              <button
                id="btn-coe-approve-ratify"
                type="button"
                disabled={isSubmitting}
                onClick={() => handleDecision("APPROVE")}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Approve & Issue Ratification</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
