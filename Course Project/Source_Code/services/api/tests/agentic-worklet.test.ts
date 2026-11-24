/**
 * Agentic AI Worklet Test Suite (L1 through L14)
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA (CS-AI / CSE)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  createStandardToolRegistry,
  createStandardSkillRegistry,
  ActionPolicyEngine,
  MCPConnector,
  SafeOpenCLARuntime,
  ParallelSwarmEngine,
  DeepResearchAgent,
  CloudOperationsAgent,
  AgenticSDLCFactory,
  CSEDisciplineAgent,
  AuraCoordinatorEngine,
} from "../src/index.ts";

describe("PHASE 8: AGENTIC AI WORKLET TEST SUITE (7 Skills & 14 Labs)", () => {
  const tenantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const crossTenantId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const lecturerId = "11111111-1111-1111-1111-111111111111";
  const studentId = "22222222-2222-2222-2222-222222222222";
  const courseOfferingId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const syllabusVersionId = "ssssssss-ssss-ssss-ssss-ssssssssssss";

  // ==========================================
  // SKILL 1: AGENTS (L1 & L2)
  // ==========================================
  describe("Skill 1: Agents — L1 Agent vs Chatbot & L2 Tool-Using Agent", () => {
    it("L1: Demonstrates goal-directed stateful loop vs static chatbot response", async () => {
      const toolReg = createStandardToolRegistry();
      const skillReg = createStandardSkillRegistry();
      const coordinator = new AuraCoordinatorEngine(toolReg, skillReg);

      // Chatbot mode: single string reply without plan or tool invocation
      const chatbotReply = "A 20-mark assessment on DBMS typically has MCQs and short answers.";
      assert.equal(typeof chatbotReply, "string");

      // Agent mode: Goal -> Plan -> Act -> Observe -> Improve
      const runState = await coordinator.executeGoal({
        tenantId,
        actorId: lecturerId,
        actorRole: "LECTURER",
        courseOfferingId,
        syllabusVersionId,
        naturalLanguageGoal: "Prepare a 20-mark DBMS practice assessment covering DDL and DML.",
        targetTopics: ["Relational Data Models"],
        targetCourseOutcomes: ["CO1"],
        targetBloomLevels: ["UNDERSTAND", "APPLY"],
        totalMarks: 20,
        durationMinutes: 60,
      });

      // Assertions proving agentic behavior
      assert.ok(runState.plan.length >= 4, "Agent decomposed goal into explicit multi-step plan.");
      assert.ok(runState.toolInvocations.length >= 2, "Agent invoked allowlisted tools.");
      assert.equal(runState.status, "AWAITING_APPROVAL", "Agent paused at human approval gate.");
      assert.ok(runState.retrievedEvidence.length > 0, "Agent gathered grounded syllabus evidence.");
    });

    it("L2: Typed allowlisted tools execute with schema validation & RBAC", async () => {
      const toolReg = createStandardToolRegistry();

      // Tool 1: Marks Calculator
      const calcRes = await toolReg.invokeTool(
        "marks_calculator",
        {
          sections: [
            { sectionName: "Section A", questionCount: 4, marksPerQuestion: 2.5 },
            { sectionName: "Section B", questionCount: 2, marksPerQuestion: 5 },
          ],
          totalDurationMinutes: 60,
        },
        { tenantId, actorId: lecturerId, actorRole: "LECTURER" }
      );
      assert.equal(calcRes.success, true);
      assert.equal(calcRes.data.totalMarks, 20);
      assert.equal(calcRes.data.totalQuestions, 6);

      // Tool 2: File Reader path traversal rejection (Security check)
      const traversalRes = await toolReg.invokeTool(
        "file_reader",
        { documentPath: "../../etc/passwd" },
        { tenantId, actorId: lecturerId, actorRole: "LECTURER" }
      );
      assert.equal(traversalRes.success, false);
      assert.match(traversalRes.error!, /SECURITY_VIOLATION/);

      // Tool 3: Role-based access control (Student unauthorized to invoke academic_api_caller)
      const rbacRes = await toolReg.invokeTool(
        "academic_api_caller",
        { endpoint: "getCourseOffering", courseOfferingId },
        { tenantId, actorId: studentId, actorRole: "STUDENT" }
      );
      assert.equal(rbacRes.success, false);
      assert.match(rbacRes.error!, /FORBIDDEN_TOOL_ACCESS/);
    });
  });

  // ==========================================
  // SKILL 2: SKILLS (L3 & L4)
  // ==========================================
  describe("Skill 2: Skills — L3 Skill Creation & L4 Memory & Retrieval", () => {
    it("L3: Executes versioned reusable skills with schema enforcement", async () => {
      const toolReg = createStandardToolRegistry();
      const skillReg = createStandardSkillRegistry();

      const skillRes = await skillReg.executeSkill(
        "research-summary",
        { courseOfferingId, topicKeywords: ["relational", "keys"] },
        { toolRegistry: toolReg, tenantId, actorId: lecturerId, actorRole: "LECTURER" }
      );

      assert.equal(skillRes.success, true);
      assert.equal(skillRes.skillName, "research-summary");
      assert.equal(skillRes.version, "1.0.0");
      assert.ok(skillRes.data.matchedTopicCount > 0);
      assert.ok(skillRes.data.citationLocator.length > 5);

      // Negative check: Invalid skill input rejected
      const invalidRes = await skillReg.executeSkill(
        "research-summary",
        { courseOfferingId: "not-a-uuid", topicKeywords: [] },
        { toolRegistry: toolReg, tenantId, actorId: lecturerId, actorRole: "LECTURER" }
      );
      assert.equal(invalidRes.success, false);
      assert.match(invalidRes.error!, /INVALID_SKILL_INPUT/);
    });

    it("Stage E2: Discovers portable SKILL.md skills and enforces progressive disclosure", async () => {
      const toolReg = createStandardToolRegistry();
      const skillReg = createStandardSkillRegistry();

      // Progressive disclosure 1: listSkills provides metadata only
      const skills = skillReg.listSkills();
      assert.ok(skills.length >= 6, "At least 6 portable skills discovered");

      const researchSkill = skills.find((s) => s.name === "course-document-research");
      assert.ok(researchSkill, "course-document-research discovered");
      assert.ok(researchSkill.requiredTools.includes("search_course_material"));

      // Progressive disclosure 2: full markdown instructions loaded on demand
      const instructions = skillReg.getSkillInstructions("course-document-research");
      assert.ok(instructions, "Instructions available on activation");
      assert.match(instructions, /Course Document Research Skill/);
      assert.match(instructions, /Deterministic Authority Guardrails/);

      // Execute discovered skill
      const execRes = await skillReg.executeSkill(
        "course-document-research",
        { query: "Foundations of Agentic AI", courseCode: "26ECAC401" },
        { toolRegistry: toolReg, tenantId, actorId: lecturerId, actorRole: "LECTURER" }
      );
      assert.equal(execRes.success, true);
      assert.equal(execRes.data.status, "EXECUTED_VIA_SKILL_SPEC");
      assert.ok(execRes.toolsInvoked.length > 0);
    });

    it("L4: Demonstrates short-term run state and context continuity", async () => {
      const toolReg = createStandardToolRegistry();
      const skillReg = createStandardSkillRegistry();
      const coordinator = new AuraCoordinatorEngine(toolReg, skillReg);

      const run = await coordinator.executeGoal({
        tenantId,
        actorId: lecturerId,
        actorRole: "LECTURER",
        courseOfferingId,
        syllabusVersionId,
        naturalLanguageGoal: "Prepare a practice quiz on SQL normalization.",
        totalMarks: 10,
        durationMinutes: 30,
        targetTopics: [],
        targetCourseOutcomes: [],
        targetBloomLevels: ["UNDERSTAND"],
      });

      // Pause and resume: Lecturer approves draft later
      const resumed = await coordinator.approveDraft(run.runId, lecturerId, "Looks good.");
      assert.equal(resumed.status, "COMPLETED");
      assert.equal(resumed.isApproved, true);
      assert.ok(resumed.finalDraftId!.startsWith("draft-bp-"));
    });
  });

  // ==========================================
  // SKILL 3: MCP (L5)
  // ==========================================
  describe("Skill 3: MCP — L5 MCP-Style Connector", () => {
    it("L5: Handles tools/list and tools/call with strict tenant isolation and cross-tenant rejection", async () => {
      const toolReg = createStandardToolRegistry();
      const mcp = new MCPConnector(toolReg);

      const validToken = "mcp-token-valid-001";
      mcp.registerSession(validToken, {
        tenantId,
        actorId: lecturerId,
        role: "LECTURER",
        expiresAt: Date.now() + 60000,
      });

      // 1. tools/list
      const listRes = await mcp.handleRequest({
        protocolVersion: "2024-11-05",
        authToken: validToken,
        method: "tools/list",
      });
      assert.equal(listRes.success, true);
      assert.ok(listRes.result.tools.length >= 3);

      // 2. tools/call valid
      const callRes = await mcp.handleRequest({
        protocolVersion: "2024-11-05",
        authToken: validToken,
        method: "tools/call",
        params: {
          name: "marks_calculator",
          arguments: {
            sections: [{ sectionName: "Part 1", questionCount: 2, marksPerQuestion: 5 }],
            totalDurationMinutes: 30,
          },
        },
      });
      assert.equal(callRes.success, true);
      assert.equal(callRes.result.totalMarks, 10);

      // 3. Negative Assertion: Cross-tenant spoofing rejected
      const crossTenantRes = await mcp.handleRequest({
        protocolVersion: "2024-11-05",
        authToken: validToken,
        tenantId: crossTenantId, // SPOOFED TENANT!
        method: "tools/list",
      });
      assert.equal(crossTenantRes.success, false);
      assert.equal(crossTenantRes.error?.code, 403);
      assert.match(crossTenantRes.error!.message, /CROSS_TENANT_VIOLATION/);
    });

    it("Stage E1: Official Model Context Protocol (JSON-RPC 2.0) handshake and canonical tool execution", async () => {
      const toolReg = createStandardToolRegistry();
      const mcp = new MCPConnector(toolReg);

      const lecturerToken = "mcp-token-lecturer-rpc";
      mcp.registerSession(lecturerToken, {
        tenantId,
        actorId: lecturerId,
        role: "LECTURER",
        expiresAt: Date.now() + 60000,
      });

      // 1. JSON-RPC 2.0 'initialize' handshake
      const initRes = await mcp.handleRequest({
        jsonrpc: "2.0",
        id: 101,
        authToken: lecturerToken,
        method: "initialize",
        params: {},
      });
      assert.equal(initRes.jsonrpc, "2.0");
      assert.equal(initRes.id, 101);
      assert.equal(initRes.result.protocolVersion, "2024-11-05");
      assert.equal(initRes.result.serverInfo.name, "aura-mcp-server");
      assert.equal(initRes.result.authenticatedUser.role, "LECTURER");

      // 2. JSON-RPC 2.0 'tools/list' exposes 7 canonical academic tools
      const listRes = await mcp.handleRequest({
        jsonrpc: "2.0",
        id: 102,
        authToken: lecturerToken,
        method: "tools/list",
        params: {},
      });
      assert.equal(listRes.jsonrpc, "2.0");
      assert.equal(listRes.id, 102);
      const toolNames = listRes.result.tools.map((t: any) => t.name);
      assert.ok(toolNames.includes("search_course_material"));
      assert.ok(toolNames.includes("get_syllabus_topics"));
      assert.ok(toolNames.includes("get_course_outcomes"));
      assert.ok(toolNames.includes("get_document_chunk"));
      assert.ok(toolNames.includes("draft_questions"));
      assert.ok(toolNames.includes("get_rag_evaluation_status"));
      assert.ok(toolNames.includes("get_agent_run_status"));

      // 3. JSON-RPC 2.0 'tools/call' with 'search_course_material'
      const searchCall = await mcp.handleRequest({
        jsonrpc: "2.0",
        id: 103,
        authToken: lecturerToken,
        method: "tools/call",
        params: {
          name: "search_course_material",
          arguments: { query: "LangGraph consensus", courseCode: "26ECAC401", limit: 3 },
        },
      });
      assert.equal(searchCall.jsonrpc, "2.0");
      assert.equal(searchCall.id, 103);
      assert.equal(searchCall.result.isError, false);
      assert.ok(searchCall.result.data.matchCount > 0);
      assert.equal(searchCall.result.data.results[0].courseCode, "26ECAC401");

      // 4. JSON-RPC 2.0 'tools/call' with 'draft_questions'
      const draftCall = await mcp.handleRequest({
        jsonrpc: "2.0",
        id: 104,
        authToken: lecturerToken,
        method: "tools/call",
        params: {
          name: "draft_questions",
          arguments: { topic: "Plan-Act-Observe-Improve Loop", count: 2, courseCode: "26ECAC401" },
        },
      });
      assert.equal(draftCall.jsonrpc, "2.0");
      assert.equal(draftCall.result.data.questions.length, 2);
      assert.equal(draftCall.result.data.questions[0].status, "DRAFT");
      assert.ok(draftCall.result.data.questions[0].citations.length > 0);

      // 5. JSON-RPC 2.0 'resources/list' and 'resources/read'
      const resList = await mcp.handleRequest({
        jsonrpc: "2.0",
        id: 105,
        authToken: lecturerToken,
        method: "resources/list",
        params: {},
      });
      assert.equal(resList.jsonrpc, "2.0");
      assert.ok(resList.result.resources.length >= 3);

      const resRead = await mcp.handleRequest({
        jsonrpc: "2.0",
        id: 106,
        authToken: lecturerToken,
        method: "resources/read",
        params: { uri: "syllabus://26ECAC401/plan" },
      });
      assert.equal(resRead.jsonrpc, "2.0");
      assert.match(resRead.result.contents[0].text, /Authoritative Syllabus Resource/);
    });
  });

  // ==========================================
  // SKILL 4: OPENCLA RUNTIME (L6)
  // ==========================================
  describe("Skill 4: OpenCLA / OpenClaw — L6 OpenCLA Runtime", () => {
    it("L6: Enforces session lifecycle, tool allowlists, and operational logging without host execution", async () => {
      const toolReg = createStandardToolRegistry();
      const runtime = new SafeOpenCLARuntime(toolReg);

      // Allowlist only marks_calculator
      const session = runtime.createSession(tenantId, lecturerId, "LECTURER", ["marks_calculator"]);
      assert.equal(session.state, "INITIALIZED");

      // Valid allowlisted invocation
      const step1 = await runtime.executeRuntimeStep(session.sessionId, "marks_calculator", {
        sections: [{ sectionName: "Quiz", questionCount: 1, marksPerQuestion: 10 }],
        totalDurationMinutes: 20,
      });
      assert.equal(step1.success, true);

      // Unallowlisted tool invocation blocked by runtime
      const step2 = await runtime.executeRuntimeStep(session.sessionId, "file_reader", {
        documentPath: "syllabus.md",
      });
      assert.equal(step2.success, false);
      assert.match(step2.error!, /SECURITY_VIOLATION/);

      // Session termination
      const terminated = runtime.terminateSession(session.sessionId);
      assert.equal(terminated.state, "TERMINATED");
      assert.ok(terminated.lifecycleLogs.length >= 4);
    });
  });

  // ==========================================
  // SKILL 5: SWARMS (L7 & L8)
  // ==========================================
  describe("Skill 5: Swarms — L7 Agentic Node Graph & L8 Parallel Swarm", () => {
    it("L8: Executes 3 parallel specialists, computes consensus, and isolates branch failures", async () => {
      const swarm = new ParallelSwarmEngine();

      const candidate = {
        tenantId,
        courseOfferingId,
        questionText: "Which SQL constraint enforces entity integrity for unique tuples?",
        options: [
          { key: "A", text: "CHECK" },
          { key: "B", text: "PRIMARY KEY" },
          { key: "C", text: "FOREIGN KEY" },
          { key: "D", text: "UNIQUE" },
        ],
        marks: 5,
        bloomLevel: "UNDERSTAND",
        citationLocator: "synthetic_syllabus.md#Unit1:Page2",
        sourceExcerpt: "PRIMARY KEY uniquely distinguishes tuples.",
      };

      // Normal parallel execution
      const result = await swarm.evaluateQuestionInParallel(candidate);
      assert.equal(result.allPassed, true);
      assert.equal(result.findings.length, 3);
      assert.ok(result.consensusScore >= 90);
      assert.equal(result.recommendation, "ACCEPT");

      // Fault tolerance: Simulate Quality Critic failure; other branches survive
      const faultResult = await swarm.evaluateQuestionInParallel(candidate, true);
      assert.equal(faultResult.allPassed, false);
      assert.equal(faultResult.findings.length, 2, "Successful branches preserved.");
      assert.equal(faultResult.isolatedFailures.length, 1, "Failed branch isolated.");
      assert.match(faultResult.isolatedFailures[0], /TRANSIENT_TIMEOUT/);
    });
  });

  // ==========================================
  // SKILL 6: DEEP RESEARCH (L9)
  // ==========================================
  describe("Skill 6: Deep Research — L9 Deep Research Agent", () => {
    it("L9: Produces evidence table with citation locators and executive synthesis", async () => {
      const researchAgent = new DeepResearchAgent();

      const result = await researchAgent.conductResearch({
        topic: "Entity Integrity and Normalization",
        courseCode: "26ECAC203",
      });

      assert.ok(result.subQuestions.length >= 3);
      assert.ok(result.evidenceTable.length >= 3);
      assert.ok(result.confidenceOverall > 0.9);

      // Verify citation provenance format
      for (const item of result.evidenceTable) {
        assert.ok(item.domainOrLocator.length > 5);
        assert.ok(item.confidenceScore >= 0.9);
      }

      assert.ok(result.executiveSynthesis.includes("Executive Synthesis"));
    });
  });

  // ==========================================
  // SKILL 7: CLOUD SDLC (L10, L11, L12)
  // ==========================================
  describe("Skill 7: Cloud SDLC — L10 Cloud Ops, L11 Agentic SDLC & L12 Governance", () => {
    it("L10: Cloud Operations Agent diagnoses read-only and halts for remediation approval", async () => {
      const ops = new CloudOperationsAgent();

      // Simulated failure diagnosis
      const diagnosis = await ops.diagnoseService(
        { name: "aura-embedding-worker", expectedPort: 8002 },
        true // simulateFailure
      );

      assert.equal(diagnosis.healthy, false);
      assert.equal(diagnosis.diagnosedSeverity, "CRITICAL");
      assert.equal(diagnosis.remediationPlan.requiresApproval, true);

      // Rejects unapproved remediation
      await assert.rejects(
        () => ops.executeApprovedRemediation(diagnosis, "INVALID-TOKEN"),
        /UNAUTHORIZED_REMEDIATION/
      );

      // Approves with valid token
      const exec = await ops.executeApprovedRemediation(diagnosis, "APP-OPS-RESTART-01");
      assert.equal(exec.executed, true);
      assert.equal(diagnosis.remediationPlan.isApproved, true);
    });

    it("L11: Agentic SDLC Factory transforms requirement into test plan, diff, and review gate", async () => {
      const factory = new AgenticSDLCFactory();

      const result = await factory.processRequirement({
        title: "Course Outcome Blueprint Validation",
        courseCode: "26ECAC203",
        functionalSpec: "Ensure assessment blueprints contain at least one question per Course Outcome.",
        acceptanceCriteria: ["Validates CO distribution", "Fails closed if CO is unrepresented"],
      });

      assert.ok(result.decomposedTasks.length >= 3);
      assert.ok(result.testPlan.length >= 3);
      assert.ok(result.generatedTests.includes("describe"));
      assert.ok(result.implementationDiff.includes("diff --git"));
      assert.equal(result.humanApprovalRequired, true);
      assert.equal(result.humanApproved, false);

      // Human approves artifact
      const approved = factory.approveSDLCArtifact(result, lecturerId);
      assert.equal(approved.humanApproved, true);
      assert.equal(approved.verificationStatus, "VERIFIED_CLEAN");
    });

    it("L12: Safety Action Policy rejects prohibited actions & logs append-only audit trail", async () => {
      const policy = new ActionPolicyEngine();

      // 1. Prohibited action test (Direct host shell command attempt)
      const prohibitedEval = policy.evaluateAction({
        tenantId,
        actorId: studentId,
        actorRole: "STUDENT",
        actionName: "exec_host_shell",
        targetResource: "host:/bin/sh",
        riskLevel: "PROHIBITED",
        inputPayload: { cmd: "cat /etc/shadow" },
      });
      assert.equal(prohibitedEval.allowed, false);
      assert.equal(prohibitedEval.auditEvent.status, "REJECTED");

      // 2. High-Risk action requires approval gate
      const highRiskEval = policy.evaluateAction({
        tenantId,
        actorId: lecturerId,
        actorRole: "LECTURER",
        actionName: "publish_exam_schedule",
        targetResource: "exam_schedules",
        riskLevel: "HIGH_RISK",
        inputPayload: { scheduleId: "sched-001" },
      });
      assert.equal(highRiskEval.allowed, false);
      assert.equal(highRiskEval.requiresApproval, true);
      assert.ok(highRiskEval.approvalRequestId!.startsWith("APP-"));

      // 3. Verify audit trail is append-only
      const audit = policy.getAuditTrail(tenantId);
      assert.equal(audit.length, 2);
    });
  });

  // ==========================================
  // CAPSTONE: L13 & L14
  // ==========================================
  describe("Capstone: L13 Capstone Project Studio & L14 CSE Discipline Agent", () => {
    it("L13: AURA Coordinator executes complete DBMS scenario with Reflexion self-correction", async () => {
      const toolReg = createStandardToolRegistry();
      const skillReg = createStandardSkillRegistry();
      const coordinator = new AuraCoordinatorEngine(toolReg, skillReg);

      // Run with deliberate citation flaw -> Agent observes flaw and executes Reflexion self-correction
      const run = await coordinator.executeGoal(
        {
          tenantId,
          actorId: lecturerId,
          actorRole: "LECTURER",
          courseOfferingId,
          syllabusVersionId,
          naturalLanguageGoal: "Prepare a 20-mark DBMS assessment for Unit 1 and Unit 2.",
          targetTopics: ["Relational Constraints"],
          targetCourseOutcomes: ["CO1"],
          targetBloomLevels: ["UNDERSTAND"],
          totalMarks: 20,
          durationMinutes: 60,
        },
        true // simulateCriticFlaw triggers self-correction
      );

      assert.equal(run.revisionCount, 1, "Agent executed Reflexion self-correction.");
      assert.equal(run.status, "AWAITING_APPROVAL");
      assert.equal(run.approvalRequired, true);

      // Faculty approval gate
      const finalized = await coordinator.approveDraft(run.runId, lecturerId);
      assert.equal(finalized.status, "COMPLETED");
      assert.equal(finalized.isApproved, true);
    });

    it("L14: CSE Discipline Agent analyzes SQL code, maps rubrics, and creates viva questions without host execution", async () => {
      const cseAgent = new CSEDisciplineAgent();

      const analysis = await cseAgent.analyzeCodeSubmission({
        assignmentTitle: "Relational Schema DDL & Constraints",
        courseCode: "26ECAC203",
        filename: "student_solution.sql",
        codeContent: [
          "CREATE TABLE students (",
          "  student_id VARCHAR(20) PRIMARY KEY,",
          "  student_name VARCHAR(100) NOT NULL",
          ");",
          "CREATE TABLE enrollments (",
          "  enrollment_id VARCHAR(20) PRIMARY KEY,",
          "  student_id VARCHAR(20),",
          "  FOREIGN KEY (student_id) REFERENCES students(student_id)",
          ");",
        ].join("\n"),
        submittedByStudentId: studentId,
      });

      assert.equal(analysis.syntaxCorrectness, true);
      assert.equal(analysis.hostCodeExecutionAttempted, false, "INVARIANT: Zero host code execution.");
      assert.ok(analysis.rubricCriteriaMapping.length >= 2);
      assert.ok(analysis.proposedVivaQuestions.length >= 3);
      assert.equal(analysis.detectedDefects.length, 0);
    });
  });
});
