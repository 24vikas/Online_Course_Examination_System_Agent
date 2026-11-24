import { z } from "zod";
import { UUIDSchema } from "./academic.ts";

// Bloom Taxonomy Levels
export const BloomLevelSchema = z.enum([
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
]);
export type BloomLevel = z.infer<typeof BloomLevelSchema>;

// Subject Entity (e.g., "DBMS", "SQL", "OOP", "Algorithms", "DSP")
export const SubjectSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  subjectCode: z.string().min(2).max(32),
  subjectName: z.string().min(2).max(255),
  description: z.string().default(""),
});
export type Subject = z.infer<typeof SubjectSchema>;

// Syllabus Version Entity (Immutable, historically reproducible source)
export const SyllabusVersionSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  subjectId: UUIDSchema,
  versionTag: z.string().min(1).max(32), // e.g. "AY-2026-27-v1.0"
  effectiveAcademicYearId: UUIDSchema,
  sourceDocumentSha256: z.string().length(64).optional(),
  sourceDocumentFilename: z.string().optional(),
  status: z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "DEPRECATED"]).default("DRAFT"),
  approvedBy: UUIDSchema.optional(),
  approvedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type SyllabusVersion = z.infer<typeof SyllabusVersionSchema>;

// Course Learning Outcome (CO)
export const CourseOutcomeSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  outcomeCode: z.string().min(2).max(16), // e.g. "CO1", "CO2"
  description: z.string().min(5).max(1000),
  bloomLevel: BloomLevelSchema,
});
export type CourseOutcome = z.infer<typeof CourseOutcomeSchema>;

// Syllabus Unit / Module
export const SyllabusUnitSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  unitNumber: z.number().int().min(1).max(20),
  title: z.string().min(2).max(255),
  plannedHours: z.number().min(0).max(100).default(8),
});
export type SyllabusUnit = z.infer<typeof SyllabusUnitSchema>;

// Syllabus Topic & Subtopics
export const SyllabusTopicSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  unitId: UUIDSchema,
  topicCode: z.string().min(2).max(32), // e.g. "TOP-1.1-DDL"
  title: z.string().min(2).max(255),
  orderIndex: z.number().int().min(0),
  subtopics: z.array(z.string()).default([]), // e.g. ["CREATE TABLE", "ALTER TABLE", "Constraints"]
});
export type SyllabusTopic = z.infer<typeof SyllabusTopicSchema>;

// Topic Learning Outcome (TLO)
export const TopicLearningOutcomeSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  topicId: UUIDSchema,
  tloCode: z.string().min(2).max(16), // e.g. "TLO-1.1"
  description: z.string().min(5).max(500),
  bloomLevel: BloomLevelSchema,
});
export type TopicLearningOutcome = z.infer<typeof TopicLearningOutcomeSchema>;

// Topic to Course Outcome (CO) Mapping
export const TopicOutcomeMappingSchema = z.object({
  topicId: UUIDSchema,
  courseOutcomeId: UUIDSchema,
});
export type TopicOutcomeMapping = z.infer<typeof TopicOutcomeMappingSchema>;
