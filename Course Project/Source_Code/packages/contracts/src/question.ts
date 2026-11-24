import { z } from "zod";
import { UUIDSchema } from "./academic.ts";
import { BloomLevelSchema } from "./syllabus.ts";
import { QuestionTypeSchema } from "./blueprint.ts";

// Question Review Status
export const QuestionReviewStatusSchema = z.enum([
  "DRAFT",
  "APPROVED_FOR_QUESTION_BANK",
  "REJECTED",
  "REVISION_REQUESTED",
]);
export type QuestionReviewStatus = z.infer<typeof QuestionReviewStatusSchema>;

// Question Option with key and text
export const QuestionOptionSchema = z.object({
  key: z.string(),
  text: z.string(),
  // Note: isCorrect is confidential to lecturer/admin and never returned to students!
  isCorrect: z.boolean().optional(),
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

// Canonical Question Bank Item
export const QuestionBankItemSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  courseOfferingId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  topicId: UUIDSchema,
  courseOutcomeId: UUIDSchema.optional(),
  topicLearningOutcomeId: UUIDSchema.optional(),
  questionText: z.string().min(5),
  questionType: QuestionTypeSchema,
  options: z.array(z.any()).default([]),
  correctAnswer: z.string().optional(), // Nullable in question_bank; canonical answer key is in question_answer_keys
  marks: z.number().min(0.5).max(100).default(1.0),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  bloomLevel: BloomLevelSchema.default("UNDERSTAND"),
  bloomVerificationStatus: z.enum(["UNVERIFIED", "CONFIRMED_BY_LECTURER", "OVERRIDDEN_BY_LECTURER"]).default("UNVERIFIED"),
  sourceLocator: z.string().min(1), // e.g. "chunk:chk-123 - page 14"
  sourceExcerpt: z.string().default(""),
  provenanceChunkId: UUIDSchema.optional(),
  isSynthetic: z.boolean().default(false),
  reviewStatus: QuestionReviewStatusSchema.default("DRAFT"),
  reviewedByUserId: UUIDSchema.optional(),
  reviewedAt: z.string().datetime().optional(),
  rejectionReason: z.string().optional(),
  revisionNotes: z.string().optional(),
  version: z.number().int().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});
export type QuestionBankItem = z.infer<typeof QuestionBankItemSchema>;

// Student-Facing Question Item (Guaranteed Confidentiality: No answers, no rubrics, no answer keys)
export const StudentFacingQuestionItemSchema = QuestionBankItemSchema.omit({
  correctAnswer: true,
  reviewedByUserId: true,
  rejectionReason: true,
  revisionNotes: true,
}).extend({
  // Options presented to student without isCorrect indicator
  options: z.array(z.object({
    key: z.string(),
    text: z.string(),
  })),
});
export type StudentFacingQuestionItem = z.infer<typeof StudentFacingQuestionItemSchema>;

// Question Review & Approval Action (Lecturer HITL Gate)
export const QuestionReviewActionSchema = z.object({
  questionId: UUIDSchema,
  action: z.enum(["APPROVE", "REJECT", "REQUEST_REVISION"]),
  confirmedBloomLevel: BloomLevelSchema.optional(),
  confirmedAnswer: z.string().optional(),
  gradingRubricJson: z.string().optional(),
  modifiedText: z.string().optional(),
  notes: z.string().max(1000).optional(),
  expectedVersion: z.number().int().optional(),
});
export type QuestionReviewAction = z.infer<typeof QuestionReviewActionSchema>;
