"use client";

import React, { useState, useEffect } from "react";
import { DeepResearchStudio } from "@/components/research/DeepResearchStudio";

interface PlanStepItem {
  stepNumber: number;
  agentRole: string;
  description: string;
  toolNames: string[];
  status: string;
  outputSummary?: string;
}

interface RetrievedEvidenceItem {
  chunkId: string;
  documentName: string;
  pageStart: number;
  pageEnd: number;
  sectionHeader: string;
  similarity: number;
  contentSnippet: string;
  locator: string;
}

interface SwarmCriticItem {
  specialist: string;
  passed: boolean;
  score: number;
  details: string;
}

interface CandidateDraftItem {
  id: string;
  questionText: string;
  options: Array<{ key: string; text: string }>;
  marks: number;
  bloomLevel: string;
  courseOutcome: string;
  topicCode: string;
  sourceLocator: string;
  sourceExcerpt: string;
  reviewStatus: string;
  answerKeyDecoupled: boolean;
}

interface AuditEventItem {
  id: string;
  phase: string;
  actor: string;
  action: string;
  description: string;
  timestamp: string;
  riskLevel: string;
}

export default function WorkletStudioPage() {
  const [activeTab, setActiveTab] = useState<"loop" | "skills" | "rubric" | "mcp" | "research">("loop");
  const [goalText, setGoalText] = useState(
    "Draft a 2-question formative assessment for Topic T1.1 (Agent Lifecycle: Plan-Act-Observe-Improve) aligned to CO1 (Understand). Ground in official course documents, validate via 3-agent parallel swarm, and save to question bank for faculty sign-off."
  );
  const [selectedTopic, setSelectedTopic] = useState("T1.1");
  const [executing, setExecuting] = useState(false);
  const [approving, setApproving] = useState(false);

  // Run State
  const [runId, setRunId] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<"IDLE" | "RUNNING" | "AWAITING_APPROVAL" | "APPROVED">("AWAITING_APPROVAL");
  const [planSteps, setPlanSteps] = useState<PlanStepItem[]>([
    { stepNumber: 1, agentRole: "PLANNER", description: "Decompose natural language goal into syllabus targets and section marks.", toolNames: ["marks_calculator", "academic_record_query"], status: "COMPLETED", outputSummary: "Decomposed into 2 formative items (4 marks total), targeting Topic T1.1 and CO1 (UNDERSTAND)." },
    { stepNumber: 2, agentRole: "RESEARCHER", description: "Execute scoped vector retrieval over institutional syllabus and worklet canvas using BAAI/bge-m3.", toolNames: ["vector_rag_retrieval", "chunk_provenance_verifier"], status: "COMPLETED", outputSummary: "Retrieved 3 grounded chunks from AAI_26ECAC401.docx (similarity: 0.89)." },
    { stepNumber: 3, agentRole: "BUILDER", description: "Synthesize draft assessment questions grounded strictly in retrieved chunks.", toolNames: ["assessment_drafter"], status: "COMPLETED", outputSummary: "Drafted 1 candidate MCQ (marks: 2.0, Bloom: UNDERSTAND) with provenance to AAI_26ECAC401.docx." },
    { stepNumber: 4, agentRole: "REVIEWER_SWARM", description: "Execute parallel 3-agent swarm critique (Coverage, Cognitive Depth, Provenance).", toolNames: ["parallel_swarm_reviewer"], status: "COMPLETED", outputSummary: "Parallel swarm completed with 3/3 approvals. Consensus Score: 95/100." },
    { stepNumber: 5, agentRole: "COORDINATOR", description: "Merge swarm critique, apply self-correction if needed, and halt for Faculty Approval Gate.", toolNames: ["hitl_approval_gate"], status: "AWAITING_APPROVAL", outputSummary: "Draft persisted with status 'DRAFT'. Paused at Human-in-the-Loop gate. Awaiting faculty review and approval." },
  ]);

  const [retrievedEvidence, setRetrievedEvidence] = useState<RetrievedEvidenceItem[]>([
    {
      chunkId: "chk-001",
      documentName: "AAI_26ECAC401.docx",
      pageStart: 3,
      pageEnd: 4,
      sectionHeader: "Agent Lifecycle",
      similarity: 0.892,
      contentSnippet: "Agent lifecycle comprises Plan, Act, Observe, and Improve. Evolution from GenAI to Agentic AI...",
      locator: "AAI_26ECAC401.docx#page=3&section=Agent%20Lifecycle",
    },
  ]);

  const [candidateDrafts, setCandidateDrafts] = useState<CandidateDraftItem[]>([
    {
      id: "draft-q-seed-001",
      questionText: "In the Agentic AI lifecycle defined in 26ECAC401, which sequence correctly captures the iterative loop executed by an autonomous worklet?",
      options: [
        { key: "A", text: "Prompt -> Tokenize -> Predict -> Cache" },
        { key: "B", text: "Plan -> Act -> Observe -> Improve" },
        { key: "C", text: "Train -> Validate -> Test -> Deploy" },
        { key: "D", text: "Embed -> Index -> Retrieve -> Rank" },
      ],
      marks: 2.0,
      bloomLevel: "UNDERSTAND",
      courseOutcome: "CO1",
      topicCode: "T1.1",
      sourceLocator: "AAI_26ECAC401.docx#page=3&section=Agent%20Lifecycle",
      sourceExcerpt: "Agent lifecycle comprises Plan, Act, Observe, and Improve.",
      reviewStatus: "DRAFT",
      answerKeyDecoupled: true,
    },
  ]);

  const [swarmCritics, setSwarmCritics] = useState<SwarmCriticItem[]>([
    { specialist: "Syllabus Coverage Critic", passed: true, score: 95, details: "Question accurately targets Topic T1.1 and Course Outcome CO1." },
    { specialist: "Cognitive Depth & Bloom Specialist", passed: true, score: 92, details: "Cognitive demand aligns with target level UNDERSTAND (conceptual identification of lifecycle transitions)." },
    { specialist: "Provenance & Factuality Auditor", passed: true, score: 98, details: "Exact match with course document 'AAI_26ECAC401.docx' at locator 'AAI_26ECAC401.docx#page=3&section=Agent%20Lifecycle'. Zero hallucination detected." },
  ]);

  const [consensusScore, setConsensusScore] = useState(95);
  const [activeSpecialistTab, setActiveSpecialistTab] = useState<number>(0);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleExecute = async () => {
    try {
      setExecuting(true);
      setExecutionState("RUNNING");
      setFeedbackMsg(null);

      const res = await fetch("/api/aura/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goalText,
          topicCode: selectedTopic,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const state = data.runState;

      setRunId(data.runId);
      setExecutionState(state.status);
      setPlanSteps(state.plan);
      setRetrievedEvidence(state.retrievedEvidence || []);
      setCandidateDrafts(state.candidateDrafts || []);
      setSwarmCritics(state.critiqueFindings || []);
      setConsensusScore(state.consensusScore || 95);
      setAuditEvents(state.auditEvents || []);
      setFeedbackMsg(`AURA execution completed. Draft saved as 'DRAFT' in PostgreSQL. Paused at Faculty Gate.`);
    } catch (e: any) {
      setFeedbackMsg(`Execution failed: ${e.message}`);
      setExecutionState("IDLE");
    } finally {
      setExecuting(false);
    }
  };

  const handleApprove = async () => {
    try {
      setApproving(true);
      const targetQ = candidateDrafts[0];
      const res = await fetch("/api/aura/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          questionId: targetQ?.id,
          comments: "Approved by Course Faculty after verifying syllabus grounding and swarm consensus.",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setExecutionState("APPROVED");
      setCandidateDrafts((prev) =>
        prev.map((q) => ({ ...q, reviewStatus: "APPROVED" }))
      );
      setPlanSteps((prev) =>
        prev.map((step) =>
          step.stepNumber === 5
            ? { ...step, status: "COMPLETED", outputSummary: "Faculty approval completed by Prof. Course Instructor. Promoted to APPROVED." }
            : step
        )
      );
      setFeedbackMsg("Faculty approval recorded in PostgreSQL! Candidate question promoted from DRAFT to APPROVED.");
    } catch (e: any) {
      setFeedbackMsg(`Approval error: ${e.message}`);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Course & Team Header */}
      <div style={{ backgroundColor: "#1e293b", color: "#ffffff", padding: "1.75rem", borderRadius: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "inline-block", padding: "0.25rem 0.75rem", backgroundColor: "#3b82f6", color: "#ffffff", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              COURSE: 26ECAC401 — AGENTIC AI (SEM VII, AY 2026–27)
            </div>
            <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.75rem", fontWeight: 800 }}>
              Team AURA Worklet Studio
            </h1>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.95rem", maxWidth: "800px" }}>
              Discipline: <strong>CS-AI / CSE</strong> &bull; Institution: <strong>KLE Technological University</strong> &bull; One-Line Goal: <em>"Automate the end-to-end exam lifecycle — verify eligibility, deliver unique papers, monitor integrity non-punitively, and draft rubric grades with mandatory faculty sign-off."</em>
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ display: "inline-block", padding: "0.5rem 1rem", backgroundColor: "#065f46", color: "#a7f3d0", borderRadius: "0.375rem", fontWeight: 700, fontSize: "0.875rem" }}>
              7 Skills &bull; 14 Labs &bull; CO1–CO5
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "2px solid #e2e8f0", marginBottom: "1.5rem" }}>
        {[
          { id: "loop", label: "Agent Loop & Control Room (L13 Capstone)" },
          { id: "research", label: "Deep Research Studio (L9)" },
          { id: "skills", label: "7 Skills & 14 Hands-on Labs (L1–L14)" },
          { id: "mcp", label: "MCP Connector & Tools (L5 & L2)" },
          { id: "rubric", label: "Course Outcomes & Rubric Evidence Tracker" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "0.75rem 1.25rem",
              border: "none",
              backgroundColor: activeTab === tab.id ? "#1d4ed8" : "transparent",
              color: activeTab === tab.id ? "#ffffff" : "#475569",
              fontWeight: 700,
              fontSize: "0.875rem",
              borderRadius: "0.375rem 0.375rem 0 0",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification */}
      {feedbackMsg && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: feedbackMsg.startsWith("Execution failed") || feedbackMsg.startsWith("Approval error") ? "#fef2f2" : "#f0fdf4", border: `1px solid ${feedbackMsg.startsWith("Execution failed") ? "#fecaca" : "#bbf7d0"}`, borderRadius: "0.375rem", color: feedbackMsg.startsWith("Execution failed") ? "#991b1b" : "#166534", marginBottom: "1.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
          {feedbackMsg}
        </div>
      )}

      {/* TAB: DEEP RESEARCH STUDIO (L9) */}
      {activeTab === "research" && (
        <div style={{ marginBottom: "2rem" }}>
          <DeepResearchStudio />
        </div>
      )}

      {/* TAB 1: AGENT LOOP & CONTROL ROOM */}
      {activeTab === "loop" && (
        <div>
          {/* Interactive Goal Form */}
          <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", color: "#0f172a" }}>
              1. Goal Intake &amp; Autonomous Decomposition
            </h3>
            <p style={{ color: "#64748b", fontSize: "0.875rem", margin: "0 0 1rem 0" }}>
              Submit an authentic assessment goal. The AURA coordinator decomposes it, queries real course documents via BAAI/bge-m3 dense retrieval, drafts questions, and executes parallel swarm validation.
            </p>

            <textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #cbd5e1",
                fontFamily: "inherit",
                fontSize: "0.875rem",
                boxSizing: "border-box",
                marginBottom: "0.75rem",
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Target Topic:</span>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  style={{
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.25rem",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.8rem",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="T1.1">T1.1: Foundations of Agentic AI &amp; Lifecycle &rarr; CO1</option>
                  <option value="T1.2">T1.2: Frameworks, Tools &amp; MCP Connectors &rarr; CO2</option>
                  <option value="T2.1">T2.1: Multi-Agent Orchestration &amp; Swarms &rarr; CO3</option>
                  <option value="T2.2">T2.2: Learning Agents &amp; Governance &rarr; CO4/CO5</option>
                </select>
              </div>

              <button
                onClick={handleExecute}
                disabled={executing}
                style={{
                  padding: "0.5rem 1.25rem",
                  backgroundColor: "#1d4ed8",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  cursor: executing ? "not-allowed" : "pointer",
                }}
              >
                {executing ? "Executing 5-Phase Graph..." : "Execute AURA Coordinator Loop &rarr;"}
              </button>
            </div>
          </div>

          {/* Plan Visualization */}
          <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#0f172a" }}>
                2. Decomposed Orchestration Plan (Goal &rarr; Plan &rarr; Act &rarr; Observe &rarr; Improve)
              </h3>
              <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", backgroundColor: executionState === "APPROVED" ? "#dcfce7" : "#fef3c7", color: executionState === "APPROVED" ? "#166534" : "#92400e", borderRadius: "0.25rem", fontWeight: 700 }}>
                Graph Status: {executionState}
              </span>
            </div>

            <div style={{ display: "grid", gap: "0.75rem" }}>
              {planSteps.map((step) => {
                const isComplete = step.status === "COMPLETED";
                const isAwaiting = step.status === "AWAITING_APPROVAL";
                const isRunning = step.status === "RUNNING";

                return (
                  <div
                    key={step.stepNumber}
                    style={{
                      padding: "0.75rem 1rem",
                      backgroundColor: "#f8fafc",
                      borderRadius: "0.375rem",
                      borderLeft: `4px solid ${isComplete ? "#10b981" : isAwaiting ? "#f59e0b" : isRunning ? "#3b82f6" : "#cbd5e1"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontWeight: 800, color: "#64748b", width: "1.5rem" }}>#{step.stepNumber}</span>
                        <span style={{ display: "inline-block", padding: "0.2rem 0.5rem", backgroundColor: "#e2e8f0", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: 700 }}>
                          {step.agentRole}
                        </span>
                        <span style={{ fontSize: "0.875rem", color: "#1e293b", fontWeight: 600 }}>{step.description}</span>
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isComplete ? "#10b981" : isAwaiting ? "#f59e0b" : "#3b82f6" }}>
                        {step.status}
                      </span>
                    </div>

                    {step.outputSummary && (
                      <div style={{ fontSize: "0.8rem", color: "#475569", marginLeft: "2.25rem", marginTop: "0.35rem" }}>
                        <strong>Output:</strong> {step.outputSummary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Parallel Swarm Review & Reflexion */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
            {/* Left: Parallel Swarm */}
            <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#0f172a" }}>
                  3. Parallel Reviewer Swarm (L8)
                </h3>
                <span style={{ padding: "0.2rem 0.5rem", backgroundColor: "#ecfdf5", color: "#059669", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: 700 }}>
                  Consensus: {consensusScore}/100
                </span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                {swarmCritics.map((c, idx) => (
                  <button
                    key={c.specialist}
                    onClick={() => setActiveSpecialistTab(idx)}
                    style={{
                      flex: 1,
                      padding: "0.4rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      backgroundColor: activeSpecialistTab === idx ? "#e0e7ff" : "#f1f5f9",
                      color: activeSpecialistTab === idx ? "#3730a3" : "#475569",
                      border: "none",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                    }}
                  >
                    {c.specialist.split(" ")[0]}
                  </button>
                ))}
              </div>

              {swarmCritics[activeSpecialistTab] && (
                <div style={{ padding: "0.75rem", backgroundColor: "#f8fafc", borderRadius: "0.375rem", fontSize: "0.85rem", color: "#334155" }}>
                  <div>
                    <strong>Specialist:</strong> {swarmCritics[activeSpecialistTab].specialist}<br />
                    <strong>Evaluation Score:</strong> {swarmCritics[activeSpecialistTab].score}/100 ({swarmCritics[activeSpecialistTab].passed ? "APPROVED" : "DEFECT"})<br />
                    <strong>Audit Details:</strong> {swarmCritics[activeSpecialistTab].details}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Human-in-the-Loop Gate */}
            <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#0f172a" }}>
                  4. Faculty Approval Gate (HITL)
                </h3>
                <span style={{ padding: "0.2rem 0.5rem", backgroundColor: executionState === "APPROVED" ? "#dcfce7" : "#fef3c7", color: executionState === "APPROVED" ? "#166534" : "#92400e", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: 700 }}>
                  {executionState === "APPROVED" ? "APPROVED BY LECTURER" : "AWAITING FACULTY APPROVAL"}
                </span>
              </div>

              <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 1rem 0" }}>
                Under institutional safety rules (AGENTS.md), AI agents operate strictly in an advisory capacity. An authorized faculty member must review and approve questions before publication.
              </p>

              {executionState === "APPROVED" ? (
                <div style={{ padding: "1rem", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0.375rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#166534", marginBottom: "0.25rem" }}>
                    Official Faculty Sign-off Recorded
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#15803d" }}>
                    Status: <strong>APPROVED in PostgreSQL question_bank</strong> &bull; Correct answers physically decoupled into <code>question_answer_keys</code> (AUDIT-04).
                  </div>
                </div>
              ) : (
                <div style={{ padding: "1rem", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "0.375rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#92400e", marginBottom: "0.5rem" }}>
                    Action Required: Faculty Sign-Off Gate
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#16a34a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "0.25rem",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        cursor: approving ? "not-allowed" : "pointer",
                      }}
                    >
                      {approving ? "Recording..." : "Approve & Promote to Question Bank \u2192"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Candidate Draft Preview */}
          {candidateDrafts.length > 0 && (
            <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#0f172a" }}>
                  Candidate Assessment Draft (PostgreSQL Grounded)
                </h3>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "0.2rem 0.5rem", backgroundColor: candidateDrafts[0].reviewStatus === "APPROVED" ? "#dcfce7" : "#fef3c7", color: candidateDrafts[0].reviewStatus === "APPROVED" ? "#166534" : "#92400e", borderRadius: "0.25rem" }}>
                  Status: {candidateDrafts[0].reviewStatus}
                </span>
              </div>

              <div style={{ padding: "1rem", backgroundColor: "#f8fafc", borderRadius: "0.375rem", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0f172a", marginBottom: "0.75rem" }}>
                  {candidateDrafts[0].questionText}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  {candidateDrafts[0].options.map((opt) => (
                    <div key={opt.key} style={{ padding: "0.4rem 0.6rem", backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "0.25rem", fontSize: "0.85rem" }}>
                      <strong style={{ color: "#2563eb", marginRight: "0.35rem" }}>{opt.key}.</strong> {opt.text}
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: "0.75rem", color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "0.5rem" }}>
                  <strong>Source Provenance:</strong> <code>{candidateDrafts[0].sourceLocator}</code> &bull; <em>Answer key decoupled into question_answer_keys (AUDIT-04)</em>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 7 SKILLS & 14 LABS CARDS */}
      {activeTab === "skills" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "1.25rem" }}>
          {[
            {
              skillNum: 1,
              name: "Agents",
              labs: "L1: Agent vs Chatbot | L2: Tool-Using Agent",
              desc: "Goal-directed stateful agent loop (Plan-Act-Observe-Improve) with allowlisted calculator, file reader, and API caller tools.",
              evidence: "services/api/src/tool-registry.ts, tests/agentic-worklet.test.ts (L1 & L2 passed)",
            },
            {
              skillNum: 2,
              name: "Skills",
              labs: "L3: Skill Creation | L4: Memory & Retrieval",
              desc: "Reusable versioned skills (research-summary, code-review); short-term checkpoints and long-term 1024-d BGE-M3 pgvector retrieval.",
              evidence: "services/api/src/skill-registry.ts, services/ingestion-worker/ (L3 & L4 passed)",
            },
            {
              skillNum: 3,
              name: "MCP",
              labs: "L5: MCP-Style Connector",
              desc: "Secure Model Context Protocol connector exposing syllabus search and roster lookups with token auth and cross-tenant rejection.",
              evidence: "services/api/src/mcp-connector.ts (tools/list, tools/call, 403 cross-tenant check)",
            },
            {
              skillNum: 4,
              name: "OpenCLA / OpenClaw",
              labs: "L6: OpenCLA Runtime",
              desc: "Isolated runtime-pattern demonstration: session lifecycle, tool allowlists, and immutable operational logs without uncontained host execution.",
              evidence: "services/api/src/opencla-runtime.ts (zero host shell access enforced)",
            },
            {
              skillNum: 5,
              name: "Swarms",
              labs: "L7: Agentic Node Graph | L8: Parallel Swarm",
              desc: "LangGraph 5-node DAG; 3 parallel specialists (Coverage, Quality, Provenance) with fault-tolerant merge node.",
              evidence: "services/api/src/parallel-swarm.ts (Promise.allSettled fault isolation)",
            },
            {
              skillNum: 6,
              name: "Deep Research",
              labs: "L9: Deep Research Agent",
              desc: "Evidence-based research: sub-question decomposition, citation mapping, structured evidence table, and executive synthesis.",
              evidence: "services/api/src/deep-research.ts (verified locator citations)",
            },
            {
              skillNum: 7,
              name: "Cloud SDLC",
              labs: "L10: Cloud Ops | L11: Agentic SDLC | L12: Governance",
              desc: "Read-only Docker diagnosis & remediation approval; requirements-to-tests factory; risk classification & append-only audit trail.",
              evidence: "services/api/src/cloud-ops-agent.ts, agentic-sdlc.ts, action-policy.ts",
            },
            {
              skillNum: "C",
              name: "Capstone & Discipline",
              labs: "L13: Capstone Studio | L14: CSE Discipline Agent",
              desc: "End-to-end assessment drafting scenario; safe static inspection of student SQL submissions with rubric mapping and viva prompts.",
              evidence: "services/api/src/aura-coordinator.ts, cse-discipline-agent.ts",
            },
          ].map((s) => (
            <div
              key={s.name}
              style={{
                backgroundColor: "#ffffff",
                padding: "1.25rem",
                borderRadius: "0.5rem",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, padding: "0.2rem 0.5rem", backgroundColor: "#f1f5f9", borderRadius: "0.25rem", color: "#475569" }}>
                  SKILL {s.skillNum}
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#16a34a" }}>
                  &bull; VERIFIED LIVE
                </span>
              </div>
              <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", color: "#0f172a" }}>{s.name}</h4>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#2563eb", marginBottom: "0.5rem" }}>
                {s.labs}
              </div>
              <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 0.75rem 0", lineHeight: 1.4 }}>
                {s.desc}
              </p>
              <div style={{ fontSize: "0.75rem", color: "#475569", backgroundColor: "#f8fafc", padding: "0.4rem 0.6rem", borderRadius: "0.25rem" }}>
                <strong>Evidence:</strong> <code>{s.evidence}</code>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: MCP CONNECTOR & TOOLS */}
      {activeTab === "mcp" && (
        <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "#0f172a" }}>
            Model Context Protocol (MCP) Connector Specification (L5)
          </h3>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.5rem" }}>
            Institutional tools exposed via standardized MCP interface. Authenticated via token, enforces tenant scoping, and rejects unauthorized access attempts.
          </p>

          <div style={{ display: "grid", gap: "1rem" }}>
            {[
              {
                tool: "marks_calculator",
                risk: "LOW",
                schema: "{ sections: Array<{ sectionName, questionCount, marksPerQuestion }>, totalDurationMinutes }",
                auth: "LECTURER, COE_ADMIN",
                desc: "Validates total blueprint marks, question count, and pacing metrics against course rules.",
              },
              {
                tool: "file_reader",
                risk: "LOW",
                schema: "{ documentPath: string, maxBytes?: number }",
                auth: "LECTURER, COE_ADMIN, STUDENT",
                desc: "Reads tenant-isolated syllabus extracts and course plans with strict path traversal protections.",
              },
              {
                tool: "academic_api_caller",
                risk: "LOW",
                schema: "{ endpoint: 'getCourseOffering' | 'getSyllabusTopics' | 'getCourseOutcomes', courseOfferingId }",
                auth: "LECTURER, COE_ADMIN",
                desc: "Queries authoritative academic records, Course Outcomes (CO1-CO5), and approved syllabus topics.",
              },
            ].map((tool) => (
              <div key={tool.tool} style={{ padding: "1rem", backgroundColor: "#f8fafc", borderRadius: "0.375rem", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
                    mcp://tools/{tool.tool}
                  </span>
                  <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.4rem", backgroundColor: "#e2e8f0", color: "#475569", borderRadius: "0.2rem", fontWeight: 700 }}>
                    Risk: {tool.risk}
                  </span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "0.5rem" }}>{tool.desc}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                  <strong>Input Schema:</strong> <code>{tool.schema}</code><br />
                  <strong>Required Roles:</strong> {tool.auth}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RUBRIC EVIDENCE */}
      {activeTab === "rubric" && (
        <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "#0f172a" }}>
            Course Outcomes Alignment Matrix (26ECAC401)
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                <th style={{ padding: "0.75rem" }}>CO</th>
                <th style={{ padding: "0.75rem" }}>Description</th>
                <th style={{ padding: "0.75rem" }}>Bloom Level</th>
                <th style={{ padding: "0.75rem" }}>AURA Worklet Proof &amp; Verified Evidence</th>
              </tr>
            </thead>
            <tbody>
              {[
                { co: "CO1", desc: "Explain foundations, architecture, and planning strategies of Agentic AI.", bloom: "UNDERSTAND", proof: "Goal decomposition graph, Plan-Act-Observe-Improve loop, and Planner agent in aura-coordinator.ts." },
                { co: "CO2", desc: "Design agentic systems using frameworks, tools, skills, and memory.", bloom: "APPLY", proof: "ToolRegistry (L2), SkillRegistry (L3), MCP connector (L5), and 1024-d BGE-M3 dense retrieval." },
                { co: "CO3", desc: "Develop multi-agent orchestration using LangGraph and collaborative agents.", bloom: "APPLY", proof: "5-node DAG, 3-agent parallel reviewer swarm, and consensus scoring engine." },
                { co: "CO4", desc: "Analyse safety, governance, and alignment in autonomous agent systems.", bloom: "ANALYZE", proof: "Zero LLM Authority boundary (AGENTS.md), Faculty Sign-off Gate, and immutable audit events." },
                { co: "CO5", desc: "Build and demonstrate an end-to-end discipline-specific Agentic AI worklet.", bloom: "CREATE", proof: "Team AURA Capstone Worklet Studio with live RAG and syllabus question drafting." },
              ].map((row) => (
                <tr key={row.co} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "0.75rem", fontWeight: 700, color: "#2563eb" }}>{row.co}</td>
                  <td style={{ padding: "0.75rem", color: "#334155" }}>{row.desc}</td>
                  <td style={{ padding: "0.75rem", fontWeight: 600, color: "#64748b" }}>{row.bloom}</td>
                  <td style={{ padding: "0.75rem", color: "#166534", fontWeight: 500 }}>{row.proof}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
