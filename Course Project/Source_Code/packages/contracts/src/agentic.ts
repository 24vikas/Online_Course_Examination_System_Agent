/**
 * Agentic AI Worklet Contracts & Schemas
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA (CS-AI / CSE)
 */

import { z } from "zod";
import { UUIDSchema } from "./academic.ts";
import { BloomLevelSchema } from "./syllabus.ts";
import { QuestionTypeSchema } from "./blueprint.ts";

export const UserRoleSchema = z.enum(["COE_ADMIN", "LECTURER", "STUDENT"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

// 1. Agent Roles & Lifecycle States
export const AgentRoleSchema = z.enum([
  "COORDINATOR",
  "PLANNER",
  "RESEARCHER",
  "BUILDER",
  "REVIEWER",
  "OPERATIONS",
  "CSE_DISCIPLINE",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentRunStatusSchema = z.enum([
  "INITIATED",
  "PLANNING",
  "RESEARCHING",
  "BUILDING",
  "PARALLEL_REVIEW",
  "MERGING",
  "REVISING",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentRiskLevelSchema = z.enum([
  "LOW",            // Read-only queries, local calculations
  "REVERSIBLE",     // Scoped draft creation, test worktree proposals
  "HIGH_RISK",      // Service restarts, exam scheduling, blueprint approvals (requires HITL sign-off)
  "PROHIBITED",     // Arbitrary host code execution, direct student PII exfiltration, unvetted root access
]);
export type AgentRiskLevel = z.infer<typeof AgentRiskLevelSchema>;

// 2. Goal Input & Plan Representation
export const AgentGoalRequestSchema = z.object({
  tenantId: UUIDSchema,
  actorId: UUIDSchema,
  actorRole: UserRoleSchema,
  courseOfferingId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  naturalLanguageGoal: z.string().min(5),
  targetTopics: z.array(z.string()).default([]),
  targetCourseOutcomes: z.array(z.string()).default([]),
  targetBloomLevels: z.array(BloomLevelSchema).default(["UNDERSTAND", "APPLY"]),
  totalMarks: z.number().int().min(5).max(100).default(20),
  durationMinutes: z.number().int().min(10).max(180).default(60),
});
export type AgentGoalRequest = z.infer<typeof AgentGoalRequestSchema>;

export const PlanStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  agentRole: AgentRoleSchema,
  description: z.string(),
  toolNames: z.array(z.string()),
  dependencies: z.array(z.number().int()).default([]),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).default("PENDING"),
  outputSummary: z.string().optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

// 3. Operational Trace & Audit Events (Plan-Act-Observe-Improve)
export const AgentAuditEventSchema = z.object({
  eventId: UUIDSchema,
  runId: UUIDSchema,
  tenantId: UUIDSchema,
  timestamp: z.string().datetime(),
  phase: z.enum(["GOAL", "PLAN", "ACT", "OBSERVE", "IMPROVE", "APPROVAL"]),
  actorId: UUIDSchema,
  agentRole: AgentRoleSchema,
  actionType: z.string(),
  toolName: z.string().optional(),
  inputSummary: z.string(),
  outputSummary: z.string(),
  status: z.enum(["SUCCESS", "WARNING", "REJECTED", "ERROR"]),
  riskLevel: AgentRiskLevelSchema,
  authorizedBy: z.string().optional(),
});
export type AgentAuditEvent = z.infer<typeof AgentAuditEventSchema>;

// 4. Observable Run State
export const AuraRunStateSchema = z.object({
  runId: UUIDSchema,
  tenantId: UUIDSchema,
  actorId: UUIDSchema,
  actorRole: UserRoleSchema,
  goal: AgentGoalRequestSchema,
  plan: z.array(PlanStepSchema),
  currentStepIndex: z.number().int().default(0),
  assignedAgent: AgentRoleSchema,
  status: AgentRunStatusSchema,
  toolInvocations: z.array(z.object({
    toolName: z.string(),
    invokedAt: z.string().datetime(),
    inputHash: z.string(),
    success: z.boolean(),
    durationMs: z.number(),
  })).default([]),
  retrievedEvidence: z.array(z.object({
    chunkId: z.string(),
    documentId: z.string(),
    pageNumber: z.number(),
    sectionHeader: z.string(),
    contentExcerpt: z.string(),
    confidence: z.number(),
  })).default([]),
  candidateDrafts: z.array(z.any()).default([]),
  critiqueFindings: z.array(z.object({
    criterion: z.string(),
    passed: z.boolean(),
    details: z.string(),
    suggestedRevision: z.string().optional(),
  })).default([]),
  revisionCount: z.number().int().default(0),
  maxRevisions: z.number().int().default(3),
  approvalRequired: z.boolean().default(true),
  isApproved: z.boolean().default(false),
  approvedBy: z.string().optional(),
  approvalNotes: z.string().optional(),
  finalDraftId: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AuraRunState = z.infer<typeof AuraRunStateSchema>;

// 5. Tool & Skill Registry Contracts
export const ToolDefinitionSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  riskLevel: AgentRiskLevelSchema,
  requiredRoles: z.array(UserRoleSchema),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const SkillDefinitionSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  requiredTools: z.array(z.string()),
  permissions: z.array(z.string()),
  owner: z.string().default("Team 5 (Team AURA)"),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

// 6. Model Context Protocol (MCP) Schemas (L5)
export const MCPToolMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()),
});
export type MCPToolMetadata = z.infer<typeof MCPToolMetadataSchema>;

export const MCPRequestSchema = z.object({
  protocolVersion: z.string().default("2024-11-05"),
  tenantId: UUIDSchema,
  authToken: z.string().min(1),
  method: z.enum(["tools/list", "tools/call", "resources/read"]),
  params: z.object({
    name: z.string().optional(),
    arguments: z.record(z.any()).optional(),
    uri: z.string().optional(),
  }).default({}),
});
export type MCPRequest = z.infer<typeof MCPRequestSchema>;

export const MCPResponseSchema = z.object({
  protocolVersion: z.string().default("2024-11-05"),
  success: z.boolean(),
  result: z.any().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.any().optional(),
  }).optional(),
});
export type MCPResponse = z.infer<typeof MCPResponseSchema>;

// 7. Deep Research Evidence Contracts (L9)
export const EvidenceItemSchema = z.object({
  title: z.string(),
  sourceType: z.enum(["COURSE_SYLLABUS", "ACADEMIC_PAPER", "STANDARDS_DOC", "INTERNAL_CURRICULUM"]),
  domainOrLocator: z.string(),
  excerpt: z.string(),
  retrievalTimestamp: z.string().datetime(),
  confidenceScore: z.number().min(0).max(1),
  limitations: z.string().optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const DeepResearchResultSchema = z.object({
  topicQuery: z.string(),
  subQuestions: z.array(z.string()),
  evidenceTable: z.array(EvidenceItemSchema),
  executiveSynthesis: z.string(),
  unsupportedClaims: z.array(z.string()).default([]),
  confidenceOverall: z.number().min(0).max(1),
});
export type DeepResearchResult = z.infer<typeof DeepResearchResultSchema>;

// 8. Cloud Operations Agent Contracts (L10)
export const CloudIncidentDiagnosisSchema = z.object({
  incidentId: UUIDSchema,
  serviceName: z.enum(["aura-postgres", "aura-docling-serve", "aura-embedding-worker", "aura-workflow-worker"]),
  healthy: boolean(),
  statusPayload: z.record(z.any()),
  diagnosedSeverity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  evidence: z.array(z.string()),
  remediationPlan: z.object({
    action: z.string(),
    impact: z.string(),
    rollback: z.string(),
    requiresApproval: z.boolean(),
    isApproved: z.boolean().default(false),
    executedAt: z.string().datetime().optional(),
  }),
});
function boolean() {
  return z.boolean();
}
export type CloudIncidentDiagnosis = z.infer<typeof CloudIncidentDiagnosisSchema>;

// 9. Agentic SDLC Mini Factory Contracts (L11)
export const SDLCWorkflowResultSchema = z.object({
  workflowId: UUIDSchema,
  requirement: z.string(),
  decomposedTasks: z.array(z.string()),
  testPlan: z.array(z.string()),
  generatedTests: z.string(),
  implementationDiff: z.string(),
  reviewerFindings: z.array(z.string()),
  humanApprovalRequired: z.boolean().default(true),
  humanApproved: z.boolean().default(false),
  verificationStatus: z.enum(["PENDING_APPROVAL", "VERIFIED_CLEAN", "REJECTED"]),
});
export type SDLCWorkflowResult = z.infer<typeof SDLCWorkflowResultSchema>;

// 10. CSE Discipline-Specific Contracts (L14)
export const CSEDisciplineAnalysisSchema = z.object({
  analysisId: UUIDSchema,
  assignmentTitle: z.string(),
  courseCode: z.string().default("26ECAC401"),
  studentArtifactFilename: z.string(),
  syntaxCorrectness: z.boolean(),
  staticInspectionFindings: z.array(z.string()),
  rubricCriteriaMapping: z.array(z.object({
    criterionId: z.string(),
    title: z.string(),
    maxMarks: z.number(),
    suggestedScore: z.number(),
    justification: z.string(),
    lineReferences: z.array(z.number()),
  })),
  detectedDefects: z.array(z.string()),
  proposedVivaQuestions: z.array(z.string()),
  hostCodeExecutionAttempted: z.literal(false), // STRICT INVARIANT: Always false
  createdAt: z.string().datetime(),
});
export type CSEDisciplineAnalysis = z.infer<typeof CSEDisciplineAnalysisSchema>;
