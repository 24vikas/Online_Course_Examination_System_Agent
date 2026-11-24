import type {
  TenantContext,
  QuestionBankItem,
  StudentFacingQuestionItem,
  QuestionReviewAction,
} from "@exam-system/contracts";

export interface DatabaseAdapter {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
}

export class QuestionNotFoundError extends Error {
  constructor(message = "Question not found or access denied") {
    super(message);
    this.name = "QuestionNotFoundError";
  }
}

export class UnauthorizedRoleError extends Error {
  constructor(message = "Actor does not have authority to review questions") {
    super(message);
    this.name = "UnauthorizedRoleError";
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(message = "Conflicting update detected. Please reload draft.") {
    super(message);
    this.name = "ConcurrencyConflictError";
  }
}

export class InvalidDraftStateError extends Error {
  constructor(message = "Question is not in a valid state for this review action") {
    super(message);
    this.name = "InvalidDraftStateError";
  }
}

/**
 * Lecturer Question Review Service
 * Enforces Human-in-the-Loop review gate, tenant isolation, optimistic concurrency,
 * and physical separation of confidential answer keys (AUDIT-04).
 */
export class QuestionReviewService {
  private readonly db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  private assertReviewAuthority(actor: TenantContext): void {
    if (actor.role !== "LECTURER" && actor.role !== "COE_ADMIN") {
      throw new UnauthorizedRoleError(
        `Role '${actor.role}' is not authorized to review questions. Mandatory LECTURER or COE_ADMIN authority required.`
      );
    }
  }

  /**
   * List draft questions for an offering.
   */
  async listDrafts(
    actor: TenantContext,
    params: {
      courseOfferingId: string;
      status?: "DRAFT" | "APPROVED_FOR_QUESTION_BANK" | "REJECTED" | "REVISION_REQUESTED";
      topicId?: string;
    }
  ): Promise<QuestionBankItem[]> {
    this.assertReviewAuthority(actor);

    let sql = `
      SELECT * FROM question_bank
      WHERE tenant_id = $1 AND course_offering_id = $2
    `;
    const queryParams: any[] = [actor.tenantId, params.courseOfferingId];

    if (params.status) {
      queryParams.push(params.status);
      sql += ` AND review_status = $${queryParams.length}`;
    }

    if (params.topicId) {
      queryParams.push(params.topicId);
      sql += ` AND topic_id = $${queryParams.length}`;
    }

    sql += ` ORDER BY created_at DESC`;

    const rows = await this.db.query<any>(sql, queryParams);
    return rows.map((r) => this.mapRowToQuestionBankItem(r));
  }

  /**
   * Approves a draft question into the canonical question bank.
   * Physically separates the confidential answer key into question_answer_keys table (AUDIT-04).
   */
  async approveDraft(
    actor: TenantContext,
    action: QuestionReviewAction
  ): Promise<{ question: QuestionBankItem; answerKeyStored: boolean }> {
    this.assertReviewAuthority(actor);

    // 1. Fetch current question draft
    const selectSql = `
      SELECT * FROM question_bank
      WHERE id = $1 AND tenant_id = $2
      FOR UPDATE
    `;
    const rows = await this.db.query<any>(selectSql, [action.questionId, actor.tenantId]);
    if (!rows || rows.length === 0) {
      throw new QuestionNotFoundError();
    }
    const current = this.mapRowToQuestionBankItem(rows[0]);

    // 2. Validate current state
    if (current.reviewStatus !== "DRAFT" && current.reviewStatus !== "REVISION_REQUESTED") {
      throw new InvalidDraftStateError(
        `Cannot approve question with review_status '${current.reviewStatus}'. Only DRAFT or REVISION_REQUESTED items can be approved.`
      );
    }

    // 3. Optimistic concurrency check
    if (action.expectedVersion !== undefined && current.version !== action.expectedVersion) {
      throw new ConcurrencyConflictError(
        `Version conflict: expected version ${action.expectedVersion}, but question is at version ${current.version}.`
      );
    }

    // 4. Resolve answer key: must have a confirmed or existing answer
    const answerToStore = action.confirmedAnswer || current.correctAnswer;
    if (!answerToStore || !answerToStore.trim()) {
      throw new InvalidDraftStateError(
        "Cannot approve question without an authorized correct answer."
      );
    }

    const confirmedBloom = action.confirmedBloomLevel || current.bloomLevel;
    const nowIso = new Date().toISOString();
    const nextVersion = current.version + 1;

    // 5. Store confidential answer key in question_answer_keys (AUDIT-04)
    const upsertAnswerKeySql = `
      INSERT INTO question_answer_keys (tenant_id, question_id, correct_answer, grading_rubric_json)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (question_id)
      DO UPDATE SET
        correct_answer = EXCLUDED.correct_answer,
        grading_rubric_json = EXCLUDED.grading_rubric_json
    `;
    await this.db.query(upsertAnswerKeySql, [
      actor.tenantId,
      action.questionId,
      answerToStore,
      action.gradingRubricJson || "{}",
    ]);

    // 6. Update question_bank: mark APPROVED_FOR_QUESTION_BANK, null out correctAnswer
    const updateQuestionSql = `
      UPDATE question_bank
      SET
        review_status = 'APPROVED_FOR_QUESTION_BANK',
        bloom_level = $1,
        bloom_verification_status = 'CONFIRMED_BY_LECTURER',
        question_text = COALESCE($2, question_text),
        correct_answer = NULL, -- Decoupled for security
        reviewed_by_user_id = $3,
        reviewed_at = $4,
        revision_notes = $5,
        version = $6,
        updated_at = $4
      WHERE id = $7 AND tenant_id = $8
      RETURNING *
    `;

    const updatedRows = await this.db.query<any>(updateQuestionSql, [
      confirmedBloom,
      action.modifiedText || null,
      actor.userId,
      nowIso,
      action.notes || null,
      nextVersion,
      action.questionId,
      actor.tenantId,
    ]);

    const updatedItem = this.mapRowToQuestionBankItem(updatedRows[0]);
    return {
      question: updatedItem,
      answerKeyStored: true,
    };
  }

  /**
   * Rejects a draft question with required reason.
   */
  async rejectDraft(
    actor: TenantContext,
    action: { questionId: string; reason: string; expectedVersion?: number }
  ): Promise<QuestionBankItem> {
    this.assertReviewAuthority(actor);

    if (!action.reason || !action.reason.trim()) {
      throw new Error("A valid rejection reason is required.");
    }

    const selectSql = `
      SELECT * FROM question_bank WHERE id = $1 AND tenant_id = $2
    `;
    const rows = await this.db.query<any>(selectSql, [action.questionId, actor.tenantId]);
    if (!rows || rows.length === 0) {
      throw new QuestionNotFoundError();
    }
    const current = this.mapRowToQuestionBankItem(rows[0]);

    if (action.expectedVersion !== undefined && current.version !== action.expectedVersion) {
      throw new ConcurrencyConflictError();
    }

    const nowIso = new Date().toISOString();
    const updateSql = `
      UPDATE question_bank
      SET
        review_status = 'REJECTED',
        rejection_reason = $1,
        reviewed_by_user_id = $2,
        reviewed_at = $3,
        version = version + 1,
        updated_at = $3
      WHERE id = $4 AND tenant_id = $5
      RETURNING *
    `;

    const updatedRows = await this.db.query<any>(updateSql, [
      action.reason,
      actor.userId,
      nowIso,
      action.questionId,
      actor.tenantId,
    ]);

    return this.mapRowToQuestionBankItem(updatedRows[0]);
  }

  /**
   * Requests revision from drafting faculty/assistant.
   */
  async requestRevision(
    actor: TenantContext,
    action: { questionId: string; revisionNotes: string; expectedVersion?: number }
  ): Promise<QuestionBankItem> {
    this.assertReviewAuthority(actor);

    if (!action.revisionNotes || !action.revisionNotes.trim()) {
      throw new Error("Revision notes are required.");
    }

    const selectSql = `
      SELECT * FROM question_bank WHERE id = $1 AND tenant_id = $2
    `;
    const rows = await this.db.query<any>(selectSql, [action.questionId, actor.tenantId]);
    if (!rows || rows.length === 0) {
      throw new QuestionNotFoundError();
    }
    const current = this.mapRowToQuestionBankItem(rows[0]);

    if (action.expectedVersion !== undefined && current.version !== action.expectedVersion) {
      throw new ConcurrencyConflictError();
    }

    const nowIso = new Date().toISOString();
    const updateSql = `
      UPDATE question_bank
      SET
        review_status = 'REVISION_REQUESTED',
        revision_notes = $1,
        reviewed_by_user_id = $2,
        reviewed_at = $3,
        version = version + 1,
        updated_at = $3
      WHERE id = $4 AND tenant_id = $5
      RETURNING *
    `;

    const updatedRows = await this.db.query<any>(updateSql, [
      action.revisionNotes,
      actor.userId,
      nowIso,
      action.questionId,
      actor.tenantId,
    ]);

    return this.mapRowToQuestionBankItem(updatedRows[0]);
  }

  /**
   * Returns a student-facing question item for an active exam.
   * Strips all answers, options correctness, and internal review metadata.
   * Fails closed if question is not in APPROVED_FOR_QUESTION_BANK status.
   */
  async getStudentFacingQuestion(
    actor: TenantContext,
    questionId: string
  ): Promise<StudentFacingQuestionItem> {
    // Only approved question bank items can be served to students
    const sql = `
      SELECT * FROM question_bank
      WHERE id = $1 AND tenant_id = $2 AND review_status = 'APPROVED_FOR_QUESTION_BANK'
    `;
    const rows = await this.db.query<any>(sql, [questionId, actor.tenantId]);
    if (!rows || rows.length === 0) {
      throw new QuestionNotFoundError("Question not found or not approved for examination");
    }

    const item = this.mapRowToQuestionBankItem(rows[0]);

    // Format options without any isCorrect attributes
    const studentOptions = (item.options || []).map((opt: any) => {
      if (typeof opt === "string") {
        return { key: opt.charAt(0), text: opt };
      }
      return {
        key: opt.key || "",
        text: opt.text || "",
      };
    });

    return {
      id: item.id,
      tenantId: item.tenantId,
      courseOfferingId: item.courseOfferingId,
      syllabusVersionId: item.syllabusVersionId,
      topicId: item.topicId,
      courseOutcomeId: item.courseOutcomeId,
      topicLearningOutcomeId: item.topicLearningOutcomeId,
      questionText: item.questionText,
      questionType: item.questionType,
      options: studentOptions,
      marks: item.marks,
      difficulty: item.difficulty,
      bloomLevel: item.bloomLevel,
      bloomVerificationStatus: item.bloomVerificationStatus,
      sourceLocator: item.sourceLocator,
      sourceExcerpt: item.sourceExcerpt,
      provenanceChunkId: item.provenanceChunkId,
      isSynthetic: item.isSynthetic,
      reviewStatus: item.reviewStatus,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapRowToQuestionBankItem(row: any): QuestionBankItem {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      courseOfferingId: row.course_offering_id,
      syllabusVersionId: row.syllabus_version_id,
      topicId: row.topic_id,
      courseOutcomeId: row.course_outcome_id || undefined,
      topicLearningOutcomeId: row.topic_learning_outcome_id || undefined,
      questionText: row.question_text,
      questionType: row.question_type,
      options: typeof row.options === "string" ? JSON.parse(row.options) : (row.options || []),
      correctAnswer: row.correct_answer || undefined,
      marks: Number(row.marks) || 1.0,
      difficulty: row.difficulty || "MEDIUM",
      bloomLevel: row.bloom_level || "UNDERSTAND",
      bloomVerificationStatus: row.bloom_verification_status || "UNVERIFIED",
      sourceLocator: row.source_locator || "unspecified",
      sourceExcerpt: row.source_excerpt || "",
      provenanceChunkId: row.provenance_chunk_id || undefined,
      isSynthetic: Boolean(row.is_synthetic),
      reviewStatus: row.review_status,
      reviewedByUserId: row.reviewed_by_user_id || undefined,
      reviewedAt: row.reviewed_at || undefined,
      rejectionReason: row.rejection_reason || undefined,
      revisionNotes: row.revision_notes || undefined,
      version: Number(row.version) || 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
    };
  }
}
