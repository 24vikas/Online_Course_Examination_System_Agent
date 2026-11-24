export * from "./academic.ts";
export * from "./syllabus.ts";
export * from "./lab.ts";
export * from "./import.ts";
export * from "./blueprint.ts";
export * from "./question.ts";
export * from "./coding-question.ts";
export * from "./document.ts";
export * from "./agentic.ts";

// Re-export foundational enums from Phase 1
import { z } from "zod";

export const UserRoleSchema = z.enum(["COE_ADMIN", "LECTURER", "STUDENT"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const TenantContextSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  role: UserRoleSchema,
  membershipId: z.string().uuid(),
});
export type TenantContext = z.infer<typeof TenantContextSchema>;

export const EligibilityDecisionSchema = z.enum([
  "ELIGIBLE",
  "INELIGIBLE",
  "PENDING_REVIEW",
  "UNKNOWN",
]);
export type EligibilityDecision = z.infer<typeof EligibilityDecisionSchema>;

export const ExamStateSchema = z.enum([
  "DRAFT",
  "BLUEPRINT_SUBMITTED",
  "BLUEPRINT_APPROVED",
  "SCHEDULED",
  "IN_PROGRESS",
  "SUBMITTED",
  "OBJECTIVE_SCORED",
  "FACULTY_REVIEW",
  "RELEASED",
]);
export type ExamState = z.infer<typeof ExamStateSchema>;
