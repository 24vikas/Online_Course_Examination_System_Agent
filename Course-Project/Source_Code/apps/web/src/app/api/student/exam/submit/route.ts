import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import { assertProctoredAttemptActive, AuraProctorAuthorizationError } from "@/lib/proctoring/proctorAuthorization";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/student/exam/submit
 * Candidate final examination submission & deterministic objective auto-grading.
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;

    const body = await req.json().catch(() => ({}));
    const { attemptId, responses = [] } = body;

    if (!attemptId) {
      return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
    }

    // Authoritative proctor verification gate
    try {
      await assertProctoredAttemptActive(authUser, attemptId, "SUBMIT");
    } catch (authErr: any) {
      if (authErr instanceof AuraProctorAuthorizationError) {
        return NextResponse.json(
          {
            error: authErr.code,
            message: authErr.reason,
            attemptId: authErr.attemptId,
            disqualified: true,
          },
          { status: authErr.statusCode }
        );
      }
      throw authErr;
    }

    const attRes = await queryDb(
      `SELECT ea.id, ea.status, ea.student_id, ea.tenant_id, ea.server_deadline, es.title AS exam_title
         FROM exam_attempts ea
         JOIN exam_schedules es ON es.id = ea.exam_schedule_id AND es.tenant_id = ea.tenant_id
        WHERE ea.id = $1 AND ea.tenant_id = $2 AND ea.student_id = $3`,
      [attemptId, tenantId, studentId]
    );
    if (!attRes.rowCount) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    if (attRes.rows[0].status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "Attempt closed" }, { status: 409 });
    }
    const actualAttemptId = attemptId;
    const actualTenantId = tenantId;

    // 2. Save any newly passed responses
    if (Array.isArray(responses) && responses.length > 0) {
      for (const r of responses) {
        if (!r.questionId) continue;
        await queryDb(`
          INSERT INTO attempt_responses (
            tenant_id, attempt_id, question_id, answer_json, sequence_number, saved_at
          ) VALUES (
            $1, $2, $3, $4, $5, NOW()
          )
          ON CONFLICT (attempt_id, question_id) DO UPDATE SET
            answer_json = EXCLUDED.answer_json,
            saved_at = NOW()
        `, [
          tenantId,
          actualAttemptId,
          r.questionId,
          JSON.stringify(r.answerJson || { selectedOption: r.selectedOption || r.answer || "" }),
          r.sequenceNumber || 1,
        ]);
      }
    }

    // 3. Deterministic Objective Auto-Grading (AUDIT-04 compliance)
    // Fetch all responses and evaluate matching answer keys (prioritizing immutable published snapshot)
    const keySnapshotRes = await queryDb(`
      SELECT ea.exam_schedule_id, k.answer_keys
      FROM exam_attempts ea
      LEFT JOIN exam_paper_answer_keys k ON k.schedule_id = ea.exam_schedule_id
      WHERE ea.id = $1
      LIMIT 1
    `, [actualAttemptId]);

    let publishedAnswerKeys: Record<string, any> = {};
    if (keySnapshotRes.rowCount && keySnapshotRes.rows[0].answer_keys) {
      const rawKeys = keySnapshotRes.rows[0].answer_keys;
      publishedAnswerKeys = typeof rawKeys === "string" ? JSON.parse(rawKeys) : rawKeys;
    }

    const responsesRes = await queryDb(`
      SELECT ar.question_id, ar.answer_json, COALESCE(qak.correct_answer, qb.correct_answer) as correct_answer, qb.marks, qb.question_type
      FROM attempt_responses ar
      JOIN question_bank qb ON qb.id = ar.question_id
      LEFT JOIN question_answer_keys qak ON qak.question_id = ar.question_id
      WHERE ar.attempt_id = $1
    `, [actualAttemptId]);

    let calculatedObjectiveScore = 0;
    let gradedObjectiveQuestions = 0;

    for (const row of responsesRes.rows) {
      const frozenKeyObj = publishedAnswerKeys[row.question_id];
      const correctChoiceRaw = (frozenKeyObj && typeof frozenKeyObj === "object" ? frozenKeyObj.correctAnswer : frozenKeyObj) || row.correct_answer;

      if (correctChoiceRaw) {
        gradedObjectiveQuestions++;
        const answer = typeof row.answer_json === "string" ? JSON.parse(row.answer_json) : row.answer_json;
        const studentChoice = (answer.selectedOption || answer.answer || "").toString().trim().toUpperCase();
        const correctChoice = correctChoiceRaw.toString().trim().toUpperCase();

        if (studentChoice === correctChoice) {
          calculatedObjectiveScore += Number(row.marks) || 0;
        }
      }
    }

    // Default objective score fallback removed for genuine deterministic auto-grading

    // Check if subjective questions exist
    const hasSubjective = responsesRes.rows.some((row) => {
      const qt = (row.question_type || "").toUpperCase();
      return qt === "SUBJECTIVE" || qt === "DESCRIPTIVE" || qt === "ESSAY" || qt === "SHORT_ANSWER";
    });

    const postState = hasSubjective ? "AWAITING_SUBJECTIVE_MARKING" : "AWAITING_MODERATION";

    // 4. Generate Non-Repudiation Receipt Hash
    const submissionTimestamp = new Date().toISOString();
    const receiptPayload = `${actualTenantId}:${actualAttemptId}:${studentId}:${submissionTimestamp}:${calculatedObjectiveScore}`;
    const submissionReceiptHash = crypto.createHash("sha256").update(receiptPayload).digest("hex");

    // 5. Update exam_attempts
    await queryDb(`
      UPDATE exam_attempts
      SET status = 'OBJECTIVE_SCORED',
          submitted_at = NOW(),
          objective_score = $1,
          total_score = COALESCE(subjective_score, 0) + $1,
          updated_at = NOW()
      WHERE id = $2
    `, [calculatedObjectiveScore, actualAttemptId]);

    // 6. Update proctoring session
    await queryDb(`
      UPDATE exam_proctoring_sessions
      SET status = 'SUBMITTED',
          updated_at = NOW()
      WHERE attempt_id = $1
    `, [actualAttemptId]);

    // 7. Audit Event
    await queryDb(`
      INSERT INTO audit_events (
        id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at
      ) VALUES (
        $1, $2, $3, 'EXAM_SUBMISSION_FINALIZED', 'EXAM_ATTEMPT', $4, $5, NOW()
      )
    `, [
      crypto.randomUUID(),
      actualTenantId,
      studentId,
      actualAttemptId,
      JSON.stringify({
        receiptHash: submissionReceiptHash,
        objectiveScore: calculatedObjectiveScore,
        gradedQuestionsCount: gradedObjectiveQuestions,
        submittedAt: submissionTimestamp,
        postSubmissionState: postState,
      }),
    ]);

    logEvent("info", "Candidate exam submission finalized", {
      attemptId: actualAttemptId,
      studentId,
      submissionReceiptHash,
      objectiveScore: calculatedObjectiveScore,
      postState,
    });

    return NextResponse.json({
      success: true,
      message: "Examination submitted successfully and objective questions auto-scored.",
      attemptId: actualAttemptId,
      submissionReceiptHash,
      submittedAt: submissionTimestamp,
      status: "OBJECTIVE_SCORED",
      canonicalState: postState,
      objectiveScore: calculatedObjectiveScore,
    });
  } catch (error: any) {
    logEvent("error", "Error submitting exam", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/student/exam/submit?attemptId=...
 * Polling endpoint for student post-submission attempt status lifecycle:
 * SUBMITTED -> OBJECTIVE_SCORING -> AWAITING_SUBJECTIVE_MARKING -> AWAITING_MODERATION -> RESULT_PUBLISHED
 */
export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;

    const { searchParams } = new URL(req.url);
    const attemptIdParam = searchParams.get("attemptId");

    let attemptRow: any = null;

    if (attemptIdParam) {
      const attRes = await queryDb(`
        SELECT 
          ea.id, ea.tenant_id, ea.exam_schedule_id, ea.course_offering_id, ea.student_id,
          ea.status, ea.server_start_time, ea.server_deadline, ea.submitted_at,
          ea.objective_score, ea.subjective_score, ea.total_score, ea.moderated_score,
          ea.max_marks, ea.results_published_at,
          es.title as exam_title, es.duration_minutes,
          mc.course_code, mc.course_title,
          u.email as student_email,
          s.institutional_student_id as usn,
          COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
        FROM exam_attempts ea
        JOIN exam_schedules es ON es.id = ea.exam_schedule_id
        JOIN course_offerings co ON co.id = ea.course_offering_id
        JOIN master_courses mc ON mc.id = co.master_course_id
        LEFT JOIN users u ON u.id = ea.student_id
        LEFT JOIN students s ON s.tenant_id = ea.tenant_id AND lower(s.email) = lower(u.email)
        WHERE ea.tenant_id = $1 AND ea.id = $2 AND ea.student_id = $3
        LIMIT 1
      `, [tenantId, attemptIdParam, studentId]);
      if (attRes.rows.length > 0) attemptRow = attRes.rows[0];
    }

    if (!attemptRow) {
      const latestRes = await queryDb(`
        SELECT 
          ea.id, ea.tenant_id, ea.exam_schedule_id, ea.course_offering_id, ea.student_id,
          ea.status, ea.server_start_time, ea.server_deadline, ea.submitted_at,
          ea.objective_score, ea.subjective_score, ea.total_score, ea.moderated_score,
          ea.max_marks, ea.results_published_at,
          es.title as exam_title, es.duration_minutes,
          mc.course_code, mc.course_title,
          u.email as student_email,
          s.institutional_student_id as usn,
          COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
        FROM exam_attempts ea
        JOIN exam_schedules es ON es.id = ea.exam_schedule_id
        JOIN course_offerings co ON co.id = ea.course_offering_id
        JOIN master_courses mc ON mc.id = co.master_course_id
        LEFT JOIN users u ON u.id = ea.student_id
        LEFT JOIN students s ON s.tenant_id = ea.tenant_id AND lower(s.email) = lower(u.email)
        WHERE ea.tenant_id = $1 AND (ea.student_id = $2 OR s.id = $2)
        ORDER BY ea.created_at DESC
        LIMIT 1
      `, [tenantId, studentId]);
      if (latestRes.rows.length > 0) attemptRow = latestRes.rows[0];
    }

    if (!attemptRow) {
      return NextResponse.json({
        success: false,
        error: "No attempt found for candidate",
      }, { status: 404 });
    }

    // Determine canonical post-submission state:
    // SUBMITTED -> OBJECTIVE_SCORING -> AWAITING_SUBJECTIVE_MARKING -> AWAITING_MODERATION -> RESULT_PUBLISHED
    let canonicalState = "SUBMITTED";
    const dbStatus = String(attemptRow.status || "").toUpperCase();

    if (dbStatus === "RELEASED" || dbStatus === "RESULT_PUBLISHED" || attemptRow.results_published_at) {
      canonicalState = "RESULT_PUBLISHED";
    } else if (dbStatus === "AWAITING_MODERATION" || dbStatus === "FACULTY_REVIEW" || attemptRow.moderated_score != null) {
      canonicalState = "AWAITING_MODERATION";
    } else if (dbStatus === "AWAITING_SUBJECTIVE_MARKING" || dbStatus === "OBJECTIVE_SCORED") {
      canonicalState = "AWAITING_SUBJECTIVE_MARKING";
    } else if (dbStatus === "OBJECTIVE_SCORING") {
      canonicalState = "OBJECTIVE_SCORING";
    } else if (dbStatus === "SUBMITTED" || attemptRow.submitted_at) {
      if (attemptRow.objective_score === null || attemptRow.objective_score === undefined) {
        canonicalState = "SUBMITTED";
      } else {
        canonicalState = "AWAITING_SUBJECTIVE_MARKING";
      }
    } else {
      canonicalState = dbStatus;
    }

    // Retrieve receipt hash from audit_events if available
    const auditRes = await queryDb(`
      SELECT metadata_json
      FROM audit_events
      WHERE tenant_id = $1 AND resource_id = $2 AND action = 'EXAM_SUBMISSION_FINALIZED'
      ORDER BY created_at DESC
      LIMIT 1
    `, [tenantId, attemptRow.id]);

    let receiptHash = "";
    if (auditRes.rows.length > 0 && auditRes.rows[0].metadata_json) {
      try {
        const meta = typeof auditRes.rows[0].metadata_json === "string"
          ? JSON.parse(auditRes.rows[0].metadata_json)
          : auditRes.rows[0].metadata_json;
        receiptHash = meta.receiptHash || "";
      } catch (e) {}
    }

    if (!receiptHash && attemptRow.submitted_at) {
      const payload = `${tenantId}:${attemptRow.id}:${attemptRow.student_id}:${attemptRow.submitted_at}:${attemptRow.objective_score || 0}`;
      receiptHash = crypto.createHash("sha256").update(payload).digest("hex");
    }

    // 5-step post-submission lifecycle definition
    const steps = [
      {
        id: "SUBMITTED",
        label: "Submitted & Sealed",
        isCompleted: true,
        isCurrent: canonicalState === "SUBMITTED",
        description: "Candidate answers sealed and cryptographic receipt generated.",
        timestamp: attemptRow.submitted_at ? new Date(attemptRow.submitted_at).toISOString() : null,
      },
      {
        id: "OBJECTIVE_SCORING",
        label: "Objective Auto-Scoring",
        isCompleted: canonicalState !== "SUBMITTED",
        isCurrent: canonicalState === "OBJECTIVE_SCORING",
        description: "Deterministic scoring engine verifies responses against quarantined answer keys.",
        score: Number(attemptRow.objective_score) || 0,
      },
      {
        id: "AWAITING_SUBJECTIVE_MARKING",
        label: "Faculty Subjective Review",
        isCompleted: canonicalState === "AWAITING_MODERATION" || canonicalState === "RESULT_PUBLISHED",
        isCurrent: canonicalState === "AWAITING_SUBJECTIVE_MARKING",
        description: "Subject-matter faculty evaluates descriptive rubrics and criteria.",
        isHumanGate: true,
      },
      {
        id: "AWAITING_MODERATION",
        label: "COE Moderation Gate",
        isCompleted: canonicalState === "RESULT_PUBLISHED",
        isCurrent: canonicalState === "AWAITING_MODERATION",
        description: "Controller of Examinations board reviews cohort distribution and statistical moderation.",
        isHumanGate: true,
      },
      {
        id: "RESULT_PUBLISHED",
        label: "Official Results Published",
        isCompleted: canonicalState === "RESULT_PUBLISHED",
        isCurrent: canonicalState === "RESULT_PUBLISHED",
        description: "Official transcript ratified, GPA recorded, and 72-hour grievance window activated.",
        timestamp: attemptRow.results_published_at ? new Date(attemptRow.results_published_at).toISOString() : null,
      },
    ];

    const finalMarks = attemptRow.moderated_score !== null && attemptRow.moderated_score !== undefined
      ? Number(attemptRow.moderated_score)
      : (attemptRow.total_score !== null ? Number(attemptRow.total_score) : 0);

    const maxMarks = Number(attemptRow.max_marks) || 50;

    return NextResponse.json({
      success: true,
      attemptId: attemptRow.id,
      canonicalState,
      status: canonicalState,
      rawStatus: attemptRow.status,
      examScheduleId: attemptRow.exam_schedule_id,
      examTitle: attemptRow.exam_title,
      courseCode: attemptRow.course_code,
      courseTitle: attemptRow.course_title,
      studentId: attemptRow.student_id,
      studentName: attemptRow.student_name,
      usn: attemptRow.usn || "DEMO001",
      submittedAt: attemptRow.submitted_at,
      resultsPublishedAt: attemptRow.results_published_at,
      isPublished: canonicalState === "RESULT_PUBLISHED",
      scoring: {
        objectiveScore: Number(attemptRow.objective_score) || 0,
        subjectiveScore: attemptRow.subjective_score !== null ? Number(attemptRow.subjective_score) : null,
        moderatedScore: attemptRow.moderated_score !== null ? Number(attemptRow.moderated_score) : null,
        totalScore: Number(attemptRow.total_score) || 0,
        finalScore: finalMarks,
        maxMarks: maxMarks,
      },
      receiptHash,
      steps,
      polledAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logEvent("error", "Error fetching student submission state", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
