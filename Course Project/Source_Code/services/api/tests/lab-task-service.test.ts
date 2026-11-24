import test from "node:test";
import assert from "node:assert/strict";
import type { TenantContext, RubricCriterion } from "@exam-system/contracts";
import type { DatabaseAdapter } from "../src/question-review-service.ts";
import {
  LabTaskService,
  LabSubmissionValidationError,
  UnauthorizedLabActionError,
  LabTaskNotFoundError,
} from "../src/lab-task-service.ts";

function createMockLabDb(): DatabaseAdapter & { store: Map<string, any> } {
  const store = new Map<string, any>();
  return {
    store,
    async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
      const normalizedSql = sql.replace(/\s+/g, " ").trim().toUpperCase();

      if (normalizedSql.startsWith("INSERT INTO LAB_PRACTICAL_TASKS")) {
        const [
          id,
          tenant_id,
          syllabus_version_id,
          task_code,
          title,
          problem_statement,
          submission_type,
          max_marks,
          human_review_required,
          rubric_json,
          created_at,
        ] = params!;

        const record = {
          id,
          tenant_id,
          syllabus_version_id,
          task_code,
          title,
          problem_statement,
          submission_type,
          max_marks,
          human_review_required,
          rubric_json,
          created_at,
        };
        store.set(id, record);
        return [record as unknown as T];
      }

      if (normalizedSql.startsWith("INSERT INTO LAB_SUBMISSIONS")) {
        const [
          id,
          tenant_id,
          task_id,
          course_offering_id,
          student_id,
          submission_type,
          storage_path,
          submitted_content,
          status,
          max_marks,
          submitted_at,
        ] = params!;

        const record = {
          id,
          tenant_id,
          task_id,
          course_offering_id,
          student_id,
          submission_type,
          storage_path,
          submitted_content,
          status,
          max_marks,
          submitted_at,
        };
        store.set(id, record);
        return [record as unknown as T];
      }

      if (normalizedSql.startsWith("UPDATE LAB_SUBMISSIONS")) {
        const [awarded_marks, evaluator_feedback, evaluated_by, evaluated_at, id, tenant_id] = params!;
        const rec = store.get(id);
        if (rec && rec.tenant_id === tenant_id) {
          rec.awarded_marks = awarded_marks;
          rec.evaluator_feedback = evaluator_feedback;
          rec.evaluated_by = evaluated_by;
          rec.evaluated_at = evaluated_at;
          rec.status = "EVALUATED";
          return [rec as unknown as T];
        }
        return [];
      }

      return [];
    },
  };
}

const lecturerCtx: TenantContext = {
  tenantId: "tenant-001",
  userId: "faculty-200",
  role: "LECTURER",
  membershipId: "mem-200",
};

const studentCtx: TenantContext = {
  tenantId: "tenant-001",
  userId: "student-100",
  role: "STUDENT",
  membershipId: "mem-100",
};

const sampleRubric: RubricCriterion[] = [
  {
    criterionId: "SCHEMA_DESIGN",
    title: "Table Design & Constraints",
    description: "Evaluates correct primary and foreign key constraints",
    maxMarks: 15,
    weightPercentage: 50,
  },
  {
    criterionId: "QUERY_CORRECTNESS",
    title: "SQL Query Correctness",
    description: "Evaluates correct query execution and output schema",
    maxMarks: 15,
    weightPercentage: 50,
  },
];

test("Lab Task: Faculty creates valid lab practical task with rubrics", async () => {
  const db = createMockLabDb();
  const service = new LabTaskService(db);

  const task = await service.createTask(lecturerCtx, {
    syllabusVersionId: "syl-001",
    taskCode: "LAB-DBMS-01",
    title: "DDL & DML Implementation",
    problemStatement: "Implement student course registration schema with referential integrity.",
    submissionType: "SQL_SCRIPT",
    maxMarks: 30,
    targetTopicIds: ["topic-1", "topic-2"],
    rubric: sampleRubric,
  });

  assert.equal(task.taskCode, "LAB-DBMS-01");
  assert.equal(task.maxMarks, 30);
  assert.equal(task.humanReviewRequired, true);
  assert.equal(task.rubric.length, 2);
});

test("Lab Task Validation: Rejects task when rubric marks sum != maxMarks", async () => {
  const db = createMockLabDb();
  const service = new LabTaskService(db);

  await assert.rejects(
    () =>
      service.createTask(lecturerCtx, {
        syllabusVersionId: "syl-001",
        taskCode: "LAB-DBMS-02",
        title: "Query Optimization",
        problemStatement: "Tune relational indexes for aggregation performance.",
        submissionType: "SQL_SCRIPT",
        maxMarks: 50, // Rubric sum is 30!
        targetTopicIds: ["topic-1"],
        rubric: sampleRubric,
      }),
    LabSubmissionValidationError
  );
});

test("Lab Task Security: Student cannot create lab tasks", async () => {
  const db = createMockLabDb();
  const service = new LabTaskService(db);

  await assert.rejects(
    () =>
      service.createTask(studentCtx, {
        syllabusVersionId: "syl-001",
        taskCode: "LAB-ROGUE",
        title: "Rogue Task",
        problemStatement: "Unauthorized task statement.",
        submissionType: "SQL_SCRIPT",
        maxMarks: 30,
        targetTopicIds: ["topic-1"],
        rubric: sampleRubric,
      }),
    UnauthorizedLabActionError
  );
});

test("Lab Task: Student submits valid SQL script solution with tenant-isolated storage path", async () => {
  const db = createMockLabDb();
  const service = new LabTaskService(db);

  const submission = await service.submitSolution(studentCtx, {
    taskId: "task-001",
    courseOfferingId: "offering-001",
    submissionType: "SQL_SCRIPT",
    content: "CREATE TABLE enrolled (student_id INT, course_id INT, PRIMARY KEY(student_id, course_id));",
    fileName: "solution.sql",
  });

  assert.equal(submission.status, "SUBMITTED");
  assert.equal(submission.studentId, studentCtx.userId);
  assert.ok(submission.storagePath?.startsWith("tenants/tenant-001/courses/offering-001/tasks/task-001/"));
});

test("Lab Task Security: Rejects prohibited dangerous system commands in SQL submission", async () => {
  const db = createMockLabDb();
  const service = new LabTaskService(db);

  await assert.rejects(
    () =>
      service.submitSolution(studentCtx, {
        taskId: "task-001",
        courseOfferingId: "offering-001",
        submissionType: "SQL_SCRIPT",
        content: "EXEC xp_cmdshell('cat /etc/passwd');",
        fileName: "hack.sql",
      }),
    (err: any) => {
      assert.ok(err instanceof LabSubmissionValidationError);
      assert.ok(err.message.includes("Prohibited database commands detected"));
      return true;
    }
  );
});

test("Lab Task: Faculty evaluates submission against rubrics", async () => {
  const db = createMockLabDb();
  const service = new LabTaskService(db);

  const submission = await service.submitSolution(studentCtx, {
    taskId: "task-001",
    courseOfferingId: "offering-001",
    submissionType: "SQL_SCRIPT",
    content: "CREATE TABLE test (id INT PRIMARY KEY);",
  });

  const evaluated = await service.evaluateSubmission(
    lecturerCtx,
    {
      submissionId: submission.id,
      criterionScores: {
        SCHEMA_DESIGN: 14,
        QUERY_CORRECTNESS: 13,
      },
      feedback: "Clean schema and correct primary key constraints.",
    },
    sampleRubric
  );

  assert.equal(evaluated.status, "EVALUATED");
  assert.equal(evaluated.awardedMarks, 27); // 14 + 13
  assert.equal(evaluated.evaluatedBy, lecturerCtx.userId);
  assert.equal(evaluated.evaluatorFeedback, "Clean schema and correct primary key constraints.");
});

test("Lab Task: Rejects criterion score exceeding rubric maximum", async () => {
  const db = createMockLabDb();
  const service = new LabTaskService(db);

  const submission = await service.submitSolution(studentCtx, {
    taskId: "task-001",
    courseOfferingId: "offering-001",
    submissionType: "SQL_SCRIPT",
    content: "SELECT 1;",
  });

  await assert.rejects(
    () =>
      service.evaluateSubmission(
        lecturerCtx,
        {
          submissionId: submission.id,
          criterionScores: {
            SCHEMA_DESIGN: 20, // Max is 15!
            QUERY_CORRECTNESS: 10,
          },
          feedback: "Score overflow",
        },
        sampleRubric
      ),
    LabSubmissionValidationError
  );
});
