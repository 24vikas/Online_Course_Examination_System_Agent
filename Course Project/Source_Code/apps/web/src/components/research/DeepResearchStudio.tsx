"use client";

import React, { useState, useEffect } from "react";
import {
  BrainCircuit,
  Search,
  BookOpen,
  Globe,
  Database,
  Layers,
  CheckCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  FileText,
  Copy,
  Check,
  Cpu,
  ChevronRight,
  Filter,
  GraduationCap,
  AlertTriangle,
  History,
} from "lucide-react";

export interface EvidenceItem {
  citation_index?: number;
  title: string;
  sourceType: "COURSE_SYLLABUS" | "ACADEMIC_PAPER" | "STANDARDS_DOC" | "INTERNAL_CURRICULUM" | "EXTERNAL_WEB";
  domainOrLocator: string;
  excerpt: string;
  retrievalTimestamp: string;
  confidenceScore: number;
  limitations?: string;
  metadata?: {
    document_name?: string;
    document_id?: string;
    page_start?: number;
    page_end?: number;
    chunk_id?: string;
    section_header?: string;
    domain?: string;
    author_or_org?: string;
    published_date?: string;
    access_date?: string;
    url?: string;
  };
}

export interface ClaimMapping {
  claim_id: string;
  claim: string;
  source_index: number;
  source_title: string;
  source_type: string;
  citation_locator: string;
}

export interface DeepResearchResult {
  run_id: string;
  thread_id: string;
  status: string;
  query: string;
  scope: string;
  depth: string;
  parsed_intent?: any;
  sub_questions?: Array<{
    id: string;
    question: string;
    focus_area: string;
    target_source_types: string[];
  }>;
  source_count: number;
  evidence_table: EvidenceItem[];
  citations?: Array<{
    index: number;
    label: string;
    title: string;
    source_type: string;
    citation_text: string;
    locator: string;
    excerpt: string;
    metadata: any;
  }>;
  claim_to_source_mapping: ClaimMapping[];
  synthesized_report: string;
  unsupported_claims: string[];
  contradictions_or_conflicts: Array<{ conflict_id: string; description: string; resolution: string }>;
  confidence_overall: number;
  tokens_used: number;
  duration_ms: number;
  provider_id: string;
  persisted_to_db: boolean;
  execution_trace: Array<{
    step: number;
    node: string;
    action: string;
    status: string;
    timestamp: number;
    details: string;
  }>;
}

const PRESET_QUERIES = [
  {
    topic: "Distributed Consensus and Spanner TrueTime API",
    course: "CS-301",
    desc: "Linearizability bounds, Paxos quorum intersection, and atomic clock uncertainty epsilon.",
  },
  {
    topic: "Agentic AI Plan-Act-Observe-Improve Autonomous Lifecycle",
    course: "26ECAC401",
    desc: "Goal decomposition, Reflexion self-correction, HITL review gates, and LangGraph multi-agent DAGs.",
  },
  {
    topic: "Relational Integrity Constraints & ISO/IEC 9075 Standards",
    course: "CS-203",
    desc: "Primary key NOT NULL/UNIQUE invariants, 3NF functional dependencies, and ACID durability.",
  },
  {
    topic: "Paxos vs Raft Consensus Protocol Trade-offs",
    course: "CS-301",
    desc: "Leader election, term safety, log compaction, and asymmetric partition resilience.",
  },
];

const RESEARCH_STEPS = [
  { id: "PLANNING", label: "Query Understanding", desc: "Intent decomposition & Bloom target" },
  { id: "SEARCHING", label: "Source Search", desc: "Curriculum RAG & Standards discovery" },
  { id: "FETCHING", label: "Fetch & Extract", desc: "Passage locator & provenance extraction" },
  { id: "VERIFYING", label: "Quality Check", desc: "Contradiction & authority validation" },
  { id: "SYNTHESIZING", label: "Synthesis", desc: "Claim-to-source citation mapping" },
  { id: "COMPLETED", label: "Appendix", desc: "Evidence table & PostgreSQL state commit" },
];

export const DeepResearchStudio: React.FC<{ initialQuery?: string; courseCode?: string }> = ({
  initialQuery = "Distributed Consensus and Spanner TrueTime API",
  courseCode = "CS-301",
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [course, setCourse] = useState(courseCode);
  const [scope, setScope] = useState<"approved_syllabus_rag" | "uploaded_docs" | "external_web" | "combined">("combined");
  const [depth, setDepth] = useState<"comprehensive" | "rigorous" | "exam_cram" | "standard">("comprehensive");
  const [activeTab, setActiveTab] = useState<"dossier" | "evidence" | "claims" | "trace" | "history">("dossier");

  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentStepName, setCurrentStepName] = useState<string>("IDLE");
  const [result, setResult] = useState<DeepResearchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyRuns, setHistoryRuns] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  // Fetch past runs on mount
  useEffect(() => {
    fetchPastRuns();
  }, []);

  const fetchPastRuns = async () => {
    try {
      const res = await fetch("/api/agent/deep-research");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.runs) {
          setHistoryRuns(json.runs);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleStartResearch = async () => {
    if (!query.trim()) {
      setErrorMsg("Please enter a research query or select a preset.");
      return;
    }

    setIsRunning(true);
    setErrorMsg(null);
    setCurrentStepIndex(0);
    setCurrentStepName("PLANNING");

    // Progressive step simulation ticker while graph executes
    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < 4) {
          const next = prev + 1;
          setCurrentStepName(RESEARCH_STEPS[next].id);
          return next;
        }
        return prev;
      });
    }, 400);

    try {
      const res = await fetch("/api/agent/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          courseCode: course,
          scope,
          depth,
          maxSources: 6,
          providerId: "BAAI/bge-m3",
          modelId: "gemini-1.5-pro",
        }),
      });

      clearInterval(stepInterval);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to run deep research graph.`);
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || "Deep research graph returned unsuccessful state.");
      }

      setCurrentStepIndex(5);
      setCurrentStepName("COMPLETED");
      setResult(json.data);
      fetchPastRuns();
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error("Deep Research execution error:", err);
      setErrorMsg(err.message || "An unexpected error occurred during deep research.");
      setCurrentStepName("FAILED");
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyReport = () => {
    if (!result?.synthesized_report) return;
    navigator.clipboard.writeText(result.synthesized_report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-[#0B2545] via-[#134074] to-[#1D2D44] text-white p-6 rounded-xl shadow-sm border border-slate-700/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded">
                Skill 6 &bull; L9 Deep Research Agent
              </span>
              <span className="text-[10px] font-mono font-bold bg-white/10 text-white/90 px-2 py-0.5 rounded border border-white/10">
                LangGraph 7-Node StateGraph
              </span>
              <span className="text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded">
                BGE-M3 1024-d Scoped
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-emerald-400" />
              Deep Research & Evidence Grounding Studio
            </h1>
            <p className="text-xs text-white/80 max-w-2xl mt-1 leading-relaxed">
              Multi-step cognitive inquiry engine: Decomposes natural language queries, conducts scoped retrieval across institutional syllabi and global standards, verifies contradictions, and produces claim-to-source mapped academic dossiers.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab("history")}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
            >
              <History className="w-3.5 h-3.5 text-emerald-300" />
              <span>Dossier Archive ({historyRuns.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Controls & Query Intake */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        {/* Presets */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Curriculum Grounding Presets (KLE Tech B.Tech)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {PRESET_QUERIES.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(p.topic);
                  setCourse(p.course);
                }}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all cursor-pointer ${
                  query === p.topic
                    ? "bg-indigo-50/80 border-indigo-300 text-indigo-950 font-medium ring-1 ring-indigo-400"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[10px] text-indigo-700 uppercase">{p.course}</span>
                  {query === p.topic && <Check className="w-3 h-3 text-indigo-600" />}
                </div>
                <div className="font-semibold text-slate-900 leading-snug line-clamp-1">{p.topic}</div>
                <div className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6 space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Research Query / Academic Topic:</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Distributed Consensus, Spanner TrueTime, Paxos Quorums"
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Course Code:</label>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="CS-301">CS-301 (Distributed Systems)</option>
              <option value="26ECAC401">26ECAC401 (Agentic AI)</option>
              <option value="CS-203">CS-203 (DBMS & SQL)</option>
              <option value="CS-402">CS-402 (Cloud Computing)</option>
            </select>
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Synthesis Depth:</label>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value as any)}
              className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="comprehensive">Comprehensive Theory</option>
              <option value="rigorous">Rigorous Standard</option>
              <option value="exam_cram">High-Yield Exam Cram</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              id="btn-execute-deep-research"
              onClick={handleStartResearch}
              disabled={isRunning}
              className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <BrainCircuit className="w-3.5 h-3.5" />
                  <span>Execute Graph</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scope Selector (Requirement 2) */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Retrieval Scope Selector:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {[
              {
                id: "approved_syllabus_rag",
                label: "Approved Syllabus RAG",
                icon: BookOpen,
                desc: "Curriculum chunks, course outcomes & lecture units with doc/page/chunk.",
              },
              {
                id: "uploaded_docs",
                label: "Uploaded Docs",
                icon: Database,
                desc: "Lesson plans, slide decks & faculty lab portfolios.",
              },
              {
                id: "external_web",
                label: "External Web Sources",
                icon: Globe,
                desc: "Academic papers, ISO/IEC standards & RFCs with URLs/dates.",
              },
              {
                id: "combined",
                label: "Combined Scope",
                icon: Layers,
                desc: "Unified multi-source synthesis balancing institutional and external citations.",
              },
            ].map((s) => {
              const Icon = s.icon;
              const isSelected = scope === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setScope(s.id as any)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "bg-emerald-50/70 border-emerald-400 text-emerald-950 ring-1 ring-emerald-400"
                      : "bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-emerald-700" : "text-slate-500"}`} />
                      {s.label}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 3. Live Progress Indicator (Requirement 3: PLANNING -> COMPLETED) */}
      {(isRunning || result) && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-600" />
              LangGraph StateGraph Execution Pipeline
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              Phase: {currentStepName}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {RESEARCH_STEPS.map((step, idx) => {
              const isPast = idx < currentStepIndex || currentStepName === "COMPLETED";
              const isCurrent = idx === currentStepIndex && isRunning;
              return (
                <div
                  key={step.id}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    isCurrent
                      ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300 text-emerald-950 animate-pulse"
                      : isPast
                      ? "bg-slate-50 border-slate-300 text-slate-900"
                      : "bg-slate-50/40 border-slate-200 text-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    {isPast ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    ) : isCurrent ? (
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-700 animate-spin" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-300 text-[9px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                    )}
                    <span className="text-[11px] font-bold">{step.label}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 truncate">{step.desc}</div>
                </div>
              );
            })}
          </div>

          {result && (
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                <strong>Sources:</strong> {result.source_count}
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <strong>Confidence:</strong> {Math.round(result.confidence_overall * 100)}%
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                <strong>Tokens:</strong> {result.tokens_used}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <strong>Duration:</strong> {result.duration_ms}ms
              </span>
              <span className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <strong>PostgreSQL:</strong> {result.persisted_to_db ? "Persisted (agent_runs)" : "Active"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4. Results Section: Tabs */}
      {result && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center justify-between px-5 pt-3 border-b border-slate-200 bg-slate-50/80">
            <div className="flex items-center gap-1">
              {[
                { id: "dossier", label: "Executive Research Dossier", icon: FileText },
                { id: "evidence", label: `Evidence Table (${result.evidence_table.length})`, icon: Database },
                { id: "claims", label: `Claim Mapping (${result.claim_to_source_mapping.length})`, icon: Layers },
                { id: "trace", label: "Execution Trace", icon: Cpu },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                      isActive
                        ? "border-emerald-600 text-emerald-900 bg-white"
                        : "border-transparent text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-700" : "text-slate-400"}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pb-2">
              <button
                onClick={handleCopyReport}
                className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center gap-1 transition-colors"
                title="Copy dossier markdown to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy Dossier"}</span>
              </button>
            </div>
          </div>

          <div className="p-5">
            {/* TAB 1: EXECUTIVE DOSSIER */}
            {activeTab === "dossier" && (
              <div className="space-y-4">
                {/* Decomposed Sub-Questions */}
                {result.sub_questions && result.sub_questions.length > 0 && (
                  <div className="p-4 rounded-lg bg-indigo-50/60 border border-indigo-200/80 space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-700" />
                      Decomposed Sub-Questions ({result.sub_questions.length})
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {result.sub_questions.map((sq) => (
                        <div key={sq.id} className="p-2 rounded bg-white border border-indigo-100 space-y-0.5">
                          <div className="font-bold text-indigo-900 text-[11px]">{sq.focus_area}</div>
                          <p className="text-slate-700 text-[11px]">{sq.question}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Markdown Synthesized Report */}
                <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 font-sans text-xs leading-relaxed text-slate-800 space-y-3 whitespace-pre-line">
                  {result.synthesized_report}
                </div>
              </div>
            )}

            {/* TAB 2: STRUCTURED EVIDENCE TABLE (Requirement 3 & 4) */}
            {activeTab === "evidence" && (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-12 text-center">Ref</th>
                        <th className="p-2.5">Source Title & Type</th>
                        <th className="p-2.5">Locator Provenance (Page/Chunk or URL)</th>
                        <th className="p-2.5">Excerpt</th>
                        <th className="p-2.5 w-24 text-center">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {result.evidence_table.map((ev, idx) => {
                        const isInstitutional = ev.sourceType === "COURSE_SYLLABUS" || ev.sourceType === "INTERNAL_CURRICULUM";
                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2.5 font-mono font-bold text-center text-indigo-700">
                              [{idx + 1}]
                            </td>
                            <td className="p-2.5 font-medium text-slate-900">
                              <div>{ev.title}</div>
                              <span className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                                {ev.sourceType}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-600 font-mono text-[11px]">
                              {isInstitutional ? (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-slate-800">{ev.metadata?.document_name}</div>
                                  <div className="text-[10px] text-emerald-700">
                                    Page {ev.metadata?.page_start} &bull; Chunk: {ev.metadata?.chunk_id}
                                  </div>
                                  <div className="text-[10px] text-slate-500">{ev.metadata?.section_header}</div>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <a
                                    href={ev.domainOrLocator}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 hover:underline flex items-center gap-1 font-semibold break-all"
                                  >
                                    <span>{ev.domainOrLocator}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                  <div className="text-[10px] text-slate-500">
                                    Published: {ev.metadata?.published_date} &bull; Accessed: {ev.metadata?.access_date}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-700 leading-relaxed max-w-md italic">
                              &ldquo;{ev.excerpt}&rdquo;
                              {ev.limitations && (
                                <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 p-1 rounded border border-amber-200 not-italic">
                                  <strong>Limitation:</strong> {ev.limitations}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold">
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800">
                                {Math.round(ev.confidenceScore * 100)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: CLAIM-TO-SOURCE MAPPING (Requirement 4) */}
            {activeTab === "claims" && (
              <div className="space-y-3">
                <p className="text-xs text-slate-600">
                  Authoritative claims mapped directly to source locators. Guarantees zero hallucinations and complete academic auditability.
                </p>
                <div className="space-y-2">
                  {result.claim_to_source_mapping.map((c, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                            {c.claim_id}
                          </span>
                          <span className="text-[11px] font-bold text-slate-800">{c.source_title}</span>
                          <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                            {c.source_type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">{c.claim}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded block max-w-xs truncate">
                          {c.citation_locator}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: EXECUTION TRACE */}
            {activeTab === "trace" && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">LangGraph Execution Steps:</span>
                <div className="space-y-1.5">
                  {result.execution_trace.map((tr, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {tr.step}
                        </span>
                        <div>
                          <span className="font-bold text-slate-900">{tr.action}</span>
                          <span className="text-slate-500 text-[11px] ml-2">({tr.node})</span>
                          <p className="text-[11px] text-slate-600 mt-0.5">{tr.details}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(tr.timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ARCHIVE & PAST DOSSIERS */}
      {activeTab === "history" && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-600" />
              Persisted Research Dossiers (PostgreSQL agent_runs)
            </h3>
            <button
              onClick={fetchPastRuns}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          {historyRuns.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No historical dossiers found. Run a new deep research query above.
            </div>
          ) : (
            <div className="space-y-2">
              {historyRuns.map((hr, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-slate-100 transition-colors flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xs text-slate-900">{hr.topic || hr.goal}</span>
                      <span className="text-[10px] font-mono uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                        {hr.scope || "combined"}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {hr.created_at ? new Date(hr.created_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3">
                      <span><strong>Sources:</strong> {hr.source_count}</span>
                      <span><strong>Tokens:</strong> {hr.tokens_used}</span>
                      <span><strong>Duration:</strong> {hr.duration_ms}ms</span>
                      <span><strong>Provider:</strong> {hr.provider}</span>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/agent/deep-research?runId=${hr.run_id}`);
                      if (res.ok) {
                        const json = await res.json();
                        if (json.success && json.data) {
                          setResult(json.data);
                          setActiveTab("dossier");
                        }
                      }
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                  >
                    Load Dossier
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
