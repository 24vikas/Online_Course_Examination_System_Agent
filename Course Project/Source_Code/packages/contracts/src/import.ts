import { z } from "zod";
import { UUIDSchema } from "./academic.ts";

// Import Lifecycle Status
export const ImportStatusSchema = z.enum([
  "PENDING_VALIDATION",
  "VALIDATED_WITH_ERRORS",
  "VALIDATED_CLEAN",
  "COMMITTED",
  "FAILED",
]);
export type ImportStatus = z.infer<typeof ImportStatusSchema>;

// Detailed Row-Level Validation Diagnostic
export const ValidationRowErrorSchema = z.object({
  rowNumber: z.number().int().min(1),
  field: z.string(),
  errorCode: z.string(), // e.g. "ERR_MISSING_REQUIRED_FIELD", "ERR_DUPLICATE_ID_IN_FILE"
  message: z.string(),
  rawValue: z.string().optional(),
});
export type ValidationRowError = z.infer<typeof ValidationRowErrorSchema>;

// Parsed Row Input (Synthetic Roster Row)
export const RosterRowInputSchema = z.object({
  institutionalStudentId: z.string().min(2).max(64),
  firstName: z.string().min(1).max(128),
  lastName: z.string().max(128).optional().default(""),
  email: z.string().email(),
  batchCode: z.string().min(2).max(64),
  admissionYear: z.number().int().min(2000).max(2100).optional(),
});
export type RosterRowInput = z.infer<typeof RosterRowInputSchema>;

// Dry-Run Validation Preview Response
export const ImportPreviewResponseSchema = z.object({
  importId: UUIDSchema,
  status: ImportStatusSchema,
  totalRows: z.number().int().min(0),
  validRows: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  detectedBatches: z.array(z.string()),
  errors: z.array(ValidationRowErrorSchema),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

// Commit Request
export const CommitImportRequestSchema = z.object({
  importId: UUIDSchema,
  academicTermId: UUIDSchema,
});
export type CommitImportRequest = z.infer<typeof CommitImportRequestSchema>;

// Persisted Import Record (Audit & Provenance)
export const ImportRecordSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  uploadedBy: UUIDSchema,
  sourceFilename: z.string(),
  sourceFileSha256: z.string().length(64),
  academicTermId: UUIDSchema,
  status: ImportStatusSchema,
  totalRows: z.number().int(),
  importedRows: z.number().int(),
  errorCount: z.number().int(),
  diagnosticsJson: z.string().optional(),
  createdAt: z.string().datetime(),
  committedAt: z.string().datetime().optional(),
});
export type ImportRecord = z.infer<typeof ImportRecordSchema>;
