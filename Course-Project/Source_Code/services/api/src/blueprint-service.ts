import crypto from "crypto";
import type {
  TenantContext,
  AssessmentBlueprint,
  BlueprintSection,
  BlueprintCoverageReport,
  UnitCoverageSummary,
  AssessmentType,
  BloomLevel,
} from "@exam-system/contracts";

import type { DatabaseAdapter } from "./question-review-service.ts";
export type { DatabaseAdapter };

export interface SyllabusTopicInfo {
  id: string;
  topicCode: string;
  topicTitle: string;
  unitNumber: number;
  bloomLevel?: BloomLevel;
  courseOutcomeId?: string;
}

export interface SyllabusUnitInfo {
  unitNumber: number;
  unitTitle: string;
  topics: SyllabusTopicInfo[];
}

export interface CreateBlueprintInput {
  courseOfferingId: string;
  syllabusVersionId: string;
  assessmentType: AssessmentType;
  title: string;
  totalMarks: number;
  durationMinutes: number;
  allowedAttempts?: number;
  sections: BlueprintSection[];
  targetTopicIds: string[];
  targetCourseOutcomeIds?: string[];
}

export class UnauthorizedBlueprintActionError extends Error {
  constructor(message = "Actor does not have authority to perform this blueprint action") {
    super(message);
    this.name = "UnauthorizedBlueprintActionError";
  }
}

export class BlueprintNotFoundError extends Error {
  constructor(message = "Assessment blueprint not found or access denied") {
    super(message);
    this.name = "BlueprintNotFoundError";
  }
}

export class InvalidBlueprintStateError extends Error {
  constructor(message = "Blueprint is not in a valid state for this transition") {
    super(message);
    this.name = "InvalidBlueprintStateError";
  }
}

export class BlueprintValidationError extends Error {
  public readonly validationErrors: string[];

  constructor(errors: string[]) {
    super(`BLUEPRINT_VALIDATION_FAILED: ${errors.join("; ")}`);
    this.name = "BlueprintValidationError";
    this.validationErrors = errors;
  }
}

/**
 * Authoritative Assessment Blueprint Service
 * Governs syllabus version binding, topic coverage, section weight validation,
 * Bloom taxonomy distribution, and role-gated COE approval state transitions.
 */
export class BlueprintService {
  private readonly db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  private assertLecturerOrAdmin(actor: TenantContext): void {
    if (actor.role !== "LECTURER" && actor.role !== "COE_ADMIN") {
      throw new UnauthorizedBlueprintActionError(
        `Role '${actor.role}' cannot author or edit assessment blueprints. LECTURER or COE_ADMIN required.`
      );
    }
  }

  private assertCoeAdmin(actor: TenantContext): void {
    if (actor.role !== "COE_ADMIN") {
      throw new UnauthorizedBlueprintActionError(
        `Role '${actor.role}' is not authorized to approve or publish blueprints. Strictly restricted to COE_ADMIN.`
      );
    }
  }

  /**
   * Validate blueprint structure, syllabus-version binding, marks integrity, and duration.
   */
  public validateBlueprintStructure(input: CreateBlueprintInput): void {
    const errors: string[] = [];

    if (!input.syllabusVersionId) {
      errors.push("MISSING_SYLLABUS_VERSION: Blueprint must be bound to an immutable syllabus_version_id.");
    }

    if (!input.title || input.title.trim().length < 2) {
      errors.push("INVALID_TITLE: Title must be at least 2 characters.");
    }

    if (input.totalMarks <= 0) {
      errors.push("INVALID_TOTAL_MARKS: Total marks must be greater than 0.");
    }

    if (input.durationMinutes < 5 || input.durationMinutes > 360) {
      errors.push("INVALID_DURATION: Duration must be between 5 and 360 minutes.");
    }

    if (!input.sections || input.sections.length === 0) {
      errors.push("NO_SECTIONS: Blueprint must define at least one section.");
    } else {
      const sectionMarksSum = input.sections.reduce((sum, s) => sum + s.maxMarks, 0);
      if (sectionMarksSum !== input.totalMarks) {
        errors.push(
          `SECTION_MARKS_MISMATCH: Sum of section marks (${sectionMarksSum}) does not equal totalMarks (${input.totalMarks}).`
        );
      }

      for (const [idx, sec] of Array.from(input.sections.entries())) {
        if (!sec.targetTopicIds || sec.targetTopicIds.length === 0) {
          errors.push(`SECTION_${idx + 1}_EMPTY_TOPICS: Section '${sec.sectionKey}' has no target topics assigned.`);
        }
        if (sec.questionCount <= 0) {
          errors.push(`SECTION_${idx + 1}_INVALID_QUESTION_COUNT: Question count must be greater than 0.`);
        }
      }
    }

    if (!input.targetTopicIds || input.targetTopicIds.length === 0) {
      errors.push("EMPTY_TARGET_TOPICS: Blueprint must reference at least one target topic.");
    }

    if (errors.length > 0) {
      throw new BlueprintValidationError(errors);
    }
  }

  /**
   * Evaluates syllabus coverage and Bloom taxonomy distribution against course units.
   */
  public evaluateCoverage(
    blueprintId: string,
    syllabusVersionId: string,
    targetTopicIds: string[],
    syllabusUnits: SyllabusUnitInfo[]
  ): BlueprintCoverageReport {
    const targetSet = new Set(targetTopicIds);
    const unitSummaries: UnitCoverageSummary[] = [];
    const warnings: string[] = [];
    const bloomCounts: Record<BloomLevel, number> = {
      REMEMBER: 0,
      UNDERSTAND: 0,
      APPLY: 0,
      ANALYZE: 0,
      EVALUATE: 0,
      CREATE: 0,
    };
    const coCounts: Record<string, number> = {};

    for (const unit of syllabusUnits) {
      const totalTopicsInUnit = unit.topics.length;
      let covered = 0;

      for (const t of unit.topics) {
        if (targetSet.has(t.id)) {
          covered++;
          if (t.bloomLevel && bloomCounts[t.bloomLevel] !== undefined) {
            bloomCounts[t.bloomLevel]++;
          }
          if (t.courseOutcomeId) {
            coCounts[t.courseOutcomeId] = (coCounts[t.courseOutcomeId] || 0) + 1;
          }
        }
      }

      const coveragePercentage = totalTopicsInUnit > 0
        ? Math.round((covered / totalTopicsInUnit) * 100)
        : 0;

      unitSummaries.push({
        unitNumber: unit.unitNumber,
        unitTitle: unit.unitTitle,
        totalTopicsInUnit,
        coveredTopicsInBlueprint: covered,
        coveragePercentage,
      });

      if (coveragePercentage === 0) {
        warnings.push(`ZERO_COVERAGE: Unit ${unit.unitNumber} (${unit.unitTitle}) has 0 topics covered in this blueprint.`);
      } else if (coveragePercentage < 30) {
        warnings.push(`LOW_COVERAGE: Unit ${unit.unitNumber} (${unit.unitTitle}) coverage is low (${coveragePercentage}%).`);
      }
    }

    // Check cognitive balance
    const totalCovered = Object.values(bloomCounts).reduce((a, b) => a + b, 0);
    if (totalCovered > 0) {
      const rememberPct = (bloomCounts.REMEMBER / totalCovered) * 100;
      if (rememberPct > 70) {
        warnings.push("COGNITIVE_SKEW: More than 70% of topics are restricted to lowest-order cognitive level (REMEMBER).");
      }
    }

    const isBalanced = warnings.filter((w) => w.startsWith("ZERO_COVERAGE")).length === 0;

    return {
      blueprintId,
      syllabusVersionId,
      isBalanced,
      unitCoverage: unitSummaries,
      bloomDistribution: bloomCounts,
      coDistribution: coCounts,
      warnings,
    };
  }

  /**
   * Create a new draft blueprint.
   */
  async createBlueprint(
    actor: TenantContext,
    input: CreateBlueprintInput
  ): Promise<AssessmentBlueprint> {
    this.assertLecturerOrAdmin(actor);
    this.validateBlueprintStructure(input);

    const blueprintId = crypto.randomUUID();
    const now = new Date().toISOString();

    const sql = `
      INSERT INTO exam_blueprints (
        id, tenant_id, course_offering_id, syllabus_version_id, assessment_type,
        title, total_marks, duration_minutes, allowed_attempts, status,
        sections, target_topic_ids, target_course_outcome_ids, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
      RETURNING *
    `;

    const rows = await this.db.query(sql, [
      blueprintId,
      actor.tenantId,
      input.courseOfferingId,
      input.syllabusVersionId,
      input.assessmentType,
      input.title.trim(),
      input.totalMarks,
      input.durationMinutes,
      input.allowedAttempts ?? 1,
      "DRAFT",
      JSON.stringify(input.sections),
      input.targetTopicIds,
      input.targetCourseOutcomeIds ?? [],
      actor.userId,
      now,
    ]);

    return this.mapRowToBlueprint(rows[0]);
  }

  /**
   * Submit draft blueprint for COE Admin review.
   */
  async submitForApproval(
    actor: TenantContext,
    blueprintId: string
  ): Promise<AssessmentBlueprint> {
    this.assertLecturerOrAdmin(actor);

    const existing = await this.getBlueprint(actor, blueprintId);
    if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
      throw new InvalidBlueprintStateError(
        `Cannot submit blueprint with status '${existing.status}'. Must be DRAFT or REJECTED.`
      );
    }

    const sql = `
      UPDATE exam_blueprints
      SET status = 'PENDING_COE_APPROVAL', updated_at = $1
      WHERE id = $2 AND tenant_id = $3
      RETURNING *
    `;
    const rows = await this.db.query(sql, [new Date().toISOString(), blueprintId, actor.tenantId]);
    return this.mapRowToBlueprint(rows[0]);
  }

  /**
   * COE Administrator explicitly approves a submitted blueprint.
   */
  async approveBlueprint(
    actor: TenantContext,
    blueprintId: string
  ): Promise<AssessmentBlueprint> {
    this.assertCoeAdmin(actor);

    const existing = await this.getBlueprint(actor, blueprintId);
    if (existing.status !== "PENDING_COE_APPROVAL") {
      throw new InvalidBlueprintStateError(
        `Cannot approve blueprint with status '${existing.status}'. Blueprint must be PENDING_COE_APPROVAL.`
      );
    }

    const now = new Date().toISOString();
    const sql = `
      UPDATE exam_blueprints
      SET status = 'APPROVED', approved_by = $1, approved_at = $2, updated_at = $2
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;
    const rows = await this.db.query(sql, [actor.userId, now, blueprintId, actor.tenantId]);
    return this.mapRowToBlueprint(rows[0]);
  }

  /**
   * COE Administrator rejects a blueprint with an audited reason.
   */
  async rejectBlueprint(
    actor: TenantContext,
    blueprintId: string,
    rejectionReason: string
  ): Promise<AssessmentBlueprint> {
    this.assertCoeAdmin(actor);

    if (!rejectionReason || rejectionReason.trim().length < 5) {
      throw new BlueprintValidationError(["INVALID_REJECTION_REASON: Reason must be at least 5 characters."]);
    }

    const existing = await this.getBlueprint(actor, blueprintId);
    if (existing.status !== "PENDING_COE_APPROVAL") {
      throw new InvalidBlueprintStateError(
        `Cannot reject blueprint with status '${existing.status}'. Blueprint must be PENDING_COE_APPROVAL.`
      );
    }

    const now = new Date().toISOString();
    const sql = `
      UPDATE exam_blueprints
      SET status = 'REJECTED', rejection_reason = $1, updated_at = $2
      WHERE id = $3 AND tenant_id = $4
      RETURNING *
    `;
    const rows = await this.db.query(sql, [rejectionReason.trim(), now, blueprintId, actor.tenantId]);
    return this.mapRowToBlueprint(rows[0]);
  }

  /**
   * Retrieve a blueprint with tenant isolation check.
   */
  async getBlueprint(actor: TenantContext, blueprintId: string): Promise<AssessmentBlueprint> {
    const sql = `
      SELECT * FROM exam_blueprints
      WHERE id = $1 AND tenant_id = $2
    `;
    const rows = await this.db.query(sql, [blueprintId, actor.tenantId]);
    if (!rows || rows.length === 0) {
      throw new BlueprintNotFoundError();
    }
    return this.mapRowToBlueprint(rows[0]);
  }

  /**
   * List blueprints for a course offering within the actor's tenant.
   */
  async listBlueprints(
    actor: TenantContext,
    courseOfferingId: string
  ): Promise<AssessmentBlueprint[]> {
    const sql = `
      SELECT * FROM exam_blueprints
      WHERE course_offering_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
    `;
    const rows = await this.db.query(sql, [courseOfferingId, actor.tenantId]);
    return (rows || []).map((r: any) => this.mapRowToBlueprint(r));
  }

  private mapRowToBlueprint(row: any): AssessmentBlueprint {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      courseOfferingId: row.course_offering_id,
      syllabusVersionId: row.syllabus_version_id,
      assessmentType: row.assessment_type,
      title: row.title,
      totalMarks: Number(row.total_marks),
      durationMinutes: Number(row.duration_minutes),
      allowedAttempts: Number(row.allowed_attempts || 1),
      status: row.status,
      sections: typeof row.sections === "string" ? JSON.parse(row.sections) : (row.sections || []),
      targetTopicIds: row.target_topic_ids || [],
      targetCourseOutcomeIds: row.target_course_outcome_ids || [],
      approvedBy: row.approved_by || undefined,
      approvedAt: row.approved_at || undefined,
      createdAt: row.created_at,
    };
  }
}
