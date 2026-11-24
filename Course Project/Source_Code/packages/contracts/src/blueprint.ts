import { z } from "zod";
import { UUIDSchema } from "./academic.ts";
import { BloomLevelSchema } from "./syllabus.ts";

// Assessment Category
export const AssessmentTypeSchema = z.enum([
  "PRACTICE_MOCK",
  "FORMATIVE_QUIZ",
  "INTERNAL_ASSESSMENT",
  "LAB_PRACTICAL",
  "FORMAL_SEMESTER_EXAM",
]);
export type AssessmentType = z.infer<typeof AssessmentTypeSchema>;

// Question Types
export const QuestionTypeSchema = z.enum([
  "MCQ_SINGLE",
  "MCQ_MULTIPLE",
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "SQL_DESIGN",
  "CODE_REASONING",
  "CODING",
  "PRACTICAL_TASK",
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

// Blueprint Section Definition
export const BlueprintSectionSchema = z.object({
  sectionKey: z.string().min(1).max(16), // e.g. "PART_A", "PART_B"
  sectionTitle: z.string().min(2).max(128),
  maxMarks: z.number().min(1).max(200),
  questionCount: z.number().int().min(1).max(100),
  questionTypes: z.array(QuestionTypeSchema).min(1),
  targetTopicIds: z.array(UUIDSchema).min(1),
  compulsory: z.boolean().default(true),
});
export type BlueprintSection = z.infer<typeof BlueprintSectionSchema>;

// Assessment Blueprint (Mandatory Syllabus Version & Topic Coverage)
export const AssessmentBlueprintSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  courseOfferingId: UUIDSchema,
  syllabusVersionId: UUIDSchema, // Mandatory: no blueprint can exist without an exact syllabus version
  assessmentType: AssessmentTypeSchema,
  title: z.string().min(2).max(255),
  totalMarks: z.number().min(1).max(500),
  durationMinutes: z.number().int().min(5).max(360),
  allowedAttempts: z.number().int().min(1).max(10).default(1),
  status: z.enum(["DRAFT", "PENDING_COE_APPROVAL", "APPROVED", "REJECTED"]).default("DRAFT"),
  sections: z.array(BlueprintSectionSchema).min(1),
  targetTopicIds: z.array(UUIDSchema).min(1),
  targetCourseOutcomeIds: z.array(UUIDSchema).default([]),
  approvedBy: UUIDSchema.optional(),
  approvedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type AssessmentBlueprint = z.infer<typeof AssessmentBlueprintSchema>;

// Advisory Coverage Report Output
export const UnitCoverageSummarySchema = z.object({
  unitNumber: z.number().int(),
  unitTitle: z.string(),
  totalTopicsInUnit: z.number().int(),
  coveredTopicsInBlueprint: z.number().int(),
  coveragePercentage: z.number().min(0).max(100),
});
export type UnitCoverageSummary = z.infer<typeof UnitCoverageSummarySchema>;

export const BlueprintCoverageReportSchema = z.object({
  blueprintId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  isBalanced: z.boolean(),
  unitCoverage: z.array(UnitCoverageSummarySchema),
  bloomDistribution: z.record(BloomLevelSchema, z.number()),
  coDistribution: z.record(z.string(), z.number()),
  warnings: z.array(z.string()),
});
export type BlueprintCoverageReport = z.infer<typeof BlueprintCoverageReportSchema>;
