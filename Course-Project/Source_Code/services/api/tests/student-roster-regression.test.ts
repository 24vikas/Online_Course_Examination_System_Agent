import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { StudentImportService } from "../src/student-import-service.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REGISTERED_DIR = path.resolve(REPO_ROOT, "Registered");

const DB_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:54322/postgres";
const DEMO_TENANT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const MAIN_TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const mockDb = { query: async () => ({ rows: [] }) };

test("Roster Regression 1: scanRegisteredDirectory finds all three real semester CSV files", () => {
  assert.ok(fs.existsSync(REGISTERED_DIR), `Registered directory should exist at ${REGISTERED_DIR}`);

  const service = new StudentImportService(mockDb);
  const files = service.scanRegisteredDirectory(REPO_ROOT, "Registered");
  assert.equal(files.length, 3, "Expected exactly 3 semester CSV files in Registered/");

  const semesters = files.map((f) => f.inferredSemester).sort();
  assert.deepEqual(semesters, [3, 5, 7], "Expected CSV rosters for Semesters 3, 5, and 7");
});

test("Roster Regression 2: validateCsvContent extracts authentic students and courses per semester without fabrication", () => {
  const service = new StudentImportService(mockDb);
  const files = service.scanRegisteredDirectory(REPO_ROOT, "Registered");
  const countsBySem: Record<number, number> = {};
  let totalExtracted = 0;

  for (const file of files) {
    const fullPath = path.resolve(REPO_ROOT, file.relativePath);
    const content = fs.readFileSync(fullPath, "utf-8");
    const semester = file.inferredSemester || 7;

    const preview = service.validateCsvContent(
      content,
      file.filename,
      file.suggestedMapping,
      semester,
      file.detectedDelimiter
    );

    assert.ok(preview.validRowsCount > 0, `Semester ${semester} should have valid rows`);
    assert.equal(preview.errors.length, 0, `Semester ${semester} should have 0 validation errors`);

    countsBySem[semester] = preview.validRowsCount;
    totalExtracted += preview.validRowsCount;

    // Check students have authentic USN format (01FE...BCI...) and legitimate names
    for (const row of preview.validRows) {
      assert.match(
        row.usn,
        /^01FE\d{2}B[A-Z]{2,3}\d{3}$/,
        `USN ${row.usn} must follow authentic KLE Tech format`
      );
      assert.ok(row.name.trim().length > 0, "Student must have a non-empty name");
      assert.ok(row.email.includes("@kletech.ac.in"), "Email must be institutional KLE Tech email");
      assert.ok(Array.isArray(row.enrolledCourses), "Student enrolledCourses must be an array");
    }

    // Vast majority of students have active courses (e.g. 129/130 in Sem 3, 131/131 in Sem 5, 119/119 in Sem 7)
    const withCourses = preview.validRows.filter((r) => r.enrolledCourses && r.enrolledCourses.length > 0);
    assert.ok(
      withCourses.length >= preview.validRowsCount - 1,
      `At least ${preview.validRowsCount - 1} students in Sem ${semester} must have enrolled courses`
    );
  }

  assert.equal(countsBySem[3], 130, "Semester 3 CSV must contain exactly 130 authentic students");
  assert.equal(countsBySem[5], 131, "Semester 5 CSV must contain exactly 131 authentic students");
  assert.equal(countsBySem[7], 119, "Semester 7 CSV must contain exactly 119 authentic students");
  assert.equal(totalExtracted, 380, "Total authentic students across all 3 CSVs must equal exactly 380");
});

test("Roster Regression 3: Semester 7 students are authentically mapped to 26ECAC401 Agentic AI", () => {
  const service = new StudentImportService(mockDb);
  const sem7Path = path.join(
    REGISTERED_DIR,
    "RegistrationList-OddTerm2026-BachelorofEngineering-CS(ArtificialIntelligence)-Semester7.csv"
  );
  assert.ok(fs.existsSync(sem7Path), "Semester 7 CSV must exist");

  const content = fs.readFileSync(sem7Path, "utf-8");
  const mapping = service.inferColumnMapping(["USN", "Name", "RollNo", "Branch", "Courses"]);
  mapping.usn = "SRN";
  mapping.name = "Name";

  const preview = service.validateCsvContent(content, "Semester7.csv", mapping, 7, ",");

  const studentsWithAI = preview.validRows.filter((r) =>
    r.enrolledCourses?.includes("26ECAC401")
  );

  assert.equal(
    studentsWithAI.length,
    119,
    "All 119 Semester 7 students must have authentic registration in 26ECAC401 (Agentic AI)"
  );
});

test("Roster Regression 4: Authoritative database contains real students, course offerings, and enrollments", async () => {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // 1. Verify students count in Demo Tenant
    const studRes = await client.query(
      `SELECT COUNT(*) as count FROM students WHERE tenant_id = $1`,
      [DEMO_TENANT_ID]
    );
    const totalStudents = Number(studRes.rows[0]?.count || 0);
    assert.ok(totalStudents >= 380, `Demo tenant must have >= 380 students (found ${totalStudents})`);

    // 2. Verify semester breakdown
    const semRes = await client.query(
      `
      SELECT COALESCE(semester, current_semester, 7) as sem, COUNT(*) as count
      FROM students
      WHERE tenant_id = $1
      GROUP BY COALESCE(semester, current_semester, 7)
      ORDER BY sem
      `,
      [DEMO_TENANT_ID]
    );

    const semCounts: Record<number, number> = {};
    for (const r of semRes.rows) {
      semCounts[Number(r.sem)] = Number(r.count);
    }

    assert.ok(semCounts[3] >= 130, `Semester 3 must have at least 130 students (found ${semCounts[3]})`);
    assert.ok(semCounts[5] >= 131, `Semester 5 must have at least 131 students (found ${semCounts[5]})`);
    assert.ok(semCounts[7] >= 119, `Semester 7 must have at least 119 students (found ${semCounts[7]})`);

    // 3. Verify Course Offerings exist (including 26ECAC401)
    const courseRes = await client.query(
      `
      SELECT co.id, mc.course_code, mc.course_title
      FROM course_offerings co
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE co.tenant_id = $1 AND mc.course_code = '26ECAC401'
      `,
      [DEMO_TENANT_ID]
    );
    assert.ok(courseRes.rows.length >= 1, "Course offering for 26ECAC401 (Agentic AI) must exist");

    const aiOfferingId = courseRes.rows[0].id;

    // 4. Verify enrollments exist connecting students to 26ECAC401
    const enrollRes = await client.query(
      `
      SELECT COUNT(*) as count
      FROM enrollments
      WHERE course_offering_id = $1 AND tenant_id = $2
      `,
      [aiOfferingId, DEMO_TENANT_ID]
    );
    const enrolledInAI = Number(enrollRes.rows[0]?.count || 0);
    assert.ok(enrolledInAI >= 119, `At least 119 students must be enrolled in 26ECAC401 (found ${enrolledInAI})`);

    // 5. Verify OPA eligibility snapshots are evaluated and explainable
    const eligRes = await client.query(
      `
      SELECT decision, COUNT(*) as count
      FROM eligibility_snapshots
      WHERE tenant_id = $1
      GROUP BY decision
      `,
      [DEMO_TENANT_ID]
    );

    const eligCounts: Record<string, number> = {};
    for (const r of eligRes.rows) {
      eligCounts[r.decision] = Number(r.count);
    }

    assert.ok(eligCounts["ELIGIBLE"] >= 300, `Must have >= 300 ELIGIBLE students (found ${eligCounts["ELIGIBLE"]})`);
    assert.ok(eligCounts["INELIGIBLE"] >= 20, `Must have >= 20 flagged INELIGIBLE students with explainable reasons`);
  } finally {
    await client.end();
  }
});

test("Roster Regression 5: Academic Lifecycle SQL query returns real students with course codes and eligibility states", async () => {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  try {
    const res = await client.query(
      `
      SELECT 
        s.id,
        s.institutional_student_id as usn,
        TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))) as name,
        s.email,
        COALESCE(s.semester, s.current_semester, 7) as semester,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT mc.course_code), NULL) as course_codes,
        COALESCE(es.decision, 'ELIGIBLE') as eligibility_state,
        COALESCE(es.allow, TRUE) as is_eligible,
        es.reasons,
        es.evidence_snapshot
      FROM students s
      LEFT JOIN users u ON u.email = s.email
      LEFT JOIN enrollments en ON en.student_id = s.id AND en.tenant_id = s.tenant_id
      LEFT JOIN course_offerings co ON co.id = en.course_offering_id
      LEFT JOIN master_courses mc ON mc.id = co.master_course_id
      LEFT JOIN LATERAL (
        SELECT decision, allow, reasons, evidence_snapshot
        FROM eligibility_snapshots
        WHERE tenant_id = s.tenant_id AND (student_id = u.id OR student_id = s.id)
        ORDER BY evaluated_at DESC
        LIMIT 1
      ) es ON true
      WHERE s.tenant_id = $1
      GROUP BY s.id, s.institutional_student_id, s.first_name, s.last_name, s.email, s.semester, s.current_semester, es.decision, es.allow, es.reasons, es.evidence_snapshot
      ORDER BY semester ASC, s.institutional_student_id ASC
      LIMIT 10
      `,
      [DEMO_TENANT_ID]
    );

    assert.equal(res.rows.length, 10, "Should return 10 real students for test query");
    for (const row of res.rows) {
      assert.ok(row.usn, "Student USN must not be null");
      assert.ok(row.name, "Student name must not be null");
      assert.ok(row.course_codes.length > 0, `Student ${row.usn} must have enrolled course codes`);
      assert.ok(["ELIGIBLE", "INELIGIBLE"].includes(row.eligibility_state), "Eligibility state must be ELIGIBLE or INELIGIBLE");
    }
  } finally {
    await client.end();
  }
});
