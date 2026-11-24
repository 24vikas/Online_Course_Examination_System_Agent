"use client";

import React, { useState, useEffect } from "react";

interface DraftQuestion {
  id: string;
  topicCode: string;
  topicTitle: string;
  outcomeCode: string;
  bloomLevel: string;
  questionText: string;
  questionType: string;
  options: Array<{ key: string; text: string }>;
  marks: number;
  difficulty: string;
  sourceLocator: string;
  sourceExcerpt: string;
  reviewStatus: string;
  approvedBy?: string;
  createdAt: string;
}

export default function AssessmentDraftPage() {
  const [selectedTopic, setSelectedTopic] = useState("T1.1");
  const [questionCount, setQuestionCount] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    fetchDraftQuestions();
  }, []);

  const fetchDraftQuestions = async () => {
    try {
      setLoadingList(true);
      const res = await fetch("/api/assessments/draft");
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
      }
    } catch (e: any) {
      console.error("Failed to load questions", e);
    } finally {
      setLoadingList(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setNotification(null);
      const res = await fetch("/api/assessments/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicCode: selectedTopic,
          count: questionCount,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setNotification(`Successfully drafted ${data.draftCount} syllabus-grounded items with decoupled answer keys!`);
      await fetchDraftQuestions();
    } catch (e: any) {
      setNotification(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (qId: string) => {
    try {
      const res = await fetch("/api/aura/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: qId,
          comments: "Approved by course instructor after syllabus provenance review.",
        }),
      });

      if (res.ok) {
        setNotification(`Question ${qId} successfully approved and committed to authoritative question bank.`);
        await fetchDraftQuestions();
      }
    } catch (e: any) {
      setNotification(`Approval error: ${e.message}`);
    }
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#1e293b", color: "#ffffff", padding: "1.75rem", borderRadius: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "inline-block", padding: "0.25rem 0.75rem", backgroundColor: "#15803d", color: "#ffffff", borderRadius: "0.25rem", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              ASSESSMENT DRAFTING WORKFLOW &bull; SYLLABUS GROUNDED &bull; HUMAN-IN-THE-LOOP
            </div>
            <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.75rem", fontWeight: 800 }}>
              Syllabus-Grounded Assessment Drafter &amp; Question Review
            </h1>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.95rem" }}>
              Course: <strong>26ECAC401 (Agentic AI)</strong> &bull; Generate draft items strictly grounded in ingested syllabus chunks with decoupled answer keys (AUDIT-04).
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ display: "inline-block", padding: "0.4rem 0.85rem", backgroundColor: "#065f46", color: "#a7f3d0", borderRadius: "0.375rem", fontWeight: 700, fontSize: "0.8rem" }}>
              Zero LLM Authority &bull; Faculty Gate Enforced
            </span>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0", marginBottom: "1.5rem" }}>
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem", color: "#0f172a" }}>
          Generate Grounded Question Drafts
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: "0.35rem" }}>
              Target Syllabus Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #cbd5e1",
                fontFamily: "inherit",
                fontSize: "0.875rem",
                backgroundColor: "#ffffff",
              }}
            >
              <option value="T1.1">Topic T1.1: Foundations of Agentic AI &amp; Lifecycle (Plan-Act-Observe-Improve) &rarr; CO1</option>
              <option value="T1.2">Topic T1.2: Agent Frameworks, Tools, Skills &amp; MCP Connectors &rarr; CO2</option>
              <option value="T2.1">Topic T2.1: Multi-Agent Orchestration &amp; Parallel Swarms &rarr; CO3</option>
              <option value="T2.2">Topic T2.2: Learning Agents, Governance &amp; Evaluation Rubrics &rarr; CO4/CO5</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: "0.35rem" }}>
              Question Count
            </label>
            <select
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #cbd5e1",
                fontFamily: "inherit",
                fontSize: "0.875rem",
                backgroundColor: "#ffffff",
              }}
            >
              <option value="1">1 Question</option>
              <option value="2">2 Questions</option>
              <option value="3">3 Questions</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                width: "100%",
                padding: "0.75rem",
                backgroundColor: "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.375rem",
                fontWeight: 700,
                fontSize: "0.9rem",
                cursor: generating ? "not-allowed" : "pointer",
              }}
            >
              {generating ? "Drafting & Grounding..." : "Generate Drafts &rarr;"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: "0.75rem", color: "#64748b", backgroundColor: "#f8fafc", padding: "0.5rem 0.75rem", borderRadius: "0.25rem", border: "1px solid #e2e8f0" }}>
          <strong>Safety Invariant (AUDIT-04):</strong> Generated questions are written with <code>review_status = 'DRAFT'</code>. Answer keys are strictly decoupled into <code>question_answer_keys</code> with faculty-only access policies. Student sessions and unauthenticated views never receive answer keys.
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: notification.startsWith("Error") ? "#fef2f2" : "#f0fdf4", border: `1px solid ${notification.startsWith("Error") ? "#fecaca" : "#bbf7d0"}`, borderRadius: "0.375rem", color: notification.startsWith("Error") ? "#991b1b" : "#166534", marginBottom: "1.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
          {notification}
        </div>
      )}

      {/* Question List */}
      <div style={{ backgroundColor: "#ffffff", padding: "1.5rem", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.75rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#0f172a" }}>
              Authoritative Question Bank ({questions.length} items)
            </h3>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Tenant: <strong>KLE-TECH-MAIN</strong> &bull; Course: <strong>26ECAC401 (Agentic AI)</strong>
            </div>
          </div>
          <button
            onClick={fetchDraftQuestions}
            style={{
              padding: "0.35rem 0.75rem",
              backgroundColor: "#f1f5f9",
              border: "1px solid #cbd5e1",
              borderRadius: "0.25rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        {loadingList ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
            Loading questions from database...
          </div>
        ) : questions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
            No questions drafted yet. Use the control panel above to draft questions.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {questions.map((q, idx) => (
              <div
                key={q.id}
                style={{
                  padding: "1.25rem",
                  backgroundColor: "#f8fafc",
                  borderRadius: "0.375rem",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, color: "#64748b", fontSize: "0.85rem" }}>
                      Q{idx + 1}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, backgroundColor: "#e0e7ff", color: "#3730a3", padding: "0.15rem 0.5rem", borderRadius: "0.2rem" }}>
                      {q.topicCode || "Topic"}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, backgroundColor: "#dbeafe", color: "#1e40af", padding: "0.15rem 0.5rem", borderRadius: "0.2rem" }}>
                      {q.outcomeCode || "CO1"}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, backgroundColor: "#fef3c7", color: "#92400e", padding: "0.15rem 0.5rem", borderRadius: "0.2rem" }}>
                      Bloom: {q.bloomLevel}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>
                      {q.marks} Marks
                    </span>
                  </div>

                  <div>
                    <span
                      style={{
                        padding: "0.25rem 0.6rem",
                        backgroundColor: (q.reviewStatus === "APPROVED" || q.reviewStatus === "APPROVED_FOR_QUESTION_BANK") ? "#dcfce7" : "#fef3c7",
                        color: (q.reviewStatus === "APPROVED" || q.reviewStatus === "APPROVED_FOR_QUESTION_BANK") ? "#166534" : "#92400e",
                        borderRadius: "0.25rem",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                      }}
                    >
                      {q.reviewStatus}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0f172a", marginBottom: "0.75rem" }}>
                  {q.questionText}
                </div>

                {/* Options */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  {(q.options || []).map((opt) => (
                    <div
                      key={opt.key}
                      style={{
                        padding: "0.4rem 0.6rem",
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.25rem",
                        fontSize: "0.85rem",
                        color: "#334155",
                      }}
                    >
                      <strong style={{ color: "#2563eb", marginRight: "0.35rem" }}>{opt.key}.</strong>
                      {opt.text}
                    </div>
                  ))}
                </div>

                {/* Grounding Provenance Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "#64748b", backgroundColor: "#ffffff", padding: "0.5rem 0.75rem", borderRadius: "0.25rem", border: "1px solid #e2e8f0" }}>
                  <div>
                    <strong>Provenance:</strong> <code>{q.sourceLocator}</code>
                  </div>
                  <div>
                    {q.reviewStatus === "DRAFT" ? (
                      <button
                        onClick={() => handleApprove(q.id)}
                        style={{
                          padding: "0.3rem 0.75rem",
                          backgroundColor: "#16a34a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "0.25rem",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        Faculty Approve &rarr;
                      </button>
                    ) : (
                      <span style={{ color: "#16a34a", fontWeight: 700 }}>
                        &bull; Approved for Question Bank
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
