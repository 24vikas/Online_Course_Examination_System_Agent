import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (authUser.role !== "LECTURER") return NextResponse.json({error: "Forbidden"}, {status: 403});
    const {tenantId, userId: lecturerId} = authUser;

    const body = await req.json().catch(() => ({}));
    const {
      attemptId,
      facultyFeedback = "Graded in accordance with unit learning outcomes and validated rubric.",
    } = body;

    if (!attemptId) {
      return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
    }

    let numericSubScore = 0;
    if (Array.isArray(body.marks) && body.marks.length > 0) {
      numericSubScore = body.marks.reduce(
        (sum: number, m: any) => sum + Number(m.awardedMarks !== undefined ? m.awardedMarks : m.marks || 0),
        0
      );
    } else if (body.subjectiveScore !== undefined) {
      numericSubScore = Math.max(0, Number(body.subjectiveScore));
    } else {
      return NextResponse.json(
        { error: "Either subjectiveScore or marks array is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(numericSubScore) || numericSubScore < 0) {
      return NextResponse.json({error: "Invalid marks"}, {status: 400});
    }
    const result = await queryDb(`
      WITH marked AS (
        UPDATE exam_attempts ea SET subjective_score = $4, total_score = ea.objective_score + $4,
          status = 'FACULTY_REVIEW', updated_at = now()
        FROM course_offerings co, exam_schedules es
        WHERE ea.id = $3 AND ea.course_offering_id = co.id AND ea.exam_schedule_id = es.id
          AND ea.objective_score + $4 <= ea.max_marks AND ea.tenant_id = $1 AND co.tenant_id = ea.tenant_id AND es.tenant_id = ea.tenant_id
        AND es.course_offering_id = co.id AND ea.results_published_at IS NULL AND ea.moderated_at IS NULL
        AND ea.status::text IN ('SUBMITTED','OBJECTIVE_SCORED','FACULTY_REVIEW','AWAITING_SUBJECTIVE_MARKING')
        AND (co.primary_lecturer_id = $2 OR EXISTS (
          SELECT 1 FROM faculty_course_assignments f WHERE f.tenant_id = ea.tenant_id
          AND f.course_offering_id = co.id AND f.faculty_id = $2 AND f.is_active
          AND f.role_in_course IN ('PRIMARY_LECTURER','CO_LECTURER','EVALUATOR')))
        RETURNING ea.id, ea.objective_score, ea.total_score
      ), audited AS (
        INSERT INTO audit_events (id, tenant_id, user_id, action, resource_type, resource_id, metadata_json)
        SELECT $5, $1, $2, 'FACULTY_MARKS_COMMITTED', 'EXAM_ATTEMPT', id::text, $6::jsonb FROM marked
      ) SELECT objective_score, total_score FROM marked
    `, [tenantId, lecturerId, attemptId, numericSubScore, crypto.randomUUID(), JSON.stringify({facultyFeedback, subjectiveScore: numericSubScore})]);
    if (!result.rowCount) return NextResponse.json({error: "Submission unavailable"}, {status: 404});
    const objScore = Number(result.rows[0].objective_score);
    const totalScore = Number(result.rows[0].total_score);

    logEvent("info", "Faculty committed subjective evaluation marks", {
      attemptId,
      lecturerId,
      subjectiveScore: numericSubScore,
      totalScore,
    });

    return NextResponse.json({
      success: true,
      message: "Subjective marks and faculty feedback signed off successfully.",
      attemptId,
      objectiveScore: objScore,
      subjectiveScore: numericSubScore,
      totalScore,
      status: "FACULTY_REVIEW",
      evaluatedBy: lecturerId,
    });
  } catch (error: any) {
    logEvent("error", "Error marking submission", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
