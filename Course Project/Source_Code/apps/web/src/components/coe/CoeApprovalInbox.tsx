"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  Sparkles,
  Users,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Layers,
  ArrowRight,
  Radio,
  FileCheck,
  XCircle,
  RotateCcw,
  Check,
} from "lucide-react";
import type { CoeNotificationItem } from "@/app/api/coe/notifications/route";
import { CoeSplitScreenReview } from "./CoeSplitScreenReview";

interface CoeApprovalInboxProps {
  currentUser?: any;
  onRefreshExams?: () => void;
}

export const CoeApprovalInbox: React.FC<CoeApprovalInboxProps> = ({
  currentUser,
  onRefreshExams,
}) => {
  const [notifications, setNotifications] = useState<CoeNotificationItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "approved" | "revision">("pending");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [autoProgressionNotice, setAutoProgressionNotice] = useState<string | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async (quiet = false) => {
    if (!quiet) setIsRefreshing(true);
    try {
      const res = await fetch("/api/coe/notifications", {
        headers: {
          "x-user-role": "COE_ADMIN",
        },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      console.warn("Failed to fetch COE notifications:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Set up SSE listener for real-time queue updates
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/coe/notifications/sse");
      es.onopen = () => setSseConnected(true);
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "QUEUE_STATUS") {
            // Quietly refresh notifications
            fetchNotifications(true);
          }
        } catch {}
      };
      es.onerror = () => {
        setSseConnected(false);
      };
    } catch {
      setSseConnected(false);
    }

    // Polling fallback every 10 seconds
    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 10000);

    return () => {
      if (es) es.close();
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  // Automatic Queue Progression Handler
  const handleActionComplete = (updatedItem: any, nextItem?: any) => {
    // 1. Update in local state
    setNotifications((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item))
    );

    // 2. Trigger parent refresh
    onRefreshExams?.();

    // 3. Show notice and advance queue
    if (nextItem && nextItem.id) {
      setAutoProgressionNotice(`Advancing queue to next pending item...`);
      setTimeout(() => {
        setAutoProgressionNotice(null);
        setSelectedItemId(nextItem.id);
      }, 800);
    } else {
      setAutoProgressionNotice(`Action recorded. All pending queue items resolved!`);
      setTimeout(() => {
        setAutoProgressionNotice(null);
        setSelectedItemId(null);
      }, 1500);
    }

    // Refresh notifications list from server
    fetchNotifications(true);
  };

  // Filter items
  const filteredItems = notifications.filter((item) => {
    // Tab filter
    if (filterTab === "pending" && item.status !== "PENDING_COE_APPROVAL") return false;
    if (filterTab === "approved" && item.status !== "APPROVED") return false;
    if (filterTab === "revision" && item.status !== "REVISION_REQUESTED" && item.status !== "REJECTED")
      return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = item.courseCode.toLowerCase().includes(q);
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchCourseTitle = item.courseTitle.toLowerCase().includes(q);
      const matchRequester = item.requester.name.toLowerCase().includes(q);
      return matchCode || matchTitle || matchCourseTitle || matchRequester;
    }
    return true;
  });

  const pendingCount = notifications.filter((i) => i.status === "PENDING_COE_APPROVAL").length;
  const approvedCount = notifications.filter((i) => i.status === "APPROVED").length;
  const revisionCount = notifications.filter(
    (i) => i.status === "REVISION_REQUESTED" || i.status === "REJECTED"
  ).length;

  const selectedItem = notifications.find((i) => i.id === selectedItemId);

  // If split-screen review is active, render CoeSplitScreenReview
  if (selectedItem) {
    return (
      <CoeSplitScreenReview
        item={selectedItem}
        allItems={notifications}
        onActionComplete={handleActionComplete}
        onBackToQueue={() => setSelectedItemId(null)}
        onSelectAnotherItem={(id) => setSelectedItemId(id)}
      />
    );
  }

  return (
    <div id="coe-approval-inbox-view" className="space-y-5">
      {/* Top Banner & Queue Stats */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-[#E8F0F8] text-[#0F4C81] border border-[#CBD5E1]">
              COE Governance Gate
            </span>
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Statutory Ratification Queue
            </span>
            {sseConnected && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live SSE Synced
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-[#0B2545] tracking-tight">
            Actionable Examination Approval Inbox
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
            Statutory ratification desk for faculty exam blueprints, lesson plan syllabi, and proctoring lockdown protocols. Every verified blueprint generates a tamper-evident, SHA-256 signed official ratification certificate.
          </p>
        </div>

        {/* Quick Queue Counts */}
        <div className="grid grid-cols-3 gap-0 bg-slate-50 rounded-xl border border-slate-200 shrink-0 divide-x divide-slate-200">
          <div className="text-center px-4 py-2.5">
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Pending</span>
            <span className={`text-lg font-bold ${pendingCount > 0 ? "text-amber-600" : "text-slate-800"}`}>
              {pendingCount}
            </span>
          </div>
          <div className="text-center px-4 py-2.5">
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Ratified</span>
            <span className="text-lg font-bold text-emerald-600">{approvedCount}</span>
          </div>
          <div className="text-center px-4 py-2.5">
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Revision</span>
            <span className="text-lg font-bold text-slate-700">{revisionCount}</span>
          </div>
        </div>
      </div>

      {autoProgressionNotice && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-xs font-medium flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
          <span>{autoProgressionNotice}</span>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterTab("pending")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filterTab === "pending"
                ? "bg-[#0B2545] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Review</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500 text-white font-bold ml-1">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filterTab === "all"
                ? "bg-[#0B2545] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span>All Requests ({notifications.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("approved")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filterTab === "approved"
                ? "bg-[#0B2545] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ratified ({approvedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("revision")}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filterTab === "revision"
                ? "bg-[#0B2545] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Needs Revision ({revisionCount})</span>
          </button>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search course, title, faculty..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={() => fetchNotifications()}
            disabled={isRefreshing}
            className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Actionable Request Items List */}
      {isLoading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading actionable approval requests...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No requests in this view</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterTab === "pending"
              ? "All actionable requests have been reviewed and ratified. The COE queue is clear!"
              : "No blueprint requests match the selected filter criteria."}
          </p>
          {filterTab !== "all" && (
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className="mt-2 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Show all requests
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredItems.map((item) => {
            const isPending = item.status === "PENDING_COE_APPROVAL";
            const isApproved = item.status === "APPROVED";
            const isRevision = item.status === "REVISION_REQUESTED";
            const isRejected = item.status === "REJECTED";

            return (
              <div
                key={item.id}
                id={`inbox-item-${item.id}`}
                className={`bg-white rounded-xl border p-5 transition-all shadow-xs hover:border-indigo-300 ${
                  isPending
                    ? "border-amber-200 bg-amber-50/10"
                    : isApproved
                    ? "border-slate-200"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Metadata & Course Info */}
                  <div className="space-y-2 flex-1">
                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#0B2545] text-white">
                        {item.courseCode}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {item.courseTitle} • Sem {item.semester} ({item.academicYear})
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs font-mono text-slate-500">Version: {item.version}</span>

                      {/* Status chip */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          isPending
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : isApproved
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : isRevision
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-red-100 text-red-800 border border-red-300"
                        }`}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-slate-900">{item.title}</h3>

                    {/* Requester, Timestamp, Marks, Duration */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Submitted by: <strong>{item.requester.name}</strong></span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(item.submittedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })} at {new Date(item.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.totalMarks} Marks • {item.durationMinutes} mins</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{item.attachedDocs.length} Attached Doc(s)</span>
                      </span>
                    </div>

                    {/* Validation Findings Summary Pill */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Bloom Balance (50/50m)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Unit Syllabus Coverage (CO1-CO5)</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-blue-600" />
                        <span>Proctoring Lockdown Active</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                        Roster: 68/72 Eligible
                      </span>
                    </div>

                    {/* Next Action Box */}
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <div className="text-xs">
                        <span className="font-bold text-slate-800">Next Action: </span>
                        <span className="text-slate-600">{item.nextAction}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Action Button */}
                  <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      id={`btn-review-${item.id}`}
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer ${
                        isPending
                          ? "bg-[#0B2545] hover:bg-[#0F4C81] text-white"
                          : "bg-white hover:bg-slate-50 border border-slate-300 text-slate-800"
                      }`}
                    >
                      <span>{isPending ? "Split-Screen Review & Ratify" : "Inspect Ratified Record"}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <a
                      href={`/api/coe/ratification-pdf?id=${item.id}&type=${isApproved ? "ratification" : "merged"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Direct PDF Link</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
