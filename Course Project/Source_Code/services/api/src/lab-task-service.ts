import crypto from "crypto";
import type {
  TenantContext,
  LabPracticalTask,
  RubricCriterion,
} from "@exam-system/contracts";
import type { DatabaseAdapter } from "./question-review-service.ts";

export interface CreateLabTaskInput {
  syllabusVersionId: string;
  taskCode: string;
  title: string;
  problemStatement: string;
  submissionType: "FILE_UPLOAD" | "GIT_REPOSITORY" | "SQL_SCRIPT" | "VIVA_ONLY";
  maxMarks: number;
  targetTopicIds: string[];
  targetCourseOutcomeIds?: string[];
  requiredToolIds?: string[];
  rubric: RubricCriterion[];
}

export interface SubmitTaskSolutionInput {
  taskId: string;
  courseOfferingId: string;
  submissionType: "FILE_UPLOAD" | "GIT_REPOSITORY" | "SQL_SCRIPT" | "VIVA_ONLY";
  content: string; // File key, Git URL, or SQL script
  fileName?: string;
  fileSizeBytes?: number;
}

export interface LabSubmissionItem {
  id: string;
  tenantId: string;
  taskId: string;
  courseOfferingId: string;
  studentId: string;
  submissionType: "FILE_UPLOAD" | "GIT_REPOSITORY" | "SQL_SCRIPT" | "VIVA_ONLY";
  storagePath?: string;
  submittedContent: string;
  status: "SUBMITTED" | "EVALUATED" | "RESUBMISSION_REQUESTED";
  awardedMarks?: number;
  maxMarks: number;
  evaluatorFeedback?: string;
  evaluatedBy?: string;
  evaluatedAt?: string;
  submittedAt: string;
}

export interface EvaluateLabSubmissionInput {
  submissionId: string;
  criterionScores: Record<string, number>;
  feedback: string;
}

export class UnauthorizedLabActionError extends Error {
  constructor(message = "Actor does not have authority to perform this lab practical action") {
    super(message);
    this.name = "UnauthorizedLabActionError";
  }
}

export class LabTaskNotFoundError extends Error {
  constructor(message = "Lab practical task not found or access denied") {
    super(message);
    this.name = "LabTaskNotFoundError";
  }
}

export class LabSubmissionValidationError extends Error {
  constructor(message: string) {
    super(`LAB_VALIDATION_FAILED: ${message}`);
    this.name = "LabSubmissionValidationError";
  }
}

/**
 * Subject-Agnostic Lab Practical & Assessment Service
 * Governs lab task definition, isolated multi-tenant file & script submissions,
 * safety guardrails (zero untrusted host execution), and faculty rubric evaluations.
 */
export class LabTaskService {
  private readonly db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  private assertLecturerOrAdmin(actor: TenantContext): void {
    if (actor.role !== "LECTURER" && actor.role !== "COE_ADMIN") {
      throw new UnauthorizedLabActionError(
        `Role '${actor.role}' cannot author tasks or evaluate submissions. LECTURER or COE_ADMIN required.`
      );
    }
  }

  /**
   * Create a new lab practical task linked to syllabus version and topics.
   */
  async createTask(actor: TenantContext, input: CreateLabTaskInput): Promise<LabPracticalTask> {
    this.assertLecturerOrAdmin(actor);

    if (!input.taskCode || input.taskCode.trim().length < 2) {
      throw new LabSubmissionValidationError("Task code must be at least 2 characters.");
    }
    if (!input.title || input.title.trim().length < 3) {
      throw new LabSubmissionValidationError("Title must be at least 3 characters.");
    }
    if (!input.problemStatement || input.problemStatement.trim().length < 10) {
      throw new LabSubmissionValidationError("Problem statement must be at least 10 characters.");
    }
    if (input.maxMarks <= 0) {
      throw new LabSubmissionValidationError("Max marks must be greater than 0.");
    }
    if (!input.rubric || input.rubric.length === 0) {
      throw new LabSubmissionValidationError("Lab task must specify at least one rubric criterion.");
    }

    const totalRubricMarks = input.rubric.reduce((sum, r) => sum + r.maxMarks, 0);
    if (totalRubricMarks !== input.maxMarks) {
      throw new LabSubmissionValidationError(
        `Rubric sum (${totalRubricMarks}) must equal maxMarks (${input.maxMarks}).`
      );
    }

    const taskId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO lab_practical_tasks (
        id, tenant_id, syllabus_version_id, task_code, title,
        problem_statement, submission_type, max_marks, human_review_required,
        rubric_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const rows = await this.db.query(sql, [
      taskId,
      actor.tenantId,
      input.syllabusVersionId,
      input.taskCode.trim().toUpperCase(),
      input.title.trim(),
      input.problemStatement.trim(),
      input.submissionType,
      input.maxMarks,
      true, // Human review invariant
      JSON.stringify(input.rubric),
      now,
    ]);

    return {
      id: taskId,
      tenantId: actor.tenantId,
      syllabusVersionId: input.syllabusVersionId,
      taskCode: input.taskCode.trim().toUpperCase(),
      title: input.title.trim(),
      problemStatement: input.problemStatement.trim(),
      submissionType: input.submissionType,
      maxMarks: input.maxMarks,
      humanReviewRequired: true,
      targetTopicIds: input.targetTopicIds,
      targetCourseOutcomeIds: input.targetCourseOutcomeIds || [],
      requiredToolIds: input.requiredToolIds || [],
      rubric: input.rubric,
      createdAt: now,
    };
  }

  /**
   * Student submits practical task solution.
   * Safety Guardrail: NO ARBITRARY CODE EXECUTION in main container runtime.
   */
  async submitSolution(
    actor: TenantContext,
    input: SubmitTaskSolutionInput
  ): Promise<LabSubmissionItem> {
    if (actor.role !== "STUDENT") {
      throw new UnauthorizedLabActionError("Only students can submit lab solutions.");
    }

    const trimmedContent = (input.content || "").trim();

    // Validation per submission mode
    if (input.submissionType === "SQL_SCRIPT") {
      if (trimmedContent.length < 5) {
        throw new LabSubmissionValidationError("SQL script cannot be empty.");
      }
      // Check for dangerous system commands
      const lower = trimmedContent.toLowerCase();
      if (
        lower.includes("xp_cmdshell") ||
        lower.includes("copy") && lower.includes("program") ||
        lower.includes("pg_read_file")
      ) {
        throw new LabSubmissionValidationError("Prohibited database commands detected in SQL script.");
      }
    } else if (input.submissionType === "GIT_REPOSITORY") {
      if (!trimmedContent.startsWith("https://")) {
        throw new LabSubmissionValidationError("Git repository URL must use secure https:// protocol.");
      }
    } else if (input.submissionType === "FILE_UPLOAD") {
      if (!input.fileName) {
        throw new LabSubmissionValidationError("File upload requires valid filename.");
      }
      if (input.fileSizeBytes && input.fileSizeBytes > 15 * 1024 * 1024) {
        throw new LabSubmissionValidationError("File exceeds maximum allowed size (15 MB).");
      }
    }

    // Isolated multi-tenant storage key
    const safeFileName = (input.fileName || "submission.txt").replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `tenants/${actor.tenantId}/courses/${input.courseOfferingId}/tasks/${input.taskId}/${actor.userId}/${safeFileName}`;

    const submissionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO lab_submissions (
        id, tenant_id, task_id, course_offering_id, student_id,
        submission_type, storage_path, submitted_content, status, max_marks, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const rows = await this.db.query(sql, [
      submissionId,
      actor.tenantId,
      input.taskId,
      input.courseOfferingId,
      actor.userId,
      input.submissionType,
      storagePath,
      trimmedContent,
      "SUBMITTED",
      50, // Default or task max marks
      now,
    ]);

    return {
      id: submissionId,
      tenantId: actor.tenantId,
      taskId: input.taskId,
      courseOfferingId: input.courseOfferingId,
      studentId: actor.userId,
      submissionType: input.submissionType,
      storagePath,
      submittedContent: trimmedContent,
      status: "SUBMITTED",
      maxMarks: 50,
      submittedAt: now,
    };
  }

  /**
   * Faculty evaluates lab practical submission against rubrics.
   */
  async evaluateSubmission(
    actor: TenantContext,
    input: EvaluateLabSubmissionInput,
    rubric: RubricCriterion[]
  ): Promise<LabSubmissionItem> {
    this.assertLecturerOrAdmin(actor);

    let totalAwarded = 0;
    const rubricMap = new Map(rubric.map((r) => [r.criterionId, r.maxMarks]));

    for (const [criterionId, score] of Object.entries(input.criterionScores)) {
      const maxForCrit = rubricMap.get(criterionId);
      if (maxForCrit === undefined) {
        throw new LabSubmissionValidationError(`Unknown rubric criterion '${criterionId}'.`);
      }
      if (score < 0 || score > maxForCrit) {
        throw new LabSubmissionValidationError(
          `Score ${score} for criterion '${criterionId}' is out of bounds [0, ${maxForCrit}].`
        );
      }
      totalAwarded += score;
    }

    const now = new Date().toISOString();
    const sql = `
      UPDATE lab_submissions
      SET awarded_marks = $1, status = 'EVALUATED', evaluator_feedback = $2, evaluated_by = $3, evaluated_at = $4
      WHERE id = $5 AND tenant_id = $6
      RETURNING *
    `;

    const rows = await this.db.query(sql, [
      totalAwarded,
      input.feedback.trim(),
      actor.userId,
      now,
      input.submissionId,
      actor.tenantId,
    ]);

    if (!rows || rows.length === 0) {
      throw new LabTaskNotFoundError("Submission not found or access denied.");
    }

    const r = rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      taskId: r.task_id,
      courseOfferingId: r.course_offering_id,
      studentId: r.student_id,
      submissionType: r.submission_type,
      storagePath: r.storage_path,
      submittedContent: r.submitted_content,
      status: "EVALUATED",
      awardedMarks: totalAwarded,
      maxMarks: r.max_marks || totalAwarded,
      evaluatorFeedback: input.feedback.trim(),
      evaluatedBy: actor.userId,
      evaluatedAt: now,
      submittedAt: r.submitted_at,
    };
  }
}
