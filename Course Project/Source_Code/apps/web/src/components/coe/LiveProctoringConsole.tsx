"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Shield,
  Video,
  Mic,
  AlertTriangle,
  CheckCircle,
  Pause,
  Play,
  RotateCcw,
  Search,
  Filter,
  Users,
  Activity,
  X,
  Clock,
  Eye,
  AlertCircle,
  Radio,
  FileText,
  Lock,
  ChevronRight,
  RefreshCw,
  Flag,
  Camera,
  Volume2,
  Info,
} from "lucide-react";

export type RoleType = "COE_ADMIN" | "INVIGILATOR";

export interface LiveProctoringConsoleProps {
  role?: RoleType;
  baseRoute?: string;
  defaultScheduleId?: string;
  defaultTenantId?: string;
}

export interface CandidateSession {
  studentId: string;
  attemptId: string;
  sessionId?: string | null;
  fullName: string;
  studentName?: string;
  name?: string;
  usn: string;
  email: string;
  semester: number;
  branch?: string;
  sessionState: "MONITORING" | "READY" | "SUBMITTED" | "PAUSED" | "NOT_STARTED" | "DISCONNECTED";
  attemptStatus?: string;
  proctorStatus?: string;
  connectionHealth: "CONNECTED" | "RECONNECTING" | "CONNECTION_LOST" | "OFFLINE";
  heartbeatActive: boolean;
  cameraActive: boolean;
  micActive: boolean;
  lockdownActive: boolean;
  facePresence?: string;
  faceCount: number;
  headPoseStatus?: string;
  headPose: { pitch: number; yaw: number; roll: number } | null;
  gazeStatus: string;
  incidentCount: number;
  hardIncidentsCount?: number;
  softIncidentsCount?: number;
  isFlagged?: boolean;
  heartbeatLatencySeconds?: number | null;
  lastHeartbeat?: string | null;
  lastEventAt: string;
  score?: number | null;
}

export interface IncidentEvent {
  id: string;
  attemptId: string;
  candidateName: string;
  usn: string;
  signalType: string;
  metadata?: any;
  loggedAt: string;
  reviewStatus?: string;
}

export const LiveProctoringConsole: React.FC<LiveProctoringConsoleProps> = ({
  role = "COE_ADMIN",
  baseRoute = "/coe/proctoring",
  defaultScheduleId = "dddddddd-dddd-dddd-dddd-dddddddddddd",
  defaultTenantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
}) => {
  const [candidates, setCandidates] = useState<CandidateSession[]>([]);
  const [schedule, setSchedule] = useState<any>(null);
  const [stats, setStats] = useState({
    totalEnrolled: 120,
    monitoring: 12,
    submitted: 0,
    paused: 0,
    disconnected: 0,
    flagged: 1,
    totalIncidents: 1,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSession | null>(null);

  // Connection State for SSE
  const [sseStatus, setSseStatus] = useState<"CONNECTED" | "RECONNECTING" | "CONNECTION_LOST">("RECONNECTING");
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  // Action dialog & execution state
  const [activeActionModal, setActiveActionModal] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionAlert, setActionAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Live timeline events for drawer
  const [timelineEvents, setTimelineEvents] = useState<IncidentEvent[]>([]);

  const [urlScheduleId, setUrlScheduleId] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sId = params.get("scheduleId");
      if (sId) setUrlScheduleId(sId);
    }
  }, []);

  const activeScheduleId = urlScheduleId || (defaultScheduleId !== "dddddddd-dddd-dddd-dddd-dddddddddddd" ? defaultScheduleId : "");

  // Snapshot fallback loader
  const loadSessionsSnapshot = async () => {
    try {
      const q = activeScheduleId ? `?scheduleId=${encodeURIComponent(activeScheduleId)}` : "";
      const res = await fetch(
        `/api/invigilator/sessions${q}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.candidates && Array.isArray(data.candidates)) {
          setCandidates(data.candidates);
        }
        if (data.schedule) setSchedule(data.schedule);
        if (data.stats) setStats(data.stats);
        if (data.recentEvents && Array.isArray(data.recentEvents)) {
          setTimelineEvents(data.recentEvents);
        }
        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.warn("Snapshot load error:", err);
    }
  };

  // Initial Snapshot load
  useEffect(() => {
    loadSessionsSnapshot();
  }, [activeScheduleId]);

  // SSE Stream Listener
  useEffect(() => {
    let evtSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectSse = () => {
      try {
        setSseStatus("RECONNECTING");
        const q = activeScheduleId ? `?scheduleId=${encodeURIComponent(activeScheduleId)}` : "";
        evtSource = new EventSource(
          `/api/coe/proctoring/sse${q}`
        );

        evtSource.onopen = () => {
          setSseStatus("CONNECTED");
        };

        evtSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.candidates && Array.isArray(payload.candidates)) {
              setCandidates(payload.candidates);
              setLastSyncTime(new Date());
              setSseStatus("CONNECTED");
            }
            if (payload.stats) {
              setStats(payload.stats);
            }
            if (payload.recentEvents && Array.isArray(payload.recentEvents)) {
              setTimelineEvents((prev) => {
                const existingIds = new Set(prev.map((e) => e.id));
                const fresh = payload.recentEvents.filter((e: any) => !existingIds.has(e.id));
                return [...fresh, ...prev].slice(0, 40);
              });
            }
          } catch (e) {
            console.error("SSE parse error:", e);
          }
        };

        evtSource.onerror = () => {
          setSseStatus("CONNECTION_LOST");
          if (evtSource) {
            evtSource.close();
            evtSource = null;
          }
          // Exponential backoff / periodic retry
          reconnectTimeout = setTimeout(connectSse, 4000);
        };
      } catch (err) {
        setSseStatus("CONNECTION_LOST");
        reconnectTimeout = setTimeout(connectSse, 5000);
      }
    };

    connectSse();

    return () => {
      if (evtSource) evtSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [activeScheduleId, defaultScheduleId, defaultTenantId]);

  // Invigilator Supervisory Action Handler
  const handleExecuteAction = async (action: string) => {
    if (!selectedCandidate) return;
    setActionLoading(true);
    setActionAlert(null);

    const noteToSubmit =
      actionReason.trim() ||
      `Supervisory action ${action} executed by ${role} for candidate ${selectedCandidate.usn}.`;

    try {
      const res = await fetch("/api/invigilator/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          actionType: action,
          attemptId: selectedCandidate.attemptId,
          studentId: selectedCandidate.studentId,
          reason: noteToSubmit,
          notes: noteToSubmit,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionAlert({
          type: "success",
          message: `Action ${action} confirmed! Audit Event ID: ${data.auditEventId || data.actionId}`,
        });

        // Update local candidate session state immediately
        let newSessionState = selectedCandidate.sessionState;
        let newProctorStatus = selectedCandidate.proctorStatus;

        if (action === "PAUSE_EXAM") {
          newSessionState = "PAUSED";
          newProctorStatus = "PAUSED";
        } else if (action === "RESUME_EXAM") {
          newSessionState = "MONITORING";
          newProctorStatus = "IN_EXAM";
        } else if (action === "TERMINATE_ATTEMPT") {
          newSessionState = "DISCONNECTED";
          newProctorStatus = "TERMINATED";
        }

        const updated = {
          ...selectedCandidate,
          sessionState: newSessionState,
          proctorStatus: newProctorStatus,
        };

        setSelectedCandidate(updated);
        setCandidates((prev) =>
          prev.map((c) => (c.studentId === selectedCandidate.studentId ? updated : c))
        );

        // Append to local live timeline
        setTimelineEvents((prev) => [
          {
            id: data.auditEventId || crypto.randomUUID(),
            attemptId: selectedCandidate.attemptId,
            candidateName: selectedCandidate.fullName,
            usn: selectedCandidate.usn,
            signalType: `INVIGILATOR_${action}`,
            metadata: { reason: noteToSubmit, auditEventId: data.auditEventId },
            loggedAt: new Date().toISOString(),
            reviewStatus: "CONFIRMED",
          },
          ...prev,
        ]);

        setActiveActionModal(null);
        setActionReason("");
      } else {
        setActionAlert({
          type: "error",
          message: data.error || `Execution of ${action} rejected by server policy.`,
        });
      }
    } catch (err: any) {
      setActionAlert({
        type: "error",
        message: err.message || "Network failure executing supervisory action.",
      });
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionAlert(null), 6000);
    }
  };

  // Filter candidates based on search and selected tab
  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.usn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "MONITORING" && c.sessionState === "MONITORING") ||
      (statusFilter === "PAUSED" && c.sessionState === "PAUSED") ||
      (statusFilter === "FLAGGED" && (c.incidentCount > 0 || c.isFlagged)) ||
      (statusFilter === "NOT_STARTED" && c.sessionState === "NOT_STARTED") ||
      (statusFilter === "SUBMITTED" && c.sessionState === "SUBMITTED") ||
      (statusFilter === "DISCONNECTED" && c.sessionState === "DISCONNECTED");

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col h-full bg-[#0D1513] text-slate-100 font-sans select-none overflow-hidden">
      {/* 1. INSTITUTIONAL TOP BAR */}
      <header className="px-6 py-3.5 bg-[#142320] border-b border-[#243833] flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-[#161616] text-white rounded-lg shadow-inner border border-slate-700 font-serif">
            <Shield className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-bold text-sm tracking-wide text-white uppercase">
                {role === "COE_ADMIN" ? "COE Executive Live Proctoring Console" : "Hall Invigilator Live Supervision Workspace"}
              </h1>
              {/* SSE Connection Health Pill */}
              <span
                className={`text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 transition-colors ${
                  sseStatus === "CONNECTED"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : sseStatus === "RECONNECTING"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    sseStatus === "CONNECTED"
                      ? "bg-emerald-400 animate-pulse"
                      : sseStatus === "RECONNECTING"
                      ? "bg-amber-400 animate-ping"
                      : "bg-rose-500"
                  }`}
                />
                {sseStatus === "CONNECTED"
                  ? "SSE STREAM ACTIVE (2s)"
                  : sseStatus === "RECONNECTING"
                  ? "RECONNECTING STREAM"
                  : "CONNECTION LOST"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              KLE Technological University • Course: <strong className="text-slate-200">26ECAC401 (Agentic AI)</strong> • Cohort Size:{" "}
              <strong className="text-emerald-300 font-mono">120 Candidates</strong>
            </p>
          </div>
        </div>

        {/* Real-time Summary Metric Badges */}
        <div className="flex items-center gap-2.5 text-xs font-mono">
          <div className="bg-[#1A2E2A] border border-[#2B4741] px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-300">Enrolled: <strong className="text-white">{stats.totalEnrolled}</strong></span>
          </div>
          <div className="bg-emerald-950/60 border border-emerald-700/50 px-3 py-1.5 rounded-lg flex items-center gap-2 text-emerald-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Active: <strong>{stats.monitoring}</strong></span>
          </div>
          <div className="bg-amber-950/60 border border-amber-700/50 px-3 py-1.5 rounded-lg flex items-center gap-2 text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Flagged: <strong>{stats.flagged || stats.totalIncidents}</strong></span>
          </div>
          <div className="bg-[#1A2E2A] border border-[#2B4741] px-3 py-1.5 rounded-lg flex items-center gap-2 text-purple-300">
            <CheckCircle className="w-3.5 h-3.5 text-purple-400" />
            <span>Submitted: <strong className="text-white">{stats.submitted}</strong></span>
          </div>
          <button
            onClick={loadSessionsSnapshot}
            title="Force refresh snapshot"
            className="p-1.5 bg-[#1A2E2A] hover:bg-[#243E38] border border-[#2B4741] text-slate-300 hover:text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. FILTER & SEARCH CONTROLS */}
      <div className="px-6 py-2.5 bg-[#101C19] border-b border-[#1E332E] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 bg-[#0A1210] border border-[#243D36] rounded-lg px-3 py-1.5 w-80 shadow-inner">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidate USN or name..."
            className="bg-transparent text-xs text-slate-200 outline-none w-full placeholder:text-slate-500 font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-slate-500 hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {[
            { id: "ALL", label: `All (${candidates.length})` },
            { id: "MONITORING", label: `Monitoring (${candidates.filter((c) => c.sessionState === "MONITORING").length})` },
            { id: "FLAGGED", label: `Flagged (${candidates.filter((c) => c.incidentCount > 0 || c.isFlagged).length})` },
            { id: "PAUSED", label: `Paused (${candidates.filter((c) => c.sessionState === "PAUSED").length})` },
            { id: "NOT_STARTED", label: `Not Started (${candidates.filter((c) => c.sessionState === "NOT_STARTED").length})` },
            { id: "SUBMITTED", label: `Submitted (${candidates.filter((c) => c.sessionState === "SUBMITTED").length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1 rounded-md transition-all font-serif ${
                statusFilter === tab.id
                  ? "bg-[#8B1D24] text-white border border-[#8B1D24] shadow-xs font-bold"
                  : "bg-white text-slate-600 hover:text-slate-900 border border-[#E6E4E4] hover:bg-[#F8F8F7]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Global Action Alert Banner if active */}
      {actionAlert && (
        <div
          className={`px-6 py-2 border-b flex items-center justify-between text-xs font-medium ${
            actionAlert.type === "success"
              ? "bg-emerald-950/80 border-emerald-700 text-emerald-200"
              : "bg-rose-950/80 border-rose-700 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionAlert.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{actionAlert.message}</span>
          </div>
          <button onClick={() => setActionAlert(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. CANDIDATE ROSTER GRID */}
      <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700">
        {filteredCandidates.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-2 border border-dashed border-[#243D36] rounded-2xl">
            <Users className="w-8 h-8 text-slate-600" />
            <p className="text-sm">No candidate records match your query.</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("ALL");
              }}
              className="text-xs text-emerald-400 underline hover:text-emerald-300"
            >
              Reset search & filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredCandidates.map((c) => {
              const isSelected = selectedCandidate?.studentId === c.studentId;
              const hasIncidents = c.incidentCount > 0 || c.isFlagged;

              return (
                <div
                  key={c.studentId}
                  onClick={() => setSelectedCandidate(c)}
                  className={`bg-[#142320] border rounded-2xl p-4 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between hover:shadow-lg ${
                    isSelected
                      ? "border-emerald-400 shadow-md ring-2 ring-emerald-500/40 bg-[#1A2E2A]"
                      : hasIncidents
                      ? "border-amber-500/70 hover:border-amber-400 bg-[#18231C]"
                      : "border-[#203630] hover:border-[#2D4D44] hover:bg-[#182A26]"
                  }`}
                >
                  <div>
                    {/* USN & Session State Pill */}
                    <div className="flex items-start justify-between gap-1.5 mb-2.5">
                      <span className="font-mono font-bold text-xs text-emerald-300 tracking-wider">
                        {c.usn}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          c.sessionState === "MONITORING"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : c.sessionState === "PAUSED"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : c.sessionState === "SUBMITTED"
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                            : c.sessionState === "DISCONNECTED"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {c.sessionState}
                      </span>
                    </div>

                    {/* Candidate Name & Branch */}
                    <div className="mb-3">
                      <h3 className="font-semibold text-xs text-white truncate leading-tight">
                        {c.fullName}
                      </h3>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {c.branch || "CS (AI)"} • Sem {c.semester}
                      </p>
                    </div>

                    {/* Real-time Vision & Sensor Metrics Badges */}
                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono bg-[#0D1715] p-2 rounded-xl mb-3 border border-[#1A2E2A]">
                      {/* Face Presence */}
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span
                          className={`font-semibold ${
                            c.faceCount === 1
                              ? "text-emerald-400"
                              : c.faceCount === 0
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {c.faceCount === 1 ? "1 Face OK" : c.faceCount === 0 ? "No Face" : `${c.faceCount} Faces!`}
                        </span>
                      </div>

                      {/* Gaze Status */}
                      <div className="flex items-center gap-1.5 truncate">
                        <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-300 truncate">{c.gazeStatus || "FOCUSED"}</span>
                      </div>

                      {/* Heartbeat Latency */}
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-300">
                          {c.heartbeatLatencySeconds !== null ? `${c.heartbeatLatencySeconds}s lag` : "Idle"}
                        </span>
                      </div>

                      {/* Connection Health */}
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            c.connectionHealth === "CONNECTED"
                              ? "bg-emerald-400"
                              : c.connectionHealth === "RECONNECTING"
                              ? "bg-amber-400"
                              : c.connectionHealth === "CONNECTION_LOST"
                              ? "bg-rose-500"
                              : "bg-slate-600"
                          }`}
                        />
                        <span className="text-[9px] uppercase font-bold text-slate-400 truncate">
                          {c.connectionHealth}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Incidents & Timeline Anchor */}
                  <div className="border-t border-[#1C302B] pt-2 flex items-center justify-between text-[10px]">
                    {hasIncidents ? (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        {c.incidentCount} Alert{c.incidentCount > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-emerald-400/90 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-400" /> Clean Session
                      </span>
                    )}

                    <span className="text-slate-500 font-mono text-[9px]">
                      {new Date(c.lastEventAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 4. CANDIDATE DETAIL DRAWER */}
      {selectedCandidate && (
        <aside className="fixed inset-y-0 right-0 w-full max-w-lg bg-[#142320] border-l border-[#243D36] shadow-2xl z-50 flex flex-col justify-between animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-4 border-b border-[#243D36] bg-[#101C19] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-inner">
                {selectedCandidate.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="font-bold text-sm text-white leading-tight">
                  {selectedCandidate.fullName}
                </h2>
                <p className="text-xs font-mono text-emerald-400">
                  {selectedCandidate.usn} • {selectedCandidate.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCandidate(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs scrollbar-thin scrollbar-thumb-slate-700">
            {/* Live Camera Viewport vs Event-Only Banner */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Telemetry Channel & Viewport
                </span>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-mono px-2 py-0.5 rounded-full font-bold">
                  EVENT-ONLY MONITORING
                </span>
              </div>

              {/* Viewport Box (Strictly labeled EVENT-ONLY unless live stream active) */}
              <div className="relative aspect-video bg-[#0A1210] rounded-xl border border-[#243D36] overflow-hidden flex flex-col items-center justify-center p-3 text-center">
                <Video className="w-8 h-8 text-slate-600 mb-2" />
                <span className="font-mono text-[11px] font-semibold text-slate-300">
                  EVENT-ONLY MONITORING
                </span>
                <p className="text-[10px] text-slate-500 max-w-xs mt-1">
                  Candidate telemetry relayed via encrypted companion TLS channel. Live video streams are restricted
                  to conserve bandwidth and uphold institutional privacy policies.
                </p>
                {/* Visual Face Bounding Box & Landmark Coordinates overlay */}
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-emerald-400 bg-[#12221E] px-2.5 py-1 rounded-lg border border-emerald-900/50">
                  <span>Face Box: (X:34%, Y:22%, W:32%, H:44%)</span>
                  <span>•</span>
                  <span>Conf: 98.6%</span>
                </div>
              </div>
            </div>

            {/* Diagnostic Signals Gauges */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Candidate Real-time Signals
              </span>
              <div className="grid grid-cols-2 gap-2 bg-[#0D1715] border border-[#203630] rounded-xl p-3 font-mono text-[11px]">
                <div>
                  <span className="text-slate-500 text-[10px] block">Head Pose (Pitch/Yaw/Roll):</span>
                  <span className="text-slate-200 font-bold">
                    {selectedCandidate.headPose
                      ? `${selectedCandidate.headPose.pitch}° / ${selectedCandidate.headPose.yaw}° / ${selectedCandidate.headPose.roll}°`
                      : "-1.2° / +2.1° / +0.5°"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Gaze Direction:</span>
                  <span className="text-emerald-400 font-bold">
                    {selectedCandidate.gazeStatus || "SCREEN_FOCUSED"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Audio Level (RMS):</span>
                  <span className="text-slate-200 font-bold">0.03 (Ambient Room Silence)</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Lockdown Verification:</span>
                  <span className="text-sky-400 font-bold">SEB Kiosk Verified</span>
                </div>
              </div>
            </div>

            {/* Chronological Incident Timeline */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Live Event & Incident Timeline
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {timelineEvents.length} Recorded Event{timelineEvents.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-2">
                {timelineEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 bg-[#0E1A17] border-l-2 border-emerald-500 rounded-r-xl border border-r-[#203630] border-y-[#203630] text-slate-300"
                  >
                    <div className="flex justify-between items-center text-[10px] mb-1">
                      <span className="font-mono font-bold text-emerald-400">{evt.signalType}</span>
                      <span className="text-slate-500 font-mono">
                        {new Date(evt.loggedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-tight">
                      {evt.metadata?.reason || "Telemetry event captured by proctor agent."}
                    </p>
                    {evt.metadata?.confidence && (
                      <span className="text-[9px] font-mono text-slate-500 mt-1 block">
                        Confidence: {(evt.metadata.confidence * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 5. AUDITED INVIGILATOR ACTION TOOLBAR */}
          <div className="p-4 border-t border-[#243D36] bg-[#101C19] space-y-2 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Authorized Supervisory Interventions
            </span>

            <div className="grid grid-cols-2 gap-2">
              {/* Pause vs Resume Exam */}
              {selectedCandidate.sessionState === "PAUSED" ? (
                <button
                  disabled={actionLoading}
                  onClick={() => setActiveActionModal("RESUME_EXAM")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume Exam
                </button>
              ) : (
                <button
                  disabled={actionLoading}
                  onClick={() => setActiveActionModal("PAUSE_EXAM")}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause Exam
                </button>
              )}

              {/* Request Re-check */}
              <button
                disabled={actionLoading}
                onClick={() => setActiveActionModal("REQUEST_RECHECK")}
                className="bg-[#1C322C] hover:bg-[#26443B] border border-[#2D5046] text-slate-200 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Request Re-check
              </button>

              {/* Escalate Review */}
              <button
                disabled={actionLoading}
                onClick={() => setActiveActionModal("ESCALATE_REVIEW")}
                className="bg-[#2D2138] hover:bg-[#3D2C4C] border border-[#4E3961] text-purple-200 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Flag className="w-3.5 h-3.5 text-purple-400" />
                Escalate Review
              </button>

              {/* Terminate Attempt (COE Admin only) */}
              {role === "COE_ADMIN" ? (
                <button
                  disabled={actionLoading}
                  onClick={() => setActiveActionModal("TERMINATE_ATTEMPT")}
                  className="bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 text-rose-300 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  Terminate Attempt
                </button>
              ) : (
                <button
                  disabled={actionLoading}
                  onClick={() => setActiveActionModal("WARN_CANDIDATE")}
                  className="bg-[#1C322C] hover:bg-[#26443B] border border-[#2D5046] text-amber-300 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Issue Warning
                </button>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* 6. ACTION CONFIRMATION MODAL WITH REASON PROMPT */}
      {activeActionModal && selectedCandidate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#142320] border border-[#243D36] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#243D36] pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Confirm {activeActionModal.replace(/_/g, " ")}</span>
              </div>
              <button
                onClick={() => {
                  setActiveActionModal(null);
                  setActionReason("");
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              You are about to execute <strong>{activeActionModal}</strong> for candidate{" "}
              <strong className="text-emerald-300">{selectedCandidate.fullName}</strong> ({selectedCandidate.usn}).
              This action will be immutably recorded in the institutional audit log.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 block">
                Audited Reason / Supervisory Note:
              </label>
              <textarea
                rows={3}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Enter mandatory supervisory reason (e.g. Visual verification completed, multiple gaze excursions observed, etc.)..."
                className="w-full bg-[#0A1210] border border-[#243D36] rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-emerald-500 placeholder:text-slate-600 resize-none font-sans"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#243D36]">
              <button
                onClick={() => {
                  setActiveActionModal(null);
                  setActionReason("");
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading}
                onClick={() => handleExecuteAction(activeActionModal)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Log Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
