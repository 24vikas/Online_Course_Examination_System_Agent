import test from "node:test";
import assert from "node:assert/strict";
import {
  QuestionReviewService,
  UnauthorizedRoleError,
  ConcurrencyConflictError,
  QuestionNotFoundError,
  InvalidDraftStateError,
  type DatabaseAdapter,
} from "../src/question-review-service.ts";
import type { TenantContext } from "@exam-system/contracts";

// In-Memory Database Adapter for Review Service Testing
class MockDatabase implements DatabaseAdapter {
  public questions: Map<string, any> = new Map();
  public answerKeys: Map<string, any> = new Map();

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const trimmed = sql.trim();

    // SELECT for question by id and tenant
    if (trimmed.includes("SELECT * FROM question_bank") && trimmed.includes("WHERE id = $1 AND tenant_id = $2")) {
      const id = params[0];
      const tenantId = params[1];
      const q = this.questions.get(id);
      if (q && q.tenant_id === tenantId) {
        if (trimmed.includes("review_status = 'APPROVED_FOR_QUESTION_BANK'")) {
          if (q.review_status !== "APPROVED_FOR_QUESTION_BANK") return [];
        }
        return [q as T];
      }
      return [];
    }

    // SELECT for drafts by tenant and offering
    if (trimmed.includes("SELECT * FROM question_bank") && trimmed.includes("WHERE tenant_id = $1 AND course_offering_id = $2")) {
      const tenantId = params[0];
      const offeringId = params[1];
      const list = Array.from(this.questions.values()).filter(
        (q) => q.tenant_id === tenantId && q.course_offering_id === offeringId
      );
      return list as T[];
    }

    // UPSERT into question_answer_keys
    if (trimmed.includes("INSERT INTO question_answer_keys")) {
      const [tenantId, questionId, correctAnswer, rubric] = params;
      this.answerKeys.set(questionId, {
        tenant_id: tenantId,
        question_id: questionId,
        correct_answer: correctAnswer,
        grading_rubric_json: rubric,
      });
      return [] as T[];
    }

    // UPDATE question_bank (approve)
    if (trimmed.includes("UPDATE question_bank") && trimmed.includes("review_status = 'APPROVED_FOR_QUESTION_BANK'")) {
      const [bloom, text, userId, nowIso, notes, version, id, tenantId] = params;
      const q = this.questions.get(id);
      if (q && q.tenant_id === tenantId) {
        q.review_status = "APPROVED_FOR_QUESTION_BANK";
        q.bloom_level = bloom;
        q.bloom_verification_status = "CONFIRMED_BY_LECTURER";
        if (text) q.question_text = text;
        q.correct_answer = null; // AUDIT-04
        q.reviewed_by_user_id = userId;
        q.reviewed_at = nowIso;
        q.revision_notes = notes;
        q.version = version;
        q.updated_at = nowIso;
        return [q as T];
      }
      return [];
    }

    // UPDATE question_bank (reject)
    if (trimmed.includes("UPDATE question_bank") && trimmed.includes("review_status = 'REJECTED'")) {
      const [reason, userId, nowIso, id, tenantId] = params;
      const q = this.questions.get(id);
      if (q && q.tenant_id === tenantId) {
        q.review_status = "REJECTED";
        q.rejection_reason = reason;
        q.reviewed_by_user_id = userId;
        q.reviewed_at = nowIso;
        q.version = (q.version || 1) + 1;
        q.updated_at = nowIso;
        return [q as T];
      }
      return [];
    }

    // UPDATE question_bank (revision requested)
    if (trimmed.includes("UPDATE question_bank") && trimmed.includes("review_status = 'REVISION_REQUESTED'")) {
      const [notes, userId, nowIso, id, tenantId] = params;
      const q = this.questions.get(id);
      if (q && q.tenant_id === tenantId) {
        q.review_status = "REVISION_REQUESTED";
        q.revision_notes = notes;
        q.reviewed_by_user_id = userId;
        q.reviewed_at = nowIso;
        q.version = (q.version || 1) + 1;
        q.updated_at = nowIso;
        return [q as T];
      }
      return [];
    }

    return [];
  }
}

const lecturerContext: TenantContext = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  role: "LECTURER",
  membershipId: "33333333-3333-4333-8333-333333333333",
};

const studentContext: TenantContext = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "44444444-4444-4444-8444-444444444444",
  role: "STUDENT",
  membershipId: "55555555-5555-4555-8555-555555555555",
};

test("approveDraft moves draft to approved and physically decouples answer key (AUDIT-04)", async () => {
  const db = new MockDatabase();
  const service = new QuestionReviewService(db);

  const questionId = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  db.questions.set(questionId, {
    id: questionId,
    tenant_id: lecturerContext.tenantId,
    course_offering_id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    syllabus_version_id: "ccccccc1-cccc-4ccc-8ccc-cccccccccccc",
    topic_id: "ddddddd1-dddd-4ddd-8ddd-dddddddddddd",
    question_text: "What is the worst-case time complexity of MergeSort?",
    question_type: "MCQ",
    options: [
      { key: "A", text: "O(n log n)", is_correct: true },
      { key: "B", text: "O(n^2)", is_correct: false },
    ],
    correct_answer: "O(n log n)",
    marks: 2.0,
    difficulty: "EASY",
    bloom_level: "REMEMBER",
    bloom_verification_status: "UNVERIFIED",
    source_locator: "chk_001_p12",
    source_excerpt: "MergeSort runs in O(n log n) worst-case time.",
    review_status: "DRAFT",
    version: 1,
    created_at: new Date().toISOString(),
  });

  const result = await service.approveDraft(lecturerContext, {
    questionId,
    action: "APPROVE",
    confirmedBloomLevel: "UNDERSTAND",
    confirmedAnswer: "O(n log n)",
    notes: "Verified against textbook chapter 2.",
    expectedVersion: 1,
  });

  assert.equal(result.question.reviewStatus, "APPROVED_FOR_QUESTION_BANK");
  assert.equal(result.question.bloomVerificationStatus, "CONFIRMED_BY_LECTURER");
  assert.equal(result.question.bloomLevel, "UNDERSTAND");
  assert.equal(result.question.version, 2);
  assert.equal(result.question.correctAnswer, undefined); // Stripped from question_bank

  // Verify answer key stored in separate table
  assert.equal(result.answerKeyStored, true);
  const storedKey = db.answerKeys.get(questionId);
  assert.ok(storedKey);
  assert.equal(storedKey.correct_answer, "O(n log n)");
});

test("student role is rejected when attempting to review or approve questions", async () => {
  const db = new MockDatabase();
  const service = new QuestionReviewService(db);

  await assert.rejects(
    async () => {
      await service.approveDraft(studentContext, {
        questionId: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        action: "APPROVE",
      });
    },
    (err: any) => err instanceof UnauthorizedRoleError
  );
});

test("optimistic locking detects concurrency conflict", async () => {
  const db = new MockDatabase();
  const service = new QuestionReviewService(db);

  const questionId = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  db.questions.set(questionId, {
    id: questionId,
    tenant_id: lecturerContext.tenantId,
    course_offering_id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    syllabus_version_id: "ccccccc1-cccc-4ccc-8ccc-cccccccccccc",
    topic_id: "ddddddd1-dddd-4ddd-8ddd-dddddddddddd",
    question_text: "What is quicksort average case?",
    question_type: "MCQ",
    correct_answer: "O(n log n)",
    review_status: "DRAFT",
    version: 2, // Current version is 2
    created_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => {
      await service.approveDraft(lecturerContext, {
        questionId,
        action: "APPROVE",
        expectedVersion: 1, // Stale version!
      });
    },
    (err: any) => err instanceof ConcurrencyConflictError
  );
});

test("rejectDraft records rejection reason and updates status", async () => {
  const db = new MockDatabase();
  const service = new QuestionReviewService(db);

  const questionId = "aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  db.questions.set(questionId, {
    id: questionId,
    tenant_id: lecturerContext.tenantId,
    course_offering_id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    syllabus_version_id: "ccccccc1-cccc-4ccc-8ccc-cccccccccccc",
    topic_id: "ddddddd1-dddd-4ddd-8ddd-dddddddddddd",
    question_text: "Ambiguous question text?",
    question_type: "MCQ",
    review_status: "DRAFT",
    version: 1,
    created_at: new Date().toISOString(),
  });

  const rejected = await service.rejectDraft(lecturerContext, {
    questionId,
    reason: "Distractors are non-viable and stem is ambiguous.",
  });

  assert.equal(rejected.reviewStatus, "REJECTED");
  assert.equal(rejected.rejectionReason, "Distractors are non-viable and stem is ambiguous.");
  assert.equal(rejected.version, 2);
});

test("requestRevision updates status to REVISION_REQUESTED with notes", async () => {
  const db = new MockDatabase();
  const service = new QuestionReviewService(db);

  const questionId = "aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  db.questions.set(questionId, {
    id: questionId,
    tenant_id: lecturerContext.tenantId,
    course_offering_id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    syllabus_version_id: "ccccccc1-cccc-4ccc-8ccc-cccccccccccc",
    topic_id: "ddddddd1-dddd-4ddd-8ddd-dddddddddddd",
    question_text: "Initial draft question?",
    question_type: "MCQ",
    review_status: "DRAFT",
    version: 1,
    created_at: new Date().toISOString(),
  });

  const revised = await service.requestRevision(lecturerContext, {
    questionId,
    revisionNotes: "Please align question with Bloom level APPLY instead of REMEMBER.",
  });

  assert.equal(revised.reviewStatus, "REVISION_REQUESTED");
  assert.equal(revised.revisionNotes, "Please align question with Bloom level APPLY instead of REMEMBER.");
  assert.equal(revised.version, 2);
});

test("student-facing question view strictly strips answer keys and correctness flags", async () => {
  const db = new MockDatabase();
  const service = new QuestionReviewService(db);

  const questionId = "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  db.questions.set(questionId, {
    id: questionId,
    tenant_id: studentContext.tenantId,
    course_offering_id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    syllabus_version_id: "ccccccc1-cccc-4ccc-8ccc-cccccccccccc",
    topic_id: "ddddddd1-dddd-4ddd-8ddd-dddddddddddd",
    question_text: "What is Dijkstra algorithm used for?",
    question_type: "MCQ",
    options: [
      { key: "A", text: "Shortest path in weighted graph", is_correct: true },
      { key: "B", text: "Minimum spanning tree", is_correct: false },
    ],
    correct_answer: "Shortest path in weighted graph",
    review_status: "APPROVED_FOR_QUESTION_BANK",
    version: 2,
    created_at: new Date().toISOString(),
  });

  const studentView = await service.getStudentFacingQuestion(studentContext, questionId);

  assert.equal(studentView.id, questionId);
  // @ts-expect-error - correctAnswer should not exist on StudentFacingQuestionItem
  assert.equal(studentView.correctAnswer, undefined);

  // Verify options do not expose isCorrect
  assert.equal(studentView.options.length, 2);
  assert.deepEqual(studentView.options[0], {
    key: "A",
    text: "Shortest path in weighted graph",
  });
  // @ts-expect-error - isCorrect should not exist on student options
  assert.equal(studentView.options[0].isCorrect, undefined);
});

test("student cannot access draft or unapproved questions", async () => {
  const db = new MockDatabase();
  const service = new QuestionReviewService(db);

  const draftId = "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  db.questions.set(draftId, {
    id: draftId,
    tenant_id: studentContext.tenantId,
    review_status: "DRAFT",
  });

  await assert.rejects(
    async () => {
      await service.getStudentFacingQuestion(studentContext, draftId);
    },
    (err: any) => err instanceof QuestionNotFoundError
  );
});
