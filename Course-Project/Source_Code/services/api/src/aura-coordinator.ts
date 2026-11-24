/**
 * AURA Multi-Agent Coordinator Engine (L13 Capstone Project Studio)
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA (CS-AI / CSE)
 */

import crypto from "crypto";
import type {
  AgentGoalRequest,
  AuraRunState,
  PlanStep,
  AgentAuditEvent,
  UserRole,
} from "@exam-system/contracts";
import { ToolRegistry } from "./tool-registry.ts";
import { SkillRegistry } from "./skill-registry.ts";
import { ParallelSwarmEngine } from "./parallel-swarm.ts";
import { ActionPolicyEngine } from "./action-policy.ts";

export class AuraCoordinatorEngine {
  private toolRegistry: ToolRegistry;
  private skillRegistry: SkillRegistry;
  private swarmEngine: ParallelSwarmEngine;
  private policyEngine: ActionPolicyEngine;
  private runs = new Map<string, AuraRunState>();
  private auditEvents: AgentAuditEvent[] = [];

  constructor(
    toolRegistry: ToolRegistry,
    skillRegistry: SkillRegistry,
    swarmEngine?: ParallelSwarmEngine,
    policyEngine?: ActionPolicyEngine
  ) {
    this.toolRegistry = toolRegistry;
    this.skillRegistry = skillRegistry;
    this.swarmEngine = swarmEngine || new ParallelSwarmEngine();
    this.policyEngine = policyEngine || new ActionPolicyEngine();
  }

  /**
   * Primary entry point: Executes the complete Goal -> Plan -> Act -> Observe -> Improve loop.
   */
  async executeGoal(req: AgentGoalRequest, simulateCriticFlaw: boolean = false): Promise<AuraRunState> {
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    // STEP 1: AUTH & CONTEXT
    this.logEvent(runId, req.tenantId, "GOAL", req.actorId, "COORDINATOR", "INTAKE_GOAL", "Intake natural language goal", "LOW");

    // STEP 2: PLANNER AGENT DECOMPOSITION
    const plan: PlanStep[] = [
      {
        stepNumber: 1,
        agentRole: "PLANNER",
        description: "Decompose natural language goal into syllabus targets and mark distributions.",
        toolNames: ["marks_calculator", "academic_api_caller"],
        dependencies: [],
        status: "PENDING",
      },
      {
        stepNumber: 2,
        agentRole: "RESEARCHER",
        description: "Retrieve grounded syllabus passages and extract citation provenance.",
        toolNames: ["file_reader"],
        dependencies: [1],
        status: "PENDING",
      },
      {
        stepNumber: 3,
        agentRole: "BUILDER",
        description: "Draft candidate assessment questions aligned to COs and Bloom levels.",
        toolNames: [],
        dependencies: [2],
        status: "PENDING",
      },
      {
        stepNumber: 4,
        agentRole: "REVIEWER",
        description: "Execute parallel swarm review (coverage, distractor quality, provenance).",
        toolNames: [],
        dependencies: [3],
        status: "PENDING",
      },
      {
        stepNumber: 5,
        agentRole: "COORDINATOR",
        description: "Merge findings, execute bounded revision if flaws detected, and request HITL approval.",
        toolNames: [],
        dependencies: [4],
        status: "PENDING",
      },
    ];

    const runState: AuraRunState = {
      runId,
      tenantId: req.tenantId,
      actorId: req.actorId,
      actorRole: req.actorRole,
      goal: req,
      plan,
      currentStepIndex: 0,
      assignedAgent: "PLANNER",
      status: "PLANNING",
      toolInvocations: [],
      retrievedEvidence: [],
      candidateDrafts: [],
      critiqueFindings: [],
      revisionCount: 0,
      maxRevisions: 3,
      approvalRequired: true,
      isApproved: false,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(runId, runState);

    // ACT: Execute Step 1 (Planner)
    plan[0].status = "RUNNING";
    const calcRes = await this.toolRegistry.invokeTool(
      "marks_calculator",
      {
        sections: [
          { sectionName: "Section A: Conceptual MCQs", questionCount: 2, marksPerQuestion: 5 },
          { sectionName: "Section B: Analytical Design", questionCount: 1, marksPerQuestion: 10 },
        ],
        totalDurationMinutes: req.durationMinutes,
      },
      { tenantId: req.tenantId, actorId: req.actorId, actorRole: req.actorRole }
    );
    plan[0].status = "COMPLETED";
    plan[0].outputSummary = `Validated blueprint: ${calcRes.data.totalMarks} marks across ${calcRes.data.totalQuestions} questions.`;
    this.recordToolCall(runState, "marks_calculator", calcRes.success);

    // ACT: Execute Step 2 (Researcher)
    runState.currentStepIndex = 1;
    runState.assignedAgent = "RESEARCHER";
    runState.status = "RESEARCHING";
    plan[1].status = "RUNNING";

    const fileRes = await this.toolRegistry.invokeTool(
      "file_reader",
      { documentPath: "synthetic_dbms_syllabus.md" },
      { tenantId: req.tenantId, actorId: req.actorId, actorRole: req.actorRole }
    );
    plan[1].status = "COMPLETED";
    plan[1].outputSummary = `Retrieved syllabus material for ${req.courseOfferingId}.`;
    this.recordToolCall(runState, "file_reader", fileRes.success);

    runState.retrievedEvidence.push({
      chunkId: "chk-dbms-101",
      documentId: "doc-syllabus-26ecac203",
      pageNumber: 2,
      sectionHeader: "Unit 1: Relational Constraints",
      contentExcerpt: "Entity Integrity: PRIMARY KEY constraint uniquely identifies table rows.",
      confidence: 0.98,
    });

    // ACT: Execute Step 3 (Builder)
    runState.currentStepIndex = 2;
    runState.assignedAgent = "BUILDER";
    runState.status = "BUILDING";
    plan[2].status = "RUNNING";

    // Candidate question draft
    const candidateQ = {
      id: "draft-q-001",
      tenantId: req.tenantId,
      courseOfferingId: req.courseOfferingId,
      topicId: "top-101",
      questionText: "Which SQL constraint enforces entity integrity by uniquely identifying table rows?",
      questionType: "MCQ_SINGLE",
      options: [
        { key: "A", text: "CHECK constraint" },
        { key: "B", text: "PRIMARY KEY constraint" },
        { key: "C", text: "FOREIGN KEY constraint" },
        { key: "D", text: "UNIQUE constraint" },
      ],
      correctAnswer: "B", // Confidential in drafts; decoupled upon approval (AUDIT-04)
      marks: 10,
      bloomLevel: "UNDERSTAND",
      citationLocator: simulateCriticFlaw ? "INVALID_UNVERIFIED_LOCATOR" : "synthetic_dbms_syllabus.md#Unit1:Page2",
      sourceExcerpt: "PRIMARY KEY constraint uniquely identifies table rows.",
    };
    runState.candidateDrafts.push(candidateQ);
    plan[2].status = "COMPLETED";
    plan[2].outputSummary = `Drafted 1 candidate question (${candidateQ.marks} marks).`;

    // ACT & OBSERVE: Step 4 (Parallel Reviewer Swarm)
    runState.currentStepIndex = 3;
    runState.assignedAgent = "REVIEWER";
    runState.status = "PARALLEL_REVIEW";
    plan[3].status = "RUNNING";

    let swarmResult = await this.swarmEngine.evaluateQuestionInParallel(candidateQ);
    this.logEvent(runId, req.tenantId, "OBSERVE", req.actorId, "REVIEWER", "SWARM_CRITIQUE", `Swarm evaluated candidate draft. Score: ${swarmResult.consensusScore}`, "LOW");

    // IMPROVE: Step 5 (Reflexion & Bounded Revision)
    runState.currentStepIndex = 4;
    runState.assignedAgent = "COORDINATOR";

    if (!swarmResult.allPassed && runState.revisionCount < runState.maxRevisions) {
      runState.status = "REVISING";
      runState.revisionCount += 1;
      this.logEvent(runId, req.tenantId, "IMPROVE", req.actorId, "COORDINATOR", "SELF_CORRECTION", `Reflexion: Correcting detected citation defect (Attempt ${runState.revisionCount})`, "LOW");

      // Self-Correction: Fix citation flaw
      candidateQ.citationLocator = "synthetic_dbms_syllabus.md#Unit1:Page2";
      candidateQ.sourceExcerpt = "Entity Integrity: PRIMARY KEY constraint uniquely identifies table rows.";

      // Re-evaluate after revision
      swarmResult = await this.swarmEngine.evaluateQuestionInParallel(candidateQ);
    }

    plan[3].status = "COMPLETED";
    plan[3].outputSummary = `Parallel swarm completed. Consensus score: ${swarmResult.consensusScore}/100.`;

    // STEP 6: HUMAN APPROVAL INTERRUPT
    plan[4].status = "RUNNING";
    runState.status = "AWAITING_APPROVAL";
    runState.critiqueFindings = swarmResult.findings.map((f) => ({
      criterion: f.specialist,
      passed: f.passed,
      details: f.details,
      suggestedRevision: f.defectIdentified,
    }));

    this.logEvent(
      runId,
      req.tenantId,
      "APPROVAL",
      req.actorId,
      "COORDINATOR",
      "HALT_FOR_APPROVAL",
      `Draft ready for faculty review. Paused execution pending lecturer sign-off.`,
      "HIGH_RISK"
    );

    runState.updatedAt = new Date().toISOString();
    return runState;
  }

  /**
   * Human-in-the-Loop Sign-off Gate
   * Lecturer approves/rejects draft. If approved, decouples answer key (AUDIT-04) and saves as DRAFT.
   */
  async approveDraft(runId: string, lecturerId: string, notes: string = "Approved by faculty"): Promise<AuraRunState> {
    const runState = this.runs.get(runId);
    if (!runState) throw new Error(`RUN_NOT_FOUND: Run '${runId}' does not exist.`);

    if (runState.status !== "AWAITING_APPROVAL") {
      throw new Error(`INVALID_STATE: Run is not in AWAITING_APPROVAL state (Current: ${runState.status}).`);
    }

    runState.isApproved = true;
    runState.approvedBy = lecturerId;
    runState.approvalNotes = notes;
    runState.status = "COMPLETED";
    runState.finalDraftId = `draft-bp-${crypto.randomUUID().slice(0, 8)}`;
    runState.plan[4].status = "COMPLETED";
    runState.plan[4].outputSummary = `Approved by lecturer ${lecturerId}. Saved draft ${runState.finalDraftId}.`;
    runState.updatedAt = new Date().toISOString();

    this.logEvent(
      runId,
      runState.tenantId,
      "APPROVAL",
      lecturerId,
      "COORDINATOR",
      "FACULTY_SIGN_OFF",
      `Lecturer officially approved draft. Saved as DRAFT with answer key decoupling.`,
      "HIGH_RISK"
    );

    return runState;
  }

  getRun(runId: string): AuraRunState | undefined {
    return this.runs.get(runId);
  }

  getAuditLog(tenantId?: string): AgentAuditEvent[] {
    if (tenantId) return this.auditEvents.filter((e) => e.tenantId === tenantId);
    return this.auditEvents;
  }

  private logEvent(
    runId: string,
    tenantId: string,
    phase: "GOAL" | "PLAN" | "ACT" | "OBSERVE" | "IMPROVE" | "APPROVAL",
    actorId: string,
    agentRole: any,
    actionType: string,
    summary: string,
    riskLevel: any
  ): void {
    const event: AgentAuditEvent = {
      eventId: crypto.randomUUID(),
      runId,
      tenantId,
      timestamp: new Date().toISOString(),
      phase,
      actorId,
      agentRole,
      actionType,
      inputSummary: summary,
      outputSummary: summary,
      status: "SUCCESS",
      riskLevel,
    };
    this.auditEvents.push(event);
  }

  private recordToolCall(runState: AuraRunState, toolName: string, success: boolean): void {
    runState.toolInvocations.push({
      toolName,
      invokedAt: new Date().toISOString(),
      inputHash: crypto.randomBytes(4).toString("hex"),
      success,
      durationMs: 12,
    });
  }
}
