import { z } from "zod";
import { UUIDSchema } from "./academic.ts";

// Tool / Framework Catalog Item (Controlled vocabulary, extensible)
export const ToolCatalogItemSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema.optional(), // null means global/system tool
  toolCode: z.string().min(2).max(64), // e.g. "POSTGRESQL", "PYTHON_3", "DOCKER", "GCC"
  toolName: z.string().min(2).max(128),
  category: z.enum(["DATABASE", "LANGUAGE", "CONTAINER", "FRAMEWORK", "ANALYSIS_TOOL", "OTHER"]),
  defaultVersion: z.string().max(32).default("latest"),
  isVerified: z.boolean().default(true),
});
export type ToolCatalogItem = z.infer<typeof ToolCatalogItemSchema>;

// Rubric Criterion for Lab/Project Evaluation
export const RubricCriterionSchema = z.object({
  criterionId: z.string().min(2).max(32),
  title: z.string().min(2).max(128),
  description: z.string().max(500).default(""),
  maxMarks: z.number().min(0.5).max(100),
  weightPercentage: z.number().min(0).max(100),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

// Lab Practical / Project Task
export const LabPracticalTaskSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  taskCode: z.string().min(2).max(32), // e.g. "LAB-TASK-01"
  title: z.string().min(2).max(255),
  problemStatement: z.string().min(10), // Markdown task description
  submissionType: z.enum(["FILE_UPLOAD", "GIT_REPOSITORY", "SQL_SCRIPT", "VIVA_ONLY"]).default("FILE_UPLOAD"),
  maxMarks: z.number().min(1).max(100),
  humanReviewRequired: z.literal(true), // Non-negotiable safety invariant
  targetTopicIds: z.array(UUIDSchema).min(1),
  targetCourseOutcomeIds: z.array(UUIDSchema).default([]),
  requiredToolIds: z.array(UUIDSchema).default([]),
  rubric: z.array(RubricCriterionSchema).min(1),
  createdAt: z.string().datetime(),
});
export type LabPracticalTask = z.infer<typeof LabPracticalTaskSchema>;
