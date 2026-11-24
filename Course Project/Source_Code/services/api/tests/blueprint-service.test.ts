import test from "node:test";
import assert from "node:assert/strict";
import type { TenantContext, BlueprintSection } from "@exam-system/contracts";
import {
  BlueprintService,
  BlueprintValidationError,
  UnauthorizedBlueprintActionError,
  InvalidBlueprintStateError,
  BlueprintNotFoundError,
} from "../src/blueprint-service.ts";
import type { SyllabusUnitInfo } from "../src/blueprint-service.ts";
import type { DatabaseAdapter } from "../src/question-review-service.ts";

function createMockDb(): DatabaseAdapter & { store: Map<string, any> } {
  const store = new Map<string, any>();
  return {
    store,
    async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
      const normalizedSql = sql.replace(/\s+/g, " ").trim().toUpperCase();

      if (normalizedSql.startsWith("INSERT INTO EXAM_BLUEPRINTS")) {
        const [
          id,
          tenant_id,
          course_offering_id,
          syllabus_version_id,
          assessment_type,
          title,
          total_marks,
          duration_minutes,
          allowed_attempts,
          status,
          sections,
          target_topic_ids,
          target_course_outcome_ids,
          created_by,
          created_at,
          updated_at,
        ] = params!;

        const record = {
          id,
          tenant_id,
          course_offering_id,
          syllabus_version_id,
          assessment_type,
          title,
          total_marks,
          duration_minutes,
          allowed_attempts,
          status,
          sections,
          target_topic_ids,
          target_course_outcome_ids,
          created_by,
          created_at,
          updated_at,
        };
        store.set(id, record);
        return [record as unknown as T];
      }

      if (normalizedSql.startsWith("SELECT * FROM EXAM_BLUEPRINTS WHERE ID = $1 AND TENANT_ID = $2")) {
        const [id, tenant_id] = params!;
        const rec = store.get(id);
        if (rec && rec.tenant_id === tenant_id) {
          return [rec as unknown as T];
        }
        return [];
      }

      if (normalizedSql.startsWith("UPDATE EXAM_BLUEPRINTS") && sql.includes("SET status = 'PENDING_COE_APPROVAL'")) {
        const [updated_at, id, tenant_id] = params!;
        const rec = store.get(id);
        if (rec && rec.tenant_id === tenant_id) {
          rec.status = "PENDING_COE_APPROVAL";
          rec.updated_at = updated_at;
          return [rec as unknown as T];
        }
        return [];
      }

      if (normalizedSql.startsWith("UPDATE EXAM_BLUEPRINTS") && sql.includes("SET status = 'APPROVED'")) {
        const [approved_by, approved_at, id, tenant_id] = params!;
        const rec = store.get(id);
        if (rec && rec.tenant_id === tenant_id) {
          rec.status = "APPROVED";
          rec.approved_by = approved_by;
          rec.approved_at = approved_at;
          rec.updated_at = approved_at;
          return [rec as unknown as T];
        }
        return [];
      }

      if (normalizedSql.startsWith("UPDATE EXAM_BLUEPRINTS") && sql.includes("SET status = 'REJECTED'")) {
        const [rejection_reason, updated_at, id, tenant_id] = params!;
        const rec = store.get(id);
        if (rec && rec.tenant_id === tenant_id) {
          rec.status = "REJECTED";
          rec.rejection_reason = rejection_reason;
          rec.updated_at = updated_at;
          return [rec as unknown as T];
        }
        return [];
      }

      if (normalizedSql.startsWith("SELECT * FROM EXAM_BLUEPRINTS WHERE COURSE_OFFERING_ID = $1 AND TENANT_ID = $2")) {
        const [offering_id, tenant_id] = params!;
        const list = Array.from(store.values()).filter(
          (r) => r.course_offering_id === offering_id && r.tenant_id === tenant_id
        );
        return list as unknown as T[];
      }

      return [];
    },
  };
}

const lecturerCtx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  role: "LECTURER",
  membershipId: "00000000-0000-0000-0000-000000000003",
};

const coeAdminCtx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000004",
  role: "COE_ADMIN",
  membershipId: "00000000-0000-0000-0000-000000000005",
};

const studentCtx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000006",
  role: "STUDENT",
  membershipId: "00000000-0000-0000-0000-000000000007",
};

const defaultSections: BlueprintSection[] = [
  {
    sectionKey: "PART_A",
    sectionTitle: "Objective Questions",
    maxMarks: 20,
    questionCount: 10,
    questionTypes: ["MCQ_SINGLE"],
    targetTopicIds: ["11111111-1111-1111-1111-111111111111"],
    compulsory: true,
  },
  {
    sectionKey: "PART_B",
    sectionTitle: "Analytical & Design Problems",
    maxMarks: 30,
    questionCount: 3,
    questionTypes: ["SHORT_ANSWER", "SQL_DESIGN"],
    targetTopicIds: ["22222222-2222-2222-2222-222222222222"],
    compulsory: true,
  },
];

test("Blueprint: Lecturer creates valid draft blueprint", async () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  const bp = await service.createBlueprint(lecturerCtx, {
    courseOfferingId: "00000000-0000-0000-0000-000000000010",
    syllabusVersionId: "00000000-0000-0000-0000-000000000020",
    assessmentType: "INTERNAL_ASSESSMENT",
    title: "ISA 1 - Database Systems",
    totalMarks: 50,
    durationMinutes: 90,
    sections: defaultSections,
    targetTopicIds: [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ],
  });

  assert.equal(bp.status, "DRAFT");
  assert.equal(bp.totalMarks, 50);
  assert.equal(bp.durationMinutes, 90);
  assert.equal(bp.sections.length, 2);
  assert.equal(bp.syllabusVersionId, "00000000-0000-0000-0000-000000000020");
});

test("Blueprint Validation: Rejects when sum of section marks != totalMarks", async () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  await assert.rejects(
    () =>
      service.createBlueprint(lecturerCtx, {
        courseOfferingId: "00000000-0000-0000-0000-000000000010",
        syllabusVersionId: "00000000-0000-0000-0000-000000000020",
        assessmentType: "INTERNAL_ASSESSMENT",
        title: "ISA 1 - Database Systems",
        totalMarks: 100, // Declares 100, but sections sum to 50!
        durationMinutes: 90,
        sections: defaultSections,
        targetTopicIds: ["11111111-1111-1111-1111-111111111111"],
      }),
    (err: any) => {
      assert.ok(err instanceof BlueprintValidationError);
      assert.ok(err.validationErrors.some((e: string) => e.includes("SECTION_MARKS_MISMATCH")));
      return true;
    }
  );
});

test("Blueprint Validation: Rejects invalid duration", async () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  await assert.rejects(
    () =>
      service.createBlueprint(lecturerCtx, {
        courseOfferingId: "00000000-0000-0000-0000-000000000010",
        syllabusVersionId: "00000000-0000-0000-0000-000000000020",
        assessmentType: "FORMATIVE_QUIZ",
        title: "Quick Quiz",
        totalMarks: 50,
        durationMinutes: 2, // Less than minimum 5 mins!
        sections: defaultSections,
        targetTopicIds: ["11111111-1111-1111-1111-111111111111"],
      }),
    (err: any) => {
      assert.ok(err instanceof BlueprintValidationError);
      assert.ok(err.validationErrors.some((e: string) => e.includes("INVALID_DURATION")));
      return true;
    }
  );
});

test("Blueprint Security: Student cannot create blueprint", async () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  await assert.rejects(
    () =>
      service.createBlueprint(studentCtx, {
        courseOfferingId: "00000000-0000-0000-0000-000000000010",
        syllabusVersionId: "00000000-0000-0000-0000-000000000020",
        assessmentType: "INTERNAL_ASSESSMENT",
        title: "Student Blueprint",
        totalMarks: 50,
        durationMinutes: 60,
        sections: defaultSections,
        targetTopicIds: ["11111111-1111-1111-1111-111111111111"],
      }),
    UnauthorizedBlueprintActionError
  );
});

test("Blueprint Workflow: Full lifecycle from Draft to COE Approval", async () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  // 1. Lecturer creates draft
  const draft = await service.createBlueprint(lecturerCtx, {
    courseOfferingId: "00000000-0000-0000-0000-000000000010",
    syllabusVersionId: "00000000-0000-0000-0000-000000000020",
    assessmentType: "FORMAL_SEMESTER_EXAM",
    title: "End Semester Exam - DBMS",
    totalMarks: 50,
    durationMinutes: 180,
    sections: defaultSections,
    targetTopicIds: ["11111111-1111-1111-1111-111111111111"],
  });
  assert.equal(draft.status, "DRAFT");

  // 2. Lecturer submits for approval
  const submitted = await service.submitForApproval(lecturerCtx, draft.id);
  assert.equal(submitted.status, "PENDING_COE_APPROVAL");

  // 3. Lecturer attempts to approve -> REJECTED (Only COE_ADMIN has authority)
  await assert.rejects(
    () => service.approveBlueprint(lecturerCtx, draft.id),
    UnauthorizedBlueprintActionError
  );

  // 4. COE Administrator approves
  const approved = await service.approveBlueprint(coeAdminCtx, draft.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedBy, coeAdminCtx.userId);
  assert.ok(approved.approvedAt);
});

test("Blueprint Workflow: COE Admin rejects blueprint with reason", async () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  const draft = await service.createBlueprint(lecturerCtx, {
    courseOfferingId: "00000000-0000-0000-0000-000000000010",
    syllabusVersionId: "00000000-0000-0000-0000-000000000020",
    assessmentType: "INTERNAL_ASSESSMENT",
    title: "ISA 2",
    totalMarks: 50,
    durationMinutes: 60,
    sections: defaultSections,
    targetTopicIds: ["11111111-1111-1111-1111-111111111111"],
  });

  await service.submitForApproval(lecturerCtx, draft.id);

  const rejected = await service.rejectBlueprint(
    coeAdminCtx,
    draft.id,
    "Unit 3 is missing and higher-order Bloom levels are absent."
  );

  assert.equal(rejected.status, "REJECTED");
});

test("Blueprint Security: Cross-tenant access denied", async () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  const draft = await service.createBlueprint(lecturerCtx, {
    courseOfferingId: "00000000-0000-0000-0000-000000000010",
    syllabusVersionId: "00000000-0000-0000-0000-000000000020",
    assessmentType: "INTERNAL_ASSESSMENT",
    title: "Tenant 1 Blueprint",
    totalMarks: 50,
    durationMinutes: 60,
    sections: defaultSections,
    targetTopicIds: ["11111111-1111-1111-1111-111111111111"],
  });

  const foreignCoeAdmin: TenantContext = {
    tenantId: "99999999-9999-9999-9999-999999999999", // Different tenant!
    userId: "00000000-0000-0000-0000-000000000099",
    role: "COE_ADMIN",
    membershipId: "00000000-0000-0000-0000-000000000098",
  };

  await assert.rejects(
    () => service.getBlueprint(foreignCoeAdmin, draft.id),
    BlueprintNotFoundError
  );
});

test("Blueprint Advisory: Evaluates syllabus coverage and flags zero-coverage unit", () => {
  const db = createMockDb();
  const service = new BlueprintService(db);

  const syllabusUnits: SyllabusUnitInfo[] = [
    {
      unitNumber: 1,
      unitTitle: "Relational Algebra",
      topics: [
        { id: "topic-1", topicCode: "T1.1", topicTitle: "Select & Project", unitNumber: 1, bloomLevel: "UNDERSTAND" },
        { id: "topic-2", topicCode: "T1.2", topicTitle: "Join & Division", unitNumber: 1, bloomLevel: "APPLY" },
      ],
    },
    {
      unitNumber: 2,
      unitTitle: "SQL & Query Optimization",
      topics: [
        { id: "topic-3", topicCode: "T2.1", topicTitle: "Aggregations", unitNumber: 2, bloomLevel: "APPLY" },
        { id: "topic-4", topicCode: "T2.2", topicTitle: "Query Plans", unitNumber: 2, bloomLevel: "ANALYZE" },
      ],
    },
    {
      unitNumber: 3,
      unitTitle: "Transaction Management & ACID",
      topics: [
        { id: "topic-5", topicCode: "T3.1", topicTitle: "Schedules & Serializability", unitNumber: 3, bloomLevel: "ANALYZE" },
      ],
    },
  ];

  // Blueprint covers Unit 1 & Unit 2, but leaves Unit 3 untouched
  const report = service.evaluateCoverage(
    "bp-001",
    "syl-001",
    ["topic-1", "topic-2", "topic-3"],
    syllabusUnits
  );

  assert.equal(report.isBalanced, false);
  assert.equal(report.unitCoverage[0].coveragePercentage, 100);
  assert.equal(report.unitCoverage[1].coveragePercentage, 50);
  assert.equal(report.unitCoverage[2].coveragePercentage, 0); // Unit 3 has 0%
  assert.ok(report.warnings.some((w) => w.includes("ZERO_COVERAGE: Unit 3")));
  assert.equal(report.bloomDistribution.UNDERSTAND, 1);
  assert.equal(report.bloomDistribution.APPLY, 2);
});
